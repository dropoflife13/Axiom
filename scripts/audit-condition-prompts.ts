import fs from 'node:fs';
import path from 'node:path';
import {
  ConditionId,
  ELIGIBLE_FACTS,
  SQL_RETRIEVAL_TOP_K,
  TaskV2Item,
  buildConditionHint,
  getTaskApplicableFacts,
  getTaskRealFlags,
  retrieveApplicableLessonsForTask,
} from '../src/eval/ablation.js';
import { FACT_STATEMENTS, getApplicableFacts } from './facts.js';
import type { Lesson } from '../src/memory.js';
import type { CalibrationInput } from './propose-bound-facts.js';

export const AUDIT_CONDITIONS: readonly ConditionId[] = ['A', 'B', 'C', 'C0', 'D', 'E_B'];

export function buildSystemAndUserMessages(
  task: Pick<TaskV2Item, 'prompt' | 'table' | 'features'>,
  lessonHint?: string
): { system: string; user: string; estimatedTokens: number } {
  const system = `You generate PostgreSQL 16 SQL migrations.
Output raw executable PostgreSQL 16 SQL DDL only (no Markdown code fences, no commentary).
Environment context:
- Database: PostgreSQL 16, schema \`public\`.
- Existing reference tables: \`public.tenants(id uuid PRIMARY KEY)\`, \`public.users(id uuid PRIMARY KEY, tenant_id uuid)\`, \`public.customers(id uuid PRIMARY KEY, tenant_id uuid)\`.
- Existing JWT helper function: \`auth.jwt() RETURNS jsonb\`.
- Existing database roles: \`deployer\`, \`application\`, \`readonly_user\`.
Create the requested table \`public.${task.table}\` along with appropriate columns, constraints, indexes, triggers, row-level security policies, views, and role grants for the given table flags.${lessonHint ? `\n\nCRITICAL LESSONS FROM PREVIOUS FAILURES:\n${lessonHint}` : ''}`;

  const user = `${task.prompt}\nTarget Table: public.${task.table}\nFeature Flags: tenant=${task.features.tenant}, append_only=${task.features.append_only}, ingestion=${task.features.ingestion}`;
  const estimatedTokens = Math.ceil((system.length + user.length) / 4);
  return { system, user, estimatedTokens };
}

export function buildInMemoryPlaceholderMemory(
  trainTasks: TaskV2Item[],
  calibration: CalibrationInput
): Lesson[] {
  const stats = calibration.factStats ?? calibration.perFactStats ?? [];
  const statByFact = new Map(stats.map((s) => [s.factId, s]));
  const now = '2026-11-07T00:00:00.000Z';
  const lessons: Lesson[] = [];

  for (const fact of ELIGIBLE_FACTS) {
    const matching = trainTasks.filter((t) =>
      getApplicableFacts(getTaskRealFlags(t)).includes(fact.id)
    );
    if (matching.length === 0) continue;

    const observedFeatures = {
      seenWhenTenantTrue: matching.some((t) => Boolean(t.features.tenant)),
      seenWhenTenantFalse: matching.some((t) => !Boolean(t.features.tenant)),
      seenWhenAppendOnlyTrue: matching.some((t) => Boolean(t.features.append_only)),
      seenWhenAppendOnlyFalse: matching.some((t) => !Boolean(t.features.append_only)),
      seenWhenIngestionTrue: matching.some((t) => Boolean(t.features.ingestion)),
      seenWhenIngestionFalse: matching.some((t) => !Boolean(t.features.ingestion)),
    };
    const stat = statByFact.get(fact.id);
    const appCount = stat?.applicableCount ?? matching.length;
    const passRate = stat?.passRate ?? 1;
    const trainFailureRate = appCount > 0 && Number.isFinite(passRate) ? Number((1 - passRate).toFixed(6)) : 0;
    const failedCount = Math.round(trainFailureRate * appCount);

    lessons.push({
      errorCode: fact.id,
      factId: fact.id,
      lesson: `[lesson for ${fact.id}]`,
      features: { ...matching[0].features },
      observedFeatures,
      utilityScore: failedCount > 0 ? failedCount : 0,
      trainFailureRate,
      createdAt: now,
      lastUsedAt: now,
    });
  }

  return lessons;
}

