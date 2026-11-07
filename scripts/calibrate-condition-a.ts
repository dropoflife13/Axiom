// Dev results are for K selection and sanity checks only; never use them to select bound facts or lessons.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
} from './oracle.js';
import { FACT_STATEMENTS, getApplicableFacts } from './facts.js';
import {
  assertModelMatch,
  classifyGenerationStatus,
  executeSqlWithPolicy,
  generateSqlMigration,
  getProviderProvenance,
  resolveExecutorModel,
  type GenerationStatus,
} from '../src/executor.js';
import { BUDGET_GUARD } from '../src/guardrails.js';
import { FeatureFlags } from '../src/memory.js';
import { TaskV2Item } from '../src/eval/ablation.js';
import { deriveTaskFlags, type DerivedTaskFlags } from './propose-task-repair.js';
import {
  assertScopedCleanGitTree,
  computeTaskContentSha256,
  sha256File,
} from './calibration-common.js';

interface TasksFile {
  version: string;
  counts: { train: number; dev: number; test: number; total: number };
  cohorts: Array<{
    cohortId: string;
    features: FeatureFlags;
    applicableFacts: string[];
    description: string;
  }>;
  train: TaskV2Item[];
  dev: TaskV2Item[];
  test: TaskV2Item[];
}

interface FactStat {
  factId: string;
  statement: string;
  applicableCount: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  passRatePct: string;
}

export interface CalibrationOptions {
  split?: 'train' | 'dev';
  smoke?: boolean;
  outputPath?: string;
  allowDirty?: boolean;
}

export function getCalibrationApplicableFacts(task: Pick<TaskV2Item, 'features' | 'prompt' | 'goldenSql'>): string[] {
  const flags = deriveTaskFlags({
      features: {
        tenant: Boolean(task.features.tenant),
        append_only: Boolean(task.features.append_only),
        ingestion: Boolean(task.features.ingestion),
      },
      prompt: task.prompt,
      goldenSql: task.goldenSql,
    });
  return getApplicableFacts({ ...flags });
}

export interface CalibrationTaskReport {
  taskId: string;
  cohortId: string;
  table: string;
  generationStatus: GenerationStatus;
  features: FeatureFlags;
  derivedFlags: DerivedTaskFlags;
  boundFacts: string[];
  boundPassed: boolean;
  boundPassedFacts: string[];
  boundFailedFacts: string[];
  boundFactFraction: number;
  applicableFacts: string[];
  tableMissing: boolean;
  migrationExitNonZero: boolean;
  pass: boolean;
  applicableFactCount: number;
  passedFactCount: number;
  failedFacts: string[];
  factPassRate: number;
  fromCache: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  generatedSql: string;
  requestedModel: string;
  returnedModel: string;
  finishReason: string;
  latencyMs: number;
}

