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

export type ContrastTier = 'primary' | 'equivalence_tost' | 'secondary' | 'exploratory';

export interface ContrastPairSpec {
  name: string;
  target: ConditionV3Id;
  base: ConditionV3Id;
  primary: boolean;
  tier: ContrastTier;
}

export const V3_CONTRAST_SPECS: readonly ContrastPairSpec[] = Object.freeze([
  // 5 pre-registered primary superiority contrasts (Holm-Bonferroni family)
  { name: 'C_ID_vs_C', target: 'C_ID', base: 'C', primary: true, tier: 'primary' },
  { name: 'C0_clean_vs_C0', target: 'C0_clean', base: 'C0', primary: true, tier: 'primary' },
  { name: 'C0_clean_vs_C_ID', target: 'C0_clean', base: 'C_ID', primary: true, tier: 'primary' },
  { name: 'C0_clean_vs_C0_rand', target: 'C0_clean', base: 'C0_rand', primary: true, tier: 'primary' },
  { name: 'C_ID_vs_D_safe', target: 'C_ID', base: 'D_safe', primary: true, tier: 'primary' },
  // Equivalence TOST contrast (outside primary Holm family)
  { name: 'D_safe_vs_A', target: 'D_safe', base: 'A', primary: false, tier: 'equivalence_tost' },
  // Secondary reference contrasts
  { name: 'C_vs_A', target: 'C', base: 'A', primary: false, tier: 'secondary' },
  { name: 'C0_vs_C', target: 'C0', base: 'C', primary: false, tier: 'secondary' },
  { name: 'B_vs_A', target: 'B', base: 'A', primary: false, tier: 'secondary' },
]);

export const FAILURE_MODE_ATTRIBUTION_FLAGS = [
  'hasInlineSupersedesFk',
  'hasExplicitSupersedesFk',
  'hasHallucinatedLineageCol',
  'hasDuplicatePrimaryKey',
  'hasPublicAuthJwt',
  'hasSingularCompositeIndexName',
] as const satisfies readonly SqlForensicFlagName[];

export const FORENSIC_MEDIATION_FLAGS = FAILURE_MODE_ATTRIBUTION_FLAGS;

