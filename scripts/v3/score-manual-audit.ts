import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  FORENSIC_FLAG_METADATA,
  SQL_FORENSIC_FLAG_NAMES,
  type SqlForensicFlagName,
} from '../../src/verifier/sql-forensics.js';

export interface ManualAuditSampleRow {
  sampleIndex: number;
  runId: string;
  taskId: string;
  condition: string;
  sqlSha256: string;
  sqlPreview: string;
  triggeredForensicFlags: Set<SqlForensicFlagName>;
}

export interface RaterAuditRow {
  sampleIndex: number;
  taskId: string;
  condition: string;
  sqlSha256: string;
  ratedAt: string;
  triggeredForensicFlags: Set<SqlForensicFlagName>;
}

export interface ConfusionMatrix2x2 {
  tp: number; // both positive (a)
  fp: number; // raterB (or classifier) positive, raterA negative (b)
  fn: number; // raterA positive, raterB (or classifier) negative (c)
  tn: number; // both negative (d)
  n: number;
}

export interface CohensKappaResult {
  kappa: number;
  se: number;
  ci95: [number, number];
  percentAgreement: number;
  expectedAgreement: number;
  prevalenceIndex: number;
  biasIndex: number;
  pabak: number; // Prevalence-Adjusted Bias-Adjusted Kappa (2 * p_o - 1)
  precision: number | null;
  recall: number | null;
  f1: number | null;
  confusion: ConfusionMatrix2x2;
}

export interface ManualAuditKappaReport {
  generatedAt: string;
  sampleCount: number;
  rater1RatedCount: number;
  rater2RatedCount: number;
  rater1VsClassifier: {
    overallMicro: CohensKappaResult;
    byFlag: Record<SqlForensicFlagName, CohensKappaResult>;
  } | null;
  rater1VsRater2: {
    overallMicro: CohensKappaResult;
    byFlag: Record<SqlForensicFlagName, CohensKappaResult>;
  } | null;
}

/**
 * Computes exact Cohen's kappa, Fleiss (1969) asymptotic standard error, 95% CI,
 * percent agreement, prevalence/bias indices, PABAK, and classification metrics
 * treating `reference` (e.g., Rater 1) as ground truth and `comparison` (e.g., classifier or Rater 2) as prediction.
 */
export function computeCohensKappa(
  reference: readonly boolean[],
  comparison: readonly boolean[]
): CohensKappaResult {
  if (reference.length !== comparison.length) {
    throw new Error(
      `Length mismatch in computeCohensKappa: reference=${reference.length}, comparison=${comparison.length}`
    );
  }
  const n = reference.length;
  if (n === 0) {
    return {
      kappa: 0,
      se: 0,
      ci95: [0, 0],
      percentAgreement: 0,
      expectedAgreement: 0,
      prevalenceIndex: 0,
      biasIndex: 0,
      pabak: 0,
      precision: null,
      recall: null,
      f1: null,
      confusion: { tp: 0, fp: 0, fn: 0, tn: 0, n: 0 },
    };
  }

  let tp = 0; // a: ref=true, comp=true
  let fp = 0; // b: ref=false, comp=true
  let fn = 0; // c: ref=true, comp=false
  let tn = 0; // d: ref=false, comp=false

  for (let i = 0; i < n; i++) {
    const r = Boolean(reference[i]);
    const c = Boolean(comparison[i]);
    if (r && c) tp++;
    else if (!r && c) fp++;
    else if (r && !c) fn++;
    else tn++;
  }

  const po = (tp + tn) / n;
  const pRefPos = (tp + fn) / n;
  const pRefNeg = (fp + tn) / n;
  const pCompPos = (tp + fp) / n;
  const pCompNeg = (fn + tn) / n;
  const pe = pRefPos * pCompPos + pRefNeg * pCompNeg;

  let kappa: number;
  let se: number;

  if (Math.abs(1 - pe) < 1e-12) {
    // Degenerate single-category marginal distribution
    kappa = Math.abs(1 - po) < 1e-12 ? 1.0 : 0.0;
    se = 0.0;
  } else {
    kappa = (po - pe) / (1 - pe);

    // Fleiss, Cohen, & Everitt (1969) large-sample variance of Cohen's kappa
    const p11 = tp / n;
    const p00 = tn / n;
    const p10 = fn / n;
    const p01 = fp / n;

    const termA =
      p11 * (1 - (pRefPos + pCompPos) * (1 - kappa)) ** 2 +
      p00 * (1 - (pRefNeg + pCompNeg) * (1 - kappa)) ** 2;
    const termB =
      (1 - kappa) ** 2 *
      (p10 * (pCompPos + pRefNeg) ** 2 + p01 * (pRefPos + pCompNeg) ** 2);
    const termC = (kappa - pe * (1 - kappa)) ** 2;
    const variance = Math.max(0, termA + termB - termC) / (n * (1 - pe) ** 2);
    se = Math.sqrt(variance);
  }

  const ci95: [number, number] = [
    Math.max(-1, kappa - 1.96 * se),
    Math.min(1, kappa + 1.96 * se),
  ];

  const prevalenceIndex = Math.abs(tp - tn) / n;
  const biasIndex = Math.abs(fp - fn) / n;
  const pabak = 2 * po - 1;

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  return {
    kappa,
    se,
    ci95,
    percentAgreement: po,
    expectedAgreement: pe,
    prevalenceIndex,
    biasIndex,
    pabak,
    precision,
    recall,
    f1,
    confusion: { tp, fp, fn, tn, n },
  };
}

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function csvEscape(val: string): string {
  if (/[",\r\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function loadManualAuditSampleCsv(csvPath: string): ManualAuditSampleRow[] {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  const header = parseCsvLine(lines[0]);
  const idxMap = new Map(header.map((h, i) => [h, i]));

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const get = (name: string) => cols[idxMap.get(name) ?? -1] ?? '';
    const flagsRaw = get('triggeredForensicFlags')
      .split(';')
      .map((s) => s.trim())
      .filter((s): s is SqlForensicFlagName =>
        (SQL_FORENSIC_FLAG_NAMES as readonly string[]).includes(s)
      );
    return {
      sampleIndex: Number(get('sampleIndex')),
      runId: get('runId'),
      taskId: get('taskId'),
      condition: get('condition'),
      sqlSha256: get('sqlSha256'),
      sqlPreview: get('sqlPreview'),
      triggeredForensicFlags: new Set(flagsRaw),
    };
  });
}

