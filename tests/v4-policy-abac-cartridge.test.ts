import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH,
  parsePolicyDocument,
  POLICY_ABAC_CANONICAL_RULES,
  PolicyAbacCartridge,
  type PolicyAbacTask,
} from '../src/v4/cartridges/policy-abac-cartridge.js';
import { PostgresV3Cartridge } from '../src/v4/cartridges/postgres-v3-adapter.js';
import { DomainCartridgeRegistry } from '../src/v4/domain-cartridge.js';
import {
  AxiomHopeEngine,
  evaluateCrossRuleContradictions,
  evaluateLexicalIdentifierLock,
  type HopeMemorySnapshot,
  type PairedCanaryEvaluator,
} from '../src/v4/hope/index.js';
import { extractRequiredTokens } from '../src/v4/lexical-token-extractor.js';
import { retrieveWithPrerequisites } from '../src/v4/prerequisite-retriever.js';

/**
 * Deterministic Cedar-style policy synthesizer for a `PolicyAbacTask` given the set of
 * active/retrieved canonical rule IDs. Enables $0-cost offline verification of every task
 * and paired before/after canary replay without any LLM calls.
 */
function synthesizeCedarPolicyForTask(
  task: PolicyAbacTask,
  activeRuleIds: ReadonlySet<string>,
  options: { erodeMfaIdentifier?: boolean; omitForbidUsePermitOnly?: boolean } = {}
): string {
  const statements: string[] = [];

  // P-02: Explicit forbid for suspended principals
  if (activeRuleIds.has('P-02') && !options.omitForbidUsePermitOnly) {
    statements.push(
      [
        '@id("forbid-suspended")',
        'forbid (',
        '  principal,',
        '  action,',
        '  resource',
        ') when {',
        '  principal.is_suspended == true',
        '};',
      ].join('\n')
    );
  }

  // P-03: Explicit forbid for locked resources
  if (activeRuleIds.has('P-03')) {
    statements.push(
      [
        '@id("forbid-locked-resource")',
        'forbid (',
        '  principal,',
        '  action,',
        '  resource',
        ') when {',
        '  resource.is_locked == true',
        '};',
      ].join('\n')
    );
  }

  // P-12: Explicit forbid for service accounts on KMS rotation
  if (activeRuleIds.has('P-12')) {
    statements.push(
      [
        '@id("forbid-service-account-kms")',
        'forbid (',
        '  principal,',
        '  action == Action::"rotate_kms_key",',
        '  resource == Resource::"KmsKey"',
        ') when {',
        '  principal.is_service_account == true',
        '};',
      ].join('\n')
    );
  }

  // Determine target action/resource scope from task's positive ALLOW vector
  const allowVec = task.testVectors.find((v) => v.expectedDecision === 'ALLOW')!;
  const whenClauses: string[] = [];

  if (activeRuleIds.has('P-01')) {
    whenClauses.push('principal.tenant_id == resource.tenant_id');
  }
  if (options.omitForbidUsePermitOnly && activeRuleIds.has('P-02')) {
    // Deliberately omits explicit `forbid` and puts check inside `permit` (must fail P-02!)
    whenClauses.push('principal.is_suspended == false');
  }
  if (activeRuleIds.has('P-04')) {
    whenClauses.push(
      options.erodeMfaIdentifier
        ? 'context.two_factor == true'
        : 'context.mfa_verified == true'
    );
  }
  if (activeRuleIds.has('P-05')) {
    whenClauses.push('principal.id != resource.created_by');
  }
  if (activeRuleIds.has('P-06')) {
    whenClauses.push('principal.role == "finance_approver"');
    whenClauses.push('resource.amount_cents <= 10000000');
  }
  if (activeRuleIds.has('P-07')) {
    whenClauses.push('context.session_age_seconds <= 900');
  }
  if (activeRuleIds.has('P-08')) {
    whenClauses.push('context.ip_trusted == true');
    whenClauses.push('context.risk_score <= 30');
  }
  if (activeRuleIds.has('P-09')) {
    whenClauses.push('principal.role == "clinician"');
    whenClauses.push('resource.consent_granted == true');
  }
  if (activeRuleIds.has('P-10')) {
    whenClauses.push('context.break_glass_ticket != ""');
    if (!activeRuleIds.has('P-04')) {
      whenClauses.push(
        options.erodeMfaIdentifier
          ? 'context.two_factor == true'
          : 'context.mfa_verified == true'
      );
    }
  }
  if (activeRuleIds.has('P-11')) {
    whenClauses.push('principal.role == "security_auditor"');
    whenClauses.push('principal.clearance_level >= resource.min_clearance');
  }
  if (activeRuleIds.has('P-12')) {
    whenClauses.push('principal.role == "tenant_admin"');
  }

  const whenBlock =
    whenClauses.length > 0
      ? ` when {\n  ${whenClauses.join(' &&\n  ')}\n}`
      : '';

  statements.push(
    [
      `@id("permit-${task.id.toLowerCase()}")`,
      'permit (',
      '  principal,',
      `  action == ${allowVec.action},`,
      `  resource == ${allowVec.resource.type}`,
      `)${whenBlock};`,
    ].join('\n')
  );

  return statements.join('\n\n');
}

