import fs from 'node:fs';
import path from 'node:path';
import {
  wilson,
  pairedBootstrap,
  mcnemar,
  holmAdjust,
  exactCellSignFlip,
  formatCellKey,
} from '../analyze-ablation-v2.js';
import {
  classifySqlForensics,
  summarizeForensicsByCondition,
  type ForensicTaskContext,
  type SqlForensicFlagName,
} from '../../src/verifier/sql-forensics.js';
import {
  V3_CONDITIONS,
  type ConditionV3Id,
  type RunMetadataV3,
  type TrialV3,
} from '../../src/eval/ablation-v3.js';
import type { TaskV2Item } from '../../src/eval/ablation.js';

const BOOTSTRAP_RESAMPLES = 10_000;
const SIGN_FLIP_ITERATIONS = 100_000;
const BOOTSTRAP_SEED = 20260101;

export const REQUIRED_PROVENANCE_HASHES: readonly (keyof RunMetadataV3)[] = Object.freeze([
  'oracleSha256',
  'tasksV3Sha256',
  'factsV2Sha256',
  'factsV3Sha256',
  'memoryV2Sha256',
  'memoryCidSha256',
  'dSafeSha256',
]);

export interface ContrastPairSpec {
  name: string;
  target: ConditionV3Id;
  base: ConditionV3Id;
  primary: boolean;
}

export const V3_CONTRAST_SPECS: readonly ContrastPairSpec[] = Object.freeze([
  // 6 pre-registered primary contrasts (fixed order)
  { name: 'C_ID_vs_C', target: 'C_ID', base: 'C', primary: true },
  { name: 'C0_clean_vs_C0', target: 'C0_clean', base: 'C0', primary: true },
  { name: 'C0_clean_vs_C_ID', target: 'C0_clean', base: 'C_ID', primary: true },
  { name: 'C0_clean_vs_C0_rand', target: 'C0_clean', base: 'C0_rand', primary: true },
  { name: 'C_ID_vs_D_safe', target: 'C_ID', base: 'D_safe', primary: true },
  { name: 'D_safe_vs_A', target: 'D_safe', base: 'A', primary: true },
  // Reference contrasts
  { name: 'C_vs_A', target: 'C', base: 'A', primary: false },
  { name: 'C0_vs_C', target: 'C0', base: 'C', primary: false },
  { name: 'B_vs_A', target: 'B', base: 'A', primary: false },
]);

export const FORENSIC_MEDIATION_FLAGS = [
  'hasInlineSupersedesFk',
  'hasExplicitSupersedesFk',
  'hasHallucinatedLineageCol',
  'hasDuplicatePrimaryKey',
  'hasPublicAuthJwt',
  'hasSingularCompositeIndexName',
] as const satisfies readonly SqlForensicFlagName[];

export interface ConditionSummaryV3 {
  n: number;
  meanBoundFactFraction: number;
  strictPassAt1: number;
  strictPassCount: number;
  strictPassAt1Wilson95: [number, number];
  meanPromptTokens: number;
  meanTotalTokens: number;
  tableMissingCount: number;
  migrationExitNonZeroCount: number;
  forensicCounts: Record<SqlForensicFlagName, number>;
  forensicRates: Record<SqlForensicFlagName, number>;
}

export interface ContrastResultV3 {
  name: string;
  target: ConditionV3Id;
  base: ConditionV3Id;
  primary: boolean;
  nPairs: number;
  meanDifference: number;
  ci95: [number, number];
  signFlipPValue: number;
  holmAdjustedPValue?: number;
  exactCellPValue: number | null;
  holmExactCellPValue?: number | null;
  mcnemar: {
    n01: number;
    n10: number;
    pValue: number;
  };
}

export interface LpmmRandomEffectEstimate {
  name: 'task' | 'fact' | 'cell' | 'fact:condition';
  levels: number;
  variance: number;
  stdDev: number;
  iccPct: number;
}

export interface LpmmContrastEstimate {
  name: string;
  estPts: number;
  sePts: number;
  ci95Pts: [number, number];
  pValue: number;
  cr1SePts: number;
  cr1Ci95Pts: [number, number];
  cr1PValue: number;
}

export interface LpmmResultV3 {
  nObs: number;
  nTasks: number;
  remlDeviance: number;
  residualVariance: number;
  residualStdDev: number;
  totalClusteredSharePct: number;
  randomEffects: LpmmRandomEffectEstimate[];
  contrastsPts: LpmmContrastEstimate[];
}

export interface AblationV3Report {
  protocol: 'Ablation v3';
  partialAllowed: boolean;
  totalTrials: number;
  provenanceVerified: boolean;
  missingProvenanceHashes: string[];
  conditions: Record<ConditionV3Id, ConditionSummaryV3>;
  primaryContrasts: ContrastResultV3[];
  referenceContrasts: ContrastResultV3[];
  distillationGapRecovery: {
    overall: {
      meanC: number;
      meanCId: number;
      meanC0Clean: number;
      numerator: number;
      denominator: number;
      recoveryRatio: number | null;
    };
    appendOnlyCells: {
      cells: string[];
      nTrialsPerCondition: number;
      meanC: number;
      meanCId: number;
      meanC0Clean: number;
      numerator: number;
      denominator: number;
      recoveryRatio: number | null;
    };
  };
  forensicMediationTable: Record<
    ConditionV3Id,
    Record<(typeof FORENSIC_MEDIATION_FLAGS)[number], number>
  >;
  retrievalStratification: {
    retrieved: Record<string, unknown>;
    nonRetrieved: Record<string, unknown>;
    nonRetrievedChecklistOmissions: {
      f05NonRetrievedCount: number;
      f05MissingCreatedAtRateByCondition: Record<string, number>;
      f10MutableNonRetrievedCount: number;
      f10MissingDeletedAtRateByCondition: Record<string, number>;
    };
  };
  cleanIntersectionSensitivity: {
    postTreatmentConditioned: true;
    note: string;
    contrasts: Array<{
      name: string;
      nPairs: number;
      excludedTasks: number;
      meanDifference: number;
      ci95: [number, number];
      signFlipPValue: number;
    }>;
  };
  mixedModel: LpmmResultV3 | null;
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

function twoSidedNormalP(est: number, se: number): number {
  if (!Number.isFinite(se) || se <= 0) return 1;
  const z = Math.abs(est / se);
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(z))));
}