export function loadRaterAuditCsv(csvPath: string): Map<number, RaterAuditRow> {
  const map = new Map<number, RaterAuditRow>();
  if (!fs.existsSync(csvPath)) return map;
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 1) return map;
  const header = parseCsvLine(lines[0]);
  const idxMap = new Map(header.map((h, i) => [h, i]));

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const get = (name: string) => cols[idxMap.get(name) ?? -1] ?? '';
    const sampleIndex = Number(get('sampleIndex'));
    if (!Number.isFinite(sampleIndex) || sampleIndex <= 0) continue;

    const flags = new Set<SqlForensicFlagName>();
    const semicolonFlags = get('triggeredForensicFlags')
      .split(';')
      .map((s) => s.trim())
      .filter((s): s is SqlForensicFlagName =>
        (SQL_FORENSIC_FLAG_NAMES as readonly string[]).includes(s)
      );
    for (const f of semicolonFlags) flags.add(f);

    for (const flagName of SQL_FORENSIC_FLAG_NAMES) {
      const colVal = get(flagName).toLowerCase();
      if (colVal === '1' || colVal === 'true' || colVal === 'y' || colVal === 'yes') {
        flags.add(flagName);
      }
    }

    map.set(sampleIndex, {
      sampleIndex,
      taskId: get('taskId'),
      condition: get('condition'),
      sqlSha256: get('sqlSha256'),
      ratedAt: get('ratedAt'),
      triggeredForensicFlags: flags,
    });
  }
  return map;
}

export function saveRaterAuditCsv(csvPath: string, rows: Iterable<RaterAuditRow>): void {
  const sorted = [...rows].sort((a, b) => a.sampleIndex - b.sampleIndex);
  const header = [
    'sampleIndex',
    'taskId',
    'condition',
    'sqlSha256',
    'ratedAt',
    'triggeredForensicFlags',
    ...SQL_FORENSIC_FLAG_NAMES,
  ].join(',');

  const lines = sorted.map((r) => {
    const flagList = SQL_FORENSIC_FLAG_NAMES.filter((f) => r.triggeredForensicFlags.has(f));
    return [
      String(r.sampleIndex),
      csvEscape(r.taskId),
      csvEscape(r.condition),
      csvEscape(r.sqlSha256),
      csvEscape(r.ratedAt),
      csvEscape(flagList.join(';')),
      ...SQL_FORENSIC_FLAG_NAMES.map((f) => (r.triggeredForensicFlags.has(f) ? '1' : '0')),
    ].join(',');
  });

  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, `${header}\n${lines.join('\n')}\n`, 'utf8');
}

