import fs from 'node:fs';
import path from 'node:path';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
  MigrationMeta,
  OracleReport,
} from './oracle.js';
import {
  buildReport,
  markdownReport,
  Trial,
  Provenance,
} from './analyze-ablation-v2.js';

const ROOT = path.resolve('.');
const SENSITIVITY_DIR = path.join(ROOT, 'out/sensitivity');

export function stripTopLevelBeginCommit(sql: string): string {
  return sql
    .replace(/^\s*BEGIN(?:\s+TRANSACTION)?\s*;/gim, '-- [S2 STRIPPED] BEGIN;')
    .replace(/^\s*COMMIT(?:\s+TRANSACTION)?\s*;/gim, '-- [S2 STRIPPED] COMMIT;')
    .replace(/^\s*END(?:\s+TRANSACTION)?\s*;/gim, '-- [S2 STRIPPED] END;');
}

export function transformSqlForSemantics(sql: string, semantics: 'S1' | 'S2'): string {
  if (semantics === 'S1') {
    return `\\set ON_ERROR_STOP off\n${sql}`;
  }
  const stripped = stripTopLevelBeginCommit(sql);
  return `\\set ON_ERROR_STOP off\n${stripped}`;
}

export interface RescoreSummary {
  runId: string;
  semantics: 'S1' | 'S2';
  tableMissingByCondition: Record<string, number>;
  migrationExitNonZeroByCondition: Record<string, number>;
  boundPassedByCondition: Record<string, number>;
  rawPassByCondition: Record<string, number>;
  comparisons: Record<
    string,
    {
      meanDifference: number;
      ci95: [number, number];
      signFlipPValue: number;
      holmAdjustedPValue?: number;
    }
  >;
}

