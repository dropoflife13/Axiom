import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  FeatureFlags,
  Lesson,
  LESSON_TOP_K,
  computeMemoryFileSha256,
  formatRetrievedLessons,
  loadMemory,
  loadReadOnlyMemorySnapshot,
  retrieveLessonsByFeatures,
  saveLesson,
} from '../memory.js';
import { FACTS, FACT_STATEMENTS, getApplicableFacts } from '../../scripts/facts.js';
import {
  evaluateMigrationSqlInContainer,
  startPostgresContainer,
  stopPostgresContainer,
} from '../../scripts/oracle.js';
import { BUDGET_GUARD, getDailyCap, readDailyBudget } from '../guardrails.js';
import {
  REQUIRED_EXECUTOR_MODEL,
  assertModelMatch,
  classifyGenerationStatus,
  executeSqlWithPolicy,
  generateSqlMigration,
  getProviderProvenance,
  resolveExecutorModel,
  type GenerationStatus,
} from '../executor.js';
import { generateLesson } from '../advisor.js';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { deriveTaskFlags, type TaskFeaturesInput } from '../../scripts/propose-task-repair.js';
import {
  assertScopedCleanGitTree,
  assertTaskContentSha256Matches,
  computeTaskContentSha256,
} from '../../scripts/calibration-common.js';

dotenv.config();

export { LESSON_TOP_K, formatRetrievedLessons, loadMemory, retrieveLessonsByFeatures };
export type { FeatureFlags, GenerationStatus };

export interface TaskV2Item {
  id: string;
  split: 'train' | 'dev' | 'test';
  cohortId: string;
  table: string;
  prompt: string;
  features: FeatureFlags;
  boundFacts: string[];
  applicableFacts?: string[];
  goldenSql: string;
  devBaselineSql?: string;
}

export interface SplitPrompt {
  id: string;
  split: 'train' | 'held_out';
  domain: string;
  prompt: string;
}

export interface SplitFile {
  train: SplitPrompt[];
  heldOut: SplitPrompt[];
}

export interface TaskRecallResult {
  taskId: string;
  table: string;
  features: FeatureFlags;
  violatedFacts: string[];
  retrievedFactIds: string[];
  recalledFacts: string[];
  recall: number;
}

export type ConditionId = 'A' | 'B' | 'C' | 'C0' | 'D' | 'E_B';

export interface McNemarResult {
  n11: number;
  b: number;
  c: number;
  n00: number;
  chi2Corrected: number;
  pValueExact: number;
}

export function wilson95Interval(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) /
    denominator;
  return [Math.max(0, (center - half) * 100), Math.min(100, (center + half) * 100)];
}

