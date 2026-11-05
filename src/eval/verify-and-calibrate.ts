// src/eval/verify-and-calibrate.ts
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { verifyAgentMarkdown } from '../verifier/agent-verifier.js';
import { buildVaultIndex } from '../verifier/vault-index.js';
import { tryDeterministicFix } from '../fixer.js';
import {
  BUDGET_GUARD,
  assertBudgetAvailable,
  readDailyBudget,
  getDailyCap,
} from '../guardrails.js';
import type { SplitFile, SplitPrompt } from './ablation.js';

dotenv.config();

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const EXECUTOR_MODEL = process.env.GROQ_EXECUTOR_MODEL || 'openai/gpt-oss-120b';

// Structural skeleton only (H1 + 6 H2 headers + checklist citation skeleton).
// Does NOT include A5 (1-5 letter A-Z prefix limit), A7 (WHEN -> DO | conf: N rule), or A9 prose hints.
export const BASE_SYSTEM_PROMPT = `You generate Cortex Agent Markdown files.
Output raw Markdown only (no YAML frontmatter, no surrounding code fences).
Use standard ASCII hyphens "-" (U+002D) everywhere; never use Unicode non-breaking hyphens "‑" (U+2011).
You must output Markdown with this H1 format and exactly these 6 H2 headers in order:

# [Name] Agent — [Subtitle]

## 1. Identity & Scope
- **Role:** [Role description]
- **Owns:** [Owned deliverables]
- **Does NOT own:** [Explicitly unowned areas]

## 2. Read-First
- [Reference documentation]

## 3. Hard Restrictions
- **[ID]-01** [Rule title and restriction]

## 4. Required Checks
- [ ] [Verification item] ([ID]-01)

## 5. Gate vs Insight Mode
- **Gate** (GATE: PASS / GATE: FAIL): [Blocking evaluation criteria]
- **Insight** (INSIGHT): [Non-blocking guidance]

## 6. Handoff
- [Receives work from and hands off to appropriate agents]`;

function parseGroqDurationMs(raw: string | null): number {
  if (!raw) return 3000;
  let totalMs = 0;
  const minMatch = raw.match(/(\d+(?:\.\d+)?)m(?!s)/);
  if (minMatch) totalMs += parseFloat(minMatch[1]) * 60_000;
  const secMatch = raw.match(/(\d+(?:\.\d+)?)s/);
  if (secMatch) totalMs += parseFloat(secMatch[1]) * 1000;
  const msMatch = raw.match(/(\d+(?:\.\d+)?)ms/);
  if (msMatch) totalMs += parseFloat(msMatch[1]);
  return totalMs > 0 ? totalMs : 3000;
}

interface CalRecord {
  id: string;
  split: 'train' | 'held_out';
  domain: string;
  passRaw: boolean;
  passWithTier0: boolean;
  successViaTier0: boolean;
  errorCodes: string[];
  errorDetails: string[];
  tier0Fixes: string[];
  tokens: number;
  latencyMs: number;
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const dailyCap = getDailyCap();
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = dailyCap;

  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  const splitPath = path.join(root, 'fixtures', 'eval', 'split.json');
  const splitData: SplitFile = JSON.parse(fs.readFileSync(splitPath, 'utf-8'));
  const allPrompts: SplitPrompt[] = [...splitData.train, ...splitData.heldOut];

  console.log('================================================================');
  console.log('CONDITION A CALIBRATION ACROSS ALL 40 PROMPTS (20 TRAIN + 20 HELD-OUT)');
  console.log(`Executor Model: ${EXECUTOR_MODEL} | Temperature: 0 | No Memory | No Static Hints`);
  const startBudget = readDailyBudget();
  console.log(`Starting Daily Budget: ${startBudget.dailyCalls} / ${dailyCap}`);
  console.log('================================================================\n');

  const results: CalRecord[] = [];

