import fs from 'node:fs';
import path from 'node:path';
import { sanitizeSqlOutput } from '../src/executor.js';

export type Condition = 'A' | 'B' | 'C' | 'C0' | 'D' | 'E_B';
export type GenerationStatus = 'ok' | 'empty' | 'length' | 'other';

export interface Trial {
  condition: Condition;
  taskId: string;
  features?: {
    tenant: boolean;
    append_only: boolean;
    ingestion: boolean;
  };
  generationStatus?: GenerationStatus;
  generatedSql?: string;
  rawResponse?: string;
  rawSha256?: string;
  sanitizedSql?: string;
  sanitizedSha256?: string;
  tagError?: string | null;
  passRaw?: boolean;
  passWithTier0?: boolean;
  boundFacts: string[];
  boundPassed: boolean;
  boundFactFraction: number;
  failedFacts: string[];
  retrievedFactIds: string[];
  promptTokens: number;
  totalTokens: number;
  provider?: string;
  baseUrl?: string;
  requestedModel?: string;
  returnedModel?: string;
  oracleCommit?: string;
  oracleSha256?: string;
  tasksSha256?: string;
  factsSha256?: string;
  memorySha256?: string;
  hintBSha256?: string;
  hintCSha256?: string;
  hintC0Sha256?: string;
  hintDSha256?: string;
  hintBuildersSha256?: string;
  executorSha256?: string;
  maxTokens?: number;
  reasoningMode?: string;
  finishReason?: string;
  tableMissing?: boolean;
  migrationExitNonZero?: boolean;
  reusedFromCondition?: Condition;
}

export interface LessonInput {
  factId?: string;
  errorCode?: string;
  id?: string;
  lesson: string;
  origin?: 'distilled' | 'verbatim';
}

export interface FactInput {
  id: string;
  statement: string;
}

export interface Provenance {
  provider?: string;
  baseUrl?: string;
  requestedModel?: string;
  returnedModel?: string;
  oracleCommit?: string;
  oracleSha256?: string;
  tasksSha256?: string;
  factsSha256?: string;
  memorySha256?: string;
  hintBSha256?: string;
  hintCSha256?: string;
  hintC0Sha256?: string;
  hintDSha256?: string;
  hintBuildersSha256?: string;
  executorSha256?: string;
  topK?: number;
  gitCommit?: string;
  diffSha256?: string;
  finishReason?: string;
  settingsConstant?: boolean;
  sanitizerVerified?: boolean;
}

export interface ValidityGateResult {
  postHoc: true;
  label: string;
  settingsConstant: boolean;
  sanitizerVerified: boolean;
  bVsAPositiveWithCiExcludingZero: boolean;
  bVsA: {
    n: number;
    meanDifference: number;
    ci95: [number, number];
    signFlipPValue: number;
  } | null;
  passed: boolean;
  reasons: string[];
}

export interface BuildReportOptions {
  runId?: string;
  settingsConstant?: boolean;
  sanitizerVerified?: boolean;
  ledgerPath?: string;
}

const CONDITIONS: Condition[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
const CONFIRMATORY_BASELINES = ['A', 'B', 'C0', 'D'] as const;
const BOOTSTRAP_RESAMPLES = 10_000;
const SIGN_FLIP_ITERATIONS = 100_000;
const BOOTSTRAP_SEED = 20260101;
const EXECUTION_PROVENANCE_FIELDS = [
  'provider',
  'baseUrl',
  'requestedModel',
  'returnedModel',
  'finishReason',
] as const;
const FILE_HASH_FIELDS = [
  'oracleSha256',
  'tasksSha256',
  'factsSha256',
  'memorySha256',
] as const;
const HINT_HASH_FIELDS = [
  'hintBSha256',
  'hintDSha256',
  'hintBuildersSha256',
  'hintCSha256',
  'hintC0Sha256',
] as const;

export function wilson(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function pairedBootstrap(
  differences: number[],
  iterations = SIGN_FLIP_ITERATIONS,
  seed = BOOTSTRAP_SEED,
  bootstrapResamples = BOOTSTRAP_RESAMPLES
) {
  if (differences.length === 0) {
    return {
      n: 0,
      meanDifference: 0,
      ci95: [0, 0] as [number, number],
      signFlipPValue: 1,
    };
  }
  const n = differences.length;
  const observed = differences.reduce((sum, value) => sum + value, 0) / n;
  const random = rng(seed);

  const effectiveBootstrapResamples =
    iterations !== SIGN_FLIP_ITERATIONS && bootstrapResamples === BOOTSTRAP_RESAMPLES
      ? iterations
      : bootstrapResamples;

  const samples: number[] = [];
  for (let r = 0; r < effectiveBootstrapResamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += differences[Math.floor(random() * n)];
    }
    samples.push(sum / n);
  }
  samples.sort((a, b) => a - b);
  const quantile = (p: number) =>
    samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];

  let signFlipPValue = 1;
  if (!differences.every((d) => d === 0)) {
    const absObserved = Math.abs(observed);
    let atLeastAsExtreme = 0;
    for (let r = 0; r < iterations; r++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const flip = random() < 0.5 ? -1 : 1;
        sum += flip * differences[i];
      }
      const mean = sum / n;
      if (Math.abs(mean) + 1e-12 >= absObserved) {
        atLeastAsExtreme++;
      }
    }
    signFlipPValue = Math.min(1, (atLeastAsExtreme + 1) / (iterations + 1));
  }

  return {
    n,
    meanDifference: observed,
    ci95: [quantile(0.025), quantile(0.975)] as [number, number],
    signFlipPValue,
  };
}

function binomialLowerTail(k: number, n: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    let logCombination = 0;
    for (let j = 1; j <= i; j++) {
      logCombination += Math.log(n - j + 1) - Math.log(j);
    }
    sum += Math.exp(logCombination - n * Math.log(2));
  }
  return Math.min(1, sum);
}

export function mcnemar(reference: boolean[], target: boolean[]) {
  let b = 0;
  let c = 0;
  const n = Math.min(reference.length, target.length);
  for (let i = 0; i < n; i++) {
    if (reference[i] && !target[i]) b++;
    if (!reference[i] && target[i]) c++;
  }
  const discordant = b + c;
  return {
    n,
    b,
    c,
    pValue: discordant === 0 ? 1 : Math.min(1, 2 * binomialLowerTail(Math.min(b, c), discordant)),
  };
}

export function holmAdjust(pValues: Record<string, number>): Record<string, number> {
  const ordered = Object.entries(pValues).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const adjusted: Record<string, number> = {};
  let maximum = 0;
  ordered.forEach(([key, p], index) => {
    maximum = Math.max(maximum, Math.min(1, (ordered.length - index) * p));
    adjusted[key] = maximum;
  });
  return adjusted;
}

export function normalizeMemoryInput(raw: unknown, warnings?: string[]): LessonInput[] | null {
  if (Array.isArray(raw)) {
    const valid = raw.filter(
      (item): item is LessonInput =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as any).lesson === 'string' &&
        typeof ((item as any).factId ?? (item as any).errorCode ?? (item as any).id) === 'string'
    );
    if (valid.length === raw.length) return valid;
    warnings?.push('Unrecognised memory.json array element shape; skipping lesson analysis.');
    return null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['lessons', 'memory', 'items', 'entries']) {
      if (Array.isArray(obj[key])) {
        return normalizeMemoryInput(obj[key], warnings);
      }
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) return [];
    const mapped: LessonInput[] = [];
    for (const [key, val] of entries) {
      if (typeof val === 'string') {
        mapped.push({ factId: key, errorCode: key, lesson: val });
      } else if (val && typeof val === 'object' && typeof (val as any).lesson === 'string') {
        const v = val as any;
        mapped.push({
          factId: v.factId ?? v.errorCode ?? v.id ?? key,
          errorCode: v.errorCode ?? v.factId ?? v.id ?? key,
          lesson: v.lesson,
          ...(v.origin === 'distilled' || v.origin === 'verbatim' ? { origin: v.origin } : {}),
        });
      } else {
        warnings?.push('Unrecognised memory.json object shape; skipping lesson analysis.');
        return null;
      }
    }
    return mapped;
  }
  warnings?.push('Unrecognised memory.json shape; skipping lesson analysis.');
  return null;
}

export function normalizeFactsInput(raw: unknown, warnings?: string[]): FactInput[] | null {
  if (Array.isArray(raw)) {
    const valid = raw.filter(
      (item): item is FactInput =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as any).id === 'string' &&
        typeof (item as any).statement === 'string'
    );
    if (valid.length === raw.length) return valid;
    warnings?.push('Unrecognised facts.json array element shape; skipping lesson analysis.');
    return null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.facts)) {
      return normalizeFactsInput(obj.facts, warnings);
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) return [];
    const mapped: FactInput[] = [];
    for (const [key, val] of entries) {
      if (typeof val === 'string') {
        mapped.push({ id: key, statement: val });
      } else if (val && typeof val === 'object' && typeof (val as any).statement === 'string') {
        mapped.push({ id: (val as any).id ?? key, statement: (val as any).statement });
      } else {
        warnings?.push('Unrecognised facts.json object shape; skipping lesson analysis.');
        return null;
      }
    }
    return mapped;
  }
  warnings?.push('Unrecognised facts.json shape; skipping lesson analysis.');
  return null;
}

export function lessonOrigins(
  lessons: LessonInput[],
  facts: FactInput[],
  warnings?: string[]
): { distilled: string[]; verbatim: string[] } {
  const statements = new Map(facts.map((fact) => [fact.id, fact.statement]));
  const distilled: string[] = [];
  const verbatim: string[] = [];
  const inferredIds: string[] = [];
  for (const lesson of lessons) {
    const id = lesson.factId ?? lesson.errorCode ?? lesson.id ?? 'unknown';
    if (lesson.origin === 'distilled') {
      distilled.push(id);
    } else if (lesson.origin === 'verbatim') {
      verbatim.push(id);
    } else {
      inferredIds.push(id);
      if (lesson.lesson === statements.get(id)) verbatim.push(id);
      else distilled.push(id);
    }
  }
  if (inferredIds.length > 0 && warnings) {
    warnings.push(
      `Lesson origin was inferred from exact text equality with fact statements for ${inferredIds.length} lesson(s): ${inferredIds.sort().join(', ')}.`
    );
  }
  return { distilled: distilled.sort(), verbatim: verbatim.sort() };
}