export interface ConditionSummaryV3 {
  n: number;
  meanBoundFactFraction: number;
  strictPassAt1: number;
  strictPassCount: number;
  strictPassAt1Wilson95: [number, number];
  commitCount: number;
  pCommit: number;
  meanBoundFactFractionGivenCommit: number | null;
  strictPassAt1GivenCommit: number | null;
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
  tier: ContrastTier;
  nPairs: number;
  meanDifference: number;
  sdDifference: number;
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

export interface TostEquivalenceResultV3 {
  name: string;
  target: ConditionV3Id;
  base: ConditionV3Id;
  tier: 'equivalence_tost';
  margin: number;
  nPairs: number;
  meanDifference: number;
  se: number;
  ci90: [number, number];
  ci95: [number, number];
  pLower: number;
  pUpper: number;
  tostPValue: number;
  equivalentAtAlpha05: boolean;
}

export interface DidContrastResultV3 {
  name: 'DiD_C_ID_vs_C_minus_C0_clean_vs_C0';
  tier: 'secondary';
  nPairs: number;
  meanDifference: number;
  sdDifference: number;
  ci95: [number, number];
  signFlipPValue: number;
  exactCellPValue: number | null;
}

export interface MdeRowV3 {
  name: string;
  tier: ContrastTier | 'did';
  nPairs: number;
  sdDifference: number;
  mdeAlpha05Power80: number;
  mdeAlpha01Power80: number;
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
  cr2Df: number;
  cr2Ci95Pts: [number, number];
  cr2PValue: number;
}

export interface LpmmResultV3 {
  nObs: number;
  nTasks: number;
  remlDeviance: number;
  residualVariance: number;
  residualStdDev: number;
  totalClusteredSharePct: number;
  logPromptTokensBetaPts: number;
  logPromptTokensSePts: number;
  randomEffects: LpmmRandomEffectEstimate[];
  contrastsPts: LpmmContrastEstimate[];
}

export interface DgrrStratumV3 {
  meanC: number;
  meanCId: number;
  meanC0Clean: number;
  numerator: number;
  denominator: number;
  denominatorCi95: [number, number];
  denominatorExcludesZero: boolean;
  recoveryRatio: number | null;
  gatedReason: string | null;
}

export interface ExposureStratumC0CleanVsC0 {
  nPairs: number;
  meanC0: number;
  meanC0Clean: number;
  meanDifference: number;
  ci95: [number, number];
  signFlipPValue: number;
}

export interface AblationV3Report {
  protocol: 'Ablation v3';
  partialAllowed: boolean;
  totalTrials: number;
  provenanceVerified: boolean;
  missingProvenanceHashes: string[];
  c0RandBoundCoverage: {
    nTrials: number;
    meanCoverage: number;
    totalRetrieved: number;
    totalBoundOverlap: number;
    overallCoverage: number;
  };
  conditions: Record<ConditionV3Id, ConditionSummaryV3>;
  primaryContrasts: ContrastResultV3[];
  tostEquivalence: TostEquivalenceResultV3 | null;
  didContrast: DidContrastResultV3 | null;
  referenceContrasts: ContrastResultV3[];
  mdeTable: MdeRowV3[];
  distillationGapRecovery: {
    overall: DgrrStratumV3;
    appendOnlyCells: DgrrStratumV3 & {
      cells: string[];
      nTrialsPerCondition: number;
    };
  };
  exposureStratifiedC0CleanVsC0: {
    targetFacts: readonly ['F-01', 'F-18', 'F-19', 'F-36'];
    exposedAny: ExposureStratumC0CleanVsC0;
    unexposedAll: ExposureStratumC0CleanVsC0;
    perFact: Record<'F-01' | 'F-18' | 'F-19' | 'F-36', {
      exposed: ExposureStratumC0CleanVsC0;
      unexposed: ExposureStratumC0CleanVsC0;
    }>;
  };
  failureModeAttributionTable: Record<
    ConditionV3Id,
    Record<(typeof FAILURE_MODE_ATTRIBUTION_FLAGS)[number], number>
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairedBootstrapCiOnly(
  diffs: readonly number[],
  resamples = BOOTSTRAP_RESAMPLES,
  seed = BOOTSTRAP_SEED
): { meanDifference: number; ci95: [number, number] } {
  const n = diffs.length;
  if (n === 0) return { meanDifference: 0, ci95: [0, 0] };
  const meanDifference = diffs.reduce((s, v) => s + v, 0) / n;
  const rand = mulberry32(seed);
  const samples = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += diffs[Math.floor(rand() * n)];
    }
    samples[r] = sum / n;
  }
  samples.sort();
  const lo = samples[Math.floor(0.025 * (resamples - 1))];
  const hi = samples[Math.ceil(0.975 * (resamples - 1))];
  return { meanDifference, ci95: [lo, hi] };
}

function addOneSignFlipPValue(
  diffs: readonly number[],
  iterations = SIGN_FLIP_ITERATIONS,
  seed = BOOTSTRAP_SEED
): number {
  const n = diffs.length;
  if (n === 0) return 1;
  const obsMean = Math.abs(diffs.reduce((s, v) => s + v, 0) / n);
  if (obsMean === 0) return 1;
  const rand = mulberry32(seed);
  let geCount = 0;
  for (let iter = 0; iter < iterations; iter++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += rand() < 0.5 ? diffs[i] : -diffs[i];
    }
    if (Math.abs(sum / n) >= obsMean - 1e-12) {
      geCount++;
    }
  }
  return (geCount + 1) / (iterations + 1);
}

function computeSd(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const ss = values.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return Math.sqrt(ss / (n - 1));
}

function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIter = 200;
  const eps = 3e-12;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  if (df <= 0) return normalCdf(t);
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function twoSidedStudentTP(est: number, se: number, df: number): number {
  if (!Number.isFinite(se) || se <= 0) return 1;
  const t = Math.abs(est / se);
  return Math.max(0, Math.min(1, 2 * (1 - studentTCdf(t, df))));
}

