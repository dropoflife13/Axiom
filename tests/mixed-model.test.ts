import { describe, expect, it } from 'vitest';
import {
  computeContrast,
  fitCrossedRandomInterceptLmm,
  normalTwoSidedPValue,
  type MixedModelObservation,
} from '../scripts/analysis-v3-prep/mixed-model.js';

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe('crossed random-intercept mixed model (REML)', () => {
  it('computes accurate two-sided normal p-values', () => {
    expect(normalTwoSidedPValue(0)).toBeCloseTo(1, 6);
    expect(normalTwoSidedPValue(1.959964)).toBeCloseTo(0.05, 5);
    expect(normalTwoSidedPValue(-2.575829)).toBeCloseTo(0.01, 4);
    expect(normalTwoSidedPValue(5)).toBeLessThan(1e-6);
  });

  it('recovers planted fixed effects, contrasts, and crossed variance components', () => {
    const rng = createRng(20261111);
    const nCells = 8;
    const tasksPerCell = 15;
    const nTasks = nCells * tasksPerCell; // 120
    const nFacts = 20;
    const nConds = 5;

    const trueBeta = [0.35, 0.02, 0.25, 0.4, 0.5]; // A, D-A, C-A, C0-A, B-A
    const sdTask = 0.22;
    const sdFact = 0.31;
    const sdCell = 0.16;
    const sdResid = 0.24;

    const uTask = Array.from({ length: nTasks }, () => sdTask * sampleNormal(rng));
    const uFact = Array.from({ length: nFacts }, () => sdFact * sampleNormal(rng));
    const uCell = Array.from({ length: nCells }, () => sdCell * sampleNormal(rng));

    const obs: MixedModelObservation[] = [];
    for (let t = 0; t < nTasks; t++) {
      const cell = Math.floor(t / tasksPerCell);
      // 4 distinct facts per task, crossing across tasks
      const factIds = Array.from({ length: 4 }, (_, k) => (t * 3 + k * 5) % nFacts);
      for (const f of factIds) {
        for (let c = 0; c < nConds; c++) {
          const fixedMean = trueBeta[0] + (c > 0 ? trueBeta[c] : 0);
          const y = fixedMean + uTask[t] + uFact[f] + uCell[cell] + sdResid * sampleNormal(rng);
          obs.push({ y, conditionIndex: c, groupIndices: [t, f, cell] });
        }
      }
    }

    const fit = fitCrossedRandomInterceptLmm({
      observations: obs,
      fixedNames: ['Intercept (A)', 'D - A', 'C - A', 'C0 - A', 'B - A'],
      randomEffectsSpec: [
        { name: 'task', levels: nTasks },
        { name: 'fact', levels: nFacts },
        { name: 'cell', levels: nCells },
      ],
    });

    expect(fit.nObs).toBe(2400);
    // Contrast effects vary within task-fact pair -> very high precision
    expect(fit.fixedEffects[1].estimate).toBeCloseTo(0.02, 1);
    expect(Math.abs(fit.fixedEffects[2].estimate - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(fit.fixedEffects[3].estimate - 0.4)).toBeLessThan(0.03);
    expect(Math.abs(fit.fixedEffects[4].estimate - 0.5)).toBeLessThan(0.03);

    const c0MinusC = computeContrast(fit, 'C0 - C', [0, 0, -1, 1, 0]);
    expect(Math.abs(c0MinusC.estimate - 0.15)).toBeLessThan(0.03);
    expect(c0MinusC.stdError).toBeGreaterThan(0);
    expect(c0MinusC.pValue).toBeLessThan(1e-6);

    // Random effect SDs recovered close to true DGP values
    expect(fit.residualStdDev).toBeCloseTo(sdResid, 1);
    expect(Math.abs(fit.randomEffects[0].stdDev - sdTask)).toBeLessThan(0.06);
    expect(Math.abs(fit.randomEffects[1].stdDev - sdFact)).toBeLessThan(0.1);
    expect(Math.abs(fit.randomEffects[2].stdDev - sdCell)).toBeLessThan(0.12);
    expect(fit.totalClusteredShare).toBeGreaterThan(0.5);
  });

  it('handles zero-variance boundary cleanly and detects clustered binary null vs signal', () => {
    const rng = createRng(991177);
    const nTasks = 60;
    const nFacts = 15;
    const nCells = 4;

    // Boundary case: cell variance = 0 identically; binary clustered outcomes under null vs signal
    const uTask = Array.from({ length: nTasks }, () => 0.7 * sampleNormal(rng));
    const uFact = Array.from({ length: nFacts }, () => 0.9 * sampleNormal(rng));

    const obsNull: MixedModelObservation[] = [];
    const obsSig: MixedModelObservation[] = [];
    const latentShift = [0, 0.0, 0.7, 1.3, 1.6];

    for (let t = 0; t < nTasks; t++) {
      const cell = t % nCells;
      for (let k = 0; k < 4; k++) {
        const f = (t + k * 4) % nFacts;
        for (let c = 0; c < 5; c++) {
          const epsNull = sampleNormal(rng);
          const yNull = -0.2 + uTask[t] + uFact[f] + epsNull > 0 ? 1 : 0;
          obsNull.push({ y: yNull, conditionIndex: c, groupIndices: [t, f, cell] });

          const epsSig = sampleNormal(rng);
          const ySig = -0.5 + latentShift[c] + uTask[t] + uFact[f] + epsSig > 0 ? 1 : 0;
          obsSig.push({ y: ySig, conditionIndex: c, groupIndices: [t, f, cell] });
        }
      }
    }

    const fitNull = fitCrossedRandomInterceptLmm({
      observations: obsNull,
      fixedNames: ['A', 'D-A', 'C-A', 'C0-A', 'B-A'],
      randomEffectsSpec: [
        { name: 'task', levels: nTasks },
        { name: 'fact', levels: nFacts },
        { name: 'cell', levels: nCells },
      ],
    });

    expect(Number.isFinite(fitNull.remlDeviance)).toBe(true);
    expect(fitNull.randomEffects[2].variance).toBeLessThan(0.02);
    expect(Math.abs(fitNull.fixedEffects[3].estimate)).toBeLessThan(0.06);
    expect(fitNull.randomEffects[0].iccShare).toBeGreaterThan(0.05);
    expect(fitNull.randomEffects[1].iccShare).toBeGreaterThan(0.05);

    const fitSig = fitCrossedRandomInterceptLmm({
      observations: obsSig,
      fixedNames: ['A', 'D-A', 'C-A', 'C0-A', 'B-A'],
      randomEffectsSpec: [
        { name: 'task', levels: nTasks },
        { name: 'fact', levels: nFacts },
        { name: 'cell', levels: nCells },
      ],
    });

    const c0MinusC = computeContrast(fitSig, 'C0 - C', [0, 0, -1, 1, 0]);
    expect(fitSig.fixedEffects[2].estimate).toBeGreaterThan(0.1);
    expect(fitSig.fixedEffects[3].estimate).toBeGreaterThan(0.2);
    expect(c0MinusC.estimate).toBeGreaterThan(0.05);
    expect(c0MinusC.pValue).toBeLessThan(0.001);
  });

  it('captures trial-level correlated shocks via task CR1 cluster-robust SEs', () => {
    const rng = createRng(424242);
    const nTasks = 100;
    const nFacts = 16;
    const nCells = 8;

    const uTask = Array.from({ length: nTasks }, () => 0.15 * sampleNormal(rng));
    const uFact = Array.from({ length: nFacts }, () => 0.2 * sampleNormal(rng));
    const obs: MixedModelObservation[] = [];

    for (let t = 0; t < nTasks; t++) {
      const cell = t % nCells;
      for (let c = 0; c < 5; c++) {
        // Strong shared (task, condition) trial shock affecting all 4 bound facts simultaneously
        const trialShock = 0.45 * sampleNormal(rng);
        for (let k = 0; k < 4; k++) {
          const f = (t + k * 3) % nFacts;
          const y = 0.5 + (c === 3 ? 0.15 : 0) + uTask[t] + uFact[f] + trialShock + 0.1 * sampleNormal(rng);
          obs.push({ y, conditionIndex: c, groupIndices: [t, f, cell] });
        }
      }
    }

    const fit = fitCrossedRandomInterceptLmm({
      observations: obs,
      fixedNames: ['A', 'D-A', 'C-A', 'C0-A', 'B-A'],
      randomEffectsSpec: [
        { name: 'task', levels: nTasks },
        { name: 'fact', levels: nFacts },
        { name: 'cell', levels: nCells },
      ],
    });

    const c0MinusC = computeContrast(fit, 'C0 - C', [0, 0, -1, 1, 0]);
    // With 4 facts per trial sharing a common trial shock, CR1 SE must be substantially larger than naive REML SE
    expect(c0MinusC.cr1StdError).toBeDefined();
    expect(c0MinusC.cr1StdError!).toBeGreaterThan(c0MinusC.stdError * 1.4);
  });
});
