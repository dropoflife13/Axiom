// scripts/propose-task-repair.ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getApplicableFacts } from './facts.js';
import {
  evaluateMigrationSqlInContainer,
  startPostgresContainer,
  stopPostgresContainer,
} from './oracle.js';

export interface TaskFeaturesInput {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
  status?: boolean;
  view?: boolean;
  sec_definer?: boolean;
  latest_per_key?: boolean;
  [key: string]: boolean | undefined;
}

export interface DerivedTaskFlags {
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
  status: boolean;
  view: boolean;
  sec_definer: boolean;
  latest_per_key: boolean;
}

export interface TaskRecord {
  id: string;
  split: 'train' | 'dev' | 'test';
  cohortId: string;
  table: string;
  prompt: string;
  features: TaskFeaturesInput;
  boundFacts: string[];
  applicableFacts?: string[];
  goldenSql: string;
  devBaselineSql?: string;
}

export interface ProposedTaskRecord extends Omit<TaskRecord, 'features' | 'applicableFacts'> {
  features: DerivedTaskFlags;
  applicableFacts: string[];
  invalidBoundFacts: string[];
}

export interface TasksFileSchema {
  train: TaskRecord[];
  dev: TaskRecord[];
  test: TaskRecord[];
}

export interface ProposedTasksFileSchema {
  train: ProposedTaskRecord[];
  dev: ProposedTaskRecord[];
  test: ProposedTaskRecord[];
}

const STATUS_EXACT_COLS = new Set([
  'status',
  'state',
  'billing_state',
  'delivery_status',
  'batch_status',
  'sync_status',
  'decision',
  'verification_status',
]);

const STATUS_EXCLUDED_COLS = new Set(['http_status', 'status_code']);

/**
 * Returns true if the task prompt mentions a status, state, or decision construct.
 */
export function promptRequestsStatus(prompt: string): boolean {
  return /\b(?:status|state|decision)\b/i.test(prompt);
}

/**
 * Extracts column names defined inside CREATE TABLE blocks of a SQL migration.
 */
export function extractCreateTableColumnNames(sql: string): string[] {
  const columns: string[] = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^(]+\(([\s\S]*?)\)\s*;/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(sql)) !== null) {
    const body = match[1];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line) continue;
      const colMatch = line.match(
        /^"?([a-zA-Z0-9_]+)"?\s+(?:uuid|text|varchar|char|character|bigint|int8|integer|int4|int|smallint|numeric|decimal|real|float|double|money|timestamptz|timestamp|date|time|boolean|bool|inet|cidr|jsonb|json)\b/i
      );
      if (!colMatch) continue;
      const colName = colMatch[1].toLowerCase();
      if (['constraint', 'primary', 'foreign', 'unique', 'check'].includes(colName)) {
        continue;
      }
      columns.push(colName);
    }
  }
  return columns;
}

/**
 * Returns true if goldenSql defines a status/state/decision column probed by F-12
 * (matching scripts/oracle.ts lines 320-328).
 */
export function goldenContainsStatus(goldenSql: string): boolean {
  const cols = extractCreateTableColumnNames(goldenSql);
  return cols.some((col) => {
    if (STATUS_EXCLUDED_COLS.has(col)) return false;
    return (
      STATUS_EXACT_COLS.has(col) || col.endsWith('_status') || col.endsWith('_state')
    );
  });
}

/**
 * Named detector for the `status` feature flag (F-12).
 * Returns true iff the prompt requests a status/state/decision construct AND goldenSql contains a status-like column.
 */
export function detectStatus(prompt: string, goldenSql: string): boolean {
  return promptRequestsStatus(prompt) && goldenContainsStatus(goldenSql);
}

/**
 * Returns true if the task prompt requests a database view.
 */
export function promptRequestsView(prompt: string): boolean {
  return /\bview\b/i.test(prompt);
}

/**
 * Returns true if goldenSql creates a view (`CREATE [OR REPLACE] VIEW`).
 */
export function goldenContainsView(goldenSql: string): boolean {
  return /\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/i.test(goldenSql);
}

/**
 * Named detector for the `view` feature flag (F-39).
 * Returns true iff the prompt requests a view AND goldenSql creates a view.
 */
