// tests/v4-context-compaction.test.ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FACT_TOKENS } from '../scripts/v3/verify-cid-vault.js';
import { scanWorkspaceDocsAndReports } from '../scripts/v4/audit-context-rot.js';
import {
  POLICY_VAULT_C_PATH,
  POLICY_VAULT_CID_AUTO_PATH,
  type PolicyAbacVaultFile,
} from '../scripts/v4/build-policy-abac-vaults.js';
import {
  TS_API_VAULT_C_PATH,
  TS_API_VAULT_CID_AUTO_PATH,
  type TsApiVaultFile,
} from '../scripts/v4/build-ts-api-vaults.js';
import { parsePolicyHopeCliArgs } from '../scripts/v4/run-policy-abac-hope-loop.js';
import {
  assemblePolicyPromptWithOptionalCompaction,
  buildBasePolicySystemPrompt,
  parsePolicyPilotCliArgs,
  rankRulesByPromptTfIdf,
} from '../scripts/v4/run-policy-abac-pilot.js';
import { parseTsApiHopeCliArgs } from '../scripts/v4/run-ts-api-hope-loop.js';
import {
  assembleTsApiPromptWithOptionalCompaction,
  buildBaseTsApiSystemPrompt,
  parseTsApiPilotCliArgs,
  rankTsApiRulesByPromptTfIdf,
} from '../scripts/v4/run-ts-api-pilot.js';
import { PolicyAbacCartridge } from '../src/v4/cartridges/policy-abac-cartridge.js';
import { PostgresV3Cartridge } from '../src/v4/cartridges/postgres-v3-adapter.js';
import { TsApiSecurityCartridge } from '../src/v4/cartridges/ts-api-security-cartridge.js';
import type { CanonicalRule } from '../src/v4/domain-cartridge.js';
import {
  DeepMetaOptimizer,
  compactContextBundle,
  compactRuleText,
  detectContextRot,
  estimateTokens,
  evaluateCrossRuleContradictions,
  evaluateLexicalIdentifierLock,
  toQuarantineCandidates,
  type CanarySuite,
  type PairedCanaryEvaluator,
  type RotEpisodicTrace,
} from '../src/v4/hope/index.js';
import { computeTokenRecallAgainstReference } from '../src/v4/lexical-token-extractor.js';

