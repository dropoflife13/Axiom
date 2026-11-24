import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FACT_TOKENS } from '../scripts/v3/verify-cid-vault.js';
import {
  POLICY_ABAC_CANONICAL_RULES,
  PolicyAbacCartridge,
} from '../src/v4/cartridges/policy-abac-cartridge.js';
import { PostgresV3Cartridge } from '../src/v4/cartridges/postgres-v3-adapter.js';
import {
  compileTypeScriptHandler,
  DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH,
  TS_API_SECURITY_CANONICAL_RULES,
  TsApiSecurityCartridge,
  type TsApiSecurityTask,
} from '../src/v4/cartridges/ts-api-security-cartridge.js';
import { DomainCartridgeRegistry } from '../src/v4/domain-cartridge.js';
import {
  AxiomHopeEngine,
  evaluateCrossRuleContradictions,
  evaluateLexicalIdentifierLock,
  type HopeMemorySnapshot,
  type PairedCanaryEvaluator,
} from '../src/v4/hope/index.js';
import {
  computeTokenRecallAgainstReference,
  extractRequiredTokens,
} from '../src/v4/lexical-token-extractor.js';
import { retrieveWithPrerequisites } from '../src/v4/prerequisite-retriever.js';

interface SynthesizeHandlerOptions {
  readonly omitSafeParse?: boolean;
  readonly leakSecret?: 'SUPABASE_SERVICE_ROLE_KEY' | 'process.env.PRIVATE_KEY' | 'passwordHash';
  readonly omitErrorEnvelope?: boolean;
  readonly omitNoStore?: boolean;
  readonly commentOutTenantCheck?: boolean;
}

/**
 * Deterministic TypeScript API route handler synthesizer for a `TsApiSecurityTask`
 * given a set of active canonical rule IDs. Enables $0-cost offline contract verification
 * and paired before/after canary replay with zero LLM calls.
 */