export function isRawAllFactPass(trial: Trial): boolean {
  if (typeof trial.passRaw === 'boolean') return trial.passRaw;
  return (
    (trial.generationStatus ?? 'ok') === 'ok' &&
    !Boolean(trial.tableMissing) &&
    (trial.failedFacts?.length ?? 0) === 0
  );
}

function summarizeConditionRows(rows: Trial[]) {
  const n = rows.length;
  const strictPassCount = rows.filter((r) => r.boundPassed).length;
  const [low, high] = wilson(strictPassCount, n);
  const rawAllFactPassCount = rows.filter(isRawAllFactPass).length;
  const [rawLow, rawHigh] = wilson(rawAllFactPassCount, n);
  const tableMissing = rows.filter((row) => Boolean(row.tableMissing)).length;
  const migrationExitNonZero = rows.filter((row) => Boolean(row.migrationExitNonZero)).length;
  const reusedFromCondition = rows.filter((row) => Boolean(row.reusedFromCondition)).length;
  const reusedFromConditionB = rows.filter((row) => row.reusedFromCondition === 'B').length;
  const generationStatusCounts: Record<GenerationStatus, number> = {
    ok: rows.filter((row) => (row.generationStatus ?? 'ok') === 'ok').length,
    empty: rows.filter((row) => row.generationStatus === 'empty').length,
    length: rows.filter((row) => row.generationStatus === 'length').length,
    other: rows.filter((row) => row.generationStatus === 'other').length,
  };
  return {
    n,
    meanBoundFactFraction: n
      ? rows.reduce((sum, row) => sum + row.boundFactFraction, 0) / n
      : 0,
    strictBoundPassAt1: n ? strictPassCount / n : 0,
    strictBoundPassAt1Wilson95: [low, high] as [number, number],
    strictPassCount,
    rawAllFactPassCount,
    rawAllFactPassAt1: n ? rawAllFactPassCount / n : 0,
    rawAllFactPassAt1Wilson95: [rawLow, rawHigh] as [number, number],
    meanPromptTokens: n
      ? rows.reduce((sum, row) => sum + row.promptTokens, 0) / n
      : 0,
    meanTotalTokens: n
      ? rows.reduce((sum, row) => sum + row.totalTokens, 0) / n
      : 0,
    generationStatus: generationStatusCounts,
    generationStatusCounts,
    tableMissing,
    migrationExitNonZero,
    reusedFromCondition,
    reusedFromConditionB,
  };
}

function computePairedContrast(
  baseRows: Trial[],
  targetRows: Trial[],
  options?: {
    includePair?: (baseTrial: Trial, targetTrial: Trial, taskId: string) => boolean;
    iterations?: number;
    seed?: number;
    bootstrapResamples?: number;
  }
) {
  const base = new Map(baseRows.map((row) => [row.taskId, row]));
  const target = new Map(targetRows.map((row) => [row.taskId, row]));
  const pairedIds = [...base.keys()].filter((id) => target.has(id)).sort();
  const includedIds: string[] = [];
  const excludedTaskIds: string[] = [];
  for (const id of pairedIds) {
    const baseTrial = base.get(id) as Trial;
    const targetTrial = target.get(id) as Trial;
    if (!options?.includePair || options.includePair(baseTrial, targetTrial, id)) {
      includedIds.push(id);
    } else {
      excludedTaskIds.push(id);
    }
  }
  const differences = includedIds.map(
    (id) => (target.get(id) as Trial).boundFactFraction - (base.get(id) as Trial).boundFactFraction
  );
  const primary = pairedBootstrap(
    differences,
    options?.iterations ?? SIGN_FLIP_ITERATIONS,
    options?.seed ?? BOOTSTRAP_SEED,
    options?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES
  );
  const secondary = mcnemar(
    includedIds.map((id) => (base.get(id) as Trial).boundPassed),
    includedIds.map((id) => (target.get(id) as Trial).boundPassed)
  );
  return {
    n: includedIds.length,
    excludedTaskIds,
    primary,
    secondary,
  };
}

export function sensitivityAnalysis(trials: Trial[]) {
  const byCondition = new Map<Condition, Trial[]>();
  for (const condition of CONDITIONS) {
    byCondition.set(condition, trials.filter((trial) => trial.condition === condition));
  }
  const isCleanTrial = (trial: Trial): boolean =>
    (trial.generationStatus ?? 'ok') === 'ok' && !Boolean(trial.migrationExitNonZero);

  const comparisons: Record<
    string,
    {
      n: number;
      excludedCount: number;
      excludedTaskIds: string[];
      primary: ReturnType<typeof pairedBootstrap>;
      secondary: ReturnType<typeof mcnemar>;
    }
  > = {};

  for (const baseline of CONFIRMATORY_BASELINES) {
    const res = computePairedContrast(
      byCondition.get(baseline) ?? [],
      byCondition.get('C') ?? [],
      { includePair: (b, t) => isCleanTrial(b) && isCleanTrial(t) }
    );
    comparisons[`C_vs_${baseline}`] = {
      n: res.n,
      excludedCount: res.excludedTaskIds.length,
      excludedTaskIds: res.excludedTaskIds,
      primary: res.primary,
      secondary: res.secondary,
    };
  }
  const bVsARes = computePairedContrast(
    byCondition.get('A') ?? [],
    byCondition.get('B') ?? [],
    { includePair: (b, t) => isCleanTrial(b) && isCleanTrial(t) }
  );
  comparisons.B_vs_A = {
    n: bVsARes.n,
    excludedCount: bVsARes.excludedTaskIds.length,
    excludedTaskIds: bVsARes.excludedTaskIds,
    primary: bVsARes.primary,
    secondary: bVsARes.secondary,
  };

  return {
    exploratory: true as const,
    note: "Exploratory sensitivity analysis outside the Holm-Bonferroni family: repeats C vs A, B, C0, D (plus post-hoc B_vs_A) excluding any task where either compared condition has generationStatus !== 'ok' or migrationExitNonZero === true.",
    comparisons,
  };
}

let cachedDefaultTaskCells: Map<
  string,
  { tenant: boolean; append_only: boolean; ingestion: boolean }
> | null = null;

function loadDefaultTaskCells(): Map<
  string,
  { tenant: boolean; append_only: boolean; ingestion: boolean }
> {
  if (cachedDefaultTaskCells) return cachedDefaultTaskCells;
  const map = new Map<string, { tenant: boolean; append_only: boolean; ingestion: boolean }>();
  try {
    const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
    if (fs.existsSync(tasksPath)) {
      const parsed = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as {
        train?: Array<{ id: string; features?: any }>;
        dev?: Array<{ id: string; features?: any }>;
        test?: Array<{ id: string; features?: any }>;
      };
      for (const task of [
        ...(parsed.train ?? []),
        ...(parsed.dev ?? []),
        ...(parsed.test ?? []),
      ]) {
        if (task && typeof task.id === 'string' && task.features) {
          map.set(task.id, {
            tenant: Boolean(task.features.tenant),
            append_only: Boolean(task.features.append_only),
            ingestion: Boolean(task.features.ingestion),
          });
        }
      }
    }
  } catch {
    // ignore
  }
  cachedDefaultTaskCells = map;
  return map;
}

export function formatCellKey(features: {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
}): string {
  return `tenant=${Boolean(features.tenant)},append_only=${Boolean(features.append_only)},ingestion=${Boolean(features.ingestion)}`;
}

export function exactCellSignFlip(cellMeans: readonly number[]): number {
  const m = cellMeans.length;
  if (m === 0 || cellMeans.every((v) => v === 0)) return 1;
  const observed = cellMeans.reduce((sum, v) => sum + v, 0) / m;
  const absObserved = Math.abs(observed);
  const totalConfigs = 1 << m;
  let atLeastAsExtreme = 0;
  for (let mask = 0; mask < totalConfigs; mask++) {
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const sign = (mask & (1 << i)) !== 0 ? -1 : 1;
      sum += sign * cellMeans[i];
    }
    const mean = sum / m;
    if (Math.abs(mean) + 1e-12 >= absObserved) {
      atLeastAsExtreme += 1;
    }
  }
  return Math.min(1, atLeastAsExtreme / totalConfigs);
}

interface CellContrastSummary {
  n: number;
  cellCount: number;
  perCell: Record<string, { n: number; meanDifference: number }>;
  combinedMeanDifference: number;
  withinCellBootstrapCi95: [number, number];
  exactCellSignFlipPValue: number;
}

function computeCellContrast(
  baseRows: Trial[],
  targetRows: Trial[],
  resolvedCellByTask: ReadonlyMap<string, string>,
  seed: number,
  bootstrapResamples: number
): CellContrastSummary {
  const base = new Map(baseRows.map((row) => [row.taskId, row]));
  const target = new Map(targetRows.map((row) => [row.taskId, row]));
  const pairedIds = [...base.keys()].filter((id) => target.has(id)).sort();

  const diffsByCell = new Map<string, number[]>();
  for (const id of pairedIds) {
    const cellKey = resolvedCellByTask.get(id) ?? 'unassigned';
    const diff =
      (target.get(id) as Trial).boundFactFraction -
      (base.get(id) as Trial).boundFactFraction;
    let arr = diffsByCell.get(cellKey);
    if (!arr) {
      arr = [];
      diffsByCell.set(cellKey, arr);
    }
    arr.push(diff);
  }

  const sortedCells = [...diffsByCell.keys()].sort();
  const perCell: Record<string, { n: number; meanDifference: number }> = {};
  const cellMeans: number[] = [];

  for (const cellKey of sortedCells) {
    const diffs = diffsByCell.get(cellKey)!;
    const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    perCell[cellKey] = {
      n: diffs.length,
      meanDifference: mean,
    };
    cellMeans.push(mean);
  }

  const m = cellMeans.length;
  const combinedMeanDifference =
    m > 0 ? cellMeans.reduce((s, v) => s + v, 0) / m : 0;

  let ci95: [number, number] = [0, 0];
  if (m > 0 && bootstrapResamples > 0) {
    const random = rng(seed);
    const samples: number[] = [];
    for (let r = 0; r < bootstrapResamples; r++) {
      let cellMeanSum = 0;
      for (const cellKey of sortedCells) {
        const diffs = diffsByCell.get(cellKey)!;
        const nc = diffs.length;
        let sum = 0;
        for (let i = 0; i < nc; i++) {
          sum += diffs[Math.floor(random() * nc)];
        }
        cellMeanSum += sum / nc;
      }
      samples.push(cellMeanSum / m);
    }
    samples.sort((a, b) => a - b);
    const quantile = (p: number) =>
      samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
    ci95 = [quantile(0.025), quantile(0.975)];
  }

  const exactP = exactCellSignFlip(cellMeans);
  return {
    n: pairedIds.length,
    cellCount: m,
    perCell,
    combinedMeanDifference,
    withinCellBootstrapCi95: ci95,
    exactCellSignFlipPValue: exactP,
  };
}