/**
 * Cholesky decomposition of symmetric positive definite matrix A (n x n).
 * Returns lower-triangular L such that A = L L^T, or null if not SPD.
 */
function cholesky(a: Float64Array[], n: number): Float64Array[] | null {
  const l: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) {
        sum -= l[i][k] * l[j][k];
      }
      if (i === j) {
        if (sum <= 1e-12 || !Number.isFinite(sum)) return null;
        l[i][j] = Math.sqrt(sum);
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  return l;
}

function solveCholesky(l: Float64Array[], b: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i][k] * y[k];
    y[i] = sum / l[i][i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= l[k][i] * x[k];
    x[i] = sum / l[i][i];
  }
  return x;
}

function invertFromCholesky(l: Float64Array[], n: number): Float64Array[] {
  const inv: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  const e = new Float64Array(n);
  for (let col = 0; col < n; col++) {
    e.fill(0);
    e[col] = 1;
    const x = solveCholesky(l, e, n);
    for (let row = 0; row < n; row++) inv[row][col] = x[row];
  }
  return inv;
}

function nelderMead(
  fn: (x: number[]) => number,
  x0: number[],
  maxIter = 220
): { x: number[]; fx: number } {
  const n = x0.length;
  const simplex: Array<{ x: number[]; fx: number }> = [{ x: [...x0], fx: fn(x0) }];
  for (let i = 0; i < n; i++) {
    const xi = [...x0];
    xi[i] = xi[i] + 0.5;
    simplex.push({ x: xi, fx: fn(xi) });
  }

  for (let iter = 0; iter < maxIter; iter++) {
    simplex.sort((a, b) => a.fx - b.fx);
    const best = simplex[0];
    const worst = simplex[n];
    const secondWorst = simplex[n - 1];

    let spread = 0;
    for (let i = 1; i <= n; i++) {
      spread = Math.max(spread, Math.abs(simplex[i].fx - best.fx));
    }
    if (spread < 1e-6) break;

    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    }

    const reflect = centroid.map((c, j) => c + (c - worst.x[j]));
    const fReflect = fn(reflect);
    if (fReflect < best.fx) {
      const expand = centroid.map((c, j) => c + 2 * (reflect[j] - c));
      const fExpand = fn(expand);
      simplex[n] = fExpand < fReflect ? { x: expand, fx: fExpand } : { x: reflect, fx: fReflect };
      continue;
    }
    if (fReflect < secondWorst.fx) {
      simplex[n] = { x: reflect, fx: fReflect };
      continue;
    }
    const contract =
      fReflect < worst.fx
        ? centroid.map((c, j) => c + 0.5 * (reflect[j] - c))
        : centroid.map((c, j) => c + 0.5 * (worst.x[j] - c));
    const fContract = fn(contract);
    if (fContract < Math.min(fReflect, worst.fx)) {
      simplex[n] = { x: contract, fx: fContract };
      continue;
    }
    for (let i = 1; i <= n; i++) {
      const shrunk = simplex[i].x.map((v, j) => best.x[j] + 0.5 * (v - best.x[j]));
      simplex[i] = { x: shrunk, fx: fn(shrunk) };
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  return simplex[0];
}

/**
 * Fits the 8-condition REML Linear Probability Mixed Model:
 *   y ~ condition + (1|task) + (1|fact) + (1|cell) + (1|fact:condition)
 * using Woodbury identity on Z (sparse 4-component random effect design) and
 * computes CR1 task-clustered sandwich standard errors.
 */
export function fitAblationV3Lpmm(
  trials: readonly TrialV3[],
  taskLookup: ReadonlyMap<string, TaskV2Item>
): LpmmResultV3 | null {
  interface ObsRow {
    y: number;
    condIdx: number;
    taskIdx: number;
    factIdx: number;
    cellIdx: number;
    factCondIdx: number;
  }

  const condIndex = new Map<ConditionV3Id, number>();
  V3_CONDITIONS.forEach((c, idx) => condIndex.set(c, idx));

  const taskMap = new Map<string, number>();
  const factMap = new Map<string, number>();
  const cellMap = new Map<string, number>();
  const factCondMap = new Map<string, number>();
  const rows: ObsRow[] = [];

  for (const trial of trials) {
    const cIdx = condIndex.get(trial.condition);
    if (cIdx === undefined) continue;
    const task = taskLookup.get(trial.taskId);
    const features = (trial as TrialV3 & { features?: TaskV2Item['features'] }).features ?? task?.features;
    const cellKey = features ? formatCellKey(features) : 'unknown';

    if (!taskMap.has(trial.taskId)) taskMap.set(trial.taskId, taskMap.size);
    if (!cellMap.has(cellKey)) cellMap.set(cellKey, cellMap.size);

    const tIdx = taskMap.get(trial.taskId)!;
    const clIdx = cellMap.get(cellKey)!;
    const failedSet = new Set(trial.failedFacts ?? []);

    for (const factId of trial.boundFacts ?? []) {
      if (!factMap.has(factId)) factMap.set(factId, factMap.size);
      const fIdx = factMap.get(factId)!;
      const fcKey = `${factId}::${trial.condition}`;
      if (!factCondMap.has(fcKey)) factCondMap.set(fcKey, factCondMap.size);
      const fcIdx = factCondMap.get(fcKey)!;

      const passed = !trial.tableMissing && !failedSet.has(factId);
      rows.push({
        y: passed ? 1 : 0,
        condIdx: cIdx,
        taskIdx: tIdx,
        factIdx: fIdx,
        cellIdx: clIdx,
        factCondIdx: fcIdx,
      });
    }
  }

  const N = rows.length;
  const p = V3_CONDITIONS.length;
  const qTask = taskMap.size;
  const qFact = factMap.size;
  const qCell = cellMap.size;
  const qFactCond = factCondMap.size;
  if (N === 0 || qTask < 2) return null;

  const offFact = qTask;
  const offCell = offFact + qFact;
  const offFactCond = offCell + qCell;
  const qTotal = offFactCond + qFactCond;

  // Precompute Z^T Z (sparse counts) and Z^T X, Z^T y, X^T X, X^T y, y^T y
  const ztzRows: Array<Array<{ col: number; val: number }>> = Array.from(
    { length: qTotal },
    () => []
  );
  const ztzCount = Array.from({ length: qTotal }, () => new Map<number, number>());
  const ztx: Float64Array[] = Array.from({ length: qTotal }, () => new Float64Array(p));
  const zty = new Float64Array(qTotal);
  const xtx: Float64Array[] = Array.from({ length: p }, () => new Float64Array(p));
  const xty = new Float64Array(p);
  let yty = 0;

  const incZtz = (a: number, b: number) => {
    ztzCount[a].set(b, (ztzCount[a].get(b) ?? 0) + 1);
  };

  for (const r of rows) {
    const idxs = [
      r.taskIdx,
      offFact + r.factIdx,
      offCell + r.cellIdx,
      offFactCond + r.factCondIdx,
    ];
    for (const a of idxs) {
      for (const b of idxs) incZtz(a, b);
      // X has intercept (col 0) and dummy for condIdx >= 1
      ztx[a][0] += 1;
      if (r.condIdx > 0) ztx[a][r.condIdx] += 1;
      zty[a] += r.y;
    }
    xtx[0][0] += 1;
    if (r.condIdx > 0) {
      xtx[0][r.condIdx] += 1;
      xtx[r.condIdx][0] += 1;
      xtx[r.condIdx][r.condIdx] += 1;
      xty[r.condIdx] += r.y;
    }
    xty[0] += r.y;
    yty += r.y * r.y;
  }

  for (let i = 0; i < qTotal; i++) {
    for (const [col, val] of ztzCount[i].entries()) {
      ztzRows[i].push({ col, val });
    }
  }

  const sdVec = new Float64Array(qTotal);
  const mMat: Float64Array[] = Array.from({ length: qTotal }, () => new Float64Array(qTotal));

  function evalReml(params: number[], computeDetails = false) {
    const sigmaE2 = Math.exp(Math.max(-14, Math.min(4, params[0])));
    const vTask = Math.exp(Math.max(-16, Math.min(4, params[1])));
    const vFact = Math.exp(Math.max(-16, Math.min(4, params[2])));
    const vCell = Math.exp(Math.max(-16, Math.min(4, params[3])));
    const vFactCond = Math.exp(Math.max(-16, Math.min(4, params[4])));

    const sTask = Math.sqrt(vTask);
    const sFact = Math.sqrt(vFact);
    const sCell = Math.sqrt(vCell);
    const sFactCond = Math.sqrt(vFactCond);

    for (let i = 0; i < qTask; i++) sdVec[i] = sTask;
    for (let i = offFact; i < offCell; i++) sdVec[i] = sFact;
    for (let i = offCell; i < offFactCond; i++) sdVec[i] = sCell;
    for (let i = offFactCond; i < qTotal; i++) sdVec[i] = sFactCond;

    for (let i = 0; i < qTotal; i++) {
      mMat[i].fill(0);
      mMat[i][i] = 1;
      const si = sdVec[i] / sigmaE2;
      for (const entry of ztzRows[i]) {
        mMat[i][entry.col] += si * entry.val * sdVec[entry.col];
      }
    }

    const lM = cholesky(mMat, qTotal);
    if (!lM) return { deviance: 1e12, beta: null, xtvInvXInv: null, alpha: null, sigmaE2, vars: [vTask, vFact, vCell, vFactCond] };

    let logDetM = 0;
    for (let i = 0; i < qTotal; i++) logDetM += 2 * Math.log(lM[i][i]);
    const logDetV = N * Math.log(sigmaE2) + logDetM;

    // Solve M^{-1} (D^{1/2} Z^T X) and M^{-1} (D^{1/2} Z^T y)
    const rhsY = new Float64Array(qTotal);
    for (let i = 0; i < qTotal; i++) rhsY[i] = sdVec[i] * zty[i];
    const solY = solveCholesky(lM, rhsY, qTotal);

    const solX: Float64Array[] = Array.from({ length: p }, () => new Float64Array(qTotal));
    const rhsXCol = new Float64Array(qTotal);
    for (let c = 0; c < p; c++) {
      for (let i = 0; i < qTotal; i++) rhsXCol[i] = sdVec[i] * ztx[i][c];
      solX[c] = solveCholesky(lM, rhsXCol, qTotal);
    }

    const invS2 = 1 / sigmaE2;
    const invS4 = invS2 * invS2;

    const xtvInvX: Float64Array[] = Array.from({ length: p }, () => new Float64Array(p));
    const xtvInvY = new Float64Array(p);
    for (let a = 0; a < p; a++) {
      let sumY = xty[a] * invS2;
      for (let i = 0; i < qTotal; i++) {
        sumY -= invS4 * sdVec[i] * ztx[i][a] * solY[i];
      }
      xtvInvY[a] = sumY;
      for (let b = 0; b <= a; b++) {
        let sumX = xtx[a][b] * invS2;
        for (let i = 0; i < qTotal; i++) {
          sumX -= invS4 * sdVec[i] * ztx[i][a] * solX[b][i];
        }
        xtvInvX[a][b] = sumX;
        xtvInvX[b][a] = sumX;
      }
    }

    const lX = cholesky(xtvInvX, p);
    if (!lX) return { deviance: 1e12, beta: null, xtvInvXInv: null, alpha: null, sigmaE2, vars: [vTask, vFact, vCell, vFactCond] };

    let logDetXtVX = 0;
    for (let i = 0; i < p; i++) logDetXtVX += 2 * Math.log(lX[i][i]);

    const beta = solveCholesky(lX, xtvInvY, p);

    let ytvInvY = yty * invS2;
    for (let i = 0; i < qTotal; i++) {
      ytvInvY -= invS4 * sdVec[i] * zty[i] * solY[i];
    }
    let quad = ytvInvY;
    for (let a = 0; a < p; a++) {
      quad -= beta[a] * xtvInvY[a];
    }

    const deviance = logDetV + logDetXtVX + Math.max(0, quad);
    if (!computeDetails) {
      return { deviance, beta: null, xtvInvXInv: null, alpha: null, sigmaE2, vars: [vTask, vFact, vCell, vFactCond] };
    }

    const xtvInvXInv = invertFromCholesky(lX, p);
    // alpha = D^{1/2} * (solY - sum_c beta[c] * solX[c]) / sigmaE2
    const alpha = new Float64Array(qTotal);
    for (let i = 0; i < qTotal; i++) {
      let s = solY[i];
      for (let c = 0; c < p; c++) s -= beta[c] * solX[c][i];
      alpha[i] = invS2 * sdVec[i] * s;
    }

    return {
      deviance,
      beta,
      xtvInvXInv,
      alpha,
      sigmaE2,
      vars: [vTask, vFact, vCell, vFactCond],
    };
  }

  const opt = nelderMead(
    (x) => evalReml(x, false).deviance,
    [Math.log(0.15), Math.log(0.02), Math.log(0.02), Math.log(0.005), Math.log(0.02)],
    220
  );
  const fit = evalReml(opt.x, true);
  if (!fit.beta || !fit.xtvInvXInv || !fit.alpha) return null;

  const beta = fit.beta;
  const xtvInvXInv = fit.xtvInvXInv;
  const alpha = fit.alpha;
  const sigmaE2 = fit.sigmaE2;

  // CR1 task-clustered sandwich covariance
  const scores: Float64Array[] = Array.from({ length: qTask }, () => new Float64Array(p));
  for (const r of rows) {
    const xb = beta[0] + (r.condIdx > 0 ? beta[r.condIdx] : 0);
    const zb =
      alpha[r.taskIdx] +
      alpha[offFact + r.factIdx] +
      alpha[offCell + r.cellIdx] +
      alpha[offFactCond + r.factCondIdx];
    const vInvEi = (r.y - xb - zb) / sigmaE2;
    scores[r.taskIdx][0] += vInvEi;
    if (r.condIdx > 0) scores[r.taskIdx][r.condIdx] += vInvEi;
  }

  const meat: Float64Array[] = Array.from({ length: p }, () => new Float64Array(p));
  for (let g = 0; g < qTask; g++) {
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        meat[a][b] += scores[g][a] * scores[g][b];
      }
    }
  }

  const cr1Scale = (qTask / Math.max(1, qTask - 1)) * ((N - 1) / Math.max(1, N - p));
  const temp: Float64Array[] = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += xtvInvXInv[i][k] * meat[k][j];
      temp[i][j] = s;
    }
  }
  const vCr1: Float64Array[] = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += temp[i][k] * xtvInvXInv[k][j];
      vCr1[i][j] = cr1Scale * s;
    }
  }

  const [vTask, vFact, vCell, vFactCond] = fit.vars;
  const totalVar = vTask + vFact + vCell + vFactCond + sigmaE2;
  const randomEffects: LpmmRandomEffectEstimate[] = [
    {
      name: 'task',
      levels: qTask,
      variance: vTask,
      stdDev: Math.sqrt(vTask),
      iccPct: totalVar > 0 ? (100 * vTask) / totalVar : 0,
    },
    {
      name: 'fact',
      levels: qFact,
      variance: vFact,
      stdDev: Math.sqrt(vFact),
      iccPct: totalVar > 0 ? (100 * vFact) / totalVar : 0,
    },
    {
      name: 'cell',
      levels: qCell,
      variance: vCell,
      stdDev: Math.sqrt(vCell),
      iccPct: totalVar > 0 ? (100 * vCell) / totalVar : 0,
    },
    {
      name: 'fact:condition',
      levels: qFactCond,
      variance: vFactCond,
      stdDev: Math.sqrt(vFactCond),
      iccPct: totalVar > 0 ? (100 * vFactCond) / totalVar : 0,
    },
  ];

  const contrastsPts: LpmmContrastEstimate[] = V3_CONTRAST_SPECS.map((spec) => {
    const tIdx = condIndex.get(spec.target)!;
    const bIdx = condIndex.get(spec.base)!;
    const cVec = new Float64Array(p);
    if (tIdx > 0) cVec[tIdx] += 1;
    if (bIdx > 0) cVec[bIdx] -= 1;

    let est = 0;
    let varReml = 0;
    let varCr1 = 0;
    for (let i = 0; i < p; i++) {
      est += cVec[i] * beta[i];
      for (let j = 0; j < p; j++) {
        varReml += cVec[i] * xtvInvXInv[i][j] * cVec[j];
        varCr1 += cVec[i] * vCr1[i][j] * cVec[j];
      }
    }

    const estPts = est * 100;
    const sePts = Math.sqrt(Math.max(0, varReml)) * 100;
    const cr1SePts = Math.sqrt(Math.max(0, varCr1)) * 100;
    return {
      name: spec.name,
      estPts,
      sePts,
      ci95Pts: [estPts - 1.96 * sePts, estPts + 1.96 * sePts],
      pValue: twoSidedNormalP(estPts, sePts),
      cr1SePts,
      cr1Ci95Pts: [estPts - 1.96 * cr1SePts, estPts + 1.96 * cr1SePts],
      cr1PValue: twoSidedNormalP(estPts, cr1SePts),
    };
  });

  return {
    nObs: N,
    nTasks: qTask,
    remlDeviance: fit.deviance,
    residualVariance: sigmaE2,
    residualStdDev: Math.sqrt(sigmaE2),
    totalClusteredSharePct: totalVar > 0 ? (100 * (totalVar - sigmaE2)) / totalVar : 0,
    randomEffects,
    contrastsPts,
  };
}

