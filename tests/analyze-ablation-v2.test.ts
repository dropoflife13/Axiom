import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeTrials,
  buildReport,
  cleanMigrationConditionAnalysis,
  computeFeatureCellICC,
  evaluateValidityGate,
  exactCellSignFlip,
  formatCellKey,
  holmAdjust,
  isRawAllFactPass,
  lessonOriginAnalysis,
  lessonOrigins,
  markdownReport,
  mcnemar,
  pairedBootstrap,
  perCellAnalysis,
  retrievalOverlap,
  sensitivityAnalysis,
  sensitivityAnalysisExcludingEarlyTasks,
  wilson,
  type Trial,
} from '../scripts/analyze-ablation-v2.js';

function trial(
  condition: Trial['condition'],
  taskId: string,
  fraction: number,
  passed: boolean,
  overrides: Partial<Trial> = {}
): Trial {
  return {
    condition,
    taskId,
    boundFacts: ['F-01'],
    boundPassed: passed,
    boundFactFraction: fraction,
    failedFacts: passed ? [] : ['F-01'],
    retrievedFactIds: [],
    promptTokens: 10,
    totalTokens: 20,
    ...overrides,
  };
}

describe('offline ablation analysis', () => {
  it('pairs by task ID and skips tasks missing from one condition', () => {
    const report = analyzeTrials([
      trial('A', 'H-001', 0, false),
      trial('C', 'H-001', 1, true),
      trial('A', 'H-002', 1, true),
    ]);
    expect(report.comparisons.C_vs_A).toMatchObject({ n: 1 });
  });

  it('counts McNemar discordant directions', () => {
    expect(mcnemar([true, false, false], [false, true, false])).toMatchObject({ b: 1, c: 1 });
  });

  it('applies Holm correction monotonically', () => {
    expect(holmAdjust({ a: 0.01, b: 0.04, c: 0.2 })).toEqual({ a: 0.03, b: 0.08, c: 0.2 });
  });

  it('makes fixed-seed bootstrap reproducible', () => {
    const a = pairedBootstrap([0, 0.5, 1], 100, 20260101);
    const b = pairedBootstrap([0, 0.5, 1], 100, 20260101);
    expect(a).toEqual(b);
  });

  it('gives signFlipPValue above 0.5 for zero-effect differences', () => {
    const allZero = pairedBootstrap([0, 0, 0, 0, 0, 0]);
    expect(allZero.signFlipPValue).toBe(1);
    expect(allZero.signFlipPValue).toBeGreaterThan(0.5);

    const balancedZeroMean = pairedBootstrap([0.25, -0.25, 0.25, -0.25, 0.25, -0.25], 10_000, 20260101);
    expect(balancedZeroMean.meanDifference).toBe(0);
    expect(balancedZeroMean.signFlipPValue).toBeGreaterThan(0.5);
  });

  it('gives signFlipPValue below 0.001 for a consistent positive difference over 30 tasks', () => {
    const positive30 = Array.from({ length: 30 }, () => 0.3333);
    const res = pairedBootstrap(positive30, 100_000, 20260101);
    expect(res.meanDifference).toBeCloseTo(0.3333, 4);
    expect(res.ci95[0]).toBeCloseTo(0.3333, 4);
    expect(res.ci95[1]).toBeCloseTo(0.3333, 4);
    expect(res.signFlipPValue).toBeLessThan(0.001);
  });

  it('computes exact two-sided McNemar p=0.21875 when b=1 and c=5', () => {
    const reference = [true, false, false, false, false, false, true, false];
    const target = [false, true, true, true, true, true, true, false];
    const res = mcnemar(reference, target);
    expect(res.b).toBe(1);
    expect(res.c).toBe(5);
    expect(res.pValue).toBeCloseTo(0.21875, 10);
  });

  it('computes Wilson 95% intervals on (0,0), (5,10), and (10,10)', () => {
    expect(wilson(0, 0)).toEqual([0, 0]);

    const [low5, high5] = wilson(5, 10);
    expect(low5).toBeCloseTo(0.236593, 5);
    expect(high5).toBeCloseTo(0.763407, 5);
    expect(low5 + high5).toBeCloseTo(1, 10);

    const [low10, high10] = wilson(10, 10);
    expect(low10).toBeCloseTo(0.72246, 4);
    expect(high10).toBeCloseTo(1, 10);
  });

  it('classifies lessonOrigins using explicit origin or inferred text equality with warnings, and handles array/object shapes', () => {
    const facts = [
      { id: 'F-01', statement: 'Canonical F-01 statement' },
      { id: 'F-02', statement: 'Canonical F-02 statement' },
    ];

    // 1. Explicit origin overrides text equality without warning
    const explicitWarnings: string[] = [];
    const explicit = lessonOrigins(
      [
        { factId: 'F-01', lesson: 'Canonical F-01 statement', origin: 'distilled' },
        { factId: 'F-02', lesson: 'Shortened F-02', origin: 'verbatim' },
      ],
      facts,
      explicitWarnings
    );
    expect(explicit).toEqual({ distilled: ['F-01'], verbatim: ['F-02'] });
    expect(explicitWarnings).toHaveLength(0);

    // 2. Absent origin falls back to text equality and emits warning
    const inferredWarnings: string[] = [];
    const inferred = lessonOrigins(
      [
        { errorCode: 'F-01', lesson: 'Distilled F-01 rule' },
        { errorCode: 'F-02', lesson: 'Canonical F-02 statement' },
      ],
      facts,
      inferredWarnings
    );
    expect(inferred).toEqual({ distilled: ['F-01'], verbatim: ['F-02'] });
    expect(inferredWarnings.some((w) => /inferred/i.test(w))).toBe(true);

    // 3. Object-shaped memory.json and array-shaped facts.json in buildReport
    const baseProv = {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      requestedModel: 'google/gemma-4-31b-it',
      returnedModel: 'google/gemma-4-31b-it',
      oracleCommit: 'a'.repeat(40),
      factsSha256: 'b'.repeat(64),
      finishReason: 'stop',
    };
    const syntheticTrials: Trial[] = [
      trial('C', 'H-001', 1, true, { ...baseProv, retrievedFactIds: ['F-01'] }),
      trial('C0', 'H-001', 0.5, false, { ...baseProv, retrievedFactIds: ['F-01'] }),
      trial('C', 'H-002', 0.5, false, { ...baseProv, retrievedFactIds: ['F-02'] }),
      trial('C0', 'H-002', 0.5, false, { ...baseProv, retrievedFactIds: ['F-02'] }),
    ];

    const repObj = buildReport(syntheticTrials, {}, {
      memory: {
        'F-01': { lesson: 'Distilled F-01', origin: 'distilled' },
        'F-02': { lesson: 'Canonical F-02 statement', origin: 'verbatim' },
      },
      facts,
    });
    expect(repObj.provenanced).toBe(true);
    expect(repObj.lessonOrigins).toEqual({
      exploratory: true,
      distilled: ['F-01'],
      verbatim: ['F-02'],
    });
    expect(repObj.lessonOriginAnalysis.exploratory).toBe(true);
    expect(repObj.lessonOriginAnalysis.tasksWithAllVerbatimLessons.negativeControl).toBe(true);

    // 4. Unrecognised shape skips lesson analysis with a warning instead of throwing
    const repBadShape = buildReport(syntheticTrials, {}, {
      memory: 42,
      facts: 'invalid',
    });
    expect(repBadShape.lessonOrigins).toBeUndefined();
    expect(repBadShape.lessonOriginAnalysis).toBeUndefined();
    expect(repBadShape.warnings.some((w: string) => /skipping lesson analysis/i.test(w))).toBe(true);
  });

  it('computes retrievalOverlap for full and partial overlap tasks', () => {
    const overlap = retrievalOverlap([
      trial('C', 'H-001', 1.0, true, {
        boundFacts: ['F-01', 'F-02'],
        retrievedFactIds: ['F-01', 'F-02', 'F-03'],
      }),
      trial('C', 'H-002', 0.5, false, {
        boundFacts: ['F-01', 'F-02'],
        retrievedFactIds: ['F-01'],
      }),
      trial('C0', 'H-001', 0.75, false, {
        boundFacts: ['F-01', 'F-02'],
        retrievedFactIds: ['F-01', 'F-02'],
      }),
    ]);

    expect(overlap.C.n).toBe(2);
    expect(overlap.C.meanFraction).toBeCloseTo(0.75, 5);
    expect(overlap.C.fullOverlap).toEqual({ n: 1, meanBoundFactFraction: 1.0 });
    expect(overlap.C.partialOverlap).toEqual({ n: 1, meanBoundFactFraction: 0.5 });
    expect(overlap.C0.fullOverlap).toEqual({ n: 1, meanBoundFactFraction: 0.75 });
    expect(overlap.C0.partialOverlap).toEqual({ n: 0, meanBoundFactFraction: 0 });
  });

  it('flags provenanced=false on mixed models or requestedModel !== returnedModel and reports per-condition operational counts', () => {
    const baseProv = {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      oracleCommit: 'a'.repeat(40),
      factsSha256: 'b'.repeat(64),
      finishReason: 'stop',
    };
    const mixedTrials: Trial[] = [
      trial('A', 'H-001', 0, false, {
        ...baseProv,
        requestedModel: 'google/gemma-4-31b-it',
        returnedModel: 'google/gemma-4-31b-it',
        tableMissing: true,
        migrationExitNonZero: true,
      }),
      trial('B', 'H-001', 1, true, {
        ...baseProv,
        requestedModel: 'z-ai/glm-5.3-flash',
        returnedModel: 'google/gemma-4-31b-it',
      }),
      trial('E_B', 'H-001', 1, true, {
        ...baseProv,
        requestedModel: 'google/gemma-4-31b-it',
        returnedModel: 'google/gemma-4-31b-it',
        reusedFromCondition: 'B',
      }),
    ];

    const report = buildReport(mixedTrials, {});
    expect(report.provenanced).toBe(false);
    expect(
      report.warnings.some(
        (w: string) =>
          w.includes('requestedModel') &&
          w.includes('google/gemma-4-31b-it') &&
          w.includes('z-ai/glm-5.3-flash')
      )
    ).toBe(true);
    expect(
      report.warnings.some((w: string) => /returnedModel differs from requestedModel/i.test(w))
    ).toBe(true);

    expect(report.analysis.conditions.A.tableMissing).toBe(1);
    expect(report.analysis.conditions.A.migrationExitNonZero).toBe(1);
    expect(report.analysis.conditions.E_B.reusedFromCondition).toBe(1);
    expect(report.analysis.conditions.E_B.reusedFromConditionB).toBe(1);

    const md = markdownReport(report);
    expect(md).toContain('## Retrieval overlap');
    expect(md).toContain('## Lesson origin analysis (Exploratory');
    expect(md).toContain("reusedFromCondition='B'");
    expect(md).toContain('negative control');
  });

  it('produces finite holmPrimaryPValues and holmSecondaryPValues in [0, 1] and signFlipPValue on each comparison across 12 synthetic tasks per condition', () => {
    const conditions: Trial['condition'][] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
    const syntheticSet: Trial[] = [];
    for (let i = 1; i <= 12; i++) {
      const taskId = `H-${String(i).padStart(3, '0')}`;
      for (const cond of conditions) {
        const cBetter = cond === 'C' || cond === 'B' || cond === 'E_B';
        const passed = cBetter ? i <= 10 : i <= 4;
        const fraction = passed ? 1 : i % 2 === 0 ? 0.5 : 0;
        syntheticSet.push(trial(cond, taskId, fraction, passed));
      }
    }

    const result = analyzeTrials(syntheticSet);
    const expectedKeys = ['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D'];

    expect(Object.keys(result.holmPrimaryPValues).sort()).toEqual(expectedKeys);
    expect(Object.keys(result.holmSecondaryPValues).sort()).toEqual(expectedKeys);

    for (const key of expectedKeys) {
      const primaryHolm = result.holmPrimaryPValues[key];
      const secondaryHolm = result.holmSecondaryPValues[key];
      expect(Number.isFinite(primaryHolm)).toBe(true);
      expect(primaryHolm).toBeGreaterThanOrEqual(0);
      expect(primaryHolm).toBeLessThanOrEqual(1);

      expect(Number.isFinite(secondaryHolm)).toBe(true);
      expect(secondaryHolm).toBeGreaterThanOrEqual(0);
      expect(secondaryHolm).toBeLessThanOrEqual(1);

      const comp = result.comparisons[key];
      expect(comp.n).toBe(12);
      expect(Number.isFinite(comp.primary.signFlipPValue)).toBe(true);
      expect(comp.primary.signFlipPValue).toBeGreaterThanOrEqual(0);
      expect(comp.primary.signFlipPValue).toBeLessThanOrEqual(1);
      expect('pValue' in comp.primary).toBe(false);
    }
  });

  it('computes exploratory per-fact retrieval analysis for C and C0 vs A split by retrieved vs non-retrieved bound facts', () => {
    const trials: Trial[] = [
      // Task 1: bound F-01 (retrieved in C/C0) and F-02 (not retrieved in C/C0)
      {
        ...trial('A', 'H-001', 0, false),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: ['F-01', 'F-02'],
        retrievedFactIds: [],
      },
      {
        ...trial('C', 'H-001', 0.5, false),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: ['F-02'], // F-01 passed when retrieved, F-02 failed when not retrieved
        retrievedFactIds: ['F-01'],
      },
      {
        ...trial('C0', 'H-001', 0.5, false),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: ['F-02'],
        retrievedFactIds: ['F-01'],
      },
      // Task 2: bound F-01 (not retrieved in C/C0) and F-02 (retrieved in C/C0)
      {
        ...trial('A', 'H-002', 0.5, false),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: ['F-02'], // F-01 passed in A, F-02 failed in A
        retrievedFactIds: [],
      },
      {
        ...trial('C', 'H-002', 1, true),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: [], // Both F-01 and F-02 passed in C
        retrievedFactIds: ['F-02'],
      },
      {
        ...trial('C0', 'H-002', 0.5, false),
        boundFacts: ['F-01', 'F-02'],
        failedFacts: ['F-02'], // F-01 passed, F-02 still failed in C0
        retrievedFactIds: ['F-02'],
      },
    ];

    const report = buildReport(trials, {
      provider: 'nvidia-nim',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      requestedModel: 'google/gemma-4-31b-it',
      returnedModel: 'google/gemma-4-31b-it',
      oracleCommit: 'deadbeef',
      factsSha256: 'cafebabe',
      finishReason: 'stop',
    });
    const pfa = report.perFactRetrievalAnalysis;
    expect(pfa.exploratory).toBe(true);

    // Condition C:
    // Retrieved pairs: (H-001, F-01: C=1, A=0) and (H-002, F-02: C=1, A=0) -> 2 pairs, C=1.0, A=0.0, diff=+1.0
    expect(pfa.C.retrieved.pairCount).toBe(2);
    expect(pfa.C.retrieved.condPassRate).toBeCloseTo(1.0, 6);
    expect(pfa.C.retrieved.aPassRate).toBeCloseTo(0.0, 6);
    expect(pfa.C.retrieved.passRateDifference).toBeCloseTo(1.0, 6);

    // Non-retrieved pairs (negative control): (H-001, F-02: C=0, A=0) and (H-002, F-01: C=1, A=1) -> 2 pairs, C=0.5, A=0.5, diff=0.0
    expect(pfa.C.nonRetrieved.negativeControl).toBe(true);
    expect(pfa.C.nonRetrieved.pairCount).toBe(2);
    expect(pfa.C.nonRetrieved.condPassRate).toBeCloseTo(0.5, 6);
    expect(pfa.C.nonRetrieved.aPassRate).toBeCloseTo(0.5, 6);
    expect(pfa.C.nonRetrieved.passRateDifference).toBeCloseTo(0.0, 6);

    // Condition C0:
    // Retrieved pairs: (H-001, F-01: C0=1, A=0) and (H-002, F-02: C0=0, A=0) -> 2 pairs, C0=0.5, A=0.0, diff=+0.5
    expect(pfa.C0.retrieved.pairCount).toBe(2);
    expect(pfa.C0.retrieved.passRateDifference).toBeCloseTo(0.5, 6);
    expect(pfa.C0.nonRetrieved.negativeControl).toBe(true);
    expect(pfa.C0.nonRetrieved.passRateDifference).toBeCloseTo(0.0, 6);

    // Per-fact breakdown for F-01 in C
    expect(pfa.C.byFact['F-01'].retrieved.pairCount).toBe(1);
    expect(pfa.C.byFact['F-01'].retrieved.passRateDifference).toBeCloseTo(1.0, 6);
    expect(pfa.C.byFact['F-01'].nonRetrieved.pairCount).toBe(1);
    expect(pfa.C.byFact['F-01'].nonRetrieved.passRateDifference).toBeCloseTo(0.0, 6);
  });

  it('reports generationStatus counts per condition and exploratory sensitivity analysis excluding non-ok generationStatus or migrationExitNonZero tasks', () => {
    const syntheticTrials: Trial[] = [
      // H-001: clean across all conditions (C=1, A=0, B=1, C0=0.5, D=0)
      trial('A', 'H-001', 0, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('B', 'H-001', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C', 'H-001', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C0', 'H-001', 0.5, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('D', 'H-001', 0, false, { generationStatus: 'ok', migrationExitNonZero: false }),

      // H-002: A has generationStatus='length', B has generationStatus='empty', C0 has generationStatus='other', D has migrationExitNonZero=true
      trial('A', 'H-002', 0, false, { generationStatus: 'length', failedFacts: [] }),
      trial('B', 'H-002', 0, false, { generationStatus: 'empty', failedFacts: [] }),
      trial('C', 'H-002', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C0', 'H-002', 0, false, { generationStatus: 'other', failedFacts: [] }),
      trial('D', 'H-002', 0, false, { generationStatus: 'ok', migrationExitNonZero: true }),

      // H-003: C itself has migrationExitNonZero=true (excluded from all C_vs_* comparisons in sensitivity analysis)
      trial('A', 'H-003', 0, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('B', 'H-003', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C', 'H-003', 0, false, { generationStatus: 'ok', migrationExitNonZero: true }),
      trial('C0', 'H-003', 0.5, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('D', 'H-003', 0, false, { generationStatus: 'ok', migrationExitNonZero: false }),

      // H-004: clean across all conditions (C=1, A=0.5, B=1, C0=0.5, D=0.5)
      trial('A', 'H-004', 0.5, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('B', 'H-004', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C', 'H-004', 1, true, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('C0', 'H-004', 0.5, false, { generationStatus: 'ok', migrationExitNonZero: false }),
      trial('D', 'H-004', 0.5, false, { generationStatus: 'ok', migrationExitNonZero: false }),
    ];

    const report = buildReport(syntheticTrials, {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      requestedModel: 'google/gemma-4-31b-it',
      returnedModel: 'google/gemma-4-31b-it',
      oracleCommit: 'a'.repeat(40),
      factsSha256: 'b'.repeat(64),
      finishReason: 'stop',
    });

    // Verify per-condition generationStatus counts
    expect(report.analysis.conditions.A.generationStatus).toEqual({
      ok: 3,
      empty: 0,
      length: 1,
      other: 0,
    });
    expect(report.analysis.conditions.B.generationStatus).toEqual({
      ok: 3,
      empty: 1,
      length: 0,
      other: 0,
    });
    expect(report.analysis.conditions.C.generationStatus).toEqual({
      ok: 4,
      empty: 0,
      length: 0,
      other: 0,
    });
    expect(report.analysis.conditions.C0.generationStatus).toEqual({
      ok: 3,
      empty: 0,
      length: 0,
      other: 1,
    });
    expect(report.analysis.conditions.D.generationStatus).toEqual({
      ok: 4,
      empty: 0,
      length: 0,
      other: 0,
    });

    // Verify full comparisons include all 4 tasks
    expect(report.analysis.comparisons.C_vs_A.n).toBe(4);

    // Verify exploratory sensitivity analysis excludes H-002 and H-003, leaving H-001 and H-004 (n=2)
    const sens = sensitivityAnalysis(syntheticTrials);
    expect(sens.exploratory).toBe(true);
    expect(report.sensitivityAnalysis).toEqual(sens);

    for (const key of ['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D']) {
      expect(sens.comparisons[key].n).toBe(2);
      expect(sens.comparisons[key].excludedCount).toBe(2);
      expect(sens.comparisons[key].excludedTaskIds).toEqual(['H-002', 'H-003']);
    }

    // On clean tasks H-001 and H-004: C=[1, 1], A=[0, 0.5] -> diffs=[1, 0.5], meanDifference=0.75
    expect(sens.comparisons.C_vs_A.primary.meanDifference).toBeCloseTo(0.75, 6);
    // On clean tasks H-001 and H-004: C=[1, 1], B=[1, 1] -> diffs=[0, 0], meanDifference=0, signFlipPValue=1
    expect(sens.comparisons.C_vs_B.primary.meanDifference).toBeCloseTo(0, 6);
    expect(sens.comparisons.C_vs_B.primary.signFlipPValue).toBe(1);
    // On clean tasks H-001 and H-004: C=[1, 1], C0=[0.5, 0.5] -> diffs=[0.5, 0.5], meanDifference=0.5
    expect(sens.comparisons.C_vs_C0.primary.meanDifference).toBeCloseTo(0.5, 6);

    const md = markdownReport(report);
    expect(md).toContain('## Sensitivity analysis (Exploratory — Outside Holm Family)');
    expect(md).toContain('gen(ok/empty/length/other)');
  });

  it('computes exploratory per-cell analysis with equal-weight cell-stratified estimate, within-cell bootstrap CI, and exact cell sign-flip test', () => {
    // 8 cells, all with positive cell mean difference -> exact 2-sided sign-flip p = 2 / 2^8 = 1/128 = 0.0078125
    expect(exactCellSignFlip([0.2, 0.3, 0.1, 0.4, 0.25, 0.15, 0.35, 0.25])).toBeCloseTo(
      2 / 256,
      10
    );
    expect(exactCellSignFlip([0, 0, 0, 0])).toBe(1);

    // Unbalanced synthetic cells to verify equal-weight cell stratification:
    // Cell 1 (tenant=true, append_only=false, ingestion=false): 3 tasks with diff = [0.2, 0.4, 0.6] -> cell mean = 0.4
    // Cell 2 (tenant=false, append_only=false, ingestion=false): 1 task with diff = [0.8] -> cell mean = 0.8
    // Equal-weight stratified mean = (0.4 + 0.8) / 2 = 0.6 (whereas unstratified mean is (0.2+0.4+0.6+0.8)/4 = 0.5)
    const cell1 = { tenant: true, append_only: false, ingestion: false };
    const cell2 = { tenant: false, append_only: false, ingestion: false };
    const syntheticTrials: Trial[] = [
      trial('A', 'SYN-1', 0.0, false, { features: cell1 }),
      trial('C', 'SYN-1', 0.2, false, { features: cell1 }),
      trial('A', 'SYN-2', 0.0, false, { features: cell1 }),
      trial('C', 'SYN-2', 0.4, false, { features: cell1 }),
      trial('A', 'SYN-3', 0.0, false, { features: cell1 }),
      trial('C', 'SYN-3', 0.6, false, { features: cell1 }),
      trial('A', 'SYN-4', 0.0, false, { features: cell2 }),
      trial('C', 'SYN-4', 0.8, false, { features: cell2 }),
    ];

    const res = perCellAnalysis(syntheticTrials, undefined, 20260101, 2000);
    expect(res.exploratory).toBe(true);
    const cVsA = res.comparisons.C_vs_A;
    expect(cVsA.n).toBe(4);
    expect(cVsA.cellCount).toBe(2);
    expect(cVsA.perCell[formatCellKey(cell1)].n).toBe(3);
    expect(cVsA.perCell[formatCellKey(cell1)].meanDifference).toBeCloseTo(0.4, 6);
    expect(cVsA.perCell[formatCellKey(cell2)].n).toBe(1);
    expect(cVsA.perCell[formatCellKey(cell2)].meanDifference).toBeCloseTo(0.8, 6);
    expect(cVsA.combinedMeanDifference).toBeCloseTo(0.6, 6);
    // In every within-cell resample, cell1 mean is in [0.2, 0.6] and cell2 mean is 0.8, so combined is in [0.5, 0.7]
    expect(cVsA.withinCellBootstrapCi95[0]).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(cVsA.withinCellBootstrapCi95[1]).toBeLessThanOrEqual(0.7 + 1e-9);
    // With 2 cells both positive (0.4 and 0.8), 2 of 4 sign flips (++ and --) have |mean| >= 0.6 -> p = 0.5
    expect(cVsA.exactCellSignFlipPValue).toBeCloseTo(0.5, 6);
  });

  it('computes one-way ANOVA ICC by feature cell on synthetic trials', () => {
    const cell1 = { tenant: true, append_only: false, ingestion: false };
    const cell2 = { tenant: false, append_only: false, ingestion: false };
    const trials: Trial[] = [
      trial('A', 'SYN-1', 0.2, false, { features: cell1, failedFacts: ['F-01', 'F-02'] }),
      trial('A', 'SYN-2', 0.4, false, { features: cell1, failedFacts: ['F-01'] }),
      trial('A', 'SYN-3', 0.8, true, { features: cell2, failedFacts: [] }),
      trial('A', 'SYN-4', 0.9, true, { features: cell2, failedFacts: [] }),
    ];
    const iccResult = computeFeatureCellICC(trials);
    expect(iccResult.exploratory).toBe(true);
    expect(iccResult.boundFactFraction.k).toBe(2);
    expect(iccResult.boundFactFraction.N).toBe(4);
    expect(iccResult.boundFactFraction.MSB).toBeGreaterThan(0);
    expect(Number.isFinite(iccResult.boundFactFraction.icc)).toBe(true);
    expect(Number.isFinite(iccResult.allFactPassRate.icc)).toBe(true);
  });

  it('computes clean migration condition analysis excluding migrationExitNonZero true', () => {
    const trials: Trial[] = [
      trial('A', 'SYN-1', 0.5, false, { migrationExitNonZero: false, promptTokens: 100, totalTokens: 200 }),
      trial('A', 'SYN-2', 0.0, false, { migrationExitNonZero: true, promptTokens: 100, totalTokens: 200 }),
      trial('B', 'SYN-1', 1.0, true, { migrationExitNonZero: false, promptTokens: 150, totalTokens: 300 }),
    ];
    const clean = cleanMigrationConditionAnalysis(trials);
    expect(clean.A.n).toBe(1);
    expect(clean.A.meanBoundFactFraction).toBe(0.5);
    expect(clean.B.n).toBe(1);
    expect(clean.B.meanBoundFactFraction).toBe(1.0);
    expect(clean.C.n).toBe(0);
  });

  it('computes sensitivity analysis excluding H-001 to H-008 on synthetic trials', () => {
    const trials: Trial[] = [
      trial('A', 'H-001', 0.0, false),
      trial('C', 'H-001', 1.0, true),
      trial('A', 'H-009', 0.2, false),
      trial('C', 'H-009', 0.8, true),
    ];
    const sens = sensitivityAnalysisExcludingEarlyTasks(trials, ['H-001']);
    expect(sens.comparisons.C_vs_A.n).toBe(1);
    expect(sens.comparisons.C_vs_A.excludedCount).toBe(1);
    expect(sens.comparisons.C_vs_A.primary.meanDifference).toBeCloseTo(0.6, 6);
  });

  it('renders markdown tables for conditions, ICC, clean migration, comparisons, and per-fact tables', () => {
    const syntheticTrials: Trial[] = [
      trial('A', 'H-001', 0.2, false, { migrationExitNonZero: false }),
      trial('B', 'H-001', 0.8, true, { migrationExitNonZero: false }),
      trial('C', 'H-001', 0.9, true, { migrationExitNonZero: false }),
      trial('C0', 'H-001', 0.7, true, { migrationExitNonZero: false }),
      trial('D', 'H-001', 0.3, false, { migrationExitNonZero: false }),
      trial('E_B', 'H-001', 0.8, true, { migrationExitNonZero: false }),
    ];
    const report = buildReport(syntheticTrials);
    const md = markdownReport(report);
    expect(md).toContain('## Conditions');
    expect(md).toContain('| Condition | n | Mean bound fraction |');
    expect(md).toContain('## Clean Migration Per-Condition Table (migrationExitNonZero = false)');
    expect(md).toContain('## Paired comparisons');
    expect(md).toContain('| Contrast | n | Mean Diff [95% CI] |');
    expect(md).toContain('## Feature cell intraclass correlation (ICC) — Condition A Baseline');
    expect(md).toContain('| Metric | Cells (k) | n per cell |');
    expect(md).toContain('## Sensitivity analysis: excluding H-001 to H-008');
  });

  it('judges provenance by content hashes while ignoring oracleCommit drift when file hashes match', () => {
    const contentHashes = {
      oracleSha256: 'o'.repeat(64),
      tasksSha256: 't'.repeat(64),
      factsSha256: 'f'.repeat(64),
      memorySha256: 'm'.repeat(64),
      hintBSha256: 'hb'.repeat(32),
      hintDSha256: 'hd'.repeat(32),
      hintBuildersSha256: 'hu'.repeat(32),
      hintCSha256: 'hc'.repeat(32),
      hintC0Sha256: 'h0'.repeat(32),
    };
    const commonExec = {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      requestedModel: 'nvidia/nemotron-3-ultra-550b-a55b',
      returnedModel: 'nvidia/nemotron-3-ultra-550b-a55b',
      finishReason: 'stop',
    };

    const driftedCommitTrials: Trial[] = [
      trial('A', 'H-001', 0.2, false, { ...commonExec, ...contentHashes, oracleCommit: '1'.repeat(40) }),
      trial('B', 'H-001', 0.9, true, { ...commonExec, ...contentHashes, oracleCommit: '2'.repeat(40) }),
      trial('C', 'H-001', 0.8, true, { ...commonExec, ...contentHashes, oracleCommit: '3'.repeat(40) }),
    ];

    const validReport = buildReport(driftedCommitTrials, contentHashes);
    expect(validReport.provenanced).toBe(true);
    expect(validReport.warnings).toEqual([]);
    expect(validReport.provenance.oracleCommitDriftIgnored).toBe(true);

    // Mismatched content file hash or hint hash must still mark provenanced=false
    const tamperedHashTrials: Trial[] = [
      trial('A', 'H-001', 0.2, false, { ...commonExec, ...contentHashes, oracleCommit: '1'.repeat(40) }),
      trial('B', 'H-001', 0.9, true, {
        ...commonExec,
        ...contentHashes,
        oracleSha256: 'x'.repeat(64),
        hintCSha256: 'y'.repeat(64),
        oracleCommit: '1'.repeat(40),
      }),
    ];
    const invalidReport = buildReport(tamperedHashTrials, contentHashes);
    expect(invalidReport.provenanced).toBe(false);
    expect(invalidReport.warnings.some((w: string) => w.includes('oracleSha256'))).toBe(true);
    expect(invalidReport.warnings.some((w: string) => w.includes('hintCSha256'))).toBe(true);
  });

  it('computes B_vs_A outside confirmatory Holm families, computes raw all-fact Pass@1, prints Holm Cell p, and renders all four previously-empty Markdown sections', () => {
    const conditions: Trial['condition'][] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
    const execMeta = {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      requestedModel: 'z-ai/glm-5.3-flash',
      returnedModel: 'z-ai/glm-5.3-flash',
      oracleSha256: 'o'.repeat(64),
      tasksSha256: 't'.repeat(64),
      factsSha256: 'f'.repeat(64),
      memorySha256: 'm'.repeat(64),
      finishReason: 'stop',
    };

    const syntheticTrials: Trial[] = [];
    for (let i = 1; i <= 8; i++) {
      const taskId = `H-${String(i).padStart(3, '0')}`;
      const fCell = {
        tenant: (i & 1) === 1,
        append_only: (i & 2) === 2,
        ingestion: (i & 4) === 4,
      };
      const isOdd = i % 2 === 1;
      for (const cond of conditions) {
        if (cond === 'A') {
          syntheticTrials.push(
            trial('A', taskId, 0.25, false, {
              ...execMeta,
              features: fCell,
              boundFacts: ['F-01', 'F-03'],
              failedFacts: ['F-03', 'F-16'],
              retrievedFactIds: [],
              passRaw: false,
            })
          );
        } else if (cond === 'B' || cond === 'E_B') {
          syntheticTrials.push(
            trial(cond, taskId, 1.0, true, {
              ...execMeta,
              features: fCell,
              boundFacts: ['F-01', 'F-03'],
              failedFacts: [],
              retrievedFactIds: [],
              passRaw: true,
              reusedFromCondition: cond === 'E_B' ? 'B' : undefined,
            })
          );
        } else if (cond === 'C') {
          syntheticTrials.push(
            trial('C', taskId, 1.0, true, {
              ...execMeta,
              features: fCell,
              boundFacts: ['F-01', 'F-03'],
              // Bound passed, but unbound F-16 failed on odd tasks so rawAllFactPass < strictBoundPass
              failedFacts: isOdd ? ['F-16'] : [],
              retrievedFactIds: ['F-01', 'F-03'],
              passRaw: !isOdd,
            })
          );
        } else if (cond === 'C0') {
          syntheticTrials.push(
            trial('C0', taskId, 0.5, false, {
              ...execMeta,
              features: fCell,
              boundFacts: ['F-01', 'F-03'],
              failedFacts: ['F-03'],
              retrievedFactIds: ['F-01'],
              passRaw: false,
            })
          );
        } else {
          syntheticTrials.push(
            trial('D', taskId, 0.25, false, {
              ...execMeta,
              features: fCell,
              boundFacts: ['F-01', 'F-03'],
              failedFacts: ['F-01', 'F-03'],
              retrievedFactIds: [],
              passRaw: false,
            })
          );
        }
      }
    }

    expect(isRawAllFactPass(syntheticTrials.find((t) => t.condition === 'C' && t.taskId === 'H-001')!)).toBe(false);
    expect(isRawAllFactPass(syntheticTrials.find((t) => t.condition === 'C' && t.taskId === 'H-002')!)).toBe(true);

    const lessons = {
      memory: {
        'F-01': { lesson: 'Distilled F-01', origin: 'distilled' },
        'F-03': { lesson: 'Verbatim F-03 statement', origin: 'verbatim' },
      },
      facts: [
        { id: 'F-01', statement: 'Original F-01 statement' },
        { id: 'F-03', statement: 'Verbatim F-03 statement' },
      ],
    };
    const report = buildReport(syntheticTrials, execMeta, lessons);

    // Raw Pass@1 vs Strict Pass@1 on Condition C (8/8 bound pass, 4/8 raw all-fact pass)
    expect(report.analysis.conditions.C.strictBoundPassAt1).toBeCloseTo(1.0, 6);
    expect(report.analysis.conditions.C.rawAllFactPassAt1).toBeCloseTo(0.5, 6);
    expect(report.cleanMigrationAnalysis.C.rawAllFactPassAt1).toBeCloseTo(0.5, 6);

    // B_vs_A computed in main comparisons and per-cell comparisons, excluded from Holm families
    expect(report.analysis.comparisons.B_vs_A.primary.meanDifference).toBeCloseTo(0.75, 6);
    expect(report.perCellAnalysis.comparisons.B_vs_A.combinedMeanDifference).toBeCloseTo(0.75, 6);
    expect(Object.keys(report.analysis.holmPrimaryPValues).sort()).toEqual(['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D']);
    expect(Object.keys(report.analysis.holmCellPValues).sort()).toEqual(['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D']);
    expect(report.validityGate.passed).toBe(true);

    const md = markdownReport(report);
    expect(md).toContain('Raw Pass@1 [Wilson 95%]');
    expect(md).toContain('Cell Sign-Flip p | Holm Cell p');
    expect(md).toContain('B_vs_A (validity gate; outside Holm)');

    // Non-empty content in all 4 previously-empty Markdown sections
    expect(md).toContain('Condition C mean bound fact overlap fraction: **1.0000**');
    expect(md).toContain('| Distilled Subset (at least one distilled lesson) | 8 |');
    expect(md).toContain('| Condition C | Retrieved | 16 |');
    expect(md).toContain('| F-16 |');
    expect(md).toContain('## Validity gate (Post-Hoc)');
  });

  it('flags validityGate failures for settings drift, unstripped reasoning tags, or non-positive B_vs_A CI', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-gate-test-'));
    try {
      const ledgerPath = path.join(tmpDir, 'run-ledger.json');
      fs.writeFileSync(
        ledgerPath,
        JSON.stringify({
          runs: {
            'drift-run': {
              status: 'completed',
              settings: { reasoningChangedDuringRun: 'on->off', maxTokens: '8192' },
            },
          },
        }),
        'utf8'
      );

      const baseTrials: Trial[] = ['H-001', 'H-002', 'H-003', 'H-004'].flatMap((taskId) => [
        trial('A', taskId, 0.2, false, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
        trial('B', taskId, 0.8, true, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
        trial('C', taskId, 0.7, true, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
      ]);
      const baseAnalysis = analyzeTrials(baseTrials);

      const driftGate = evaluateValidityGate(baseTrials, baseAnalysis, {}, { runId: 'drift-run', ledgerPath });
      expect(driftGate.postHoc).toBe(true);
      expect(driftGate.settingsConstant).toBe(false);
      expect(driftGate.sanitizerVerified).toBe(true);
      expect(driftGate.bVsAPositiveWithCiExcludingZero).toBe(true);
      expect(driftGate.passed).toBe(false);

      const leakedTrials: Trial[] = [
        trial('A', 'H-001', 0.2, false, { generatedSql: '<thought>leak</thought>CREATE TABLE public.t (id uuid);' }),
        trial('B', 'H-001', 0.8, true, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
      ];
      const leakGate = evaluateValidityGate(leakedTrials, analyzeTrials(leakedTrials));
      expect(leakGate.sanitizerVerified).toBe(false);
      expect(leakGate.passed).toBe(false);

      const nullBvsATrials: Trial[] = ['H-001', 'H-002', 'H-003', 'H-004'].flatMap((taskId, idx) => [
        trial('A', taskId, 0.5, idx % 2 === 0, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
        trial('B', taskId, 0.5, idx % 2 === 0, { generatedSql: 'CREATE TABLE public.t (id uuid);' }),
      ]);
      const zeroGate = evaluateValidityGate(nullBvsATrials, analyzeTrials(nullBvsATrials));
      expect(zeroGate.settingsConstant).toBe(true);
      expect(zeroGate.sanitizerVerified).toBe(true);
      expect(zeroGate.bVsAPositiveWithCiExcludingZero).toBe(false);
      expect(zeroGate.passed).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