export function evaluatePairwiseFlagKappa(
  samples: readonly ManualAuditSampleRow[],
  referenceByIndex: ReadonlyMap<number, ReadonlySet<SqlForensicFlagName>>,
  comparisonByIndex: ReadonlyMap<number, ReadonlySet<SqlForensicFlagName>>
): {
  overallMicro: CohensKappaResult;
  byFlag: Record<SqlForensicFlagName, CohensKappaResult>;
} | null {
  const sharedSamples = samples.filter(
    (s) => referenceByIndex.has(s.sampleIndex) && comparisonByIndex.has(s.sampleIndex)
  );
  if (sharedSamples.length === 0) return null;

  const microRef: boolean[] = [];
  const microComp: boolean[] = [];
  const byFlag = {} as Record<SqlForensicFlagName, CohensKappaResult>;

  for (const flag of SQL_FORENSIC_FLAG_NAMES) {
    const refVec: boolean[] = [];
    const compVec: boolean[] = [];
    for (const s of sharedSamples) {
      const r = referenceByIndex.get(s.sampleIndex)!.has(flag);
      const c = comparisonByIndex.get(s.sampleIndex)!.has(flag);
      refVec.push(r);
      compVec.push(c);
      microRef.push(r);
      microComp.push(c);
    }
    byFlag[flag] = computeCohensKappa(refVec, compVec);
  }

  return {
    overallMicro: computeCohensKappa(microRef, microComp),
    byFlag,
  };
}

export function evaluateManualAuditKappa(
  sampleCsvPath: string,
  rater1CsvPath: string,
  rater2CsvPath?: string
): ManualAuditKappaReport {
  const samples = loadManualAuditSampleCsv(sampleCsvPath);
  const rater1Map = loadRaterAuditCsv(rater1CsvPath);
  const rater2Map = rater2CsvPath ? loadRaterAuditCsv(rater2CsvPath) : new Map<number, RaterAuditRow>();

  const classifierByIndex = new Map<number, Set<SqlForensicFlagName>>(
    samples.map((s) => [s.sampleIndex, s.triggeredForensicFlags])
  );
  const rater1FlagsByIndex = new Map<number, Set<SqlForensicFlagName>>(
    [...rater1Map.entries()].map(([k, v]) => [k, v.triggeredForensicFlags])
  );
  const rater2FlagsByIndex = new Map<number, Set<SqlForensicFlagName>>(
    [...rater2Map.entries()].map(([k, v]) => [k, v.triggeredForensicFlags])
  );

  const rater1VsClassifier = evaluatePairwiseFlagKappa(
    samples,
    rater1FlagsByIndex,
    classifierByIndex
  );
  const rater1VsRater2 =
    rater2FlagsByIndex.size > 0
      ? evaluatePairwiseFlagKappa(samples, rater1FlagsByIndex, rater2FlagsByIndex)
      : null;

  return {
    generatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    rater1RatedCount: rater1Map.size,
    rater2RatedCount: rater2Map.size,
    rater1VsClassifier,
    rater1VsRater2,
  };
}

function lookupFullSqlFromCheckpoint(
  root: string,
  row: ManualAuditSampleRow
): string {
  const cpPath = path.join(root, '.axiom-state', 'runs-v3', row.runId, 'checkpoint.json');
  if (!fs.existsSync(cpPath)) return row.sqlPreview;
  try {
    const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8')) as {
      trials?: Array<{
        taskId: string;
        condition: string;
        sanitizedSql?: string;
        generatedSql?: string;
      }>;
    };
    const match = (cp.trials ?? []).find(
      (t) => t.taskId === row.taskId && t.condition === row.condition
    );
    return match?.sanitizedSql ?? match?.generatedSql ?? row.sqlPreview;
  } catch {
    return row.sqlPreview;
  }
}

