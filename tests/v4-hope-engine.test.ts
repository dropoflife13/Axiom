import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadReadOnlyMemorySnapshot,
  retrieveLessonsByFeatures,
} from '../src/memory.js';
import {
  PostgresV3Cartridge,
  type PostgresV3Task,
} from '../src/v4/cartridges/postgres-v3-adapter.js';
import {
  defaultExtractRequiredTokens,
  type CanonicalRule,
  type DomainCartridge,
} from '../src/v4/domain-cartridge.js';
import {
  AxiomHopeEngine,
  computeArtifactSha256,
  DeepMetaOptimizer,
  EpisodicRingBuffer,
  evaluateCrossRuleContradictions,
  evaluateLexicalIdentifierLock,
  QuarantineVault,
  type CanarySuite,
  type HopeMemorySnapshot,
  type PairedCanaryEvaluator,
  type QuarantineCandidate,
} from '../src/v4/hope/index.js';
import {
  DEFAULT_POSTGRES_PREREQUISITE_GRAPH,
  retrieveWithPrerequisites,
  type PrerequisiteGraph,
} from '../src/v4/prerequisite-retriever.js';

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function makeManualCandidate(
  overrides: Partial<QuarantineCandidate> & Pick<QuarantineCandidate, 'candidateId' | 'factId' | 'proposedRuleText'>
): QuarantineCandidate {
  const now = '2026-11-21T00:00:00.000Z';
  return {
    triggerFlag: 'manualTrigger',
    proposedPrerequisiteEdges: [],
    evidenceHashes: [
      computeArtifactSha256('artifact-1'),
      computeArtifactSha256('artifact-2'),
      computeArtifactSha256('artifact-3'),
    ],
    observedCount: 3,
    status: 'staged',
    gateAudit: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('v4 Axiom-HOPE 3-Clock Symbolic Engine (src/v4/hope/)', () => {
  describe('1. Fast Clock — EpisodicRingBuffer', () => {
    it('enforces fixed max capacity with FIFO eviction and preserves exact provenance records', () => {
      expect(() => new EpisodicRingBuffer(0)).toThrow(/positive integer/i);

      const ring = new EpisodicRingBuffer(3);
      const t1 = ring.record({
        taskId: 'T-1',
        cartridgeId: 'postgres-v3',
        artifactSha256: computeArtifactSha256('sql-1'),
        committed: false,
        failedFacts: ['F-05', 'F-05'],
        forensicFlags: { missingCreatedAtColumn: true, omittedSupersedesId: false },
        stderr: 'F-05 failed',
        timestamp: '2026-11-21T01:00:00.000Z',
      });
      ring.record({
        taskId: 'T-2',
        cartridgeId: 'postgres-v3',
        artifactSha256: computeArtifactSha256('sql-2'),
        committed: true,
        failedFacts: [],
        forensicFlags: { missingCreatedAtColumn: false },
        timestamp: '2026-11-21T01:01:00.000Z',
      });
      ring.record({
        taskId: 'T-3',
        cartridgeId: 'postgres-v3',
        artifactSha256: computeArtifactSha256('sql-3'),
        committed: false,
        failedFacts: ['F-05'],
        forensicFlags: { missingCreatedAtColumn: true },
        timestamp: '2026-11-21T01:02:00.000Z',
      });

      expect(ring.size).toBe(3);
      expect(ring.totalEvicted).toBe(0);
      expect(t1.failedFacts).toEqual(['F-05']); // deduplicated
      expect(Object.isFrozen(t1)).toBe(true);
      expect(Object.isFrozen(t1.failedFacts)).toBe(true);
      expect(Object.isFrozen(t1.forensicFlags)).toBe(true);

      // 4th insert evicts T-1 (FIFO)
      ring.record({
        taskId: 'T-4',
        cartridgeId: 'postgres-v3',
        artifactSha256: computeArtifactSha256('sql-4'),
        committed: false,
        failedFacts: ['F-05'],
        forensicFlags: { missingCreatedAtColumn: true },
        timestamp: '2026-11-21T01:03:00.000Z',
      });

      expect(ring.size).toBe(3);
      expect(ring.totalEvicted).toBe(1);
      expect(ring.getTraces().map((t) => t.taskId)).toEqual(['T-2', 'T-3', 'T-4']);
    });

    it('never mutates canonical rules or prerequisite graph when recording trials', async () => {
      const cartridge = new PostgresV3Cartridge({
        prerequisiteGraph: {},
        evaluator: () => ({
          pass: false,
          failedFacts: ['F-05'],
          details: 'F-05 missing created_at',
          migrationExitNonZero: false,
        }),
      });
      const engine = new AxiomHopeEngine({ cartridge, fastClockCapacity: 8 });
      const snapshotBefore = engine.getCurrentSnapshot();
      const shaBefore = engine.getCurrentSnapshotSha256();
      const task = cartridge.loadTasks()[0];

      await engine.recordTrial(
        task,
        `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
      );
      await engine.recordTrial(
        task,
        `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
      );

      expect(engine.fastClock.size).toBe(2);
      expect(engine.getCurrentSnapshot()).toBe(snapshotBefore);
      expect(engine.getCurrentSnapshotSha256()).toBe(shaBefore);
      expect(Object.isFrozen(snapshotBefore)).toBe(true);
      expect(Object.isFrozen(snapshotBefore.rules)).toBe(true);
      expect(Object.isFrozen(snapshotBefore.prerequisiteGraph)).toBe(true);
    });
  });

  describe('2. Intermediate Clock — QuarantineVault', () => {
    it('enforces minOccurrences threshold, deduplicates candidates, tracks SHA-256 provenance, and round-trips JSON deterministically', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-v4-quarantine-'));
      try {
        const statePath = path.join(tmpDir, 'quarantine-vault.json');
        const ring = new EpisodicRingBuffer(16);
        const vault = new QuarantineVault({ minOccurrences: 3, statePath });

        const hash1 = computeArtifactSha256('fail-sql-1');
        const hash2 = computeArtifactSha256('fail-sql-2');
        const hash3 = computeArtifactSha256('fail-sql-3');
        const hash4 = computeArtifactSha256('fail-sql-4');

        // Record only 2 failures -> strictly below minOccurrences=3
        ring.record({
          taskId: 'V3-H-001',
          cartridgeId: 'postgres-v3',
          artifactSha256: hash1,
          committed: true,
          failedFacts: ['F-05'],
          forensicFlags: { missingCreatedAtColumn: true },
          timestamp: '2026-11-21T02:00:00.000Z',
        });
        ring.record({
          taskId: 'V3-H-002',
          cartridgeId: 'postgres-v3',
          artifactSha256: hash2,
          committed: true,
          failedFacts: ['F-05'],
          forensicFlags: { missingCreatedAtColumn: true },
          timestamp: '2026-11-21T02:01:00.000Z',
        });

        const firstIngest = vault.ingestFromFastClock(ring);
        expect(firstIngest.staged.length).toBe(0);
        expect(firstIngest.skippedBelowThreshold).toBe(1);
        expect(vault.size).toBe(0);

        // 3rd failure meets threshold -> stages candidate with 3 SHA-256 provenance digests
        ring.record({
          taskId: 'V3-H-006',
          cartridgeId: 'postgres-v3',
          artifactSha256: hash3,
          committed: true,
          failedFacts: ['F-05'],
          forensicFlags: { missingCreatedAtColumn: true },
          timestamp: '2026-11-21T02:02:00.000Z',
        });

        const canonicalTexts = new Map<string, string>([
          ['F-05', 'Every table must include created_at timestamptz NOT NULL DEFAULT now().'],
        ]);

        const secondIngest = vault.ingestFromFastClock(ring, {
          canonicalRuleTexts: canonicalTexts,
          proposalBuilder: (cluster) => ({
            candidateId: 'Q-F-05',
            proposedPrerequisiteEdges: [{ from: 'F-36', to: cluster.factId }],
          }),
        });

        expect(secondIngest.staged.length).toBe(1);
        expect(secondIngest.updated.length).toBe(0);
        expect(vault.size).toBe(1);

        const staged = vault.getCandidate('Q-F-05')!;
        expect(staged.status).toBe('staged');
        expect(staged.factId).toBe('F-05');
        expect(staged.triggerFlag).toBe('missingCreatedAtColumn');
        expect(staged.evidenceHashes).toEqual([hash1, hash2, hash3]);
        expect(staged.proposedPrerequisiteEdges).toEqual([{ from: 'F-36', to: 'F-05' }]);
        expect(staged.gateAudit).toBeNull();

        // Re-flushing same ring buffer must deduplicate cleanly (no duplicate candidates or duplicate hashes)
        const idempotentIngest = vault.ingestFromFastClock(ring, {
          canonicalRuleTexts: canonicalTexts,
          proposalBuilder: (cluster) => ({
            candidateId: 'Q-F-05',
            proposedPrerequisiteEdges: [{ from: 'F-36', to: cluster.factId }],
          }),
        });
        expect(idempotentIngest.staged.length).toBe(0);
        expect(idempotentIngest.updated.length).toBe(1);
        expect(vault.size).toBe(1);
        expect(vault.getCandidate('Q-F-05')!.evidenceHashes).toEqual([hash1, hash2, hash3]);

        // 4th distinct failure appends only the new SHA-256 hash
        ring.record({
          taskId: 'V3-H-007',
          cartridgeId: 'postgres-v3',
          artifactSha256: hash4,
          committed: true,
          failedFacts: ['F-05'],
          forensicFlags: { missingCreatedAtColumn: true },
          timestamp: '2026-11-21T02:03:00.000Z',
        });
        vault.ingestFromFastClock(ring, {
          canonicalRuleTexts: canonicalTexts,
          proposalBuilder: (cluster) => ({
            candidateId: 'Q-F-05',
            proposedPrerequisiteEdges: [{ from: 'F-36', to: cluster.factId }],
          }),
        });
        expect(vault.size).toBe(1);
        expect(vault.getCandidate('Q-F-05')!.evidenceHashes).toEqual([hash1, hash2, hash3, hash4]);

        // Deterministic disk serialization & deserialization round-trip
        const savedDigest = vault.saveToDisk();
        const reloaded = QuarantineVault.loadFromDisk(statePath);
        expect(reloaded.computeSha256()).toBe(savedDigest);
        expect(reloaded.serialize()).toBe(vault.serialize());
        expect(reloaded.getCandidate('Q-F-05')!.evidenceHashes).toEqual([
          hash1,
          hash2,
          hash3,
          hash4,
        ]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('refuses to bind QuarantineVault statePath to frozen v2/v3 vault or checkpoint files', () => {
      expect(
        () => new QuarantineVault({ statePath: path.resolve('.axiom-state', 'memory.json') })
      ).toThrow(/frozen v2\/v3/i);
      expect(
        () => new QuarantineVault({ statePath: path.resolve('.axiom-state', 'memory-v3-cid.json') })
      ).toThrow(/frozen v2\/v3/i);
      expect(
        () => new QuarantineVault({ statePath: path.resolve('fixtures', 'task-v3', 'facts.json') })
      ).toThrow(/frozen v2\/v3/i);
    });
  });

  describe('3. Slow Clock — DeepMetaOptimizer 3 Sequential Deterministic Gates', () => {
    const cartridge = new PostgresV3Cartridge();
    const canonicalRuleSet = cartridge.loadCanonicalRules();
    const optimizer = new DeepMetaOptimizer();

    it('has zero false positives across all 34 active v3 canonical rules and default DAG', () => {
      const activeRules = canonicalRuleSet.rules.filter((r) => r.active);
      expect(activeRules.length).toBe(34);

      for (const rule of activeRules) {
        const identityCandidate = makeManualCandidate({
          candidateId: `ID-${rule.id}`,
          factId: rule.id,
          proposedRuleText: rule.statement,
        });
        const lockRes = evaluateLexicalIdentifierLock(
          identityCandidate,
          canonicalRuleSet.rules
        );
        expect(lockRes.passed, `Gate 1 false positive on ${rule.id}: ${lockRes.reason}`).toBe(true);
        expect(lockRes.retentionRate).toBe(1);

        const lintRes = evaluateCrossRuleContradictions(
          identityCandidate,
          canonicalRuleSet.rules,
          DEFAULT_POSTGRES_PREREQUISITE_GRAPH
        );
        expect(
          lintRes.passed,
          `Gate 2 false positive on ${rule.id}: ${JSON.stringify(lintRes.violations)}`
        ).toBe(true);
      }
    });

    it('Gate 1 FAIL: rejects a candidate that strips a required operational identifier (Lexical Lock)', async () => {
      // Strip `created_at` and `now()` from F-05
      const erodedCandidate = makeManualCandidate({
        candidateId: 'Q-ERODED-F-05',
        factId: 'F-05',
        proposedRuleText: 'Every table must include an audit timestamp column with timestamptz NOT NULL.',
      });

      let canaryEvaluatorCalled = false;
      const neverCalledEvaluator: PairedCanaryEvaluator<{ id: string }> = () => {
        canaryEvaluatorCalled = true;
        return { taskId: 'X', passed: true };
      };

      const res = await optimizer.evaluateCandidate(
        erodedCandidate,
        canonicalRuleSet.rules,
        {},
        { targetTasks: [{ id: 'T1' }], canaryTasks: [{ id: 'C1' }] },
        neverCalledEvaluator
      );

      expect(res.status).toBe('rejected');
      expect(res.rejectedByGate).toBe('lexical_lock');
      expect(res.gateAudit.lexicalLock.executed).toBe(true);
      expect(res.gateAudit.lexicalLock.passed).toBe(false);
      expect(res.gateAudit.lexicalLock.missingTokens).toContain('created_at');
      expect(res.gateAudit.lexicalLock.missingTokens).toContain('now()');
      // Sequential fail-fast: Gate 2 and Gate 3 must not execute
      expect(res.gateAudit.contradictionLinter.executed).toBe(false);
      expect(res.gateAudit.canaryReplay.executed).toBe(false);
      expect(canaryEvaluatorCalled).toBe(false);
      expect(res.nextSnapshot).toBeUndefined();
      expect(res.receipt).toBeUndefined();
    });

    it('Gate 2 FAIL: rejects inline REFERENCES, duplicate PK, user_metadata scoping, and circular prerequisite edges', async () => {
      let replayInvocations = 0;
      const noopEvaluator: PairedCanaryEvaluator<{ id: string }> = (task) => {
        replayInvocations++;
        return { taskId: task.id, passed: true };
      };
      const suite: CanarySuite<{ id: string }> = {
        targetTasks: [{ id: 'T1' }],
        canaryTasks: [{ id: 'C1' }],
      };

      // 2a. Inline supersedes_id REFERENCES contradiction (keeps F-36 tokens so Gate 1 passes, triggers Gate 2)
      const f36Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-36')!;
      const inlineRefCandidate = makeManualCandidate({
        candidateId: 'Q-BAD-INLINE-FK',
        factId: 'F-36',
        proposedRuleText: f36Rule.statement.replace(
          '(never an inline REFERENCES clause)',
          'and also use an inline REFERENCES clause like supersedes_id uuid NULL REFERENCES public.<table>(id)'
        ),
      });
      const resInline = await optimizer.evaluateCandidate(
        inlineRefCandidate,
        canonicalRuleSet.rules,
        {},
        suite,
        noopEvaluator
      );
      expect(resInline.status).toBe('rejected');
      expect(resInline.rejectedByGate).toBe('contradiction_linter');
      expect(resInline.gateAudit.lexicalLock.passed).toBe(true);
      expect(resInline.gateAudit.contradictionLinter.violations.map((v) => v.code)).toContain(
        'INLINE_REFERENCES_CONTRADICTION'
      );
      expect(resInline.gateAudit.canaryReplay.executed).toBe(false);

      // 2b. Duplicate PRIMARY KEY contradiction on F-01
      const f01Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-01')!;
      const dupPkCandidate = makeManualCandidate({
        candidateId: 'Q-BAD-DUP-PK',
        factId: 'F-01',
        proposedRuleText: f01Rule.statement.replace(
          '(do not combine an inline PRIMARY KEY with a second table-level PRIMARY KEY constraint)',
          'and also add a table-level PRIMARY KEY constraint alongside inline PRIMARY KEY'
        ),
      });
      const resDupPk = await optimizer.evaluateCandidate(
        dupPkCandidate,
        canonicalRuleSet.rules,
        {},
        suite,
        noopEvaluator
      );
      expect(resDupPk.status).toBe('rejected');
      expect(resDupPk.rejectedByGate).toBe('contradiction_linter');
      expect(resDupPk.gateAudit.contradictionLinter.violations.map((v) => v.code)).toContain(
        'DUPLICATE_PRIMARY_KEY_CONTRADICTION'
      );

      // 2c. user_metadata positive scoping contradiction on F-26
      const f26Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-26')!;
      const userMetaCandidate = makeManualCandidate({
        candidateId: 'Q-BAD-USER-META',
        factId: 'F-26',
        proposedRuleText: f26Rule.statement.replace(
          'and grant zero access to user_metadata.tenant_id',
          'or user_metadata.tenant_id for convenience'
        ),
      });
      const resUserMeta = await optimizer.evaluateCandidate(
        userMetaCandidate,
        canonicalRuleSet.rules,
        {},
        suite,
        noopEvaluator
      );
      expect(resUserMeta.status).toBe('rejected');
      expect(resUserMeta.rejectedByGate).toBe('contradiction_linter');
      expect(resUserMeta.gateAudit.contradictionLinter.violations.map((v) => v.code)).toContain(
        'USER_METADATA_AUTH_CONTRADICTION'
      );

      // 2c-bis. F-19 REVOKE without positive GRANT contradiction
      const f19Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-19')!;
      const missingGrantCandidate = makeManualCandidate({
        candidateId: 'Q-BAD-F19-GRANT',
        factId: 'F-19',
        proposedRuleText: f19Rule.statement
          .replace('GRANT SELECT ON TABLE public.<table> TO readonly_user and ', 'allow readonly_user and ')
          .replace('GRANT SELECT, INSERT ON TABLE public.<table> TO application', 'allow application (GRANT SELECT)'),
      });
      // Directly verify Gate 2 linter flags MISSING_POSITIVE_GRANT_CONTRADICTION
      const f19Lint = evaluateCrossRuleContradictions(
        missingGrantCandidate,
        canonicalRuleSet.rules,
        {}
      );
      expect(f19Lint.passed).toBe(false);
      expect(f19Lint.violations.map((v) => v.code)).toContain(
        'MISSING_POSITIVE_GRANT_CONTRADICTION'
      );

      // 2d. Circular prerequisite edge (F-36 -> F-05 already exists; adding F-05 -> F-36 creates 2-cycle)
      const f05Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-05')!;
      const cycleCandidate = makeManualCandidate({
        candidateId: 'Q-CYCLE',
        factId: 'F-05',
        proposedRuleText: f05Rule.statement,
        proposedPrerequisiteEdges: [{ from: 'F-05', to: 'F-36' }],
      });
      const initialGraph: PrerequisiteGraph = { 'F-36': ['F-05'] };
      const resCycle = await optimizer.evaluateCandidate(
        cycleCandidate,
        canonicalRuleSet.rules,
        initialGraph,
        suite,
        noopEvaluator
      );
      expect(resCycle.status).toBe('rejected');
      expect(resCycle.rejectedByGate).toBe('contradiction_linter');
      const cycleViolation = resCycle.gateAudit.contradictionLinter.violations.find(
        (v) => v.code === 'CIRCULAR_PREREQUISITE_EDGE'
      );
      expect(cycleViolation).toBeDefined();
      expect(cycleViolation!.cyclePath).toEqual(['F-05', 'F-36', 'F-05']);

      // 2e. Self-loop prerequisite edge (F-05 -> F-05)
      const selfLoopCandidate = makeManualCandidate({
        candidateId: 'Q-SELFLOOP',
        factId: 'F-05',
        proposedRuleText: f05Rule.statement,
        proposedPrerequisiteEdges: [{ from: 'F-05', to: 'F-05' }],
      });
      const resSelfLoop = await optimizer.evaluateCandidate(
        selfLoopCandidate,
        canonicalRuleSet.rules,
        {},
        suite,
        noopEvaluator
      );
      expect(resSelfLoop.status).toBe('rejected');
      expect(resSelfLoop.rejectedByGate).toBe('contradiction_linter');
      expect(resSelfLoop.gateAudit.contradictionLinter.violations[0].code).toBe(
        'CIRCULAR_PREREQUISITE_EDGE'
      );
      expect(replayInvocations).toBe(0);
    });

    it('Gate 3 FAIL: rejects a candidate that improves targets but causes even 1 canary regression', async () => {
      const f05Rule = canonicalRuleSet.rules.find((r) => r.id === 'F-05')!;
      const candidate = makeManualCandidate({
        candidateId: 'Q-REGRESSING',
        factId: 'F-05',
        proposedRuleText: f05Rule.statement,
        proposedPrerequisiteEdges: [{ from: 'F-36', to: 'F-05' }],
      });

      const suite: CanarySuite<{ id: string; kind: 'target' | 'canary' }> = {
        targetTasks: [
          { id: 'T-1', kind: 'target' },
          { id: 'T-2', kind: 'target' },
          { id: 'T-3', kind: 'target' },
        ],
        canaryTasks: [
          { id: 'C-1', kind: 'canary' },
          { id: 'C-2', kind: 'canary' },
        ],
      };

      const regressingEvaluator: PairedCanaryEvaluator<{ id: string; kind: 'target' | 'canary' }> = (
        task,
        snapshot
      ) => {
        const hasNewEdge = (snapshot.prerequisiteGraph['F-36'] ?? []).includes('F-05');
        if (task.kind === 'target') {
          // Huge improvement on all 3 target tasks (0/3 -> 3/3)
          return { taskId: task.id, passed: hasNewEdge };
        }
        // Single regression on canary C-2!
        if (task.id === 'C-2') {
          return { taskId: task.id, passed: !hasNewEdge };
        }
        return { taskId: task.id, passed: true };
      };

      const res = await optimizer.evaluateCandidate(
        candidate,
        canonicalRuleSet.rules,
        {},
        suite,
        regressingEvaluator
      );

      expect(res.status).toBe('rejected');
      expect(res.rejectedByGate).toBe('canary_replay');
      expect(res.gateAudit.lexicalLock.passed).toBe(true);
      expect(res.gateAudit.contradictionLinter.passed).toBe(true);
      expect(res.gateAudit.canaryReplay.executed).toBe(true);
      expect(res.gateAudit.canaryReplay.passed).toBe(false);
      expect(res.gateAudit.canaryReplay.targetCohortDelta).toBe(1);
      expect(res.gateAudit.canaryReplay.canaryRegressions).toBe(1);
      expect(res.gateAudit.canaryReplay.regressedCanaryTaskIds).toEqual(['C-2']);
      expect(res.nextSnapshot).toBeUndefined();
      expect(res.receipt).toBeUndefined();
    });
  });

  describe('4. End-to-End Happy Path on PostgresV3Cartridge (3-Clock Full Loop)', () => {
    it('replays synthetic F-05 failures -> stages Q-F-05 (F-36 -> F-05) -> passes all 3 Slow Clock gates -> promotes immutably -> eliminates F-05 displacement', async () => {
      // Verify frozen v3 vaults are untouched before & after the full loop
      const tasksPath = path.resolve('fixtures', 'task-v3', 'tasks.json');
      const factsPath = path.resolve('fixtures', 'task-v3', 'facts.json');
      const memCidPath = path.resolve('.axiom-state', 'memory-v3-cid.json');
      const tasksShaBefore = sha256File(tasksPath);
      const factsShaBefore = sha256File(factsPath);
      const memCidShaBefore = sha256File(memCidPath);

      const { memory } = loadReadOnlyMemorySnapshot(memCidPath);

      // Offline deterministic mock evaluator (no Docker, $0 API cost)
      const cartridge = new PostgresV3Cartridge({
        prerequisiteGraph: {}, // Start with empty graph (v3 baseline displacement)
        evaluator: (sql, meta) => {
          const hasCreatedAt = /\bcreated_at\s+timestamptz\b/i.test(sql);
          const failedFacts = hasCreatedAt ? [] : ['F-05'];
          return {
            pass: failedFacts.length === 0,
            failedFacts,
            details:
              failedFacts.length === 0
                ? `All bound invariants passed on ${meta.table}.`
                : `F-05 failed on ${meta.table}: missing created_at timestamptz NOT NULL DEFAULT now().`,
            failureDetails:
              failedFacts.length === 0
                ? []
                : [`F-05: column "created_at" missing on public.${meta.table}`],
            migrationExitNonZero: false,
          };
        },
      });

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-v4-hope-e2e-'));
      try {
        const engine = new AxiomHopeEngine<PostgresV3Task, string>({
          cartridge,
          fastClockCapacity: 64,
          minOccurrences: 3,
          quarantineStatePath: path.join(tmpDir, 'quarantine-vault.json'),
          initialPrerequisiteGraph: {},
        });

        const allTasks = cartridge.loadTasks();
        // Target cohort: C1_TTT append-only multi-tenant ingestion tasks where F-05 is bound & displaced
        const c1TargetTasks = allTasks.filter(
          (t) => t.cohortId === 'C1_TTT' && t.boundFacts.includes('F-05')
        );
        expect(c1TargetTasks.length).toBeGreaterThanOrEqual(3);
        const replayTargets = c1TargetTasks.slice(0, 3); // V3-H-001, V3-H-002, V3-H-006

        // Frozen regression guard cohort: C8_FFF baseline tasks that already pass F-05
        const canaryTasks = allTasks
          .filter((t) => t.cohortId === 'C8_FFF' && t.boundFacts.includes('F-05'))
          .slice(0, 3);
        expect(canaryTasks.length).toBe(3);

        const rankForTask = (task: PostgresV3Task): string[] =>
          retrieveLessonsByFeatures(
            task.features,
            [...memory],
            memory.length,
            [...task.applicableFacts],
            true
          ).map((l) => l.factId ?? l.errorCode);

        // Confirm baseline displacement BEFORE Axiom-HOPE promotion
        for (const task of replayTargets) {
          const baselineRet = engine.retrieveRules(
            rankForTask(task),
            10,
            new Set(task.applicableFacts)
          );
          expect(baselineRet.selected).toContain('F-36');
          expect(baselineRet.selected).not.toContain('F-05');
        }

        const initialSnapshot = engine.getCurrentSnapshot();
        const initialSha = engine.getCurrentSnapshotSha256();

        // --- CLOCK 1 (Fast Clock): Replay 3 synthetic F-05 (`missingCreatedAtColumn`) failures ---
        const recordedHashes: string[] = [];
        for (const task of replayTargets) {
          const failingSql = [
            `CREATE TABLE public.${task.table} (`,
            `  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),`,
            `  tenant_id uuid NOT NULL,`,
            `  supersedes_id uuid NULL,`,
            `  CONSTRAINT fk_${task.table}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${task.table}(id) ON DELETE RESTRICT`,
            `);`,
          ].join('\n');

          const trace = await engine.recordTrial(task, failingSql);
          expect(trace.failedFacts).toEqual(['F-05']);
          expect(trace.forensicFlags.missingCreatedAtColumn).toBe(true);
          recordedHashes.push(trace.artifactSha256);
        }

        // Fast Clock MUST NOT mutate canonical rules or prerequisite graph
        expect(engine.getCurrentSnapshot()).toBe(initialSnapshot);
        expect(engine.getCurrentSnapshotSha256()).toBe(initialSha);

        // --- CLOCK 2 (Intermediate Clock): Flush recurring cluster to Quarantine Vault ---
        const flushResult = engine.flushToQuarantine({
          proposalBuilder: (cluster) => {
            if (cluster.factId === 'F-05' && cluster.triggerFlag === 'missingCreatedAtColumn') {
              return {
                candidateId: 'Q-F-05',
                proposedPrerequisiteEdges: [{ from: 'F-36', to: 'F-05' }],
              };
            }
            return null;
          },
        });

        expect(flushResult.staged.length).toBe(1);
        const stagedCandidate = engine.quarantineVault.getCandidate('Q-F-05')!;
        expect(stagedCandidate.status).toBe('staged');
        expect(stagedCandidate.factId).toBe('F-05');
        expect(stagedCandidate.triggerFlag).toBe('missingCreatedAtColumn');
        expect(stagedCandidate.proposedPrerequisiteEdges).toEqual([
          { from: 'F-36', to: 'F-05' },
        ]);
        expect(stagedCandidate.evidenceHashes).toEqual(recordedHashes);

        // Intermediate Clock MUST NOT mutate canonical rules or prerequisite graph
        expect(engine.getCurrentSnapshot()).toBe(initialSnapshot);
        expect(engine.getCurrentSnapshotSha256()).toBe(initialSha);

        // --- CLOCK 3 (Slow Clock): Run all 3 Deterministic Promotion Gates ---
        // Deterministic replay evaluator: retrieves Top-10 rules under `snapshot.prerequisiteGraph`,
        // synthesizes deterministic SQL reflecting whether `F-05` was retrieved in Top-10,
        // and evaluates via the cartridge's deterministic oracle.
        const replayEvaluator: PairedCanaryEvaluator<PostgresV3Task> = (
          task,
          snapshot: HopeMemorySnapshot
        ) => {
          const retrieval = retrieveWithPrerequisites(
            rankForTask(task),
            10,
            snapshot.prerequisiteGraph,
            new Set(task.applicableFacts)
          );
          const includesF05 = retrieval.selected.includes('F-05');
          const synthesizedSql = includesF05
            ? `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());`
            : `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`;

          const oracleRes = cartridge.evaluate(task, synthesizedSql);
          return {
            taskId: task.id,
            passed: oracleRes.committed && oracleRes.failedFacts.length === 0,
            failedFacts: oracleRes.failedFacts,
          };
        };

        const promotionResult = await engine.runSlowClockPromotion(
          'Q-F-05',
          {
            targetTasks: replayTargets,
            canaryTasks,
          },
          replayEvaluator,
          { evaluatedAt: '2026-11-21T03:00:00.000Z' }
        );

        expect(promotionResult.status).toBe('approved');
        expect(promotionResult.rejectedByGate).toBeNull();
        expect(promotionResult.gateAudit.lexicalLock.passed).toBe(true);
        expect(promotionResult.gateAudit.lexicalLock.retentionRate).toBe(1);
        expect(promotionResult.gateAudit.contradictionLinter.passed).toBe(true);
        expect(promotionResult.gateAudit.contradictionLinter.violations).toEqual([]);
        expect(promotionResult.gateAudit.canaryReplay.passed).toBe(true);
        expect(promotionResult.gateAudit.canaryReplay.targetBeforePassCount).toBe(0);
        expect(promotionResult.gateAudit.canaryReplay.targetAfterPassCount).toBe(3);
        expect(promotionResult.gateAudit.canaryReplay.targetCohortDelta).toBe(1);
        expect(promotionResult.gateAudit.canaryReplay.canaryBeforePassCount).toBe(3);
        expect(promotionResult.gateAudit.canaryReplay.canaryAfterPassCount).toBe(3);
        expect(promotionResult.gateAudit.canaryReplay.canaryRegressions).toBe(0);

        // Cryptographic PromotionReceipt & strict immutability of prior snapshot
        const receipt = promotionResult.receipt!;
        expect(receipt.candidateId).toBe('Q-F-05');
        expect(receipt.beforeSha256).toBe(initialSha);
        expect(receipt.afterSha256).not.toBe(initialSha);
        expect(receipt.afterSha256).toBe(engine.getCurrentSnapshotSha256());
        expect(receipt.addedPrerequisiteEdges).toEqual([{ from: 'F-36', to: 'F-05' }]);
        expect(receipt.evidenceHashes).toEqual(recordedHashes);
        expect(engine.getPromotionReceipts().length).toBe(1);

        // Prior snapshot reference was NEVER mutated in place
        expect(initialSnapshot.prerequisiteGraph).toEqual({});
        expect(engine.getCurrentSnapshot().prerequisiteGraph).toEqual({ 'F-36': ['F-05'] });
        expect(engine.quarantineVault.getCandidate('Q-F-05')!.status).toBe('approved');

        // Persist vault cleanly into isolated temp dir (never touching v3 state)
        engine.quarantineVault.saveToDisk();
        expect(fs.existsSync(path.join(tmpDir, 'quarantine-vault.json'))).toBe(true);

        // --- Final Retrieval Verification: 0 F-05 displacements across all C1_TTT & append-only F-05 tasks ---
        const appendOnlyTasks = allTasks.filter((t) => Boolean(t.features.append_only));
        expect(appendOnlyTasks.length).toBe(60);

        let f05DisplacementsAfterPromotion = 0;
        for (const task of appendOnlyTasks) {
          const ret = retrieveWithPrerequisites(
            rankForTask(task),
            10,
            engine.getCurrentSnapshot().prerequisiteGraph,
            new Set(task.applicableFacts)
          );
          expect(ret.selected.length).toBe(10);
          expect(new Set(ret.selected).size).toBe(10);
          if (!ret.selected.includes('F-05')) {
            f05DisplacementsAfterPromotion++;
          }
        }
        expect(f05DisplacementsAfterPromotion).toBe(0);

        // Verify frozen v3 vault digests remain 100% unchanged
        expect(sha256File(tasksPath)).toBe(tasksShaBefore);
        expect(sha256File(factsPath)).toBe(factsShaBefore);
        expect(sha256File(memCidPath)).toBe(memCidShaBefore);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('operates identically on a non-SQL DomainCartridge (Policy-as-Code / TypeScript AST proof of domain-agnosticism)', async () => {
      interface PolicyTask {
        readonly id: string;
        readonly isTarget: boolean;
      }

      const policyRules: CanonicalRule[] = [
        {
          id: 'POL-01',
          statement: "Every IAM policy must enforce 'DenyInsecureTransport' with condition aws_secure_transport.",
          active: true,
        },
        {
          id: 'POL-02',
          statement: "Every S3 bucket policy must require server_side_encryption using 'AES256'.",
          active: true,
        },
      ];

      const policyCartridge: DomainCartridge<PolicyTask, string> = {
        id: 'iam-policy-v1',
        name: 'IAM Policy-as-Code Cartridge',
        version: '0.1.0',
        loadTasks: () => [
          { id: 'P-T1', isTarget: true },
          { id: 'P-T2', isTarget: true },
          { id: 'P-T3', isTarget: true },
          { id: 'P-C1', isTarget: false },
        ],
        loadCanonicalRules: () => ({
          version: '0.1.0',
          rules: policyRules,
          prerequisiteGraph: {},
        }),
        extractRequiredTokens: defaultExtractRequiredTokens,
        evaluate: (_task, artifact) => {
          const ok = artifact.includes('aws_secure_transport');
          return {
            committed: true,
            boundFacts: ['POL-01', 'POL-02'],
            passedFacts: ok ? ['POL-01', 'POL-02'] : ['POL-02'],
            failedFacts: ok ? [] : ['POL-01'],
          };
        },
        classifyForensics: (_task, artifact) => ({
          missingSecureTransport: !artifact.includes('aws_secure_transport'),
        }),
      };

      const engine = new AxiomHopeEngine({
        cartridge: policyCartridge,
        minOccurrences: 3,
      });

      const tasks = policyCartridge.loadTasks();
      const targets = tasks.filter((t) => t.isTarget);
      const canaries = tasks.filter((t) => !t.isTarget);

      for (const t of targets) {
        await engine.recordTrial(t, `{"task":"${t.id}","encryption":"AES256"}`);
      }

      const flushed = engine.flushToQuarantine({
        proposalBuilder: (cluster) => ({
          candidateId: 'Q-POL-01',
          proposedPrerequisiteEdges: [{ from: 'POL-02', to: cluster.factId }],
        }),
      });
      expect(flushed.staged.length).toBe(1);

      const promo = await engine.runSlowClockPromotion(
        'Q-POL-01',
        { targetTasks: targets, canaryTasks: canaries },
        (task, snapshot) => {
          if (!task.isTarget) {
            return { taskId: task.id, passed: true };
          }
          const ret = retrieveWithPrerequisites(
            ['POL-02', 'POL-X', 'POL-01'],
            2,
            snapshot.prerequisiteGraph
          );
          return {
            taskId: task.id,
            passed: ret.selected.includes('POL-01'),
          };
        }
      );

      expect(promo.status).toBe('approved');
      expect(engine.getCurrentSnapshot().prerequisiteGraph).toEqual({
        'POL-02': ['POL-01'],
      });
    });
  });
});
