import fs from 'node:fs';
import path from 'node:path';

export type Condition = 'A' | 'B' | 'C' | 'C0' | 'D' | 'E_B';
export type GenerationStatus = 'ok' | 'empty' | 'length' | 'other';

export interface Trial {
  condition: Condition;
  taskId: string;
  generationStatus?: GenerationStatus;
  generatedSql?: string;
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
  factsSha256?: string;
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
  factsSha256?: string;
  finishReason?: string;
}

const CONDITIONS: Condition[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
const BOOTSTRAP_RESAMPLES = 10_000;
const SIGN_FLIP_ITERATIONS = 100_000;
const BOOTSTRAP_SEED = 20260101;
const PROVENANCE_FIELDS = [
  'provider',
  'baseUrl',
  'requestedModel',
  'returnedModel',
  'oracleCommit',
  'factsSha256',
  'finishReason',
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

  for (const baseline of ['A', 'B', 'C0', 'D'] as Condition[]) {
    const base = new Map((byCondition.get(baseline) ?? []).map((row) => [row.taskId, row]));
    const target = new Map((byCondition.get('C') ?? []).map((row) => [row.taskId, row]));
    const allPairedIds = [...base.keys()].filter((id) => target.has(id)).sort();
    const includedIds: string[] = [];
    const excludedTaskIds: string[] = [];
    for (const id of allPairedIds) {
      const baseTrial = base.get(id) as Trial;
      const targetTrial = target.get(id) as Trial;
      if (isCleanTrial(baseTrial) && isCleanTrial(targetTrial)) {
        includedIds.push(id);
      } else {
        excludedTaskIds.push(id);
      }
    }
    const differences = includedIds.map(
      (id) => (target.get(id) as Trial).boundFactFraction - (base.get(id) as Trial).boundFactFraction
    );
    const bootstrap = pairedBootstrap(differences);
    const secondary = mcnemar(
      includedIds.map((id) => (base.get(id) as Trial).boundPassed),
      includedIds.map((id) => (target.get(id) as Trial).boundPassed)
    );
    const key = `C_vs_${baseline}`;
    comparisons[key] = {
      n: includedIds.length,
      excludedCount: excludedTaskIds.length,
      excludedTaskIds,
      primary: bootstrap,
      secondary,
    };
  }

  return {
    exploratory: true as const,
    note: "Exploratory sensitivity analysis outside the Holm-Bonferroni family: repeats C vs A, B, C0, D excluding any task where either compared condition has generationStatus !== 'ok' or migrationExitNonZero === true.",
    comparisons,
  };
}

export function analyzeTrials(trials: Trial[]) {
  const byCondition = new Map<Condition, Trial[]>();
  for (const condition of CONDITIONS) {
    byCondition.set(condition, trials.filter((trial) => trial.condition === condition));
  }
  const conditions = Object.fromEntries(
    CONDITIONS.map((condition) => {
      const rows = byCondition.get(condition) ?? [];
      const [low, high] = wilson(rows.filter((row) => row.boundPassed).length, rows.length);
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
      return [
        condition,
        {
          n: rows.length,
          meanBoundFactFraction: rows.length
            ? rows.reduce((sum, row) => sum + row.boundFactFraction, 0) / rows.length
            : 0,
          strictBoundPassAt1: rows.length
            ? rows.filter((row) => row.boundPassed).length / rows.length
            : 0,
          strictBoundPassAt1Wilson95: [low, high],
          meanPromptTokens: rows.length
            ? rows.reduce((sum, row) => sum + row.promptTokens, 0) / rows.length
            : 0,
          meanTotalTokens: rows.length
            ? rows.reduce((sum, row) => sum + row.totalTokens, 0) / rows.length
            : 0,
          generationStatus: generationStatusCounts,
          generationStatusCounts,
          tableMissing,
          migrationExitNonZero,
          reusedFromCondition,
          reusedFromConditionB,
        },
      ];
    })
  );

  const comparisons: Record<string, any> = {};
  const primaryP: Record<string, number> = {};
  const secondaryP: Record<string, number> = {};
  for (const baseline of ['A', 'B', 'C0', 'D'] as Condition[]) {
    const base = new Map((byCondition.get(baseline) ?? []).map((row) => [row.taskId, row]));
    const target = new Map((byCondition.get('C') ?? []).map((row) => [row.taskId, row]));
    const ids = [...base.keys()].filter((id) => target.has(id)).sort();
    const differences = ids.map(
      (id) => (target.get(id) as Trial).boundFactFraction - (base.get(id) as Trial).boundFactFraction
    );
    const bootstrap = pairedBootstrap(differences);
    const secondary = mcnemar(
      ids.map((id) => (base.get(id) as Trial).boundPassed),
      ids.map((id) => (target.get(id) as Trial).boundPassed)
    );
    const key = `C_vs_${baseline}`;
    comparisons[key] = { n: ids.length, primary: bootstrap, secondary };
    primaryP[key] = bootstrap.signFlipPValue;
    secondaryP[key] = secondary.pValue;
  }
  const sensitivity = sensitivityAnalysis(trials);
  return {
    conditions,
    comparisons,
    holmPrimaryPValues: holmAdjust(primaryP),
    holmSecondaryPValues: holmAdjust(secondaryP),
    sensitivityAnalysis: sensitivity,
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

function parseArgs(argv: string[]) {
  const value = (flag: string, fallback: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    checkpoint: path.resolve(value('--checkpoint', '.axiom-state/ablation-v2-checkpoint.json')),
    out: path.resolve(value('--out', 'out/ablation-v2-analysis.json')),
  };
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
  lines.push(
    '',
    '## Conditions',
    '',
    '| Condition | n | Mean bound fraction | Strict Pass@1 | Mean prompt tokens | Mean total tokens | gen(ok/empty/length/other) | tableMissing | migrationExitNonZero | reusedFromCondition |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  );
  for (const condition of CONDITIONS) {
    const row = report.analysis.conditions[condition];
    const gs = row.generationStatus ?? { ok: row.n, empty: 0, length: 0, other: 0 };
    lines.push(
      `| ${condition} | ${row.n} | ${row.meanBoundFactFraction.toFixed(4)} | ${row.strictBoundPassAt1.toFixed(4)} | ${row.meanPromptTokens.toFixed(1)} | ${row.meanTotalTokens.toFixed(1)} | ${gs.ok}/${gs.empty}/${gs.length}/${gs.other} | ${row.tableMissing} | ${row.migrationExitNonZero} | ${row.reusedFromCondition} |`
    );
  }
  lines.push(
    '',
    `> Note: ${report.generationIndependenceNote}`,
    '',
    '## Paired comparisons',
    '',
    '```json',
    JSON.stringify(
      {
        comparisons: report.analysis.comparisons,
        holmPrimaryPValues: report.analysis.holmPrimaryPValues,
        holmSecondaryPValues: report.analysis.holmSecondaryPValues,
      },
      null,
      2
    ),
    '```',
    '',
    '## Sensitivity analysis (Exploratory — Outside Holm Family)',
    '',
    '```json',
    JSON.stringify(report.sensitivityAnalysis, null, 2),
    '```',
    '',
    '## Retrieval overlap',
    '',
    '```json',
    JSON.stringify(report.retrievalOverlap, null, 2),
    '```',
    '',
    '## Lesson origin analysis (Exploratory — Outside Holm Family)',
    '',
    '> Exploratory analysis (kept outside the Holm-Bonferroni family). Note: the all-verbatim subset is a negative control because Conditions C and C0 inject identical text there.',
    ''
  );
  if (report.lessonOriginAnalysis) {
    lines.push('```json', JSON.stringify(report.lessonOriginAnalysis, null, 2), '```');
  } else {
    lines.push('_Lesson origin analysis was skipped._');
  }
  lines.push(
    '',
    '## Per-fact retrieval analysis (Exploratory — Negative Control on Non-Retrieved Pairs)',
    '',
    '```json',
    JSON.stringify(report.perFactRetrievalAnalysis, null, 2),
    '```',
    '',
    '## Failures by fact',
    '',
    '```json',
    JSON.stringify(report.failuresByFact, null, 2),
    '```'
  );
  return lines.join('\n') + '\n';
}

export function buildReport(
  trials: Trial[],
  provenance: Provenance = {},
  lessons?: { memory: unknown; facts: unknown }
) {
  const warnings: string[] = [];
  let provenanced = true;
  const resolvedProvenance: Record<string, unknown> = { ...provenance };
  const distinctProvenanceValues: Record<string, string[]> = {};

  for (const key of PROVENANCE_FIELDS) {
    const values: string[] = [];
    let missingCount = 0;
    if (trials.length === 0) {
      const topVal = provenance[key];
      if (typeof topVal === 'string' && topVal.trim().length > 0) {
        values.push(topVal.trim());
      } else {
        missingCount = 1;
      }
    } else {
      for (const trial of trials) {
        const rawVal = trial[key] ?? provenance[key];
        if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
          values.push(rawVal.trim());
        } else {
          missingCount++;
        }
      }
    }
    const distinct = Array.from(new Set(values)).sort();
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
  const report: any = {
    provenanced,
    provenance: {
      ...resolvedProvenance,
      distinctValues: distinctProvenanceValues,
    },
    warnings,
    generationIndependenceNote: analysis.generationIndependenceNote,
    analysis,
    sensitivityAnalysis: analysis.sensitivityAnalysis,
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

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('analyze-ablation-v2.ts')) {
  const args = parseArgs(process.argv.slice(2));
  const checkpointPayload = JSON.parse(fs.readFileSync(args.checkpoint, 'utf8')) as
    | Trial[]
    | { trials: Trial[]; provenance?: Provenance };
  const checkpoint = Array.isArray(checkpointPayload) ? checkpointPayload : checkpointPayload.trials;
  const provenance = Array.isArray(checkpointPayload) ? {} : checkpointPayload.provenance ?? {};
  const memoryPath = path.resolve('.axiom-state/memory.json');
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  const lessons =
    fs.existsSync(memoryPath) && fs.existsSync(factsPath)
      ? {
          memory: JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as unknown,
          facts: JSON.parse(fs.readFileSync(factsPath, 'utf8')) as unknown,
        }
      : undefined;
  const report = buildReport(checkpoint, provenance, lessons);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(args.out.replace(/\.json$/i, '.md'), markdownReport(report), 'utf8');
  console.log(`Wrote ${args.out}`);
}