function binomialCdf(k: number, n: number): number {
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

export function pairedMcNemar(
  reference: boolean[],
  target: boolean[]
): McNemarResult {
  let n11 = 0;
  let b = 0;
  let c = 0;
  let n00 = 0;
  for (let i = 0; i < Math.min(reference.length, target.length); i++) {
    if (reference[i] && target[i]) n11++;
    else if (reference[i] && !target[i]) b++;
    else if (!reference[i] && target[i]) c++;
    else n00++;
  }
  const discordant = b + c;
  return {
    n11,
    b,
    c,
    n00,
    chi2Corrected:
      discordant > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / discordant : 0,
    pValueExact:
      discordant > 0
        ? Math.min(1, 2 * binomialCdf(Math.min(b, c), discordant))
        : 1,
  };
}

export function evaluateFeatureRetrievalForTask(
  taskFeatures: FeatureFlags,
  violatedFacts: string[],
  memory: readonly Lesson[] | Lesson[],
  topK: number = LESSON_TOP_K,
  applicableFactIds?: Iterable<string>
): { retrievedFactIds: string[]; recalledFacts: string[]; recall: number } {
  const effectiveApplicable = applicableFactIds ?? getApplicableFacts({ ...taskFeatures });
  const retrievedFactIds = retrieveLessonsByFeatures(
    taskFeatures,
    memory,
    topK,
    effectiveApplicable,
    true
  ).map((lesson) => lesson.factId ?? lesson.errorCode);
  const retrieved = new Set(retrievedFactIds);
  const recalledFacts = violatedFacts.filter((fact) => retrieved.has(fact));
  return {
    retrievedFactIds,
    recalledFacts,
    recall: violatedFacts.length === 0 ? 1 : recalledFacts.length / violatedFacts.length,
  };
}

interface TaskFile {
  train: TaskV2Item[];
  dev: TaskV2Item[];
  test: TaskV2Item[];
}

export interface Trial {
  condition: ConditionId;
  taskId: string;
  generationStatus: GenerationStatus;
  generatedSql: string;
  passRaw: boolean;
  passWithTier0: boolean;
  boundFacts: string[];
  boundPassed: boolean;
  boundFactFraction: number;
  tableMissing: boolean;
  migrationExitNonZero: boolean;
  failedFacts: string[];
  oracleFailedFacts: string[];
  postTier0FailedFacts: string[];
  retrievedFactIds: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
  provider: string;
  baseUrl: string;
  requestedModel: string;
  returnedModel: string;
  finishReason: string;
  oracleCommit: string;
  factsSha256: string;
  oracleSha256: string;
  tasksSha256: string;
  memorySha256: string;
  gitCommit: string;
  reusedFromCondition?: 'B';
}

export interface TrialGenerationMeta {
  requestedModel: string;
  returnedModel: string;
  finishReason: string;
  generationStatus?: GenerationStatus;
  fromCache?: boolean;
  reusedFromCondition?: 'B';
}

export interface RunMetadata {
  oracleSha256: string;
  tasksSha256: string;
  factsSha256: string;
  memorySha256: string;
  gitCommit: string;
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function getRunMetadata(root = path.resolve('.')): RunMetadata {
  return {
    oracleSha256: sha256File(path.join(root, 'scripts', 'oracle.ts')),
    tasksSha256: sha256File(path.join(root, 'fixtures', 'task-v2', 'tasks.json')),
    factsSha256: sha256File(path.join(root, 'fixtures', 'task-v2', 'facts.json')),
    memorySha256: sha256File(path.join(root, '.axiom-state', 'memory.json')),
    gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  };
}

export function assertRunMetadataMatches(expected: RunMetadata, actual: RunMetadata): void {
  for (const key of Object.keys(expected) as Array<keyof RunMetadata>) {
    if (expected[key] !== actual[key]) {
      throw new Error(`Ablation provenance mismatch for ${key}: checkpoint=${expected[key]} current=${actual[key]}`);
    }
  }
}

export function verifyCalibrationContentHashes(
  tasksOrPath: string | Record<string, unknown>,
  calibrationFiles: Array<string | { taskContentSha256?: string; label?: string }>
): string {
  const contentSha = computeTaskContentSha256(tasksOrPath);
  for (const item of calibrationFiles) {
    if (typeof item === 'string') {
      if (!fs.existsSync(item)) continue;
      const parsed = JSON.parse(fs.readFileSync(item, 'utf8')) as { taskContentSha256?: string };
      assertTaskContentSha256Matches(parsed, tasksOrPath, item);
    } else {
      assertTaskContentSha256Matches(item, tasksOrPath, item.label ?? 'calibration');
    }
  }
  return contentSha;
}

const PLACEBO_TIPS = [
  'Use explicit schema qualification for every table and function reference.',
  'Prefer stable, descriptive names for indexes, constraints, and trigger functions.',
  'Use immutable expressions for index predicates and avoid volatile functions.',
  'Keep migration statements ordered from base tables to dependent objects.',
  'Use explicit column lists in INSERT statements rather than SELECT star.',
  'Use transaction-safe DDL ordering so dependent objects are created last.',
  'Prefer timestamptz for event times and document the chosen precision.',
  'Use lowercase snake_case identifiers for PostgreSQL objects.',
];

export const ELIGIBLE_FACTS = FACTS.filter(
  (fact) => fact.status === 'CONFIRMED' || fact.status === 'OWNER-ADOPTED'
);
export const ELIGIBLE_FACT_IDS = new Set(ELIGIBLE_FACTS.map((fact) => fact.id));
const STATIC_FACTS = ELIGIBLE_FACTS.map(
  (fact) => `[${fact.id}] ${fact.statement}`
).join('\n');

export function getTaskRealFlags(task: Pick<TaskV2Item, 'features'> & Partial<Pick<TaskV2Item, 'prompt' | 'goldenSql'>>): {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
  status: boolean;
  sec_definer: boolean;
  latest_per_key: boolean;
  view: boolean;
} {
  const features: TaskFeaturesInput = {
    tenant: Boolean(task.features.tenant),
    append_only: Boolean(task.features.append_only),
    ingestion: Boolean(task.features.ingestion),
    status: task.features.status,
    view: task.features.view,
    sec_definer: task.features.sec_definer,
    latest_per_key: task.features.latest_per_key,
  };
  const derived = deriveTaskFlags({
    features,
    prompt: task.prompt ?? '',
    goldenSql: task.goldenSql ?? '',
  });
  return {
    ...derived,
    status: task.features.status === undefined ? derived.status : Boolean(task.features.status),
    view: task.features.view === undefined ? derived.view : Boolean(task.features.view),
    sec_definer:
      task.features.sec_definer === undefined
        ? derived.sec_definer
        : Boolean(task.features.sec_definer),
    latest_per_key:
      task.features.latest_per_key === undefined
        ? derived.latest_per_key
        : Boolean(task.features.latest_per_key),
  };
}

export function getTaskApplicableFacts(
  task: Pick<TaskV2Item, 'features'> & Partial<Pick<TaskV2Item, 'applicableFacts' | 'prompt' | 'goldenSql'>>
): string[] {
  const rawApplicable =
    task.applicableFacts && task.applicableFacts.length > 0
      ? task.applicableFacts
      : getApplicableFacts({ ...getTaskRealFlags(task) });
  return rawApplicable.filter((id) => ELIGIBLE_FACT_IDS.has(id));
}

export function retrieveApplicableLessonsForTask(
  task: Pick<TaskV2Item, 'features'> & Partial<Pick<TaskV2Item, 'applicableFacts' | 'prompt' | 'goldenSql'>>,
  memory: readonly Lesson[] | Lesson[],
  topK: number = LESSON_TOP_K
): Lesson[] {
  const applicableFactIds = getTaskApplicableFacts(task);
  return retrieveLessonsByFeatures(task.features, memory, topK, applicableFactIds, true);
}

function buildPlaceboHint(): string {
  const prefix = 'UNRELATED POSTGRES TIPS:\n';
  let hint = prefix;
  let index = 0;
  while (hint.length < STATIC_FACTS.length) {
    hint += `- ${PLACEBO_TIPS[index % PLACEBO_TIPS.length]}\n`;
    index++;
  }
  return hint;
}

export function buildConditionHint(
  condition: ConditionId,
  task: TaskV2Item,
  memory: readonly Lesson[] | Lesson[]
): string | undefined {
  if (condition === 'B' || condition === 'E_B') {
    return `ORACLE STATIC FACTS. Satisfy every applicable fact below:\n${STATIC_FACTS}`;
  }
  if (condition === 'C') {
    const lessons = retrieveApplicableLessonsForTask(task, memory, LESSON_TOP_K);
    return lessons.length > 0
      ? `DYNAMIC MEMORY LESSONS:\n${formatRetrievedLessons(lessons)}`
      : undefined;
  }
  if (condition === 'C0') {
    const lessons = retrieveApplicableLessonsForTask(task, memory, LESSON_TOP_K);
    if (lessons.length === 0) return undefined;
    const verbatimLines = lessons.map((l) => {
      const code = l.factId ?? l.errorCode;
      const verbatim = FACT_STATEMENTS[code] ?? l.lesson;
      return `- [${code}] ${verbatim}`;
    });
    return `DYNAMIC MEMORY LESSONS (VERBATIM ORACLE):\n${verbatimLines.join('\n')}`;
  }
  if (condition === 'D') return buildPlaceboHint();
  return undefined;
}

export function buildTrial(
  containerName: string,
  task: TaskV2Item,
  condition: ConditionId,
  sql: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  retrievedFactIds: string[],
  genMeta: TrialGenerationMeta = {
    requestedModel: REQUIRED_EXECUTOR_MODEL,
    returnedModel: REQUIRED_EXECUTOR_MODEL,
    finishReason: 'stop',
  },
  oracleEvalFn: typeof evaluateMigrationSqlInContainer = evaluateMigrationSqlInContainer,
  runMetadata: RunMetadata = getRunMetadata()
): Trial {
  assertModelMatch(genMeta.requestedModel, genMeta.returnedModel);
  const provenance = getProviderProvenance(genMeta.requestedModel, genMeta.returnedModel);
  const generationStatus = classifyGenerationStatus(
    genMeta.finishReason,
    sql,
    genMeta.generationStatus
  );
  const boundFacts = task.boundFacts ?? [];
  const reusedFromCondition =
    genMeta.reusedFromCondition ??
    (condition === 'E_B' && genMeta.fromCache ? 'B' : undefined);

  if (generationStatus !== 'ok') {
    return {
      condition,
      taskId: task.id,
      generationStatus,
      generatedSql: '',
      passRaw: false,
      passWithTier0: false,
      boundFacts,
      boundPassed: false,
      boundFactFraction: 0,
      tableMissing: false,
      migrationExitNonZero: false,
      failedFacts: [],
      oracleFailedFacts: [],
      postTier0FailedFacts: [],
      retrievedFactIds,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      llmCalls: 1,
      provider: provenance.provider,
      baseUrl: provenance.baseUrl,
      requestedModel: provenance.requestedModel,
      returnedModel: provenance.returnedModel,
      finishReason: genMeta.finishReason,
      oracleCommit: provenance.oracleCommit,
      ...runMetadata,
      ...(reusedFromCondition ? { reusedFromCondition } : {}),
    };
  }

  const oracle = oracleEvalFn(
    containerName,
    sql,
    {
      table: task.table,
      ...deriveTaskFlags({
        features: {
          tenant: Boolean(task.features.tenant),
          append_only: Boolean(task.features.append_only),
          ingestion: Boolean(task.features.ingestion),
          status: task.features.status,
          view: task.features.view,
          sec_definer: task.features.sec_definer,
          latest_per_key: task.features.latest_per_key,
        },
        prompt: task.prompt,
        goldenSql: task.goldenSql,
      }),
    },
    `${task.id}_${condition}`
  );
  const failedFacts = oracle.failedFacts;
  const passRaw = failedFacts.length === 0;
  const failedSet = new Set(failedFacts);
  const tableMissing = failedSet.has('F-13');
  const migrationExitNonZero = Boolean(oracle.migrationExitNonZero);
  const boundPassedCount = tableMissing
    ? 0
    : boundFacts.filter((f) => !failedSet.has(f)).length;
  const boundPassed = tableMissing ? false : boundFacts.every((f) => !failedSet.has(f));
  const boundFactFraction = tableMissing
    ? 0
    : boundFacts.length > 0
      ? Number((boundPassedCount / boundFacts.length).toFixed(4))
      : 1;

  // The SQL evaluation surface has no safe generic Tier 0 rewrite. E_B therefore
  // records the deterministic post-check explicitly without fabricating a fix.
  return {
    condition,
    taskId: task.id,
    generationStatus: 'ok',
    generatedSql: sql,
    passRaw,
    passWithTier0: passRaw,
    boundFacts,
    boundPassed,
    boundFactFraction,
    tableMissing,
    migrationExitNonZero,
    failedFacts,
    oracleFailedFacts: oracle.failedFacts,
    postTier0FailedFacts: failedFacts,
    retrievedFactIds,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    llmCalls: 1,
    provider: provenance.provider,
    baseUrl: provenance.baseUrl,
    requestedModel: provenance.requestedModel,
    returnedModel: provenance.returnedModel,
    finishReason: genMeta.finishReason,
    oracleCommit: provenance.oracleCommit,
    ...runMetadata,
    ...(reusedFromCondition ? { reusedFromCondition } : {}),
  };
}

export async function runAblationTaskCondition(options: {
  containerName: string;
  task: TaskV2Item;
  condition: ConditionId;
  memory: readonly Lesson[];
  configuredModel?: string;
  executorFn?: typeof generateSqlMigration;
  oracleEvalFn?: typeof evaluateMigrationSqlInContainer;
  runMetadata?: RunMetadata;
}): Promise<{ trial: Trial; fromCache: boolean }> {
  const configuredModel = options.configuredModel ?? resolveExecutorModel();
  const executorFn = options.executorFn ?? generateSqlMigration;
  const oracleEvalFn = options.oracleEvalFn ?? evaluateMigrationSqlInContainer;
  const retrievedFactIds =
    options.condition === 'C' || options.condition === 'C0'
      ? retrieveApplicableLessonsForTask(options.task, options.memory, LESSON_TOP_K).map(
          (lesson) => lesson.factId ?? lesson.errorCode
        )
      : [];
  const generated = await executeSqlWithPolicy(
    executorFn,
    options.task.prompt,
    options.task.table,
    options.task.features,
    buildConditionHint(options.condition, options.task, options.memory),
    { temperature: 0, model: configuredModel }
  );
  const trial = buildTrial(
    options.containerName,
    options.task,
    options.condition,
    generated.sql,
    generated.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    retrievedFactIds,
    {
      requestedModel: generated.requestedModel,
      returnedModel: generated.returnedModel,
      finishReason: generated.finishReason,
      generationStatus: generated.generationStatus,
      fromCache: generated.fromCache,
      ...(options.condition === 'E_B' ? { reusedFromCondition: 'B' as const } : {}),
    },
    oracleEvalFn,
    options.runMetadata
  );
  return { trial, fromCache: Boolean(generated.fromCache) };
}

function summarize(condition: ConditionId, trials: Trial[], all: Trial[]) {
  const rawPasses = trials.filter((trial) => trial.passRaw).length;
  const tier0Passes = trials.filter((trial) => trial.passWithTier0).length;
  const boundPasses = trials.filter((trial) => trial.boundPassed).length;
  const meanBoundFactFraction = trials.length
    ? Number((trials.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0) / trials.length).toFixed(4))
    : 0;
  const [rawLow, rawHigh] = wilson95Interval(rawPasses, trials.length);
  const [tierLow, tierHigh] = wilson95Interval(tier0Passes, trials.length);
  const [boundLow, boundHigh] = wilson95Interval(boundPasses, trials.length);
  const failures: Record<string, number> = {};
  for (const trial of trials) {
    for (const fact of trial.failedFacts) failures[fact] = (failures[fact] ?? 0) + 1;
  }
  const byCondition = (id: ConditionId) =>
    all
      .filter((trial) => trial.condition === id)
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const c = byCondition('C');
  return {
    condition,
    trials: trials.length,
    primaryMeanBoundFactFraction: meanBoundFactFraction,
    primaryMeanBoundFactFractionPct: `${(meanBoundFactFraction * 100).toFixed(1)}%`,
    secondaryPassAt1OverBoundFacts: `${boundPasses}/${trials.length} (${trials.length ? ((boundPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Bound: `[${boundLow.toFixed(1)}%, ${boundHigh.toFixed(1)}%]`,
    passAt1Raw: `${rawPasses}/${trials.length} (${trials.length ? ((rawPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Raw: `[${rawLow.toFixed(1)}%, ${rawHigh.toFixed(1)}%]`,
    passAt1WithTier0: `${tier0Passes}/${trials.length} (${trials.length ? ((tier0Passes / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95WithTier0: `[${tierLow.toFixed(1)}%, ${tierHigh.toFixed(1)}%]`,
    mcnemarCvsA:
      condition === 'C'
        ? pairedMcNemar(byCondition('A').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsB:
      condition === 'C'
        ? pairedMcNemar(byCondition('B').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsC0:
      condition === 'C'
        ? pairedMcNemar(byCondition('C0').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarCvsD:
      condition === 'C'
        ? pairedMcNemar(byCondition('D').map((t) => t.passRaw), c.map((t) => t.passRaw))
        : null,
    mcnemarBoundCvsA:
      condition === 'C'
        ? pairedMcNemar(byCondition('A').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsB:
      condition === 'C'
        ? pairedMcNemar(byCondition('B').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsC0:
      condition === 'C'
        ? pairedMcNemar(byCondition('C0').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    mcnemarBoundCvsD:
      condition === 'C'
        ? pairedMcNemar(byCondition('D').map((t) => t.boundPassed), c.map((t) => t.boundPassed))
        : null,
    failuresByFact: failures,
    averageLlmCallsPerTask: trials.length
      ? Number((trials.reduce((sum, trial) => sum + trial.llmCalls, 0) / trials.length).toFixed(2))
      : 0,
    averageTokensPerTask: trials.length
      ? Math.round(trials.reduce((sum, trial) => sum + trial.totalTokens, 0) / trials.length)
      : 0,
  };
}

export interface TrainCalibrationFile {
  model: string;
  oracleHash: string;
  factsSha256: string;
  date: string;
  failureCountsByFact?: Record<string, number>;
  factStats?: Array<{ factId: string; failedCount: number }>;
}

export function loadTrainFailureFrequency(
  calibrationPath: string = path.resolve('out', 'train-calibration.json')
): Record<string, number> {
  if (!fs.existsSync(calibrationPath)) {
    throw new Error(
      `Missing train calibration file at ${calibrationPath}. Run scripts/calibrate-train-failure-frequency.ts to generate out/train-calibration.json before building train memory.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(calibrationPath, 'utf8')) as Record<string, any>;
  const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : '';
  const oracleHash =
    typeof raw.oracleHash === 'string' && raw.oracleHash.trim()
      ? raw.oracleHash.trim()
      : typeof raw.oracleCommit === 'string' && raw.oracleCommit.trim()
        ? raw.oracleCommit.trim()
        : '';
  const factsSha256 =
    typeof raw.factsSha256 === 'string' && raw.factsSha256.trim()
      ? raw.factsSha256.trim()
      : typeof raw.factsHash === 'string' && raw.factsHash.trim()
        ? raw.factsHash.trim()
        : '';
  const date =
    typeof raw.date === 'string' && raw.date.trim()
      ? raw.date.trim()
      : typeof raw.timestamp === 'string' && raw.timestamp.trim()
        ? raw.timestamp.trim()
        : '';

  if (!model || !oracleHash || !factsSha256 || !date) {
    throw new Error(
      `Invalid train calibration provenance in ${calibrationPath}: required non-empty fields model, oracleHash, factsSha256, and date.`
    );
  }
  if (typeof raw.taskContentSha256 === 'string' && raw.taskContentSha256.trim()) {
    const defaultTasksPath = path.resolve('fixtures/task-v2/tasks.json');
    if (fs.existsSync(defaultTasksPath)) {
      assertTaskContentSha256Matches(raw, defaultTasksPath, calibrationPath);
    }
  }

  const counts: Record<string, number> = {};
  if (raw.failureCountsByFact && typeof raw.failureCountsByFact === 'object') {
    for (const [factId, count] of Object.entries(raw.failureCountsByFact)) {
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        counts[factId] = count;
      }
    }
    return counts;
  }
  if (Array.isArray(raw.factStats)) {
    for (const stat of raw.factStats) {
      if (
        stat &&
        typeof stat.factId === 'string' &&
        typeof stat.failedCount === 'number' &&
        Number.isFinite(stat.failedCount) &&
        stat.failedCount >= 0
      ) {
        counts[stat.factId] = stat.failedCount;
      }
    }
    return counts;
  }

  throw new Error(
    `Invalid train calibration file ${calibrationPath}: missing failureCountsByFact or factStats.`
  );
}

export interface EnsureSqlTrainMemoryOptions {
  memoryPath?: string;
  calibrationPath?: string;
  failureFrequency?: Record<string, number>;
  distillFn?: (factId: string, statement: string) => Promise<string>;
  forceRegenerate?: boolean;
}

export async function ensureSqlTrainMemory(
  trainTasks: TaskV2Item[],
  options: EnsureSqlTrainMemoryOptions = {}
): Promise<Lesson[]> {
  const memoryPath = options.memoryPath ?? path.resolve('.axiom-state', 'memory.json');
  const existing = fs.existsSync(memoryPath) ? loadMemory(memoryPath) : [];
  const existingByFact = new Map<string, Lesson>();
  for (const item of existing) {
    const code = item.factId ?? item.errorCode;
    if (code.startsWith('F-')) {
      existingByFact.set(code, item);
    }
  }
  if (!options.forceRegenerate && existingByFact.size >= ELIGIBLE_FACTS.length) {
    return Array.from(existingByFact.values());
  }

  const failureFrequency =
    options.failureFrequency ?? loadTrainFailureFrequency(options.calibrationPath);
  const distillFn = options.distillFn ?? generateLesson;

  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  fs.writeFileSync(memoryPath, '[]\n', 'utf8');
  const now = new Date().toISOString();

  for (const fact of ELIGIBLE_FACTS) {
    const factId = fact.id;
    const statement = fact.statement;
    const matching = trainTasks.filter((t) =>
      getApplicableFacts(getTaskRealFlags(t)).includes(factId)
    );
    if (matching.length === 0) continue;

    const byCohort = new Map<string, TaskV2Item[]>();
    for (const t of matching) {
      const list = byCohort.get(t.cohortId) ?? [];
      list.push(t);
      byCohort.set(t.cohortId, list);
    }
    const cohortLists = Array.from(byCohort.values());
    const interleaved: TaskV2Item[] = [];
    const maxLen = Math.max(0, ...cohortLists.map((c) => c.length));
    for (let r = 0; r < maxLen; r++) {
      for (const cList of cohortLists) {
        if (r < cList.length) interleaved.push(cList[r]);
      }
    }
    const violationCount = failureFrequency[factId] ?? 0;
    const cachedDistilled = existingByFact.get(factId)?.lesson;
    let distilledText = cachedDistilled ?? statement;
    if (violationCount > 0 && !cachedDistilled) {
      try {
        distilledText = await distillFn(factId, statement);
      } catch (err: any) {
        console.warn(`[Ablation] Advisor distillation fallback for ${factId}: ${err.message}`);
        distilledText = statement;
      }
    }
    if (violationCount > 0) {
      for (let i = 0; i < violationCount; i++) {
        const trainTask = interleaved[i % interleaved.length];
        saveLesson(
          {
            errorCode: factId,
            factId,
            lesson: distilledText,
            features: trainTask.features,
            createdAt: now,
            lastUsedAt: now,
          },
          memoryPath,
          50
        );
      }
    } else {
      for (const trainTask of interleaved) {
        saveLesson(
          {
            errorCode: factId,
            factId,
            lesson: statement,
            features: trainTask.features,
            utilityScore: 0,
            createdAt: now,
            lastUsedAt: now,
          },
          memoryPath,
          50
        );
      }
    }
  }
  return loadMemory(memoryPath);
}

export function assertMemoryUnchanged(
  memoryPath: string,
  expectedSha256: string,
  checkpointPath?: string,
  trials?: Trial[]
): string {
  const actualSha256 = computeMemoryFileSha256(memoryPath);
  if (actualSha256 !== expectedSha256) {
    if (checkpointPath) {
      const existingTrials =
        trials ??
        (fs.existsSync(checkpointPath)
          ? (() => {
              const parsed = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
              return Array.isArray(parsed) ? parsed : (parsed.trials ?? []);
            })()
          : []);
      const flaggedCheckpoint = {
        memoryMutated: true,
        abortedAt: new Date().toISOString(),
        memorySha256AtStart: expectedSha256,
        memorySha256AtEnd: actualSha256,
        trials: existingTrials,
      };
      fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
      fs.writeFileSync(checkpointPath, JSON.stringify(flaggedCheckpoint, null, 2), 'utf8');
    }
    throw new Error(
      `Memory immutability check failed for ${memoryPath}: start SHA-256 ${expectedSha256} !== end SHA-256 ${actualSha256}`
    );
  }
  return actualSha256;
}

async function main(): Promise<void> {
  const root = path.resolve('.');
  const allowDirty = process.argv.includes('--allow-dirty');
  assertScopedCleanGitTree({ allowDirty, cwd: root, context: 'ablation' });
  const tasksPath = path.join(root, 'fixtures', 'task-v2', 'tasks.json');
  const taskFile = JSON.parse(
    fs.readFileSync(tasksPath, 'utf8')
  ) as TaskFile;
  verifyCalibrationContentHashes(tasksPath, [
    path.join(root, 'out', 'train-calibration.json'),
    path.join(root, 'out', 'dev-calibration.json'),
  ]);
  if (
    taskFile.test.length !== 120 ||
    taskFile.test[0]?.id !== 'H-001' ||
    taskFile.test[119]?.id !== 'H-120'
  ) {
    throw new Error(`Expected H-001..H-120 test tasks, got ${taskFile.test.length}`);
  }

  const configuredModel = resolveExecutorModel();
  assertModelMatch(configuredModel, configuredModel);

  process.env.AXIOM_DAILY_CALLS = String(
    Math.max(Number(process.env.AXIOM_DAILY_CALLS || 1000), 1000)
  );
  const dailyCap = getDailyCap();
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = Math.max(dailyCap, 1000);
  BUDGET_GUARD.callTimeoutMs = Math.max(BUDGET_GUARD.callTimeoutMs, 180_000);

  const stateDir = path.join(root, '.axiom-state');
  const memoryPath = path.join(stateDir, 'memory.json');
  const checkpointPath = path.join(stateDir, 'ablation-v2-checkpoint.json');
  const resultPath = path.join(stateDir, 'ablation-v2-results.json');
  fs.mkdirSync(stateDir, { recursive: true });

  // Load memory once in read-only mode and record its SHA-256 at startup
  const { memory, sha256: memorySha256AtStart } = loadReadOnlyMemorySnapshot(memoryPath);
  const runMetadata = getRunMetadata(root);

  const conditions: ConditionId[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
  const containerName = `axiom-ablation-v2-${process.pid}`;
  let checkpointMetadata: RunMetadata | undefined;
  const trials: Trial[] = fs.existsSync(checkpointPath)
    ? (() => {
        const parsed = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.memoryMutated) {
          throw new Error('Cannot resume from a checkpoint flagged with memoryMutated=true.');
        }
        checkpointMetadata = Array.isArray(parsed) ? undefined : parsed.metadata;
        if (checkpointMetadata) assertRunMetadataMatches(checkpointMetadata, runMetadata);
        else throw new Error('Checkpoint is missing provenance metadata.');
        return (Array.isArray(parsed) ? parsed : parsed.trials ?? []) as Trial[];
      })()
    : [];

  startPostgresContainer(containerName);
  try {
    for (const task of taskFile.test) {
      for (const condition of conditions) {
        if (trials.some((trial) => trial.taskId === task.id && trial.condition === condition)) {
          continue;
        }
        const { trial, fromCache } = await runAblationTaskCondition({
          containerName,
          task,
          condition,
          memory,
          configuredModel,
          runMetadata,
        });
        trials.push(trial);
        fs.writeFileSync(checkpointPath, JSON.stringify({ metadata: runMetadata, trials }, null, 2), 'utf8');
        console.log(
          `[${trials.length}/720 ${task.id} ${condition}] gen=${trial.generationStatus} boundPass=${trial.boundPassed} (${(trial.boundFactFraction * 100).toFixed(1)}%) | rawPass=${trial.passRaw} | failed=[${trial.failedFacts.join(', ')}]`
        );
        if (!fromCache) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      const budget = readDailyBudget();
      console.log(`[${task.id}] completed ${conditions.length} conditions; budget ${budget.dailyCalls}/${dailyCap}`);
    }
  } finally {
    stopPostgresContainer(containerName);
  }

  const memorySha256AtEnd = assertMemoryUnchanged(
    memoryPath,
    memorySha256AtStart,
    checkpointPath,
    trials
  );

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: 'Ablation v2',
    model: configuredModel,
    temperature: 0,
    repeats: 1,
    testTasks: taskFile.test.length,
    conditions,
    memorySha256AtStart,
    memorySha256AtEnd,
    oracleSha256: runMetadata.oracleSha256,
    tasksSha256: runMetadata.tasksSha256,
    factsSha256: runMetadata.factsSha256,
    gitCommit: runMetadata.gitCommit,
    eligibleFacts: Object.keys(FACT_STATEMENTS).filter((id) =>
      ELIGIBLE_FACTS.some((fact) => fact.id === id)
    ),
    results: conditions.map((condition) =>
      summarize(condition, trials.filter((trial) => trial.condition === condition), trials)
    ),
    trials,
  };
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report.results, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('ablation.ts')) {
  main().catch((error) => {
    console.error('Ablation v2 failed:', error);
    process.exitCode = 1;
  });
}