export function perCellAnalysis(
  trials: Trial[],
  taskFeaturesById?: ReadonlyMap<
    string,
    { tenant: boolean; append_only: boolean; ingestion: boolean }
  >,
  seed = BOOTSTRAP_SEED,
  bootstrapResamples = BOOTSTRAP_RESAMPLES
) {
  const defaultMap = loadDefaultTaskCells();
  const resolvedCellByTask = new Map<string, string>();
  for (const trial of trials) {
    if (resolvedCellByTask.has(trial.taskId)) continue;
    const f =
      trial.features ??
      taskFeaturesById?.get(trial.taskId) ??
      defaultMap.get(trial.taskId);
    if (f) {
      resolvedCellByTask.set(trial.taskId, formatCellKey(f));
    }
  }

  const byCondition = new Map<Condition, Trial[]>();
  for (const condition of CONDITIONS) {
    byCondition.set(condition, trials.filter((trial) => trial.condition === condition));
  }

  const comparisons: Record<string, CellContrastSummary> = {};
  const cellSignFlipP: Record<string, number> = {};

  for (const baseline of CONFIRMATORY_BASELINES) {
    const key = `C_vs_${baseline}`;
    const summary = computeCellContrast(
      byCondition.get(baseline) ?? [],
      byCondition.get('C') ?? [],
      resolvedCellByTask,
      seed,
      bootstrapResamples
    );
    comparisons[key] = summary;
    cellSignFlipP[key] = summary.exactCellSignFlipPValue;
  }

  // Validity-gate contrast B vs A stays outside the confirmatory Holm family.
  comparisons.B_vs_A = computeCellContrast(
    byCondition.get('A') ?? [],
    byCondition.get('B') ?? [],
    resolvedCellByTask,
    seed,
    bootstrapResamples
  );

  const holmCellPValues = holmAdjust(cellSignFlipP);

  return {
    exploratory: true as const,
    note: 'Exploratory per-cell analysis outside the Holm-Bonferroni primary family: paired mean difference per (tenant, append_only, ingestion) cell, equal-weight cell-stratified combined estimate with within-cell bootstrap 95% CI, and exact two-sided sign-flip test over cell means (Holm-adjusted across C_vs_A, C_vs_B, C_vs_C0, C_vs_D; B_vs_A outside Holm).',
    comparisons,
    holmCellPValues,
  };
}

export interface CellICCResult {
  k: number;
  n_per_group: number;
  N: number;
  MSB: number;
  MSW: number;
  F: number;
  icc: number;
}

export function computeFeatureCellICC(
  trials: Trial[],
  taskFeaturesById?: ReadonlyMap<
    string,
    { tenant: boolean; append_only: boolean; ingestion: boolean }
  >
): {
  exploratory: true;
  boundFactFraction: CellICCResult;
  allFactPassRate: CellICCResult;
} {
  const defaultMap = loadDefaultTaskCells();
  const aTrials = trials.filter((t) => t.condition === 'A');
  const groups: Record<string, Array<{ boundFactFraction: number; allFactPassRate: number }>> = {};

  for (const t of aTrials) {
    const f =
      t.features ??
      taskFeaturesById?.get(t.taskId) ??
      defaultMap.get(t.taskId);
    const cellKey = f ? formatCellKey(f) : 'unassigned';
    if (!groups[cellKey]) groups[cellKey] = [];
    const allFactPassRate = (34 - (t.failedFacts?.length ?? 0)) / 34;
    groups[cellKey].push({
      boundFactFraction: t.boundFactFraction,
      allFactPassRate,
    });
  }

  function calcOneWayAnova(prop: 'boundFactFraction' | 'allFactPassRate'): CellICCResult {
    const k = Object.keys(groups).length;
    const groupSizes = Object.values(groups).map((g) => g.length);
    const n_per_group = groupSizes[0] ?? 0;
    const N = groupSizes.reduce((s, c) => s + c, 0);

    if (k <= 1 || N <= k || n_per_group === 0) {
      return { k, n_per_group, N, MSB: 0, MSW: 0, F: 0, icc: 0 };
    }

    let grandSum = 0;
    const groupMeans: number[] = [];
    for (const rows of Object.values(groups)) {
      const sum = rows.reduce((acc, r) => acc + r[prop], 0);
      grandSum += sum;
      groupMeans.push(sum / rows.length);
    }
    const grandMean = grandSum / N;

    let SSB = 0;
    for (const m of groupMeans) {
      SSB += n_per_group * Math.pow(m - grandMean, 2);
    }
    const MSB = SSB / (k - 1);

    let SSW = 0;
    for (const rows of Object.values(groups)) {
      const mean = rows.reduce((acc, r) => acc + r[prop], 0) / rows.length;
      for (const r of rows) {
        SSW += Math.pow(r[prop] - mean, 2);
      }
    }
    const MSW = SSW / (N - k);

    const denom = MSB + (n_per_group - 1) * MSW;
    const icc = denom !== 0 ? (MSB - MSW) / denom : 0;
    const F = MSW !== 0 ? MSB / MSW : 0;

    return { k, n_per_group, N, MSB, MSW, F, icc };
  }

  return {
    exploratory: true,
    boundFactFraction: calcOneWayAnova('boundFactFraction'),
    allFactPassRate: calcOneWayAnova('allFactPassRate'),
  };
}

export function cleanMigrationConditionAnalysis(
  trials: Trial[]
): Record<Condition, ReturnType<typeof summarizeConditionRows>> {
  return Object.fromEntries(
    CONDITIONS.map((condition) => {
      const rows = trials.filter(
        (trial) => trial.condition === condition && !trial.migrationExitNonZero
      );
      return [condition, summarizeConditionRows(rows)];
    })
  ) as Record<Condition, ReturnType<typeof summarizeConditionRows>>;
}

export function sensitivityAnalysisExcludingEarlyTasks(
  trials: Trial[],
  excludedTaskIds = ['H-001', 'H-002', 'H-003', 'H-004', 'H-005', 'H-006', 'H-007', 'H-008'],
  seed = BOOTSTRAP_SEED,
  bootstrapResamples = BOOTSTRAP_RESAMPLES
) {
  const excludedSet = new Set(excludedTaskIds);
  const byCondition = new Map<Condition, Trial[]>();
  for (const condition of CONDITIONS) {
    byCondition.set(condition, trials.filter((t) => t.condition === condition));
  }

  const comparisons: Record<string, any> = {};
  const primaryP: Record<string, number> = {};
  const secondaryP: Record<string, number> = {};

  for (const baseline of CONFIRMATORY_BASELINES) {
    const key = `C_vs_${baseline}`;
    const res = computePairedContrast(
      byCondition.get(baseline) ?? [],
      byCondition.get('C') ?? [],
      {
        includePair: (_b, _t, id) => !excludedSet.has(id),
        seed,
        bootstrapResamples,
      }
    );
    comparisons[key] = {
      n: res.n,
      excludedCount: excludedTaskIds.length,
      excludedTaskIds,
      primary: res.primary,
      secondary: res.secondary,
    };
    primaryP[key] = res.primary.signFlipPValue;
    secondaryP[key] = res.secondary.pValue;
  }

  const bVsARes = computePairedContrast(
    byCondition.get('A') ?? [],
    byCondition.get('B') ?? [],
    {
      includePair: (_b, _t, id) => !excludedSet.has(id),
      seed,
      bootstrapResamples,
    }
  );
  comparisons.B_vs_A = {
    n: bVsARes.n,
    excludedCount: excludedTaskIds.length,
    excludedTaskIds,
    primary: bVsARes.primary,
    secondary: bVsARes.secondary,
  };

  return {
    exploratory: true as const,
    excludedTaskIds,
    comparisons,
    holmPrimaryPValues: holmAdjust(primaryP),
    holmSecondaryPValues: holmAdjust(secondaryP),
  };
}

export function analyzeTrials(trials: Trial[]) {
  const byCondition = new Map<Condition, Trial[]>();
  for (const condition of CONDITIONS) {
    byCondition.set(condition, trials.filter((trial) => trial.condition === condition));
  }
  const conditions = Object.fromEntries(
    CONDITIONS.map((condition) => [condition, summarizeConditionRows(byCondition.get(condition) ?? [])])
  );

  const comparisons: Record<string, any> = {};
  const primaryP: Record<string, number> = {};
  const secondaryP: Record<string, number> = {};
  for (const baseline of CONFIRMATORY_BASELINES) {
    const key = `C_vs_${baseline}`;
    const res = computePairedContrast(
      byCondition.get(baseline) ?? [],
      byCondition.get('C') ?? []
    );
    comparisons[key] = { n: res.n, primary: res.primary, secondary: res.secondary };
    primaryP[key] = res.primary.signFlipPValue;
    secondaryP[key] = res.secondary.pValue;
  }

  // Validity-gate contrast B vs A stays outside the 4-contrast confirmatory Holm family.
  const bVsA = computePairedContrast(
    byCondition.get('A') ?? [],
    byCondition.get('B') ?? []
  );
  comparisons.B_vs_A = {
    n: bVsA.n,
    primary: bVsA.primary,
    secondary: bVsA.secondary,
  };

  const sensitivity = sensitivityAnalysis(trials);
  const sensitivityExcludingEarlyTasks = sensitivityAnalysisExcludingEarlyTasks(trials);
  const perCell = perCellAnalysis(trials);
  const cellICC = computeFeatureCellICC(trials);
  const cleanMigrationAnalysis = cleanMigrationConditionAnalysis(trials);

  return {
    conditions,
    comparisons,
    bVsA: comparisons.B_vs_A,
    holmPrimaryPValues: holmAdjust(primaryP),
    holmSecondaryPValues: holmAdjust(secondaryP),
    holmCellPValues: perCell.holmCellPValues,
    sensitivityAnalysis: sensitivity,
    sensitivityExcludingEarlyTasks,
    cleanMigrationAnalysis,
    perCellAnalysis: perCell,
    cellICC,
    generationIndependenceNote:
      "E_B trials with reusedFromCondition='B' reuse Condition B's cached generation and are not independent generations.",
  };
}