export function rescoreRun(
  runId: string,
  semantics: 'S1' | 'S2',
  checkpointPath: string,
  containerName?: string
): { rescoredTrials: Trial[]; summary: RescoreSummary } {
  const cpRaw = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  const trials: Trial[] = Array.isArray(cpRaw) ? cpRaw : cpRaw.trials;
  const provenance: Provenance = Array.isArray(cpRaw)
    ? {}
    : { ...(cpRaw.metadata ?? {}), ...(cpRaw.runMetadata ?? {}), ...(cpRaw.provenance ?? {}) };

  const taskFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/task-v2/tasks.json'), 'utf8'));
  const taskMap = new Map<string, any>();
  for (const t of [...(taskFile.test ?? []), ...(taskFile.train ?? []), ...(taskFile.dev ?? [])]) {
    taskMap.set(t.id, t);
  }

  const rescoredTrials: Trial[] = [];

  const localContainer = containerName ?? `axiom-rescore-${process.pid}-${Date.now()}`;
  const shouldManageContainer = !containerName;

  if (shouldManageContainer) {
    startPostgresContainer(localContainer);
  }

  try {
    for (let i = 0; i < trials.length; i++) {
      const origTrial = trials[i];
      const task = taskMap.get(origTrial.taskId);
      const meta: MigrationMeta = {
        table: task?.table ?? 'pos_transaction_ingests',
        tenant: Boolean(task?.features?.tenant),
        append_only: Boolean(task?.features?.append_only),
        ingestion: Boolean(task?.features?.ingestion),
        status: task?.features?.status,
        view: task?.features?.view,
        sec_definer: task?.features?.sec_definer,
        latest_per_key: task?.features?.latest_per_key,
      };

      // Optimisation: if migrationExitNonZero was false in baseline, no error occurred during migration.
      // Under ON_ERROR_STOP off (S1) and stripping BEGIN/COMMIT (S2), all statements still succeed with 0 errors.
      // The resulting schema and oracle probe outcomes are logically identical.
      if (!origTrial.migrationExitNonZero) {
        rescoredTrials.push({
          ...origTrial,
          // Under no ON_ERROR_STOP, migration exit is zero (false)
          migrationExitNonZero: false,
        });
        continue;
      }

      // If migrationExitNonZero was true in baseline, an error stopped the migration.
      // Re-run under alternative execution semantics S1 or S2 in Docker.
      const transformedSql = transformSqlForSemantics(origTrial.generatedSql ?? '', semantics);
      const testSuffix = `rescore_${semantics}_${origTrial.condition}_${origTrial.taskId}_${i}`;
      const oracle: OracleReport = evaluateMigrationSqlInContainer(
        localContainer,
        transformedSql,
        meta,
        testSuffix
      );

      const failedFacts = oracle.failedFacts;
      const passRaw = failedFacts.length === 0;
      const failedSet = new Set(failedFacts);
      const tableMissing = failedSet.has('F-13');
      const boundFacts = origTrial.boundFacts ?? [];
      const boundPassedCount = tableMissing
        ? 0
        : boundFacts.filter((f) => !failedSet.has(f)).length;
      const boundPassed = tableMissing ? false : boundFacts.every((f) => !failedSet.has(f));
      const boundFactFraction = tableMissing
        ? 0
        : boundFacts.length > 0
          ? Number((boundPassedCount / boundFacts.length).toFixed(4))
          : 1;

      rescoredTrials.push({
        ...origTrial,
        passRaw,
        passWithTier0: passRaw,
        boundPassed,
        boundFactFraction,
        tableMissing,
        migrationExitNonZero: Boolean(oracle.migrationExitNonZero),
        failedFacts,
        postTier0FailedFacts: failedFacts,
      } as Trial);
    }
  } finally {
    if (shouldManageContainer) {
      stopPostgresContainer(localContainer);
    }
  }

  // Count metrics by condition
  const tableMissingByCondition: Record<string, number> = {};
  const migrationExitNonZeroByCondition: Record<string, number> = {};
  const boundPassedByCondition: Record<string, number> = {};
  const rawPassByCondition: Record<string, number> = {};

  for (const t of rescoredTrials) {
    const c = t.condition;
    if (t.tableMissing) tableMissingByCondition[c] = (tableMissingByCondition[c] ?? 0) + 1;
    if (t.migrationExitNonZero) migrationExitNonZeroByCondition[c] = (migrationExitNonZeroByCondition[c] ?? 0) + 1;
    if (t.boundPassed) boundPassedByCondition[c] = (boundPassedByCondition[c] ?? 0) + 1;
    if (t.passRaw) rawPassByCondition[c] = (rawPassByCondition[c] ?? 0) + 1;
  }

  // Run analyzer buildReport
  const memoryPath = path.resolve('.axiom-state/memory.json');
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  const lessons =
    fs.existsSync(memoryPath) && fs.existsSync(factsPath)
      ? {
          memory: JSON.parse(fs.readFileSync(memoryPath, 'utf8')),
          facts: JSON.parse(fs.readFileSync(factsPath, 'utf8')),
        }
      : undefined;

  const report = buildReport(rescoredTrials, provenance, lessons, { runId: `${runId}-${semantics}` });

  // Save rescored checkpoint and analysis
  fs.mkdirSync(SENSITIVITY_DIR, { recursive: true });
  const cpOutPath = path.join(SENSITIVITY_DIR, `${runId}-${semantics}.json`);
  const payloadOut = Array.isArray(cpRaw)
    ? rescoredTrials
    : { ...cpRaw, trials: rescoredTrials };
  fs.writeFileSync(cpOutPath, JSON.stringify(payloadOut, null, 2) + '\n', 'utf8');

  const analysisOutJson = path.join(SENSITIVITY_DIR, `analysis-${runId}-${semantics}.json`);
  const analysisOutMd = path.join(SENSITIVITY_DIR, `analysis-${runId}-${semantics}.md`);
  fs.writeFileSync(analysisOutJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(analysisOutMd, markdownReport(report), 'utf8');

  const comparisons: RescoreSummary['comparisons'] = {};
  for (const key of ['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D', 'B_vs_A']) {
    const comp = report.analysis?.comparisons?.[key];
    if (comp) {
      comparisons[key] = {
        meanDifference: comp.primary.meanDifference,
        ci95: comp.primary.ci95,
        signFlipPValue: comp.primary.signFlipPValue,
        holmAdjustedPValue: comp.primary.holmAdjustedPValue,
      };
    }
  }

  return {
    rescoredTrials,
    summary: {
      runId,
      semantics,
      tableMissingByCondition,
      migrationExitNonZeroByCondition,
      boundPassedByCondition,
      rawPassByCondition,
      comparisons,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/rescore-semantics.ts')) {
  const runs = ['nemotron-2', 'glm5-2', 'nemotron-lightning-full'];
  const containerName = `axiom-rescore-pool-${Date.now()}`;
  console.log(`Starting Postgres container ${containerName}...`);
  startPostgresContainer(containerName);

  const summaries: RescoreSummary[] = [];

  try {
    for (const runId of runs) {
      const cpPath = path.resolve('.axiom-state/runs', runId, 'checkpoint.json');
      if (!fs.existsSync(cpPath)) {
        console.warn(`Checkpoint not found for ${runId} at ${cpPath}`);
        continue;
      }
      for (const semantics of ['S1', 'S2'] as const) {
        console.log(`Rescoring ${runId} under ${semantics}...`);
        const { summary } = rescoreRun(runId, semantics, cpPath, containerName);
        summaries.push(summary);
        console.log(`Finished ${runId} ${semantics}`);
      }
    }
  } finally {
    console.log(`Stopping Postgres container ${containerName}...`);
    stopPostgresContainer(containerName);
  }

  fs.writeFileSync(
    path.join(SENSITIVITY_DIR, 'summary.json'),
    JSON.stringify(summaries, null, 2) + '\n',
    'utf8'
  );
  console.log(`Wrote all sensitivity results to ${SENSITIVITY_DIR}`);
}
