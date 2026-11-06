// scripts/rescore-condition-a.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
} from './oracle.js';
import { FACT_STATEMENTS, getApplicableFacts } from './facts.js';

interface TaskFeatures {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
  status?: boolean;
  latest_per_key?: boolean;
}

interface TaskItem {
  id: string;
  split: string;
  cohortId: string;
  table: string;
  prompt: string;
  features: TaskFeatures;
  boundFacts?: string[];
  applicableFacts?: string[];
}

interface CachedReport {
  taskId: string;
  cohortId: string;
  table: string;
  features: TaskFeatures;
  generatedSql: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function loadDiscriminatingFacts(): Set<string> {
  const reportPath = path.resolve('out/condition-a-dev-rescored.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    perFactStats?: Array<{ factId: string; passRate: number }>;
  };

  if (!report.perFactStats) {
    throw new Error('Missing perFactStats in ' + reportPath + '; run the initial rescore first.');
  }

  return new Set(
    report.perFactStats
      .filter(({ passRate }) => passRate >= 0.1 && passRate <= 0.8)
      .map(({ factId }) => factId)
  );
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(1103515245, s) + 12345) >>> 0;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectBoundFactsForTask(
  taskId: string,
  applicableFacts: string[],
  discriminatingFacts: ReadonlySet<string>
): string[] {
  const seed = hashString(taskId);
  const discriminating = applicableFacts.filter((f) => discriminatingFacts.has(f));
  const nonDiscriminating = applicableFacts.filter((f) => !discriminatingFacts.has(f));

  const shuffledDisc = seededShuffle(discriminating, seed);
  const shuffledNonDisc = seededShuffle(nonDiscriminating, seed ^ 0xabcdef);

  // Target 4 bound facts on average: 3 to 4 discriminating + at most 1 non-discriminating
  const targetTotal = (seed % 3) + 3; // 3, 4, or 5 bound facts (always <= 5)
  const numNonDisc = shuffledNonDisc.length > 0 && targetTotal > 3 ? 1 : 0;
  const numDisc = Math.min(targetTotal - numNonDisc, shuffledDisc.length);

  const bound = [
    ...shuffledDisc.slice(0, numDisc),
    ...shuffledNonDisc.slice(0, numNonDisc),
  ];

  // If discriminating alone didn't reach 3, backfill from nonDiscriminating
  if (bound.length < 3 && shuffledNonDisc.length > numNonDisc) {
    const needed = Math.min(3 - bound.length, shuffledNonDisc.length - numNonDisc);
    bound.push(...shuffledNonDisc.slice(numNonDisc, numNonDisc + needed));
  }

  return bound.sort();
}

function bootstrapConfidenceInterval(
  values: number[],
  numResamples = 10000,
  confidenceLevel = 0.95
): { mean: number; ciLower: number; ciUpper: number } {
  const n = values.length;
  const originalMean = values.reduce((s, v) => s + v, 0) / n;
  const sampleMeans: number[] = [];

  let seed = 42;
  const rng = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let b = 0; b < numResamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += values[idx];
    }
    sampleMeans.push(sum / n);
  }

  sampleMeans.sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * numResamples);
  const upperIdx = Math.floor((1 - alpha / 2) * numResamples);

  return {
    mean: Number(originalMean.toFixed(4)),
    ciLower: Number(sampleMeans[lowerIdx].toFixed(4)),
    ciUpper: Number(sampleMeans[upperIdx].toFixed(4)),
  };
}