function pairedSubsetComparison(
  c: Trial[],
  c0: Trial[],
  include: (taskId: string) => boolean
) {
  const cByTask = new Map(c.map((row) => [row.taskId, row]));
  const c0ByTask = new Map(c0.map((row) => [row.taskId, row]));
  const ids = [...cByTask.keys()].filter((id) => c0ByTask.has(id) && include(id)).sort();
  return {
    n: ids.length,
    primary: pairedBootstrap(
      ids.map((id) => (cByTask.get(id) as Trial).boundFactFraction - (c0ByTask.get(id) as Trial).boundFactFraction)
    ),
  };
}

export function lessonOriginAnalysis(
  trials: Trial[],
  origins: { distilled: string[]; verbatim: string[] }
) {
  const c = trials.filter((row) => row.condition === 'C');
  const c0 = trials.filter((row) => row.condition === 'C0');
  const distilled = new Set(origins.distilled);
  const verbatim = new Set(origins.verbatim);
  const cByTask = new Map(c.map((row) => [row.taskId, row]));
  const originForTask = (taskId: string) => {
    const row = cByTask.get(taskId);
    const retrieved = row?.retrievedFactIds ?? [];
    return {
      hasDistilled: retrieved.some((id) => distilled.has(id)),
      allVerbatim: retrieved.length > 0 && retrieved.every((id) => verbatim.has(id)),
    };
  };
  return {
    exploratory: true,
    note: 'Exploratory analysis outside the Holm-Bonferroni family. The all-verbatim subset is a negative control because C and C0 inject identical text there.',
    lessonCounts: { distilled: origins.distilled.length, verbatim: origins.verbatim.length },
    tasksWithDistilledLesson: {
      exploratory: true,
      ...pairedSubsetComparison(c, c0, (id) => originForTask(id).hasDistilled),
    },
    tasksWithAllVerbatimLessons: {
      exploratory: true,
      negativeControl: true,
      note: 'Negative control: C and C0 inject identical text on this subset.',
      ...pairedSubsetComparison(c, c0, (id) => originForTask(id).allVerbatim),
    },
  };
}

export function retrievalOverlap(trials: Trial[]) {
  const rows = trials.filter((row) => row.condition === 'C' || row.condition === 'C0');
  const byCondition: Record<string, any> = {};
  for (const condition of ['C', 'C0'] as Condition[]) {
    const selected = rows.filter((row) => row.condition === condition);
    const fractions = selected
      .map((row) => {
        const bound = new Set(row.boundFacts);
        const retrieved = new Set(row.retrievedFactIds);
        return bound.size === 0
          ? 1
          : [...bound].filter((fact) => retrieved.has(fact)).length / bound.size;
      })
      .sort((a, b) => a - b);
    const full = selected.filter((row) => {
      const bound = new Set(row.boundFacts);
      return [...bound].every((fact) => row.retrievedFactIds.includes(fact));
    });
    const partial = selected.filter((row) => !full.includes(row));
    byCondition[condition] = {
      n: selected.length,
      meanFraction: fractions.length
        ? fractions.reduce((sum, value) => sum + value, 0) / fractions.length
        : 0,
      distribution: fractions,
      fullOverlap: {
        n: full.length,
        meanBoundFactFraction: full.length
          ? full.reduce((sum, row) => sum + row.boundFactFraction, 0) / full.length
          : 0,
      },
      partialOverlap: {
        n: partial.length,
        meanBoundFactFraction: partial.length
          ? partial.reduce((sum, row) => sum + row.boundFactFraction, 0) / partial.length
          : 0,
      },
    };
  }
  return byCondition;
}

export interface FactPairBucketSummary {
  n: number;
  pairCount: number;
  condPassCount: number;
  aPassCount: number;
  condPassRate: number;
  aPassRate: number;
  passRateDifference: number;
  exploratory: true;
  negativeControl?: true;
}

function summarizeFactPairs(
  pairs: Array<{ condPassed: boolean; aPassed: boolean }>,
  isNegativeControl = false
): FactPairBucketSummary {
  const n = pairs.length;
  const condPassCount = pairs.filter((p) => p.condPassed).length;
  const aPassCount = pairs.filter((p) => p.aPassed).length;
  const condPassRate = n > 0 ? condPassCount / n : 0;
  const aPassRate = n > 0 ? aPassCount / n : 0;
  return {
    n,
    pairCount: n,
    condPassCount,
    aPassCount,
    condPassRate,
    aPassRate,
    passRateDifference: condPassRate - aPassRate,
    exploratory: true,
    ...(isNegativeControl ? { negativeControl: true as const } : {}),
  };
}

function didBoundFactPassOnTrial(trial: Trial, factId: string): boolean {
  const failed = new Set(trial.failedFacts ?? []);
  if (Boolean(trial.tableMissing) || failed.has('F-13')) {
    return false;
  }
  return !failed.has(factId);
}

export function perFactRetrievalAnalysis(trials: Trial[]) {
  const aByTask = new Map(
    trials.filter((row) => row.condition === 'A').map((row) => [row.taskId, row])
  );
  const byCondition: Record<
    'C' | 'C0',
    {
      exploratory: true;
      pairedTasks: number;
      retrieved: FactPairBucketSummary;
      nonRetrieved: FactPairBucketSummary;
      byFact: Record<
        string,
        {
          retrieved: FactPairBucketSummary;
          nonRetrieved: FactPairBucketSummary;
        }
      >;
    }
  > = {} as any;

  for (const condition of ['C', 'C0'] as const) {
    const condTrials = trials
      .filter((row) => row.condition === condition && aByTask.has(row.taskId))
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
    const retrievedPairs: Array<{ condPassed: boolean; aPassed: boolean }> = [];
    const nonRetrievedPairs: Array<{ condPassed: boolean; aPassed: boolean }> = [];
    const perFactPairs = new Map<
      string,
      {
        retrieved: Array<{ condPassed: boolean; aPassed: boolean }>;
        nonRetrieved: Array<{ condPassed: boolean; aPassed: boolean }>;
      }
    >();

    for (const trial of condTrials) {
      const aTrial = aByTask.get(trial.taskId)!;
      const retrievedSet = new Set(trial.retrievedFactIds ?? []);
      for (const factId of trial.boundFacts ?? []) {
        const pair = {
          condPassed: didBoundFactPassOnTrial(trial, factId),
          aPassed: didBoundFactPassOnTrial(aTrial, factId),
        };
        let entry = perFactPairs.get(factId);
        if (!entry) {
          entry = { retrieved: [], nonRetrieved: [] };
          perFactPairs.set(factId, entry);
        }
        if (retrievedSet.has(factId)) {
          retrievedPairs.push(pair);
          entry.retrieved.push(pair);
        } else {
          nonRetrievedPairs.push(pair);
          entry.nonRetrieved.push(pair);
        }
      }
    }

    const byFact = Object.fromEntries(
      [...perFactPairs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([factId, buckets]) => [
          factId,
          {
            retrieved: summarizeFactPairs(buckets.retrieved, false),
            nonRetrieved: summarizeFactPairs(buckets.nonRetrieved, true),
          },
        ])
    );

    byCondition[condition] = {
      exploratory: true,
      pairedTasks: condTrials.length,
      retrieved: summarizeFactPairs(retrievedPairs, false),
      nonRetrieved: summarizeFactPairs(nonRetrievedPairs, true),
      byFact,
    };
  }

  return {
    exploratory: true as const,
    note: 'Exploratory per-(task, bound fact) analysis outside the Holm-Bonferroni family. Non-retrieved (task, bound fact) pairs serve as a negative control.',
    C: byCondition.C,
    C0: byCondition.C0,
  };
}

function failuresByFact(trials: Trial[]) {
  const result: Record<string, Record<string, number>> = {};
  for (const condition of CONDITIONS) {
    const counts: Record<string, number> = {};
    for (const trial of trials.filter((row) => row.condition === condition)) {
      for (const fact of trial.failedFacts) counts[fact] = (counts[fact] ?? 0) + 1;
    }
    result[condition] = Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    );
  }
  return result;
}

export function parseArgs(argv: string[]) {
  const value = (flag: string, fallback: string) => {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === flag && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        return argv[i + 1];
      }
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1);
      }
    }
    return fallback;
  };
  const optionalValue = (flag: string): string | undefined => {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === flag && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        return argv[i + 1];
      }
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1);
      }
    }
    return undefined;
  };
  return {
    checkpoint: path.resolve(value('--checkpoint', '.axiom-state/ablation-v2-checkpoint.json')),
    out: path.resolve(value('--out', 'out/ablation-v2-analysis.json')),
    runId: optionalValue('--run-id'),
  };
}