function tCritical(twoSidedAlpha: number, df: number): number {
  const target = 1 - twoSidedAlpha / 2;
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function computeTostEquivalence(
  diffs: readonly number[],
  spec: ContrastPairSpec,
  ci95: [number, number],
  margin = 0.03
): TostEquivalenceResultV3 {
  const n = diffs.length;
  const meanDifference = n > 0 ? diffs.reduce((s, v) => s + v, 0) / n : 0;
  const sd = computeSd(diffs);
  const se = n > 0 ? sd / Math.sqrt(n) : 0;
  const df = Math.max(1, n - 1);
  const tCrit90 = tCritical(0.10, df);
  const ci90: [number, number] = [meanDifference - tCrit90 * se, meanDifference + tCrit90 * se];
  let pLower = 1;
  let pUpper = 1;
  if (se > 0) {
    const tLower = (meanDifference - -margin) / se;
    const tUpper = (margin - meanDifference) / se;
    pLower = 1 - studentTCdf(tLower, df);
    pUpper = 1 - studentTCdf(tUpper, df);
  } else if (Math.abs(meanDifference) < margin) {
    pLower = 0;
    pUpper = 0;
  }
  const tostPValue = Math.max(pLower, pUpper);
  return {
    name: spec.name,
    target: spec.target,
    base: spec.base,
    tier: 'equivalence_tost',
    margin,
    nPairs: n,
    meanDifference,
    se,
    ci90,
    ci95,
    pLower,
    pUpper,
    tostPValue,
    equivalentAtAlpha05: tostPValue < 0.05,
  };
}

function computeMdeRow(
  name: string,
  tier: ContrastTier | 'did',
  diffs: readonly number[]
): MdeRowV3 {
  const nPairs = diffs.length;
  const sdDifference = computeSd(diffs);
  const z80 = 0.84162123;
  const z05 = 1.95996398;
  const z01 = 2.5758293;
  const scale = nPairs > 0 ? sdDifference / Math.sqrt(nPairs) : 0;
  return {
    name,
    tier,
    nPairs,
    sdDifference,
    mdeAlpha05Power80: (z05 + z80) * scale,
    mdeAlpha01Power80: (z01 + z80) * scale,
  };
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
    logPromptTokens: number;
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
    const logTok = Math.log(Math.max(1, trial.promptTokens ?? 1));

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
        logPromptTokens: logTok,
      });
    }
  }

  const N = rows.length;
  const qTask = taskMap.size;
  const qFact = factMap.size;
  const qCell = cellMap.size;
  const qFactCond = factCondMap.size;
  if (N === 0 || qTask < 2) return null;

  let minLogTok = Infinity;
  let maxLogTok = -Infinity;
  let sumLogTok = 0;
  for (const r of rows) {
    if (r.logPromptTokens < minLogTok) minLogTok = r.logPromptTokens;
    if (r.logPromptTokens > maxLogTok) maxLogTok = r.logPromptTokens;
    sumLogTok += r.logPromptTokens;
  }
  const meanLogTok = sumLogTok / N;
  const hasLogTokCovariate = maxLogTok - minLogTok > 1e-9;
  const logTokCol = V3_CONDITIONS.length;
  const p = hasLogTokCovariate ? V3_CONDITIONS.length + 1 : V3_CONDITIONS.length;

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
    const centeredLogTok = r.logPromptTokens - meanLogTok;
    for (const a of idxs) {
      for (const b of idxs) incZtz(a, b);
      // X has intercept (col 0), dummy for condIdx >= 1, and optional logPromptTokens
      ztx[a][0] += 1;
      if (r.condIdx > 0) ztx[a][r.condIdx] += 1;
      if (hasLogTokCovariate) ztx[a][logTokCol] += centeredLogTok;
      zty[a] += r.y;
    }
    xtx[0][0] += 1;
    if (r.condIdx > 0) {
      xtx[0][r.condIdx] += 1;
      xtx[r.condIdx][0] += 1;
      xtx[r.condIdx][r.condIdx] += 1;
      xty[r.condIdx] += r.y;
    }
    if (hasLogTokCovariate) {
      xtx[0][logTokCol] += centeredLogTok;
      xtx[logTokCol][0] += centeredLogTok;
      if (r.condIdx > 0) {
        xtx[r.condIdx][logTokCol] += centeredLogTok;
        xtx[logTokCol][r.condIdx] += centeredLogTok;
      }
      xtx[logTokCol][logTokCol] += centeredLogTok * centeredLogTok;
      xty[logTokCol] += centeredLogTok * r.y;
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
    const centeredLogTok = r.logPromptTokens - meanLogTok;
    const xb =
      beta[0] +
      (r.condIdx > 0 ? beta[r.condIdx] : 0) +
      (hasLogTokCovariate ? beta[logTokCol] * centeredLogTok : 0);
    const zb =
      alpha[r.taskIdx] +
      alpha[offFact + r.factIdx] +
      alpha[offCell + r.cellIdx] +
      alpha[offFactCond + r.factCondIdx];
    const vInvEi = (r.y - xb - zb) / sigmaE2;
    scores[r.taskIdx][0] += vInvEi;
    if (r.condIdx > 0) scores[r.taskIdx][r.condIdx] += vInvEi;
    if (hasLogTokCovariate) scores[r.taskIdx][logTokCol] += vInvEi * centeredLogTok;
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

  const cr2Df = Math.max(1, qTask - 1);
  const tCritCr2 = tCritical(0.05, cr2Df);

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
      cr2Df,
      cr2Ci95Pts: [estPts - tCritCr2 * cr1SePts, estPts + tCritCr2 * cr1SePts],
      cr2PValue: twoSidedStudentTP(estPts, cr1SePts, cr2Df),
    };
  });

  const logPromptTokensBetaPts = hasLogTokCovariate ? beta[logTokCol] * 100 : 0;
  const logPromptTokensSePts = hasLogTokCovariate
    ? Math.sqrt(Math.max(0, vCr1[logTokCol][logTokCol])) * 100
    : 0;

  return {
    nObs: N,
    nTasks: qTask,
    remlDeviance: fit.deviance,
    residualVariance: sigmaE2,
    residualStdDev: Math.sqrt(sigmaE2),
    totalClusteredSharePct: totalVar > 0 ? (100 * (totalVar - sigmaE2)) / totalVar : 0,
    logPromptTokensBetaPts,
    logPromptTokensSePts,
    randomEffects,
    contrastsPts,
  };
}

