import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import {
  Lesson,
  formatRetrievedLessons,
  loadReadOnlyMemorySnapshot,
  retrieveLessonsByFeatures,
  computeMemoryFileSha256,
} from '../memory.js';
import {
  evaluateMigrationSqlInContainer,
  startPostgresContainer,
  stopPostgresContainer,
} from '../../scripts/oracle.js';
import { BUDGET_GUARD, getDailyCap, readDailyBudget } from '../guardrails.js';
import {
  assertModelMatch,
  executeSqlWithPolicy,
  generateSqlMigration,
  getExecutorSha256,
  resolveExecutorModel,
} from '../executor.js';
import { assertScopedCleanGitTree } from '../../scripts/calibration-common.js';
import { formatDSafeHint } from '../../scripts/v3/d-safe-tips.js';
import {
  type TaskV2Item,
  type Trial,
  type RunMetadata,
  buildTrial,
  getTaskApplicableFacts,
  sha256File,
  parseCliArg,
  wilson95Interval,
  pairedMcNemar,
} from './ablation.js';

dotenv.config();

export const SQL_V3_RETRIEVAL_TOP_K = 10;

export type ConditionV3Id =
  | 'A'
  | 'D_safe'
  | 'C'
  | 'C0'
  | 'C0_clean'
  | 'C_ID'
  | 'C0_rand'
  | 'B';

export const V3_CONDITIONS: readonly ConditionV3Id[] = Object.freeze([
  'A',
  'D_safe',
  'C',
  'C0',
  'C0_clean',
  'C_ID',
  'C0_rand',
  'B',
]);

export interface FactSpecV3 {
  id: string;
  statement: string;
  applicability: Record<string, unknown>;
  check: string;
  status: string;
}

export interface LoadedFactsCorpus {
  allFacts: FactSpecV3[];
  activeFacts: FactSpecV3[];
  activeIds: Set<string>;
  statementById: Record<string, string>;
}

export interface TaskV3File {
  version: string;
  train: TaskV2Item[];
  dev: TaskV2Item[];
  test: TaskV2Item[];
}

export interface V3ContextAssets {
  memoryV2: readonly Lesson[];
  memoryCidByFactId: Map<string, Lesson>;
  factsV2: LoadedFactsCorpus;
  factsV3: LoadedFactsCorpus;
}

export interface RunMetadataV3 {
  protocol: 'Ablation v3';
  oracleSha256: string;
  tasksV3Sha256: string;
  factsV2Sha256: string;
  factsV3Sha256: string;
  memoryV2Sha256: string;
  memoryCidSha256: string;
  dSafeSha256: string;
  hintBSha256: string;
  hintDSafeSha256: string;
  hintBuildersSha256: string;
  executorSha256: string;
  gitCommit: string;
  requestedModel: string;
  topK: number;
  diffSha256?: string;
  targetTasks?: string[];
  totalTrials?: number;
}

export interface TrialV3 extends Omit<Trial, 'condition'> {
  condition: ConditionV3Id;
  factsV2Sha256?: string;
  factsV3Sha256?: string;
  memoryCidSha256?: string;
  dSafeSha256?: string;
  hintSha256?: string;
}

