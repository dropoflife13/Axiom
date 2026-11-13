// scripts/analysis-v3-prep/mixed-model.ts
// Item 7: Exact REML Crossed Random-Effects Linear Mixed-Effects Model
// y_{tfc,k} ~ condition_k + (1 | task) + (1 | fact) + (1 | cell) + (1 | fact:condition)
// Uses Bates et al. (2015, JSS) profiled REML Cholesky formulation over sufficient statistics.
// Read-only on .axiom-state/runs/<validRunId>/checkpoint.json (valid 5 runs only).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VALID_COMPLETED_RUNS = [
  'nemotron-2',
  'gemma4-31b-full',
  'glm5-2',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-full',
  'qwen27b-2',
] as const;

export const CONDITION_LEVELS = ['A', 'D', 'C', 'C0', 'B'] as const;
export type ConditionCode = (typeof CONDITION_LEVELS)[number];

export interface MixedModelObservation {
  y: number;
  conditionIndex: number; // 0 = reference (Intercept)
  groupIndices: number[]; // one index per random-intercept factor, 0-based within factor
}

export interface RandomEffectSummary {
  name: string;
  levels: number;
  theta: number; // sigma_r / sigma_resid
  variance: number;
  stdDev: number;
  iccShare: number;
  blups?: number[];
}

export interface FixedEffectEstimate {
  name: string;
  estimate: number;
  stdError: number;
  ci95: [number, number];
  zStat: number;
  pValue: number;
  cr1StdError?: number;
  cr1Ci95?: [number, number];
  cr1PValue?: number;
}

export interface ContrastEstimate {
  name: string;
  weights: number[];
  estimate: number;
  stdError: number;
  ci95: [number, number];
  zStat: number;
  pValue: number;
  cr1StdError?: number;
  cr1Ci95?: [number, number];
  cr1PValue?: number;
}

export interface CrossedLmmFit {
  nObs: number;
  nFixed: number;
  remlDeviance: number;
  residualVariance: number;
  residualStdDev: number;
  totalVariance: number;
  totalClusteredShare: number;
  randomEffects: RandomEffectSummary[];
  fixedEffects: FixedEffectEstimate[];
  covBeta: number[][];
  covBetaCr1?: number[][];
  beta: number[];
  r2QuadraticForm: number;
}

/**
 * Complementary error function erfc(x) using Abramowitz & Stegun / Cephes-accurate
 * rational Chebyshev approximation (max rel error ~1e-15).
 */
function erfcApprox(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2 - ans;
}

export function normalTwoSidedPValue(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return Math.min(1, Math.max(0, erfcApprox(Math.abs(z) / Math.SQRT2)));
}

/**
 * Dense lower-triangular Cholesky factorization A = L L^T for SPD matrix A (n x n flat Float64Array).
 */
function choleskyLower(a: Float64Array, n: number): Float64Array {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i * n + j];
      for (let k = 0; k < j; k++) {
        sum -= l[i * n + k] * l[j * n + k];
      }
      if (i === j) {
        if (sum <= 1e-15) {
          throw new Error(`Matrix not positive definite at pivot ${i}: sum=${sum}`);
        }
        l[i * n + j] = Math.sqrt(sum);
      } else {
        l[i * n + j] = sum / l[j * n + j];
      }
    }
  }
  return l;
}

/** Solve L * X = B for lower-triangular L (n x n) and B (n x cols). */
function forwardSolveMatrix(l: Float64Array, n: number, b: Float64Array, cols: number): Float64Array {
  const x = new Float64Array(n * cols);
  for (let i = 0; i < n; i++) {
    const diag = l[i * n + i];
    for (let c = 0; c < cols; c++) {
      let sum = b[i * cols + c];
      for (let k = 0; k < i; k++) {
        sum -= l[i * n + k] * x[k * cols + c];
      }
      x[i * cols + c] = sum / diag;
    }
  }
  return x;
}

/** Solve L^T * X = B for lower-triangular L (n x n) and B (n x cols). */
function backwardSolveMatrix(l: Float64Array, n: number, b: Float64Array, cols: number): Float64Array {
  const x = new Float64Array(n * cols);
  for (let i = n - 1; i >= 0; i--) {
    const diag = l[i * n + i];
    for (let c = 0; c < cols; c++) {
      let sum = b[i * cols + c];
      for (let k = i + 1; k < n; k++) {
        sum -= l[k * n + i] * x[k * cols + c];
      }
      x[i * cols + c] = sum / diag;
    }
  }
  return x;
}