export function detectView(prompt: string, goldenSql: string): boolean {
  return promptRequestsView(prompt) && goldenContainsView(goldenSql);
}

/**
 * Returns true if the task prompt explicitly requests a SECURITY DEFINER function.
 */
export function promptRequestsSecDefiner(prompt: string): boolean {
  return /\bsecurity\s+definer\b/i.test(prompt);
}

/**
 * Returns true if goldenSql defines a SECURITY DEFINER function.
 */
export function goldenContainsSecDefiner(goldenSql: string): boolean {
  return /\bSECURITY\s+DEFINER\b/i.test(goldenSql);
}

/**
 * Named detector for the `sec_definer` feature flag (F-31).
 * Returns true iff the prompt requests SECURITY DEFINER AND goldenSql contains SECURITY DEFINER.
 */
export function detectSecDefiner(prompt: string, goldenSql: string): boolean {
  return promptRequestsSecDefiner(prompt) && goldenContainsSecDefiner(goldenSql);
}

/**
 * Returns true if the task prompt requests latest-per-key observation indexing or observed_at.
 */
export function promptRequestsLatestPerKey(prompt: string): boolean {
  return /\b(?:latest_per_key|observed_at|latest[-_\s]+per[-_\s]+key)\b/i.test(prompt);
}

/**
 * Returns true if goldenSql contains an `observed_at` column/index construct.
 */
export function goldenContainsLatestPerKey(goldenSql: string): boolean {
  return /\bobserved_at\b/i.test(goldenSql);
}

/**
 * Named detector for the `latest_per_key` feature flag (F-38).
 * Returns true iff the prompt requests latest_per_key/observed_at AND goldenSql contains observed_at.
 */
export function detectLatestPerKey(prompt: string, goldenSql: string): boolean {
  return promptRequestsLatestPerKey(prompt) && goldenContainsLatestPerKey(goldenSql);
}

/**
 * Derives the full 7-flag feature set for a task from its 3 core boolean features
 * and the 4 named (prompt, goldenSql) detectors.
 */
export function deriveTaskFlags(
  task: Pick<TaskRecord, 'features' | 'prompt' | 'goldenSql'>
): DerivedTaskFlags {
  return {
    tenant: Boolean(task.features.tenant),
    append_only: Boolean(task.features.append_only),
    ingestion: Boolean(task.features.ingestion),
    status: detectStatus(task.prompt, task.goldenSql),
    view: detectView(task.prompt, task.goldenSql),
    sec_definer: detectSecDefiner(task.prompt, task.goldenSql),
    latest_per_key: detectLatestPerKey(task.prompt, task.goldenSql),
  };
}

/**
 * Pure function mapping a task's core flags (`tenant`, `append_only`, `ingestion`)
 * and derived flags (`status`, `view`, `sec_definer`, `latest_per_key`) to the sorted
 * list of active (`CONFIRMED` / `OWNER-ADOPTED`) facts the Oracle probes, using the
 * applicability rules in `fixtures/task-v2/facts.json`.
 */
export function probedFactsForTask(
  task: Pick<TaskRecord, 'features' | 'prompt' | 'goldenSql'>
): string[] {
  const flags = deriveTaskFlags(task);
  return getApplicableFacts({ ...flags });
}

/**
 * Marks each current boundFact invalid if:
 *  (i) it is not in the proposed applicableFacts,
 *  (ii) goldenSql fails it (either directly in oracleFailedFacts, or via F-13 cascade when cascadeF13 is true), or
 *  (iii) it is F-39 and the prompt does not request a view.
 */
export function computeInvalidBoundFacts(
  task: Pick<TaskRecord, 'boundFacts' | 'prompt'>,
  proposedApplicableFacts: readonly string[],
  goldenOracleFailedFacts: readonly string[],
  cascadeF13 = false
): string[] {
  const applicableSet = new Set(proposedApplicableFacts);
  const failedSet = new Set(goldenOracleFailedFacts);
  const f13CascadeTriggered = cascadeF13 && failedSet.has('F-13');
  const promptHasView = promptRequestsView(task.prompt);

  return task.boundFacts.filter((factId) => {
    const notInProposedApplicable = !applicableSet.has(factId);
    const failedByGolden = f13CascadeTriggered || failedSet.has(factId);
    const f39WithoutViewInPrompt = factId === 'F-39' && !promptHasView;
    return notInProposedApplicable || failedByGolden || f39WithoutViewInPrompt;
  });
}

