import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  FORENSIC_FLAG_METADATA,
  SQL_FORENSIC_FLAG_NAMES,
  classifySqlForensics,
  type ForensicExecutionClass,
  type ForensicTaskContext,
  type SqlForensicFlagName,
} from '../../src/verifier/sql-forensics.js';
import type { TaskV2Item } from '../../src/eval/ablation.js';
import type { TrialV3 } from '../../src/eval/ablation-v3.js';

interface TrialWithRun {
  runId: string;
  trial: TrialV3;
  context: ForensicTaskContext;
}

export interface FlagValidityMetrics {
  flag: SqlForensicFlagName;
  executionClass: ForensicExecutionClass;
  description: string;
  evaluatedTrials: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isFlagApplicableAndGroundTruth(
  flag: SqlForensicFlagName,
  trial: TrialV3,
  ctx: ForensicTaskContext
): { applicable: boolean; oraclePositive: boolean } {
  const failed = new Set(trial.failedFacts ?? []);
  const bound = new Set(trial.boundFacts ?? []);
  const crashed = Boolean(trial.migrationExitNonZero || trial.tableMissing);

  switch (flag) {
    case 'hasInlineSupersedesFk':
      return {
        applicable: ctx.features.append_only,
        oraclePositive: failed.has('F-16') || crashed,
      };
    case 'hasExplicitSupersedesFk':
      return {
        applicable: ctx.features.append_only && bound.has('F-16'),
        oraclePositive: !failed.has('F-16') && !crashed,
      };
    case 'hasDuplicatePrimaryKey':
      return { applicable: true, oraclePositive: crashed };
    case 'hasPublicAuthJwt':
      return { applicable: ctx.features.tenant, oraclePositive: crashed };
    case 'hasPublicConstraintQualifier':
      return { applicable: true, oraclePositive: crashed };
    case 'omittedSupersedesId':
      return {
        applicable: ctx.features.append_only,
        oraclePositive: failed.has('F-16') || failed.has('F-36') || failed.has('F-20'),
      };
    case 'inventedLineageCol':
      return {
        applicable: ctx.features.append_only,
        oraclePositive: failed.has('F-16') || failed.has('F-20') || crashed,
      };
    case 'hasHallucinatedLineageCol':
      return {
        applicable: ctx.features.append_only,
        oraclePositive: failed.has('F-16') || failed.has('F-20'),
      };
    case 'hasUserMetadataLeak':
      return {
        applicable: ctx.features.tenant,
        oraclePositive: failed.has('F-17') || failed.has('F-18'),
      };
    case 'hasSingularCompositeIndexName':
      return {
        applicable: ctx.features.append_only,
        oraclePositive: failed.has('F-19'),
      };
    case 'hasRevokeWithoutPositiveGrant':
      return {
        applicable: true,
        oraclePositive: failed.has('F-11') || failed.has('F-12') || failed.has('F-23'),
      };
    case 'missingCreatedAtColumn':
      return {
        applicable: bound.has('F-05'),
        oraclePositive: failed.has('F-05'),
      };
    case 'missingDeletedAtOnMutable':
      return {
        applicable: !ctx.features.append_only && bound.has('F-10'),
        oraclePositive: failed.has('F-10'),
      };
  }
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function runForensicValidityAudit(root = path.resolve('.')) {
  const tasksPath = path.join(root, 'fixtures', 'task-v3', 'tasks.json');
  const taskMap = new Map<string, TaskV2Item>();
  if (fs.existsSync(tasksPath)) {
    const rawTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    const list: TaskV2Item[] = Array.isArray(rawTasks)
      ? rawTasks
      : [...(rawTasks.train ?? []), ...(rawTasks.dev ?? []), ...(rawTasks.test ?? []), ...(rawTasks.tasks ?? [])];
    for (const t of list) taskMap.set(t.id, t);
  }

  const runsDir = path.join(root, '.axiom-state', 'runs-v3');
  const collected: TrialWithRun[] = [];
  if (fs.existsSync(runsDir)) {
    const runDirs = fs
      .readdirSync(runsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const runId of runDirs) {
      const cpPath = path.join(runsDir, runId, 'checkpoint.json');
      if (!fs.existsSync(cpPath)) continue;
      const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8')) as { trials?: TrialV3[] };
      for (const trial of cp.trials ?? []) {
        const task = taskMap.get(trial.taskId);
        const features =
          (trial as TrialV3 & { features?: TaskV2Item['features'] }).features ??
          task?.features ?? { tenant: false, append_only: false, ingestion: false };
        collected.push({
          runId,
          trial,
          context: { table: task?.table ?? '', features },
        });
      }
    }
  }

  const flagMetrics: FlagValidityMetrics[] = SQL_FORENSIC_FLAG_NAMES.map((flag) => {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    let evaluatedTrials = 0;

    for (const item of collected) {
      const { applicable, oraclePositive } = isFlagApplicableAndGroundTruth(
        flag,
        item.trial,
        item.context
      );
      if (!applicable) continue;
      evaluatedTrials++;
      const sql = item.trial.sanitizedSql ?? item.trial.generatedSql ?? '';
      const flags = classifySqlForensics(sql, item.context);
      const predicted = Boolean(flags[flag]);
      if (predicted && oraclePositive) tp++;
      else if (predicted && !oraclePositive) fp++;
      else if (!predicted && oraclePositive) fn++;
      else tn++;
    }

    const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : null;
    const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : null;
    const f1 =
      precision !== null && recall !== null && precision + recall > 0
        ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4))
        : null;

    return {
      flag,
      executionClass: FORENSIC_FLAG_METADATA[flag].executionClass,
      description: FORENSIC_FLAG_METADATA[flag].description,
      evaluatedTrials,
      tp,
      fp,
      tn,
      fn,
      precision,
      recall,
      f1,
    };
  });