interface SufficientStats {
  nObs: number;
  p: number;
  groupSizes: number[];
  q: number;
  offsets: number[];
  xtx: Float64Array; // p x p
  xty: Float64Array; // p
  yty: number;
  ztz: Float64Array; // q x q
  ztx: Float64Array; // q x p
  zty: Float64Array; // q
}

function buildSufficientStats(
  obs: MixedModelObservation[],
  nFixed: number,
  groupSizes: number[]
): SufficientStats {
  const rCount = groupSizes.length;
  const offsets: number[] = [];
  let q = 0;
  for (let r = 0; r < rCount; r++) {
    offsets.push(q);
    q += groupSizes[r];
  }

  const p = nFixed;
  const xtx = new Float64Array(p * p);
  const xty = new Float64Array(p);
  let yty = 0;
  const ztz = new Float64Array(q * q);
  const ztx = new Float64Array(q * p);
  const zty = new Float64Array(q);

  for (const row of obs) {
    const y = row.y;
    const cIdx = row.conditionIndex;
    yty += y * y;

    // X row has 1 in col 0 (intercept) and, if cIdx > 0, 1 in col cIdx
    xtx[0] += 1;
    xty[0] += y;
    if (cIdx > 0) {
      xtx[cIdx * p + 0] += 1;
      xtx[0 * p + cIdx] += 1;
      xtx[cIdx * p + cIdx] += 1;
      xty[cIdx] += y;
    }

    for (let a = 0; a < rCount; a++) {
      const ga = offsets[a] + row.groupIndices[a];
      zty[ga] += y;
      ztx[ga * p + 0] += 1;
      if (cIdx > 0) {
        ztx[ga * p + cIdx] += 1;
      }
      for (let b = 0; b < rCount; b++) {
        const gb = offsets[b] + row.groupIndices[b];
        ztz[ga * q + gb] += 1;
      }
    }
  }

  return { nObs: obs.length, p, groupSizes, q, offsets, xtx, xty, yty, ztz, ztx, zty };
}

interface ProfiledEval {
  deviance: number;
  sigma2: number;
  r2: number;
  beta: Float64Array;
  vHat: Float64Array;
  uXMat: Float64Array; // q x p: Lambda (L^T)^{-1} Rzx, so V^{-1} X = (1/sigma2)*(X - Z * uXMat)
  invSxx: Float64Array; // p x p
  covBeta: number[][];
}