export function buildCalibrationTaskRecord(
  task: Pick<TaskV2Item, 'id' | 'cohortId' | 'table' | 'features' | 'prompt' | 'goldenSql' | 'boundFacts'>,
  execResult: {
    sql: string;
    fromCache?: boolean;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    requestedModel: string;
    returnedModel: string;
    finishReason: string;
    generationStatus?: GenerationStatus;
  },
  oracleReport?: {
    pass: boolean;
    failedFacts: string[];
    migrationExitNonZero?: boolean;
  } | null,
  latencyMs: number = 0
): CalibrationTaskReport {
  const derivedFlags = deriveTaskFlags({
    features: {
      tenant: Boolean(task.features.tenant),
      append_only: Boolean(task.features.append_only),
      ingestion: Boolean(task.features.ingestion),
    },
    prompt: task.prompt,
    goldenSql: task.goldenSql,
  });
  const applicableFacts = getApplicableFacts({ ...derivedFlags });
  const boundFacts = task.boundFacts ?? [];
  const generationStatus = classifyGenerationStatus(
    execResult.finishReason,
    execResult.sql,
    execResult.generationStatus
  );

  if (generationStatus !== 'ok' || !oracleReport) {
    return {
      taskId: task.id,
      cohortId: task.cohortId,
      table: task.table,
      generationStatus: generationStatus === 'ok' ? 'other' : generationStatus,
      features: { ...task.features, ...derivedFlags },
      derivedFlags,
      boundFacts,
      boundPassed: false,
      boundPassedFacts: [],
      boundFailedFacts: [...boundFacts],
      boundFactFraction: 0,
      tableMissing: false,
      migrationExitNonZero: false,
      pass: false,
      applicableFactCount: applicableFacts.length,
      applicableFacts,
      passedFactCount: 0,
      failedFacts: [],
      factPassRate: 0,
      fromCache: Boolean(execResult.fromCache),
      usage: execResult.usage,
      generatedSql: '',
      requestedModel: execResult.requestedModel,
      returnedModel: execResult.returnedModel,
      finishReason: execResult.finishReason,
      latencyMs,
    };
  }

  const failedSet = new Set(oracleReport.failedFacts);
  const tableMissing = failedSet.has('F-13');
  const migrationExitNonZero = Boolean(oracleReport.migrationExitNonZero);

  let taskPassedFacts = 0;
  for (const factId of applicableFacts) {
    if (!tableMissing && !failedSet.has(factId)) {
      taskPassedFacts += 1;
    }
  }

  const boundPassedFacts = tableMissing
    ? []
    : boundFacts.filter((f) => !failedSet.has(f));
  const boundFailedFacts = tableMissing
    ? [...boundFacts]
    : boundFacts.filter((f) => failedSet.has(f));
  const boundPassed = tableMissing ? false : boundFailedFacts.length === 0;
  const boundFactFraction = tableMissing
    ? 0
    : boundFacts.length > 0
      ? boundPassedFacts.length / boundFacts.length
      : 1;
  const factPassRate =
    applicableFacts.length > 0 ? taskPassedFacts / applicableFacts.length : 0;

  return {
    taskId: task.id,
    cohortId: task.cohortId,
    table: task.table,
    generationStatus: 'ok',
    features: { ...task.features, ...derivedFlags },
    derivedFlags,
    boundFacts,
    boundPassed,
    boundPassedFacts,
    boundFailedFacts,
    boundFactFraction: Number(boundFactFraction.toFixed(4)),
    tableMissing,
    migrationExitNonZero,
    pass: oracleReport.pass,
    applicableFactCount: applicableFacts.length,
    applicableFacts,
    passedFactCount: taskPassedFacts,
    failedFacts: [...oracleReport.failedFacts],
    factPassRate: Number(factPassRate.toFixed(4)),
    fromCache: Boolean(execResult.fromCache),
    usage: execResult.usage,
    generatedSql: execResult.sql,
    requestedModel: execResult.requestedModel,
    returnedModel: execResult.returnedModel,
    finishReason: execResult.finishReason,
    latencyMs,
  };
}

export async function runCalibrationTask(options: {
  containerName: string;
  task: TaskV2Item;
  configuredModel?: string;
  executorFn?: typeof generateSqlMigration;
  oracleEvalFn?: typeof evaluateMigrationSqlInContainer;
}): Promise<CalibrationTaskReport> {
  const configuredModel = options.configuredModel ?? resolveExecutorModel();
  const executorFn = options.executorFn ?? generateSqlMigration;
  const oracleEvalFn = options.oracleEvalFn ?? evaluateMigrationSqlInContainer;
  const derivedFlags = deriveTaskFlags({
    features: {
      tenant: Boolean(options.task.features.tenant),
      append_only: Boolean(options.task.features.append_only),
      ingestion: Boolean(options.task.features.ingestion),
    },
    prompt: options.task.prompt,
    goldenSql: options.task.goldenSql,
  });

  const callStarted = performance.now();
  const execResult = await executeSqlWithPolicy(
    executorFn,
    options.task.prompt,
    options.task.table,
    options.task.features,
    undefined,
    { temperature: 0, model: configuredModel }
  );
  const latencyMs = Math.round(performance.now() - callStarted);

  const oracleReport =
    execResult.generationStatus === 'ok'
      ? oracleEvalFn(
          options.containerName,
          execResult.sql,
          {
            table: options.task.table,
            tenant: options.task.features.tenant,
            append_only: options.task.features.append_only,
            ingestion: options.task.features.ingestion,
            status: derivedFlags.status,
            sec_definer: derivedFlags.sec_definer,
            latest_per_key: derivedFlags.latest_per_key,
            view: derivedFlags.view,
          },
          `cond_a_${options.task.id}`
        )
      : null;

  return buildCalibrationTaskRecord(options.task, execResult, oracleReport, latencyMs);
}