function formatRateWithWilson(rate: number | undefined, ci: [number, number] | undefined): string {
  const val = Number.isFinite(rate) ? (rate as number).toFixed(4) : '0.0000';
  if (!ci || ci.length !== 2) return val;
  return `${val} [${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
}

function formatConditionsTable(conditions: Record<string, any>): string {
  const lines = [
    '| Condition | n | Mean bound fraction | Strict Pass@1 [Wilson 95%] | Raw Pass@1 [Wilson 95%] | Mean prompt tokens | Mean total tokens | gen(ok/empty/length/other) | tableMissing | migrationExitNonZero | reusedFromCondition |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const condition of CONDITIONS) {
    const row = conditions[condition];
    if (!row) continue;
    const gs = row.generationStatus ?? { ok: row.n, empty: 0, length: 0, other: 0 };
    const strictStr = formatRateWithWilson(row.strictBoundPassAt1, row.strictBoundPassAt1Wilson95);
    const rawStr = formatRateWithWilson(row.rawAllFactPassAt1, row.rawAllFactPassAt1Wilson95);
    lines.push(
      `| ${condition} | ${row.n} | ${row.meanBoundFactFraction.toFixed(4)} | ${strictStr} | ${rawStr} | ${row.meanPromptTokens.toFixed(1)} | ${row.meanTotalTokens.toFixed(1)} | ${gs.ok}/${gs.empty}/${gs.length}/${gs.other} | ${row.tableMissing} | ${row.migrationExitNonZero} | ${row.reusedFromCondition} |`
    );
  }
  return lines.join('\n');
}

function formatCleanMigrationTable(cleanAnalysis: Record<string, any>): string {
  const lines = [
    '| Condition | n | Mean bound fraction | Strict Pass@1 [Wilson 95%] | Raw Pass@1 [Wilson 95%] | Mean prompt tokens | Mean total tokens | gen(ok/empty/length/other) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const condition of CONDITIONS) {
    const row = cleanAnalysis[condition];
    if (!row) continue;
    const gs = row.generationStatus ?? { ok: row.n, empty: 0, length: 0, other: 0 };
    const strictStr = formatRateWithWilson(row.strictBoundPassAt1, row.strictBoundPassAt1Wilson95);
    const rawStr = formatRateWithWilson(row.rawAllFactPassAt1, row.rawAllFactPassAt1Wilson95);
    lines.push(
      `| ${condition} | ${row.n} | ${row.meanBoundFactFraction.toFixed(4)} | ${strictStr} | ${rawStr} | ${row.meanPromptTokens.toFixed(1)} | ${row.meanTotalTokens.toFixed(1)} | ${gs.ok}/${gs.empty}/${gs.length}/${gs.other} |`
    );
  }
  return lines.join('\n');
}

function formatPairedComparisonsTable(analysis: any): string {
  const lines = [
    '| Contrast | n | Mean Diff [95% CI] | Sign-Flip p (raw) | Holm Primary p | Cell Sign-Flip p | Holm Cell p | McNemar (b/c) | McNemar p (raw) | Holm Secondary p |',
    '|:---|---:|:---:|---:|---:|---:|---:|:---:|---:|---:|',
  ];
  const keys = [...CONFIRMATORY_BASELINES.map((b) => `C_vs_${b}`), 'B_vs_A'];
  for (const key of keys) {
    const comp = analysis.comparisons?.[key];
    if (!comp) continue;
    const isConfirmatory = key !== 'B_vs_A';
    const label = isConfirmatory ? key : `${key} (validity gate; outside Holm)`;
    const meanDiff = comp.primary.meanDifference;
    const meanDiffStr = `${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)}`;
    const ciStr = `[${comp.primary.ci95[0].toFixed(4)}, ${comp.primary.ci95[1].toFixed(4)}]`;
    const signFlipP = comp.primary.signFlipPValue.toExponential(4);
    const holmPrimP = isConfirmatory
      ? (analysis.holmPrimaryPValues?.[key] ?? comp.primary.signFlipPValue).toExponential(4)
      : '—';
    const cellComp = analysis.perCellAnalysis?.comparisons?.[key];
    const cellSignFlipP =
      cellComp?.exactCellSignFlipPValue !== undefined
        ? cellComp.exactCellSignFlipPValue.toExponential(4)
        : '—';
    const holmCellRaw = isConfirmatory
      ? analysis.holmCellPValues?.[key] ??
        analysis.perCellAnalysis?.holmCellPValues?.[key] ??
        cellComp?.exactCellSignFlipPValue
      : undefined;
    const holmCellP = holmCellRaw !== undefined ? holmCellRaw.toExponential(4) : '—';
    const mcnemarDiscordant = `${comp.secondary.b}/${comp.secondary.c}`;
    const mcnemarP = comp.secondary.pValue.toExponential(4);
    const holmSecP = isConfirmatory
      ? (analysis.holmSecondaryPValues?.[key] ?? comp.secondary.pValue).toExponential(4)
      : '—';

    lines.push(
      `| ${label} | ${comp.n} | ${meanDiffStr} ${ciStr} | ${signFlipP} | ${holmPrimP} | ${cellSignFlipP} | ${holmCellP} | ${mcnemarDiscordant} | ${mcnemarP} | ${holmSecP} |`
    );
  }
  return lines.join('\n');
}

function formatPerCellTables(perCell: any, holmCellPValues?: Record<string, number>): string {
  if (!perCell?.comparisons) return '_No per-cell comparison data available._';
  const lines = [
    '### Cell-Stratified Combined Summary',
    '',
    '| Contrast | Cells | Combined Mean Diff [Within-Cell 95% CI] | Exact Cell Sign-Flip p | Holm Cell p |',
    '|:---|---:|:---:|---:|---:|',
  ];
  const keys = [...CONFIRMATORY_BASELINES.map((b) => `C_vs_${b}`), 'B_vs_A'];
  for (const key of keys) {
    const comp = perCell.comparisons[key];
    if (!comp) continue;
    const isConfirmatory = key !== 'B_vs_A';
    const label = isConfirmatory ? key : `${key} (outside Holm)`;
    const combMean = comp.combinedMeanDifference ?? 0;
    const combMeanStr = `${combMean >= 0 ? '+' : ''}${combMean.toFixed(4)}`;
    const ci = comp.withinCellBootstrapCi95 ?? [0, 0];
    const ciStr = `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
    const exactP = comp.exactCellSignFlipPValue !== undefined ? comp.exactCellSignFlipPValue.toExponential(4) : '—';
    const rawHolm = isConfirmatory
      ? holmCellPValues?.[key] ?? perCell.holmCellPValues?.[key] ?? comp.exactCellSignFlipPValue
      : undefined;
    const holmP = rawHolm !== undefined ? rawHolm.toExponential(4) : '—';
    lines.push(`| ${label} | ${comp.cellCount ?? 0} | ${combMeanStr} ${ciStr} | ${exactP} | ${holmP} |`);
  }

  lines.push('', '### Per-Cell Mean Differences Breakdown', '');
  lines.push('| Contrast | Cell | n | Mean Difference |');
  lines.push('|:---|:---|---:|---:|');
  for (const key of keys) {
    const comp = perCell.comparisons[key];
    if (!comp?.perCell) continue;
    for (const [cellKey, cellData] of Object.entries(comp.perCell as Record<string, any>)) {
      const meanDiff = cellData.meanDifference ?? 0;
      const diffStr = `${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)}`;
      lines.push(`| ${key} | \`${cellKey}\` | ${cellData.n ?? 0} | ${diffStr} |`);
    }
  }
  return lines.join('\n');
}

function formatCellICCTable(cellICC: any): string {
  const lines = [
    '| Metric | Cells (k) | n per cell | Total N | MSB | MSW | F | ICC(1) |',
    '|:---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  if (cellICC?.boundFactFraction) {
    const b = cellICC.boundFactFraction;
    lines.push(
      `| Bound-Fact Fraction (\`boundFactFraction\`) | ${b.k} | ${b.n_per_group} | ${b.N} | ${b.MSB.toFixed(4)} | ${b.MSW.toFixed(4)} | ${b.F.toFixed(4)} | ${b.icc.toFixed(4)} |`
    );
  }
  if (cellICC?.allFactPassRate) {
    const a = cellICC.allFactPassRate;
    lines.push(
      `| All-Fact Pass Rate (\`allFactPassRate\`) | ${a.k} | ${a.n_per_group} | ${a.N} | ${a.MSB.toFixed(4)} | ${a.MSW.toFixed(4)} | ${a.F.toFixed(4)} | ${a.icc.toFixed(4)} |`
    );
  }
  return lines.join('\n');
}

function formatSensitivityExcludingEarlyTable(sensEarly: any): string {
  if (!sensEarly?.comparisons) return '_No early task sensitivity data available._';
  const lines = [
    '| Contrast | n | Mean Diff [95% CI] | Sign-Flip p (raw) | Holm Primary p | McNemar (b/c) | McNemar p (raw) | Holm Secondary p |',
    '|:---|---:|:---:|---:|---:|:---:|---:|---:|',
  ];
  const keys = [...CONFIRMATORY_BASELINES.map((b) => `C_vs_${b}`), 'B_vs_A'];
  for (const key of keys) {
    const comp = sensEarly?.comparisons?.[key];
    if (!comp?.primary) continue;
    const isConfirmatory = key !== 'B_vs_A';
    const label = isConfirmatory ? key : `${key} (outside Holm)`;
    const meanDiff = comp.primary.meanDifference ?? 0;
    const meanDiffStr = `${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)}`;
    const ci = comp.primary.ci95 ?? [0, 0];
    const ciStr = `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
    const signFlipP = comp.primary.signFlipPValue !== undefined ? comp.primary.signFlipPValue.toExponential(4) : '—';
    const holmPrimP = isConfirmatory
      ? (sensEarly.holmPrimaryPValues?.[key] ?? comp.primary.signFlipPValue)?.toExponential?.(4) ?? '—'
      : '—';
    const mcnemarDiscordant = `${comp.secondary?.b ?? 0}/${comp.secondary?.c ?? 0}`;
    const mcnemarP = comp.secondary?.pValue !== undefined ? comp.secondary.pValue.toExponential(4) : '—';
    const holmSecP = isConfirmatory
      ? (sensEarly.holmSecondaryPValues?.[key] ?? comp.secondary?.pValue)?.toExponential?.(4) ?? '—'
      : '—';

    lines.push(
      `| ${label} | ${comp.n ?? 0} | ${meanDiffStr} ${ciStr} | ${signFlipP} | ${holmPrimP} | ${mcnemarDiscordant} | ${mcnemarP} | ${holmSecP} |`
    );
  }
  return lines.join('\n');
}

function formatSensitivityTable(sens: any): string {
  if (!sens?.comparisons) return '_No sensitivity analysis data available._';
  const lines = [
    '| Contrast | Included n | Excluded Count | Mean Diff [95% CI] | Sign-Flip p | McNemar (b/c) | McNemar p |',
    '|:---|---:|---:|:---:|---:|:---:|---:|',
  ];
  const keys = [...CONFIRMATORY_BASELINES.map((b) => `C_vs_${b}`), 'B_vs_A'];
  for (const key of keys) {
    const comp = sens?.comparisons?.[key];
    if (!comp?.primary) continue;
    const meanDiff = comp.primary.meanDifference ?? 0;
    const meanDiffStr = `${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)}`;
    const ci = comp.primary.ci95 ?? [0, 0];
    const ciStr = `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
    const signFlipP = comp.primary.signFlipPValue !== undefined ? comp.primary.signFlipPValue.toExponential(4) : '—';
    const mcnemarDiscordant = `${comp.secondary?.b ?? 0}/${comp.secondary?.c ?? 0}`;
    const mcnemarP = comp.secondary?.pValue !== undefined ? comp.secondary.pValue.toExponential(4) : '—';

    lines.push(
      `| ${key} | ${comp.n ?? 0} | ${comp.excludedCount ?? 0} | ${meanDiffStr} ${ciStr} | ${signFlipP} | ${mcnemarDiscordant} | ${mcnemarP} |`
    );
  }
  return lines.join('\n');
}

function readPairCount(bucket: any): number {
  return bucket?.pairCount ?? bucket?.n ?? bucket?.factPairs ?? 0;
}

