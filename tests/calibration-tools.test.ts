import { describe, expect, it, vi } from 'vitest';
import {
  buildBoundFactProposal,
  candidateFactsForRule,
  discriminatingFacts,
  selectBoundFacts,
} from '../scripts/propose-bound-facts.js';
import { buildMemoryProposal } from '../scripts/build-sql-memory.js';
import { computeDevKSweepForRule, syntheticKSweep } from '../scripts/report-dev-k-sweep.js';
import { auditTaskConditionPrompts, buildInMemoryPlaceholderMemory } from '../scripts/audit-condition-prompts.js';
import {
  buildCalibrationTaskRecord,
  getCalibrationApplicableFacts,
  runCalibrationTask,
} from '../scripts/calibrate-condition-a.js';
import { rescoreDevBaseline } from '../scripts/rescore-dev-baseline.js';
import { runAblationTaskCondition } from '../src/eval/ablation.js';
import { REQUIRED_EXECUTOR_MODEL } from '../src/executor.js';

describe('offline calibration preparation', () => {
  it('selects deterministic three-to-five bound facts', () => {
    const candidates = ['F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06'];
    const set = new Set(candidates);
    expect(selectBoundFacts('T-001', candidates, set)).toEqual(selectBoundFacts('T-001', candidates, set));
    expect(selectBoundFacts('T-001', candidates, set).length).toBeGreaterThanOrEqual(3);
    expect(selectBoundFacts('T-001', candidates, set).length).toBeLessThanOrEqual(5);
  });

  it('uses the inclusive pass-rate discrimination interval', () => {
    expect([...discriminatingFacts({ factStats: [
      { factId: 'F-01', applicableCount: 3, passRate: 0.1 },
      { factId: 'F-02', applicableCount: 3, passRate: 0.8 },
      { factId: 'F-03', applicableCount: 3, passRate: 0.81 },
    ] })]).toEqual(['F-01', 'F-02']);
  });

  it('supports R1 and R2 candidate rules including floor facts and optional Condition B satisfiability filter', () => {
    const cal = {
      factStats: [
        { factId: 'F-03', applicableCount: 40, passRate: 0.375 },
        { factId: 'F-10', applicableCount: 20, passRate: 0.0 },
        { factId: 'F-19', applicableCount: 20, passRate: 0.0 },
        { factId: 'F-39', applicableCount: 2, passRate: 0.0 },
        { factId: 'F-01', applicableCount: 40, passRate: 0.975 },
      ],
    };

    const r1 = candidateFactsForRule(cal, { rule: 'R1' });
    expect([...r1.candidates]).toEqual(['F-03']);
    expect(r1.floorCandidates).toEqual([]);
    expect(r1.satisfiabilityFilterSkipped).toBe(false);

    // R2 without Condition B calibration: includes floor facts with applicableCount >= 3 and reports filter skipped
    const r2NoB = candidateFactsForRule(cal, { rule: 'R2' });
    expect([...r2NoB.candidates].sort()).toEqual(['F-03', 'F-10', 'F-19']);
    expect(r2NoB.discriminatingCandidates).toEqual(['F-03']);
    expect(r2NoB.floorCandidates).toEqual(['F-10', 'F-19']);
    expect(r2NoB.satisfiabilityFilterSkipped).toBe(true);

    // R2 with Condition B calibration: excludes facts with Condition B passRate === 0
    const r2WithB = candidateFactsForRule(cal, {
      rule: 'R2',
      conditionBCalibration: {
        factStats: [
          { factId: 'F-03', applicableCount: 40, passRate: 0.9 },
          { factId: 'F-10', applicableCount: 20, passRate: 0.5 },
          { factId: 'F-19', applicableCount: 20, passRate: 0.0 },
        ],
      },
    });
    expect([...r2WithB.candidates].sort()).toEqual(['F-03', 'F-10']);
    expect(r2WithB.unsatisfiableFactsExcluded).toEqual(['F-19']);
    expect(r2WithB.satisfiabilityFilterSkipped).toBe(false);
  });

  it('computes Dev K-sweep from Train failure rates only and rejects Test split tasks', () => {
    const devTask = {
      id: 'D-001',
      split: 'dev' as const,
      features: { tenant: false, append_only: false, ingestion: false },
      prompt: 'Create a table.',
      goldenSql: 'CREATE TABLE public.items (id uuid PRIMARY KEY);',
    };
    const rows = computeDevKSweepForRule(
      [devTask],
      { 'D-001': ['F-01', 'F-03', 'F-05'] },
      {
        factStats: [
          { factId: 'F-01', applicableCount: 40, passRate: 0.2 },
          { factId: 'F-03', applicableCount: 40, passRate: 0.3 },
          { factId: 'F-05', applicableCount: 40, passRate: 0.4 },
        ],
      },
      [6]
    );
    expect(rows[0].meanRetrievableBoundFactFraction).toBe(1);
    expect(rows[0].fullCoverageFraction).toBe(1);

    expect(() =>
      computeDevKSweepForRule(
        [{ ...devTask, id: 'H-001', split: 'test' }],
        { 'H-001': ['F-01'] },
        { factStats: [] },
        [6]
      )
    ).toThrow(/only run on dev split/);
  });

  it('audits condition prompts without calling any LLM', () => {
    const sampleTrainTask = {
      id: 'T-001',
      split: 'train' as const,
      cohortId: 'C1',
      table: 'webhook_deliveries',
      prompt: 'Create a multi-tenant append-only ingestion table.',
      features: { tenant: true, append_only: true, ingestion: true },
      boundFacts: ['F-03', 'F-05', 'F-15'],
      goldenSql: 'CREATE TABLE public.webhook_deliveries (id uuid PRIMARY KEY);',
    };
    const memory = buildInMemoryPlaceholderMemory([sampleTrainTask], {
      factStats: [{ factId: 'F-03', applicableCount: 40, passRate: 0.375 }],
    });
    const audit = auditTaskConditionPrompts(sampleTrainTask, memory);
    expect(audit.checks.c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts).toBe(true);
    expect(audit.checks.dTipsNotInApplicableSet).toBe(true);
    expect(audit.checks.ebByteIdenticalToB).toBe(true);
    expect(audit.checks.noCorrectedSql).toBe(true);
    expect(audit.checks.noReferenceSolutionText).toBe(true);
    expect(audit.checks.noNonApplicableFactIdsByCondition.C).toBe(true);
    expect(audit.checks.noNonApplicableFactIdsByCondition.C0).toBe(true);
    expect(audit.checks.noNonApplicableFactIdsByCondition.B).toBe(false);
  });

  it('builds a proposal without Advisor calls for facts with no failures', async () => {
    const lessons = await buildMemoryProposal({
      factStats: [{ factId: 'F-01', applicableCount: 2, failedCount: 0, passRate: 1 }],
    }, false);
    expect(lessons[0]).toMatchObject({ factId: 'F-01', origin: 'verbatim', trainFailureRate: 0 });
  });

  it('refuses distillation without confirmation', async () => {
    await expect(buildMemoryProposal({
      factStats: [{ factId: 'F-01', applicableCount: 2, failedCount: 1, passRate: 0.5 }],
    }, false, async () => 'unused')).rejects.toThrow(/confirm-llm/);
  });

  it('exercises the synthetic K sweep without reading live calibration or memory', () => {
    expect(syntheticKSweep().map((row) => row.k)).toEqual([6, 8, 10, 12, 15, 20]);
    expect(syntheticKSweep().map((row) => row.retrieved)).toEqual([6, 8, 10, 12, 15, 20]);
  });

  it('derives calibration applicability from prompt and golden SQL flags', () => {
    const facts = getCalibrationApplicableFacts({
      features: { tenant: false, append_only: false, ingestion: false },
      prompt: 'Create a table with a status column.',
      goldenSql: 'CREATE TABLE public.items (status text);',
    });
    expect(facts).toContain('F-12');
  });

  it('stores all probed failedFacts and derivedFlags on per-task calibration records and rescores dev baseline from them', () => {
    const task = {
      id: 'D-001',
      split: 'dev' as const,
      cohortId: 'C1',
      table: 'orders',
      prompt: 'Create an orders table with a status column.',
      features: { tenant: true, append_only: false, ingestion: false },
      boundFacts: ['F-01', 'F-02'],
      goldenSql: 'CREATE TABLE public.orders (\n  id uuid PRIMARY KEY,\n  status text NOT NULL CHECK (status IN (\'open\'))\n);',
    };
    const record = buildCalibrationTaskRecord(
      task,
      {
        sql: 'CREATE TABLE public.orders (id uuid, status text);',
        fromCache: false,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        requestedModel: 'model-x',
        returnedModel: 'model-x',
        finishReason: 'stop',
      },
      {
        migrationExitNonZero: false,
        pass: false,
        failedFacts: ['F-01', 'F-12', 'F-30'],
      },
      123
    );

    // Stores derivedFlags and ALL probed failedFacts, not just boundFailedFacts
    expect(record.derivedFlags).toEqual({
      tenant: true,
      append_only: false,
      ingestion: false,
      status: true,
      view: false,
      sec_definer: false,
      latest_per_key: false,
    });
    expect(record.failedFacts).toEqual(['F-01', 'F-12', 'F-30']);
    expect(record.boundFailedFacts).toEqual(['F-01']);

    // Recomputes dev baseline when boundFacts are updated to include previously non-bound probed facts
    const rescored = rescoreDevBaseline(
      { taskReports: [record] },
      { dev: [{ id: 'D-001', boundFacts: ['F-02', 'F-12', 'F-30', 'F-04'] }] }
    );
    expect(rescored.n).toBe(1);
    expect(rescored.rows[0].boundFailedFacts).toEqual(['F-12', 'F-30']);
    expect(rescored.rows[0].fraction).toBe(0.5);
    expect(rescored.rows[0].derivedFlags?.status).toBe(true);
    expect(rescored.meanBoundFactFraction).toBe(0.5);
    expect(rescored.strictPassAt1).toBe(0);
  });

  it('handles deterministic generation failures (empty, length, content-filter) without aborting and halts on transient failure after retries', async () => {
    const sampleTask = {
      id: 'H-001',
      split: 'test' as const,
      cohortId: 'C1',
      table: 'orders',
      prompt: 'Create an orders table.',
      features: { tenant: true, append_only: false, ingestion: false },
      boundFacts: ['F-01', 'F-02'],
      goldenSql: 'CREATE TABLE public.orders (id uuid PRIMARY KEY);',
    };
    const fakeMetadata = {
      oracleSha256: 'a'.repeat(64),
      tasksSha256: 'b'.repeat(64),
      factsSha256: 'c'.repeat(64),
      memorySha256: 'd'.repeat(64),
      gitCommit: 'e'.repeat(40),
    };
    const mockOracle = vi.fn();

    // 1. Deterministic failure: empty response -> generationStatus='empty', Oracle skipped
    const emptyExecutor = vi.fn().mockResolvedValue({
      sql: '',
      rawResponse: '{}',
      fromCache: false,
      requestedModel: REQUIRED_EXECUTOR_MODEL,
      returnedModel: REQUIRED_EXECUTOR_MODEL,
      finishReason: 'stop',
      usage: { promptTokens: 12, completionTokens: 0, totalTokens: 12 },
    });
    const { trial: emptyTrial } = await runAblationTaskCondition({
      containerName: 'mock-pg',
      task: sampleTask,
      condition: 'A',
      memory: [],
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: emptyExecutor as any,
      oracleEvalFn: mockOracle as any,
      runMetadata: fakeMetadata,
    });
    expect(emptyTrial.generationStatus).toBe('empty');
    expect(emptyTrial.generatedSql).toBe('');
    expect(emptyTrial.boundFactFraction).toBe(0);
    expect(emptyTrial.boundPassed).toBe(false);
    expect(emptyTrial.failedFacts).toEqual([]);
    expect(emptyTrial.finishReason).toBe('stop');
    expect(mockOracle).not.toHaveBeenCalled();

    const emptyCal = await runCalibrationTask({
      containerName: 'mock-pg',
      task: sampleTask,
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: emptyExecutor as any,
      oracleEvalFn: mockOracle as any,
    });
    expect(emptyCal.generationStatus).toBe('empty');
    expect(emptyCal.generatedSql).toBe('');
    expect(emptyCal.boundFactFraction).toBe(0);
    expect(emptyCal.boundPassed).toBe(false);
    expect(emptyCal.failedFacts).toEqual([]);
    expect(emptyCal.finishReason).toBe('stop');
    expect(mockOracle).not.toHaveBeenCalled();

    // 2. Deterministic failure: finish_reason=length -> generationStatus='length', Oracle skipped
    const lengthExecutor = vi.fn().mockResolvedValue({
      sql: 'CREATE TABLE public.orders (id uuid',
      rawResponse: '{}',
      fromCache: false,
      requestedModel: REQUIRED_EXECUTOR_MODEL,
      returnedModel: REQUIRED_EXECUTOR_MODEL,
      finishReason: 'length',
      usage: { promptTokens: 15, completionTokens: 8192, totalTokens: 8207 },
    });
    const { trial: lengthTrial } = await runAblationTaskCondition({
      containerName: 'mock-pg',
      task: sampleTask,
      condition: 'C',
      memory: [],
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: lengthExecutor as any,
      oracleEvalFn: mockOracle as any,
      runMetadata: fakeMetadata,
    });
    expect(lengthTrial.generationStatus).toBe('length');
    expect(lengthTrial.generatedSql).toBe('');
    expect(lengthTrial.boundFactFraction).toBe(0);
    expect(lengthTrial.boundPassed).toBe(false);
    expect(lengthTrial.failedFacts).toEqual([]);
    expect(lengthTrial.finishReason).toBe('length');
    expect(mockOracle).not.toHaveBeenCalled();

    const lengthCal = await runCalibrationTask({
      containerName: 'mock-pg',
      task: sampleTask,
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: lengthExecutor as any,
      oracleEvalFn: mockOracle as any,
    });
    expect(lengthCal.generationStatus).toBe('length');
    expect(lengthCal.generatedSql).toBe('');
    expect(lengthCal.boundFactFraction).toBe(0);
    expect(lengthCal.boundPassed).toBe(false);
    expect(lengthCal.failedFacts).toEqual([]);
    expect(lengthCal.finishReason).toBe('length');
    expect(mockOracle).not.toHaveBeenCalled();

    // 3. Deterministic failure: content-filter -> generationStatus='other', Oracle skipped
    const filterExecutor = vi.fn().mockResolvedValue({
      sql: '',
      rawResponse: '{}',
      fromCache: false,
      requestedModel: REQUIRED_EXECUTOR_MODEL,
      returnedModel: REQUIRED_EXECUTOR_MODEL,
      finishReason: 'content_filter',
      usage: { promptTokens: 15, completionTokens: 0, totalTokens: 15 },
    });
    const { trial: filterTrial } = await runAblationTaskCondition({
      containerName: 'mock-pg',
      task: sampleTask,
      condition: 'B',
      memory: [],
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: filterExecutor as any,
      oracleEvalFn: mockOracle as any,
      runMetadata: fakeMetadata,
    });
    expect(filterTrial.generationStatus).toBe('other');
    expect(filterTrial.generatedSql).toBe('');
    expect(filterTrial.boundFactFraction).toBe(0);
    expect(filterTrial.boundPassed).toBe(false);
    expect(filterTrial.failedFacts).toEqual([]);
    expect(filterTrial.finishReason).toBe('content_filter');
    expect(mockOracle).not.toHaveBeenCalled();

    const filterCal = await runCalibrationTask({
      containerName: 'mock-pg',
      task: sampleTask,
      configuredModel: REQUIRED_EXECUTOR_MODEL,
      executorFn: filterExecutor as any,
      oracleEvalFn: mockOracle as any,
    });
    expect(filterCal.generationStatus).toBe('other');
    expect(filterCal.generatedSql).toBe('');
    expect(filterCal.boundFactFraction).toBe(0);
    expect(filterCal.boundPassed).toBe(false);
    expect(filterCal.failedFacts).toEqual([]);
    expect(filterCal.finishReason).toBe('content_filter');
    expect(mockOracle).not.toHaveBeenCalled();

    // 4. Transient failure exhausting retries -> throws and does NOT record trial (resume-safe)
    let transientAttempts = 0;
    const transientExecutor = vi.fn().mockImplementation(async () => {
      for (let i = 0; i < 3; i++) {
        transientAttempts++;
      }
      throw new Error('NVIDIA Executor 5xx 503: Service Unavailable (Failed after 3 attempts)');
    });
    const recordedTrials: any[] = [];
    await expect(
      (async () => {
        const { trial } = await runAblationTaskCondition({
          containerName: 'mock-pg',
          task: sampleTask,
          condition: 'A',
          memory: [],
          configuredModel: REQUIRED_EXECUTOR_MODEL,
          executorFn: transientExecutor as any,
          oracleEvalFn: mockOracle as any,
          runMetadata: fakeMetadata,
        });
        recordedTrials.push(trial);
      })()
    ).rejects.toThrow(/503/);
    expect(transientAttempts).toBe(3);
    expect(recordedTrials).toHaveLength(0);
    expect(mockOracle).not.toHaveBeenCalled();

    await expect(
      runCalibrationTask({
        containerName: 'mock-pg',
        task: sampleTask,
        configuredModel: REQUIRED_EXECUTOR_MODEL,
        executorFn: transientExecutor as any,
        oracleEvalFn: mockOracle as any,
      })
    ).rejects.toThrow(/503/);
  });
});
