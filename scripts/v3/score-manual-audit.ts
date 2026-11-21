import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import dotenv from 'dotenv';
import {
  FORENSIC_FLAG_METADATA,
  SQL_FORENSIC_FLAG_NAMES,
  type SqlForensicFlagName,
} from '../../src/verifier/sql-forensics.js';

dotenv.config();

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

export interface PairwiseFlagKappaSummary {
  ratedSampleCount: number;
  overallMicro: CohensKappaResult;
  byFlag: Record<SqlForensicFlagName, CohensKappaResult>;
}

export interface ManualAuditKappaReport {
  generatedAt: string;
  auditMode: 'llm-assisted-with-human-spot-check';
  llmModel: string | null;
  sampleCount: number;
  llmRatedCount: number;
  humanRatedCount: number;
  llmVsClassifier: PairwiseFlagKappaSummary | null;
  humanVsClassifier: PairwiseFlagKappaSummary | null;
  humanVsLlm: PairwiseFlagKappaSummary | null;
  // Back-compat aliases mirroring llm/human fields
  rater1RatedCount: number;
  rater2RatedCount: number;
  rater1VsClassifier: PairwiseFlagKappaSummary | null;
  rater1VsRater2: PairwiseFlagKappaSummary | null;
}

export interface TaskAuditMeta {
  table: string;
  appendOnly: boolean;
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
): PairwiseFlagKappaSummary | null {
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
    ratedSampleCount: sharedSamples.length,
    overallMicro: computeCohensKappa(microRef, microComp),
    byFlag,
  };
}

export function evaluateManualAuditKappa(
  sampleCsvPath: string,
  llmRaterCsvPath: string,
  humanSpotCheckCsvPath?: string,
  options?: { llmModel?: string | null }
): ManualAuditKappaReport {
  const samples = loadManualAuditSampleCsv(sampleCsvPath);
  const llmMap = loadRaterAuditCsv(llmRaterCsvPath);
  const humanMap = humanSpotCheckCsvPath
    ? loadRaterAuditCsv(humanSpotCheckCsvPath)
    : new Map<number, RaterAuditRow>();

  const classifierByIndex = new Map<number, Set<SqlForensicFlagName>>(
    samples.map((s) => [s.sampleIndex, s.triggeredForensicFlags])
  );
  const llmFlagsByIndex = new Map<number, Set<SqlForensicFlagName>>(
    [...llmMap.entries()].map(([k, v]) => [k, v.triggeredForensicFlags])
  );
  const humanFlagsByIndex = new Map<number, Set<SqlForensicFlagName>>(
    [...humanMap.entries()].map(([k, v]) => [k, v.triggeredForensicFlags])
  );

  const llmVsClassifier =
    llmFlagsByIndex.size > 0
      ? evaluatePairwiseFlagKappa(samples, llmFlagsByIndex, classifierByIndex)
      : null;
  const humanVsClassifier =
    humanFlagsByIndex.size > 0
      ? evaluatePairwiseFlagKappa(samples, humanFlagsByIndex, classifierByIndex)
      : null;
  const humanVsLlm =
    humanFlagsByIndex.size > 0 && llmFlagsByIndex.size > 0
      ? evaluatePairwiseFlagKappa(samples, humanFlagsByIndex, llmFlagsByIndex)
      : null;

  return {
    generatedAt: new Date().toISOString(),
    auditMode: 'llm-assisted-with-human-spot-check',
    llmModel: options?.llmModel ?? null,
    sampleCount: samples.length,
    llmRatedCount: llmMap.size,
    humanRatedCount: humanMap.size,
    llmVsClassifier,
    humanVsClassifier,
    humanVsLlm,
    rater1RatedCount: llmMap.size,
    rater2RatedCount: humanMap.size,
    rater1VsClassifier: llmVsClassifier,
    rater1VsRater2: humanVsLlm,
  };
}

/**
 * Deterministically selects a stratified subset of `limit` rows spread uniformly across
 * the sample order (which is stratified across 4 equal outcome buckets in manual-audit-sample.csv),
 * without inspecting any forensic classifier or Oracle verdict columns.
 */
export function selectStratifiedSubset<T>(samples: readonly T[], limit?: number): T[] {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0 || limit >= samples.length) {
    return [...samples];
  }
  const n = Math.floor(limit);
  const out: T[] = [];
  for (let k = 0; k < n; k++) {
    const idx = Math.floor((k * samples.length) / n);
    out.push(samples[idx]);
  }
  return out;
}

