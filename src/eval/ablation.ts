import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  FeatureFlags,
  Lesson,
  LESSON_TOP_K,
  formatRetrievedLessons,
  loadMemory,
  retrieveLessonsByFeatures,
} from '../memory.js';
import { FACTS, FACT_STATEMENTS } from '../../scripts/facts.js';
import {
  evaluateMigrationSqlInContainer,
  startPostgresContainer,
  stopPostgresContainer,
} from '../../scripts/oracle.js';
import { BUDGET_GUARD, getDailyCap, readDailyBudget } from '../guardrails.js';
import { generateSqlMigration } from '../executor.js';

dotenv.config();

export { LESSON_TOP_K, formatRetrievedLessons, loadMemory, retrieveLessonsByFeatures };
export type { FeatureFlags };

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
  memory: Lesson[],
  topK: number = LESSON_TOP_K
): { retrievedFactIds: string[]; recalledFacts: string[]; recall: number } {
  const retrievedFactIds = retrieveLessonsByFeatures(taskFeatures, memory, topK).map(
    (lesson) => lesson.factId ?? lesson.errorCode
  );
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

interface Trial {
  condition: ConditionId;
  taskId: string;
  passRaw: boolean;
  passWithTier0: boolean;
  failedFacts: string[];
  oracleFailedFacts: string[];
  postTier0FailedFacts: string[];
  retrievedFactIds: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
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

const ELIGIBLE_FACTS = FACTS.filter(
  (fact) => fact.status === 'CONFIRMED' || fact.status === 'OWNER-ADOPTED'
);
const STATIC_FACTS = ELIGIBLE_FACTS.map(
  (fact) => `[${fact.id}] ${fact.statement}`
).join('\n');

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

function buildConditionHint(
  condition: ConditionId,
  task: TaskV2Item,
  memory: Lesson[]
): string | undefined {
  if (condition === 'B' || condition === 'E_B') {
    return `ORACLE STATIC FACTS. Satisfy every applicable fact below:\n${STATIC_FACTS}`;
  }
  if (condition === 'C') {
    const lessons = retrieveLessonsByFeatures(task.features, memory, LESSON_TOP_K);
    return lessons.length > 0
      ? `DYNAMIC MEMORY LESSONS:\n${formatRetrievedLessons(lessons)}`
      : undefined;
  }
  if (condition === 'C0') {
    const lessons = retrieveLessonsByFeatures(task.features, memory, LESSON_TOP_K);
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

function buildTrial(
  containerName: string,
  task: TaskV2Item,
  condition: ConditionId,
  sql: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  retrievedFactIds: string[]
): Trial {
  const oracle = evaluateMigrationSqlInContainer(
    containerName,
    sql,
    {
      table: task.table,
      tenant: task.features.tenant,
      append_only: task.features.append_only,
      ingestion: task.features.ingestion,
    },
    `${task.id}_${condition}`
  );
  const failedFacts = oracle.failedFacts;
  const passRaw = failedFacts.length === 0;

  // The SQL evaluation surface has no safe generic Tier 0 rewrite. E_B therefore
  // records the deterministic post-check explicitly without fabricating a fix.
  return {
    condition,
    taskId: task.id,
    passRaw,
    passWithTier0: passRaw,
    failedFacts,
    oracleFailedFacts: oracle.failedFacts,
    postTier0FailedFacts: failedFacts,
    retrievedFactIds,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    llmCalls: 1,
  };
}

function summarize(condition: ConditionId, trials: Trial[], all: Trial[]) {
  const rawPasses = trials.filter((trial) => trial.passRaw).length;
  const tier0Passes = trials.filter((trial) => trial.passWithTier0).length;
  const [rawLow, rawHigh] = wilson95Interval(rawPasses, trials.length);
  const [tierLow, tierHigh] = wilson95Interval(tier0Passes, trials.length);
  const failures: Record<string, number> = {};
  for (const trial of trials) {
    for (const fact of trial.failedFacts) failures[fact] = (failures[fact] ?? 0) + 1;
  }
  const byCondition = (id: ConditionId) =>
    all
      .filter((trial) => trial.condition === id)
      .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const current = byCondition(condition);
  const c = byCondition('C');
  return {
    condition,
    trials: trials.length,
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
    failuresByFact: failures,
    averageLlmCallsPerTask: trials.length
      ? Number((trials.reduce((sum, trial) => sum + trial.llmCalls, 0) / trials.length).toFixed(2))
      : 0,
    averageTokensPerTask: trials.length
      ? Math.round(trials.reduce((sum, trial) => sum + trial.totalTokens, 0) / trials.length)
      : 0,
  };
}

async function main(): Promise<void> {
  const root = path.resolve('.');
  const taskFile = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'task-v2', 'tasks.json'), 'utf8')
  ) as TaskFile;
  if (
    taskFile.test.length !== 120 ||
    taskFile.test[0]?.id !== 'H-001' ||
    taskFile.test[119]?.id !== 'H-120'
  ) {
    throw new Error(`Expected H-001..H-120 test tasks, got ${taskFile.test.length}`);
  }

  const dailyCap = getDailyCap();
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = dailyCap;
  const memory = loadMemory();
  const conditions: ConditionId[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
  const containerName = `axiom-ablation-v2-${process.pid}`;
  const stateDir = path.join(root, '.axiom-state');
  const checkpointPath = path.join(stateDir, 'ablation-v2-checkpoint.json');
  const resultPath = path.join(stateDir, 'ablation-v2-results.json');
  fs.mkdirSync(stateDir, { recursive: true });
  const trials: Trial[] = fs.existsSync(checkpointPath)
    ? (JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as Trial[])
    : [];

  startPostgresContainer(containerName);
  try {
    for (const task of taskFile.test) {
      for (const condition of conditions) {
        if (trials.some((trial) => trial.taskId === task.id && trial.condition === condition)) {
          continue;
        }
        const retrievedFactIds =
          condition === 'C' || condition === 'C0'
            ? retrieveLessonsByFeatures(task.features, memory, LESSON_TOP_K).map(
                (lesson) => lesson.factId ?? lesson.errorCode
              )
            : [];
        const generated = await generateSqlMigration(
          task.prompt,
          task.table,
          task.features,
          buildConditionHint(condition, task, memory),
          { temperature: 0, model: 'google/gemma-4-31b-it' }
        );
        trials.push(
          buildTrial(
            containerName,
            task,
            condition,
            generated.sql,
            generated.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            retrievedFactIds
          )
        );
        fs.writeFileSync(checkpointPath, JSON.stringify(trials, null, 2), 'utf8');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      const budget = readDailyBudget();
      console.log(`[${task.id}] completed ${conditions.length} conditions; budget ${budget.dailyCalls}/${dailyCap}`);
    }
  } finally {
    stopPostgresContainer(containerName);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: 'Ablation v2',
    model: 'google/gemma-4-31b-it',
    temperature: 0,
    repeats: 1,
    testTasks: taskFile.test.length,
    conditions,
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