function computeContrast(
  spec: ContrastPairSpec,
  byCondition: ReadonlyMap<ConditionV3Id, TrialV3[]>,
  taskLookup: ReadonlyMap<string, TaskV2Item>
): ContrastResultV3 {
  const baseMap = new Map((byCondition.get(spec.base) ?? []).map((t) => [t.taskId, t]));
  const targetMap = new Map((byCondition.get(spec.target) ?? []).map((t) => [t.taskId, t]));
  const pairedIds = [...baseMap.keys()].filter((id) => targetMap.has(id)).sort();

  const diffs = pairedIds.map(
    (id) => targetMap.get(id)!.boundFactFraction - baseMap.get(id)!.boundFactFraction
  );
  const boot = pairedBootstrap(diffs, SIGN_FLIP_ITERATIONS, BOOTSTRAP_SEED, BOOTSTRAP_RESAMPLES);
  const mc = mcnemar(
    pairedIds.map((id) => baseMap.get(id)!.boundPassed),
    pairedIds.map((id) => targetMap.get(id)!.boundPassed)
  );

  const cellBuckets = new Map<string, number[]>();
  for (let i = 0; i < pairedIds.length; i++) {
    const id = pairedIds[i];
    const targetTrial = targetMap.get(id)! as TrialV3 & { features?: TaskV2Item['features'] };
    const features = targetTrial.features ?? taskLookup.get(id)?.features;
    if (!features) continue;
    const key = formatCellKey(features);
    const list = cellBuckets.get(key);
    if (list) list.push(diffs[i]);
    else cellBuckets.set(key, [diffs[i]]);
  }
  const cellMeans = [...cellBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);

  const exactCellPValue = cellMeans.length === 8 ? exactCellSignFlip(cellMeans) : null;

  return {
    name: spec.name,
    target: spec.target,
    base: spec.base,
    primary: spec.primary,
    nPairs: pairedIds.length,
    meanDifference: boot.meanDifference,
    ci95: boot.ci95,
    signFlipPValue: boot.signFlipPValue,
    exactCellPValue,
    mcnemar: {
      n01: mc.b,
      n10: mc.c,
      pValue: mc.pValue,
    },
  };
}