function readCondPassRate(bucket: any): number | undefined {
  return bucket?.condPassRate ?? bucket?.conditionPassRate;
}

function readAPassRate(bucket: any): number | undefined {
  return bucket?.aPassRate ?? bucket?.conditionAPassRate;
}

function readPassDiff(bucket: any): number | undefined {
  return bucket?.passRateDifference ?? bucket?.difference;
}

function formatPerFactRetrievalTables(retrieval: any): string {
  if (!retrieval) return '_No per-fact retrieval data available._';
  const lines: string[] = [];

  lines.push('### Aggregate Retrieved vs Non-Retrieved Stratification', '');
  lines.push('| Condition | Stratum | Fact Pairs | Condition Pass Rate | Condition A Pass Rate | Difference |');
  lines.push('|:---|:---|---:|---:|---:|---:|');

  for (const cond of ['C', 'C0'] as const) {
    const condData = retrieval[cond];
    if (!condData) continue;
    const ret = condData.retrieved;
    const nonRet = condData.nonRetrieved;

    if (ret) {
      const retDiff = readPassDiff(ret) ?? 0;
      const retDiffStr = `${retDiff >= 0 ? '+' : ''}${retDiff.toFixed(4)}`;
      const retCondPass = (readCondPassRate(ret) ?? 0).toFixed(4);
      const retAPass = (readAPassRate(ret) ?? 0).toFixed(4);
      lines.push(
        `| Condition ${cond} | Retrieved | ${readPairCount(ret)} | ${retCondPass} | ${retAPass} | ${retDiffStr} |`
      );
    }
    if (nonRet) {
      const nonRetDiff = readPassDiff(nonRet) ?? 0;
      const nonRetDiffStr = `${nonRetDiff >= 0 ? '+' : ''}${nonRetDiff.toFixed(4)}`;
      const nonRetCondPass = (readCondPassRate(nonRet) ?? 0).toFixed(4);
      const nonRetAPass = (readAPassRate(nonRet) ?? 0).toFixed(4);
      lines.push(
        `| Condition ${cond} | Non-Retrieved (Negative Control) | ${readPairCount(nonRet)} | ${nonRetCondPass} | ${nonRetAPass} | ${nonRetDiffStr} |`
      );
    }
  }

  for (const cond of ['C', 'C0'] as const) {
    const condData = retrieval[cond];
    if (!condData?.byFact) continue;
    lines.push('', `### Condition ${cond} Per-Fact Retrieval Breakdown`, '');
    lines.push('| Fact | Retrievable? | Retrieved Pairs | Cond Pass (Ret) | Cond A Pass (Ret) | Diff (Ret) | Non-Ret Pairs | Cond Pass (Non-Ret) | Cond A Pass (Non-Ret) | Diff (Non-Ret) |');
    lines.push('|:---|:---:|---:|---:|---:|---:|---:|---:|---:|---:|');

    const sortedFacts = Object.keys(condData.byFact).sort();
    for (const fId of sortedFacts) {
      const fData = condData.byFact[fId];
      const r = fData?.retrieved;
      const nr = fData?.nonRetrieved;
      const rCount = readPairCount(r);
      const nrCount = readPairCount(nr);
      const isRet = rCount > 0;

      const rCond = readCondPassRate(r);
      const rA = readAPassRate(r);
      const rDiffVal = readPassDiff(r);
      const rCondPass = isRet && rCond !== undefined ? rCond.toFixed(4) : '—';
      const rAPass = isRet && rA !== undefined ? rA.toFixed(4) : '—';
      const rDiff = isRet && rDiffVal !== undefined ? `${rDiffVal >= 0 ? '+' : ''}${rDiffVal.toFixed(4)}` : '—';

      const nrCond = readCondPassRate(nr);
      const nrA = readAPassRate(nr);
      const nrDiffVal = readPassDiff(nr);
      const nrCondPass = nrCount > 0 && nrCond !== undefined ? nrCond.toFixed(4) : '—';
      const nrAPass = nrCount > 0 && nrA !== undefined ? nrA.toFixed(4) : '—';
      const nrDiff = nrCount > 0 && nrDiffVal !== undefined ? `${nrDiffVal >= 0 ? '+' : ''}${nrDiffVal.toFixed(4)}` : '—';

      lines.push(
        `| ${fId} | ${isRet ? 'Yes' : 'No'} | ${rCount} | ${rCondPass} | ${rAPass} | ${rDiff} | ${nrCount} | ${nrCondPass} | ${nrAPass} | ${nrDiff} |`
      );
    }
  }

  return lines.join('\n');
}