describe('v4 Policy-as-Code ABAC DomainCartridge & Cross-Domain HOPE Integration', () => {
  it('registers cleanly alongside PostgresV3Cartridge in DomainCartridgeRegistry and loads 18 multi-domain tasks + 12 canonical rules', () => {
    const registry = new DomainCartridgeRegistry();
    const pgCartridge = new PostgresV3Cartridge();
    const abacCartridge = new PolicyAbacCartridge();

    registry.register(pgCartridge);
    registry.register(abacCartridge);

    expect(registry.has('postgres-v3')).toBe(true);
    expect(registry.has('policy-abac-v4')).toBe(true);
    expect(registry.list().map((c) => c.id).sort()).toEqual([
      'policy-abac-v4',
      'postgres-v3',
    ]);

    const tasks = abacCartridge.loadTasks();
    expect(tasks.length).toBe(18);
    expect(tasks.filter((t) => t.domain === 'banking').length).toBe(6);
    expect(tasks.filter((t) => t.domain === 'healthcare').length).toBe(6);
    expect(tasks.filter((t) => t.domain === 'admin').length).toBe(6);

    const ruleSet = abacCartridge.loadCanonicalRules();
    expect(ruleSet.rules.length).toBe(12);
    expect(ruleSet.rules.every((r) => r.active)).toBe(true);
    expect(ruleSet.prerequisiteGraph['P-06']).toContain('P-01');
    expect(ruleSet.prerequisiteGraph['P-06']).toContain('P-02');
  });

  it('extractRequiredTokens() automatically extracts concrete Cedar/ABAC identifiers with zero SQL hardcoding and passes Slow Clock Gates 1 & 2 with zero false positives', () => {
    const abacCartridge = new PolicyAbacCartridge();
    const { rules } = abacCartridge.loadCanonicalRules();
    const byId = new Map(rules.map((r) => [r.id, r]));

    const expectedByRule: Record<string, string[]> = {
      'P-01': ['permit', 'principal.tenant_id', 'resource.tenant_id', 'tenant_id'],
      'P-02': ['forbid', 'principal.is_suspended', 'is_suspended'],
      'P-03': ['forbid', 'unless', 'resource.is_locked', 'is_locked'],
      'P-04': [
        'Action::"approve_payout"',
        'approve_payout',
        'Action::"export_audit_log"',
        'export_audit_log',
        'Action::"rotate_kms_key"',
        'rotate_kms_key',
        'context.mfa_verified',
        'mfa_verified',
      ],
      'P-05': [
        'Resource::"LedgerEntry"',
        'LedgerEntry',
        'Resource::"ChangeRequest"',
        'principal.id',
        'resource.created_by',
        'created_by',
      ],
      'P-06': [
        'Action::"approve_payout"',
        'Resource::"LedgerEntry"',
        'principal.role',
        'finance_approver',
        'resource.amount_cents',
        '<= 10000000',
      ],
      'P-07': ['context.session_age_seconds', 'session_age_seconds', '<= 900'],
      'P-08': ['context.ip_trusted', 'ip_trusted', 'context.risk_score', 'risk_score', '<= 30'],
      'P-09': [
        'Action::"read_patient_record"',
        'Resource::"PatientRecord"',
        'clinician',
        'resource.consent_granted',
        'consent_granted',
      ],
      'P-10': [
        'Action::"break_glass_read"',
        'Resource::"PatientRecord"',
        'context.break_glass_ticket',
        'break_glass_ticket',
        'context.mfa_verified',
      ],
      'P-11': [
        'Action::"export_audit_log"',
        'Resource::"AuditLog"',
        'security_auditor',
        'principal.clearance_level',
        'resource.min_clearance',
      ],
      'P-12': [
        'Action::"rotate_kms_key"',
        'Resource::"KmsKey"',
        'tenant_admin',
        'forbid',
        'principal.is_service_account',
      ],
    };

    for (const [ruleId, expectedTokens] of Object.entries(expectedByRule)) {
      const rule = byId.get(ruleId)!;
      const extracted = extractRequiredTokens(rule.statement);
      const extractedLower = new Set(extracted.map((t) => t.toLowerCase()));
      for (const tok of expectedTokens) {
        expect(
          extractedLower.has(tok.toLowerCase()),
          `Expected extractRequiredTokens(${ruleId}) to extract "${tok}"; got [${extracted.join(', ')}]`
        ).toBe(true);
      }

      // Verify zero false positives on Slow Clock Gate 1 & Gate 2
      const identityCandidate = {
        candidateId: `ID-${ruleId}`,
        factId: ruleId,
        triggerFlag: 'none',
        proposedRuleText: rule.statement,
        proposedPrerequisiteEdges: [],
        evidenceHashes: [],
        observedCount: 3,
        status: 'staged' as const,
        gateAudit: null,
        createdAt: '2026-11-21T00:00:00.000Z',
        updatedAt: '2026-11-21T00:00:00.000Z',
      };
      const gate1 = evaluateLexicalIdentifierLock(identityCandidate, POLICY_ABAC_CANONICAL_RULES);
      expect(gate1.passed).toBe(true);
      expect(gate1.retentionRate).toBe(1);

      const gate2 = evaluateCrossRuleContradictions(
        identityCandidate,
        POLICY_ABAC_CANONICAL_RULES,
        DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH
      );
      expect(gate2.passed).toBe(true);
    }

    // Verify Lexical Lock rejects paraphrasing `context.mfa_verified` -> `context.two_factor` on P-04
    const erodedP04 = {
      candidateId: 'Q-ERODED-P04',
      factId: 'P-04',
      triggerFlag: 'paraphrasedMfaClaim',
      proposedRuleText: byId
        .get('P-04')!
        .statement.replace('context.mfa_verified', 'context.two_factor'),
      proposedPrerequisiteEdges: [],
      evidenceHashes: [],
      observedCount: 3,
      status: 'staged' as const,
      gateAudit: null,
      createdAt: '2026-11-21T00:00:00.000Z',
      updatedAt: '2026-11-21T00:00:00.000Z',
    };
    const lockFail = evaluateLexicalIdentifierLock(erodedP04, POLICY_ABAC_CANONICAL_RULES);
    expect(lockFail.passed).toBe(false);
    expect(lockFail.missingTokens).toContain('context.mfa_verified');
  });

  it('deterministically grades valid policies (18/18 tasks 100% pass), broken syntax (committed=false), and identifier-eroded policies (FAIL)', () => {
    const cartridge = new PolicyAbacCartridge();
    const tasks = cartridge.loadTasks();

    // 1. All 18 held-out tasks pass 100% with valid Cedar policies
    for (const task of tasks) {
      const validPolicy = synthesizeCedarPolicyForTask(task, new Set(task.boundFacts));
      expect(parsePolicyDocument(validPolicy).ok).toBe(true);

      const result = cartridge.evaluate(task, validPolicy);
      expect(result.committed, `Task ${task.id} failed to commit: ${result.stderr}`).toBe(true);
      expect(result.failedFacts, `Task ${task.id} failed facts: ${result.stderr}`).toEqual([]);
      expect(result.passedFacts).toEqual(task.boundFacts);

      const forensics = cartridge.classifyForensics(task, validPolicy);
      expect(forensics.syntaxError).toBe(false);
      expect(forensics.missingTenantIsolation).toBe(false);
      expect(forensics.missingForbidSuspended).toBe(false);
      expect(forensics.paraphrasedMfaClaim).toBe(false);
    }

    const payoutTask = tasks.find((t) => t.id === 'ABAC-001')!;

    // 2. Broken syntax -> committed: false, fails all bound facts with concrete SyntaxError stderr
    const brokenSyntaxPolicy = `
      allow (principal, action == Action::"approve_payout", resource == Resource::"LedgerEntry") when {
        principal.tenant_id == resource.tenant_id
      }
    `;
    const syntaxResult = cartridge.evaluate(payoutTask, brokenSyntaxPolicy);
    expect(syntaxResult.committed).toBe(false);
    expect(syntaxResult.passedFacts).toEqual([]);
    expect(syntaxResult.failedFacts).toEqual(payoutTask.boundFacts);
    expect(syntaxResult.stderr).toMatch(/SyntaxError/i);
    expect(cartridge.classifyForensics(payoutTask, brokenSyntaxPolicy).syntaxError).toBe(true);

    // 3. Identifier-eroded policy (`context.two_factor` instead of `context.mfa_verified`) -> deterministic FAIL
    const erodedMfaPolicy = synthesizeCedarPolicyForTask(
      payoutTask,
      new Set(payoutTask.boundFacts),
      { erodeMfaIdentifier: true }
    );
    const erodedResult = cartridge.evaluate(payoutTask, erodedMfaPolicy);
    expect(erodedResult.committed).toBe(true);
    expect(erodedResult.failedFacts.length).toBeGreaterThan(0);
    expect(erodedResult.stderr).toContain('Unknown attribute "context.two_factor"');

    const erodedForensics = cartridge.classifyForensics(payoutTask, erodedMfaPolicy);
    expect(erodedForensics.paraphrasedMfaClaim).toBe(true);
    expect(erodedForensics.missingMfaRequirement).toBe(true);

    // 4. Omitting explicit `forbid` for suspended accounts (relying only on permit condition) -> fails P-02
    const noForbidPolicy = synthesizeCedarPolicyForTask(
      payoutTask,
      new Set(payoutTask.boundFacts),
      { omitForbidUsePermitOnly: true }
    );
    const noForbidResult = cartridge.evaluate(payoutTask, noForbidPolicy);
    expect(noForbidResult.committed).toBe(true);
    expect(noForbidResult.failedFacts).toContain('P-02');
    expect(cartridge.classifyForensics(payoutTask, noForbidPolicy).missingForbidSuspended).toBe(
      true
    );

    // 5. Omitting separation of duties -> fails P-05 and sets missingSeparationOfDuties
    const noSodFacts = new Set(payoutTask.boundFacts.filter((f) => f !== 'P-05'));
    const noSodPolicy = synthesizeCedarPolicyForTask(payoutTask, noSodFacts);
    const noSodResult = cartridge.evaluate(payoutTask, noSodPolicy);
    expect(noSodResult.committed).toBe(true);
    expect(noSodResult.failedFacts).toEqual(['P-05']);
    expect(cartridge.classifyForensics(payoutTask, noSodPolicy).missingSeparationOfDuties).toBe(
      true
    );
  });

  it('executes full end-to-end 3-Clock Axiom-HOPE loop on PolicyAbacCartridge with ZERO edits to src/v4/hope/*', async () => {
    // Start with empty prerequisite graph so P-01 is displaced outside a tight Top-K=4 budget on banking payouts
    const cartridge = new PolicyAbacCartridge({ prerequisiteGraph: {} });
    const allTasks = cartridge.loadTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-v4-policy-hope-'));
    try {
      const engine = new AxiomHopeEngine<PolicyAbacTask, string>({
        cartridge,
        fastClockCapacity: 32,
        minOccurrences: 3,
        quarantineStatePath: path.join(tmpDir, 'policy-quarantine-vault.json'),
        initialPrerequisiteGraph: {},
      });

      const budgetK = 4;

      // Simulated feature-weighted ranking where specialized banking rules (P-06, P-05, P-04, P-02)
      // crowd out universal base rule P-01 outside Top-4 on banking payout tasks, while non-banking
      // canary tasks (healthcare/audit/admin) keep P-01 inside Top-4.
      const rankRulesForTask = (task: PolicyAbacTask): string[] => {
        if (task.domain === 'banking') {
          const priority = ['P-06', 'P-05', 'P-04', 'P-02', 'P-03', 'P-07', 'P-08', 'P-01'];
          return priority.filter((id) => task.applicableFacts.includes(id));
        }
        // Non-banking canary tasks rank foundational P-01 inside Top-4 already
        const priority = ['P-01', 'P-02', 'P-04', 'P-09', 'P-10', 'P-11', 'P-12', 'P-03', 'P-07', 'P-08'];
        return priority.filter((id) => task.applicableFacts.includes(id));
      };

      const bankingTasks = allTasks.filter((t) => t.domain === 'banking');
      expect(bankingTasks.length).toBe(6);
      const replayTargets = bankingTasks.slice(0, 3); // ABAC-001, ABAC-002, ABAC-003
      const canaryTasks = [
        allTasks.find((t) => t.id === 'ABAC-007')!, // healthcare PHI
        allTasks.find((t) => t.id === 'ABAC-013')!, // audit export
        allTasks.find((t) => t.id === 'ABAC-016')!, // admin KMS rotation
      ];

      // Confirm baseline displacement: P-01 is displaced on all 3 target payout tasks before HOPE
      for (const task of replayTargets) {
        const baselineRet = engine.retrieveRules(
          rankRulesForTask(task),
          budgetK,
          new Set(task.applicableFacts)
        );
        expect(baselineRet.selected).toContain('P-06');
        expect(baselineRet.selected).not.toContain('P-01');
      }

      const snapshotBefore = engine.getCurrentSnapshot();
      const shaBefore = engine.getCurrentSnapshotSha256();

      // --- CLOCK 1 (Fast Clock): Replay 3 recurring P-01 (`missingTenantIsolation`) failures ---
      const recordedHashes: string[] = [];
      for (const task of replayTargets) {
        // Synthesize policy omitting P-01 (displaced from prompt) while preserving other bound rules
        const displacedPolicy = synthesizeCedarPolicyForTask(
          task,
          new Set(task.boundFacts.filter((f) => f !== 'P-01'))
        );

        const trace = await engine.recordTrial(task, displacedPolicy);
        expect(trace.committed).toBe(true);
        expect(trace.failedFacts).toEqual(['P-01']);
        expect(trace.forensicFlags.missingTenantIsolation).toBe(true);
        recordedHashes.push(trace.artifactSha256);
      }

      // Fast Clock must NOT mutate canonical snapshot
      expect(engine.getCurrentSnapshot()).toBe(snapshotBefore);
      expect(engine.getCurrentSnapshotSha256()).toBe(shaBefore);

      // --- CLOCK 2 (Intermediate Clock): Stage candidate edge (P-06 -> P-01) in QuarantineVault ---
      const flushRes = engine.flushToQuarantine({
        proposalBuilder: (cluster) => {
          if (cluster.factId === 'P-01' && cluster.triggerFlag === 'missingTenantIsolation') {
            return {
              candidateId: 'Q-P-01',
              proposedPrerequisiteEdges: [{ from: 'P-06', to: 'P-01' }],
            };
          }
          return null;
        },
      });

      expect(flushRes.staged.length).toBe(1);
      const staged = engine.quarantineVault.getCandidate('Q-P-01')!;
      expect(staged.status).toBe('staged');
      expect(staged.factId).toBe('P-01');
      expect(staged.triggerFlag).toBe('missingTenantIsolation');
      expect(staged.proposedPrerequisiteEdges).toEqual([{ from: 'P-06', to: 'P-01' }]);
      expect(staged.evidenceHashes).toEqual(recordedHashes);

      // Intermediate Clock must NOT mutate canonical snapshot
      expect(engine.getCurrentSnapshot()).toBe(snapshotBefore);
      expect(engine.getCurrentSnapshotSha256()).toBe(shaBefore);

      // --- CLOCK 3 (Slow Clock): Run all 3 DeepMetaOptimizer gates ---
      const replayEvaluator: PairedCanaryEvaluator<PolicyAbacTask> = (
        task,
        snapshot: HopeMemorySnapshot
      ) => {
        const retrieval = retrieveWithPrerequisites(
          rankRulesForTask(task),
          budgetK,
          snapshot.prerequisiteGraph,
          new Set(task.applicableFacts)
        );
        // Synthesize policy where P-01 is included iff retrieved within Top-K=4,
        // keeping other bound facts active to isolate the P-01 retrieval displacement effect.
        const effectiveRules = new Set(task.boundFacts);
        if (!retrieval.selected.includes('P-01')) {
          effectiveRules.delete('P-01');
        }
        const policy = synthesizeCedarPolicyForTask(task, effectiveRules);
        const evalRes = cartridge.evaluate(task, policy);
        return {
          taskId: task.id,
          passed: evalRes.committed && evalRes.failedFacts.length === 0,
          failedFacts: evalRes.failedFacts,
        };
      };

      const promotion = await engine.runSlowClockPromotion(
        'Q-P-01',
        {
          targetTasks: replayTargets,
          canaryTasks,
        },
        replayEvaluator,
        { evaluatedAt: '2026-11-21T04:00:00.000Z' }
      );

      expect(promotion.status).toBe('approved');
      expect(promotion.rejectedByGate).toBeNull();
      expect(promotion.gateAudit.lexicalLock.passed).toBe(true);
      expect(promotion.gateAudit.lexicalLock.retentionRate).toBe(1);
      expect(promotion.gateAudit.contradictionLinter.passed).toBe(true);
      expect(promotion.gateAudit.contradictionLinter.violations).toEqual([]);
      expect(promotion.gateAudit.canaryReplay.passed).toBe(true);
      expect(promotion.gateAudit.canaryReplay.targetBeforePassCount).toBe(0);
      expect(promotion.gateAudit.canaryReplay.targetAfterPassCount).toBe(3);
      expect(promotion.gateAudit.canaryReplay.targetCohortDelta).toBe(1);
      expect(promotion.gateAudit.canaryReplay.canaryBeforePassCount).toBe(3);
      expect(promotion.gateAudit.canaryReplay.canaryAfterPassCount).toBe(3);
      expect(promotion.gateAudit.canaryReplay.canaryRegressions).toBe(0);

      // Verify immutable promotion receipt & untouched prior snapshot
      const receipt = promotion.receipt!;
      expect(receipt.beforeSha256).toBe(shaBefore);
      expect(receipt.afterSha256).not.toBe(shaBefore);
      expect(receipt.afterSha256).toBe(engine.getCurrentSnapshotSha256());
      expect(receipt.addedPrerequisiteEdges).toEqual([{ from: 'P-06', to: 'P-01' }]);
      expect(receipt.evidenceHashes).toEqual(recordedHashes);
      expect(snapshotBefore.prerequisiteGraph).toEqual({});
      expect(engine.getCurrentSnapshot().prerequisiteGraph).toEqual({ 'P-06': ['P-01'] });
      expect(engine.quarantineVault.getCandidate('Q-P-01')!.status).toBe('approved');

      // --- Final Retrieval Verification: retrieveRules() now preserves P-01 within budget K=4 on ALL 6 banking tasks ---
      for (const task of bankingTasks) {
        const ret = engine.retrieveRules(
          rankRulesForTask(task),
          budgetK,
          new Set(task.applicableFacts)
        );
        expect(ret.selected.length).toBe(budgetK);
        expect(new Set(ret.selected).size).toBe(budgetK);
        expect(ret.selected).toContain('P-01');
        expect(ret.selected).toContain('P-06');
        expect(ret.injectedPrerequisites).toContain('P-01');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