function loadTaskMetadataMap(root: string): Map<string, TaskAuditMeta> {
  const map = new Map<string, TaskAuditMeta>();
  const tasksPath = path.join(root, 'fixtures', 'task-v3', 'tasks.json');
  if (!fs.existsSync(tasksPath)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as
      | Array<{ id: string; table?: string; features?: { append_only?: boolean } }>
      | {
          train?: Array<{ id: string; table?: string; features?: { append_only?: boolean } }>;
          dev?: Array<{ id: string; table?: string; features?: { append_only?: boolean } }>;
          test?: Array<{ id: string; table?: string; features?: { append_only?: boolean } }>;
          tasks?: Array<{ id: string; table?: string; features?: { append_only?: boolean } }>;
        };
    const list = Array.isArray(raw)
      ? raw
      : [...(raw.train ?? []), ...(raw.dev ?? []), ...(raw.test ?? []), ...(raw.tasks ?? [])];
    for (const item of list) {
      if (item?.id) {
        map.set(item.id, {
          table: item.table ?? '',
          appendOnly: Boolean(item.features?.append_only),
        });
      }
    }
  } catch {
    // Non-fatal fallback if tasks.json cannot be parsed
  }
  return map;
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

export function buildBlindAuditPrompt(
  sql: string,
  taskMeta?: TaskAuditMeta
): { system: string; user: string } {
  const modeLine = taskMeta
    ? `Target Table: ${taskMeta.table || '(see CREATE TABLE)'}\nTable Mode (from task specification): ${taskMeta.appendOnly ? 'APPEND-ONLY' : 'MUTABLE'}`
    : 'Table Mode: Infer from SQL (Append-Only if it has a RAISE EXCEPTION trigger on UPDATE/DELETE or REVOKE UPDATE/DELETE; Mutable if it has an updated_at trigger or GRANT UPDATE/DELETE).';

  const system = `You are a strict, deterministic blind SQL forensic auditor.
Evaluate the provided PostgreSQL DDL migration against the exact 13 binary flags below.
Ignore SQL comments (-- and /* ... */) when checking syntax or identifiers.

The 13 Flags:
 1. hasInlineSupersedesFk — Column supersedes_id has an inline REFERENCES clause (on the column line itself) WITHOUT an explicit CONSTRAINT fk_<table>_supersedes_id declaration.
 2. hasExplicitSupersedesFk — Explicit table-level CONSTRAINT fk_<table>_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES ... is present (compliance marker: mark 2 whenever present).
 3. hasDuplicatePrimaryKey — Two or more PRIMARY KEY declarations appear inside the SAME CREATE TABLE (...) block.
 4. hasPublicAuthJwt — Invalid schema qualification public.auth.jwt() appears in SQL.
 5. hasPublicConstraintQualifier — Invalid schema qualification CONSTRAINT public.<name> appears in SQL.
 6. omittedSupersedesId — APPEND-ONLY tables ONLY: the target CREATE TABLE body does NOT contain a supersedes_id column. (Must be FALSE for MUTABLE tables.)
 7. inventedLineageCol — APPEND-ONLY tables ONLY: the target CREATE TABLE body declares an invented lineage column named parent_id, previous_id, prior_id, superseded_by, or prev_id. (Must be FALSE for MUTABLE tables.)
 8. hasHallucinatedLineageCol — APPEND-ONLY tables ONLY: BOTH flag 6 (omittedSupersedesId) AND flag 7 (inventedLineageCol) are true. (Must be FALSE for MUTABLE tables.)
 9. hasUserMetadataLeak — A CREATE POLICY statement references user_metadata instead of app_metadata.
10. hasSingularCompositeIndexName — A CREATE [UNIQUE] INDEX idx_<table>_<col1>... on 2+ columns (col1, col2, ...) whose index name is idx_<table>_<col1> or starts with idx_<table>_<col1> without containing <col2>.
11. hasRevokeWithoutPositiveGrant — APPEND-ONLY tables ONLY: a REVOKE ... FROM application or REVOKE ... FROM readonly_user statement exists, WITHOUT BOTH a positive GRANT SELECT ON [TABLE] [public.]<table> TO readonly_user AND a positive GRANT SELECT, INSERT ON [TABLE] [public.]<table> TO application. (Must be FALSE for MUTABLE tables or if no REVOKE FROM application/readonly_user is present.)
12. missingCreatedAtColumn — The target CREATE TABLE block completely omits a created_at column.
13. missingDeletedAtOnMutable — MUTABLE tables ONLY: the target CREATE TABLE block completely omits a deleted_at column. (Must be FALSE for APPEND-ONLY tables.)

Output ONLY a comma-separated list of the true flag numbers in ascending order (e.g., "2, 12") or "0" if none apply. Do not output any explanation, prose, or markdown fences.`;

  const user = `${modeLine}\n\nSQL:\n${sql.replace(/\r\n?/g, '\n')}`;
  return { system, user };
}

export function parseLlmFlagResponse(rawText: string): Set<SqlForensicFlagName> | null {
  const stripped = rawText
    .replace(/<(think|thought)>[\s\S]*?<\/\1>/gi, '')
    .replace(/```[a-zA-Z]*\s*/g, '')
    .replace(/```/g, '')
    .trim();
  if (!stripped) return null;

  // Support optional JSON array/object fallback
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    try {
      const parsed = JSON.parse(stripped) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { flags?: unknown }).flags)
          ? (parsed as { flags: unknown[] }).flags
          : null;
      if (arr) {
        const out = new Set<SqlForensicFlagName>();
        for (const item of arr) {
          if (typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= SQL_FORENSIC_FLAG_NAMES.length) {
            out.add(SQL_FORENSIC_FLAG_NAMES[item - 1]);
          } else if (typeof item === 'string') {
            if ((SQL_FORENSIC_FLAG_NAMES as readonly string[]).includes(item)) {
              out.add(item as SqlForensicFlagName);
            } else {
              const num = Number(item.trim());
              if (Number.isInteger(num) && num >= 1 && num <= SQL_FORENSIC_FLAG_NAMES.length) {
                out.add(SQL_FORENSIC_FLAG_NAMES[num - 1]);
              }
            }
          }
        }
        return out;
      }
    } catch {
      // Fall through to line-based parsing
    }
  }

  const lines = stripped
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const candidates = [stripped, ...(lines.length > 0 ? [lines[lines.length - 1], lines[0]] : [])];

  for (const cand of candidates) {
    const cleaned = cand.replace(/^(flags?|output|answer|result)\s*[:=-]\s*/i, '').replace(/\.$/, '').trim();
    const res = parseNumberedFlagSelection(cleaned);
    if (res.action === 'select') {
      return res.flags;
    }
  }

  return null;
}

