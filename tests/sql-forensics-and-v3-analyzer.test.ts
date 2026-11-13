import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  classifySqlForensics,
  stripSqlComments,
  summarizeForensicsByCondition,
} from '../src/verifier/sql-forensics.js';
import {
  lintFactsFile,
  lintRuleContradictions,
} from '../scripts/v3/lint-rule-contradictions.js';
import {
  analyzeAblationV3Trials,
  REQUIRED_PROVENANCE_HASHES,
} from '../scripts/v3/analyze-ablation-v3.js';
import {
  V3_CONDITIONS,
  type ConditionV3Id,
  type RunMetadataV3,
  type TrialV3,
} from '../src/eval/ablation-v3.js';
import {
  buildMemoryAuditRequest,
  buildOracleVsJudgeRequest,
  evaluateDecision1VsOracle,
} from '../scripts/v3/audit-decision1-judge.js';
import type { TaskV2Item } from '../src/eval/ablation.js';

describe('Step 1: classifySqlForensics', () => {
  const appendOnlyTask = {
    table: 'audit_events',
    features: { tenant: true, append_only: true, ingestion: false },
  };
  const mutableTask = {
    table: 'invoices',
    features: { tenant: true, append_only: false, ingestion: false },
  };

  it('strips -- and /* ... */ comments while preserving string literals', () => {
    const sql = `
      -- user_metadata public.auth.jwt()
      /* PRIMARY KEY CONSTRAINT public.bad */
      CREATE TABLE public.audit_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        note text DEFAULT '-- not a comment',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    const stripped = stripSqlComments(sql);
    expect(stripped).not.toContain('user_metadata');
    expect(stripped).not.toContain('public.auth.jwt()');
    expect(stripped).toContain("'-- not a comment'");
  });

  it('detects all 10 forensic mechanisms accurately on buggy vs clean SQL', () => {
    const cleanAppendOnly = `
      CREATE TABLE public.audit_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        supersedes_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT fk_audit_events_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.audit_events(id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_audit_events_tenant_id_created_at ON public.audit_events (tenant_id, created_at DESC);
      CREATE POLICY audit_events_tenant_isolation ON public.audit_events
        USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
      REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM PUBLIC, application, readonly_user;
      GRANT SELECT ON TABLE public.audit_events TO readonly_user;
      GRANT SELECT, INSERT ON TABLE public.audit_events TO application;
    `;
    const cleanFlags = classifySqlForensics(cleanAppendOnly, appendOnlyTask);
    expect(cleanFlags).toEqual({
      hasInlineSupersedesFk: false,
      hasExplicitSupersedesFk: true,
      hasDuplicatePrimaryKey: false,
      hasPublicAuthJwt: false,
      hasPublicConstraintQualifier: false,
      hasHallucinatedLineageCol: false,
      hasUserMetadataLeak: false,
      hasSingularCompositeIndexName: false,
      hasRevokeWithoutPositiveGrant: false,
      missingCreatedAtColumn: false,
      missingDeletedAtOnMutable: false,
    });

    const buggyAppendOnly = `
      CREATE TABLE public.audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        supersedes_id uuid REFERENCES public.audit_events(id),
        CONSTRAINT public.fk_bad CHECK (tenant_id IS NOT NULL),
        PRIMARY KEY (id)
      );
      CREATE INDEX idx_audit_events_tenant_id ON public.audit_events (tenant_id, created_at DESC);
      CREATE POLICY p_bad ON public.audit_events
        USING (tenant_id = (public.auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
      REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM PUBLIC, application, readonly_user;
    `;
    const buggyFlags = classifySqlForensics(buggyAppendOnly, appendOnlyTask);
    expect(buggyFlags.hasInlineSupersedesFk).toBe(true);
    expect(buggyFlags.hasExplicitSupersedesFk).toBe(false);
    expect(buggyFlags.hasDuplicatePrimaryKey).toBe(true);
    expect(buggyFlags.hasPublicAuthJwt).toBe(true);
    expect(buggyFlags.hasPublicConstraintQualifier).toBe(true);
    expect(buggyFlags.hasUserMetadataLeak).toBe(true);
    expect(buggyFlags.hasSingularCompositeIndexName).toBe(true);
    expect(buggyFlags.hasRevokeWithoutPositiveGrant).toBe(true);
    expect(buggyFlags.missingCreatedAtColumn).toBe(true);
    expect(buggyFlags.missingDeletedAtOnMutable).toBe(false);
  });

  it('detects hallucinated lineage columns on append_only and missing deleted_at on mutable', () => {
    const erodedAppendOnly = `
      CREATE TABLE public.audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        previous_id uuid NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `;
    const erodedFlags = classifySqlForensics(erodedAppendOnly, appendOnlyTask);
    expect(erodedFlags.hasHallucinatedLineageCol).toBe(true);
    // created_at exists (wrong type timestamp, not omitted)
    expect(erodedFlags.missingCreatedAtColumn).toBe(false);

    const mutableMissingDeleted = `
      CREATE TABLE public.invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    const mutableFlags = classifySqlForensics(mutableMissingDeleted, mutableTask);
    expect(mutableFlags.missingDeletedAtOnMutable).toBe(true);
  });

  it('summarizes forensic rates by condition', () => {
    const summary = summarizeForensicsByCondition([
      {
        condition: 'A',
        taskId: 'V3-H-001',
        table: 'audit_events',
        features: appendOnlyTask.features,
        sanitizedSql: 'CREATE TABLE public.audit_events (id uuid PRIMARY KEY, supersedes_id uuid REFERENCES public.audit_events(id));',
      },
      {
        condition: 'A',
        taskId: 'V3-H-002',
        table: 'audit_events',
        features: appendOnlyTask.features,
        sanitizedSql: 'CREATE TABLE public.audit_events (id uuid PRIMARY KEY, created_at timestamptz);',
      },
    ]);
    expect(summary.A.n).toBe(2);
    expect(summary.A.counts.hasInlineSupersedesFk).toBe(1);
    expect(summary.A.rates.hasInlineSupersedesFk).toBeCloseTo(0.5, 6);
  });
});

describe('Step 2: lint-rule-contradictions', () => {
  it('passes with zero errors on v3 facts.json, memory-v3-cid.json, and d-safe-tips.ts', () => {
    const report = lintRuleContradictions();
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('flags known F-36, F-18, F-19, and F-01 ambiguities in fixtures/task-v2/facts.json', () => {
    const v2Issues = lintFactsFile(path.resolve('fixtures', 'task-v2', 'facts.json'));
    const ruleIds = new Set(v2Issues.map((i) => i.ruleId));
    expect(ruleIds.has('F-36')).toBe(true);
    expect(ruleIds.has('F-18')).toBe(true);
    expect(ruleIds.has('F-19')).toBe(true);
    expect(ruleIds.has('F-01')).toBe(true);
  });
});

describe('Step 3: analyze-ablation-v3', () => {
  it('computes all confirmatory metrics, Holm-Bonferroni, recovery ratio, and REML LPMM on a synthetic 960-trial dataset', () => {
    const cellCombos = [
      { tenant: true, append_only: true, ingestion: true },
      { tenant: true, append_only: true, ingestion: false },
      { tenant: true, append_only: false, ingestion: true },
      { tenant: true, append_only: false, ingestion: false },
      { tenant: false, append_only: true, ingestion: true },
      { tenant: false, append_only: true, ingestion: false },
      { tenant: false, append_only: false, ingestion: true },
      { tenant: false, append_only: false, ingestion: false },
    ];

    const tasks: TaskV2Item[] = [];
    const trials: TrialV3[] = [];
    const condScoreOffset: Record<ConditionV3Id, number> = {
      A: 0.35,
      D_safe: 0.37,
      C: 0.55,
      C0: 0.65,
      C_ID: 0.78,
      C0_rand: 0.50,
      C0_clean: 0.85,
      B: 0.90,
    };

    for (let i = 0; i < 120; i++) {
      const taskId = `V3-H-${String(i + 1).padStart(3, '0')}`;
      const features = cellCombos[i % 8];
      const boundFacts = features.append_only
        ? ['F-01', 'F-05', 'F-16', 'F-19', 'F-36']
        : ['F-01', 'F-05', 'F-10', 'F-18', 'F-24'];
      tasks.push({
        id: taskId,
        split: 'test',
        cohortId: `C${(i % 8) + 1}`,
        table: `items_${i + 1}s`,
        features,
        prompt: `Create table items_${i + 1}s`,
        goldenSql: `CREATE TABLE public.items_${i + 1}s (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());`,
        boundFacts,
      });

      for (const cond of V3_CONDITIONS) {
        const threshold = condScoreOffset[cond];
        const failedFacts = boundFacts.filter((_, fIdx) => (fIdx + (i % 3)) / 7 > threshold);
        const boundFactFraction = (boundFacts.length - failedFacts.length) / boundFacts.length;
        trials.push({
          condition: cond,
          taskId,
          generationStatus: 'ok',
          generatedSql: `CREATE TABLE public.items_${i + 1}s (id uuid PRIMARY KEY, created_at timestamptz);`,
          rawResponse: '',
          rawSha256: '0'.repeat(64),
          sanitizedSql: `CREATE TABLE public.items_${i + 1}s (id uuid PRIMARY KEY, created_at timestamptz);`,
          sanitizedSha256: '0'.repeat(64),
          passRaw: failedFacts.length === 0,
          passWithTier0: failedFacts.length === 0,
          boundFacts,
          boundPassed: failedFacts.length === 0,
          boundFactFraction,
          failedFacts,
          retrievedFactIds: ['F-01', 'F-16', 'F-19', 'F-36'],
          promptTokens: cond === 'B' ? 1800 : cond === 'A' ? 300 : 600,
          totalTokens: cond === 'B' ? 2200 : 900,
          provider: 'test',
          baseUrl: 'https://example.test',
          requestedModel: 'test-model',
          returnedModel: 'test-model',
          oracleCommit: '15ef611',
          oracleSha256: 'deadbeef',
          tasksSha256: 'deadbeef',
          factsSha256: 'deadbeef',
          memorySha256: 'deadbeef',
          hintSha256: 'deadbeef',
          executorSha256: 'deadbeef',
          tableMissing: false,
          migrationExitNonZero: false,
        } as unknown as TrialV3);
      }
    }

    const metadata = Object.fromEntries(
      REQUIRED_PROVENANCE_HASHES.map((k) => [k, 'deadbeef'])
    ) as Partial<RunMetadataV3>;

    const report = analyzeAblationV3Trials(trials, { metadata, tasks, allowPartial: false });
    expect(report.totalTrials).toBe(960);
    expect(report.provenanceVerified).toBe(true);
    expect(report.primaryContrasts).toHaveLength(6);
    expect(report.referenceContrasts).toHaveLength(3);
    expect(report.primaryContrasts[0].name).toBe('C_ID_vs_C');
    expect(report.primaryContrasts[0].holmAdjustedPValue).toBeTypeOf('number');
    expect(report.distillationGapRecovery.overall.recoveryRatio).not.toBeNull();
    expect(report.cleanIntersectionSensitivity.postTreatmentConditioned).toBe(true);
    expect(report.mixedModel).not.toBeNull();
    expect(report.mixedModel!.nTasks).toBe(120);
    expect(report.mixedModel!.contrastsPts).toHaveLength(9);
  });

  it('executes cleanly with --allow-partial on available V3-H-001 smoke checkpoint if present', () => {
    const runsDir = path.resolve('.axiom-state', 'runs-v3');
    if (!fs.existsSync(runsDir)) return;
    const dirs = fs.readdirSync(runsDir);
    const cpDir = dirs.find((d) => fs.existsSync(path.join(runsDir, d, 'checkpoint.json')));
    if (!cpDir) return;

    const cp = JSON.parse(
      fs.readFileSync(path.join(runsDir, cpDir, 'checkpoint.json'), 'utf8')
    ) as { metadata?: Partial<RunMetadataV3>; trials?: TrialV3[] };
    const smokeTrials = (cp.trials ?? []).filter((t) => t.taskId === 'V3-H-001');
    if (smokeTrials.length === 0) return;

    const tasksJson = JSON.parse(
      fs.readFileSync(path.resolve('fixtures', 'task-v3', 'tasks.json'), 'utf8')
    ) as { test: TaskV2Item[] };

    const report = analyzeAblationV3Trials(smokeTrials, {
      metadata: cp.metadata,
      tasks: tasksJson.test,
      allowPartial: true,
    });
    expect(report.partialAllowed).toBe(true);
    expect(report.totalTrials).toBe(smokeTrials.length);
  });
});

describe('Step 4: audit-decision1-judge', () => {
  it('builds valid Decision 1 memory-audit and oracle-vs-judge payloads', () => {
    const memReq = buildMemoryAuditRequest('C', [
      {
        factId: 'F-36',
        canonicalStatement: 'Use fk_<table>_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES ...',
        lesson: 'Add supersedes_id self-reference',
      },
    ]);
    expect(memReq.model).toBe('gemini-decision-1');
    expect(memReq.questions).toHaveLength(4);
    expect(memReq.questions.map((q) => q.type)).toEqual(['bool', 'bool', 'choice', 'score']);

    const judgeReq = buildOracleVsJudgeRequest({
      sampleId: 'V3-H-001::C',
      taskId: 'V3-H-001',
      sql: 'CREATE TABLE public.audit_events (id uuid PRIMARY KEY);',
      task: { table: 'audit_events', features: { tenant: false, append_only: true, ingestion: false } },
      applicableFacts: [{ id: 'F-16', statement: 'Foreign key constraints must be named fk_<table>_<column>.' }],
    });
    expect(judgeReq.questions.length).toBeGreaterThan(1);
    expect(judgeReq.questions[0].id).toBe('fact__F-16');
  });

  it('computes precision, recall, F1, hallucinated compliance, F-36/F-16 FP rate, and ECE', () => {
    const metrics = evaluateDecision1VsOracle(
      [
        {
          sampleId: 's1',
          taskId: 'V3-H-001',
          sql: 'CREATE TABLE public.audit_events (id uuid PRIMARY KEY, supersedes_id uuid REFERENCES public.audit_events(id));',
          task: { table: 'audit_events', features: { tenant: false, append_only: true, ingestion: false } },
          applicableFacts: [
            { id: 'F-01', statement: 'PK id uuid' },
            { id: 'F-16', statement: 'FK named fk_<table>_<column>' },
          ],
          oraclePassed: false,
          oracleFailedFacts: ['F-16'],
        },
      ],
      [
        {
          sampleId: 's1',
          factPredictions: [
            { factId: 'F-01', predictedPass: true, confidence: 0.95 },
            { factId: 'F-16', predictedPass: true, confidence: 0.85 }, // hallucinated compliance on F-36/F-16!
          ],
        },
      ]
    );
    expect(metrics.totalFactJudgments).toBe(2);
    expect(metrics.precision).toBeCloseTo(0.5, 6);
    expect(metrics.recall).toBeCloseTo(1.0, 6);
    expect(metrics.hallucinatedComplianceCount).toBe(1);
    expect(metrics.hallucinatedComplianceRate).toBeCloseTo(1.0, 6);
    expect(metrics.f36F16CollisionTotal).toBe(1);
    expect(metrics.f36F16CollisionFalsePositiveRate).toBeCloseTo(1.0, 6);
    expect(metrics.ece).toBeGreaterThan(0);
  });
});