export function parseNumberedFlagSelection(
  input: string
): { action: 'quit' } | { action: 'invalid'; message: string } | { action: 'select'; flags: Set<SqlForensicFlagName> } {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'q' || trimmed === 'quit') {
    return { action: 'quit' };
  }
  if (trimmed === '' || trimmed === '0' || trimmed === 'none' || trimmed === 'n') {
    return { action: 'select', flags: new Set<SqlForensicFlagName>() };
  }
  const tokens = trimmed
    .split(/[,\s;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const chosen = new Set<SqlForensicFlagName>();
  for (const tok of tokens) {
    if (tok === '0') continue;
    const num = Number(tok);
    if (!Number.isInteger(num) || num < 1 || num > SQL_FORENSIC_FLAG_NAMES.length) {
      return {
        action: 'invalid',
        message: `Invalid flag number "${tok}". Enter numbers 1..${SQL_FORENSIC_FLAG_NAMES.length} separated by commas, 0 for none, or q to quit.`,
      };
    }
    chosen.add(SQL_FORENSIC_FLAG_NAMES[num - 1]);
  }
  return { action: 'select', flags: chosen };
}

async function runInteractiveRaterCli(root: string, raterName: string): Promise<void> {
  const sampleCsvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
  if (!fs.existsSync(sampleCsvPath)) {
    throw new Error(`Sample CSV not found at ${sampleCsvPath}`);
  }
  const raterCsvPath = path.join(root, 'out', 'v3', `manual-audit-${raterName}.csv`);
  const samples = loadManualAuditSampleCsv(sampleCsvPath);
  const existing = loadRaterAuditCsv(raterCsvPath);

  const unrated = samples.filter((s) => !existing.has(s.sampleIndex));
  console.log(
    `[Blind Manual Audit CLI] Rater: "${raterName}" | Total samples: ${samples.length} | Already rated: ${existing.size} | Remaining: ${unrated.length}`
  );
  console.log(
    'Note: sql-forensics.ts predictions and PostgreSQL 16 Oracle verdicts are strictly hidden to prevent anchoring bias.'
  );
  if (unrated.length === 0) {
    console.log(`All ${samples.length} rows are already rated in ${raterCsvPath}.`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim().toLowerCase())));

  try {
    for (const row of unrated) {
      const fullSql = lookupFullSqlFromCheckpoint(root, row).replace(/\r\n?/g, '\n');
      console.log('\n' + '='.repeat(88));
      console.log(
        `Sample #${row.sampleIndex}/${samples.length} | Task: ${row.taskId} | Condition: ${row.condition} | SQL SHA: ${row.sqlSha256}`
      );
      console.log('-'.repeat(88));
      console.log(fullSql);
      console.log('-'.repeat(88));
      console.log('Forensic Flags:');
      SQL_FORENSIC_FLAG_NAMES.forEach((flag, idx) => {
        const desc = FORENSIC_FLAG_METADATA[flag]?.description ?? flag;
        console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${flag} — ${desc}`);
      });
      console.log('-'.repeat(88));

      let chosenFlags: Set<SqlForensicFlagName> | null = null;
      while (chosenFlags === null) {
        const ans = await ask(
          'Enter defect numbers separated by commas (e.g. "3" or "2,12"), [0] for none, or [q] to quit: '
        );
        const parsed = parseNumberedFlagSelection(ans);
        if (parsed.action === 'quit') {
          console.log(`Saved progress (${existing.size}/${samples.length}) to ${raterCsvPath}.`);
          return;
        }
        if (parsed.action === 'invalid') {
          console.log(parsed.message);
          continue;
        }
        chosenFlags = parsed.flags;
      }

      existing.set(row.sampleIndex, {
        sampleIndex: row.sampleIndex,
        taskId: row.taskId,
        condition: row.condition,
        sqlSha256: row.sqlSha256,
        ratedAt: new Date().toISOString(),
        triggeredForensicFlags: chosenFlags,
      });
      saveRaterAuditCsv(raterCsvPath, existing.values());
      console.log(
        `Saved sample #${row.sampleIndex} (${existing.size}/${samples.length}) -> [${[...chosenFlags].join('; ') || 'none'}]`
      );
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = path.resolve('.');
  const raterIdx = args.indexOf('--rater');
  const computeKappa = args.includes('--compute-kappa');

  if (raterIdx >= 0 && args[raterIdx + 1]) {
    const raterName = args[raterIdx + 1].replace(/[^a-zA-Z0-9_-]/g, '');
    await runInteractiveRaterCli(root, raterName);
    return;
  }

  if (computeKappa) {
    const sampleCsvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
    const rater1CsvPath = path.join(root, 'out', 'v3', 'manual-audit-rater1.csv');
    const rater2CsvPath = path.join(root, 'out', 'v3', 'manual-audit-rater2.csv');
    const outPath = path.join(root, 'out', 'v3', 'manual-audit-kappa.json');

    const report = evaluateManualAuditKappa(sampleCsvPath, rater1CsvPath, rater2CsvPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(
      `Wrote ${outPath} (sampleCount=${report.sampleCount}, rater1Rated=${report.rater1RatedCount}, rater2Rated=${report.rater2RatedCount})`
    );
    return;
  }

  console.error(
    'Usage:\n  npx tsx scripts/v3/score-manual-audit.ts --rater <name>\n  npx tsx scripts/v3/score-manual-audit.ts --compute-kappa'
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '');
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