function evaluateProfiledReml(stats: SufficientStats, thetaRaw: number[]): ProfiledEval {
  const { nObs, p, groupSizes, q, offsets, xtx, xty, yty, ztz, ztx, zty } = stats;
  const theta = thetaRaw.map((v) => Math.max(0, v));

  const scale = new Float64Array(q);
  for (let r = 0; r < groupSizes.length; r++) {
    const tr = theta[r];
    const start = offsets[r];
    for (let k = 0; k < groupSizes[r]; k++) {
      scale[start + k] = tr;
    }
  }

  // M = Lambda^T (Z^T Z) Lambda + I_q
  const m = new Float64Array(q * q);
  for (let i = 0; i < q; i++) {
    const si = scale[i];
    for (let j = 0; j <= i; j++) {
      const val = si * scale[j] * ztz[i * q + j] + (i === j ? 1 : 0);
      m[i * q + j] = val;
      m[j * q + i] = val;
    }
  }

  const lMat = choleskyLower(m, q);
  let logDetL = 0;
  for (let i = 0; i < q; i++) {
    logDetL += Math.log(lMat[i * q + i]);
  }

  const scaledZtx = new Float64Array(q * p);
  const scaledZty = new Float64Array(q);
  for (let i = 0; i < q; i++) {
    const si = scale[i];
    scaledZty[i] = si * zty[i];
    for (let j = 0; j < p; j++) {
      scaledZtx[i * p + j] = si * ztx[i * p + j];
    }
  }

  const rzx = forwardSolveMatrix(lMat, q, scaledZtx, p);
  const cu = forwardSolveMatrix(lMat, q, scaledZty, 1);

  // Schur complement Sxx = XtX - Rzx^T Rzx
  const sxx = new Float64Array(p * p);
  const rhsBeta = new Float64Array(p);
  for (let i = 0; i < p; i++) {
    let dotCu = 0;
    for (let r = 0; r < q; r++) dotCu += rzx[r * p + i] * cu[r];
    rhsBeta[i] = xty[i] - dotCu;

    for (let j = 0; j <= i; j++) {
      let dot = 0;
      for (let r = 0; r < q; r++) dot += rzx[r * p + i] * rzx[r * p + j];
      const val = xtx[i * p + j] - dot;
      sxx[i * p + j] = val;
      sxx[j * p + i] = val;
    }
  }

  const lx = choleskyLower(sxx, p);
  let logDetRx = 0;
  for (let i = 0; i < p; i++) {
    logDetRx += Math.log(lx[i * p + i]);
  }

  const yBeta = forwardSolveMatrix(lx, p, rhsBeta, 1);
  const beta = backwardSolveMatrix(lx, p, yBeta, 1);

  // r^2 = y^T y - ||cu||^2 - ||yBeta||^2
  let normCuSq = 0;
  for (let r = 0; r < q; r++) normCuSq += cu[r] * cu[r];
  let normYBetaSq = 0;
  for (let i = 0; i < p; i++) normYBetaSq += yBeta[i] * yBeta[i];
  const r2 = Math.max(1e-12, yty - normCuSq - normYBetaSq);

  const dfResid = nObs - p;
  const sigma2 = r2 / dfResid;
  const deviance = 2 * logDetL + 2 * logDetRx + dfResid * Math.log(sigma2);

  // Random effect vHat: L^T vHat = cu - Rzx * beta
  const rhsV = new Float64Array(q);
  for (let r = 0; r < q; r++) {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += rzx[r * p + j] * beta[j];
    rhsV[r] = cu[r] - pred;
  }
  const vHat = backwardSolveMatrix(lMat, q, rhsV, 1);

  // Random-effect projection of X for exact V^{-1} X = sigma2^{-1}(X - Z * uXMat)
  const uxRaw = backwardSolveMatrix(lMat, q, rzx, p);
  const uXMat = new Float64Array(q * p);
  for (let r = 0; r < q; r++) {
    const sr = scale[r];
    for (let j = 0; j < p; j++) uXMat[r * p + j] = sr * uxRaw[r * p + j];
  }

  // (Sxx)^{-1}: solve Lx Lx^T e_j for j = 0..p-1
  const eye = new Float64Array(p * p);
  for (let j = 0; j < p; j++) eye[j * p + j] = 1;
  const invHalf = forwardSolveMatrix(lx, p, eye, p);
  const invSxx = backwardSolveMatrix(lx, p, invHalf, p);
  const covBeta: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (__, j) => sigma2 * invSxx[i * p + j])
  );

  return { deviance, sigma2, r2, beta, vHat, uXMat, invSxx, covBeta };
}

/**
 * Bounded coordinate + Nelder-Mead simplex optimizer for REML deviance over theta >= 0.
 */