function synthesizeTsHandlerForTask(
  task: TsApiSecurityTask,
  activeRuleIds: ReadonlySet<string>,
  options: SynthesizeHandlerOptions = {}
): string {
  const has = (id: string) => activeRuleIds.has(id);
  const useSafeParse = has('TS-02') && !options.omitSafeParse;
  const useErrorEnvelope = has('TS-04') && !options.omitErrorEnvelope;
  const useNoStore = has('TS-08') && !options.omitNoStore;

  const headersExpr = useNoStore
    ? `{ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }`
    : `{ 'Content-Type': 'application/json' }`;

  const errorHelper = useErrorEnvelope
    ? `function makeError(status: number, code: string, message: string, requestId: string) {
  return {
    status,
    headers: ${headersExpr},
    body: { error: { code, message, requestId } },
  };
}`
    : `function makeError(status: number, code: string, message: string, _requestId: string) {
  return {
    status,
    headers: ${headersExpr},
    body: { err: code, detail: message },
  };
}`;

  const schemaDecl =
    task.domain === 'payouts'
      ? `const BodySchema = z.object({
  tenantId: z.string().min(1),
  destinationAccount: z.string().min(1),
  amountCents: z.number().int()${has('TS-10') ? '.gt(0).lte(10000000)' : ''},
  currency: z.string().min(3),
}).strict();`
      : task.domain === 'admin'
        ? `const BodySchema = z.object({
  tenantId: z.string().min(1),
  exportFields: z.array(z.string().min(1)).min(1),
  limit: z.number().int().positive()${has('TS-11') ? '.lte(500)' : ''},
}).strict();`
        : `const BodySchema = z.object({
  tenantId: z.string().min(1),
  targetUserId: z.string().min(1),
  displayName: z.string().min(1),
})${has('TS-12') ? '.strict()' : ''};`;

  const authBlock = has('TS-03')
    ? `  if (!ctx.session || !ctx.session.userId) {
    return makeError(401, 'ERR_UNAUTHENTICATED', 'Active session required', req.requestId);
  }
  const session = ctx.session;`
    : `  const session = ctx.session ?? { userId: 'anon', tenantId: '', role: 'guest' };`;

  const roleBlock = has('TS-05')
    ? `  const ALLOWED_ROLES = ${JSON.stringify(task.allowedRoles)} as const;
  if (!ALLOWED_ROLES.includes(session.role as (typeof ALLOWED_ROLES)[number])) {
    return makeError(403, 'ERR_FORBIDDEN_ROLE', 'Insufficient role privileges', req.requestId);
  }`
    : '';

  const idempotencyBlock = has('TS-07')
    ? `  const idempotencyKey = req.headers['x-idempotency-key'];
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return makeError(400, 'ERR_MISSING_IDEMPOTENCY_KEY', 'Header x-idempotency-key is required', req.requestId);
  }`
    : '';

  const parseBlock = useSafeParse
    ? `  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    return makeError(400, 'ERR_INVALID_JSON', 'Malformed JSON body', req.requestId);
  }
  const parsed = BodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return makeError(400, 'ERR_INVALID_PAYLOAD', 'Request payload failed schema validation', req.requestId);
  }
  const payload = parsed.data;`
    : `  const payload = (await req.json()) as Record<string, any>;`;

  const tenantBlock = has('TS-01')
    ? options.commentOutTenantCheck
      ? `  // if (session.tenantId !== payload.tenantId) return makeError(403, 'ERR_TENANT', 'Cross-tenant denied', req.requestId);`
      : `  if (session.tenantId !== payload.tenantId) {
    return makeError(403, 'ERR_TENANT_ISOLATION', 'Cross-tenant access denied', req.requestId);
  }`
    : '';

  const profileOwnershipBlock =
    task.domain === 'profiles' && has('TS-12')
      ? `  if (session.userId !== payload.targetUserId && session.role !== 'tenant_admin') {
    return makeError(403, 'ERR_OWNERSHIP_REQUIRED', 'Cannot mutate another user profile', req.requestId);
  }`
      : '';

  const auditBlock = has('TS-09')
    ? `  ctx.emitAuditEvent({
    action: '${task.method} ${task.route}',
    actorId: session.userId,
    requestId: req.requestId,
    tenantId: session.tenantId,
  });`
    : '';

  const leakField =
    options.leakSecret === 'SUPABASE_SERVICE_ROLE_KEY'
      ? `    debugKey: (globalThis as Record<string, unknown>).SUPABASE_SERVICE_ROLE_KEY ?? 'SUPABASE_SERVICE_ROLE_KEY',`
      : options.leakSecret === 'process.env.PRIVATE_KEY'
        ? `    signingHint: process.env.PRIVATE_KEY ?? 'PRIVATE_KEY',`
        : options.leakSecret === 'passwordHash'
          ? `    passwordHash: 'argon2id$redacted',`
          : '';

  return `import { z } from 'zod';

interface RouteSession {
  userId: string;
  tenantId: string;
  role: string;
}

interface ApiRequest {
  method: string;
  requestId: string;
  headers: Record<string, string | undefined>;
  json(): Promise<unknown>;
}

interface ApiContext {
  session: RouteSession | null;
  emitAuditEvent(event: { action: string; actorId: string; requestId: string; tenantId?: string }): void;
}

${schemaDecl}

${errorHelper}

export async function handle(req: ApiRequest, ctx: ApiContext) {
${authBlock}
${roleBlock}
${idempotencyBlock}
${parseBlock}
${tenantBlock}
${profileOwnershipBlock}
${auditBlock}
  return {
    status: ${task.method === 'POST' ? 201 : 200},
    headers: ${headersExpr},
    body: {
      ok: true,
      route: '${task.route}',
      tenantId: session.tenantId,
      requestId: req.requestId,
${leakField}
    },
  };
}
`;
}