export function analyzeAblationV3Trials(
  trials: readonly TrialV3[],
  options?: {
    metadata?: Partial<RunMetadataV3>;
    tasks?: readonly TaskV2Item[];
    allowPartial?: boolean;
  }
): AblationV3Report {
  const allowPartial = options?.allowPartial ?? false;
  const metadata = options?.metadata ?? {};

  const missingProvenanceHashes = REQUIRED_PROVENANCE_HASHES.filter(
    (k) => !metadata[k] || String(metadata[k]).trim().length === 0
  );
  const provenanceVerified = missingProvenanceHashes.length === 0;

  if (!allowPartial) {
    if (trials.length !== 960) {
      throw new Error(
        `Confirmatory export requires exactly 960 trials (found ${trials.length}). Pass --allow-partial for diagnostic inspection.`
      );
    }
    if (!provenanceVerified) {
      throw new Error(
        `Confirmatory export requires all 7 provenance SHA-256 hashes (missing: ${missingProvenanceHashes.join(', ')}).`
      );
    }
  }

  const taskLookup = new Map<string, TaskV2Item>();
  for (const t of options?.tasks ?? []) {
    taskLookup.set(t.id, t);
  }

  const forensicTaskLookup = new Map<string, ForensicTaskContext>();
  for (const t of options?.tasks ?? []) {
    forensicTaskLookup.set(t.id, { table: t.table, features: t.features });
  }
  for (const tr of trials) {
    if (!forensicTaskLookup.has(tr.taskId)) {
      const task = taskLookup.get(tr.taskId);
      const trFeatures = (tr as TrialV3 & { features?: TaskV2Item['features'] }).features;
      forensicTaskLookup.set(tr.taskId, {
        table: task?.table ?? '',
        features: trFeatures ?? task?.features ?? { tenant: false, append_only: false, ingestion: false },
      });
    }
  }

  const forensicsByCond = summarizeForensicsByCondition(trials, forensicTaskLookup);
  const byCondition = new Map<ConditionV3Id, TrialV3[]>();
  for (const cond of V3_CONDITIONS) byCondition.set(cond, []);
  for (const tr of trials) {
    byCondition.get(tr.condition)?.push(tr);
  }

  const conditions = {} as Record<ConditionV3Id, ConditionSummaryV3>;
  for (const cond of V3_CONDITIONS) {
    const rows = byCondition.get(cond) ?? [];
    const n = rows.length;
    const strictPassCount = rows.filter((r) => r.boundPassed).length;
    const f = forensicsByCond[cond] ?? {
      n: 0,
      counts: {} as Record<SqlForensicFlagName, number>,
      rates: {} as Record<SqlForensicFlagName, number>,
    };
    conditions[cond] = {
      n,
      meanBoundFactFraction: n ? rows.reduce((s, r) => s + r.boundFactFraction, 0) / n : 0,
      strictPassAt1: n ? strictPassCount / n : 0,
      strictPassCount,
      strictPassAt1Wilson95: wilson(strictPassCount, n),
      meanPromptTokens: n ? rows.reduce((s, r) => s + r.promptTokens, 0) / n : 0,
      meanTotalTokens: n ? rows.reduce((s, r) => s + r.totalTokens, 0) / n : 0,
      tableMissingCount: rows.filter((r) => Boolean(r.tableMissing)).length,
      migrationExitNonZeroCount: rows.filter((r) => Boolean(r.migrationExitNonZero)).length,
      forensicCounts: f.counts,
      forensicRates: f.rates,
    };
  }

  const allContrasts = V3_CONTRAST_SPECS.map((spec) =>
    computeContrast(spec, byCondition, taskLookup)
  );
  const primaryContrasts = allContrasts.filter((c) => c.primary);
  const referenceContrasts = allContrasts.filter((c) => !c.primary);

  const primaryPMap = Object.fromEntries(primaryContrasts.map((c) => [c.name, c.signFlipPValue]));
  const holmPrimary = holmAdjust(primaryPMap);
  const exactCellEntries = primaryContrasts.filter((c) => c.exactCellPValue !== null);
  const holmCell =
    exactCellEntries.length > 0
      ? holmAdjust(Object.fromEntries(exactCellEntries.map((c) => [c.name, c.exactCellPValue!])))
      : {};

  for (const c of primaryContrasts) {
    c.holmAdjustedPValue = holmPrimary[c.name];
    c.holmExactCellPValue = holmCell[c.name] ?? null;
  }

  // (a) Distillation Gap Recovery Ratio
  const meanC = conditions.C.meanBoundFactFraction;
  const meanCId = conditions.C_ID.meanBoundFactFraction;
  const meanC0Clean = conditions.C0_clean.meanBoundFactFraction;
  const denomOverall = meanC0Clean - meanC;
  const appendOnlyCells = new Set(['010', '011', '110', '111']);
  const appendOnlyFilter = (tr: TrialV3) => {
    const feat =
      (tr as TrialV3 & { features?: TaskV2Item['features'] }).features ??
      taskLookup.get(tr.taskId)?.features;
    return feat ? appendOnlyCells.has(formatCellKey(feat)) : false;
  };
  const cAppend = (byCondition.get('C') ?? []).filter(appendOnlyFilter);
  const cIdAppend = (byCondition.get('C_ID') ?? []).filter(appendOnlyFilter);
  const c0CleanAppend = (byCondition.get('C0_clean') ?? []).filter(appendOnlyFilter);
  const meanCApp = cAppend.length
    ? cAppend.reduce((s, r) => s + r.boundFactFraction, 0) / cAppend.length
    : 0;
  const meanCIdApp = cIdAppend.length
    ? cIdAppend.reduce((s, r) => s + r.boundFactFraction, 0) / cIdAppend.length
    : 0;
  const meanC0CleanApp = c0CleanAppend.length
    ? c0CleanAppend.reduce((s, r) => s + r.boundFactFraction, 0) / c0CleanAppend.length
    : 0;
  const denomApp = meanC0CleanApp - meanCApp;

  // (b) Forensic Mediation Table
  const forensicMediationTable = {} as AblationV3Report['forensicMediationTable'];
  for (const cond of V3_CONDITIONS) {
    forensicMediationTable[cond] = {
      hasInlineSupersedesFk: conditions[cond].forensicRates.hasInlineSupersedesFk ?? 0,
      hasExplicitSupersedesFk: conditions[cond].forensicRates.hasExplicitSupersedesFk ?? 0,
      hasHallucinatedLineageCol: conditions[cond].forensicRates.hasHallucinatedLineageCol ?? 0,
      hasDuplicatePrimaryKey: conditions[cond].forensicRates.hasDuplicatePrimaryKey ?? 0,
      hasPublicAuthJwt: conditions[cond].forensicRates.hasPublicAuthJwt ?? 0,
      hasSingularCompositeIndexName:
        conditions[cond].forensicRates.hasSingularCompositeIndexName ?? 0,
    };
  }

  // (c) Retrieved vs. Non-Retrieved bound pair stratification
  const retrievedByTask = new Map<string, Set<string>>();
  for (const tr of byCondition.get('C') ?? []) {
    retrievedByTask.set(tr.taskId, new Set(tr.retrievedFactIds ?? []));
  }
  const trialByCondTask = new Map<string, TrialV3>();
  for (const tr of trials) {
    trialByCondTask.set(`${tr.condition}::${tr.taskId}`, tr);
  }

  const taskIds = [...new Set(trials.map((t) => t.taskId))].sort();
  const summarizeStratum = (isRetrieved: boolean) => {
    const condPass: Record<string, { passed: number; total: number; rate: number }> = {};
    for (const cond of V3_CONDITIONS) condPass[cond] = { passed: 0, total: 0, rate: 0 };

    const diffC0CleanMinusA: number[] = [];
    const diffC0RandMinusA: number[] = [];
    const diffCMinusA: number[] = [];
    const diffCIdMinusA: number[] = [];

    for (const taskId of taskIds) {
      const aTrial = trialByCondTask.get(`A::${taskId}`);
      if (!aTrial) continue;
      const retSet = retrievedByTask.get(taskId) ?? new Set<string>();
      for (const factId of aTrial.boundFacts ?? []) {
        if (retSet.has(factId) !== isRetrieved) continue;
        const passOf = (cond: ConditionV3Id): number | null => {
          const t = trialByCondTask.get(`${cond}::${taskId}`);
          if (!t) return null;
          return !t.tableMissing && !(t.failedFacts ?? []).includes(factId) ? 1 : 0;
        };
        for (const cond of V3_CONDITIONS) {
          const pVal = passOf(cond);
          if (pVal !== null) {
            condPass[cond].total++;
            condPass[cond].passed += pVal;
          }
        }
        const pA = passOf('A');
        const pC0Clean = passOf('C0_clean');
        const pC0Rand = passOf('C0_rand');
        const pC = passOf('C');
        const pCId = passOf('C_ID');
        if (pA !== null && pC0Clean !== null) diffC0CleanMinusA.push(pC0Clean - pA);
        if (pA !== null && pC0Rand !== null) diffC0RandMinusA.push(pC0Rand - pA);
        if (pA !== null && pC !== null) diffCMinusA.push(pC - pA);
        if (pA !== null && pCId !== null) diffCIdMinusA.push(pCId - pA);
      }
    }

    for (const cond of V3_CONDITIONS) {
      const c = condPass[cond];
      c.rate = c.total > 0 ? c.passed / c.total : 0;
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
    return {
      nPairs: condPass.A.total,
      passRatesByCondition: Object.fromEntries(
        V3_CONDITIONS.map((c) => [c, condPass[c].rate])
      ),
      meanDiffVsA: {
        C0_clean_minus_A: avg(diffC0CleanMinusA),
        C0_rand_minus_A: avg(diffC0RandMinusA),
        C_minus_A: avg(diffCMinusA),
        C_ID_minus_A: avg(diffCIdMinusA),
      },
    };
  };

  // Non-retrieved F-05 (created_at) and F-10 (deleted_at on mutable) checklist omissions
  const f05NonRetTasks = taskIds.filter((id) => {
    const tA = trialByCondTask.get(`A::${id}`);
    const ret = retrievedByTask.get(id) ?? new Set<string>();
    return tA && (tA.boundFacts ?? []).includes('F-05') && !ret.has('F-05');
  });
  const f10MutableNonRetTasks = taskIds.filter((id) => {
    const tA = trialByCondTask.get(`A::${id}`);
    const ret = retrievedByTask.get(id) ?? new Set<string>();
    const ctx = forensicTaskLookup.get(id);
    return (
      tA &&
      ctx &&
      !ctx.features.append_only &&
      (tA.boundFacts ?? []).includes('F-10') &&
      !ret.has('F-10')
    );
  });

  const f05MissingRate: Record<string, number> = {};
  const f10MissingRate: Record<string, number> = {};
  for (const cond of V3_CONDITIONS) {
    let f05Miss = 0;
    let f05Tot = 0;
    for (const id of f05NonRetTasks) {
      const tr = trialByCondTask.get(`${cond}::${id}`);
      const ctx = forensicTaskLookup.get(id);
      if (!tr || !ctx) continue;
      f05Tot++;
      if (classifySqlForensics(tr.sanitizedSql ?? tr.generatedSql ?? '', ctx).missingCreatedAtColumn) {
        f05Miss++;
      }
    }
    f05MissingRate[cond] = f05Tot > 0 ? f05Miss / f05Tot : 0;

    let f10Miss = 0;
    let f10Tot = 0;
    for (const id of f10MutableNonRetTasks) {
      const tr = trialByCondTask.get(`${cond}::${id}`);
      const ctx = forensicTaskLookup.get(id);
      if (!tr || !ctx) continue;
      f10Tot++;
      if (
        classifySqlForensics(tr.sanitizedSql ?? tr.generatedSql ?? '', ctx)
          .missingDeletedAtOnMutable
      ) {
        f10Miss++;
      }
    }
    f10MissingRate[cond] = f10Tot > 0 ? f10Miss / f10Tot : 0;
  }

  // (d) Paired Clean-Intersection Sensitivity Contrasts (post-treatment conditioned)
  const cleanContrasts = V3_CONTRAST_SPECS.map((spec) => {
    const baseMap = new Map((byCondition.get(spec.base) ?? []).map((t) => [t.taskId, t]));
    const targetMap = new Map((byCondition.get(spec.target) ?? []).map((t) => [t.taskId, t]));
    const pairedIds = [...baseMap.keys()].filter((id) => targetMap.has(id)).sort();
    const cleanIds = pairedIds.filter((id) => {
      const b = baseMap.get(id)!;
      const t = targetMap.get(id)!;
      return !b.tableMissing && !b.migrationExitNonZero && !t.tableMissing && !t.migrationExitNonZero;
    });
    const diffs = cleanIds.map(
      (id) => targetMap.get(id)!.boundFactFraction - baseMap.get(id)!.boundFactFraction
    );
    const boot = pairedBootstrap(diffs, SIGN_FLIP_ITERATIONS, BOOTSTRAP_SEED, BOOTSTRAP_RESAMPLES);
    return {
      name: spec.name,
      nPairs: cleanIds.length,
      excludedTasks: pairedIds.length - cleanIds.length,
      meanDifference: boot.meanDifference,
      ci95: boot.ci95,
      signFlipPValue: boot.signFlipPValue,
    };
  });

  const mixedModel = fitAblationV3Lpmm(trials, taskLookup);

  return {
    protocol: 'Ablation v3',
    partialAllowed: allowPartial,
    totalTrials: trials.length,
    provenanceVerified,
    missingProvenanceHashes,
    conditions,
    primaryContrasts,
    referenceContrasts,
    distillationGapRecovery: {
      overall: {
        meanC,
        meanCId,
        meanC0Clean,
        numerator: meanCId - meanC,
        denominator: denomOverall,
        recoveryRatio: Math.abs(denomOverall) > 1e-12 ? (meanCId - meanC) / denomOverall : null,
      },
      appendOnlyCells: {
        cells: ['010', '011', '110', '111'],
        nTrialsPerCondition: cAppend.length,
        meanC: meanCApp,
        meanCId: meanCIdApp,
        meanC0Clean: meanC0CleanApp,
        numerator: meanCIdApp - meanCApp,
        denominator: denomApp,
        recoveryRatio: Math.abs(denomApp) > 1e-12 ? (meanCIdApp - meanCApp) / denomApp : null,
      },
    },
    forensicMediationTable,
    retrievalStratification: {
      retrieved: summarizeStratum(true),
      nonRetrieved: summarizeStratum(false),
      nonRetrievedChecklistOmissions: {
        f05NonRetrievedCount: f05NonRetTasks.length,
        f05MissingCreatedAtRateByCondition: f05MissingRate,
        f10MutableNonRetrievedCount: f10MutableNonRetTasks.length,
        f10MissingDeletedAtRateByCondition: f10MissingRate,
      },
    },
    cleanIntersectionSensitivity: {
      postTreatmentConditioned: true,
      note: 'Conditioned on post-treatment outcome (!tableMissing && !migrationExitNonZero in both arms); sensitivity analysis only.',
      contrasts: cleanContrasts,
    },
    mixedModel,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const cpIdx = args.indexOf('--checkpoint');
  const outIdx = args.indexOf('--out');
  const allowPartial = args.includes('--allow-partial');
  if (cpIdx < 0 || !args[cpIdx + 1]) {
    console.error(
      'Usage: npx tsx scripts/v3/analyze-ablation-v3.ts --checkpoint <path> [--out <path>] [--allow-partial]'
    );
    process.exit(1);
  }
  const checkpointPath = path.resolve(args[cpIdx + 1]);
  const payload = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as {
    metadata?: Partial<RunMetadataV3>;
    runMetadata?: Partial<RunMetadataV3>;
    provenance?: Partial<RunMetadataV3>;
    trials?: TrialV3[];
  };
  const trials = payload.trials ?? [];
  const metadata: Partial<RunMetadataV3> = {
    ...(payload.metadata ?? {}),
    ...(payload.runMetadata ?? {}),
    ...(payload.provenance ?? {}),
  };

  const tasksPath = path.resolve('fixtures', 'task-v3', 'tasks.json');
  let tasks: TaskV2Item[] = [];
  if (fs.existsSync(tasksPath)) {
    const parsedTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as {
      test?: TaskV2Item[];
    };
    tasks = parsedTasks.test ?? [];
  }

  const report = analyzeAblationV3Trials(trials, { metadata, tasks, allowPartial });
  const runId = path.basename(path.dirname(checkpointPath));
  const outPath = path.resolve(
    outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : path.join('out', 'v3', `analysis-${runId}.json`)
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Wrote Ablation v3 analysis (${report.totalTrials} trials) to ${outPath}`);
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('analyze-ablation-v3.ts');

if (isEntrypoint) {
  main();
}