function sha256String(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function loadFactsCorpus(factsPath: string): LoadedFactsCorpus {
  const parsed = JSON.parse(fs.readFileSync(factsPath, 'utf8')) as { facts: FactSpecV3[] };
  const allFacts = parsed.facts ?? [];
  const activeFacts = allFacts.filter(
    (f) => f.status === 'CONFIRMED' || f.status === 'OWNER-ADOPTED'
  );
  const activeIds = new Set(activeFacts.map((f) => f.id));
  const statementById: Record<string, string> = {};
  for (const f of allFacts) {
    statementById[f.id] = f.statement;
  }
  return { allFacts, activeFacts, activeIds, statementById };
}

export function indexMemoryByFactId(lessons: readonly Lesson[]): Map<string, Lesson> {
  const map = new Map<string, Lesson>();
  for (const lesson of lessons) {
    const code = lesson.factId ?? lesson.errorCode;
    if (code && !map.has(code)) {
      map.set(code, lesson);
    }
  }
  return map;
}

export function loadV3ContextAssets(root = path.resolve('.')): {
  assets: V3ContextAssets;
  memoryV2Sha256: string;
  memoryCidSha256: string;
} {
  const memoryV2Snap = loadReadOnlyMemorySnapshot(path.join(root, '.axiom-state', 'memory.json'));
  const memoryCidSnap = loadReadOnlyMemorySnapshot(
    path.join(root, '.axiom-state', 'memory-v3-cid.json')
  );
  const factsV2 = loadFactsCorpus(path.join(root, 'fixtures', 'task-v2', 'facts.json'));
  const factsV3 = loadFactsCorpus(path.join(root, 'fixtures', 'task-v3', 'facts.json'));
  return {
    assets: {
      memoryV2: memoryV2Snap.memory,
      memoryCidByFactId: indexMemoryByFactId(memoryCidSnap.memory),
      factsV2,
      factsV3,
    },
    memoryV2Sha256: memoryV2Snap.sha256,
    memoryCidSha256: memoryCidSnap.sha256,
  };
}

/**
 * Deterministic 32-bit FNV-1a hash used to seed C0_rand sampling.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically samples `k` distinct active fact IDs without replacement
 * using a 32-bit LCG seeded by `fnv1a32(taskId + ':C0_rand')`.
 */
export function sampleC0RandFactIds(
  taskId: string,
  activeFactIds: readonly string[],
  k: number = SQL_V3_RETRIEVAL_TOP_K
): string[] {
  const pool = [...activeFactIds];
  let state = fnv1a32(`${taskId}:C0_rand`) || 1;
  const nextRand = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const count = Math.min(k, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(nextRand() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

export function retrieveV3LessonsForTask(
  task: Pick<TaskV2Item, 'features'> &
    Partial<Pick<TaskV2Item, 'applicableFacts' | 'prompt' | 'goldenSql'>>,
  memoryV2: readonly Lesson[],
  topK: number = SQL_V3_RETRIEVAL_TOP_K
): Lesson[] {
  const applicableFactIds = getTaskApplicableFacts(task);
  return retrieveLessonsByFeatures(task.features, memoryV2, topK, applicableFactIds, true);
}

export function buildStaticV3FactsText(factsV3: LoadedFactsCorpus): string {
  return factsV3.activeFacts.map((fact) => `[${fact.id}] ${fact.statement}`).join('\n');
}

export interface BuiltV3Hint {
  hint: string | undefined;
  retrievedFactIds: string[];
  hintSha256: string;
}

export function buildConditionV3Hint(
  condition: ConditionV3Id,
  task: TaskV2Item,
  assets: V3ContextAssets
): BuiltV3Hint {
  if (condition === 'A') {
    return {
      hint: undefined,
      retrievedFactIds: [],
      hintSha256: sha256String(''),
    };
  }

  if (condition === 'D_safe') {
    const hint = formatDSafeHint();
    return {
      hint,
      retrievedFactIds: [],
      hintSha256: sha256String(hint),
    };
  }

  if (condition === 'B') {
    const staticText = buildStaticV3FactsText(assets.factsV3);
    const hint = `ORACLE STATIC FACTS. Satisfy every applicable fact below:\n${staticText}`;
    return {
      hint,
      retrievedFactIds: assets.factsV3.activeFacts.map((f) => f.id),
      hintSha256: sha256String(hint),
    };
  }

  if (condition === 'C0_rand') {
    const activeIds = assets.factsV3.activeFacts.map((f) => f.id);
    const sampledIds = sampleC0RandFactIds(task.id, activeIds, SQL_V3_RETRIEVAL_TOP_K);
    const lines = sampledIds.map((id) => {
      const stmt = assets.factsV3.statementById[id];
      if (!stmt) {
        throw new Error(`Missing v3 fact statement for sampled ID ${id}`);
      }
      return `- [${id}] ${stmt}`;
    });
    const hint = `RANDOM ORACLE FACTS (VERBATIM V3):\n${lines.join('\n')}`;
    return {
      hint,
      retrievedFactIds: sampledIds,
      hintSha256: sha256String(hint),
    };
  }

  // C, C0, C0_clean, and C_ID MUST retrieve the exact same Top-K=10 fact IDs from memoryV2
  const lessons = retrieveV3LessonsForTask(task, assets.memoryV2, SQL_V3_RETRIEVAL_TOP_K);
  const retrievedFactIds = lessons.map((l) => l.factId ?? l.errorCode);

  if (condition === 'C') {
    const hint =
      lessons.length > 0
        ? `DYNAMIC MEMORY LESSONS:\n${formatRetrievedLessons(lessons)}`
        : undefined;
    return {
      hint,
      retrievedFactIds,
      hintSha256: sha256String(hint ?? ''),
    };
  }

  if (condition === 'C0') {
    if (lessons.length === 0) {
      return { hint: undefined, retrievedFactIds: [], hintSha256: sha256String('') };
    }
    const lines = retrievedFactIds.map((code, idx) => {
      const v2Statement = assets.factsV2.statementById[code] ?? lessons[idx].lesson;
      return `- [${code}] ${v2Statement}`;
    });
    const hint = `DYNAMIC MEMORY LESSONS (VERBATIM ORACLE):\n${lines.join('\n')}`;
    return {
      hint,
      retrievedFactIds,
      hintSha256: sha256String(hint),
    };
  }

  if (condition === 'C0_clean') {
    if (lessons.length === 0) {
      return { hint: undefined, retrievedFactIds: [], hintSha256: sha256String('') };
    }
    const lines = retrievedFactIds.map((code, idx) => {
      const v3Statement = assets.factsV3.statementById[code] ?? lessons[idx].lesson;
      return `- [${code}] ${v3Statement}`;
    });
    const hint = `DYNAMIC MEMORY LESSONS (VERBATIM ORACLE V3):\n${lines.join('\n')}`;
    return {
      hint,
      retrievedFactIds,
      hintSha256: sha256String(hint),
    };
  }

  // condition === 'C_ID'
  if (lessons.length === 0) {
    return { hint: undefined, retrievedFactIds: [], hintSha256: sha256String('') };
  }
  const cidLessons: Lesson[] = retrievedFactIds.map((code, idx) => {
    const cidEntry = assets.memoryCidByFactId.get(code);
    if (!cidEntry) {
      throw new Error(`Missing C_ID distilled lesson in memory-v3-cid.json for ${code}`);
    }
    return {
      ...lessons[idx],
      lesson: cidEntry.lesson,
    };
  });
  const hint = `DYNAMIC MEMORY LESSONS:\n${formatRetrievedLessons(cidLessons)}`;
  return {
    hint,
    retrievedFactIds,
    hintSha256: sha256String(hint),
  };
}

export function computeHintBV3Sha256(root = path.resolve('.')): string {
  const factsV3 = loadFactsCorpus(path.join(root, 'fixtures', 'task-v3', 'facts.json'));
  const staticText = buildStaticV3FactsText(factsV3);
  return sha256String(`ORACLE STATIC FACTS. Satisfy every applicable fact below:\n${staticText}`);
}

export function computeHintDSafeSha256(): string {
  return sha256String(formatDSafeHint());
}

export function computeHintBuildersV3Sha256(root = path.resolve('.')): string {
  const filePath = path.join(root, 'src', 'eval', 'ablation-v3.ts');
  const code = fs.readFileSync(filePath, 'utf8');
  const match = code.match(/export function buildConditionV3Hint[\s\S]*?\n\}/m);
  if (!match) throw new Error('Could not extract buildConditionV3Hint source');
  return sha256String(match[0].trim());
}

export function getRunMetadataV3(
  root = path.resolve('.'),
  requestedModel = resolveExecutorModel(),
  allowDirty = false
): RunMetadataV3 {
  const meta: RunMetadataV3 = {
    protocol: 'Ablation v3',
    oracleSha256: sha256File(path.join(root, 'scripts', 'oracle.ts')),
    tasksV3Sha256: sha256File(path.join(root, 'fixtures', 'task-v3', 'tasks.json')),
    factsV2Sha256: sha256File(path.join(root, 'fixtures', 'task-v2', 'facts.json')),
    factsV3Sha256: sha256File(path.join(root, 'fixtures', 'task-v3', 'facts.json')),
    memoryV2Sha256: sha256File(path.join(root, '.axiom-state', 'memory.json')),
    memoryCidSha256: sha256File(path.join(root, '.axiom-state', 'memory-v3-cid.json')),
    dSafeSha256: sha256File(path.join(root, 'scripts', 'v3', 'd-safe-tips.ts')),
    hintBSha256: computeHintBV3Sha256(root),
    hintDSafeSha256: computeHintDSafeSha256(),
    hintBuildersSha256: computeHintBuildersV3Sha256(root),
    executorSha256: getExecutorSha256(path.join(root, 'src', 'executor.ts')),
    gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    requestedModel,
    topK: SQL_V3_RETRIEVAL_TOP_K,
  };
  if (allowDirty) {
    const gitDiff = execFileSync('git', ['diff', 'HEAD'], { cwd: root, encoding: 'utf8' });
    meta.diffSha256 = sha256String(gitDiff);
  }
  return meta;
}

export function assertRunMetadataV3Matches(
  expected: Partial<RunMetadataV3>,
  actual: RunMetadataV3,
  allowDirty = false
): void {
  const keysToCheck = [
    'oracleSha256',
    'tasksV3Sha256',
    'factsV2Sha256',
    'factsV3Sha256',
    'memoryV2Sha256',
    'memoryCidSha256',
    'dSafeSha256',
    ...(allowDirty ? [] : (['gitCommit'] as const)),
    'requestedModel',
  ] as const;
  for (const key of keysToCheck) {
    if (expected[key] !== undefined && actual[key] !== undefined && expected[key] !== actual[key]) {
      throw new Error(
        `[ABORT_NON_RETRYABLE] Ablation v3 provenance mismatch for ${key}: checkpoint=${expected[key]} current=${actual[key]}`
      );
    }
  }
}

export function assertV3MemoriesUnchanged(
  memoryV2Path: string,
  expectedV2Sha256: string,
  memoryCidPath: string,
  expectedCidSha256: string,
  checkpointPath?: string,
  trials?: TrialV3[]
): { memoryV2Sha256AtEnd: string; memoryCidSha256AtEnd: string } {
  const memoryV2Sha256AtEnd = computeMemoryFileSha256(memoryV2Path);
  const memoryCidSha256AtEnd = computeMemoryFileSha256(memoryCidPath);
  if (memoryV2Sha256AtEnd !== expectedV2Sha256 || memoryCidSha256AtEnd !== expectedCidSha256) {
    if (checkpointPath) {
      const flagged = {
        memoryMutated: true,
        abortedAt: new Date().toISOString(),
        memoryV2Sha256AtStart: expectedV2Sha256,
        memoryV2Sha256AtEnd,
        memoryCidSha256AtStart: expectedCidSha256,
        memoryCidSha256AtEnd,
        trials: trials ?? [],
      };
      fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
      fs.writeFileSync(checkpointPath, JSON.stringify(flagged, null, 2), 'utf8');
    }
    throw new Error(
      `Memory immutability check failed: v2=${expectedV2Sha256} vs ${memoryV2Sha256AtEnd}, cid=${expectedCidSha256} vs ${memoryCidSha256AtEnd}`
    );
  }
  return { memoryV2Sha256AtEnd, memoryCidSha256AtEnd };
}

export async function runAblationV3TaskCondition(options: {
  containerName: string;
  task: TaskV2Item;
  condition: ConditionV3Id;
  assets: V3ContextAssets;
  configuredModel?: string;
  executorFn?: typeof generateSqlMigration;
  oracleEvalFn?: typeof evaluateMigrationSqlInContainer;
  runMetadata?: RunMetadataV3;
}): Promise<{ trial: TrialV3; fromCache: boolean }> {
  const configuredModel = options.configuredModel ?? resolveExecutorModel();
  const executorFn = options.executorFn ?? generateSqlMigration;
  const oracleEvalFn = options.oracleEvalFn ?? evaluateMigrationSqlInContainer;

  const builtHint = buildConditionV3Hint(options.condition, options.task, options.assets);
  const generated = await executeSqlWithPolicy(
    executorFn,
    options.task.prompt,
    options.task.table,
    options.task.features,
    builtHint.hint,
    { temperature: 0, model: configuredModel }
  );

  // Map v3 metadata onto v2 RunMetadata shape for buildTrial provenance
  const compatMetadata: RunMetadata | undefined = options.runMetadata
    ? {
        oracleSha256: options.runMetadata.oracleSha256,
        tasksSha256: options.runMetadata.tasksV3Sha256,
        factsSha256: options.runMetadata.factsV3Sha256,
        memorySha256: options.runMetadata.memoryV2Sha256,
        gitCommit: options.runMetadata.gitCommit,
        requestedModel: options.runMetadata.requestedModel,
        topK: options.runMetadata.topK,
        hintBSha256: options.runMetadata.hintBSha256,
        hintDSha256: options.runMetadata.hintDSafeSha256,
        hintBuildersSha256: options.runMetadata.hintBuildersSha256,
        executorSha256: options.runMetadata.executorSha256,
        diffSha256: options.runMetadata.diffSha256,
      }
    : undefined;

  const baseTrial = buildTrial(
    options.containerName,
    options.task,
    // Pass 'A' to buildTrial for condition field typing, then override with ConditionV3Id
    'A',
    generated.sql,
    generated.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    builtHint.retrievedFactIds,
    {
      requestedModel: generated.requestedModel,
      returnedModel: generated.returnedModel,
      finishReason: generated.finishReason,
      generationStatus: generated.generationStatus,
      rawResponse: generated.rawResponse,
      rawSha256: generated.rawSha256,
      sanitizedSql: generated.sanitizedSql,
      sanitizedSha256: generated.sanitizedSha256,
      tagError: generated.tagError,
      fromCache: generated.fromCache,
    },
    oracleEvalFn,
    compatMetadata
  );

  const trial: TrialV3 = {
    ...baseTrial,
    condition: options.condition,
    hintSha256: builtHint.hintSha256,
    ...(options.runMetadata
      ? {
          factsV2Sha256: options.runMetadata.factsV2Sha256,
          factsV3Sha256: options.runMetadata.factsV3Sha256,
          memoryCidSha256: options.runMetadata.memoryCidSha256,
          dSafeSha256: options.runMetadata.dSafeSha256,
        }
      : {}),
  };

  return { trial, fromCache: Boolean(generated.fromCache) };
}

export function summarizeV3(condition: ConditionV3Id, trials: TrialV3[], all: TrialV3[]) {
  const rawPasses = trials.filter((t) => t.passRaw).length;
  const boundPasses = trials.filter((t) => t.boundPassed).length;
  const meanBoundFactFraction = trials.length
    ? Number((trials.reduce((s, t) => s + (t.boundFactFraction ?? 0), 0) / trials.length).toFixed(4))
    : 0;
  const [rawLow, rawHigh] = wilson95Interval(rawPasses, trials.length);
  const [boundLow, boundHigh] = wilson95Interval(boundPasses, trials.length);
  const failures: Record<string, number> = {};
  for (const trial of trials) {
    for (const fact of trial.failedFacts) failures[fact] = (failures[fact] ?? 0) + 1;
  }
  const byCondition = (id: ConditionV3Id) =>
    all
      .filter((t) => t.condition === id)
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
  return {
    condition,
    trials: trials.length,
    primaryMeanBoundFactFraction: meanBoundFactFraction,
    primaryMeanBoundFactFractionPct: `${(meanBoundFactFraction * 100).toFixed(1)}%`,
    secondaryPassAt1OverBoundFacts: `${boundPasses}/${trials.length} (${trials.length ? ((boundPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Bound: `[${boundLow.toFixed(1)}%, ${boundHigh.toFixed(1)}%]`,
    passAt1Raw: `${rawPasses}/${trials.length} (${trials.length ? ((rawPasses / trials.length) * 100).toFixed(1) : '0.0'}%)`,
    ci95Raw: `[${rawLow.toFixed(1)}%, ${rawHigh.toFixed(1)}%]`,
    mcnemarVsA:
      condition !== 'A'
        ? pairedMcNemar(byCondition('A').map((t) => t.passRaw), trials.map((t) => t.passRaw))
        : null,
    failuresByFact: failures,
    averagePromptTokens: trials.length
      ? Math.round(trials.reduce((sum, t) => sum + t.promptTokens, 0) / trials.length)
      : 0,
    averageTokensPerTask: trials.length
      ? Math.round(trials.reduce((sum, t) => sum + t.totalTokens, 0) / trials.length)
      : 0,
  };
}

function ensurePostgresContainerRunning(containerName: string): void {
  try {
    const res = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', containerName], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (res === 'true') return;
  } catch {
    // not running
  }
  startPostgresContainer(containerName);
}

async function main(): Promise<void> {
  const root = path.resolve('.');
  const allowDirty = process.argv.includes('--allow-dirty');
  assertScopedCleanGitTree({ allowDirty, cwd: root, context: 'ablation-v3' });

  const tasksPath = path.join(root, 'fixtures', 'task-v3', 'tasks.json');
  const taskFile = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as TaskV3File;

  const tasksFilterArg = parseCliArg('--tasks');
  let targetTasks: TaskV2Item[];
  if (tasksFilterArg) {
    const requestedIds = new Set(
      tasksFilterArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const allTasks = [...taskFile.train, ...taskFile.dev, ...taskFile.test];
    targetTasks = allTasks.filter((t) => requestedIds.has(t.id));
    if (targetTasks.length !== requestedIds.size) {
      throw new Error(
        `Requested --tasks ${tasksFilterArg}, found ${targetTasks.map((t) => t.id).join(', ')}`
      );
    }
  } else {
    if (
      taskFile.test.length !== 120 ||
      taskFile.test[0]?.id !== 'V3-H-001' ||
      taskFile.test[119]?.id !== 'V3-H-120'
    ) {
      throw new Error(`Expected V3-H-001..V3-H-120 test tasks, got ${taskFile.test.length}`);
    }
    targetTasks = taskFile.test;
  }

  const cliModel = parseCliArg('--model');
  const configuredModel = resolveExecutorModel(cliModel);
  assertModelMatch(configuredModel, configuredModel);

  const runId = parseCliArg('--run-id');
  if (!runId || !runId.trim()) {
    throw new Error('Ablation v3 runner requires --run-id <id> (e.g. --run-id v3-nemotron-1).');
  }

  process.env.AXIOM_DAILY_CALLS = String(
    Math.max(Number(process.env.AXIOM_DAILY_CALLS || 1500), 1500)
  );
  const dailyCap = getDailyCap();
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = Math.max(dailyCap, 1500);
  BUDGET_GUARD.callTimeoutMs = Math.max(
    BUDGET_GUARD.callTimeoutMs,
    Number(process.env.AXIOM_CALL_TIMEOUT_MS || 180_000),
    180_000
  );

  const stateDir = path.join(root, '.axiom-state');
  const memoryV2Path = path.join(stateDir, 'memory.json');
  const memoryCidPath = path.join(stateDir, 'memory-v3-cid.json');
  const checkpointArg = parseCliArg('--checkpoint');
  const outArg = parseCliArg('--out');
  const checkpointPath = checkpointArg
    ? path.resolve(checkpointArg)
    : path.join(stateDir, 'runs-v3', runId, 'checkpoint.json');
  const resultPath = outArg
    ? path.resolve(outArg)
    : path.join(stateDir, 'runs-v3', runId, 'results.json');

  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });

  const { assets, memoryV2Sha256, memoryCidSha256 } = loadV3ContextAssets(root);
  const runMetadata = getRunMetadataV3(root, configuredModel, allowDirty);
  const conditions: ConditionV3Id[] = [...V3_CONDITIONS];
  const totalExpectedTrials = targetTasks.length * conditions.length;
  runMetadata.targetTasks = targetTasks.map((t) => t.id);
  runMetadata.totalTrials = totalExpectedTrials;

  const trials: TrialV3[] = fs.existsSync(checkpointPath)
    ? (() => {
        const parsed = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.memoryMutated) {
          throw new Error('Cannot resume from a checkpoint flagged with memoryMutated=true.');
        }
        const cpMeta: Partial<RunMetadataV3> | undefined = Array.isArray(parsed)
          ? undefined
          : parsed.metadata;
        if (!cpMeta) {
          throw new Error('Checkpoint is missing v3 provenance metadata.');
        }
        if (cpMeta.requestedModel && cpMeta.requestedModel !== configuredModel) {
          throw new Error(
            `[ABORT_NON_RETRYABLE] Checkpoint model mismatch: checkpoint="${cpMeta.requestedModel}" configured="${configuredModel}".`
          );
        }
        assertRunMetadataV3Matches(cpMeta, runMetadata, allowDirty);
        return (parsed.trials ?? []) as TrialV3[];
      })()
    : [];

  const containerName = `axiom-ablation-v3-${process.pid}`;
  startPostgresContainer(containerName);
  try {
    for (const task of targetTasks) {
      for (const condition of conditions) {
        if (trials.some((t) => t.taskId === task.id && t.condition === condition)) {
          continue;
        }
        ensurePostgresContainerRunning(containerName);
        const { trial, fromCache } = await runAblationV3TaskCondition({
          containerName,
          task,
          condition,
          assets,
          configuredModel,
          runMetadata,
        });
        trials.push(trial);
        fs.writeFileSync(
          checkpointPath,
          JSON.stringify({ metadata: runMetadata, trials }, null, 2),
          'utf8'
        );
        console.log(
          `[${trials.length}/${totalExpectedTrials} ${task.id} ${condition}] gen=${trial.generationStatus} boundPass=${trial.boundPassed} (${(trial.boundFactFraction * 100).toFixed(1)}%) | rawPass=${trial.passRaw} | failed=[${trial.failedFacts.join(', ')}]`
        );
        if (!fromCache) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      const budget = readDailyBudget();
      console.log(
        `[${task.id}] completed ${conditions.length} v3 conditions; budget ${budget.dailyCalls}/${dailyCap}`
      );
    }
  } finally {
    stopPostgresContainer(containerName);
  }

  const { memoryV2Sha256AtEnd, memoryCidSha256AtEnd } = assertV3MemoriesUnchanged(
    memoryV2Path,
    memoryV2Sha256,
    memoryCidPath,
    memoryCidSha256,
    checkpointPath,
    trials
  );

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: 'Ablation v3',
    runId,
    model: configuredModel,
    requestedModel: runMetadata.requestedModel,
    topK: runMetadata.topK,
    temperature: 0,
    repeats: 1,
    testTasks: targetTasks.length,
    conditions,
    memoryV2Sha256AtStart: memoryV2Sha256,
    memoryV2Sha256AtEnd,
    memoryCidSha256AtStart: memoryCidSha256,
    memoryCidSha256AtEnd,
    metadata: runMetadata,
    results: conditions.map((condition) =>
      summarizeV3(
        condition,
        trials.filter((t) => t.condition === condition),
        trials
      )
    ),
    trials,
  };
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report.results, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('ablation-v3.ts')) {
  main().catch((error) => {
    console.error('Ablation v3 failed:', error);
    process.exitCode = 1;
  });
}