async function callGeminiBlindAudit(
  sql: string,
  taskMeta: TaskAuditMeta | undefined,
  options: { model: string; apiKey: string; baseUrl: string }
): Promise<Set<SqlForensicFlagName>> {
  const { system, user } = buildBlindAuditPrompt(sql, taskMeta);
  const chatUrl = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const isGemma4 = options.model.startsWith('gemma-4-');
  const extraBody = isGemma4
    ? {
        extra_body: {
          google: {
            thinking_config: {
              thinking_level: 'minimal',
            },
          },
        },
      }
    : {};

  let lastError = 'Unknown error';
  for (let attempt = 0; attempt < 6; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
          max_tokens: isGemma4 ? 512 : 128,
          ...extraBody,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status === 503) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
        const delayMs =
          retryAfter > 0 ? retryAfter * 1000 : Math.min(35_000, 3_000 * (attempt + 1) + Math.random() * 1_000);
        console.warn(`[Auto-LLM] HTTP ${res.status}; retrying in ${(delayMs / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text();
        lastError = `HTTP ${res.status}: ${errBody.slice(0, 300)}`;
        if (res.status < 500) {
          throw new Error(lastError);
        }
        await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseLlmFlagResponse(rawContent);
      if (parsed !== null) {
        return parsed;
      }
      lastError = `Unparseable LLM response: ${JSON.stringify(rawContent.slice(0, 200))}`;
      console.warn(`[Auto-LLM] ${lastError}; retrying (${attempt + 1}/6)...`);
      await new Promise((r) => setTimeout(r, 1_000));
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
      if (lastError.startsWith('HTTP 4')) throw err;
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
  throw new Error(`[Auto-LLM] Failed after retries: ${lastError}`);
}

async function runAutoLlmAudit(
  root: string,
  options?: { model?: string; limit?: number }
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === 'your_key_here') {
    throw new Error('GEMINI_API_KEY is required in .env to run --auto-llm.');
  }
  const baseUrl =
    process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
  const model = (
    options?.model ||
    process.env.AXIOM_AUDIT_LLM_MODEL ||
    'gemini-3.1-flash-lite'
  ).trim();

  const sampleCsvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
  if (!fs.existsSync(sampleCsvPath)) {
    throw new Error(`Sample CSV not found at ${sampleCsvPath}`);
  }
  const raterCsvPath = path.join(root, 'out', 'v3', 'manual-audit-llm-rater.csv');
  const metaPath = path.join(root, 'out', 'v3', 'manual-audit-llm-meta.json');

  const allSamples = loadManualAuditSampleCsv(sampleCsvPath);
  const targetSamples = selectStratifiedSubset(allSamples, options?.limit);
  const existing = loadRaterAuditCsv(raterCsvPath);
  const taskMetaMap = loadTaskMetadataMap(root);

  const unrated = targetSamples.filter((s) => !existing.has(s.sampleIndex));
  console.log(
    `[Auto-LLM Blind Audit] Model: "${model}" | Target: ${targetSamples.length}/${allSamples.length} | Already rated: ${targetSamples.length - unrated.length} | Remaining: ${unrated.length}`
  );
  console.log(
    'Note: Strictly blind — only raw SQL and task table mode are sent (zero sql-forensics.ts or Oracle hints).'
  );

  for (let i = 0; i < unrated.length; i++) {
    const row = unrated[i];
    const fullSql = lookupFullSqlFromCheckpoint(root, row).replace(/\r\n?/g, '\n');
    const taskMeta = taskMetaMap.get(row.taskId);
    const chosenFlags = await callGeminiBlindAudit(fullSql, taskMeta, { model, apiKey, baseUrl });

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
      `[${existing.size}/${targetSamples.length}] Sample #${row.sampleIndex} (${row.taskId}, ${row.condition}) -> [${[...chosenFlags].join('; ') || 'none'}]`
    );

    if (i + 1 < unrated.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        model,
        auditedAt: new Date().toISOString(),
        sampleCount: allSamples.length,
        ratedCount: existing.size,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log(`Saved ${existing.size}/${allSamples.length} automated LLM audit rows to ${raterCsvPath}.`);
}

async function runInteractiveRaterCli(
  root: string,
  raterName: string,
  limit?: number
): Promise<void> {
  const sampleCsvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
  if (!fs.existsSync(sampleCsvPath)) {
    throw new Error(`Sample CSV not found at ${sampleCsvPath}`);
  }
  const raterCsvPath = path.join(root, 'out', 'v3', `manual-audit-${raterName}.csv`);
  const allSamples = loadManualAuditSampleCsv(sampleCsvPath);
  const targetSamples = selectStratifiedSubset(allSamples, limit);
  const existing = loadRaterAuditCsv(raterCsvPath);
  const taskMetaMap = loadTaskMetadataMap(root);

  const unrated = targetSamples.filter((s) => !existing.has(s.sampleIndex));
  const alreadyRatedInTarget = targetSamples.length - unrated.length;
  const subsetLabel =
    limit && limit < allSamples.length
      ? `${targetSamples.length}/${allSamples.length} (stratified --limit ${limit})`
      : `${allSamples.length}`;
  console.log(
    `[Blind Manual Audit CLI] Rater: "${raterName}" | Target samples: ${subsetLabel} | Already rated: ${alreadyRatedInTarget} | Remaining: ${unrated.length}`
  );
  console.log(
    'Note: sql-forensics.ts predictions and PostgreSQL 16 Oracle verdicts are strictly hidden to prevent anchoring bias.'
  );
  if (unrated.length === 0) {
    console.log(`All ${targetSamples.length} target rows are already rated in ${raterCsvPath}.`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim().toLowerCase())));

  try {
    for (let idxInTarget = 0; idxInTarget < unrated.length; idxInTarget++) {
      const row = unrated[idxInTarget];
      const fullSql = lookupFullSqlFromCheckpoint(root, row).replace(/\r\n?/g, '\n');
      const taskMeta = taskMetaMap.get(row.taskId);
      const modeStr = taskMeta ? (taskMeta.appendOnly ? 'APPEND-ONLY' : 'MUTABLE') : 'UNKNOWN';
      const progressNum = alreadyRatedInTarget + idxInTarget + 1;
      console.log('\n' + '='.repeat(88));
      console.log(
        `[${progressNum}/${targetSamples.length}] Sample #${row.sampleIndex}/${allSamples.length} | Task: ${row.taskId} | Mode: ${modeStr} | Condition: ${row.condition} | SQL SHA: ${row.sqlSha256}`
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
          console.log(`Saved progress (${existing.size}/${targetSamples.length}) to ${raterCsvPath}.`);
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
        `Saved sample #${row.sampleIndex} (${progressNum}/${targetSamples.length}) -> [${[...chosenFlags].join('; ') || 'none'}]`
      );
    }
  } finally {
    rl.close();
  }
}