describe('Axiom-HOPE v4 Lexical-Locked Context Compactor (context-compactor.ts)', () => {
  it('retains 77/77 (100%) PostgreSQL reference tokens across all 34 active rules and reduces tokens without Gate 2 violations', () => {
    const pg = new PostgresV3Cartridge();
    const ruleSet = pg.loadCanonicalRules();
    const activeRules = ruleSet.rules.filter((r) => r.active);
    expect(activeRules.length).toBe(34);

    const result = compactContextBundle(activeRules, {
      maxTokens: 100_000,
      tokenExtractor: (rule) => pg.extractRequiredTokens(rule),
    });

    expect(result.compactedRules.length).toBe(34);
    expect(result.droppedRuleIds).toEqual([]);
    expect(result.afterTokens).toBeLessThan(result.beforeTokens);
    expect(result.reductionPct).toBeGreaterThan(0);
    expect(result.preservedTokenCount).toBe(result.totalRequiredTokens);

    const compactedMap = new Map(
      result.compactedRules.map((r) => [r.id, r.statement])
    );
    const refMetrics = computeTokenRecallAgainstReference(
      compactedMap,
      REQUIRED_FACT_TOKENS
    );
    const missed = Object.entries(refMetrics.byFact)
      .filter(([, m]) => m.missed.length > 0)
      .map(([id, m]) => `${id}:${m.missed.join(',')}`);

    expect(refMetrics.totalExpectedTokens).toBe(77);
    expect(refMetrics.matchedTokens).toBe(77);
    expect(refMetrics.recall).toBe(1);
    expect(missed).toEqual([]);

    // Verify Slow Clock Gate 1 & Gate 2 pass for every compacted SQL rule
    for (const compactedRule of result.compactedRules) {
      const candidate = {
        candidateId: `Q-TEST-COMPACT-${compactedRule.id}`,
        factId: compactedRule.id,
        triggerFlag: 'context_rot_oversized',
        proposedRuleText: compactedRule.statement,
        proposedPrerequisiteEdges: [],
        evidenceHashes: ['0'.repeat(64)],
        observedCount: 1,
        status: 'staged' as const,
        gateAudit: null,
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      };

      const g1 = evaluateLexicalIdentifierLock(candidate, activeRules, (r) =>
        pg.extractRequiredTokens(r)
      );
      expect(g1.passed).toBe(true);
      expect(g1.retentionRate).toBe(1);

      const g2 = evaluateCrossRuleContradictions(
        candidate,
        activeRules,
        ruleSet.prerequisiteGraph
      );
      expect(g2.passed).toBe(true);
      expect(g2.violations).toEqual([]);
    }
  });

  it('retains 78/78 ABAC tokens (12 rules) and 47/47 TS-API tokens (12 rules) with measurable reduction', () => {
    const abac = new PolicyAbacCartridge();
    const abacRules = abac.loadCanonicalRules().rules.filter((r) => r.active);
    expect(abacRules.length).toBe(12);

    const abacCompacted = compactContextBundle(abacRules, {
      maxTokens: 100_000,
      tokenExtractor: (rule) => abac.extractRequiredTokens(rule),
    });
    expect(abacCompacted.compactedRules.length).toBe(12);
    expect(abacCompacted.totalRequiredTokens).toBe(78);
    expect(abacCompacted.preservedTokenCount).toBe(78);
    expect(abacCompacted.afterTokens).toBeLessThan(abacCompacted.beforeTokens);
    expect(abacCompacted.reductionPct).toBeGreaterThan(0);

    for (const r of abacCompacted.compactedRules) {
      const g1 = evaluateLexicalIdentifierLock(
        {
          candidateId: `Q-ABAC-${r.id}`,
          factId: r.id,
          triggerFlag: 'compact',
          proposedRuleText: r.statement,
          proposedPrerequisiteEdges: [],
          evidenceHashes: ['0'.repeat(64)],
          observedCount: 1,
          status: 'staged',
          gateAudit: null,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        abacRules,
        (rule) => abac.extractRequiredTokens(rule)
      );
      expect(g1.passed).toBe(true);
    }

    const tsApi = new TsApiSecurityCartridge();
    const tsRules = tsApi.loadCanonicalRules().rules.filter((r) => r.active);
    expect(tsRules.length).toBe(12);

    const tsCompacted = compactContextBundle(tsRules, {
      maxTokens: 100_000,
      tokenExtractor: (rule) => tsApi.extractRequiredTokens(rule),
    });
    expect(tsCompacted.compactedRules.length).toBe(12);
    expect(tsCompacted.totalRequiredTokens).toBe(47);
    expect(tsCompacted.preservedTokenCount).toBe(47);
    expect(tsCompacted.afterTokens).toBeLessThan(tsCompacted.beforeTokens);
    expect(tsCompacted.reductionPct).toBeGreaterThan(0);

    for (const r of tsCompacted.compactedRules) {
      const g1 = evaluateLexicalIdentifierLock(
        {
          candidateId: `Q-TS-${r.id}`,
          factId: r.id,
          triggerFlag: 'compact',
          proposedRuleText: r.statement,
          proposedPrerequisiteEdges: [],
          evidenceHashes: ['0'.repeat(64)],
          observedCount: 1,
          status: 'staged',
          gateAudit: null,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        tsRules,
        (rule) => tsApi.extractRequiredTokens(rule)
      );
      expect(g1.passed).toBe(true);
    }
  });

  it('strips markdown/duplicate filler, enforces maxTokens budget, and falls back verbatim when prose removal would drop a required token', () => {
    const padded =
      '- **Please note that** every table must include `created_at` timestamptz NOT NULL DEFAULT now(). Always make sure to set created_at timestamptz NOT NULL DEFAULT now().';
    const compacted = compactRuleText(padded, [
      'created_at',
      'timestamptz',
      'NOT NULL',
      'now()',
    ]);
    expect(compacted.afterTokens).toBeLessThan(compacted.beforeTokens);
    expect(compacted.compactedText).not.toContain('**');
    expect(compacted.compactedText).not.toContain('Please note that');
    expect(compacted.preservedTokenCount).toBe(4);

    // Markdown-wrapped multi-word phrase retention (bold stripped, required phrase preserved)
    const markdownWrappedRequired =
      'Policies must enforce **strict compliance**; require principal.tenant_id == resource.tenant_id.';
    const wrappedResult = compactRuleText(markdownWrappedRequired, [
      'strict compliance',
      'principal.tenant_id',
      'resource.tenant_id',
    ]);
    expect(wrappedResult.preservedTokenCount).toBe(3);
    expect(wrappedResult.compactedText).not.toContain('**');
    expect(wrappedResult.compactedText.toLowerCase()).toContain('strict compliance');

    // Fallback check: if an aggressive compression transform drops even 1 required token
    // (replacing `mfa_verified` with generic prose), compactRuleText automatically falls back
    // to the uncompacted verbatim segment for that token with 100% retention.
    const ruleWithCriticalToken =
      'Every payout action must validate tenant_id matching session; please note that it is critical to require mfa_verified before approval.';
    const fallbackResult = compactRuleText(
      ruleWithCriticalToken,
      ['tenant_id', 'mfa_verified'],
      {
        aggressiveTransform: (text) =>
          text.replace(/\brequire\s+mfa_verified\s+before\s+approval/gi, 'verify auth'),
      }
    );
    expect(fallbackResult.usedFallback).toBe(true);
    expect(fallbackResult.preservedTokenCount).toBe(2);
    expect(fallbackResult.afterTokens).toBeLessThanOrEqual(fallbackResult.beforeTokens);
    expect(fallbackResult.compactedText.toLowerCase()).toContain('mfa_verified');
    expect(fallbackResult.compactedText.toLowerCase()).toContain('tenant_id');

    // Tight maxTokens budget check
    const abac = new PolicyAbacCartridge();
    const abacRules = abac.loadCanonicalRules().rules.filter((r) => r.active);
    const budget = 110;
    const budgeted = compactContextBundle(abacRules, { maxTokens: budget });
    expect(budgeted.afterTokens).toBeLessThanOrEqual(budget);
    expect(budgeted.compactedRules.length).toBeGreaterThan(0);
    expect(budgeted.droppedRuleIds.length).toBeGreaterThan(0);
    expect(budgeted.compactedRules.length + budgeted.droppedRuleIds.length).toBe(
      abacRules.length
    );
    expect(budgeted.preservedTokenCount).toBe(budgeted.totalRequiredTokens);
  });
});

describe('Axiom-HOPE v4 Context Rot Detector & Slow Clock Integration (context-rot-detector.ts)', () => {
  it('detects redundant pairs (Jaccard >= 0.65), dead-weight rules, and oversized rules, and integrates with DeepMetaOptimizer', async () => {
    const syntheticRules: CanonicalRule[] = [
      {
        id: 'R-01',
        statement:
          'Multi-tenant tables must enforce row level security scoping tenant_id via app_metadata.tenant_id.',
        active: true,
        status: 'CONFIRMED',
      },
      {
        id: 'R-02',
        statement:
          'Multi-tenant tables must enforce row level security filtering tenant_id via app_metadata.tenant_id.',
        active: true,
        status: 'CONFIRMED',
      },
      {
        id: 'R-03',
        statement:
          'Always require created_at timestamptz NOT NULL DEFAULT now() on ledger records.',
        active: true,
        status: 'CONFIRMED',
      },
      {
        id: 'R-04',
        statement:
          'Please note that it is important to ensure compliance so every single payout endpoint must explicitly enforce strict validation using safeParse for amountCents and immediately reject malformed payloads with HTTP status 400 in order to ensure compliance.',
        active: true,
        status: 'CONFIRMED',
      },
    ];

    // R-03 retrieved >= 4 times across traces with 0 failures & zero pass-rate lift
    const traces: RotEpisodicTrace[] = [
      {
        taskId: 'T-01',
        cartridgeId: 'synthetic',
        artifactSha256: 'a'.repeat(64),
        committed: true,
        failedFacts: [],
        forensicFlags: {},
        timestamp: '2026-11-24T00:00:00.000Z',
        retrievedRuleIds: ['R-01', 'R-03'],
        fullTaskPass: true,
      },
      {
        taskId: 'T-02',
        cartridgeId: 'synthetic',
        artifactSha256: 'b'.repeat(64),
        committed: true,
        failedFacts: [],
        forensicFlags: {},
        timestamp: '2026-11-24T00:01:00.000Z',
        retrievedRuleIds: ['R-01', 'R-03'],
        fullTaskPass: false,
      },
      {
        taskId: 'T-03',
        cartridgeId: 'synthetic',
        artifactSha256: 'c'.repeat(64),
        committed: true,
        failedFacts: [],
        forensicFlags: {},
        timestamp: '2026-11-24T00:02:00.000Z',
        retrievedRuleIds: ['R-02', 'R-03'],
        fullTaskPass: true,
      },
      {
        taskId: 'T-04',
        cartridgeId: 'synthetic',
        artifactSha256: 'd'.repeat(64),
        committed: true,
        failedFacts: [],
        forensicFlags: {},
        timestamp: '2026-11-24T00:03:00.000Z',
        retrievedRuleIds: ['R-02', 'R-03'],
        fullTaskPass: false,
      },
      {
        taskId: 'T-05',
        cartridgeId: 'synthetic',
        artifactSha256: 'e'.repeat(64),
        committed: true,
        failedFacts: ['R-04'],
        forensicFlags: { invalid_payload: true },
        timestamp: '2026-11-24T00:04:00.000Z',
        retrievedRuleIds: ['R-01', 'R-04'],
        fullTaskPass: true,
      },
    ];

    const report = detectContextRot(syntheticRules, traces, {
      similarityThreshold: 0.65,
      minRetrievals: 4,
      maxRuleTokens: 25,
      cartridgeId: 'synthetic-domain',
    });

    // 1. Redundant pair caught (`R-01` & `R-02`)
    expect(report.redundantPairs.length).toBeGreaterThanOrEqual(1);
    const pair = report.redundantPairs.find(
      (p) =>
        (p.ruleIdA === 'R-01' && p.ruleIdB === 'R-02') ||
        (p.ruleIdA === 'R-02' && p.ruleIdB === 'R-01')
    );
    expect(pair).toBeDefined();
    expect(pair!.jaccardSimilarity).toBeGreaterThanOrEqual(0.65);

    // 2. Dead-weight rule caught (`R-03`: 4 retrievals, 0 failures, passRateWhenRetrieved=0.5 <= 1.0 notRetrieved)
    expect(report.deadWeightRules.map((d) => d.ruleId)).toContain('R-03');

    // 3. Oversized rule caught (`R-04`)
    const oversized = report.oversizedRules.find((o) => o.ruleId === 'R-04');
    expect(oversized).toBeDefined();
    expect(oversized!.beforeTokens).toBeGreaterThan(25);
    expect(oversized!.afterTokens).toBeLessThan(oversized!.beforeTokens);

    // 4. Slow Clock integration via `toQuarantineCandidates(report)` + `DeepMetaOptimizer`
    const candidates = toQuarantineCandidates(report, {
      timestamp: '2026-11-24T01:00:00.000Z',
    });
    expect(candidates.some((c) => c.candidateId === 'Q-COMPACT-R-04')).toBe(true);
    expect(candidates.some((c) => c.candidateId.startsWith('Q-DEDUP-R-01'))).toBe(true);
    expect(candidates.some((c) => c.candidateId === 'Q-TRIM-R-03')).toBe(true);

    const compactCandidate = candidates.find(
      (c) => c.candidateId === 'Q-COMPACT-R-04'
    )!;
    const optimizer = new DeepMetaOptimizer();
    const suite: CanarySuite<{ readonly id: string; readonly kind: 'target' | 'canary' }> = {
      targetTasks: [{ id: 'TARGET-1', kind: 'target' }],
      canaryTasks: [{ id: 'CANARY-1', kind: 'canary' }],
    };

    const approvingEvaluator: PairedCanaryEvaluator<{
      readonly id: string;
      readonly kind: 'target' | 'canary';
    }> = (task, snapshot) => {
      const ruleText = snapshot.rules.find((r) => r.id === 'R-04')?.statement ?? '';
      const compactApplied = estimateTokens(ruleText) < 35;
      if (task.kind === 'target') {
        return { taskId: task.id, passed: compactApplied };
      }
      return { taskId: task.id, passed: true };
    };

    const approved = await optimizer.evaluateCandidate(
      compactCandidate,
      syntheticRules,
      {},
      suite,
      approvingEvaluator,
      { evaluatedAt: '2026-11-24T01:00:00.000Z' }
    );
    expect(approved.status).toBe('approved');
    expect(approved.gateAudit.lexicalLock.passed).toBe(true);
    expect(approved.gateAudit.contradictionLinter.passed).toBe(true);
    expect(approved.gateAudit.canaryReplay.passed).toBe(true);
    expect(approved.gateAudit.canaryReplay.canaryRegressions).toBe(0);
    expect(approved.receipt).toBeDefined();

    // Gate 3 must still strictly reject if paired canary regresses
    const regressingEvaluator: PairedCanaryEvaluator<{
      readonly id: string;
      readonly kind: 'target' | 'canary';
    }> = (task, snapshot) => {
      const ruleText = snapshot.rules.find((r) => r.id === 'R-04')?.statement ?? '';
      const compactApplied = estimateTokens(ruleText) < 35;
      if (task.kind === 'target') {
        return { taskId: task.id, passed: compactApplied };
      }
      return { taskId: task.id, passed: !compactApplied };
    };

    const rejected = await optimizer.evaluateCandidate(
      compactCandidate,
      syntheticRules,
      {},
      suite,
      regressingEvaluator,
      { evaluatedAt: '2026-11-24T01:00:00.000Z' }
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectedByGate).toBe('canary_replay');
    expect(rejected.gateAudit.canaryReplay.canaryRegressions).toBe(1);
  });

  it('audits docs/ and out/v4/ read-only via audit-context-rot helpers and verifies 100% lexical lock on all 3 cartridges', () => {
    const { report } = scanWorkspaceDocsAndReports();
    expect(report.totalFiles).toBeGreaterThanOrEqual(40);
    expect(report.top10Largest.length).toBe(10);
    expect(
      report.duplicateAndSuperseded.some((d) => d.kind === 'exact_duplicate')
    ).toBe(true);
    expect(report.cartridgeCompaction.length).toBe(3);
    for (const c of report.cartridgeCompaction) {
      expect(c.afterTokens).toBeLessThan(c.beforeTokens);
      expect(c.preservedTokens).toBe(c.totalRequiredTokens);
    }
  });
});

describe('v4 Runner --compact Top-4 Bundle Wiring (ABAC & TS-API)', () => {
  it('parses --compact and --max-context-tokens across all 4 CLI runners with safe default false', () => {
    const abacPilotDefault = parsePolicyPilotCliArgs([]);
    const abacHopeDefault = parsePolicyHopeCliArgs([]);
    const tsPilotDefault = parseTsApiPilotCliArgs([]);
    const tsHopeDefault = parseTsApiHopeCliArgs([]);

    expect(abacPilotDefault.compact).toBe(false);
    expect(abacPilotDefault.maxContextTokens).toBeUndefined();
    expect(abacHopeDefault.compact).toBe(false);
    expect(tsPilotDefault.compact).toBe(false);
    expect(tsHopeDefault.compact).toBe(false);

    const flags = ['--model', 'gemma-4-31b-it', '--compact', '--max-context-tokens', '160'];
    expect(parsePolicyPilotCliArgs(flags)).toMatchObject({
      model: 'gemma-4-31b-it',
      compact: true,
      maxContextTokens: 160,
    });
    expect(parsePolicyHopeCliArgs(flags)).toMatchObject({
      model: 'gemma-4-31b-it',
      compact: true,
      maxContextTokens: 160,
    });
    expect(parseTsApiPilotCliArgs(flags)).toMatchObject({
      model: 'gemma-4-31b-it',
      compact: true,
      maxContextTokens: 160,
    });
    expect(parseTsApiHopeCliArgs(flags)).toMatchObject({
      model: 'gemma-4-31b-it',
      compact: true,
      maxContextTokens: 160,
    });
  });

  it('reduces Top-4 ABAC and TS-API bundle prompt tokens while preserving 100% operational tokens and keeping default uncompacted output identical', () => {
    // 1. Policy-as-Code ABAC (18 tasks x Top-4 retrieval)
    const abac = new PolicyAbacCartridge();
    const abacTasks = abac.loadTasks();
    const abacRules = abac.loadCanonicalRules().rules;
    const abacVaultCid = JSON.parse(
      fs.readFileSync(POLICY_VAULT_CID_AUTO_PATH, 'utf8')
    ) as PolicyAbacVaultFile;
    const abacVaultC = JSON.parse(
      fs.readFileSync(POLICY_VAULT_C_PATH, 'utf8')
    ) as PolicyAbacVaultFile;
    const abacCidMap = new Map(abacVaultCid.lessons.map((l) => [l.factId, l.lesson]));
    const abacCMap = new Map(abacVaultC.lessons.map((l) => [l.factId, l.lesson]));

    let abacBeforeTotal = 0;
    let abacAfterTotal = 0;
    let abacSysBeforeTotal = 0;
    let abacSysAfterTotal = 0;

    for (const task of abacTasks) {
      const top4 = rankRulesByPromptTfIdf(task.prompt, abacRules).slice(0, 4);

      const expectedBaselineBlock = top4
        .map((id) => `[${id}] ${abacCidMap.get(id) ?? ''}`)
        .join('\n');
      const expectedBaselinePrompt = buildBasePolicySystemPrompt(expectedBaselineBlock);

      const uncompacted = assemblePolicyPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: abacCidMap,
        canonicalRules: abacRules,
        cartridge: abac,
        enforceCanonicalLock: true,
        compact: false,
      });
      expect(uncompacted.lessonsBlock).toBe(expectedBaselineBlock);
      expect(uncompacted.systemPrompt).toBe(expectedBaselinePrompt);

      const compacted = assemblePolicyPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: abacCidMap,
        canonicalRules: abacRules,
        cartridge: abac,
        enforceCanonicalLock: true,
        compact: true,
      });
      expect(compacted.includedRuleIds).toEqual(top4);
      expect(compacted.droppedRuleIds).toEqual([]);
      expect(compacted.preservedTokenCount).toBe(compacted.totalRequiredTokens);
      expect(compacted.afterTokens).toBeLessThan(compacted.beforeTokens);

      abacBeforeTotal += compacted.beforeTokens;
      abacAfterTotal += compacted.afterTokens;
      abacSysBeforeTotal += estimateTokens(uncompacted.systemPrompt);
      abacSysAfterTotal += estimateTokens(compacted.systemPrompt);

      // Unconstrained C arm also compacts without enforcing canonical token lock
      const armCCompacted = assemblePolicyPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: abacCMap,
        canonicalRules: abacRules,
        cartridge: abac,
        enforceCanonicalLock: false,
        compact: true,
      });
      expect(armCCompacted.preservedTokenCount).toBe(armCCompacted.totalRequiredTokens);
      expect(armCCompacted.afterTokens).toBeLessThanOrEqual(armCCompacted.beforeTokens);
    }

    expect(abacAfterTotal).toBeLessThan(abacBeforeTotal);
    expect(abacSysAfterTotal).toBeLessThan(abacSysBeforeTotal);

    // Budget cap enforcement on Top-4 ABAC bundle
    const abacSampleTop4 = rankRulesByPromptTfIdf(abacTasks[0].prompt, abacRules).slice(0, 4);
    const cappedAbac = assemblePolicyPromptWithOptionalCompaction({
      retrievedRuleIds: abacSampleTop4,
      lessonsById: abacCidMap,
      canonicalRules: abacRules,
      cartridge: abac,
      enforceCanonicalLock: true,
      compact: true,
      maxContextTokens: 80,
    });
    expect(cappedAbac.afterTokens).toBeLessThanOrEqual(80);
    expect(cappedAbac.droppedRuleIds.length).toBeGreaterThan(0);
    expect(cappedAbac.preservedTokenCount).toBe(cappedAbac.totalRequiredTokens);

    // 2. TypeScript API Security Contracts (15 tasks x Top-4 retrieval)
    const tsApi = new TsApiSecurityCartridge();
    const tsTasks = tsApi.loadTasks();
    const tsRules = tsApi.loadCanonicalRules().rules;
    const tsVaultCid = JSON.parse(
      fs.readFileSync(TS_API_VAULT_CID_AUTO_PATH, 'utf8')
    ) as TsApiVaultFile;
    const tsVaultC = JSON.parse(
      fs.readFileSync(TS_API_VAULT_C_PATH, 'utf8')
    ) as TsApiVaultFile;
    const tsCidMap = new Map(tsVaultCid.lessons.map((l) => [l.factId, l.lesson]));
    const tsCMap = new Map(tsVaultC.lessons.map((l) => [l.factId, l.lesson]));

    let tsBeforeTotal = 0;
    let tsAfterTotal = 0;
    let tsSysBeforeTotal = 0;
    let tsSysAfterTotal = 0;

    for (const task of tsTasks) {
      const top4 = rankTsApiRulesByPromptTfIdf(task, tsRules).slice(0, 4);

      const expectedBaselineBlock = top4
        .map((id) => `[${id}] ${tsCidMap.get(id) ?? ''}`)
        .join('\n');
      const expectedBaselinePrompt = buildBaseTsApiSystemPrompt(expectedBaselineBlock);

      const uncompacted = assembleTsApiPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: tsCidMap,
        canonicalRules: tsRules,
        cartridge: tsApi,
        enforceCanonicalLock: true,
        compact: false,
      });
      expect(uncompacted.lessonsBlock).toBe(expectedBaselineBlock);
      expect(uncompacted.systemPrompt).toBe(expectedBaselinePrompt);

      const compacted = assembleTsApiPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: tsCidMap,
        canonicalRules: tsRules,
        cartridge: tsApi,
        enforceCanonicalLock: true,
        compact: true,
      });
      expect(compacted.includedRuleIds).toEqual(top4);
      expect(compacted.droppedRuleIds).toEqual([]);
      expect(compacted.preservedTokenCount).toBe(compacted.totalRequiredTokens);
      expect(compacted.afterTokens).toBeLessThan(compacted.beforeTokens);

      tsBeforeTotal += compacted.beforeTokens;
      tsAfterTotal += compacted.afterTokens;
      tsSysBeforeTotal += estimateTokens(uncompacted.systemPrompt);
      tsSysAfterTotal += estimateTokens(compacted.systemPrompt);

      const armCCompacted = assembleTsApiPromptWithOptionalCompaction({
        retrievedRuleIds: top4,
        lessonsById: tsCMap,
        canonicalRules: tsRules,
        cartridge: tsApi,
        enforceCanonicalLock: false,
        compact: true,
      });
      expect(armCCompacted.preservedTokenCount).toBe(armCCompacted.totalRequiredTokens);
      expect(armCCompacted.afterTokens).toBeLessThanOrEqual(armCCompacted.beforeTokens);
    }

    expect(tsAfterTotal).toBeLessThan(tsBeforeTotal);
    expect(tsSysAfterTotal).toBeLessThan(tsSysBeforeTotal);

    const tsSampleTop4 = rankTsApiRulesByPromptTfIdf(tsTasks[0], tsRules).slice(0, 4);
    const cappedTs = assembleTsApiPromptWithOptionalCompaction({
      retrievedRuleIds: tsSampleTop4,
      lessonsById: tsCidMap,
      canonicalRules: tsRules,
      cartridge: tsApi,
      enforceCanonicalLock: true,
      compact: true,
      maxContextTokens: 80,
    });
    expect(cappedTs.afterTokens).toBeLessThanOrEqual(80);
    expect(cappedTs.droppedRuleIds.length).toBeGreaterThan(0);
    expect(cappedTs.preservedTokenCount).toBe(cappedTs.totalRequiredTokens);

    const abacPct = (((abacBeforeTotal - abacAfterTotal) / abacBeforeTotal) * 100).toFixed(2);
    const tsPct = (((tsBeforeTotal - tsAfterTotal) / tsBeforeTotal) * 100).toFixed(2);
    console.log(
      `[Runner --compact Top-4 Bundles] ABAC: ${abacBeforeTotal}->${abacAfterTotal} (-${abacPct}%) | TS-API: ${tsBeforeTotal}->${tsAfterTotal} (-${tsPct}%)`
    );
  });
});