export interface TableNameRepairProposal {
  taskId: string;
  split: 'train' | 'dev' | 'test';
  currentTable: string;
  proposedTable: string;
  currentPromptParenthetical: string;
  proposedPromptParenthetical: string;
  targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)';
  reasonFromPrompt: string;
}

export const PROPOSED_TABLE_REPAIRS: Record<string, TableNameRepairProposal> = {
  'T-033': {
    taskId: 'T-033',
    split: 'train',
    currentTable: 'webhook_outbox',
    proposedTable: 'webhook_outboxes',
    currentPromptParenthetical: '(webhook outbox)',
    proposedPromptParenthetical: '(webhook outboxes)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "(webhook outbox)" which is singular (ends in "x", failing F-13 regex ^[a-z]+(_[a-z]+)*s$); pluralizing tableName to "webhook_outboxes" (and matching goldenSql/prompt parenthetical) satisfies F-13.',
  },
  'H-011': {
    taskId: 'H-011',
    split: 'test',
    currentTable: 'ehr_hl7_ingests',
    proposedTable: 'ehr_hl_seven_ingests',
    currentPromptParenthetical: '(ehr hl7 ingests)',
    proposedPromptParenthetical: '(ehr hl seven ingests)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "clinical message ingestion logs (ehr hl7 ingests)"; "hl7" contains digit "7" which violates F-13 regex ^[a-z]+(_[a-z]+)*s$ (letters only). Spelling out "ehr_hl_seven_ingests" in tableName (and matching goldenSql/prompt parenthetical) preserves domain meaning and satisfies F-13.',
  },
  'H-065': {
    taskId: 'H-065',
    split: 'test',
    currentTable: 'botnet_c2_beacons',
    proposedTable: 'botnet_command_beacons',
    currentPromptParenthetical: '(botnet c2 beacons)',
    proposedPromptParenthetical: '(botnet command beacons)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "global sinkhole C2 beacon ingestion logs (botnet c2 beacons)"; "c2" contains digit "2" which violates F-13 regex ^[a-z]+(_[a-z]+)*s$ (letters only). Replacing "c2" with "command" in tableName ("botnet_command_beacons") and matching goldenSql/prompt parenthetical satisfies F-13.',
  },
  'H-067': {
    taskId: 'H-067',
    split: 'test',
    currentTable: 'vuln_scanner_telemetry',
    proposedTable: 'vuln_scanner_telemetries',
    currentPromptParenthetical: '(vuln scanner telemetry)',
    proposedPromptParenthetical: '(vuln scanner telemetries)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "global internet vulnerability scan ingestion logs (vuln scanner telemetry)"; "telemetry" is singular (ends in "y", failing F-13 regex ^[a-z]+(_[a-z]+)*s$). Pluralizing tableName to "vuln_scanner_telemetries" (matching D-025 bgp_route_telemetries and H-070 ocsp_staple_telemetries) and updating goldenSql/prompt parenthetical satisfies F-13.',
  },
  'H-075': {
    taskId: 'H-075',
    split: 'test',
    currentTable: 'ipv6_pmtud_failures',
    proposedTable: 'ipv_six_pmtud_failures',
    currentPromptParenthetical: '(ipv6 pmtud failures)',
    proposedPromptParenthetical: '(ipv six pmtud failures)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "global IPv6 path MTU discovery failure ingestion logs (ipv6 pmtud failures)"; "ipv6" contains digit "6" which violates F-13 regex ^[a-z]+(_[a-z]+)*s$ (letters only). Spelling out "ipv_six_pmtud_failures" in tableName (and matching goldenSql/prompt parenthetical) satisfies F-13.',
  },
  'H-099': {
    taskId: 'H-099',
    split: 'test',
    currentTable: 'air_quality_pm25_feeds',
    proposedTable: 'air_quality_particulate_feeds',
    currentPromptParenthetical: '(air quality pm25 feeds)',
    proposedPromptParenthetical: '(air quality particulate feeds)',
    targetFieldProposed: 'tableName (task.table + prompt parenthetical + goldenSql)',
    reasonFromPrompt:
      'Prompt states "global urban air quality PM2.5 monitor feeds (air quality pm25 feeds)"; "pm25" contains digits "25" which violates F-13 regex ^[a-z]+(_[a-z]+)*s$ (letters only). Replacing "pm25" with "particulate" in tableName ("air_quality_particulate_feeds") and matching goldenSql/prompt parenthetical satisfies F-13.',
  },
};