function optimizeTheta(stats: SufficientStats): number[] {
  const k = stats.groupSizes.length;
  const obj = (th: number[]) => evaluateProfiledReml(stats, th.map((x) => Math.max(0, x))).deviance;

  const starts: number[][] = [
    Array(k).fill(0.5),
    Array(k).fill(0.2),
    Array(k).fill(1.0),
    Array(k).fill(0.05),
  ];

  let bestX = starts[0].slice();
  let bestVal = obj(bestX);

  for (const s0 of starts) {
    // Alternating coordinate line-search refinement + Nelder-Mead simplex
    const x = s0.slice();
    let fx = obj(x);
    let step = 0.25;
    for (let round = 0; round < 10; round++) {
      let improved = false;
      for (let d = 0; d < k; d++) {
        for (const dir of [-1, 1]) {
          const cand = x.slice();
          cand[d] = Math.max(0, cand[d] + dir * step);
          const fc = obj(cand);
          if (fc < fx - 1e-10) {
            fx = fc;
            x[d] = cand[d];
            improved = true;
          }
        }
      }
      if (!improved) step *= 0.5;
    }

    // Nelder-Mead local polish
    const simplex: Array<{ pt: number[]; val: number }> = [{ pt: x.slice(), val: fx }];
    for (let d = 0; d < k; d++) {
      const pt = x.slice();
      pt[d] = pt[d] > 0.05 ? pt[d] * 1.15 : 0.05;
      simplex.push({ pt, val: obj(pt) });
    }

    for (let iter = 0; iter < 150; iter++) {
      simplex.sort((a, b) => a.val - b.val);
      if (simplex[k].val - simplex[0].val < 1e-10) break;

      const centroid = Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        for (let d = 0; d < k; d++) centroid[d] += simplex[i].pt[d] / k;
      }

      const worst = simplex[k];
      const reflect = centroid.map((c, d) => Math.max(0, c + 1.0 * (c - worst.pt[d])));
      const fReflect = obj(reflect);

      if (fReflect < simplex[0].val) {
        const expand = centroid.map((c, d) => Math.max(0, c + 2.0 * (reflect[d] - c)));
        const fExpand = obj(expand);
        simplex[k] = fExpand < fReflect ? { pt: expand, val: fExpand } : { pt: reflect, val: fReflect };
      } else if (fReflect < simplex[k - 1].val) {
        simplex[k] = { pt: reflect, val: fReflect };
      } else {
        const contract =
          fReflect < worst.val
            ? centroid.map((c, d) => Math.max(0, c + 0.5 * (reflect[d] - c)))
            : centroid.map((c, d) => Math.max(0, c + 0.5 * (worst.pt[d] - c)));
        const fContract = obj(contract);
        if (fContract < worst.val) {
          simplex[k] = { pt: contract, val: fContract };
        } else {
          for (let i = 1; i <= k; i++) {
            simplex[i].pt = simplex[i].pt.map((v, d) => Math.max(0, 0.5 * (v + simplex[0].pt[d])));
            simplex[i].val = obj(simplex[i].pt);
          }
        }
      }
    }

    simplex.sort((a, b) => a.val - b.val);
    // Snap negligible near-zero boundary estimates cleanly to 0 if improvement <= 1e-7
    const candBest = simplex[0].pt.map((v) => (v < 1e-4 ? 0 : v));
    const fSnap = obj(candBest);
    const chosenPt = fSnap <= simplex[0].val + 1e-7 ? candBest : simplex[0].pt;
    const chosenVal = fSnap <= simplex[0].val + 1e-7 ? fSnap : simplex[0].val;

    if (chosenVal < bestVal) {
      bestVal = chosenVal;
      bestX = chosenPt;
    }
  }

  return bestX;
}