  // Evaluate static fixtures/task-v2/bad-*.sql and good-*.sql
  const fixtureDir = path.join(root, 'fixtures', 'task-v2');
  const fixtureChecks: Array<{
    file: string;
    expectedClass: 'bad' | 'good';
    triggeredFlags: SqlForensicFlagName[];
  }> = [];
  if (fs.existsSync(fixtureDir)) {
    const sqlFiles = fs
      .readdirSync(fixtureDir)
      .filter((f) => /^(bad|good)-.*\.sql$/i.test(f))
      .sort();
    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(fixtureDir, file), 'utf8');
      const expectedClass = file.toLowerCase().startsWith('bad-') ? 'bad' : 'good';
      const ctx: ForensicTaskContext = {
        table: '',
        features: { tenant: true, append_only: true, ingestion: true },
      };
      const flags = classifySqlForensics(sql, ctx);
      const triggeredFlags = SQL_FORENSIC_FLAG_NAMES.filter((name) => flags[name]);
      fixtureChecks.push({ file, expectedClass, triggeredFlags });
    }
  }

  // Stratified 100-trial manual audit sample
  const strataBuckets = {
    crashed: [] as TrialWithRun[],
    failedLineageOrIndex: [] as TrialWithRun[],
    failedOther: [] as TrialWithRun[],
    passed: [] as TrialWithRun[],
  };
  for (const item of collected) {
    const t = item.trial;
    const failed = new Set(t.failedFacts ?? []);
    if (t.migrationExitNonZero || t.tableMissing) {
      strataBuckets.crashed.push(item);
    } else if (failed.has('F-16') || failed.has('F-19') || failed.has('F-36')) {
      strataBuckets.failedLineageOrIndex.push(item);
    } else if (!t.boundPassed) {
      strataBuckets.failedOther.push(item);
    } else {
      strataBuckets.passed.push(item);
    }
  }

  const rand = mulberry32(20260101);
  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const sampled: TrialWithRun[] = [];
  const quotas = [
    { key: 'crashed' as const, target: 25 },
    { key: 'failedLineageOrIndex' as const, target: 25 },
    { key: 'failedOther' as const, target: 25 },
    { key: 'passed' as const, target: 25 },
  ];
  const used = new Set<string>();
  for (const q of quotas) {
    const pool = shuffle(strataBuckets[q.key]);
    for (const item of pool.slice(0, q.target)) {
      const id = `${item.runId}::${item.trial.taskId}::${item.trial.condition}`;
      if (!used.has(id)) {
        used.add(id);
        sampled.push(item);
      }
    }
  }
  if (sampled.length < 100) {
    const remainder = shuffle(collected).filter(
      (item) => !used.has(`${item.runId}::${item.trial.taskId}::${item.trial.condition}`)
    );
    for (const item of remainder) {
      if (sampled.length >= 100) break;
      used.add(`${item.runId}::${item.trial.taskId}::${item.trial.condition}`);
      sampled.push(item);
    }
  }

  const csvHeader = [
    'sampleIndex',
    'runId',
    'taskId',
    'condition',
    'boundPassed',
    'boundFactFraction',
    'migrationExitNonZero',
    'tableMissing',
    'failedFacts',
    'triggeredForensicFlags',
    'sqlSha256',
    'sqlPreview',
  ].join(',');
  const csvRows = sampled.map((item, idx) => {
    const sql = item.trial.sanitizedSql ?? item.trial.generatedSql ?? '';
    const flags = classifySqlForensics(sql, item.context);
    const triggered = SQL_FORENSIC_FLAG_NAMES.filter((name) => flags[name]);
    const sqlSha = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 12);
    const preview = sql.replace(/\s+/g, ' ').trim().slice(0, 180);
    return [
      String(idx + 1),
      csvEscape(item.runId),
      csvEscape(item.trial.taskId),
      csvEscape(item.trial.condition),
      String(Boolean(item.trial.boundPassed)),
      String(item.trial.boundFactFraction ?? 0),
      String(Boolean(item.trial.migrationExitNonZero)),
      String(Boolean(item.trial.tableMissing)),
      csvEscape((item.trial.failedFacts ?? []).join(';')),
      csvEscape(triggered.join(';')),
      sqlSha,
      csvEscape(preview),
    ].join(',');
  });

  return {
    report: {
      generatedAt: new Date().toISOString(),
      totalTrialsEvaluated: collected.length,
      runsIncluded: [...new Set(collected.map((c) => c.runId))].sort(),
      flagMetrics,
      fixtureChecks,
      manualAuditSampleCount: sampled.length,
    },
    csv: `${csvHeader}\n${csvRows.join('\n')}\n`,
  };
}

function main() {
  const root = path.resolve('.');
  const { report, csv } = runForensicValidityAudit(root);
  const jsonPath = path.join(root, 'out', 'v3', 'forensic-validity.json');
  const csvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvPath, csv, 'utf8');
  console.log(
    `Wrote ${jsonPath} (${report.totalTrialsEvaluated} trials across ${report.runsIncluded.length} runs) and ${csvPath} (${report.manualAuditSampleCount} rows)`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '');
if (isMain) {
  main();
}