function buildUnifiedPatchForTask(
  task: TaskRecord,
  proposal: TableNameRepairProposal
): string {
  const oldJson = JSON.stringify(
    {
      id: task.id,
      table: task.table,
      prompt: task.prompt,
      goldenSql: task.goldenSql.split('\n'),
    },
    null,
    2
  );
  const repairedPrompt = task.prompt.replace(
    proposal.currentPromptParenthetical,
    proposal.proposedPromptParenthetical
  );
  const repairedSql = task.goldenSql.replaceAll(
    proposal.currentTable,
    proposal.proposedTable
  );
  const newJson = JSON.stringify(
    {
      id: task.id,
      table: proposal.proposedTable,
      prompt: repairedPrompt,
      goldenSql: repairedSql.split('\n'),
    },
    null,
    2
  );

  const oldLines = oldJson.split('\n');
  const newLines = newJson.split('\n');
  const diffLines: string[] = [
    `--- a/fixtures/task-v2/tasks.json (${task.id})`,
    `+++ b/fixtures/task-v2/tasks.json (${task.id})`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      diffLines.push(` ${o}`);
    } else {
      if (o !== undefined) diffLines.push(`-${o}`);
      if (n !== undefined) diffLines.push(`+${n}`);
    }
  }
  return diffLines.join('\n') + '\n';
}