function parseOptionalPositiveIntArg(args: string[], flag: string): number | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0 || !args[idx + 1]) return undefined;
  const val = Number(args[idx + 1]);
  if (!Number.isInteger(val) || val <= 0) {
    throw new Error(`Invalid value for ${flag}: "${args[idx + 1]}" (must be a positive integer).`);
  }
  return val;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = path.resolve('.');
  const raterIdx = args.indexOf('--rater');
  const modelIdx = args.indexOf('--model');
  const limit = parseOptionalPositiveIntArg(args, '--limit');
  const autoLlm = args.includes('--auto-llm');
  const computeKappa = args.includes('--compute-kappa');

  if (autoLlm) {
    const model = modelIdx >= 0 && args[modelIdx + 1] ? args[modelIdx + 1] : undefined;
    await runAutoLlmAudit(root, { model, limit });
    return;
  }

  if (raterIdx >= 0 && args[raterIdx + 1]) {
    const raterName = args[raterIdx + 1].replace(/[^a-zA-Z0-9_-]/g, '');
    await runInteractiveRaterCli(root, raterName, limit);
    return;
  }

  if (computeKappa) {
    const sampleCsvPath = path.join(root, 'out', 'v3', 'manual-audit-sample.csv');
    const llmRaterCsvPath = path.join(root, 'out', 'v3', 'manual-audit-llm-rater.csv');
    const humanCsvPath = path.join(root, 'out', 'v3', 'manual-audit-human.csv');
    const llmMetaPath = path.join(root, 'out', 'v3', 'manual-audit-llm-meta.json');
    const outPath = path.join(root, 'out', 'v3', 'manual-audit-kappa.json');

    let llmModel: string | null = null;
    if (fs.existsSync(llmMetaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(llmMetaPath, 'utf8')) as { model?: string };
        llmModel = meta.model ?? null;
      } catch {
        llmModel = null;
      }
    }

    const report = evaluateManualAuditKappa(sampleCsvPath, llmRaterCsvPath, humanCsvPath, {
      llmModel,
    });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const fmtSummary = (name: string, s: PairwiseFlagKappaSummary | null) =>
      s
        ? `  ${name} (n=${s.ratedSampleCount}): kappa=${s.overallMicro.kappa.toFixed(4)} [${s.overallMicro.ci95[0].toFixed(4)}, ${s.overallMicro.ci95[1].toFixed(4)}], agree=${(s.overallMicro.percentAgreement * 100).toFixed(1)}%, PABAK=${s.overallMicro.pabak.toFixed(4)}`
        : `  ${name}: pending`;
    console.log(
      `Wrote ${outPath} (sampleCount=${report.sampleCount}, llmRated=${report.llmRatedCount}, humanRated=${report.humanRatedCount})`
    );
    console.log(fmtSummary('LLM Rater vs. sql-forensics.ts', report.llmVsClassifier));
    console.log(fmtSummary('Human Spot-Check vs. sql-forensics.ts', report.humanVsClassifier));
    console.log(fmtSummary('Human Spot-Check vs. LLM Rater', report.humanVsLlm));
    return;
  }

  console.error(
    'Usage:\n' +
      '  npx tsx scripts/v3/score-manual-audit.ts --auto-llm [--model <gemini-model>] [--limit <n>]\n' +
      '  npx tsx scripts/v3/score-manual-audit.ts --rater human [--limit 20]\n' +
      '  npx tsx scripts/v3/score-manual-audit.ts --compute-kappa'
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