  for (const item of allPrompts) {
    assertBudgetAvailable('EXECUTOR', BASE_SYSTEM_PROMPT.length + item.prompt.length);
    let attempt = 0;
    while (attempt < 5) {
      const t0 = Date.now();
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EXECUTOR_MODEL,
          messages: [
            { role: 'system', content: BASE_SYSTEM_PROMPT },
            { role: 'user', content: item.prompt },
          ],
          temperature: 0,
        }),
      });

      if (res.status === 429) {
        const waitMs = parseGroqDurationMs(res.headers.get('x-ratelimit-reset-tokens')) + 500;
        await new Promise((r) => setTimeout(r, waitMs));
        attempt++;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq HTTP ${res.status}: ${errText}`);
      }

      const remainingTok = parseInt(res.headers.get('x-ratelimit-remaining-tokens') || '8000', 10);
      const resetTok = res.headers.get('x-ratelimit-reset-tokens');
      const data: any = await res.json();
      const latencyMs = Date.now() - t0;
      const content = (data.choices?.[0]?.message?.content || '').trim();

      const verdict = verifyAgentMarkdown(content, ctx);
      const errorCodes = Array.from(new Set(verdict.errors.map((e) => e.code)));
      const errorDetails = verdict.errors.map((e) => `[${e.code}] ${e.detail}`);

      const fixResult = tryDeterministicFix(content, verdict.errors);
      const tier0Recheck =
        fixResult.applied.length > 0 ? verifyAgentMarkdown(fixResult.fixed, ctx) : verdict;
      const passRaw = verdict.verdict === 'PASS';
      const passWithTier0 = tier0Recheck.verdict === 'PASS';

      results.push({
        id: item.id,
        split: item.split,
        domain: item.domain,
        passRaw,
        passWithTier0,
        successViaTier0: !passRaw && passWithTier0,
        errorCodes,
        errorDetails,
        tier0Fixes: fixResult.applied,
        tokens: data.usage?.total_tokens ?? 0,
        latencyMs,
      });

      console.log(
        `  [${item.id}] (${item.split.padEnd(8)} | ${item.domain.padEnd(9)}) -> Raw: ${
          passRaw ? 'PASS' : 'FAIL'
        } | Tier0: ${passWithTier0 ? 'PASS' : 'FAIL'} | errors: [${
          errorCodes.join(', ') || 'none'
        }] | ${latencyMs}ms`
      );
      if (!passRaw && errorDetails.length > 0) {
        console.log(`       1st error: ${errorDetails[0].slice(0, 120)}`);
      }

      if (remainingTok < 1800) {
        await new Promise((r) =>
          setTimeout(r, Math.min(Math.max(parseGroqDurationMs(resetTok) + 300, 1500), 10_000))
        );
      }
      break;
    }
  }

  const summarize = (subset: CalRecord[], label: string) => {
    const n = subset.length;
    const rawPass = subset.filter((r) => r.passRaw).length;
    const t0Pass = subset.filter((r) => r.passWithTier0).length;
    const viaT0 = subset.filter((r) => r.successViaTier0).length;
    const rawRate = n > 0 ? rawPass / n : 0;
    const t0Rate = n > 0 ? t0Pass / n : 0;
    const errCounts: Record<string, number> = {};
    for (const r of subset) {
      for (const c of r.errorCodes) {
        errCounts[c] = (errCounts[c] || 0) + 1;
      }
    }
    return {
      label,
      total: n,
      rawPassCount: rawPass,
      rawFailCount: n - rawPass,
      rawPassRate: Number(rawRate.toFixed(4)),
      rawPassPct: `${(rawRate * 100).toFixed(1)}%`,
      inTargetBand_0_30_to_0_70: rawRate >= 0.3 && rawRate <= 0.7,
      passWithTier0Count: t0Pass,
      passWithTier0Pct: `${(t0Rate * 100).toFixed(1)}%`,
      successViaTier0Count: viaT0,
      errorCodeDistribution: errCounts,
    };
  };

  const trainSummary = summarize(
    results.filter((r) => r.split === 'train'),
    'Train Split (20 prompts)'
  );
  const heldOutSummary = summarize(
    results.filter((r) => r.split === 'held_out'),
    'Held-Out Split (20 prompts)'
  );
  const combinedSummary = summarize(results, 'Combined (40 prompts)');

  const report = {
    timestamp: new Date().toISOString(),
    trainSummary,
    heldOutSummary,
    combinedSummary,
    dailyBudgetState: readDailyBudget(),
    results,
  };

  fs.writeFileSync(
    path.join(root, '.axiom-state', 'calibration-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  console.log('\n================ CONDITION A CALIBRATION REPORT (40 PROMPTS) ================');
  console.table([
    {
      Split: trainSummary.label,
      'Raw Pass (LLM Only)': `${trainSummary.rawPassCount}/${trainSummary.total} (${trainSummary.rawPassPct})`,
      'In [0.30, 0.70] Band': trainSummary.inTargetBand_0_30_to_0_70 ? 'YES ✅' : 'NO ❌',
      'Pass w/ Tier 0': `${trainSummary.passWithTier0Count}/${trainSummary.total} (${trainSummary.passWithTier0Pct})`,
      'Saved by Tier 0': trainSummary.successViaTier0Count,
      'Errors by Code': JSON.stringify(trainSummary.errorCodeDistribution),
    },
    {
      Split: heldOutSummary.label,
      'Raw Pass (LLM Only)': `${heldOutSummary.rawPassCount}/${heldOutSummary.total} (${heldOutSummary.rawPassPct})`,
      'In [0.30, 0.70] Band': heldOutSummary.inTargetBand_0_30_to_0_70 ? 'YES ✅' : 'NO ❌',
      'Pass w/ Tier 0': `${heldOutSummary.passWithTier0Count}/${heldOutSummary.total} (${heldOutSummary.passWithTier0Pct})`,
      'Saved by Tier 0': heldOutSummary.successViaTier0Count,
      'Errors by Code': JSON.stringify(heldOutSummary.errorCodeDistribution),
    },
    {
      Split: combinedSummary.label,
      'Raw Pass (LLM Only)': `${combinedSummary.rawPassCount}/${combinedSummary.total} (${combinedSummary.rawPassPct})`,
      'In [0.30, 0.70] Band': combinedSummary.inTargetBand_0_30_to_0_70 ? 'YES ✅' : 'NO ❌',
      'Pass w/ Tier 0': `${combinedSummary.passWithTier0Count}/${combinedSummary.total} (${combinedSummary.passWithTier0Pct})`,
      'Saved by Tier 0': combinedSummary.successViaTier0Count,
      'Errors by Code': JSON.stringify(combinedSummary.errorCodeDistribution),
    },
  ]);
  console.log('Daily Budget Used:', JSON.stringify(readDailyBudget()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