export function selectFourRepresentativeTrainTasks(trainTasks: TaskV2Item[]): TaskV2Item[] {
  const sorted = [...trainTasks].sort((a, b) => a.id.localeCompare(b.id));
  const seenCells = new Set<string>();
  const selected: TaskV2Item[] = [];

  for (const task of sorted) {
    const cellKey = `${Boolean(task.features.tenant)}|${Boolean(task.features.append_only)}|${Boolean(task.features.ingestion)}`;
    if (!seenCells.has(cellKey)) {
      seenCells.add(cellKey);
      selected.push(task);
      if (selected.length === 4) break;
    }
  }
  return selected;
}

export interface TaskPromptAuditResult {
  taskId: string;
  cell: { tenant: boolean; append_only: boolean; ingestion: boolean };
  applicableFacts: string[];
  conditions: Record<
    ConditionId,
    {
      system: string;
      user: string;
      estimatedTokens: number;
      retrievedFactIds: string[];
      nonApplicableFactIdsInMessage: string[];
    }
  >;
  checks: {
    c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts: boolean;
    dTipsNotInApplicableSet: boolean;
    ebByteIdenticalToB: boolean;
    noCorrectedSql: boolean;
    noNonApplicableFactIdsAllConditions: boolean;
    noNonApplicableFactIdsByCondition: Record<ConditionId, boolean>;
    noReferenceSolutionText: boolean;
  };
}

export function auditTaskConditionPrompts(
  task: TaskV2Item,
  memory: readonly Lesson[]
): TaskPromptAuditResult {
  const applicableFacts = getTaskApplicableFacts(task);
  const applicableSet = new Set(applicableFacts);
  const conditions = {} as TaskPromptAuditResult['conditions'];

  for (const condition of AUDIT_CONDITIONS) {
    const hint = buildConditionHint(condition, task, memory);
    const { system, user, estimatedTokens } = buildSystemAndUserMessages(task, hint);
    const retrievedFactIds =
      condition === 'C' || condition === 'C0'
        ? retrieveApplicableLessonsForTask(task, memory, SQL_RETRIEVAL_TOP_K).map(
            (l) => l.factId ?? l.errorCode
          )
        : [];
    const combined = `${system}\n${user}`;
    const mentionedFactIds = Array.from(
      new Set((combined.match(/\bF-\d{2}\b/g) ?? []).sort())
    );
    const nonApplicableFactIdsInMessage = mentionedFactIds.filter(
      (id) => !applicableSet.has(id)
    );

    conditions[condition] = {
      system,
      user,
      estimatedTokens,
      retrievedFactIds,
      nonApplicableFactIdsInMessage,
    };
  }

  // Check 1: C0 hints use only canonical statements of the same retrieved facts as C
  const cIds = conditions.C.retrievedFactIds;
  const c0Ids = conditions.C0.retrievedFactIds;
  const expectedC0Hint =
    c0Ids.length > 0
      ? `DYNAMIC MEMORY LESSONS (VERBATIM ORACLE):\n${c0Ids
          .map((id) => `- [${id}] ${FACT_STATEMENTS[id]}`)
          .join('\n')}`
      : undefined;
  const actualC0Hint = buildConditionHint('C0', task, memory);
  const c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts =
    JSON.stringify(cIds) === JSON.stringify(c0Ids) && actualC0Hint === expectedC0Hint;

  // Check 2: D tips are not in the applicable set
  const dHint = buildConditionHint('D', task, memory) ?? '';
  const dContainsApplicableFactId = (dHint.match(/\bF-\d{2}\b/g) ?? []).some((id) =>
    applicableSet.has(id)
  );
  const dContainsApplicableFactStatement = applicableFacts.some((id) => {
    const stmt = FACT_STATEMENTS[id];
    return Boolean(stmt && dHint.includes(stmt));
  });
  const dTipsNotInApplicableSet =
    !dContainsApplicableFactId && !dContainsApplicableFactStatement;

  // Check 3: E_B messages are byte-identical to B
  const ebByteIdenticalToB =
    conditions.E_B.system === conditions.B.system &&
    conditions.E_B.user === conditions.B.user;

  // Check 4: No message contains corrected SQL
  const ddlRegex =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|POLICY|TRIGGER|FUNCTION|INDEX)\b|\bALTER\s+TABLE\b/i;
  const noCorrectedSql = AUDIT_CONDITIONS.every((cond) => {
    const { system, user } = conditions[cond];
    return !ddlRegex.test(system) && !ddlRegex.test(user);
  });

  // Check 5: No message contains fact IDs of facts not applicable to the task
  const noNonApplicableFactIdsByCondition = Object.fromEntries(
    AUDIT_CONDITIONS.map((cond) => [
      cond,
      conditions[cond].nonApplicableFactIdsInMessage.length === 0,
    ])
  ) as Record<ConditionId, boolean>;
  const noNonApplicableFactIdsAllConditions = Object.values(
    noNonApplicableFactIdsByCondition
  ).every(Boolean);

  // Check 6: No message contains reference-solution text
  const goldenTrimmed = task.goldenSql.trim();
  const goldenFirstLine = goldenTrimmed.split(/\r?\n/)[0]?.trim() ?? '';
  const noReferenceSolutionText = AUDIT_CONDITIONS.every((cond) => {
    const combined = `${conditions[cond].system}\n${conditions[cond].user}`;
    if (goldenTrimmed && combined.includes(goldenTrimmed)) return false;
    if (goldenFirstLine && combined.includes(goldenFirstLine)) return false;
    return true;
  });

  return {
    taskId: task.id,
    cell: {
      tenant: Boolean(task.features.tenant),
      append_only: Boolean(task.features.append_only),
      ingestion: Boolean(task.features.ingestion),
    },
    applicableFacts,
    conditions,
    checks: {
      c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts,
      dTipsNotInApplicableSet,
      ebByteIdenticalToB,
      noCorrectedSql,
      noNonApplicableFactIdsAllConditions,
      noNonApplicableFactIdsByCondition,
      noReferenceSolutionText,
    },
  };
}