export function fitCrossedRandomInterceptLmm(params: {
  observations: MixedModelObservation[];
  fixedNames: string[];
  randomEffectsSpec: Array<{ name: string; levels: number }>;
  clusterFactorIndex?: number; // e.g., 0 = task cluster for CR1 sandwich sensitivity SE
}): CrossedLmmFit {
  const { observations, fixedNames, randomEffectsSpec, clusterFactorIndex = 0 } = params;
  const groupSizes = randomEffectsSpec.map((r) => r.levels);
  const stats = buildSufficientStats(observations, fixedNames.length, groupSizes);
  const optTheta = optimizeTheta(stats);
  const res = evaluateProfiledReml(stats, optTheta);

  const reVars = optTheta.map((t) => t * t * res.sigma2);
  const totalVariance = res.sigma2 + reVars.reduce((s, v) => s + v, 0);

  const randomEffects: RandomEffectSummary[] = randomEffectsSpec.map((spec, idx) => {
    const start = stats.offsets[idx];
    const blups = Array.from({ length: spec.levels }, (_, k) => optTheta[idx] * res.vHat[start + k]);
    return {
      name: spec.name,
      levels: spec.levels,
      theta: optTheta[idx],
      variance: reVars[idx],
      stdDev: Math.sqrt(reVars[idx]),
      iccShare: totalVariance > 0 ? reVars[idx] / totalVariance : 0,
      blups,
    };
  });

  // Compute exact CR1 cluster-robust sandwich Cov(beta) grouped by clusterFactorIndex (e.g. 120 independent tasks)
  const p = fixedNames.length;
  const nClusters = groupSizes[clusterFactorIndex];
  const clusterScores = Array.from({ length: nClusters }, () => new Float64Array(p));
  for (const row of observations) {
    const cIdx = row.conditionIndex;
    let zu = 0;
    const zUx = new Float64Array(p);
    for (let r = 0; r < groupSizes.length; r++) {
      const g = stats.offsets[r] + row.groupIndices[r];
      zu += optTheta[r] * res.vHat[g];
      for (let j = 0; j < p; j++) zUx[j] += res.uXMat[g * p + j];
    }
    const xb = res.beta[0] + (cIdx > 0 ? res.beta[cIdx] : 0);
    const rTilde = row.y - xb - zu;
    const cl = row.groupIndices[clusterFactorIndex];
    clusterScores[cl][0] += (1 - zUx[0]) * rTilde;
    for (let j = 1; j < p; j++) {
      const xj = cIdx === j ? 1 : 0;
      clusterScores[cl][j] += (xj - zUx[j]) * rTilde;
    }
  }

  const meat: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const cr1Scale = nClusters > 1 ? nClusters / (nClusters - 1) : 1;
  for (let c = 0; c < nClusters; c++) {
    const sc = clusterScores[c];
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        meat[i][j] += cr1Scale * sc[i] * sc[j];
      }
    }
  }
  // covBetaCr1 = invSxx * meat * invSxx
  const tmpM: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += res.invSxx[i * p + k] * meat[k][j];
      tmpM[i][j] = s;
    }
  }
  const covBetaCr1: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += tmpM[i][k] * res.invSxx[k * p + j];
      covBetaCr1[i][j] = s;
    }
  }

  const beta = Array.from(res.beta);
  const fixedEffects: FixedEffectEstimate[] = fixedNames.map((name, j) => {
    const est = beta[j];
    const se = Math.sqrt(Math.max(0, res.covBeta[j][j]));
    const zStat = se > 0 ? est / se : 0;
    const cr1Se = Math.sqrt(Math.max(0, covBetaCr1[j][j]));
    const cr1Z = cr1Se > 0 ? est / cr1Se : 0;
    return {
      name,
      estimate: est,
      stdError: se,
      ci95: [est - 1.95996398454 * se, est + 1.95996398454 * se],
      zStat,
      pValue: normalTwoSidedPValue(zStat),
      cr1StdError: cr1Se,
      cr1Ci95: [est - 1.95996398454 * cr1Se, est + 1.95996398454 * cr1Se],
      cr1PValue: normalTwoSidedPValue(cr1Z),
    };
  });

  return {
    nObs: observations.length,
    nFixed: fixedNames.length,
    remlDeviance: res.deviance,
    residualVariance: res.sigma2,
    residualStdDev: Math.sqrt(res.sigma2),
    totalVariance,
    totalClusteredShare: totalVariance > 0 ? (totalVariance - res.sigma2) / totalVariance : 0,
    randomEffects,
    fixedEffects,
    covBeta: res.covBeta,
    covBetaCr1,
    beta,
    r2QuadraticForm: res.r2,
  };
}

export function computeContrast(
  fit: CrossedLmmFit,
  name: string,
  weights: number[]
): ContrastEstimate {
  let est = 0;
  for (let i = 0; i < weights.length; i++) est += weights[i] * fit.beta[i];
  let varEst = 0;
  let varCr1 = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      varEst += weights[i] * weights[j] * fit.covBeta[i][j];
      if (fit.covBetaCr1) {
        varCr1 += weights[i] * weights[j] * fit.covBetaCr1[i][j];
      }
    }
  }
  const se = Math.sqrt(Math.max(0, varEst));
  const zStat = se > 0 ? est / se : 0;
  const cr1Se = fit.covBetaCr1 ? Math.sqrt(Math.max(0, varCr1)) : undefined;
  const cr1Z = cr1Se && cr1Se > 0 ? est / cr1Se : 0;
  return {
    name,
    weights,
    estimate: est,
    stdError: se,
    ci95: [est - 1.95996398454 * se, est + 1.95996398454 * se],
    zStat,
    pValue: normalTwoSidedPValue(zStat),
    ...(cr1Se !== undefined
      ? {
          cr1StdError: cr1Se,
          cr1Ci95: [est - 1.95996398454 * cr1Se, est + 1.95996398454 * cr1Se],
          cr1PValue: normalTwoSidedPValue(cr1Z),
        }
      : {}),
  };
}

