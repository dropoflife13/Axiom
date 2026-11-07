import fs from 'node:fs';
import path from 'node:path';
import {
  assertTaskContentSha256Matches,
  computeTaskContentSha256,
} from './calibration-common.js';
import type { DerivedTaskFlags } from './propose-task-repair.js';

export interface DevCalibrationTaskReport {
  taskId: string;
  failedFacts: string[];
  applicableFacts?: string[];
  derivedFlags?: DerivedTaskFlags;
  tableMissing?: boolean;
  generationStatus?: 'ok' | 'empty' | 'length' | 'other';
}

export function rescoreDevBaseline(
  calibration: {
    taskContentSha256?: string;
    tasksSha256?: string;
    taskReports?: DevCalibrationTaskReport[];
  },
  tasks: {
    train?: Array<Record<string, unknown>>;
    dev: Array<{ id: string; boundFacts: string[]; [key: string]: unknown }>;
    test?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }
) {
  if (calibration.taskContentSha256 !== undefined) {
    assertTaskContentSha256Matches(
      calibration,
      tasks as unknown as Record<string, unknown>,
      'Dev calibration'
    );
  }
  const reports = new Map((calibration.taskReports ?? []).map((r) => [r.taskId, r]));
  const rows = tasks.dev.map((task) => {
    const report = reports.get(task.id);
    const failed = new Set(report?.failedFacts ?? []);
    const generationFailed = Boolean(
      report?.generationStatus && report.generationStatus !== 'ok'
    );
    const tableMissing = Boolean(report?.tableMissing || failed.has('F-13'));
    const zeroScore = generationFailed || tableMissing;
    const passed = zeroScore
      ? 0
      : task.boundFacts.filter((fact) => !failed.has(fact)).length;
    const boundFailedFacts = zeroScore
      ? [...task.boundFacts]
      : task.boundFacts.filter((fact) => failed.has(fact));
    const fraction = zeroScore
      ? 0
      : task.boundFacts.length
        ? passed / task.boundFacts.length
        : 1;
    const strict = zeroScore ? false : passed === task.boundFacts.length;
    return {
      taskId: task.id,
      generationStatus: report?.generationStatus ?? 'ok',
      fraction,
      strict,
      passedBoundFacts: passed,
      totalBoundFacts: task.boundFacts.length,
      boundFailedFacts,
      tableMissing,
      derivedFlags: report?.derivedFlags,
    };
  });
  return {
    n: rows.length,
    meanBoundFactFraction:
      rows.reduce((sum, row) => sum + row.fraction, 0) / Math.max(1, rows.length),
    strictPassAt1:
      rows.filter((row) => row.strict).length / Math.max(1, rows.length),
    rows,
  };
}

function main(): void {
  const calibrationPath = path.resolve('out/dev-calibration.json');
  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  assertTaskContentSha256Matches(calibration, tasks, 'Dev calibration');
  const result = rescoreDevBaseline(calibration, tasks);
  fs.writeFileSync(
    path.resolve('out/dev-baseline-rescored.json'),
    JSON.stringify(
      {
        ...result,
        taskContentSha256: computeTaskContentSha256(tasks),
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.endsWith('rescore-dev-baseline.ts')) main();
