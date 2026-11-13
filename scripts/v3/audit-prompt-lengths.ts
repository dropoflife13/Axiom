import fs from 'node:fs';
import path from 'node:path';
import {
  V3_CONDITIONS,
  buildConditionV3Hint,
  loadV3ContextAssets,
  type ConditionV3Id,
} from '../../src/eval/ablation-v3.js';
import type { TaskV2Item } from '../../src/eval/ablation-v2.js';

export function tokenizePromptText(text: string): string[] {
  if (!text) return [];
  return text.match(/[A-Za-z0-9_]+|[^\s\w]/g) ?? [];
}

export function computeTokenJaccard(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : Number((intersection / union).toFixed(6));
}

export function computeTokenLevenshtein(tokensA: string[], tokensB: string[]): number {
  const m = tokensA.length;
  const n = tokensB.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const a = tokensA[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = a === tokensB[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

export function buildFullPromptText(
  task: TaskV2Item,
  lesson: string | undefined
): { systemPrompt: string; userPrompt: string; fullPrompt: string } {
  const systemPrompt = `You generate PostgreSQL 16 SQL migrations.
Output raw executable PostgreSQL 16 SQL DDL only (no Markdown code fences, no commentary).
Environment context:
- Database: PostgreSQL 16, schema \`public\`.
- Existing reference tables: \`public.tenants(id uuid PRIMARY KEY)\`, \`public.users(id uuid PRIMARY KEY, tenant_id uuid)\`, \`public.customers(id uuid PRIMARY KEY, tenant_id uuid)\`.
- Existing JWT helper function: \`auth.jwt() RETURNS jsonb\`.
- Existing database roles: \`deployer\`, \`application\`, \`readonly_user\`.
Create the requested table \`public.${task.table}\` along with appropriate columns, constraints, indexes, triggers, row-level security policies, views, and role grants for the given table flags.${lesson ? `\n\nCRITICAL LESSONS FROM PREVIOUS FAILURES:\n${lesson}` : ''}`;
  const userPrompt = `${task.prompt}\nTarget Table: public.${task.table}\nFeature Flags: tenant=${task.features.tenant}, append_only=${task.features.append_only}, ingestion=${task.features.ingestion}`;
  return {
    systemPrompt,
    userPrompt,
    fullPrompt: `${systemPrompt}\n\n${userPrompt}`,
  };
}

function summarizeNumbers(values: number[]) {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    mean: Number((sum / sorted.length).toFixed(4)),
    median: Number(median.toFixed(4)),
    min: Number(sorted[0].toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4)),
  };
}

export function runPromptLengthAudit(root = path.resolve('.')) {
  const tasksPath = path.join(root, 'fixtures', 'task-v3', 'tasks.json');
  const raw = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const allTasks: TaskV2Item[] = Array.isArray(raw) ? raw : raw.test ?? raw.tasks ?? [];
  const heldOutTasks = allTasks.filter((t) => t.id.startsWith('V3-H-'));
  if (heldOutTasks.length !== 120) {
    throw new Error(`Expected 120 held-out V3-H-* tasks, found ${heldOutTasks.length}`);
  }

  const { assets } = loadV3ContextAssets(root);

  const perConditionStats: Record<
    ConditionV3Id,
    {
      promptChars: number[];
      promptTokens: number[];
      hintChars: number[];
      hintTokens: number[];
    }
  > = {
    A: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    D_safe: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    C: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    C0: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    C0_clean: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    C_ID: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    C0_rand: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
    B: { promptChars: [], promptTokens: [], hintChars: [], hintTokens: [] },
  };

  const perTaskRows: Array<{
    taskId: string;
    dSafeOverCidPromptTokenRatio: number;
    dSafeOverCidPromptCharRatio: number;
    cVsCidHintJaccard: number;
    cVsCidHintLevenshtein: number;
    cVsCidHintNormalizedLevenshtein: number;
    conditions: Record<
      ConditionV3Id,
      { promptChars: number; promptTokens: number; hintChars: number; hintTokens: number }
    >;
  }> = [];

  for (const task of heldOutTasks) {
    const condMap = {} as Record<
      ConditionV3Id,
      {
        promptChars: number;
        promptTokens: number;
        hintChars: number;
        hintTokens: number;
        hintTokensList: string[];
      }
    >;

    for (const cond of V3_CONDITIONS) {
      const built = buildConditionV3Hint(cond, task, assets);
      const { fullPrompt } = buildFullPromptText(task, built.hint);
      const promptChars = fullPrompt.length;
      const promptTokensList = tokenizePromptText(fullPrompt);
      const promptTokens = promptTokensList.length;
      const hintText = built.hint ?? '';
      const hintChars = hintText.length;
      const hintTokensList = tokenizePromptText(hintText);
      const hintTokens = hintTokensList.length;

      perConditionStats[cond].promptChars.push(promptChars);
      perConditionStats[cond].promptTokens.push(promptTokens);
      perConditionStats[cond].hintChars.push(hintChars);
      perConditionStats[cond].hintTokens.push(hintTokens);

      condMap[cond] = {
        promptChars,
        promptTokens,
        hintChars,
        hintTokens,
        hintTokensList,
      };
    }

    const dSafeOverCidPromptTokenRatio = Number(
      (condMap.D_safe.promptTokens / Math.max(1, condMap.C_ID.promptTokens)).toFixed(4)
    );
    const dSafeOverCidPromptCharRatio = Number(
      (condMap.D_safe.promptChars / Math.max(1, condMap.C_ID.promptChars)).toFixed(4)
    );
    const cVsCidHintJaccard = computeTokenJaccard(
      condMap.C.hintTokensList,
      condMap.C_ID.hintTokensList
    );
    const cVsCidHintLevenshtein = computeTokenLevenshtein(
      condMap.C.hintTokensList,
      condMap.C_ID.hintTokensList
    );
    const maxLen = Math.max(
      1,
      condMap.C.hintTokensList.length,
      condMap.C_ID.hintTokensList.length
    );
    const cVsCidHintNormalizedLevenshtein = Number(
      (cVsCidHintLevenshtein / maxLen).toFixed(4)
    );

    const strippedConditions = {} as Record<
      ConditionV3Id,
      { promptChars: number; promptTokens: number; hintChars: number; hintTokens: number }
    >;
    for (const cond of V3_CONDITIONS) {
      strippedConditions[cond] = {
        promptChars: condMap[cond].promptChars,
        promptTokens: condMap[cond].promptTokens,
        hintChars: condMap[cond].hintChars,
        hintTokens: condMap[cond].hintTokens,
      };
    }

    perTaskRows.push({
      taskId: task.id,
      dSafeOverCidPromptTokenRatio,
      dSafeOverCidPromptCharRatio,
      cVsCidHintJaccard,
      cVsCidHintLevenshtein,
      cVsCidHintNormalizedLevenshtein,
      conditions: strippedConditions,
    });
  }

  const conditionSummary = Object.fromEntries(
    V3_CONDITIONS.map((cond) => [
      cond,
      {
        promptChars: summarizeNumbers(perConditionStats[cond].promptChars),
        promptTokens: summarizeNumbers(perConditionStats[cond].promptTokens),
        hintChars: summarizeNumbers(perConditionStats[cond].hintChars),
        hintTokens: summarizeNumbers(perConditionStats[cond].hintTokens),
      },
    ])
  );

  return {
    generatedAt: new Date().toISOString(),
    taskCount: heldOutTasks.length,
    conditions: V3_CONDITIONS,
    conditionSummary,
    ratiosAndSimilarity: {
      dSafeOverCidPromptTokenRatio: summarizeNumbers(
        perTaskRows.map((r) => r.dSafeOverCidPromptTokenRatio)
      ),
      dSafeOverCidPromptCharRatio: summarizeNumbers(
        perTaskRows.map((r) => r.dSafeOverCidPromptCharRatio)
      ),
      cVsCidHintJaccard: summarizeNumbers(perTaskRows.map((r) => r.cVsCidHintJaccard)),
      cVsCidHintLevenshtein: summarizeNumbers(
        perTaskRows.map((r) => r.cVsCidHintLevenshtein)
      ),
      cVsCidHintNormalizedLevenshtein: summarizeNumbers(
        perTaskRows.map((r) => r.cVsCidHintNormalizedLevenshtein)
      ),
    },
    perTask: perTaskRows,
  };
}

function main() {
  const root = path.resolve('.');
  const outPath = path.join(root, 'out', 'v3', 'prompt-length-audit.json');
  const report = runPromptLengthAudit(root);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath} (${report.taskCount} tasks × ${report.conditions.length} conditions)`);
  console.log(
    `D_safe / C_ID promptTokenRatio mean=${report.ratiosAndSimilarity.dSafeOverCidPromptTokenRatio.mean}, C vs C_ID hint Jaccard mean=${report.ratiosAndSimilarity.cVsCidHintJaccard.mean}, Levenshtein mean=${report.ratiosAndSimilarity.cVsCidHintLevenshtein.mean}`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '');
if (isMain) {
  main();
}
