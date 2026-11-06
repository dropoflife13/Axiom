// scripts/calibrate-condition-a.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
} from './oracle.js';
import { FACT_STATEMENTS, getApplicableFacts } from './facts.js';
import { generateSqlMigration } from '../src/executor.js';
import { BUDGET_GUARD } from '../src/guardrails.js';
import { FeatureFlags } from '../src/memory.js';
import { TaskV2Item } from '../src/eval/ablation.js';

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

async function runConditionACalibration() {
  // Allow up to 200 LLM calls in this process for the 40 Dev tasks, with 60s timeout per call
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = Math.max(
    BUDGET_GUARD.maxTotalLlmCallsPerProcess,
    200
  );
  BUDGET_GUARD.callTimeoutMs = Math.max(BUDGET_GUARD.callTimeoutMs, 60_000);

  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const tasksFile = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')) as TasksFile;
  const devTasks = tasksFile.dev;

  if (devTasks.length !== 40) {
    throw new Error(`Expected 40 Dev tasks, got ${devTasks.length}`);
  }

  const containerName = `axiom-cond-a-dev-${process.pid}`;
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

  const taskReports: Array<{
    taskId: string;
    cohortId: string;
    table: string;
    features: FeatureFlags;
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
  }> = [];

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;

  try {
    for (let i = 0; i < devTasks.length; i++) {
      const task = devTasks[i];
      const applicableFacts = getApplicableFacts(task.features);

      // Condition A: No Memory, No Hints, temperature = 0, 1 repeat
      const execResult = await generateSqlMigration(
        task.prompt,
        task.table,
        task.features,
        undefined,
        { temperature: 0 }
      );

      if (execResult.usage) {
        totalPromptTokens += execResult.usage.promptTokens;
        totalCompletionTokens += execResult.usage.completionTokens;
        totalTokens += execResult.usage.totalTokens;
      }

      if (!execResult.fromCache) {
        // Pace non-cached calls by 12s to stay well within Groq's RPM/TPM limits
        await new Promise((resolve) => setTimeout(resolve, 12000));
      }

      const oracleReport = evaluateMigrationSqlInContainer(
        containerName,
        execResult.sql,
        {
          table: task.table,
          tenant: task.features.tenant,
          append_only: task.features.append_only,
          ingestion: task.features.ingestion,
        },
        `cond_a_${task.id}`
      );

      const failedSet = new Set(oracleReport.failedFacts);
      let taskPassedFacts = 0;

      for (const factId of applicableFacts) {
        const entry = factTotals.get(factId) ?? {
          applicable: 0,
          passed: 0,
          failed: 0,
        };
        entry.applicable += 1;
        if (failedSet.has(factId)) {
          entry.failed += 1;
        } else {
          entry.passed += 1;
          taskPassedFacts += 1;
        }
        factTotals.set(factId, entry);
      }

      const factPassRate =
        applicableFacts.length > 0
          ? taskPassedFacts / applicableFacts.length
          : 0;

      console.log(
        `[${i + 1}/40] ${task.id} (${task.cohortId}, ${task.table}) -> pass@1=${oracleReport.pass} | facts=${taskPassedFacts}/${applicableFacts.length} (${(factPassRate * 100).toFixed(1)}%) | failed=[${oracleReport.failedFacts.join(', ')}]`
      );

      taskReports.push({
        taskId: task.id,
        cohortId: task.cohortId,
        table: task.table,
        features: task.features,
        pass: oracleReport.pass,
        applicableFactCount: applicableFacts.length,
        passedFactCount: taskPassedFacts,
        failedFacts: oracleReport.failedFacts,
        factPassRate: Number(factPassRate.toFixed(4)),
        fromCache: Boolean(execResult.fromCache),
        usage: execResult.usage,
        generatedSql: execResult.sql,
      });
    }

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

    const summary = {
      timestamp: new Date().toISOString(),
      condition: 'A (No Memory, No Hints)',
      split: 'dev (D-001..D-040)',
      temperature: 0,
      repeats: 1,
      devTasksEvaluated: devTasks.length,
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
      perFactStats,
      taskReports,
    };

    fs.mkdirSync(path.resolve('out'), { recursive: true });
    fs.writeFileSync(
      path.resolve('out/condition-a-dev-calibration.json'),
      JSON.stringify(summary, null, 2),
      'utf-8'
    );

    console.log('\n=== CONDITION A DEV CALIBRATION SUMMARY ===');
    console.log(
      JSON.stringify(
        {
          condition: summary.condition,
          devTasksEvaluated: summary.devTasksEvaluated,
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
  } finally {
    stopPostgresContainer(containerName);
  }
}

runConditionACalibration().catch((err) => {
  console.error('Condition A calibration failed:', err);
  process.exit(1);
});