function sha256File(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function runProposal(): Promise<void> {
  const tasksPath = path.resolve('fixtures/task-v2/tasks.json');
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  const outDir = path.resolve('out/proposed');
  const patchesDir = path.join(outDir, 'golden-fixes');

  fs.mkdirSync(patchesDir, { recursive: true });

  const tasksSha256 = sha256File(tasksPath);
  const factsSha256 = sha256File(factsPath);

  const tasksFile = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')) as TasksFileSchema;
  const splits: Array<'train' | 'dev' | 'test'> = ['train', 'dev', 'test'];

  // 1. Disagreements between prompt and goldenSql per split and per flag
  const flagNames = ['status', 'view', 'sec_definer', 'latest_per_key'] as const;
  type DerivedFlagName = (typeof flagNames)[number];

  const disagreementsBySplitAndFlag: Record<
    'train' | 'dev' | 'test',
    Record<
      DerivedFlagName,
      {
        count: number;
        promptTrueGoldenFalseCount: number;
        promptFalseGoldenTrueCount: number;
        promptTrueGoldenFalseTaskIds: string[];
        promptFalseGoldenTrueTaskIds: string[];
      }
    >
  > = {
    train: {} as any,
    dev: {} as any,
    test: {} as any,
  };

  for (const split of splits) {
    for (const flag of flagNames) {
      disagreementsBySplitAndFlag[split][flag] = {
        count: 0,
        promptTrueGoldenFalseCount: 0,
        promptFalseGoldenTrueCount: 0,
        promptTrueGoldenFalseTaskIds: [],
        promptFalseGoldenTrueTaskIds: [],
      };
    }
  }

  // 2. Track per-fact changes between stored applicableFacts and proposed applicableFacts
  const factChangeCounts: Record<
    string,
    {
      trainAdded: number;
      trainRemoved: number;
      devAdded: number;
      devRemoved: number;
      testAdded: number;
      testRemoved: number;
      totalTasksChanged: number;
    }
  > = {};

  // 3. Start PostgreSQL container to evaluate every goldenSql with derived flags
  const containerName = `axiom-propose-repair-${process.pid}`;
  startPostgresContainer(containerName);

  const proposedTasksFile: ProposedTasksFileSchema = {
    train: [],
    dev: [],
    test: [],
  };

  const goldenFailuresBySplit: Record<
    'train' | 'dev' | 'test',
    Array<{
      taskId: string;
      split: 'train' | 'dev' | 'test';
      table: string;
      createdTablesInGoldenSql: string[];
      promptParentheticalTable: string;
      failedProposedApplicableFacts: string[];
      allOracleFailedFacts: string[];
      causeCategory: 'table-name mismatch' | 'missing construct' | 'other';
      proposedFixTarget: string;
      proposedTable?: string;
      patchFile: string;
      reason: string;
      repairedGoldenPassesAllProposedFacts: boolean;
    }>
  > = {
    train: [],
    dev: [],
    test: [],
  };

  const boundValidityBySplit: Record<
    'train' | 'dev' | 'test',
    {
      totalTasks: number;
      tasksWithAnyInvalidBoundFact_direct: number;
      tasksWithFewerThan3ValidBoundFacts_direct: number;
      fewerThan3TaskIds_direct: string[];
      tasksWithAnyInvalidBoundFact_withF13Cascade: number;
      tasksWithFewerThan3ValidBoundFacts_withF13Cascade: number;
      fewerThan3TaskIds_withF13Cascade: string[];
      invalidBoundFactBreakdown: Array<{
        taskId: string;
        boundFacts: string[];
        invalidBoundFacts_direct: string[];
        validCount_direct: number;
        invalidBoundFacts_withF13Cascade: string[];
        validCount_withF13Cascade: number;
        reasonsByFact: Record<string, string[]>;
      }>;
    }
  > = {
    train: {
      totalTasks: 0,
      tasksWithAnyInvalidBoundFact_direct: 0,
      tasksWithFewerThan3ValidBoundFacts_direct: 0,
      fewerThan3TaskIds_direct: [],
      tasksWithAnyInvalidBoundFact_withF13Cascade: 0,
      tasksWithFewerThan3ValidBoundFacts_withF13Cascade: 0,
      fewerThan3TaskIds_withF13Cascade: [],
      invalidBoundFactBreakdown: [],
    },
    dev: {
      totalTasks: 0,
      tasksWithAnyInvalidBoundFact_direct: 0,
      tasksWithFewerThan3ValidBoundFacts_direct: 0,
      fewerThan3TaskIds_direct: [],
      tasksWithAnyInvalidBoundFact_withF13Cascade: 0,
      tasksWithFewerThan3ValidBoundFacts_withF13Cascade: 0,
      fewerThan3TaskIds_withF13Cascade: [],
      invalidBoundFactBreakdown: [],
    },
    test: {
      totalTasks: 0,
      tasksWithAnyInvalidBoundFact_direct: 0,
      tasksWithFewerThan3ValidBoundFacts_direct: 0,
      fewerThan3TaskIds_direct: [],
      tasksWithAnyInvalidBoundFact_withF13Cascade: 0,
      tasksWithFewerThan3ValidBoundFacts_withF13Cascade: 0,
      fewerThan3TaskIds_withF13Cascade: [],
      invalidBoundFactBreakdown: [],
    },
  };

  try {
    for (const split of splits) {
      const list = tasksFile[split];
      boundValidityBySplit[split].totalTasks = list.length;

      for (const task of list) {
        // Check prompt vs goldenSql per detector
        const pStatus = promptRequestsStatus(task.prompt);
        const gStatus = goldenContainsStatus(task.goldenSql);
        if (pStatus !== gStatus) {
          const entry = disagreementsBySplitAndFlag[split].status;
          entry.count++;
          if (pStatus && !gStatus) {
            entry.promptTrueGoldenFalseCount++;
            entry.promptTrueGoldenFalseTaskIds.push(task.id);
          } else {
            entry.promptFalseGoldenTrueCount++;
            entry.promptFalseGoldenTrueTaskIds.push(task.id);
          }
        }

        const pView = promptRequestsView(task.prompt);
        const gView = goldenContainsView(task.goldenSql);
        if (pView !== gView) {
          const entry = disagreementsBySplitAndFlag[split].view;
          entry.count++;
          if (pView && !gView) {
            entry.promptTrueGoldenFalseCount++;
            entry.promptTrueGoldenFalseTaskIds.push(task.id);
          } else {
            entry.promptFalseGoldenTrueCount++;
            entry.promptFalseGoldenTrueTaskIds.push(task.id);
          }
        }

        const pSec = promptRequestsSecDefiner(task.prompt);
        const gSec = goldenContainsSecDefiner(task.goldenSql);
        if (pSec !== gSec) {
          const entry = disagreementsBySplitAndFlag[split].sec_definer;
          entry.count++;
          if (pSec && !gSec) {
            entry.promptTrueGoldenFalseCount++;
            entry.promptTrueGoldenFalseTaskIds.push(task.id);
          } else {
            entry.promptFalseGoldenTrueCount++;
            entry.promptFalseGoldenTrueTaskIds.push(task.id);
          }
        }

        const pLat = promptRequestsLatestPerKey(task.prompt);
        const gLat = goldenContainsLatestPerKey(task.goldenSql);
        if (pLat !== gLat) {
          const entry = disagreementsBySplitAndFlag[split].latest_per_key;
          entry.count++;
          if (pLat && !gLat) {
            entry.promptTrueGoldenFalseCount++;
            entry.promptTrueGoldenFalseTaskIds.push(task.id);
          } else {
            entry.promptFalseGoldenTrueCount++;
            entry.promptFalseGoldenTrueTaskIds.push(task.id);
          }
        }

        const derivedFlags = deriveTaskFlags(task);
        const proposedApplicable = probedFactsForTask(task);
        const storedApplicable = task.applicableFacts ?? [];

        const storedSet = new Set(storedApplicable);
        const proposedSet = new Set(proposedApplicable);
        const allFactsUnion = new Set([...storedApplicable, ...proposedApplicable]);

        for (const factId of allFactsUnion) {
          const inStored = storedSet.has(factId);
          const inProposed = proposedSet.has(factId);
          if (inStored !== inProposed) {
            if (!factChangeCounts[factId]) {
              factChangeCounts[factId] = {
                trainAdded: 0,
                trainRemoved: 0,
                devAdded: 0,
                devRemoved: 0,
                testAdded: 0,
                testRemoved: 0,
                totalTasksChanged: 0,
              };
            }
            const rec = factChangeCounts[factId];
            rec.totalTasksChanged++;
            if (inProposed && !inStored) {
              if (split === 'train') rec.trainAdded++;
              else if (split === 'dev') rec.devAdded++;
              else rec.testAdded++;
            } else {
              if (split === 'train') rec.trainRemoved++;
              else if (split === 'dev') rec.devRemoved++;
              else rec.testRemoved++;
            }
          }
        }

        // Run Oracle on goldenSql with derived flags
        const oracleRes = evaluateMigrationSqlInContainer(
          containerName,
          task.goldenSql,
          {
            table: task.table,
            ...derivedFlags,
          },
          `prop_${task.id}`
        );

        const failedProposedApplicable = oracleRes.failedFacts.filter((f) =>
          proposedSet.has(f)
        );

        if (failedProposedApplicable.length > 0) {
          const createdTables = [
            ...task.goldenSql.matchAll(
              /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_.]+)/gi
            ),
          ].map((m) => m[1]);
          const parenMatch = task.prompt.match(/\(([a-z0-9\s_.]+)\)/i);
          const promptParen = parenMatch ? `(${parenMatch[1]})` : 'none';

          const proposal = PROPOSED_TABLE_REPAIRS[task.id];
          const patchFileName = `${task.id}.patch`;
          const patchFilePath = path.join(patchesDir, patchFileName);

          let repairedPasses = false;
          if (proposal) {
            const patchContent = buildUnifiedPatchForTask(task, proposal);
            fs.writeFileSync(patchFilePath, patchContent, 'utf-8');

            const repairedSql = task.goldenSql.replaceAll(
              proposal.currentTable,
              proposal.proposedTable
            );
            const verifyRes = evaluateMigrationSqlInContainer(
              containerName,
              repairedSql,
              {
                table: proposal.proposedTable,
                ...derivedFlags,
              },
              `prop_fix_${task.id}`
            );
            repairedPasses =
              !verifyRes.migrationExitNonZero &&
              verifyRes.failedFacts.filter((f) => proposedSet.has(f)).length === 0;
          }

          goldenFailuresBySplit[split].push({
            taskId: task.id,
            split,
            table: task.table,
            createdTablesInGoldenSql: createdTables,
            promptParentheticalTable: promptParen,
            failedProposedApplicableFacts: failedProposedApplicable,
            allOracleFailedFacts: oracleRes.failedFacts,
            causeCategory: 'table-name mismatch',
            proposedFixTarget:
              proposal?.targetFieldProposed ??
              'tableName (task.table + prompt parenthetical + goldenSql)',
            proposedTable: proposal?.proposedTable,
            patchFile: `out/proposed/golden-fixes/${patchFileName}`,
            reason:
              proposal?.reasonFromPrompt ??
              'Table identifier violates F-13 snake_case plural letters-only regex ^[a-z]+(_[a-z]+)*s$.',
            repairedGoldenPassesAllProposedFacts: repairedPasses,
          });
        }

        // 4. Bound-fact validity
        const invalidDirect = computeInvalidBoundFacts(
          task,
          proposedApplicable,
          oracleRes.failedFacts,
          false
        );
        const invalidWithCascade = computeInvalidBoundFacts(
          task,
          proposedApplicable,
          oracleRes.failedFacts,
          true
        );

        const validCountDirect = task.boundFacts.length - invalidDirect.length;
        const validCountCascade = task.boundFacts.length - invalidWithCascade.length;

        if (invalidDirect.length > 0) {
          boundValidityBySplit[split].tasksWithAnyInvalidBoundFact_direct++;
        }
        if (validCountDirect < 3) {
          boundValidityBySplit[split].tasksWithFewerThan3ValidBoundFacts_direct++;
          boundValidityBySplit[split].fewerThan3TaskIds_direct.push(task.id);
        }

        if (invalidWithCascade.length > 0) {
          boundValidityBySplit[split].tasksWithAnyInvalidBoundFact_withF13Cascade++;
        }
        if (validCountCascade < 3) {
          boundValidityBySplit[split].tasksWithFewerThan3ValidBoundFacts_withF13Cascade++;
          boundValidityBySplit[split].fewerThan3TaskIds_withF13Cascade.push(task.id);
        }

        if (invalidDirect.length > 0 || invalidWithCascade.length > 0) {
          const reasonsByFact: Record<string, string[]> = {};
          for (const bf of task.boundFacts) {
            const reasons: string[] = [];
            if (!proposedSet.has(bf)) reasons.push('not_in_proposed_applicableFacts');
            if (oracleRes.failedFacts.includes(bf)) reasons.push('goldenSql_fails_fact_directly');
            else if (oracleRes.failedFacts.includes('F-13'))
              reasons.push('goldenSql_fails_F-13_tableMissing_cascade');
            if (bf === 'F-39' && !pView) reasons.push('F-39_without_view_in_prompt');
            if (reasons.length > 0) {
              reasonsByFact[bf] = reasons;
            }
          }
          boundValidityBySplit[split].invalidBoundFactBreakdown.push({
            taskId: task.id,
            boundFacts: task.boundFacts,
            invalidBoundFacts_direct: invalidDirect,
            validCount_direct: validCountDirect,
            invalidBoundFacts_withF13Cascade: invalidWithCascade,
            validCount_withF13Cascade: validCountCascade,
            reasonsByFact,
          });
        }

        proposedTasksFile[split].push({
          ...task,
          features: derivedFlags,
          applicableFacts: proposedApplicable,
          boundFacts: task.boundFacts,
          invalidBoundFacts: invalidDirect,
        });
      }
    }
  } finally {
    stopPostgresContainer(containerName);
  }

  const proposedTasksPath = path.join(outDir, 'tasks.proposed.json');
  fs.writeFileSync(
    proposedTasksPath,
    JSON.stringify(proposedTasksFile, null, 2) + '\n',
    'utf-8'
  );

  const report = {
    generatedAt: new Date().toISOString(),
    provenance: {
      tasksJsonSha256: tasksSha256,
      factsJsonSha256: factsSha256,
    },
    disagreementsBySplitAndFlag,
    factChangeCounts,
    goldenFailuresBySplit,
    boundValidityBySplit,
  };

  const reportPath = path.join(outDir, 'repair-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('propose-task-repair.ts')
) {
  runProposal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
