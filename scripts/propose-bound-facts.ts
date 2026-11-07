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

export type BoundFactRule = 'R1' | 'R2';

export interface CalibrationInput {
  taskContentSha256?: string;
  tasksSha256?: string;
  factStats?: Array<{ factId: string; applicableCount: number; passRate: number }>;
  perFactStats?: Array<{ factId: string; applicableCount: number; passRate: number }>;
  taskReports?: Array<{
    taskId: string;
    failedFacts?: string[];
    tableMissing?: boolean;
  }>;
}

export interface BoundFactRuleOptions {
  rule?: BoundFactRule;
  conditionBCalibration?: CalibrationInput | null;
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

export function candidateFactsForRule(
  calibration: CalibrationInput,
  options: BoundFactRuleOptions = {}
): {
  rule: BoundFactRule;
  candidates: Set<string>;
  discriminatingCandidates: string[];
  floorCandidates: string[];
  satisfiabilityFilterSkipped: boolean;
  unsatisfiableFactsExcluded: string[];
} {
  const rule: BoundFactRule = options.rule ?? 'R1';
  const rows = calibration.factStats ?? calibration.perFactStats ?? [];
  const bRows =
    options.conditionBCalibration?.factStats ??
    options.conditionBCalibration?.perFactStats ??
    null;
  const satisfiabilityFilterSkipped = rule === 'R2' ? bRows === null : false;
  const bZeroPassFacts = new Set<string>();
  if (bRows) {
    for (const row of bRows) {
      if (row.applicableCount > 0 && row.passRate === 0) {
        bZeroPassFacts.add(row.factId);
      }
    }
  }

  const discriminatingCandidates: string[] = [];
  const floorCandidates: string[] = [];
  const unsatisfiableFactsExcluded: string[] = [];
  const candidates = new Set<string>();

  for (const row of rows) {
    if (!Number.isFinite(row.passRate)) continue;
    if (rule === 'R1') {
      if (row.passRate >= 0.1 && row.passRate <= 0.8) {
        candidates.add(row.factId);
        discriminatingCandidates.push(row.factId);
      }
    } else {
      // R2: Condition A Train pass rate <= 0.8 over the tasks that apply it (floor facts included),
      // applicableCount >= 3, and satisfiable when Condition B Train calibration is available.
      if (row.applicableCount >= 3 && row.passRate >= 0 && row.passRate <= 0.8) {
        if (bRows && bZeroPassFacts.has(row.factId)) {
          unsatisfiableFactsExcluded.push(row.factId);
          continue;
        }
        candidates.add(row.factId);
        if (row.passRate >= 0.1) {
          discriminatingCandidates.push(row.factId);
        } else {
          floorCandidates.push(row.factId);
        }
      }
    }
  }

  return {
    rule,
    candidates,
    discriminatingCandidates: discriminatingCandidates.sort(),
    floorCandidates: floorCandidates.sort(),
    satisfiabilityFilterSkipped,
    unsatisfiableFactsExcluded: unsatisfiableFactsExcluded.sort(),
  };
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

export function rescoreSplitWithProposedBoundFacts(
  calibration: CalibrationInput | null | undefined,
  splitTasks: Array<{ id: string }>,
  proposedBoundFacts: Record<string, string[]>
): {
  n: number;
  meanBoundFactFraction: number;
  strictPassAt1: number;
  passedTasks: number;
} | null {
  if (!calibration || !Array.isArray(calibration.taskReports) || calibration.taskReports.length === 0) {
    return null;
  }
  const byId = new Map(calibration.taskReports.map((r) => [r.taskId, r]));
  let totalFraction = 0;
  let passedTasks = 0;
  let count = 0;
  for (const task of splitTasks) {
    const report = byId.get(task.id);
    if (!report) continue;
    const bound = proposedBoundFacts[task.id] ?? [];
    const failedSet = new Set(report.failedFacts ?? []);
    const tableMissing = Boolean(report.tableMissing) || failedSet.has('F-13');
    const failedBound = tableMissing ? bound : bound.filter((f) => failedSet.has(f));
    const fraction =
      tableMissing
        ? 0
        : bound.length === 0
          ? 1
          : (bound.length - failedBound.length) / bound.length;
    totalFraction += fraction;
    if (!tableMissing && failedBound.length === 0) {
      passedTasks += 1;
    }
    count += 1;
  }
  return {
    n: count,
    meanBoundFactFraction: count > 0 ? Number((totalFraction / count).toFixed(4)) : 0,
    strictPassAt1: count > 0 ? Number((passedTasks / count).toFixed(4)) : 0,
    passedTasks,
  };
}

export function buildBoundFactProposal(
  tasksFile: ReturnType<typeof loadTasksFile>,
  calibration: CalibrationInput,
  goldenFailedFactsByTask: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  options: BoundFactRuleOptions = {}
) {
  if (calibration.taskContentSha256 !== undefined) {
    assertTaskContentSha256Matches(
      calibration,
      tasksFile as unknown as Record<string, unknown>,
      'Train calibration'
    );
  }
  const ruleInfo = candidateFactsForRule(calibration, options);
  const candidateSet = ruleInfo.candidates;
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
  const boundFactFrequencyPerSplit: Record<
    string,
    { train: number; dev: number; test: number; total: number }
  > = {};
  for (const factId of [...candidateSet].sort()) {
    boundFactFrequencyPerSplit[factId] = { train: 0, dev: 0, test: 0, total: 0 };
  }

  for (const task of allTasks) {
    const derived = derivedApplicableFacts(task);
    // The committed Oracle applicability rules are the source of the probe set;
    // repaired goldens are required to be non-empty and were validated 200/200.
    const failedByGolden = goldenFailedFactsByTask.get(task.id) ?? new Set<string>();
    const validCandidates = Boolean(task.goldenSql.trim())
      ? derived.filter((id) => !failedByGolden.has(id))
      : [];
    const selected = selectBoundFacts(task.id, validCandidates, candidateSet);
    proposed[task.id] = selected;
    for (const f of selected) {
      if (!boundFactFrequencyPerSplit[f]) {
        boundFactFrequencyPerSplit[f] = { train: 0, dev: 0, test: 0, total: 0 };
      }
      boundFactFrequencyPerSplit[f][task.split] += 1;
      boundFactFrequencyPerSplit[f].total += 1;
    }
    if (JSON.stringify(selected) !== JSON.stringify(task.boundFacts ?? [])) changes[task.split]++;
    if (validCandidates.filter((id) => candidateSet.has(id)).length < 3) {
      fewerThanThreeCandidates.push(task.id);
    }
  }

  const usedFacts = new Set(
    Object.entries(boundFactFrequencyPerSplit)
      .filter(([, counts]) => counts.total > 0)
      .map(([factId]) => factId)
  );

  return {
    rule: ruleInfo.rule,
    proposed,
    discriminatingFacts: [...candidateSet].sort(),
    candidateFacts: [...candidateSet].sort(),
    discriminatingFactsUsed: ruleInfo.discriminatingCandidates.filter((id) => usedFacts.has(id)),
    floorFactsUsed: ruleInfo.floorCandidates.filter((id) => usedFacts.has(id)),
    satisfiabilityFilterSkipped: ruleInfo.satisfiabilityFilterSkipped,
    unsatisfiableFactsExcluded: ruleInfo.unsatisfiableFactsExcluded,
    boundFactFrequencyPerSplit,
    changes,
    factsWithFewerThanThreeTrainTasks: Object.keys(trainCounts)
      .filter((id) => trainCounts[id] < 3)
      .sort(),
    tasksWithFewerThanThreeValidCandidates: fewerThanThreeCandidates.sort(),
  };
}

function parseRuleArg(argv: string[]): BoundFactRule {
  const idx = argv.indexOf('--rule');
  const raw = idx >= 0 && argv[idx + 1] ? argv[idx + 1].trim().toUpperCase() : 'R1';
  if (raw !== 'R1' && raw !== 'R2') {
    throw new Error(`Invalid --rule "${raw}". Expected R1 or R2.`);
  }
  return raw;
}

function main(): void {
  const rule = parseRuleArg(process.argv.slice(2));
  const skipOracle = process.argv.includes('--skip-oracle');
  const calibrationPath = path.resolve('out/train-calibration.json');
  const devCalibrationPath = path.resolve('out/dev-calibration.json');
  const conditionBCalibrationPath = path.resolve('out/train-calibration-B.json');
  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8')) as CalibrationInput;
  const devCalibration = fs.existsSync(devCalibrationPath)
    ? (JSON.parse(fs.readFileSync(devCalibrationPath, 'utf8')) as CalibrationInput)
    : null;
  const conditionBCalibration = fs.existsSync(conditionBCalibrationPath)
    ? (JSON.parse(fs.readFileSync(conditionBCalibrationPath, 'utf8')) as CalibrationInput)
    : null;
  const tasks = loadTasksFile(tasksPath);
  assertTaskContentSha256Matches(calibration, tasksPath, 'Train calibration');

  const goldenFailures = new Map<string, Set<string>>();
  if (!skipOracle) {
    const containerName = `axiom-bound-facts-${process.pid}`;
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
  }
  const result = buildBoundFactProposal(tasks, calibration, goldenFailures, {
    rule,
    conditionBCalibration,
  });
  const rescoredConditionA = {
    train: rescoreSplitWithProposedBoundFacts(calibration, tasks.train, result.proposed),
    dev: rescoreSplitWithProposedBoundFacts(devCalibration, tasks.dev, result.proposed),
  };
  const taskContentSha256 = computeTaskContentSha256(tasksPath);
  const tasksSha256 = sha256File(tasksPath);
  const ruleDir = path.resolve('out/proposed', rule);
  fs.mkdirSync(ruleDir, { recursive: true });

  const proposalPayload = {
    rule,
    tasksSha256,
    taskContentSha256,
    boundFacts: result.proposed,
  };
  const reportPayload = {
    ...result,
    rescoredConditionA,
    provenance: {
      calibrationSha256: sha256File(calibrationPath),
      tasksSha256,
      taskContentSha256,
    },
  };

  fs.writeFileSync(
    path.join(ruleDir, 'bound-facts.proposed.json'),
    JSON.stringify(proposalPayload, null, 2)
  );
  fs.writeFileSync(
    path.join(ruleDir, 'bound-facts-report.json'),
    JSON.stringify(reportPayload, null, 2)
  );

  if (rule === 'R1') {
    fs.writeFileSync(
      path.resolve('out/proposed/bound-facts.proposed.json'),
      JSON.stringify(proposalPayload, null, 2)
    );
    fs.writeFileSync(
      path.resolve('out/proposed/bound-facts-report.json'),
      JSON.stringify(reportPayload, null, 2)
    );
  }
}

if (process.argv[1]?.endsWith('propose-bound-facts.ts')) main();