export function runConditionPromptAudit(
  trainTasks?: TaskV2Item[],
  calibration?: CalibrationInput
) {
  const resolvedTasks =
    trainTasks ??
    (
      JSON.parse(
        fs.readFileSync(path.resolve('fixtures/task-v2/tasks.json'), 'utf8')
      ) as { train: TaskV2Item[] }
    ).train;
  const resolvedCalibration =
    calibration ??
    (JSON.parse(
      fs.readFileSync(path.resolve('out/train-calibration.json'), 'utf8')
    ) as CalibrationInput);

  const memory = buildInMemoryPlaceholderMemory(resolvedTasks, resolvedCalibration);
  const selectedTasks = selectFourRepresentativeTrainTasks(resolvedTasks);
  const taskAudits = selectedTasks.map((t) => auditTaskConditionPrompts(t, memory));

  const summaryChecks = {
    c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts: taskAudits.every(
      (a) => a.checks.c0UsesOnlyCanonicalStatementsOfSameRetrievedFacts
    ),
    dTipsNotInApplicableSet: taskAudits.every((a) => a.checks.dTipsNotInApplicableSet),
    ebByteIdenticalToB: taskAudits.every((a) => a.checks.ebByteIdenticalToB),
    noCorrectedSql: taskAudits.every((a) => a.checks.noCorrectedSql),
    noNonApplicableFactIdsAllConditions: taskAudits.every(
      (a) => a.checks.noNonApplicableFactIdsAllConditions
    ),
    noNonApplicableFactIdsByCondition: Object.fromEntries(
      AUDIT_CONDITIONS.map((cond) => [
        cond,
        taskAudits.every((a) => a.checks.noNonApplicableFactIdsByCondition[cond]),
      ])
    ) as Record<ConditionId, boolean>,
    noReferenceSolutionText: taskAudits.every((a) => a.checks.noReferenceSolutionText),
  };

  return {
    printedTaskIds: selectedTasks.map((t) => t.id),
    summaryChecks,
    taskAudits,
  };
}

function main(): void {
  const report = runConditionPromptAudit();
  fs.mkdirSync(path.resolve('out/proposed'), { recursive: true });
  fs.writeFileSync(
    path.resolve('out/proposed/condition-prompts-audit.json'),
    JSON.stringify(report, null, 2)
  );

  for (const audit of report.taskAudits) {
    console.log(
      `=== Task ${audit.taskId} (tenant=${audit.cell.tenant}, append_only=${audit.cell.append_only}, ingestion=${audit.cell.ingestion}) ===`
    );
    for (const cond of AUDIT_CONDITIONS) {
      const c = audit.conditions[cond];
      console.log(`--- Condition ${cond} (estimatedTokens=${c.estimatedTokens}) ---`);
      console.log('[SYSTEM]');
      console.log(c.system);
      console.log('[USER]');
      console.log(c.user);
    }
  }
  console.log('=== AUDIT CHECK SUMMARY ===');
  console.log(
    JSON.stringify(
      {
        printedTaskIds: report.printedTaskIds,
        summaryChecks: report.summaryChecks,
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.endsWith('audit-condition-prompts.ts')) {
  main();
}