export async function runConditionACalibration(options: CalibrationOptions = {}) {
  const allowDirty = options.allowDirty ?? process.argv.includes('--allow-dirty');
  assertScopedCleanGitTree({ allowDirty, context: 'calibration' });
  // Allow up to 200 LLM calls in this process for the 40 split tasks, with 180s timeout per call
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = Math.max(
    BUDGET_GUARD.maxTotalLlmCallsPerProcess,
    200
  );
  BUDGET_GUARD.callTimeoutMs = Math.max(BUDGET_GUARD.callTimeoutMs, 180_000);

  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const tasksFile = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')) as TasksFile;
  const targetSplit = options.split ?? 'dev';
  const smoke = options.smoke ?? process.argv.includes('--smoke');
  const splitTasks = targetSplit === 'train' ? tasksFile.train : tasksFile.dev;
  const devTasks = smoke ? splitTasks.slice(0, 3) : splitTasks;
  const checkpointPath = path.resolve(
    targetSplit === 'train' ? 'out/train-calibration.checkpoint.json' : 'out/dev-calibration.checkpoint.json'
  );
  const checkpoint = fs.existsSync(checkpointPath)
    ? (JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as {
        taskReports?: any[];
        totalPromptTokens?: number;
        totalCompletionTokens?: number;
        totalTokens?: number;
      })
    : undefined;

  if (!smoke && devTasks.length !== 40) {
    throw new Error(`Expected 40 ${targetSplit} tasks, got ${devTasks.length}`);
  }

  const containerName = `axiom-cond-a-${targetSplit}-${process.pid}`;
  console.log(
    `Starting persistent postgres:16 container with template_axiom (${containerName})...`
  );
  startPostgresContainer(containerName);

  const factTotals = new Map<
    string,
    { applicable: number; passed: number; failed: number }
  >();
  for (const factId of Object.keys(FACT_STATEMENTS)) {
    factTotals.set(factId, { applicable: 0, passed: 0, failed: 0 });
  }

  const resumedReports = checkpoint?.taskReports ?? [];
  const taskReports: CalibrationTaskReport[] = resumedReports;

  let totalPromptTokens = checkpoint?.totalPromptTokens ?? 0;
  let totalCompletionTokens = checkpoint?.totalCompletionTokens ?? 0;
  let totalTokens = checkpoint?.totalTokens ?? 0;
  for (const report of resumedReports) {
    const failed = new Set(report.failedFacts ?? []);
    for (const factId of report.applicableFacts ?? []) {
      const entry = factTotals.get(factId) ?? { applicable: 0, passed: 0, failed: 0 };
      entry.applicable++;
      if (failed.has(factId)) entry.failed++;
      else entry.passed++;
      factTotals.set(factId, entry);
    }
  }

  const configuredModel = resolveExecutorModel();
  assertModelMatch(configuredModel, configuredModel);

  try {
    for (let i = 0; i < devTasks.length; i++) {
      const task = devTasks[i];
      if (taskReports.some((report) => report.taskId === task.id)) continue;
      const applicableFacts = getCalibrationApplicableFacts(task);
      const boundFacts = task.boundFacts ?? [];

      // Condition A: No Memory, No Hints, temperature = 0, 1 repeat
      const record = await runCalibrationTask({
        containerName,
        task,
        configuredModel,
      });

      if (record.usage) {
        totalPromptTokens += record.usage.promptTokens;
        totalCompletionTokens += record.usage.completionTokens;
        totalTokens += record.usage.totalTokens;
      }

      if (!record.fromCache) {
        // Pace non-cached calls to stay well under NVIDIA NIM 40 RPM
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const {
        boundPassed,
        boundPassedFacts,
        boundFailedFacts,
        boundFactFraction,
        tableMissing,
        passedFactCount: taskPassedFacts,
        factPassRate,
      } = record;
      const failedSet = new Set(record.failedFacts);
      const generationFailed = record.generationStatus !== 'ok';

      for (const factId of applicableFacts) {
        const entry = factTotals.get(factId) ?? {
          applicable: 0,
          passed: 0,
          failed: 0,
        };
        entry.applicable += 1;
        if (generationFailed || tableMissing || failedSet.has(factId)) {
          entry.failed += 1;
        } else {
          entry.passed += 1;
        }
        factTotals.set(factId, entry);
      }

      console.log(
        `[Task ${i + 1}/${devTasks.length} ${task.id}] gen=${record.generationStatus} boundPass=${boundPassed} (${boundPassedFacts.length}/${boundFacts.length} bound) | allPass=${record.pass} (${taskPassedFacts}/${applicableFacts.length} applicable) fromCache=${record.fromCache}`
      );

      console.log(
        `[${i + 1}/${devTasks.length}] ${task.id} (${task.cohortId}, ${task.table}) -> boundPass@1=${boundPassed} (${(boundFactFraction * 100).toFixed(1)}%) | allPass@1=${record.pass} | applicableFacts=${taskPassedFacts}/${applicableFacts.length} (${(factPassRate * 100).toFixed(1)}%) | failed=[${record.failedFacts.join(', ')}]`
      );

      taskReports.push(record);
      fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
      fs.writeFileSync(
        checkpointPath,
        JSON.stringify(
          { split: targetSplit, taskReports, totalPromptTokens, totalCompletionTokens, totalTokens },
          null,
          2
        )
      );
      if (smoke) {
        console.log(
          `[SMOKE ${task.id}] requestedModel=${record.requestedModel} returnedModel=${record.returnedModel} finish_reason=${record.finishReason} promptTokens=${record.usage?.promptTokens ?? 0} completionTokens=${record.usage?.completionTokens ?? 0} latencyMs=${record.latencyMs} boundFactsPassed=${boundPassedFacts.length}/${boundFacts.length} ([${boundPassedFacts.join(', ')}]) boundFactsFailed=${boundFailedFacts.length}/${boundFacts.length} ([${boundFailedFacts.join(', ')}])`
        );
      }
    }

    const boundTasksPassed = taskReports.filter((r) => r.boundPassed).length;
    const secondaryPassAt1OverBoundFacts = boundTasksPassed / devTasks.length;
    const primaryMeanBoundFactFraction =
      taskReports.reduce((s, r) => s + r.boundFactFraction, 0) / devTasks.length;

    const tasksPassed = taskReports.filter((r) => r.pass).length;
    const rawPassAt1 = tasksPassed / devTasks.length;

    const totalApplicableChecks = taskReports.reduce(
      (s, r) => s + r.applicableFactCount,
      0
    );
    const totalPassedChecks = taskReports.reduce(
      (s, r) => s + r.passedFactCount,
      0
    );
    const microFactPassRate =
      totalApplicableChecks > 0 ? totalPassedChecks / totalApplicableChecks : 0;
    const meanTaskFactPassRate =
      taskReports.reduce((s, r) => s + r.factPassRate, 0) / devTasks.length;

    const perFactStats: FactStat[] = [];
    for (const [factId, statement] of Object.entries(FACT_STATEMENTS)) {
      const counts = factTotals.get(factId) ?? {
        applicable: 0,
        passed: 0,
        failed: 0,
      };
      const rate =
        counts.applicable > 0 ? counts.passed / counts.applicable : 0;
      perFactStats.push({
        factId,
        statement,
        applicableCount: counts.applicable,
        passedCount: counts.passed,
        failedCount: counts.failed,
        passRate: Number(rate.toFixed(4)),
        passRatePct: `${(rate * 100).toFixed(1)}%`,
      });
    }

    const provenance = getProviderProvenance(
      configuredModel,
      taskReports[0]?.returnedModel ?? 'unknown'
    );
    const failureCountsByFact = Object.fromEntries(
      perFactStats.map((s) => [s.factId, s.failedCount])
    );

    const nowIso = new Date().toISOString();
    const summary = {
      timestamp: nowIso,
      date: nowIso,
      model: provenance.returnedModel !== 'unknown' ? provenance.returnedModel : configuredModel,
      oracleHash: provenance.oracleCommit,
      oracleScriptSha256: sha256File(path.resolve('scripts', 'oracle.ts')),
      tasksSha256: sha256File(tasksPath),
      taskContentSha256: computeTaskContentSha256(tasksPath),
      condition: 'A (No Memory, No Hints)',
      split:
        targetSplit === 'train'
          ? smoke
            ? 'train smoke (T-001..T-003)'
            : 'train (T-001..T-040)'
          : smoke
            ? 'dev smoke (D-001..D-003)'
            : 'dev (D-001..D-040)',
      temperature: 0,
      repeats: 1,
      devTasksEvaluated: devTasks.length,
      tasksEvaluated: devTasks.length,
      primaryMeanBoundFactFraction: Number(primaryMeanBoundFactFraction.toFixed(4)),
      primaryMeanBoundFactFractionPct: `${(primaryMeanBoundFactFraction * 100).toFixed(1)}%`,
      boundTasksPassedAt1: boundTasksPassed,
      secondaryPassAt1OverBoundFacts: Number(secondaryPassAt1OverBoundFacts.toFixed(4)),
      secondaryPassAt1OverBoundFactsPct: `${(secondaryPassAt1OverBoundFacts * 100).toFixed(1)}%`,
      tasksPassedAt1: tasksPassed,
      rawPassAt1: Number(rawPassAt1.toFixed(4)),
      rawPassAt1Pct: `${(rawPassAt1 * 100).toFixed(1)}%`,
      meanTaskFactPassRate: Number(meanTaskFactPassRate.toFixed(4)),
      meanTaskFactPassRatePct: `${(meanTaskFactPassRate * 100).toFixed(1)}%`,
      microFactPassRate: Number(microFactPassRate.toFixed(4)),
      microFactPassRatePct: `${(microFactPassRate * 100).toFixed(1)}%`,
      tokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
      },
      failureCountsByFact,
      factStats: perFactStats,
      perFactStats,
      taskReports,
      ...provenance,
    };

    fs.mkdirSync(path.resolve('out'), { recursive: true });
    const timestamp = nowIso.replace(/[-:.TZ]/g, '');
    const outputPath =
      options.outputPath ??
      path.resolve(
        `out/condition-a-${targetSplit}-calibration-nvidia-gemma-4-31b-it-${timestamp}.json`
      );
    if (options.outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
    } else {
      const fd = fs.openSync(outputPath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(summary, null, 2), 'utf-8');
      } finally {
        fs.closeSync(fd);
      }
    }
    console.log(`Result file: ${outputPath}`);

    console.log(`\n=== CONDITION A ${targetSplit.toUpperCase()} CALIBRATION SUMMARY ===`);
    console.log(
      JSON.stringify(
        {
          condition: summary.condition,
          split: summary.split,
          provider: summary.provider,
          baseUrl: summary.baseUrl,
          requestedModel: summary.requestedModel,
          returnedModel: summary.returnedModel,
          oracleCommit: summary.oracleCommit,
          factsSha256: summary.factsSha256,
          devTasksEvaluated: summary.devTasksEvaluated,
          primaryMeanBoundFactFraction: summary.primaryMeanBoundFactFraction,
          primaryMeanBoundFactFractionPct: summary.primaryMeanBoundFactFractionPct,
          boundTasksPassedAt1: summary.boundTasksPassedAt1,
          secondaryPassAt1OverBoundFacts: summary.secondaryPassAt1OverBoundFacts,
          secondaryPassAt1OverBoundFactsPct: summary.secondaryPassAt1OverBoundFactsPct,
          tasksPassedAt1: summary.tasksPassedAt1,
          rawPassAt1: summary.rawPassAt1,
          rawPassAt1Pct: summary.rawPassAt1Pct,
          meanTaskFactPassRate: summary.meanTaskFactPassRate,
          meanTaskFactPassRatePct: summary.meanTaskFactPassRatePct,
          microFactPassRate: summary.microFactPassRate,
          microFactPassRatePct: summary.microFactPassRatePct,
          tokenUsage: summary.tokenUsage,
        },
        null,
        2
      )
    );
    return summary;
  } finally {
    stopPostgresContainer(containerName);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('calibrate-condition-a.ts')) {
  runConditionACalibration({ outputPath: path.resolve('out', 'dev-calibration.json') }).catch((err) => {
    console.error('Condition A calibration failed:', err);
    process.exit(1);
  });
}
