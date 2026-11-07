import fs from 'node:fs';
import path from 'node:path';
import {
  assertTaskContentSha256Matches,
  computeTaskContentSha256,
  derivedApplicableFacts,
  loadTasksFile,
  sha256File,
  stableTaskSeed,
} from './calibration-common.js';
import {
  evaluateMigrationSqlInContainer,
  startPostgresContainer,
  stopPostgresContainer,
} from './oracle.js';

export interface CalibrationInput {
  taskContentSha256?: string;
  tasksSha256?: string;
  factStats?: Array<{ factId: string; applicableCount: number; passRate: number }>;
  perFactStats?: Array<{ factId: string; applicableCount: number; passRate: number }>;
}

export function discriminatingFacts(calibration: CalibrationInput): Set<string> {
  const rows = calibration.factStats ?? calibration.perFactStats ?? [];
  return new Set(
    rows
      .filter(
        (row) =>
          Number.isFinite(row.passRate) &&
          row.passRate >= 0.1 &&
          row.passRate <= 0.8
      )
      .map((row) => row.factId)
  );
}

export function selectBoundFacts(
  taskId: string,
  applicableFacts: readonly string[],
  discriminating: ReadonlySet<string>
): string[] {
  const candidates = applicableFacts.filter((id) => discriminating.has(id)).sort();
  if (candidates.length <= 5) return candidates;
  const count = 3 + (stableTaskSeed(taskId) % 3);
  const start = stableTaskSeed(taskId) % candidates.length;
  return Array.from({ length: count }, (_, i) => candidates[(start + i) % candidates.length]).sort();
}

export function buildBoundFactProposal(
  tasksFile: ReturnType<typeof loadTasksFile>,
  calibration: CalibrationInput,
  goldenFailedFactsByTask: ReadonlyMap<string, ReadonlySet<string>> = new Map()
) {
  if (calibration.taskContentSha256 !== undefined) {
    assertTaskContentSha256Matches(
      calibration,
      tasksFile as unknown as Record<string, unknown>,
      'Train calibration'
    );
  }
  const discriminating = discriminatingFacts(calibration);
  const allTasks = [...tasksFile.train, ...tasksFile.dev, ...tasksFile.test];
  const proposed: Record<string, string[]> = {};
  const changes = { train: 0, dev: 0, test: 0 };
  const fewerThanThreeCandidates: string[] = [];
  const trainCounts: Record<string, number> = {};
  for (const task of tasksFile.train) {
    for (const factId of derivedApplicableFacts(task)) {
      trainCounts[factId] = (trainCounts[factId] ?? 0) + 1;
    }
  }
  for (const task of allTasks) {
    const derived = derivedApplicableFacts(task);
    // The committed Oracle applicability rules are the source of the probe set;
    // repaired goldens are required to be non-empty and were validated 200/200.
    const failedByGolden = goldenFailedFactsByTask.get(task.id) ?? new Set<string>();
    const validCandidates = Boolean(task.goldenSql.trim())
      ? derived.filter((id) => !failedByGolden.has(id))
      : [];
    const selected = selectBoundFacts(task.id, validCandidates, discriminating);
    proposed[task.id] = selected;
    if (JSON.stringify(selected) !== JSON.stringify(task.boundFacts ?? [])) changes[task.split]++;
    if (validCandidates.filter((id) => discriminating.has(id)).length < 3) {
      fewerThanThreeCandidates.push(task.id);
    }
  }
  return {
    proposed,
    discriminatingFacts: [...discriminating].sort(),
    changes,
    factsWithFewerThanThreeTrainTasks: Object.keys(trainCounts)
      .filter((id) => trainCounts[id] < 3)
      .sort(),
    tasksWithFewerThanThreeValidCandidates: fewerThanThreeCandidates.sort(),
  };
}

function main(): void {
  const calibrationPath = path.resolve('out/train-calibration.json');
  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8')) as CalibrationInput;
  const tasks = loadTasksFile(tasksPath);
  assertTaskContentSha256Matches(calibration, tasksPath, 'Train calibration');

  const containerName = `axiom-bound-facts-${process.pid}`;
  const goldenFailures = new Map<string, Set<string>>();
  startPostgresContainer(containerName);
  try {
    for (const task of [...tasks.train, ...tasks.dev, ...tasks.test]) {
      const flags = {
        table: task.table,
        ...task.features,
        ...Object.fromEntries(
          ['status', 'view', 'sec_definer', 'latest_per_key'].map((flag) => [
            flag,
            derivedApplicableFacts(task).includes(
              flag === 'status'
                ? 'F-12'
                : flag === 'view'
                  ? 'F-39'
                  : flag === 'sec_definer'
                    ? 'F-31'
                    : 'F-38'
            ),
          ])
        ),
      };
      const report = evaluateMigrationSqlInContainer(
        containerName,
        task.goldenSql,
        flags,
        `golden_bound_${task.id}`
      );
      goldenFailures.set(task.id, new Set(report.failedFacts));
    }
  } finally {
    stopPostgresContainer(containerName);
  }
  const result = buildBoundFactProposal(tasks, calibration, goldenFailures);
  const taskContentSha256 = computeTaskContentSha256(tasksPath);
  const tasksSha256 = sha256File(tasksPath);
  fs.mkdirSync(path.resolve('out/proposed'), { recursive: true });
  fs.writeFileSync(
    path.resolve('out/proposed/bound-facts.proposed.json'),
    JSON.stringify(
      { tasksSha256, taskContentSha256, boundFacts: result.proposed },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.resolve('out/proposed/bound-facts-report.json'),
    JSON.stringify(
      {
        ...result,
        provenance: {
          calibrationSha256: sha256File(calibrationPath),
          tasksSha256,
          taskContentSha256,
        },
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.endsWith('propose-bound-facts.ts')) main();
