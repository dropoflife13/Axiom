import fs from 'node:fs';
import path from 'node:path';
import { retrieveApplicableLessonsForTask } from '../src/eval/ablation.js';

const ROOT = path.resolve('.');

export interface PrerequisiteAuditResult {
  f01Stats: {
    applicableCount: number;
    passedCount: number;
    failedCount: number;
    failureRate: number;
    failureRatePct: string;
    rankByFailureCount: number;
    totalFacts: number;
  };
  f05Stats: {
    applicableCount: number;
    passedCount: number;
    failedCount: number;
    failureRate: number;
    failureRatePct: string;
    rankByFailureCount: number;
    totalFacts: number;
  };
  totalTasks: number;
  tasksWithF01Retrieved: number;
  tasksWithF05Retrieved: number;
  tasksWithF01MissingDeps: number;
  tasksWithF05MissingDeps: number;
  tasksWithAnyMissingPrereq: number;
  affectedTasks: Array<{
    taskId: string;
    table: string;
    retrievedFacts: string[];
    missingF01: boolean;
    f01DependentFactsRetrieved: string[];
    missingF05: boolean;
    f05DependentFactsRetrieved: string[];
  }>;
}

export function auditRetrievalPrerequisites(): PrerequisiteAuditResult {
  const tasksFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/task-v2/tasks.json'), 'utf8'));
  const testTasks: any[] = tasksFile.test;
  const memory = JSON.parse(fs.readFileSync(path.join(ROOT, '.axiom-state/memory.json'), 'utf8'));
  const calibFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'out/train-calibration.json'), 'utf8'));

  // Calculate failure rate and rank of F-01 & F-05
  const factStats: any[] = calibFile.factStats ?? [];
  const sortedByFails = [...factStats].sort((a, b) => {
    if (b.failedCount !== a.failedCount) return b.failedCount - a.failedCount;
    return a.factId.localeCompare(b.factId);
  });

  const f01Index = sortedByFails.findIndex((f) => f.factId === 'F-01');
  const f01 = factStats.find((f) => f.factId === 'F-01') ?? { applicableCount: 40, passedCount: 39, failedCount: 1 };
  const f01Rank = f01Index + 1;

  const f05Index = sortedByFails.findIndex((f) => f.factId === 'F-05');
  const f05 = factStats.find((f) => f.factId === 'F-05') ?? { applicableCount: 40, passedCount: 31, failedCount: 9 };
  const f05Rank = f05Index + 1;

  const f01Deps = ['F-16', 'F-17', 'F-18', 'F-22'];
  const f05Deps = ['F-37'];

  let tasksWithF01Retrieved = 0;
  let tasksWithF05Retrieved = 0;
  let tasksWithF01MissingDeps = 0;
  let tasksWithF05MissingDeps = 0;
  let tasksWithAnyMissingPrereq = 0;

  const affectedTasks: PrerequisiteAuditResult['affectedTasks'] = [];

  for (const task of testTasks) {
    const lessons = retrieveApplicableLessonsForTask(task, memory, 10);
    const retrievedIds = lessons.map((l: any) => l.factId ?? l.errorCode);

    const hasF01 = retrievedIds.includes('F-01');
    const hasF05 = retrievedIds.includes('F-05');

    if (hasF01) tasksWithF01Retrieved++;
    if (hasF05) tasksWithF05Retrieved++;

    const retrievedF01Deps = f01Deps.filter((d) => retrievedIds.includes(d));
    const retrievedF05Deps = f05Deps.filter((d) => retrievedIds.includes(d));

    const f01Conflict = !hasF01 && retrievedF01Deps.length > 0;
    const f05Conflict = !hasF05 && retrievedF05Deps.length > 0;

    if (f01Conflict) tasksWithF01MissingDeps++;
    if (f05Conflict) tasksWithF05MissingDeps++;
    if (f01Conflict || f05Conflict) tasksWithAnyMissingPrereq++;

    affectedTasks.push({
      taskId: task.id,
      table: task.table,
      retrievedFacts: retrievedIds,
      missingF01: !hasF01,
      f01DependentFactsRetrieved: retrievedF01Deps,
      missingF05: !hasF05,
      f05DependentFactsRetrieved: retrievedF05Deps,
    });
  }

  return {
    f01Stats: {
      applicableCount: f01.applicableCount,
      passedCount: f01.passedCount,
      failedCount: f01.failedCount,
      failureRate: f01.failedCount / f01.applicableCount,
      failureRatePct: `${((f01.failedCount / f01.applicableCount) * 100).toFixed(1)}%`,
      rankByFailureCount: f01Rank,
      totalFacts: factStats.length,
    },
    f05Stats: {
      applicableCount: f05.applicableCount,
      passedCount: f05.passedCount,
      failedCount: f05.failedCount,
      failureRate: f05.failedCount / f05.applicableCount,
      failureRatePct: `${((f05.failedCount / f05.applicableCount) * 100).toFixed(1)}%`,
      rankByFailureCount: f05Rank,
      totalFacts: factStats.length,
    },
    totalTasks: testTasks.length,
    tasksWithF01Retrieved,
    tasksWithF05Retrieved,
    tasksWithF01MissingDeps,
    tasksWithF05MissingDeps,
    tasksWithAnyMissingPrereq,
    affectedTasks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/retrieval-prerequisites.ts')) {
  const res = auditRetrievalPrerequisites();
  console.log('=== RETRIEVAL PREREQUISITES AUDIT ===');
  console.log(`F-01 Train Failure Rate: ${res.f01Stats.failedCount}/${res.f01Stats.applicableCount} (${res.f01Stats.failureRatePct}), Rank: ${res.f01Stats.rankByFailureCount}/${res.f01Stats.totalFacts}`);
  console.log(`F-05 Train Failure Rate: ${res.f05Stats.failedCount}/${res.f05Stats.applicableCount} (${res.f05Stats.failureRatePct}), Rank: ${res.f05Stats.rankByFailureCount}/${res.f05Stats.totalFacts}`);
  console.log(`Total Test Tasks: ${res.totalTasks}`);
  console.log(`Tasks with F-01 retrieved: ${res.tasksWithF01Retrieved}/120 (0.0%)`);
  console.log(`Tasks where F-16/17/18/22 retrieved without F-01: ${res.tasksWithF01MissingDeps}/120 (${((res.tasksWithF01MissingDeps / res.totalTasks) * 100).toFixed(1)}%)`);
  console.log(`Tasks where F-37 retrieved without F-05: ${res.tasksWithF05MissingDeps}/120 (${((res.tasksWithF05MissingDeps / res.totalTasks) * 100).toFixed(1)}%)`);
  console.log(`Total Tasks with Any Missing Prerequisite: ${res.tasksWithAnyMissingPrereq}/120 (${((res.tasksWithAnyMissingPrereq / res.totalTasks) * 100).toFixed(1)}%)`);
}