function computeContrast(
  spec: ContrastPairSpec,
  byCondition: ReadonlyMap<ConditionV3Id, TrialV3[]>,
  taskLookup: ReadonlyMap<string, TaskV2Item>
): { result: ContrastResultV3; diffs: number[] } {
  const baseMap = new Map((byCondition.get(spec.base) ?? []).map((t) => [t.taskId, t]));
  const targetMap = new Map((byCondition.get(spec.target) ?? []).map((t) => [t.taskId, t]));
  const pairedIds = [...baseMap.keys()].filter((id) => targetMap.has(id)).sort();

  const diffs = pairedIds.map(
    (id) => targetMap.get(id)!.boundFactFraction - baseMap.get(id)!.boundFactFraction
  );
  const boot = pairedBootstrapCiOnly(diffs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
  const signFlipPValue = addOneSignFlipPValue(diffs, SIGN_FLIP_ITERATIONS, BOOTSTRAP_SEED);
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
    diffs,
    result: {
      name: spec.name,
      target: spec.target,
      base: spec.base,
      primary: spec.primary,
      tier: spec.tier,
      nPairs: pairedIds.length,
      meanDifference: boot.meanDifference,
      sdDifference: computeSd(diffs),
      ci95: boot.ci95,
      signFlipPValue,
      exactCellPValue,
      mcnemar: {
        n01: mc.b,
        n10: mc.c,
        pValue: mc.pValue,
      },
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

  // Strict held-out split guard: only V3-H-* tasks are permitted in Ablation v3 analysis
  const invalidSplitTrials = trials.filter((t) => !t.taskId.startsWith('V3-H-'));
  if (invalidSplitTrials.length > 0) {
    throw new Error(
      `Ablation v3 analysis only permits held-out V3-H-* tasks (found ${invalidSplitTrials.length} non-held-out trial(s), e.g. ${invalidSplitTrials[0].taskId}).`
    );
  }

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
    const committedRows = rows.filter((r) => !r.tableMissing && !r.migrationExitNonZero);
    const commitCount = committedRows.length;
    const committedStrictPass = committedRows.filter((r) => r.boundPassed).length;
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
      commitCount,
      pCommit: n ? commitCount / n : 0,
      meanBoundFactFractionGivenCommit: commitCount
        ? committedRows.reduce((s, r) => s + r.boundFactFraction, 0) / commitCount
        : null,
      strictPassAt1GivenCommit: commitCount ? committedStrictPass / commitCount : null,
      meanPromptTokens: n ? rows.reduce((s, r) => s + r.promptTokens, 0) / n : 0,
      meanTotalTokens: n ? rows.reduce((s, r) => s + r.totalTokens, 0) / n : 0,
      tableMissingCount: rows.filter((r) => Boolean(r.tableMissing)).length,
      migrationExitNonZeroCount: rows.filter((r) => Boolean(r.migrationExitNonZero)).length,
      forensicCounts: f.counts,
      forensicRates: f.rates,
    };
  }

  // C0_rand bound-fact coverage diagnostic
  const c0RandRows = byCondition.get('C0_rand') ?? [];
  let c0RandTotalRetrieved = 0;
  let c0RandTotalBoundOverlap = 0;
  const c0RandCoverages: number[] = [];
  for (const tr of c0RandRows) {
    const ret = tr.retrievedFactIds ?? [];
    const bound = new Set(tr.boundFacts ?? []);
    const overlap = ret.filter((id) => bound.has(id)).length;
    c0RandTotalRetrieved += ret.length;
    c0RandTotalBoundOverlap += overlap;
    c0RandCoverages.push(ret.length > 0 ? overlap / ret.length : 0);
  }
  const c0RandBoundCoverage = {
    nTrials: c0RandRows.length,
    meanCoverage: c0RandCoverages.length
      ? c0RandCoverages.reduce((s, v) => s + v, 0) / c0RandCoverages.length
      : 0,
    totalRetrieved: c0RandTotalRetrieved,
    totalBoundOverlap: c0RandTotalBoundOverlap,
    overallCoverage: c0RandTotalRetrieved > 0 ? c0RandTotalBoundOverlap / c0RandTotalRetrieved : 0,
  };

  const computedContrasts = V3_CONTRAST_SPECS.map((spec) => ({
    spec,
    ...computeContrast(spec, byCondition, taskLookup),
  }));
  const primaryContrasts = computedContrasts
    .filter((c) => c.spec.tier === 'primary')
    .map((c) => c.result);
  const referenceContrasts = computedContrasts
    .filter((c) => c.spec.tier === 'secondary')
    .map((c) => c.result);
  const dSafeItem = computedContrasts.find((c) => c.spec.tier === 'equivalence_tost');
  const tostEquivalence = dSafeItem
    ? computeTostEquivalence(dSafeItem.diffs, dSafeItem.spec, dSafeItem.result.ci95, 0.03)
    : null;

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

  // Difference-in-Differences: (C_ID - C) - (C0_clean - C0)
  const mapC = new Map((byCondition.get('C') ?? []).map((t) => [t.taskId, t]));
  const mapCId = new Map((byCondition.get('C_ID') ?? []).map((t) => [t.taskId, t]));
  const mapC0 = new Map((byCondition.get('C0') ?? []).map((t) => [t.taskId, t]));
  const mapC0Clean = new Map((byCondition.get('C0_clean') ?? []).map((t) => [t.taskId, t]));
  const didIds = [...mapC.keys()]
    .filter((id) => mapCId.has(id) && mapC0.has(id) && mapC0Clean.has(id))
    .sort();
  const didDiffs = didIds.map(
    (id) =>
      (mapCId.get(id)!.boundFactFraction - mapC.get(id)!.boundFactFraction) -
      (mapC0Clean.get(id)!.boundFactFraction - mapC0.get(id)!.boundFactFraction)
  );
  let didContrast: DidContrastResultV3 | null = null;
  if (didDiffs.length > 0) {
    const didBoot = pairedBootstrapCiOnly(didDiffs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
    const didSignFlipP = addOneSignFlipPValue(didDiffs, SIGN_FLIP_ITERATIONS, BOOTSTRAP_SEED);
    const didCellBuckets = new Map<string, number[]>();
    for (let i = 0; i < didIds.length; i++) {
      const id = didIds[i];
      const tr = mapCId.get(id)! as TrialV3 & { features?: TaskV2Item['features'] };
      const features = tr.features ?? taskLookup.get(id)?.features;
      if (!features) continue;
      const key = formatCellKey(features);
      const list = didCellBuckets.get(key);
      if (list) list.push(didDiffs[i]);
      else didCellBuckets.set(key, [didDiffs[i]]);
    }
    const didCellMeans = [...didCellBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
    didContrast = {
      name: 'DiD_C_ID_vs_C_minus_C0_clean_vs_C0',
      tier: 'secondary',
      nPairs: didIds.length,
      meanDifference: didBoot.meanDifference,
      sdDifference: computeSd(didDiffs),
      ci95: didBoot.ci95,
      signFlipPValue: didSignFlipP,
      exactCellPValue: didCellMeans.length === 8 ? exactCellSignFlip(didCellMeans) : null,
    };
  }

  const mdeTable: MdeRowV3[] = computedContrasts.map((c) =>
    computeMdeRow(c.spec.name, c.spec.tier, c.diffs)
  );
  if (didDiffs.length > 0) {
    mdeTable.push(computeMdeRow('DiD_C_ID_vs_C_minus_C0_clean_vs_C0', 'did', didDiffs));
  }

  // (a) Gated Distillation Gap Recovery Ratio (only computed when denominator 95% CI excludes 0)
  const buildDgrr = (ids: string[], mC: number, mCId: number, mC0Clean: number): DgrrStratumV3 => {
    const denomDiffs = ids
      .filter((id) => mapC.has(id) && mapC0Clean.has(id))
      .map((id) => mapC0Clean.get(id)!.boundFactFraction - mapC.get(id)!.boundFactFraction);
    const denomBoot = pairedBootstrapCiOnly(
      denomDiffs,
      BOOTSTRAP_RESAMPLES,
      BOOTSTRAP_SEED
    );
    const denominator = mC0Clean - mC;
    const numerator = mCId - mC;
    const denominatorExcludesZero =
      denomDiffs.length > 0 && (denomBoot.ci95[0] > 0 || denomBoot.ci95[1] < 0);
    return {
      meanC: mC,
      meanCId: mCId,
      meanC0Clean: mC0Clean,
      numerator,
      denominator,
      denominatorCi95: denomBoot.ci95,
      denominatorExcludesZero,
      recoveryRatio:
        denominatorExcludesZero && Math.abs(denominator) > 1e-12 ? numerator / denominator : null,
      gatedReason: denominatorExcludesZero
        ? null
        : 'Denominator (C0_clean - C) 95% CI includes 0; DGRR gated.',
    };
  };

  const allPairedDgrrIds = [...mapC.keys()].filter((id) => mapC0Clean.has(id)).sort();
  const meanC = conditions.C.meanBoundFactFraction;
  const meanCId = conditions.C_ID.meanBoundFactFraction;
  const meanC0Clean = conditions.C0_clean.meanBoundFactFraction;
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
  const appendPairedDgrrIds = cAppend.map((t) => t.taskId).filter((id) => mapC0Clean.has(id)).sort();

  // (b) Failure-Mode Attribution Table
  const failureModeAttributionTable = {} as AblationV3Report['failureModeAttributionTable'];
  for (const cond of V3_CONDITIONS) {
    failureModeAttributionTable[cond] = {
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

  // (c2) Exposure-stratified C0_clean vs C0 on {F-01, F-18, F-19, F-36}
  const targetExposureFacts = ['F-01', 'F-18', 'F-19', 'F-36'] as const;
  const computeExposureStratum = (ids: string[]): ExposureStratumC0CleanVsC0 => {
    const validIds = ids.filter((id) => mapC0.has(id) && mapC0Clean.has(id));
    const diffs = validIds.map(
      (id) => mapC0Clean.get(id)!.boundFactFraction - mapC0.get(id)!.boundFactFraction
    );
    const boot = pairedBootstrapCiOnly(diffs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
    const signFlipPValue = addOneSignFlipPValue(diffs, 10_000, BOOTSTRAP_SEED);
    const meanC0 = validIds.length
      ? validIds.reduce((s, id) => s + mapC0.get(id)!.boundFactFraction, 0) / validIds.length
      : 0;
    const meanC0Cln = validIds.length
      ? validIds.reduce((s, id) => s + mapC0Clean.get(id)!.boundFactFraction, 0) / validIds.length
      : 0;
    return {
      nPairs: validIds.length,
      meanC0,
      meanC0Clean: meanC0Cln,
      meanDifference: boot.meanDifference,
      ci95: boot.ci95,
      signFlipPValue,
    };
  };
  const pairedC0Ids = [...mapC0.keys()].filter((id) => mapC0Clean.has(id)).sort();
  const exposedAnyIds = pairedC0Ids.filter((id) => {
    const ret = retrievedByTask.get(id) ?? new Set<string>();
    return targetExposureFacts.some((f) => ret.has(f));
  });
  const unexposedAllIds = pairedC0Ids.filter((id) => {
    const ret = retrievedByTask.get(id) ?? new Set<string>();
    return !targetExposureFacts.some((f) => ret.has(f));
  });
  const perFactExposure = {} as AblationV3Report['exposureStratifiedC0CleanVsC0']['perFact'];
  for (const factId of targetExposureFacts) {
    const expIds = pairedC0Ids.filter((id) => (retrievedByTask.get(id) ?? new Set()).has(factId));
    const unexpIds = pairedC0Ids.filter((id) => !(retrievedByTask.get(id) ?? new Set()).has(factId));
    perFactExposure[factId] = {
      exposed: computeExposureStratum(expIds),
      unexposed: computeExposureStratum(unexpIds),
    };
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
    const boot = pairedBootstrapCiOnly(diffs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
    const signFlipPValue = addOneSignFlipPValue(diffs, 10_000, BOOTSTRAP_SEED);
    return {
      name: spec.name,
      nPairs: cleanIds.length,
      excludedTasks: pairedIds.length - cleanIds.length,
      meanDifference: boot.meanDifference,
      ci95: boot.ci95,
      signFlipPValue,
    };
  });

  const mixedModel = fitAblationV3Lpmm(trials, taskLookup);

  return {
    protocol: 'Ablation v3',
    partialAllowed: allowPartial,
    totalTrials: trials.length,
    provenanceVerified,
    missingProvenanceHashes,
    c0RandBoundCoverage,
    conditions,
    primaryContrasts,
    tostEquivalence,
    didContrast,
    referenceContrasts,
    mdeTable,
    distillationGapRecovery: {
      overall: buildDgrr(allPairedDgrrIds, meanC, meanCId, meanC0Clean),
      appendOnlyCells: {
        cells: ['010', '011', '110', '111'],
        nTrialsPerCondition: cAppend.length,
        ...buildDgrr(appendPairedDgrrIds, meanCApp, meanCIdApp, meanC0CleanApp),
      },
    },
    exposureStratifiedC0CleanVsC0: {
      targetFacts: targetExposureFacts,
      exposedAny: computeExposureStratum(exposedAnyIds),
      unexposedAll: computeExposureStratum(unexposedAllIds),
      perFact: perFactExposure,
    },
    failureModeAttributionTable,
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
      tasks?: TaskV2Item[];
    };
    const rawTasks = parsedTasks.test ?? parsedTasks.tasks ?? [];
    tasks = rawTasks.filter((t) => t.id.startsWith('V3-H-'));
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
