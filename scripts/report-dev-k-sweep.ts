import fs from 'node:fs';
import path from 'node:path';
import { retrieveLessonsByFeatures, type FeatureFlags, type Lesson } from '../src/memory.js';
import { derivedApplicableFacts, loadTasksFile } from './calibration-common.js';
import { FACTS } from './facts.js';
import { deriveTaskFlags } from './propose-task-repair.js';
import type { BoundFactRule, CalibrationInput } from './propose-bound-facts.js';

export const SYNTHETIC_K_VALUES = [6, 8, 10, 12, 15, 20] as const;

export function syntheticKSweep(): Array<{ k: number; retrieved: number; ids: string[] }> {
  const features: FeatureFlags = { tenant: true, append_only: false, ingestion: false };
  const memory: Lesson[] = Array.from({ length: 20 }, (_, index) => ({
    errorCode: `F-${String(index + 1).padStart(2, '0')}`,
    factId: `F-${String(index + 1).padStart(2, '0')}`,
    lesson: `synthetic-${index + 1}`,
    trainFailureRate: (20 - index) / 20,
    utilityScore: 1,
    features,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  return SYNTHETIC_K_VALUES.map((k) => {
    const selected = retrieveLessonsByFeatures(features, memory, k, undefined, true);
    return { k, retrieved: selected.length, ids: selected.map((lesson) => lesson.factId ?? lesson.errorCode) };
  });
}

export function extractTrainFailureRateMap(calibration: CalibrationInput): Map<string, number> {
  const rows = calibration.factStats ?? calibration.perFactStats ?? [];
  const map = new Map<string, number>();
  for (const row of rows) {
    const failRate = row.applicableCount > 0 && Number.isFinite(row.passRate) ? 1 - row.passRate : 0;
    map.set(row.factId, failRate);
  }
  return map;
}

export function rankApplicableFactsByTrainFailureRate(
  applicableFacts: readonly string[],
  trainFailureRates: ReadonlyMap<string, number>
): string[] {
  return [...applicableFacts].sort((a, b) => {
    const rateA = trainFailureRates.get(a) ?? 0;
    const rateB = trainFailureRates.get(b) ?? 0;
    if (Math.abs(rateB - rateA) > 1e-12) return rateB - rateA;
    return a.localeCompare(b);
  });
}

export function hypergeometricFullCoverageProb(
  applicableCount: number,
  boundCount: number,
  k: number
): number {
  if (boundCount <= 0) return 1;
  const draw = Math.min(k, applicableCount);
  if (draw < boundCount || applicableCount <= 0) return 0;
  let prob = 1;
  for (let i = 0; i < boundCount; i++) {
    prob *= (draw - i) / (applicableCount - i);
  }
  return prob;
}

export interface DevKSweepRow {
  k: number;
  meanRetrievableBoundFactFraction: number;
  fullCoverageFraction: number;
  fullCoverageCount: number;
  totalTasks: number;
  randomDrawRetrievableFraction: number;
  randomDrawFullCoverageFraction: number;
}

export function computeDevKSweepForRule(
  devTasks: Array<{
    id: string;
    split: 'train' | 'dev' | 'test';
    features: { tenant: boolean; append_only: boolean; ingestion: boolean };
    prompt: string;
    goldenSql: string;
  }>,
  proposedBoundFacts: Record<string, string[]>,
  calibration: CalibrationInput,
  kValues: readonly number[] = SYNTHETIC_K_VALUES
): DevKSweepRow[] {
  for (const t of devTasks) {
    if (t.split !== 'dev') {
      throw new Error(`Dev K-sweep must only run on dev split; got task ${t.id} from split "${t.split}".`);
    }
  }
  const failureRates = extractTrainFailureRateMap(calibration);
  const n = devTasks.length;

  return kValues.map((k) => {
    let sumRetrievableFraction = 0;
    let fullCoverageCount = 0;
    let sumRandomRetrievable = 0;
    let sumRandomFullCoverage = 0;

    for (const task of devTasks) {
      const applicable = derivedApplicableFacts(task);
      const ranked = rankApplicableFactsByTrainFailureRate(applicable, failureRates);
      const topKSet = new Set(ranked.slice(0, k));
      const bound = proposedBoundFacts[task.id] ?? [];

      const retrievedBoundCount = bound.filter((f) => topKSet.has(f)).length;
      const frac = bound.length > 0 ? retrievedBoundCount / bound.length : 1;
      sumRetrievableFraction += frac;
      if (bound.every((f) => topKSet.has(f))) {
        fullCoverageCount += 1;
      }

      const randFrac = applicable.length > 0 ? Math.min(1, k / applicable.length) : 1;
      sumRandomRetrievable += randFrac;
      sumRandomFullCoverage += hypergeometricFullCoverageProb(applicable.length, bound.length, k);
    }

    return {
      k,
      meanRetrievableBoundFactFraction: n > 0 ? Number((sumRetrievableFraction / n).toFixed(4)) : 0,
      fullCoverageFraction: n > 0 ? Number((fullCoverageCount / n).toFixed(4)) : 0,
      fullCoverageCount,
      totalTasks: n,
      randomDrawRetrievableFraction: n > 0 ? Number((sumRandomRetrievable / n).toFixed(4)) : 0,
      randomDrawFullCoverageFraction: n > 0 ? Number((sumRandomFullCoverage / n).toFixed(4)) : 0,
    };
  });
}

export function computeDiagnosticsItems3To5() {
  const tasks = loadTasksFile();
  const activeFactIds = FACTS.filter(
    (f) => f.status === 'CONFIRMED' || f.status === 'OWNER-ADOPTED'
  )
    .map((f) => f.id)
    .sort();
  const allFactIds = FACTS.map((f) => f.id).sort();

  const coveragePerSplit: Record<
    string,
    {
      withApplicable: Array<{ factId: string; count: number }>;
      activeWithNone: string[];
      inactiveWithNone: string[];
    }
  > = {};

  for (const sp of ['train', 'dev', 'test'] as const) {
    const counts: Record<string, number> = Object.fromEntries(
      allFactIds.map((id) => [id, 0])
    );
    for (const t of tasks[sp]) {
      for (const f of derivedApplicableFacts(t)) {
        counts[f] = (counts[f] ?? 0) + 1;
      }
    }
    coveragePerSplit[sp] = {
      withApplicable: allFactIds
        .filter((id) => counts[id] > 0)
        .map((factId) => ({ factId, count: counts[factId] })),
      activeWithNone: activeFactIds.filter((id) => counts[id] === 0),
      inactiveWithNone: allFactIds.filter((id) => !activeFactIds.includes(id)),
    };
  }

  const statusMatchesWithStatusFalse: Array<{
    taskId: string;
    split: string;
    token: string;
    context: string;
  }> = [];
  const statusCountsBySplit = { train: 0, dev: 0, test: 0 };

  for (const sp of ['train', 'dev', 'test'] as const) {
    for (const t of tasks[sp]) {
      const flags = deriveTaskFlags({
        features: {
          tenant: Boolean(t.features.tenant),
          append_only: Boolean(t.features.append_only),
          ingestion: Boolean(t.features.ingestion),
        },
        prompt: t.prompt,
        goldenSql: t.goldenSql,
      });
      const m = /status|state|decision/i.exec(t.prompt);
      if (m && !flags.status) {
        statusCountsBySplit[sp] += 1;
        const idx = m.index;
        const token = m[0];
        const start = Math.max(0, idx - 15);
        const end = Math.min(t.prompt.length, idx + token.length + 15);
        statusMatchesWithStatusFalse.push({
          taskId: t.id,
          split: sp,
          token,
          context: t.prompt.slice(start, end),
        });
      }
    }
  }

  const trCal = JSON.parse(
    fs.readFileSync(path.resolve('out/train-calibration.json'), 'utf8')
  ) as {
    perFactStats: Array<{
      factId: string;
      applicableCount: number;
      passedCount: number;
      failedCount: number;
      passRate: number;
    }>;
  };
  const statMap = new Map(trCal.perFactStats.map((s) => [s.factId, s]));
  const trainApplicableActive = activeFactIds.filter(
    (id) => (statMap.get(id)?.applicableCount ?? 0) > 0
  );

  const projections = {
    atLeast1Failure: {
      distilled: trainApplicableActive.filter((id) => (statMap.get(id)?.failedCount ?? 0) >= 1),
      verbatim: trainApplicableActive.filter((id) => (statMap.get(id)?.failedCount ?? 0) === 0),
    },
    passRateLe080: {
      distilled: trainApplicableActive.filter((id) => (statMap.get(id)?.passRate ?? 1) <= 0.8),
      verbatim: trainApplicableActive.filter((id) => (statMap.get(id)?.passRate ?? 1) > 0.8),
    },
    atLeast2Failures: {
      distilled: trainApplicableActive.filter((id) => (statMap.get(id)?.failedCount ?? 0) >= 2),
      verbatim: trainApplicableActive.filter((id) => (statMap.get(id)?.failedCount ?? 0) < 2),
    },
  };

  return {
    coveragePerSplit,
    statusDetectorCheck: {
      totalCount: statusMatchesWithStatusFalse.length,
      countsBySplit: statusCountsBySplit,
      first15: statusMatchesWithStatusFalse.slice(0, 15),
    },
    projections,
  };
}

function main(): void {
  const tasks = loadTasksFile();
  const calibration = JSON.parse(
    fs.readFileSync(path.resolve('out/train-calibration.json'), 'utf8')
  ) as CalibrationInput;
  const rules: BoundFactRule[] = ['R1', 'R2'];
  const report: Record<string, DevKSweepRow[]> = {};

  for (const rule of rules) {
    const proposalPath = path.resolve('out/proposed', rule, 'bound-facts.proposed.json');
    if (!fs.existsSync(proposalPath)) continue;
    const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8')) as {
      boundFacts: Record<string, string[]>;
    };
    report[rule] = computeDevKSweepForRule(tasks.dev, proposal.boundFacts, calibration);
  }

  fs.mkdirSync(path.resolve('out/proposed'), { recursive: true });
  fs.writeFileSync(
    path.resolve('out/proposed/dev-k-sweep.json'),
    JSON.stringify(report, null, 2)
  );
  const diag = computeDiagnosticsItems3To5();
  fs.writeFileSync(
    path.resolve('out/proposed/diagnostics-items-3-to-5.json'),
    JSON.stringify(diag, null, 2)
  );
  console.log(JSON.stringify({ kSweep: report, diag }, null, 2));
}

if (process.argv[1]?.endsWith('report-dev-k-sweep.ts')) {
  main();
}