interface TrialRecordLite {
  condition: ConditionCode;
  taskId: string;
  boundFacts: string[];
  failedFacts: string[];
  tableMissing?: boolean;
}

interface TaskItemLite {
  id: string;
  features: { tenant: boolean; append_only: boolean; ingestion: boolean };
}

function didFactPass(t: TrialRecordLite, factId: string): boolean {
  const failed = new Set(t.failedFacts ?? []);
  if (t.tableMissing || failed.has('F-13')) return false;
  return !failed.has(factId);
}

function main() {
  const tasksRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures/task-v2/tasks.json'), 'utf-8')
  ) as { test: TaskItemLite[] };
  const testTaskMap = new Map(tasksRaw.test.map((t) => [t.id, t]));

  const runsSummary: Record<string, any> = {};
  const fixedNames = ['Intercept (A)', 'D - A', 'C - A', 'C0 - A', 'B - A'];

  for (const runId of VALID_COMPLETED_RUNS) {
    const cpPath = path.resolve(`.axiom-state/runs/${runId}/checkpoint.json`);
    if (!fs.existsSync(cpPath)) {
      throw new Error(`Missing checkpoint for valid run ${runId}: ${cpPath}`);
    }
    const cp = JSON.parse(fs.readFileSync(cpPath, 'utf-8')) as {
      trials: Record<string, TrialRecordLite>;
    };
    const trials = Object.values(cp.trials);

    const taskIndex = new Map<string, number>();
    const factIndex = new Map<string, number>();
    const cellIndex = new Map<string, number>();
    const factCondIndex = new Map<string, number>();

    const getIdx = (map: Map<string, number>, key: string) => {
      let v = map.get(key);
      if (v === undefined) {
        v = map.size;
        map.set(key, v);
      }
      return v;
    };

    const observations: MixedModelObservation[] = [];
    const condMap = new Map<ConditionCode, number>(
      CONDITION_LEVELS.map((c, idx) => [c, idx])
    );

    // Count unique bound (task, fact) pairs
    const pairSet = new Set<string>();

    for (const t of trials) {
      const cIdx = condMap.get(t.condition);
      if (cIdx === undefined) continue;
      const taskMeta = testTaskMap.get(t.taskId);
      if (!taskMeta) continue;
      const cellKey =
        (taskMeta.features.tenant ? '1' : '0') +
        (taskMeta.features.append_only ? '1' : '0') +
        (taskMeta.features.ingestion ? '1' : '0');

      const ti = getIdx(taskIndex, t.taskId);
      const ci = getIdx(cellIndex, cellKey);
      for (const fid of t.boundFacts ?? []) {
        const fi = getIdx(factIndex, fid);
        const fci = getIdx(factCondIndex, `${fid}::${t.condition}`);
        pairSet.add(`${t.taskId}::${fid}`);
        observations.push({
          y: didFactPass(t, fid) ? 1 : 0,
          conditionIndex: cIdx,
          groupIndices: [ti, fi, ci, fci],
        });
      }
    }

    const fit = fitCrossedRandomInterceptLmm({
      observations,
      fixedNames,
      randomEffectsSpec: [
        { name: 'task', levels: taskIndex.size },
        { name: 'fact', levels: factIndex.size },
        { name: 'cell', levels: cellIndex.size },
        { name: 'fact:condition', levels: factCondIndex.size },
      ],
    });

    const contrasts = [
      computeContrast(fit, 'D - A', [0, 1, 0, 0, 0]),
      computeContrast(fit, 'C - A', [0, 0, 1, 0, 0]),
      computeContrast(fit, 'C0 - A', [0, 0, 0, 1, 0]),
      computeContrast(fit, 'B - A', [0, 0, 0, 0, 1]),
      computeContrast(fit, 'C0 - C', [0, 0, -1, 1, 0]),
      computeContrast(fit, 'C - D', [0, -1, 1, 0, 0]),
      computeContrast(fit, 'B - C0', [0, 0, 0, -1, 1]),
    ];

    // Strip BLUP arrays from JSON summary to keep output readable
    runsSummary[runId] = {
      nPairs: pairSet.size,
      nObs: fit.nObs,
      remlDeviance: +fit.remlDeviance.toFixed(4),
      residualVariance: +fit.residualVariance.toFixed(6),
      residualStdDev: +fit.residualStdDev.toFixed(4),
      totalVariance: +fit.totalVariance.toFixed(6),
      totalClusteredSharePct: +(fit.totalClusteredShare * 100).toFixed(2),
      randomEffects: fit.randomEffects.map((re) => ({
        name: re.name,
        levels: re.levels,
        variance: +re.variance.toFixed(6),
        stdDev: +re.stdDev.toFixed(4),
        iccPct: +(re.iccShare * 100).toFixed(2),
      })),
      fixedEffectsPts: fit.fixedEffects.map((fe) => ({
        name: fe.name,
        estPts: +(fe.estimate * 100).toFixed(2),
        sePts: +(fe.stdError * 100).toFixed(2),
        ci95Pts: [+(fe.ci95[0] * 100).toFixed(2), +(fe.ci95[1] * 100).toFixed(2)],
        zStat: +fe.zStat.toFixed(2),
        pValue: fe.pValue,
        cr1SePts: fe.cr1StdError !== undefined ? +(fe.cr1StdError * 100).toFixed(2) : null,
        cr1Ci95Pts: fe.cr1Ci95
          ? [+(fe.cr1Ci95[0] * 100).toFixed(2), +(fe.cr1Ci95[1] * 100).toFixed(2)]
          : null,
        cr1PValue: fe.cr1PValue ?? null,
      })),
      contrastsPts: contrasts.map((ct) => ({
        name: ct.name,
        estPts: +(ct.estimate * 100).toFixed(2),
        sePts: +(ct.stdError * 100).toFixed(2),
        ci95Pts: [+(ct.ci95[0] * 100).toFixed(2), +(ct.ci95[1] * 100).toFixed(2)],
        zStat: +ct.zStat.toFixed(2),
        pValue: ct.pValue,
        cr1SePts: ct.cr1StdError !== undefined ? +(ct.cr1StdError * 100).toFixed(2) : null,
        cr1Ci95Pts: ct.cr1Ci95
          ? [+(ct.cr1Ci95[0] * 100).toFixed(2), +(ct.cr1Ci95[1] * 100).toFixed(2)]
          : null,
        cr1PValue: ct.cr1PValue ?? null,
      })),
    };
  }

  const outDir = path.resolve('out/analysis-v3-prep');
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    modelFormula: 'y ~ condition + (1 | task) + (1 | fact) + (1 | cell) + (1 | fact:condition) [REML, ref = A]',
    validRunsOnly: VALID_COMPLETED_RUNS,
    runs: runsSummary,
  };
  fs.writeFileSync(
    path.join(outDir, 'item-7-mixed-model.json'),
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
  console.log('Saved out/analysis-v3-prep/item-7-mixed-model.json');
  for (const runId of VALID_COMPLETED_RUNS) {
    const r = runsSummary[runId];
    console.log(`\n=== MIXED MODEL (REML): ${runId} (pairs=${r.nPairs}, obs=${r.nObs}) ===`);
    console.log(
      'Variance / ICCs:',
      r.randomEffects
        .map((re: any) => `${re.name}(k=${re.levels}): sd=${re.stdDev}, icc=${re.iccPct}%`)
        .join(' | '),
      `| resid: sd=${r.residualStdDev} | clustered=${r.totalClusteredSharePct}%`
    );
    console.log(
      'Contrasts (pp):',
      r.contrastsPts
        .map(
          (c: any) =>
            `${c.name}: ${c.estPts >= 0 ? '+' : ''}${c.estPts} (REML SE=${c.sePts}, CI [${c.ci95Pts[0]}, ${c.ci95Pts[1]}], p=${c.pValue < 1e-4 ? '<0.0001' : c.pValue.toFixed(4)} | CR1-task SE=${c.cr1SePts}, CI [${c.cr1Ci95Pts[0]}, ${c.cr1Ci95Pts[1]}], p=${c.cr1PValue < 1e-4 ? '<0.0001' : c.cr1PValue.toFixed(4)})`
        )
        .join('\n  ')
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