function formatRetrievalOverlapTable(overlap: any): string {
  if (!overlap) return '_No retrieval overlap data available._';

  // Legacy single-object shape support
  if (overlap.histogram || overlap.meanOverlapFraction !== undefined) {
    const lines = [
      '### Overlap Distribution',
      '',
      '| Overlap Fraction | Count | Percentage |',
      '|:---|---:|---:|',
    ];
    if (overlap.histogram) {
      for (const [bin, count] of Object.entries(overlap.histogram as Record<string, number>)) {
        const pct = overlap.totalTasks ? ((count / overlap.totalTasks) * 100).toFixed(1) + '%' : '0%';
        lines.push(`| ${bin} | ${count} | ${pct} |`);
      }
    }
    lines.push('', `Mean bound fact overlap fraction: **${(overlap.meanOverlapFraction ?? 0).toFixed(4)}**`, '');
    lines.push('### Full vs Partial Overlap Subsets', '');
    lines.push('| Subset | Task Count | Mean Bound Fact Fraction |');
    lines.push('|:---|---:|---:|');
    if (overlap.fullOverlap) {
      lines.push(`| Full Overlap (100%) | ${overlap.fullOverlap.n} | ${overlap.fullOverlap.meanBoundFactFraction.toFixed(4)} |`);
    }
    if (overlap.partialOverlap) {
      lines.push(`| Partial Overlap (<100%) | ${overlap.partialOverlap.n} | ${overlap.partialOverlap.meanBoundFactFraction.toFixed(4)} |`);
    }
    return lines.join('\n');
  }

  const lines: string[] = [];
  for (const cond of ['C', 'C0'] as const) {
    const condData = overlap[cond];
    if (!condData) continue;
    const dist = Array.isArray(condData.distribution) ? (condData.distribution as number[]) : [];
    const total = condData.n ?? dist.length;
    const counts = new Map<string, number>();
    for (const val of dist) {
      const bin = Number(val).toFixed(4);
      counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
    lines.push(`### Condition ${cond} Overlap Distribution`, '');
    lines.push('| Overlap Fraction | Count | Percentage |');
    lines.push('|:---|---:|---:|');
    const sortedBins = [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    if (sortedBins.length === 0) {
      lines.push('| — | 0 | 0.0% |');
    } else {
      for (const [bin, count] of sortedBins) {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0.0%';
        lines.push(`| ${bin} | ${count} | ${pct} |`);
      }
    }
    lines.push(
      '',
      `Condition ${cond} mean bound fact overlap fraction: **${(condData.meanFraction ?? 0).toFixed(4)}**`,
      ''
    );
  }

  lines.push('### Full vs Partial Overlap Subsets', '');
  lines.push('| Condition | Subset | Task Count | Mean Bound Fact Fraction |');
  lines.push('|:---|:---|---:|---:|');
  for (const cond of ['C', 'C0'] as const) {
    const condData = overlap[cond];
    if (!condData) continue;
    if (condData.fullOverlap) {
      lines.push(
        `| ${cond} | Full Overlap (100%) | ${condData.fullOverlap.n} | ${condData.fullOverlap.meanBoundFactFraction.toFixed(4)} |`
      );
    }
    if (condData.partialOverlap) {
      lines.push(
        `| ${cond} | Partial Overlap (<100%) | ${condData.partialOverlap.n} | ${condData.partialOverlap.meanBoundFactFraction.toFixed(4)} |`
      );
    }
  }
  return lines.join('\n');
}

function formatLessonOriginTable(orig: any): string {
  const lines: string[] = [];
  if (orig?.lessonCounts) {
    lines.push(
      `Lesson inventory counts: **distilled = ${orig.lessonCounts.distilled ?? 0}**, **verbatim = ${orig.lessonCounts.verbatim ?? 0}**.`,
      ''
    );
  }
  lines.push('| Subset | Task Count | C vs C0 Mean Diff [95% CI] | Sign-Flip p |');
  lines.push('|:---|---:|:---:|---:|');

  const distilledN = orig?.tasksWithDistilledLesson?.n ?? orig?.distilledSubset?.n;
  const distilledPrimary = orig?.tasksWithDistilledLesson?.primary ?? orig?.distilledSubset;
  if (distilledPrimary) {
    const nVal = distilledN ?? distilledPrimary.n ?? 0;
    const mean = distilledPrimary.meanDifference ?? 0;
    const diffStr = `${mean >= 0 ? '+' : ''}${mean.toFixed(4)}`;
    const ci = distilledPrimary.ci95 ?? [0, 0];
    const ciStr = `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
    const pVal = distilledPrimary.signFlipPValue !== undefined ? distilledPrimary.signFlipPValue.toExponential(4) : '—';
    lines.push(`| Distilled Subset (at least one distilled lesson) | ${nVal} | ${diffStr} ${ciStr} | ${pVal} |`);
  }

  const verbatimN = orig?.tasksWithAllVerbatimLessons?.n ?? orig?.allVerbatimSubset?.n;
  const verbatimPrimary = orig?.tasksWithAllVerbatimLessons?.primary ?? orig?.allVerbatimSubset;
  if (verbatimPrimary) {
    const nVal = verbatimN ?? verbatimPrimary.n ?? 0;
    const mean = verbatimPrimary.meanDifference ?? 0;
    const diffStr = `${mean >= 0 ? '+' : ''}${mean.toFixed(4)}`;
    const ci = verbatimPrimary.ci95 ?? [0, 0];
    const ciStr = `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`;
    const pVal = verbatimPrimary.signFlipPValue !== undefined ? verbatimPrimary.signFlipPValue.toExponential(4) : '—';
    lines.push(`| All-Verbatim Subset (internal negative control) | ${nVal} | ${diffStr} ${ciStr} | ${pVal} |`);
  }
  return lines.join('\n');
}

function formatFailuresByFactTable(failures: Record<string, Record<string, number>>): string {
  const lines = [
    '| Fact ID | Failures in A | Failures in B | Failures in C | Failures in C0 | Failures in D | Failures in E_B |',
    '|:---|---:|---:|---:|---:|---:|---:|',
  ];
  if (!failures || Object.keys(failures).length === 0) return lines.join('\n');

  const topKeys = Object.keys(failures);
  const isConditionKeyed = topKeys.every((k) => CONDITIONS.includes(k as Condition));

  if (isConditionKeyed) {
    const factIds = new Set<string>();
    for (const cond of CONDITIONS) {
      const map = failures[cond] ?? {};
      for (const fId of Object.keys(map)) factIds.add(fId);
    }
    const sortedFacts = [...factIds].sort();
    for (const fId of sortedFacts) {
      lines.push(
        `| ${fId} | ${failures.A?.[fId] ?? 0} | ${failures.B?.[fId] ?? 0} | ${failures.C?.[fId] ?? 0} | ${failures.C0?.[fId] ?? 0} | ${failures.D?.[fId] ?? 0} | ${failures.E_B?.[fId] ?? 0} |`
      );
    }
  } else {
    const sortedFacts = topKeys.sort();
    for (const fId of sortedFacts) {
      const f = failures[fId] ?? {};
      lines.push(
        `| ${fId} | ${f.A ?? 0} | ${f.B ?? 0} | ${f.C ?? 0} | ${f.C0 ?? 0} | ${f.D ?? 0} | ${f.E_B ?? 0} |`
      );
    }
  }
  return lines.join('\n');
}

function formatValidityGateSection(gate: ValidityGateResult | undefined): string {
  if (!gate) return '_Validity gate not computed._';
  const bvsA = gate.bVsA
    ? `${gate.bVsA.meanDifference >= 0 ? '+' : ''}${gate.bVsA.meanDifference.toFixed(4)} [${gate.bVsA.ci95[0].toFixed(4)}, ${gate.bVsA.ci95[1].toFixed(4)}] (n=${gate.bVsA.n}, p=${gate.bVsA.signFlipPValue.toExponential(4)})`
    : '—';
  const lines = [
    `> Classification: **${gate.label}** (post-hoc check: ${gate.passed ? 'PASS' : 'FAIL'})`,
    '',
    '| Criterion | Status | Detail |',
    '|:---|:---:|:---|',
    `| settingsConstant | ${gate.settingsConstant ? 'PASS' : 'FAIL'} | Request/reasoning/model/content settings constant across run |`,
    `| sanitizerVerified | ${gate.sanitizerVerified ? 'PASS' : 'FAIL'} | No unstripped reasoning tags or sanitizer failures in stored SQL |`,
    `| B_vs_A > 0 (95% CI > 0) | ${gate.bVsAPositiveWithCiExcludingZero ? 'PASS' : 'FAIL'} | ${bvsA} |`,
    `| Overall (${gate.label}) | **${gate.passed ? 'PASS' : 'FAIL'}** | ${gate.reasons.length ? gate.reasons.join('; ') : 'All post-hoc validity criteria satisfied'} |`,
  ];
  return lines.join('\n');
}

export function markdownReport(report: any): string {
  const lines = [
    '# Ablation v2 Offline Analysis',
    '',
    `Provenanced: **${report.provenanced}**`,
  ];
  if (report.warnings?.length) {
    lines.push('', '## Warnings', '');
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
  }
  if (report.validityGate) {
    lines.push(
      '',
      '## Validity gate (Post-Hoc)',
      '',
      formatValidityGateSection(report.validityGate)
    );
  }
  lines.push(
    '',
    '## Conditions',
    '',
    formatConditionsTable(report.analysis.conditions),
    '',
    `> Note: ${report.generationIndependenceNote}`,
    '',
    '## Clean Migration Per-Condition Table (migrationExitNonZero = false)',
    '',
    formatCleanMigrationTable(report.cleanMigrationAnalysis ?? report.analysis.cleanMigrationAnalysis),
    '',
    '## Paired comparisons',
    '',
    formatPairedComparisonsTable(report.analysis),
    '',
    '## Per-cell analysis (Exploratory — Outside Holm Family)',
    '',
    formatPerCellTables(report.perCellAnalysis ?? report.analysis.perCellAnalysis, report.analysis.holmCellPValues),
    '',
    '## Feature cell intraclass correlation (ICC) — Condition A Baseline',
    '',
    formatCellICCTable(report.cellICC ?? report.analysis.cellICC),
    '',
    '## Sensitivity analysis: excluding H-001 to H-008 (n = 112)',
    '',
    formatSensitivityExcludingEarlyTable(report.sensitivityExcludingEarlyTasks ?? report.analysis.sensitivityExcludingEarlyTasks),
    '',
    '## Sensitivity analysis (Exploratory — Outside Holm Family)',
    '',
    formatSensitivityTable(report.sensitivityAnalysis ?? report.analysis.sensitivityAnalysis),
    '',
    '## Retrieval overlap',
    '',
    formatRetrievalOverlapTable(report.retrievalOverlap),
    '',
    '## Lesson origin analysis (Exploratory — Outside Holm Family)',
    '',
    '> Exploratory analysis (kept outside the Holm-Bonferroni family). Note: the all-verbatim subset is a negative control because Conditions C and C0 inject identical text there.',
    ''
  );
  if (report.lessonOriginAnalysis) {
    lines.push(formatLessonOriginTable(report.lessonOriginAnalysis));
  } else {
    lines.push('_Lesson origin analysis was skipped._');
  }
  lines.push(
    '',
    '## Per-fact retrieval analysis (Exploratory — Negative Control on Non-Retrieved Pairs)',
    '',
    formatPerFactRetrievalTables(report.perFactRetrievalAnalysis),
    '',
    '## Failures by fact',
    '',
    formatFailuresByFactTable(report.failuresByFact)
  );
  return lines.join('\n') + '\n';
}

function collectDistinctFieldValues(
  trials: Trial[],
  provenance: Provenance,
  key: keyof Trial & keyof Provenance
): { distinct: string[]; missingCount: number } {
  const values: string[] = [];
  let missingCount = 0;
  if (trials.length === 0) {
    const topVal = provenance[key];
    if (typeof topVal === 'string' && topVal.trim().length > 0) {
      values.push(topVal.trim());
    } else if (typeof topVal === 'number' && Number.isFinite(topVal)) {
      values.push(String(topVal));
    } else {
      missingCount = 1;
    }
  } else {
    for (const trial of trials) {
      const rawVal = trial[key] ?? provenance[key];
      if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
        values.push(rawVal.trim());
      } else if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
        values.push(String(rawVal));
      } else {
        missingCount++;
      }
    }
  }
  return {
    distinct: Array.from(new Set(values)).sort(),
    missingCount,
  };
}

function loadLedgerEntry(runId?: string, ledgerPath?: string): any | undefined {
  if (!runId) return undefined;
  const targetPath = ledgerPath ? path.resolve(ledgerPath) : path.resolve('out/run-ledger.json');
  if (!fs.existsSync(targetPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as { runs?: Record<string, any> };
    return parsed?.runs?.[runId];
  } catch {
    return undefined;
  }
}

export function evaluateValidityGate(
  trials: Trial[],
  analysis: ReturnType<typeof analyzeTrials>,
  provenance: Provenance = {},
  options: BuildReportOptions = {},
  distinctProvenanceValues: Record<string, string[]> = {}
): ValidityGateResult {
  const reasons: string[] = [];
  const ledgerEntry = loadLedgerEntry(options.runId, options.ledgerPath);

  // 1. settingsConstant
  let settingsConstant = true;
  if (typeof options.settingsConstant === 'boolean' && !options.settingsConstant) {
    settingsConstant = false;
    reasons.push('options.settingsConstant=false');
  } else if (typeof provenance.settingsConstant === 'boolean' && !provenance.settingsConstant) {
    settingsConstant = false;
    reasons.push('provenance.settingsConstant=false');
  }
  if (ledgerEntry?.settings) {
    const rchg = ledgerEntry.settings.reasoningChangedDuringRun;
    if (typeof rchg === 'string' && rchg !== 'none') {
      settingsConstant = false;
      reasons.push(`reasoningChangedDuringRun=${rchg}`);
    }
    const maxTokStr = String(ledgerEntry.settings.maxTokens ?? '');
    if (/(->|changed|mixed|varied|multiple)/i.test(maxTokStr)) {
      settingsConstant = false;
      reasons.push(`maxTokens changed mid-run (${maxTokStr})`);
    }
  }
  const settingKeys = [
    'provider',
    'baseUrl',
    'requestedModel',
    'returnedModel',
    'oracleSha256',
    'tasksSha256',
    'factsSha256',
    'memorySha256',
    ...HINT_HASH_FIELDS,
  ] as const;
  for (const key of settingKeys) {
    const vals =
      distinctProvenanceValues[key] ??
      collectDistinctFieldValues(trials, provenance, key).distinct;
    if (vals.length > 1) {
      settingsConstant = false;
      reasons.push(`${key} had ${vals.length} distinct values`);
    }
  }
  for (const trial of trials) {
    const req = trial.requestedModel ?? provenance.requestedModel;
    const ret = trial.returnedModel ?? provenance.returnedModel;
    if (req && ret && req !== ret) {
      settingsConstant = false;
      reasons.push(`requestedModel !== returnedModel (${req} !== ${ret})`);
      break;
    }
  }
  const trialMaxTokens = new Set(
    trials.map((t) => t.maxTokens).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  );
  if (trialMaxTokens.size > 1) {
    settingsConstant = false;
    reasons.push(`trial maxTokens varied (${[...trialMaxTokens].sort().join(', ')})`);
  }
  const trialReasoningModes = new Set(
    trials.map((t) => t.reasoningMode).filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  );
  if (trialReasoningModes.size > 1) {
    settingsConstant = false;
    reasons.push(`trial reasoningMode varied (${[...trialReasoningModes].sort().join(', ')})`);
  }

  // 2. sanitizerVerified
  let sanitizerVerified = true;
  if (typeof options.sanitizerVerified === 'boolean' && !options.sanitizerVerified) {
    sanitizerVerified = false;
    reasons.push('options.sanitizerVerified=false');
  } else if (typeof provenance.sanitizerVerified === 'boolean' && !provenance.sanitizerVerified) {
    sanitizerVerified = false;
    reasons.push('provenance.sanitizerVerified=false');
  }
  if (
    typeof ledgerEntry?.status === 'string' &&
    /(invalid_sanitization|reasoning-tag|tag-leak)/i.test(ledgerEntry.status)
  ) {
    sanitizerVerified = false;
    reasons.push(`ledger status=${ledgerEntry.status}`);
  }
  let leakedTagTrials = 0;
  let tagErrorTrials = 0;
  for (const trial of trials) {
    if ((trial.generationStatus ?? 'ok') !== 'ok') continue;
    if (typeof trial.tagError === 'string' && trial.tagError.trim().length > 0) {
      tagErrorTrials++;
    }
    if (typeof trial.generatedSql === 'string' && trial.generatedSql.length > 0) {
      const check = sanitizeSqlOutput(trial.generatedSql);
      if (check.foundReasoningTags) {
        leakedTagTrials++;
      }
    }
  }
  if (leakedTagTrials > 0 || tagErrorTrials > 0) {
    sanitizerVerified = false;
    reasons.push(
      `sanitizer check failed (leakedTagTrials=${leakedTagTrials}, tagErrorTrials=${tagErrorTrials})`
    );
  }

  // 3. B_vs_A > 0 with 95% CI excluding zero
  const bVsAComp = analysis.comparisons?.B_vs_A?.primary ?? null;
  const bVsA = bVsAComp
    ? {
        n: analysis.comparisons.B_vs_A.n as number,
        meanDifference: bVsAComp.meanDifference as number,
        ci95: bVsAComp.ci95 as [number, number],
        signFlipPValue: bVsAComp.signFlipPValue as number,
      }
    : null;
  const bVsAPositiveWithCiExcludingZero = Boolean(
    bVsA &&
      bVsA.n > 0 &&
      bVsA.meanDifference > 0 &&
      bVsA.ci95[0] > 0 &&
      bVsA.ci95[1] > 0
  );
  if (!bVsAPositiveWithCiExcludingZero) {
    reasons.push(
      bVsA && bVsA.n > 0
        ? `B_vs_A=${bVsA.meanDifference.toFixed(4)} [${bVsA.ci95[0].toFixed(4)}, ${bVsA.ci95[1].toFixed(4)}] does not exclude 0 positively`
        : 'B_vs_A has n=0'
    );
  }

  return {
    postHoc: true,
    label: 'post-hoc validity gate',
    settingsConstant,
    sanitizerVerified,
    bVsAPositiveWithCiExcludingZero,
    bVsA,
    passed: settingsConstant && sanitizerVerified && bVsAPositiveWithCiExcludingZero,
    reasons,
  };
}

export function buildReport(
  trials: Trial[],
  provenance: Provenance = {},
  lessons?: { memory: unknown; facts: unknown },
  options: BuildReportOptions = {}
) {
  const warnings: string[] = [];
  const notes: string[] = [];
  let provenanced = true;
  const resolvedProvenance: Record<string, unknown> = { ...provenance };
  const distinctProvenanceValues: Record<string, string[]> = {};

  const hasContentHashFields =
    trials.some((t) => Boolean(t.oracleSha256 || t.tasksSha256 || t.memorySha256)) ||
    Boolean(provenance.oracleSha256 || provenance.tasksSha256 || provenance.memorySha256);

  const checkRequiredKey = (key: keyof Trial & keyof Provenance) => {
    const { distinct, missingCount } = collectDistinctFieldValues(trials, provenance, key);
    distinctProvenanceValues[key] = distinct;
    if (distinct.length === 0 || missingCount > 0) {
      provenanced = false;
      warnings.push(
        distinct.length === 0
          ? `Provenance field "${key}" is missing across all trials (distinct values: none).`
          : `Provenance field "${key}" is missing on ${missingCount}/${trials.length} trial(s) (distinct values: ${distinct.join(', ')}).`
      );
    } else if (distinct.length > 1) {
      provenanced = false;
      warnings.push(
        `Provenance field "${key}" has multiple distinct values (${distinct.length}): ${distinct.join(', ')}.`
      );
    } else {
      resolvedProvenance[key] = distinct[0];
    }
  };

  for (const key of EXECUTION_PROVENANCE_FIELDS) {
    checkRequiredKey(key);
  }

  // Record oracleCommit distinct values; ignore oracleCommit drift when all 4 content hashes match.
  const oracleCommitCheck = collectDistinctFieldValues(trials, provenance, 'oracleCommit');
  distinctProvenanceValues.oracleCommit = oracleCommitCheck.distinct;

  if (hasContentHashFields) {
    for (const key of FILE_HASH_FIELDS) {
      checkRequiredKey(key);
    }
    if (oracleCommitCheck.distinct.length === 1 && oracleCommitCheck.missingCount === 0) {
      resolvedProvenance.oracleCommit = oracleCommitCheck.distinct[0];
    } else if (oracleCommitCheck.distinct.length > 1) {
      resolvedProvenance.oracleCommitDriftIgnored = true;
      notes.push(
        `Ignored oracleCommit drift (${oracleCommitCheck.distinct.length} commits) because content hashes (oracleSha256, tasksSha256, factsSha256, memorySha256) are uniform.`
      );
    }
  } else {
    // Legacy synthetic inputs providing factsSha256 + oracleCommit without the 3 additional file hashes
    checkRequiredKey('factsSha256');
    checkRequiredKey('oracleCommit');
  }

  for (const hintKey of HINT_HASH_FIELDS) {
    const { distinct, missingCount } = collectDistinctFieldValues(trials, provenance, hintKey);
    if (distinct.length > 0) {
      distinctProvenanceValues[hintKey] = distinct;
      if (missingCount > 0) {
        provenanced = false;
        warnings.push(
          `Provenance field "${hintKey}" is missing on ${missingCount}/${trials.length} trial(s) (distinct values: ${distinct.join(', ')}).`
        );
      } else if (distinct.length > 1) {
        provenanced = false;
        warnings.push(
          `Provenance field "${hintKey}" has multiple distinct values (${distinct.length}): ${distinct.join(', ')}.`
        );
      } else {
        resolvedProvenance[hintKey] = distinct[0];
      }
    }
  }

  const execShaCheck = collectDistinctFieldValues(trials, provenance, 'executorSha256');
  if (execShaCheck.distinct.length > 0) {
    distinctProvenanceValues.executorSha256 = execShaCheck.distinct;
    if (execShaCheck.distinct.length === 1 && execShaCheck.missingCount === 0) {
      resolvedProvenance.executorSha256 = execShaCheck.distinct[0];
    }
  }

  const mismatchedTrials: string[] = [];
  for (const trial of trials) {
    const req = trial.requestedModel ?? provenance.requestedModel;
    const ret = trial.returnedModel ?? provenance.returnedModel;
    if (req && ret && req !== ret) {
      mismatchedTrials.push(`${trial.taskId}/${trial.condition} (${req} !== ${ret})`);
    }
  }
  if (
    trials.length === 0 &&
    provenance.requestedModel &&
    provenance.returnedModel &&
    provenance.requestedModel !== provenance.returnedModel
  ) {
    mismatchedTrials.push(`top-level (${provenance.requestedModel} !== ${provenance.returnedModel})`);
  }
  if (mismatchedTrials.length > 0) {
    provenanced = false;
    warnings.push(
      `returnedModel differs from requestedModel on ${mismatchedTrials.length} record(s): ${mismatchedTrials.join(', ')}.`
    );
  }

  const analysis = analyzeTrials(trials);
  const validityGate = evaluateValidityGate(
    trials,
    analysis,
    resolvedProvenance as Provenance,
    options,
    distinctProvenanceValues
  );

  const report: any = {
    provenanced,
    provenance: {
      ...resolvedProvenance,
      distinctValues: distinctProvenanceValues,
    },
    notes,
    warnings,
    validityGate,
    generationIndependenceNote: analysis.generationIndependenceNote,
    analysis,
    cellICC: analysis.cellICC,
    sensitivityExcludingEarlyTasks: analysis.sensitivityExcludingEarlyTasks,
    cleanMigrationAnalysis: analysis.cleanMigrationAnalysis,
    sensitivityAnalysis: analysis.sensitivityAnalysis,
    perCellAnalysis: analysis.perCellAnalysis,
    failuresByFact: failuresByFact(trials),
    retrievalOverlap: retrievalOverlap(trials),
    perFactRetrievalAnalysis: perFactRetrievalAnalysis(trials),
  };

  if (lessons !== undefined) {
    const normalizedMemory = normalizeMemoryInput(lessons.memory, warnings);
    const normalizedFacts = normalizeFactsInput(lessons.facts, warnings);
    if (normalizedMemory && normalizedFacts) {
      const origins = lessonOrigins(normalizedMemory, normalizedFacts, warnings);
      report.lessonOrigins = {
        exploratory: true,
        distilled: origins.distilled,
        verbatim: origins.verbatim,
      };
      report.lessonOriginAnalysis = lessonOriginAnalysis(trials, origins);
    }
  }

  return report;
}

function inferRunIdFromCheckpointPath(checkpointPath: string): string | undefined {
  const parts = path.resolve(checkpointPath).split(path.sep);
  const runsIdx = parts.lastIndexOf('runs');
  if (runsIdx >= 0 && runsIdx + 1 < parts.length - 1) {
    return parts[runsIdx + 1];
  }
  const base = path.basename(path.dirname(checkpointPath));
  if (base.startsWith('run-')) {
    return base.slice(4);
  }
  return undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('analyze-ablation-v2.ts')) {
  const args = parseArgs(process.argv.slice(2));
  const checkpointPayload = JSON.parse(fs.readFileSync(args.checkpoint, 'utf8')) as
    | Trial[]
    | { trials: Trial[]; provenance?: Provenance; metadata?: Provenance; runMetadata?: Provenance };
  const checkpoint = Array.isArray(checkpointPayload) ? checkpointPayload : checkpointPayload.trials;
  const provenance: Provenance = Array.isArray(checkpointPayload)
    ? {}
    : {
        ...(checkpointPayload.metadata ?? {}),
        ...(checkpointPayload.runMetadata ?? {}),
        ...(checkpointPayload.provenance ?? {}),
      };
  const memoryPath = path.resolve('.axiom-state/memory.json');
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  const lessons =
    fs.existsSync(memoryPath) && fs.existsSync(factsPath)
      ? {
          memory: JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as unknown,
          facts: JSON.parse(fs.readFileSync(factsPath, 'utf8')) as unknown,
        }
      : undefined;
  const runId = args.runId ?? inferRunIdFromCheckpointPath(args.checkpoint);
  const report = buildReport(checkpoint, provenance, lessons, { runId });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(args.out.replace(/\.json$/i, '.md'), markdownReport(report), 'utf8');
  console.log(`Wrote ${args.out}`);
}