async function runRescore() {
  const tasksFile = JSON.parse(
    fs.readFileSync(path.resolve('fixtures/task-v2/tasks.json'), 'utf-8')
  );
  const devTasks: TaskItem[] = tasksFile.dev;

  const cachedData = JSON.parse(
    fs.readFileSync(path.resolve('out/condition-a-dev-calibration.json'), 'utf-8')
  );
  const cachedReports: CachedReport[] = cachedData.taskReports;
  const discriminatingFacts = loadDiscriminatingFacts();

  const cachedMap = new Map<string, CachedReport>();
  for (const r of cachedReports) {
    cachedMap.set(r.taskId, r);
  }

  const containerName = `axiom-cond-a-rescore-${process.pid}`;
  console.log(`Starting persistent postgres:16 container (${containerName})...`);
  startPostgresContainer(containerName);

  const factTotals = new Map<
    string,
    { applicable: number; passed: number; failed: number }
  >();
  for (const factId of Object.keys(FACT_STATEMENTS)) {
    factTotals.set(factId, { applicable: 0, passed: 0, failed: 0 });
  }

  const rescoredTasks: Array<{
    taskId: string;
    cohortId: string;
    table: string;
    features: TaskFeatures;
    boundFacts: string[];
    boundPassed: boolean;
    boundFraction: number;
    boundPassedCount: number;
    boundTotalCount: number;
    failedFacts: string[];
    applicableFactCount: number;
    passedApplicableCount: number;
    applicableFactPassRate: number;
  }> = [];

  const boundFractions: number[] = [];
  let tasksPassedAt1Count = 0;

  try {
    for (let i = 0; i < devTasks.length; i++) {
      const task = devTasks[i];
      const cached = cachedMap.get(task.id);
      if (!cached || !cached.generatedSql) {
        throw new Error(`Missing cached generatedSql for task ${task.id}`);
      }

      const hasStatus = /status|state|decision/i.test(task.prompt);
      const applicableFacts = getApplicableFacts({
        tenant: task.features.tenant,
        append_only: task.features.append_only,
        ingestion: task.features.ingestion,
        status: hasStatus,
      });

      const boundFacts = selectBoundFactsForTask(
        task.id,
        applicableFacts,
        discriminatingFacts
      );

      const oracleReport = evaluateMigrationSqlInContainer(
        containerName,
        cached.generatedSql,
        {
          table: task.table,
          tenant: task.features.tenant,
          append_only: task.features.append_only,
          ingestion: task.features.ingestion,
        },
        `rescore_${task.id}`
      );

      const failedSet = new Set(oracleReport.failedFacts);

      // Bound facts scoring
      let boundPassedCount = 0;
      for (const bf of boundFacts) {
        if (!failedSet.has(bf)) {
          boundPassedCount++;
        }
      }
      const boundPassed = boundPassedCount === boundFacts.length;
      if (boundPassed) {
        tasksPassedAt1Count++;
      }
      const boundFraction = boundPassedCount / boundFacts.length;
      boundFractions.push(boundFraction);

      // Applicable facts tracking
      let passedApplicableCount = 0;
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
          passedApplicableCount += 1;
        }
        factTotals.set(factId, entry);
      }

      rescoredTasks.push({
        taskId: task.id,
        cohortId: task.cohortId,
        table: task.table,
        features: task.features,
        boundFacts,
        boundPassed,
        boundFraction: Number(boundFraction.toFixed(4)),
        boundPassedCount,
        boundTotalCount: boundFacts.length,
        failedFacts: oracleReport.failedFacts,
        applicableFactCount: applicableFacts.length,
        passedApplicableCount,
        applicableFactPassRate: Number(
          (passedApplicableCount / applicableFacts.length).toFixed(4)
        ),
      });

      console.log(
        `[${i + 1}/40] ${task.id} (${task.cohortId}) -> bound=${boundPassedCount}/${boundFacts.length} (${(boundFraction * 100).toFixed(1)}%) | pass@1=${boundPassed} | bound=[${boundFacts.join(', ')}] | failed=[${oracleReport.failedFacts.join(', ')}]`
      );
    }

    const bootstrapResult = bootstrapConfidenceInterval(boundFractions);
    const passAt1Rate = tasksPassedAt1Count / devTasks.length;

    const totalBoundChecks = rescoredTasks.reduce(
      (s, r) => s + r.boundTotalCount,
      0
    );
    const totalBoundPassed = rescoredTasks.reduce(
      (s, r) => s + r.boundPassedCount,
      0
    );
    const microBoundPassRate = totalBoundPassed / totalBoundChecks;

    const perFactStats: Array<{
      factId: string;
      statement: string;
      applicableCount: number;
      passedCount: number;
      failedCount: number;
      passRate: number;
      passRatePct: string;
      isDiscriminating: boolean;
      statusBand: 'IN_BAND (10%-80%)' | 'CEILING (>80%)' | 'FLOOR (<10%)';
    }> = [];

    for (const [factId, statement] of Object.entries(FACT_STATEMENTS)) {
      const counts = factTotals.get(factId) ?? {
        applicable: 0,
        passed: 0,
        failed: 0,
      };
      if (counts.applicable === 0) continue;
      const rate = counts.passed / counts.applicable;
      let statusBand: 'IN_BAND (10%-80%)' | 'CEILING (>80%)' | 'FLOOR (<10%)' =
        'IN_BAND (10%-80%)';
      if (rate > 0.8) {
        statusBand = 'CEILING (>80%)';
      } else if (rate < 0.1) {
        statusBand = 'FLOOR (<10%)';
      }

      perFactStats.push({
        factId,
        statement,
        applicableCount: counts.applicable,
        passedCount: counts.passed,
        failedCount: counts.failed,
        passRate: Number(rate.toFixed(4)),
        passRatePct: `${(rate * 100).toFixed(1)}%`,
        isDiscriminating: discriminatingFacts.has(factId),
        statusBand,
      });
    }

    const report = {
      timestamp: new Date().toISOString(),
      condition: 'A (No Memory, No Hints)',
      split: 'dev (D-001..D-040)',
      totalDevTasks: devTasks.length,
      scoring: {
        primaryMetric: 'mean fraction of bound facts passed',
        meanBoundFactPassRate: bootstrapResult.mean,
        meanBoundFactPassRatePct: `${(bootstrapResult.mean * 100).toFixed(1)}%`,
        bootstrap95CI: [bootstrapResult.ciLower, bootstrapResult.ciUpper],
        bootstrap95CIPct: [
          `${(bootstrapResult.ciLower * 100).toFixed(1)}%`,
          `${(bootstrapResult.ciUpper * 100).toFixed(1)}%`,
        ],
        secondaryMetric: 'pass@1 (all bound facts passed)',
        passAt1Count: tasksPassedAt1Count,
        passAt1Rate: Number(passAt1Rate.toFixed(4)),
        passAt1RatePct: `${(passAt1Rate * 100).toFixed(1)}%`,
        microBoundPassRate: Number(microBoundPassRate.toFixed(4)),
        microBoundPassRatePct: `${(microBoundPassRate * 100).toFixed(1)}%`,
        maxBoundFactsPerTask: Math.max(...rescoredTasks.map((t) => t.boundTotalCount)),
        minBoundFactsPerTask: Math.min(...rescoredTasks.map((t) => t.boundTotalCount)),
        retrievalCapacityK: 6,
        capacityRatio: `${6} >= ${Math.max(...rescoredTasks.map((t) => t.boundTotalCount))} (100% capacity headroom)`,
      },
      perFactStats,
      rescoredTasks,
    };

    fs.writeFileSync(
      path.resolve('out/condition-a-dev-rescored.json'),
      JSON.stringify(report, null, 2),
      'utf-8'
    );

    console.log('\n================ RESCORING COMPLETE ================');
    console.log(
      JSON.stringify(
        {
          primaryMetric_meanBoundPassRate: report.scoring.meanBoundFactPassRatePct,
          bootstrap95CI: report.scoring.bootstrap95CIPct,
          secondaryMetric_passAt1: report.scoring.passAt1RatePct,
          passAt1Tasks: `${report.scoring.passAt1Count}/${devTasks.length}`,
          microBoundPassRate: report.scoring.microBoundPassRatePct,
          boundFactsRange: `${report.scoring.minBoundFactsPerTask}-${report.scoring.maxBoundFactsPerTask}`,
          retrievalK: report.scoring.retrievalCapacityK,
        },
        null,
        2
      )
    );
  } finally {
    stopPostgresContainer(containerName);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('rescore-condition-a.ts')) {
  runRescore().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