describe('v4 TypeScript API Security DomainCartridge & 3-Domain HOPE Integration', () => {
  it('registers cleanly alongside PostgresV3Cartridge and PolicyAbacCartridge in DomainCartridgeRegistry and loads 15 tasks + 12 rules', () => {
    const registry = new DomainCartridgeRegistry();
    const pgCartridge = new PostgresV3Cartridge();
    const abacCartridge = new PolicyAbacCartridge();
    const tsApiCartridge = new TsApiSecurityCartridge();

    registry.register(pgCartridge);
    registry.register(abacCartridge);
    registry.register(tsApiCartridge);

    expect(registry.has('postgres-v3')).toBe(true);
    expect(registry.has('policy-abac-v4')).toBe(true);
    expect(registry.has('ts-api-security-v4')).toBe(true);
    expect(registry.list().map((c) => c.id).sort()).toEqual([
      'policy-abac-v4',
      'postgres-v3',
      'ts-api-security-v4',
    ]);

    const tasks = tsApiCartridge.loadTasks();
    expect(tasks.length).toBe(15);
    expect(tasks.filter((t) => t.domain === 'payouts').length).toBe(5);
    expect(tasks.filter((t) => t.domain === 'admin').length).toBe(5);
    expect(tasks.filter((t) => t.domain === 'profiles').length).toBe(5);

    const ruleSet = tsApiCartridge.loadCanonicalRules();
    expect(ruleSet.rules.length).toBe(12);
    expect(ruleSet.rules.every((r) => r.active)).toBe(true);
    expect(ruleSet.prerequisiteGraph['TS-10']).toEqual(['TS-01', 'TS-02', 'TS-07']);
    expect(ruleSet.prerequisiteGraph['TS-11']).toEqual(['TS-01', 'TS-05', 'TS-08']);
    expect(ruleSet.prerequisiteGraph['TS-12']).toEqual(['TS-01', 'TS-02', 'TS-06']);
  });

  it('extractRequiredTokens() extracts TypeScript API security identifiers without regressing 77/77 SQL or 78/78 ABAC tokens', () => {
    const tsCartridge = new TsApiSecurityCartridge();
    const { rules } = tsCartridge.loadCanonicalRules();
    const byId = new Map(rules.map((r) => [r.id, r]));

    const expectedByRule: Record<string, string[]> = {
      'TS-01': ['session.tenantId', 'payload.tenantId', 'tenantId', '403'],
      'TS-02': ['safeParse', 'req.json()', '400'],
      'TS-03': ['session.userId', 'userId', '401'],
      'TS-04': ['400', '401', '403', 'requestId'],
      'TS-05': ['ALLOWED_ROLES', 'ALLOWED_ROLES.includes', 'session.role', '403'],
      'TS-06': ['SUPABASE_SERVICE_ROLE_KEY', 'process.env.PRIVATE_KEY', 'PRIVATE_KEY', 'passwordHash'],
      'TS-07': ['x-idempotency-key', '400'],
      'TS-08': ['Cache-Control: no-store', 'Cache-Control', 'no-store'],
      'TS-09': ['emitAuditEvent', 'actorId', 'requestId'],
      'TS-10': ['amountCents', '> 0', '<= 10000000', '400'],
      'TS-11': ['exportFields', '<= 500', '400'],
      'TS-12': ['session.userId', 'payload.targetUserId', 'session.role', 'tenant_admin', 'role', 'tenantId'],
    };

    for (const [ruleId, expectedTokens] of Object.entries(expectedByRule)) {
      const rule = byId.get(ruleId)!;
      const extracted = tsCartridge.extractRequiredTokens(rule);
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
        createdAt: '2026-11-22T00:00:00.000Z',
        updatedAt: '2026-11-22T00:00:00.000Z',
      };
      const gate1 = evaluateLexicalIdentifierLock(
        identityCandidate,
        TS_API_SECURITY_CANONICAL_RULES
      );
      expect(gate1.passed).toBe(true);
      expect(gate1.retentionRate).toBe(1);

      const gate2 = evaluateCrossRuleContradictions(
        identityCandidate,
        TS_API_SECURITY_CANONICAL_RULES,
        DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH
      );
      expect(gate2.passed).toBe(true);
    }

    // Verify Gate 1 catches paraphrasing concrete TypeScript tokens (e.g., `x-idempotency-key` -> `idempotency header`)
    const erodedTs07 = {
      candidateId: 'Q-ERODED-TS07',
      factId: 'TS-07',
      triggerFlag: 'missingIdempotencyKey',
      proposedRuleText:
        "Mutating financial and payout routes must enforce a non-empty deduplication header and return HTTP status '400' when missing.",
      proposedPrerequisiteEdges: [],
      evidenceHashes: [],
      observedCount: 3,
      status: 'staged' as const,
      gateAudit: null,
      createdAt: '2026-11-22T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
    };
    const lockFail = evaluateLexicalIdentifierLock(erodedTs07, TS_API_SECURITY_CANONICAL_RULES);
    expect(lockFail.passed).toBe(false);
    expect(lockFail.missingTokens).toContain('x-idempotency-key');

    // Regression guard: PostgreSQL v3 77/77 recall must remain 100.0%
    const v3FactsRaw = JSON.parse(
      fs.readFileSync(path.resolve('fixtures', 'task-v3', 'facts.json'), 'utf8')
    ) as {
      facts: Array<{
        id: string;
        statement: string;
        applicability?: { never?: boolean };
        status?: string;
      }>;
    };
    const activeV3 = v3FactsRaw.facts.filter(
      (f) =>
        !f.applicability?.never &&
        !['DROPPED', 'UNCONFIRMED', 'PROPOSED'].includes((f.status ?? '').toUpperCase())
    );
    const v3Metrics = computeTokenRecallAgainstReference(
      new Map(activeV3.map((f) => [f.id, f.statement])),
      REQUIRED_FACT_TOKENS
    );
    expect(v3Metrics.matchedTokens).toBe(77);
    expect(v3Metrics.totalExpectedTokens).toBe(77);
    expect(v3Metrics.recall).toBe(1);

    // Regression guard: Policy-as-Code ABAC exact 78/78 token count must remain invariant
    let abacTokenTotal = 0;
    for (const rule of POLICY_ABAC_CANONICAL_RULES) {
      abacTokenTotal += extractRequiredTokens(rule.statement).length;
    }
    expect(abacTokenTotal).toBe(78);
  });

  it('deterministically compiles and grades all 15 handlers (15/15 100% pass), rejects broken TS syntax and sandbox escapes, and tags all 7 forensic modes', async () => {
    const cartridge = new TsApiSecurityCartridge();
    const tasks = cartridge.loadTasks();

    // 1. All 15 held-out API tasks pass 100% of bound security contracts
    for (const task of tasks) {
      const validCode = synthesizeTsHandlerForTask(task, new Set(task.boundFacts));
      expect(compileTypeScriptHandler(validCode).ok).toBe(true);

      const res = await cartridge.evaluate(task, validCode);
      expect(res.committed, `Task ${task.id} failed to commit: ${res.stderr}`).toBe(true);
      expect(res.failedFacts, `Task ${task.id} failed facts: ${res.stderr}`).toEqual([]);
      expect(res.passedFacts).toEqual(task.boundFacts);

      const forensics = cartridge.classifyForensics(task, validCode);
      expect(forensics).toEqual({
        syntaxError: false,
        missingSafeParse: false,
        missingTenantCheck: false,
        leakedSecretIdentifier: false,
        missingErrorEnvelope: false,
        missingIdempotencyKey: false,
        missingNoStoreHeader: false,
      });
    }

    const payoutTask = tasks.find((t) => t.id === 'TSAPI-001')!;

    // 2. Broken TypeScript syntax -> committed: false + syntaxError forensic flag
    const brokenTs = `export async function handle(req: { requestId: string { return { status: 200 }; }`;
    const syntaxRes = await cartridge.evaluate(payoutTask, brokenTs);
    expect(syntaxRes.committed).toBe(false);
    expect(syntaxRes.passedFacts).toEqual([]);
    expect(syntaxRes.failedFacts).toEqual(payoutTask.boundFacts);
    expect(syntaxRes.stderr).toMatch(/TypeScriptCompileError/i);
    expect(cartridge.classifyForensics(payoutTask, brokenTs).syntaxError).toBe(true);

    // 3. Disallowed host module import (`node:fs`) -> blocked inside sandbox (`committed: false`)
    const sandboxEscapeTs = `import fs from 'node:fs';
export async function handle() { return { status: 200, body: fs.readdirSync('.') }; }`;
    const escapeRes = await cartridge.evaluate(payoutTask, sandboxEscapeTs);
    expect(escapeRes.committed).toBe(false);
    expect(escapeRes.stderr).toMatch(/SecuritySandboxError/i);

    // 4. Raw unchecked req.json() (omits safeParse) -> fails TS-02 + missingSafeParse
    const noSafeParseCode = synthesizeTsHandlerForTask(payoutTask, new Set(payoutTask.boundFacts), {
      omitSafeParse: true,
    });
    const noSafeParseRes = await cartridge.evaluate(payoutTask, noSafeParseCode);
    expect(noSafeParseRes.committed).toBe(true);
    expect(noSafeParseRes.failedFacts).toContain('TS-02');
    expect(cartridge.classifyForensics(payoutTask, noSafeParseCode).missingSafeParse).toBe(true);

    // 5. Commented-out tenant check -> comment-stripped AST + runtime probe fail ONLY TS-01 + missingTenantCheck
    const commentedTenantCode = synthesizeTsHandlerForTask(
      payoutTask,
      new Set(payoutTask.boundFacts),
      { commentOutTenantCheck: true }
    );
    const tenantRes = await cartridge.evaluate(payoutTask, commentedTenantCode);
    expect(tenantRes.committed).toBe(true);
    expect(tenantRes.failedFacts).toEqual(['TS-01']);
    expect(cartridge.classifyForensics(payoutTask, commentedTenantCode).missingTenantCheck).toBe(
      true
    );

    // 6. Secret leakage (`SUPABASE_SERVICE_ROLE_KEY`, `process.env.PRIVATE_KEY`, `passwordHash`) -> fails TS-06
    for (const secret of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'process.env.PRIVATE_KEY',
      'passwordHash',
    ] as const) {
      const leakCode = synthesizeTsHandlerForTask(payoutTask, new Set(payoutTask.boundFacts), {
        leakSecret: secret,
      });
      const leakRes = await cartridge.evaluate(payoutTask, leakCode);
      expect(leakRes.committed).toBe(true);
      expect(leakRes.failedFacts).toEqual(['TS-06']);
      expect(cartridge.classifyForensics(payoutTask, leakCode).leakedSecretIdentifier).toBe(true);
    }

    // 7. Missing standardized error envelope -> fails TS-04 + missingErrorEnvelope
    const noEnvCode = synthesizeTsHandlerForTask(payoutTask, new Set(payoutTask.boundFacts), {
      omitErrorEnvelope: true,
    });
    const noEnvRes = await cartridge.evaluate(payoutTask, noEnvCode);
    expect(noEnvRes.committed).toBe(true);
    expect(noEnvRes.failedFacts).toEqual(['TS-04']);
    expect(cartridge.classifyForensics(payoutTask, noEnvCode).missingErrorEnvelope).toBe(true);

    // 8. Missing x-idempotency-key -> fails TS-07 + missingIdempotencyKey
    const noIdemCode = synthesizeTsHandlerForTask(
      payoutTask,
      new Set(payoutTask.boundFacts.filter((f) => f !== 'TS-07'))
    );
    const noIdemRes = await cartridge.evaluate(payoutTask, noIdemCode);
    expect(noIdemRes.committed).toBe(true);
    expect(noIdemRes.failedFacts).toEqual(['TS-07']);
    expect(cartridge.classifyForensics(payoutTask, noIdemCode).missingIdempotencyKey).toBe(true);

    // 9. Missing Cache-Control: no-store -> fails TS-08 + missingNoStoreHeader
    const noStoreCode = synthesizeTsHandlerForTask(payoutTask, new Set(payoutTask.boundFacts), {
      omitNoStore: true,
    });
    const noStoreRes = await cartridge.evaluate(payoutTask, noStoreCode);
    expect(noStoreRes.committed).toBe(true);
    expect(noStoreRes.failedFacts).toEqual(['TS-08']);
    expect(cartridge.classifyForensics(payoutTask, noStoreCode).missingNoStoreHeader).toBe(true);
  });

  it('executes full end-to-end 3-Clock Axiom-HOPE loop on TsApiSecurityCartridge with ZERO edits to src/v4/hope/*', async () => {
    // Start with empty prerequisite graph so TS-01 (tenant isolation) is displaced outside K=4 on financial payouts
    const cartridge = new TsApiSecurityCartridge({ prerequisiteGraph: {} });
    const allTasks = cartridge.loadTasks();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-v4-tsapi-hope-'));
    try {
      const engine = new AxiomHopeEngine<TsApiSecurityTask, string>({
        cartridge,
        fastClockCapacity: 32,
        minOccurrences: 3,
        quarantineStatePath: path.join(tmpDir, 'tsapi-quarantine-vault.json'),
        initialPrerequisiteGraph: {},
      });

      const budgetK = 4;

      // Simulated feature-weighted ranker: on payout routes, specialized financial guards
      // (TS-10, TS-07, TS-05, TS-02) crowd out universal TS-01 outside Top-4; on non-payout
      // canary routes (admin exports + profile mutations), TS-01 already ranks inside Top-4.
      const rankRulesForTask = (task: TsApiSecurityTask): string[] => {
        if (task.domain === 'payouts') {
          const priority = [
            'TS-10',
            'TS-07',
            'TS-05',
            'TS-02',
            'TS-03',
            'TS-04',
            'TS-06',
            'TS-08',
            'TS-09',
            'TS-01',
          ];
          return priority.filter((id) => task.applicableFacts.includes(id));
        }
        const priority = [
          'TS-01',
          'TS-02',
          'TS-03',
          'TS-11',
          'TS-12',
          'TS-05',
          'TS-04',
          'TS-06',
          'TS-08',
          'TS-09',
        ];
        return priority.filter((id) => task.applicableFacts.includes(id));
      };

      const payoutTasks = allTasks.filter((t) => t.domain === 'payouts');
      expect(payoutTasks.length).toBe(5);
      const replayTargets = payoutTasks.slice(0, 3); // TSAPI-001, TSAPI-002, TSAPI-003
      const canaryTasks = [
        allTasks.find((t) => t.id === 'TSAPI-006')!, // admin export
        allTasks.find((t) => t.id === 'TSAPI-011')!, // profile mutation
        allTasks.find((t) => t.id === 'TSAPI-013')!, // recovery email mutation
      ];

      // Confirm baseline displacement: TS-01 is displaced on all 3 target payout routes before HOPE
      for (const task of replayTargets) {
        const baselineRet = engine.retrieveRules(
          rankRulesForTask(task),
          budgetK,
          new Set(task.applicableFacts)
        );
        expect(baselineRet.selected).toContain('TS-10');
        expect(baselineRet.selected).not.toContain('TS-01');
      }

      const snapshotBefore = engine.getCurrentSnapshot();
      const shaBefore = engine.getCurrentSnapshotSha256();

      // --- CLOCK 1 (Fast Clock): Record 3 recurring TS-01 (`missingTenantCheck`) failures ---
      const recordedHashes: string[] = [];
      for (const task of replayTargets) {
        const displacedHandler = synthesizeTsHandlerForTask(
          task,
          new Set(task.boundFacts.filter((f) => f !== 'TS-01'))
        );

        const trace = await engine.recordTrial(task, displacedHandler);
        expect(trace.committed).toBe(true);
        expect(trace.failedFacts).toEqual(['TS-01']);
        expect(trace.forensicFlags.missingTenantCheck).toBe(true);
        recordedHashes.push(trace.artifactSha256);
      }

      // Fast Clock must remain strictly read-only with respect to canonical snapshot
      expect(engine.getCurrentSnapshot()).toBe(snapshotBefore);
      expect(engine.getCurrentSnapshotSha256()).toBe(shaBefore);

      // --- CLOCK 2 (Intermediate Clock): Stage candidate edge (TS-10 -> TS-01) in QuarantineVault ---
      const flushRes = engine.flushToQuarantine({
        proposalBuilder: (cluster) => {
          if (cluster.factId === 'TS-01' && cluster.triggerFlag === 'missingTenantCheck') {
            return {
              candidateId: 'Q-TS-01',
              proposedPrerequisiteEdges: [{ from: 'TS-10', to: 'TS-01' }],
            };
          }
          return null;
        },
      });

      expect(flushRes.staged.length).toBe(1);
      const staged = engine.quarantineVault.getCandidate('Q-TS-01')!;
      expect(staged.status).toBe('staged');
      expect(staged.factId).toBe('TS-01');
      expect(staged.triggerFlag).toBe('missingTenantCheck');
      expect(staged.proposedPrerequisiteEdges).toEqual([{ from: 'TS-10', to: 'TS-01' }]);
      expect(staged.evidenceHashes).toEqual(recordedHashes);

      // Intermediate Clock must remain strictly read-only with respect to canonical snapshot
      expect(engine.getCurrentSnapshot()).toBe(snapshotBefore);
      expect(engine.getCurrentSnapshotSha256()).toBe(shaBefore);

      // --- CLOCK 3 (Slow Clock): Paired Canary Replay executing compiled TS handlers in node:vm ---
      const replayEvaluator: PairedCanaryEvaluator<TsApiSecurityTask> = async (
        task,
        snapshot: HopeMemorySnapshot
      ) => {
        const retrieval = retrieveWithPrerequisites(
          rankRulesForTask(task),
          budgetK,
          snapshot.prerequisiteGraph,
          new Set(task.applicableFacts)
        );
        const effectiveRules = new Set(task.boundFacts);
        if (!retrieval.selected.includes('TS-01')) {
          effectiveRules.delete('TS-01');
        }
        const handlerCode = synthesizeTsHandlerForTask(task, effectiveRules);
        const evalRes = await cartridge.evaluate(task, handlerCode);
        return {
          taskId: task.id,
          passed: evalRes.committed && evalRes.failedFacts.length === 0,
          failedFacts: evalRes.failedFacts,
        };
      };

      const promotion = await engine.runSlowClockPromotion(
        'Q-TS-01',
        {
          targetTasks: replayTargets,
          canaryTasks,
        },
        replayEvaluator,
        { evaluatedAt: '2026-11-22T12:00:00.000Z' }
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

      // Verify immutable SHA-256 promotion receipt & untouched prior snapshot
      const receipt = promotion.receipt!;
      expect(receipt.beforeSha256).toBe(shaBefore);
      expect(receipt.afterSha256).not.toBe(shaBefore);
      expect(receipt.afterSha256).toBe(engine.getCurrentSnapshotSha256());
      expect(receipt.addedPrerequisiteEdges).toEqual([{ from: 'TS-10', to: 'TS-01' }]);
      expect(receipt.evidenceHashes).toEqual(recordedHashes);
      expect(snapshotBefore.prerequisiteGraph).toEqual({});
      expect(engine.getCurrentSnapshot().prerequisiteGraph).toEqual({ 'TS-10': ['TS-01'] });
      expect(engine.quarantineVault.getCandidate('Q-TS-01')!.status).toBe('approved');

      // --- Final Retrieval Verification: TS-01 preserved within budget K=4 on ALL 5 payout routes ---
      for (const task of payoutTasks) {
        const ret = engine.retrieveRules(
          rankRulesForTask(task),
          budgetK,
          new Set(task.applicableFacts)
        );
        expect(ret.selected.length).toBe(budgetK);
        expect(new Set(ret.selected).size).toBe(budgetK);
        expect(ret.selected).toContain('TS-01');
        expect(ret.selected).toContain('TS-10');
        expect(ret.injectedPrerequisites).toContain('TS-01');
      }

      // --- Negative Gate 2 Verification: Circular edge TS-01 -> TS-10 is rejected cleanly ---
      engine.quarantineVault.stageCandidate({
        candidateId: 'Q-CYCLE-TS',
        factId: 'TS-01',
        triggerFlag: 'manualCycleTest',
        proposedRuleText: TS_API_SECURITY_CANONICAL_RULES[0].statement,
        proposedPrerequisiteEdges: [{ from: 'TS-01', to: 'TS-10' }],
        evidenceHashes: recordedHashes,
        observedCount: 3,
      });
      const cycleReject = await engine.runSlowClockPromotion(
        'Q-CYCLE-TS',
        { targetTasks: replayTargets, canaryTasks },
        replayEvaluator,
        { evaluatedAt: '2026-11-22T12:01:00.000Z' }
      );
      expect(cycleReject.status).toBe('rejected');
      expect(cycleReject.rejectedByGate).toBe('contradiction_linter');
      expect(cycleReject.gateAudit.contradictionLinter.violations[0].code).toBe(
        'CIRCULAR_PREREQUISITE_EDGE'
      );
      expect(engine.getCurrentSnapshotSha256()).toBe(receipt.afterSha256);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
