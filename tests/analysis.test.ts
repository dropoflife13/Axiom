import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHypothesisSummary,
  mcnemarExact,
  normalizeAnalysisRun,
  wilson95,
} from '../dashboard/src/lib/analysis';
import { mcnemar, wilson } from '../scripts/analyze-ablation-v2';

describe('Deep Analysis calculations', () => {
  it('matches analyze-ablation-v2 wilson and mcnemar exactly', () => {
    expect(wilson95(66, 120)).toEqual(wilson(66, 120));
    expect(wilson95(0, 0)).toEqual([0, 0]);

    const ref = [true, true, false, false, true, false, true, false];
    const tgt = [false, true, true, false, false, false, true, true];
    const got = mcnemarExact(ref, tgt);
    const expected = mcnemar(ref, tgt);
    expect(got.n).toBe(expected.n);
    expect(got.b).toBe(expected.b);
    expect(got.c).toBe(expected.c);
    expect(got.pValue).toBeCloseTo(expected.pValue, 12);
  });

  it('normalizes run-nemotron-2 snapshot and replicates H3 (+14.4%)', () => {
    const p = path.resolve(process.cwd(), 'dashboard/public/data/run-nemotron-2.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const run = normalizeAnalysisRun(raw, {
      id: 'nemotron-2',
      displayName: 'NEMOTRON 550B',
      accent: '#76b900',
    });

    expect(run.completedTrials).toBe(720);
    expect(run.taskSeries).toHaveLength(120);
    expect(run.taskSeries[0].taskId).toBe('H-001');
    expect(run.taskSeries[119].taskId).toBe('H-120');

    const hyp = buildHypothesisSummary(run);
    expect(hyp.badge).toBe('H3 REPLICATED');
    expect(hyp.headline).toContain('+14.4%');
    expect(run.pairedComparisons.C_vs_C0.mcnemar?.b).toBe(40);
    expect(run.pairedComparisons.C_vs_C0.mcnemar?.c).toBe(9);
  });

  it('normalizes run-glm5-2 snapshot as H3 NULL (−2.4%)', () => {
    const p = path.resolve(process.cwd(), 'dashboard/public/data/run-glm5-2.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const run = normalizeAnalysisRun(raw, {
      id: 'glm5-2',
      displayName: 'GLM-5.3',
      accent: '#2dd4bf',
    });

    expect(run.completedTrials).toBe(720);
    expect(run.taskSeries).toHaveLength(120);

    const hyp = buildHypothesisSummary(run);
    expect(hyp.badge).toBe('H3 NULL');
  });

  it('computes paired stats from raw trials when pairedComparisons is omitted', () => {
    const raw = {
      id: 'partial-test',
      trials: [
        { taskId: 'H-001', condition: 'C', boundFactFraction: 0.5, boundPassed: false, totalTokens: 100 },
        { taskId: 'H-001', condition: 'C0', boundFactFraction: 1.0, boundPassed: true, totalTokens: 120 },
        { taskId: 'H-002', condition: 'C', boundFactFraction: 0.4, boundPassed: false, totalTokens: 110 },
        { taskId: 'H-002', condition: 'C0', boundFactFraction: 0.9, boundPassed: true, totalTokens: 130 },
      ],
    };
    const run = normalizeAnalysisRun(raw, {
      id: 'partial-test',
      displayName: 'PARTIAL',
      accent: '#22d3ee',
    });
    expect(run.conditions.C.n).toBe(2);
    expect(run.conditions.C0.n).toBe(2);
    expect(run.conditions.C0.meanBoundFactFraction).toBeCloseTo(0.95, 5);
    expect(run.pairedComparisons.C_vs_C0.mcnemar?.b).toBe(2);
    expect(run.pairedComparisons.C_vs_C0.mcnemar?.c).toBe(0);
    expect(run.taskSeries).toHaveLength(2);
  });
});
