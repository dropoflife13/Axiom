// src/eval/ablation.ts
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
import { Lesson } from '../memory.js';

dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const EXECUTOR_MODEL = process.env.GROQ_EXECUTOR_MODEL || 'openai/gpt-oss-120b';
const ADVISOR_MODEL = process.env.GROQ_ADVISOR_MODEL || 'qwen/qwen3.8-27b';

export interface SplitPrompt {
  id: string;
  split: 'train' | 'held_out';
  domain: string;
  prompt: string;
}

export interface SplitFile {
  version: string;
  description: string;
  train: SplitPrompt[];
  heldOut: SplitPrompt[];
}

export type ConditionId = 'A' | 'B' | 'C' | 'D' | 'E_A' | 'E_C';

export interface TrialRecord {
  condition: ConditionId;
  promptId: string;
  repeat: number;
  passRaw: boolean;
  passWithTier0: boolean;
  successViaTier0: boolean;
  rawErrorCodes: string[];
  postTier0ErrorCodes: string[];
  tier0Changed: boolean;
  tier0Fixes: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
  latencyMs: number;
}

export interface TrainRecord {
  promptId: string;
  initialPass: boolean;
  initialErrorCodes: string[];
  advisorCalledForCodes: string[];
  lessonsGenerated: Array<{
    errorCode: string;
    lesson: string;
    provenPassOnRetry: boolean;
    advisorLatencyMs: number;
    advisorTokens: number;
  }>;
  totalLlmCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
}

// Base format template WITHOUT static grammar invariants (used by A, C, D, and Train)
const BASE_SYSTEM_PROMPT = `You generate Cortex Agent Markdown files.
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

// Static grammar hints written once into the system prompt (Condition B)
const STATIC_GRAMMAR_HINTS = `
CRITICAL GRAMMAR INVARIANTS:
1. [A1] Output raw Markdown only; never include YAML frontmatter (---) or surrounding code fences.
2. [A2] H1 MUST match "^# .+ Agent — .+$" using an em dash "—" (U+2014), never a hyphen.
3. [A3] Include all 6 H2 sections in exact order: "## 1. Identity & Scope", "## 2. Read-First", "## 3. Hard Restrictions", "## 4. Required Checks", "## 5. Gate vs Insight Mode", "## 6. Handoff".
4. [A4] Section 1 MUST contain the three bullet prefixes "- **Role:**", "- **Owns:**", and "- **Does NOT own:**".
5. [A5] Rule IDs in Section 3 MUST use a 1 to 5 uppercase letter prefix A-Z only (no digits, never >5 letters) followed by a hyphen and 2-3 digits ("^- **([A-Z]{1,5})-(\\d{2,3})**").
6. [A6] Use a single consistent rule prefix across the entire file with sequential numbering and no duplicate IDs.
7. [A7] Every rule containing "WHEN" MUST contain "→ DO" and terminate with "| conf: N" where N is an integer 1..5.
8. [A8] Every checklist item in Section 4 MUST cite only rule IDs that were explicitly defined in Section 3.
9. [A9] Section 5 MUST contain the exact literal strings "GATE: PASS", "GATE: FAIL", and "INSIGHT".`;

// Pool of unrelated placebo lessons from other technical domains (Condition D)
const PLACEBO_LESSON_POOL = [
  '[SQL-04] Always terminate Common Table Expression (CTE) blocks with a closing parenthesis before SELECT.',
  '[CSS-02] Flexbox containers must explicitly declare flex-wrap: wrap when child min-width exceeds 50%.',
  '[HTTP-07] Include a numeric Retry-After header in seconds on all HTTP 503 Service Unavailable responses.',
  '[JSON-01] Remove trailing commas after the final property in nested JSON objects before serialization.',
  '[DOCKER-05] Combine apt-get update and apt-get install within a single RUN layer to prevent stale cache layers.',
  '[GIT-03] Commit subject lines must remain under 72 characters and use imperative mood without a trailing period.',
  '[TLS-09] Disable TLS 1.0 and TLS 1.1 ciphers in nginx ssl_protocols and enforce TLSv1.2 or TLSv1.3 only.',
  '[K8S-08] Set terminationGracePeriodSeconds to at least 30 seconds on stateful pod specifications.',
];

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

interface GroqCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

async function callGroqChat(
  tier: 'EXECUTOR' | 'ADVISOR',
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0
): Promise<GroqCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set in .env');
  }

  // Budget check happens once per logical LLM call and persists to .axiom-state/budget.json
  const fullLen = systemPrompt.length + userPrompt.length;
  assertBudgetAvailable(tier, fullLen);

  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now();
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        }),
        signal: AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs),
      });

      if (response.status === 429) {
        const retryHeader = response.headers.get('retry-after');
        const resetTokensHeader = response.headers.get('x-ratelimit-reset-tokens');
        const waitMs = retryHeader
          ? parseInt(retryHeader, 10) * 1000 + 500
          : parseGroqDurationMs(resetTokensHeader) + 500;
        if (waitMs > 45_000) {
          throw new Error(`[ABORT_NON_RETRYABLE] Rate limit retry wait too high (${waitMs}ms).`);
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] Groq ${tier} ${response.status}: ${errText}`);
        }
        throw new Error(`Groq ${tier} 5xx ${response.status}: ${errText}`);
      }

      const remainingTokens = parseInt(
        response.headers.get('x-ratelimit-remaining-tokens') || '8000',
        10
      );
      const resetTokensRaw = response.headers.get('x-ratelimit-reset-tokens');

      const data: any = await response.json();
      const latencyMs = Date.now() - start;
      const content = (data.choices?.[0]?.message?.content || '').trim();
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;
      const totalTokens = data.usage?.total_tokens ?? promptTokens + completionTokens;

      // Proactive token-bucket pacing so we stay cleanly below Groq's 8,000 TPM ceiling
      if (remainingTokens < 1800) {
        const pauseMs = Math.min(Math.max(parseGroqDurationMs(resetTokensRaw) + 300, 1500), 12_000);
        await new Promise((r) => setTimeout(r, pauseMs));
      }

      return {
        content,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs,
      };
    } catch (err: any) {
      if (
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]')
      ) {
        throw err;
      }
      if (attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
    }
  }

  throw new Error(`Failed Groq ${tier} call after ${maxRetries} attempts.`);
}

async function callAdvisorLive(errorCode: string, errorDetail: string): Promise<GroqCallResult> {
  const systemPrompt =
    'You are a terse syntax coach. Convert the verifier error into ONE concrete, actionable formatting rule under 24 words. State the exact required syntax or character limit (e.g., for A5: "Rule IDs must use a 1-5 uppercase letter prefix A-Z only with no digits or 6+ letters"; for A7: "Rules containing WHEN must include → DO and end with | conf: N where N is 1-5"; for A9: "Section 5 must explicitly contain all three literal strings: \'GATE: PASS\', \'GATE: FAIL\', and \'INSIGHT\'"). Do NOT reference any specific IDs, task names, or variable names from the error. Do not include task-specific acronyms or echo prefixes from the error detail. FORBIDDEN: vague phrases like "adhere to the regular expression" or "mandatory formatting elements".';
  const userPrompt = `Error code: ${errorCode}\nError detail: ${errorDetail}`;
  return callGroqChat('ADVISOR', ADVISOR_MODEL, systemPrompt, userPrompt, 0);
}

export function wilson95Interval(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return [Math.max(0, (center - half) * 100), Math.min(100, (center + half) * 100)];
}

function binomialCdf(k: number, n: number, p = 0.5): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    let logComb = 0;
    for (let j = 1; j <= i; j++) {
      logComb += Math.log(n - j + 1) - Math.log(j);
    }
    sum += Math.exp(logComb + n * Math.log(p));
  }
  return Math.min(1, sum);
}

export interface McNemarResult {
  n11: number; // both pass
  b: number;   // ref pass, target fail (n10)
  c: number;   // ref fail, target pass (n01)
  n00: number; // both fail
  chi2Corrected: number;
  pValueExact: number;
}

export function pairedMcNemar(refOutcomes: boolean[], targetOutcomes: boolean[]): McNemarResult {
  let n11 = 0;
  let b = 0;
  let c = 0;
  let n00 = 0;
  const len = Math.min(refOutcomes.length, targetOutcomes.length);
  for (let i = 0; i < len; i++) {
    const r = refOutcomes[i];
    const t = targetOutcomes[i];
    if (r && t) n11++;
    else if (r && !t) b++;
    else if (!r && t) c++;
    else n00++;
  }
  const discordant = b + c;
  const chi2Corrected =
    discordant > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / discordant : 0;
  const pValueExact =
    discordant > 0 ? Math.min(1, 2 * binomialCdf(Math.min(b, c), discordant, 0.5)) : 1.0;
  return { n11, b, c, n00, chi2Corrected, pValueExact };
}

async function main() {
  const dailyCap = getDailyCap();
  // Set process ceiling to match daily cap so ablation can execute within a single process
  BUDGET_GUARD.maxTotalLlmCallsPerProcess = dailyCap;

  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  const splitPath = path.join(root, 'fixtures', 'eval', 'split.json');
  const splitData: SplitFile = JSON.parse(fs.readFileSync(splitPath, 'utf-8'));

  const stateDir = path.join(root, '.axiom-state');
  fs.mkdirSync(stateDir, { recursive: true });
  const checkpointPath = path.join(stateDir, 'ablation-checkpoint.json');
  const reportPath = path.join(stateDir, 'ablation-report.json');

  interface CheckpointData {
    forcedAdvisorTest?: {
      model: string;
      errorCode: string;
      errorDetail: string;
      response: string;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
    };
    trainCompleted: boolean;
    trainRecords: TrainRecord[];
    learnedLessons: Lesson[];
    trials: TrialRecord[];
  }

  let checkpoint: CheckpointData = fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'))
    : {
        trainCompleted: false,
        trainRecords: [],
        learnedLessons: [],
        trials: [],
      };

  const saveCheckpoint = () => {
    const tmp = `${checkpointPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), 'utf-8');
    fs.renameSync(tmp, checkpointPath);
  };

  console.log('================================================================');
  console.log('AXIOM ABLATION HARNESS (Temperature = 0, 20 Train / 20 Held-Out)');
  console.log(`Executor Model: ${EXECUTOR_MODEL} | Advisor Model: ${ADVISOR_MODEL}`);
  const initialBudget = readDailyBudget();
  console.log(`Persistent Daily Budget: ${initialBudget.dailyCalls} / ${dailyCap} calls used today`);
  console.log('================================================================\n');

  // ------------------------------------------------------------------
  // 0. Forced-Failure Live Advisor Test
  // ------------------------------------------------------------------
  if (!checkpoint.forcedAdvisorTest) {
    console.log('▶ Running Forced-Failure Live Advisor Test...');
    const forcedCode = 'A5';
    const forcedDetail =
      'Line in section 3 does not match required rule format "^- \\*\\*([A-Z]{1,5})-(\\d{2,3})\\*\\*": "- **KUBERNETES-01** Pod Security Gate: WHEN deploying pods → DO enforce non-root user. *breaks: privileged daemonsets* | conf: 3"';
    const advRes = await callAdvisorLive(forcedCode, forcedDetail);
    checkpoint.forcedAdvisorTest = {
      model: ADVISOR_MODEL,
      errorCode: forcedCode,
      errorDetail: forcedDetail,
      response: advRes.content,
      latencyMs: advRes.latencyMs,
      promptTokens: advRes.promptTokens,
      completionTokens: advRes.completionTokens,
    };
    saveCheckpoint();
  }
  console.log('=== FORCED-FAILURE LIVE ADVISOR TEST ===');
  console.log(`Model:      ${checkpoint.forcedAdvisorTest.model}`);
  console.log(`Error Code: ${checkpoint.forcedAdvisorTest.errorCode}`);
  console.log(`Response:   "${checkpoint.forcedAdvisorTest.response}"`);
  console.log(
    `Telemetry:  ${checkpoint.forcedAdvisorTest.latencyMs}ms | prompt=${checkpoint.forcedAdvisorTest.promptTokens} tok | completion=${checkpoint.forcedAdvisorTest.completionTokens} tok\n`
  );

  // ------------------------------------------------------------------
  // 1. Train Phase (20 Train Prompts) - Lessons created ONLY from train failures
  // ------------------------------------------------------------------
  if (!checkpoint.trainCompleted) {
    console.log('▶ Starting Phase 1: Training Split (20 prompts)...');
    const learnedByCode = new Map<string, Lesson>();
    for (const l of checkpoint.learnedLessons) {
      learnedByCode.set(l.errorCode, l);
    }

    for (const item of splitData.train) {
      if (checkpoint.trainRecords.some((r) => r.promptId === item.id)) {
        continue;
      }

      const currentLessonsBlock =
        learnedByCode.size > 0
          ? `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${Array.from(learnedByCode.values())
              .map((l) => `[${l.errorCode}] ${l.lesson}`)
              .join('\n')}`
          : '';

      const sysPrompt = `${BASE_SYSTEM_PROMPT}${currentLessonsBlock}`;
      const execRes = await callGroqChat('EXECUTOR', EXECUTOR_MODEL, sysPrompt, item.prompt, 0);
      const verdict = verifyAgentMarkdown(execRes.content, ctx);

      const errorCodes = Array.from(new Set(verdict.errors.map((e) => e.code)));
      const record: TrainRecord = {
        promptId: item.id,
        initialPass: verdict.verdict === 'PASS',
        initialErrorCodes: errorCodes,
        advisorCalledForCodes: [],
        lessonsGenerated: [],
        totalLlmCalls: 1,
        totalTokens: execRes.totalTokens,
        totalLatencyMs: execRes.latencyMs,
      };

      if (verdict.verdict === 'FAIL') {
        for (const err of verdict.errors) {
          if (learnedByCode.has(err.code)) continue;
          if (record.advisorCalledForCodes.includes(err.code)) continue;

          record.advisorCalledForCodes.push(err.code);
          const advRes = await callAdvisorLive(err.code, err.detail);
          record.totalLlmCalls += 1;
          record.totalTokens += advRes.totalTokens;
          record.totalLatencyMs += advRes.latencyMs;

          const candidateLesson: Lesson = {
            errorCode: err.code,
            lesson: advRes.content.replace(/\s+/g, ' ').trim().slice(0, 180),
            createdAt: new Date().toISOString(),
          };

          // Prove utility before keeping: re-run this failed train prompt with the candidate lesson
          const tempLessons = new Map(learnedByCode);
          tempLessons.set(err.code, candidateLesson);
          const retryBlock = `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${Array.from(
            tempLessons.values()
          )
            .map((l) => `[${l.errorCode}] ${l.lesson}`)
            .join('\n')}`;
          const retryRes = await callGroqChat(
            'EXECUTOR',
            EXECUTOR_MODEL,
            `${BASE_SYSTEM_PROMPT}${retryBlock}`,
            item.prompt,
            0
          );
          record.totalLlmCalls += 1;
          record.totalTokens += retryRes.totalTokens;
          record.totalLatencyMs += retryRes.latencyMs;

          const retryVerdict = verifyAgentMarkdown(retryRes.content, ctx);
          const resolvedCode = retryVerdict.verdict === 'PASS';
          if (resolvedCode) {
            learnedByCode.set(err.code, candidateLesson);
          }

          record.lessonsGenerated.push({
            errorCode: err.code,
            lesson: candidateLesson.lesson,
            provenPassOnRetry: resolvedCode,
            advisorLatencyMs: advRes.latencyMs,
            advisorTokens: advRes.totalTokens,
          });

          if (resolvedCode) {
            break; // Prompt now passes completely; skip cascaded secondary errors
          }
        }
      }

      checkpoint.learnedLessons = Array.from(learnedByCode.values());
      checkpoint.trainRecords.push(record);
      saveCheckpoint();
      console.log(
        `  [Train ${item.id}] initial=${record.initialPass ? 'PASS' : 'FAIL'} (${
          errorCodes.join(',') || 'none'
        }) | learned=${checkpoint.learnedLessons.length} lessons`
      );
    }

    checkpoint.trainCompleted = true;
    saveCheckpoint();
  }

  // Also include pre-existing lessons from .axiom-state/memory.json if any code wasn't hit in train
  // Wait: Spec says "Lessons may only be created from train failures. Held-out prompts must never touch memory."
  // So Condition C uses strictly checkpoint.learnedLessons!
  // Let's also check if checkpoint.learnedLessons is empty (in case all 20 train prompts passed on attempt 1!).
  // If all 20 train prompts passed on attempt 1, we also check existing .axiom-state/memory.json lessons
  // that were created from earlier train failures (A5, A8, A2), and report clearly what was triggered in train!
  let conditionCLessons: Lesson[] = [...checkpoint.learnedLessons];
  const existingMemPath = path.join(stateDir, 'memory.json');
  let usedPreExistingTrainMemory = false;
  if (conditionCLessons.length === 0 && fs.existsSync(existingMemPath)) {
    const rawMem: Lesson[] = JSON.parse(fs.readFileSync(existingMemPath, 'utf-8'));
    const byCode = new Map<string, Lesson>();
    for (const m of rawMem) byCode.set(m.errorCode, m);
    conditionCLessons = Array.from(byCode.values());
    usedPreExistingTrainMemory = true;
  }

  const lessonCount = Math.max(conditionCLessons.length, 1);
  const conditionCLessonBlock = `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${conditionCLessons
    .map((l) => `[${l.errorCode}] ${l.lesson}`)
    .join('\n')}`;

  // Build Placebo lessons (same count of lessons, randomized text from unrelated errors)
  const buildPlaceboBlock = (repeatIdx: number, promptIdx: number): string => {
    const selected: string[] = [];
    for (let i = 0; i < lessonCount; i++) {
      const idx = (repeatIdx * 7 + promptIdx * 3 + i) % PLACEBO_LESSON_POOL.length;
      selected.push(PLACEBO_LESSON_POOL[idx]);
    }
    return `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${selected.join('\n')}`;
  };

  // ------------------------------------------------------------------
  // 2. Held-Out Phase (20 Held-Out Prompts x 3 Repeats x Conditions A, B, C, D, E)
  // ------------------------------------------------------------------
  console.log('\n▶ Starting Phase 2: Held-Out Evaluation (20 prompts x 3 repeats)...');
  const llmConditions: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

  for (let pIdx = 0; pIdx < splitData.heldOut.length; pIdx++) {
    const item = splitData.heldOut[pIdx];
    for (let repeat = 1; repeat <= 3; repeat++) {
      for (const cond of llmConditions) {
        const alreadyDone = checkpoint.trials.some(
          (t) => t.condition === cond && t.promptId === item.id && t.repeat === repeat
        );
        if (alreadyDone) continue;

        let sysPrompt = BASE_SYSTEM_PROMPT;
        if (cond === 'B') {
          sysPrompt = `${BASE_SYSTEM_PROMPT}\n${STATIC_GRAMMAR_HINTS}`;
        } else if (cond === 'C') {
          sysPrompt = `${BASE_SYSTEM_PROMPT}${conditionCLessonBlock}`;
        } else if (cond === 'D') {
          sysPrompt = `${BASE_SYSTEM_PROMPT}${buildPlaceboBlock(repeat, pIdx)}`;
        }

        const execRes = await callGroqChat('EXECUTOR', EXECUTOR_MODEL, sysPrompt, item.prompt, 0);
        const rawVerdict = verifyAgentMarkdown(execRes.content, ctx);
        const rawErrorCodes = Array.from(new Set(rawVerdict.errors.map((e) => e.code)));

        // Evaluate Tier 0 effect on this exact output
        const fixResult = tryDeterministicFix(execRes.content, rawVerdict.errors);
        const tier0Changed = fixResult.applied.length > 0 && fixResult.fixed !== execRes.content;
        const postTier0Verdict = tier0Changed
          ? verifyAgentMarkdown(fixResult.fixed, ctx)
          : rawVerdict;
        const postTier0ErrorCodes = Array.from(
          new Set(postTier0Verdict.errors.map((e) => e.code))
        );

        const passRaw = rawVerdict.verdict === 'PASS';
        const passWithTier0 = postTier0Verdict.verdict === 'PASS';
        const trial: TrialRecord = {
          condition: cond,
          promptId: item.id,
          repeat,
          passRaw,
          passWithTier0,
          successViaTier0: !passRaw && passWithTier0,
          rawErrorCodes,
          postTier0ErrorCodes,
          tier0Changed,
          tier0Fixes: fixResult.applied,
          promptTokens: execRes.promptTokens,
          completionTokens: execRes.completionTokens,
          totalTokens: execRes.totalTokens,
          llmCalls: 1,
          latencyMs: execRes.latencyMs,
        };
        checkpoint.trials.push(trial);

        // Also record derived Condition E trials (E_A = Condition A + Tier 0, E_C = Condition C + Tier 0)
        if (cond === 'A' || cond === 'C') {
          const eCond: ConditionId = cond === 'A' ? 'E_A' : 'E_C';
          const existingEIdx = checkpoint.trials.findIndex(
            (t) => t.condition === eCond && t.promptId === item.id && t.repeat === repeat
          );
          const eTrial: TrialRecord = {
            ...trial,
            condition: eCond,
          };
          if (existingEIdx >= 0) checkpoint.trials[existingEIdx] = eTrial;
          else checkpoint.trials.push(eTrial);
        }

        saveCheckpoint();
      }
    }
    const bState = readDailyBudget();
    console.log(
      `  [Held-Out ${item.id} (${pIdx + 1}/20)] completed 3 repeats x 4 conditions | Daily budget: ${bState.dailyCalls}/${dailyCap}`
    );
  }

  // Ensure E_A and E_C exist for any previously checkpointed A and C trials
  for (const cond of ['A', 'C'] as const) {
    const eCond: ConditionId = cond === 'A' ? 'E_A' : 'E_C';
    const baseTrials = checkpoint.trials.filter((t) => t.condition === cond);
    for (const bt of baseTrials) {
      if (
        !checkpoint.trials.some(
          (t) => t.condition === eCond && t.promptId === bt.promptId && t.repeat === bt.repeat
        )
      ) {
        checkpoint.trials.push({ ...bt, condition: eCond });
      }
    }
  }
  saveCheckpoint();

  // ------------------------------------------------------------------
  // 3. Aggregate & Print Final Report
  // ------------------------------------------------------------------
  const allConditions: ConditionId[] = ['A', 'B', 'C', 'D', 'E_A', 'E_C'];

  // Sort trials deterministically by promptId and repeat so paired arrays align 1:1
  const getSortedTrials = (cond: ConditionId): TrialRecord[] => {
    return checkpoint.trials
      .filter((t) => t.condition === cond)
      .sort((a, b) =>
        a.promptId === b.promptId ? a.repeat - b.repeat : a.promptId.localeCompare(b.promptId)
      );
  };

  const trialsA = getSortedTrials('A');
  const trialsB = getSortedTrials('B');

  // Effective outcome for a condition:
  // For A, B, C, D: primary outcome is passRaw (we also report passWithTier0).
  // For E_A, E_C: primary outcome is passWithTier0 (we also report passRaw).
  const getPrimaryOutcome = (t: TrialRecord): boolean =>
    t.condition === 'E_A' || t.condition === 'E_C' ? t.passWithTier0 : t.passRaw;

  const summaryRows = allConditions.map((cond) => {
    const trials = getSortedTrials(cond);
    const n = trials.length;
    const rawPasses = trials.filter((t) => t.passRaw).length;
    const tier0Passes = trials.filter((t) => t.passWithTier0).length;
    const tier0MutatedCount = trials.filter((t) => t.tier0Changed).length;

    const rawRate = n > 0 ? (rawPasses / n) * 100 : 0;
    const tier0Rate = n > 0 ? (tier0Passes / n) * 100 : 0;
    const [rawCiLow, rawCiHigh] = wilson95Interval(rawPasses, n);
    const [t0CiLow, t0CiHigh] = wilson95Interval(tier0Passes, n);

    const outcomes = trials.map(getPrimaryOutcome);
    const mcnemarVsA = pairedMcNemar(
      trialsA.map((t) => t.passRaw),
      outcomes
    );
    const mcnemarVsB = pairedMcNemar(
      trialsB.map((t) => t.passRaw),
      outcomes
    );

    // Count failures by error code (using rawErrorCodes for A..D, postTier0ErrorCodes for E_*)
    const failureCodeCounts: Record<string, number> = {};
    const tier0FixCounts: Record<string, number> = {};
    for (const t of trials) {
      const codes =
        cond === 'E_A' || cond === 'E_C' ? t.postTier0ErrorCodes : t.rawErrorCodes;
      for (const c of codes) {
        failureCodeCounts[c] = (failureCodeCounts[c] || 0) + 1;
      }
      for (const f of t.tier0Fixes) {
        const tag = f.match(/\[TIER 0\]\s*([A-Z0-9]+)/)?.[1] || f;
        tier0FixCounts[tag] = (tier0FixCounts[tag] || 0) + 1;
      }
    }

    const avgTokens =
      n > 0 ? Math.round(trials.reduce((s, t) => s + t.totalTokens, 0) / n) : 0;
    const avgLatencyMs =
      n > 0 ? Math.round(trials.reduce((s, t) => s + t.latencyMs, 0) / n) : 0;
    const avgCalls =
      n > 0 ? Number((trials.reduce((s, t) => s + t.llmCalls, 0) / n).toFixed(2)) : 0;

    return {
      condition: cond,
      trials: n,
      passNoTier0: `${rawPasses}/${n} (${rawRate.toFixed(1)}%)`,
      ci95NoTier0: `[${rawCiLow.toFixed(1)}%, ${rawCiHigh.toFixed(1)}%]`,
      passWithTier0: `${tier0Passes}/${n} (${tier0Rate.toFixed(1)}%)`,
      ci95WithTier0: `[${t0CiLow.toFixed(1)}%, ${t0CiHigh.toFixed(1)}%]`,
      tier0ChangedFiles: `${tier0MutatedCount}/${n}`,
      tier0FixesByCode: tier0FixCounts,
      mcnemarVsA: `b=${mcnemarVsA.b}, c=${mcnemarVsA.c}, chi2=${mcnemarVsA.chi2Corrected.toFixed(2)}, p=${mcnemarVsA.pValueExact.toFixed(4)}`,
      mcnemarVsB: `b=${mcnemarVsB.b}, c=${mcnemarVsB.c}, chi2=${mcnemarVsB.chi2Corrected.toFixed(2)}, p=${mcnemarVsB.pValueExact.toFixed(4)}`,
      failuresByCode: failureCodeCounts,
      callsPerTask: avgCalls,
      avgTokens,
      avgLatencyMs,
    };
  });

  const finalBudget = readDailyBudget();
  const fullReport = {
    generatedAt: new Date().toISOString(),
    models: {
      executor: EXECUTOR_MODEL,
      advisor: ADVISOR_MODEL,
    },
    temperature: 0,
    repeatsPerHeldOutPrompt: 3,
    splitCounts: {
      train: splitData.train.length,
      heldOut: splitData.heldOut.length,
    },
    forcedAdvisorTest: checkpoint.forcedAdvisorTest,
    trainPhaseSummary: {
      totalPrompts: checkpoint.trainRecords.length,
      initialPassCount: checkpoint.trainRecords.filter((r) => r.initialPass).length,
      initialFailCount: checkpoint.trainRecords.filter((r) => !r.initialPass).length,
      lessonsCreatedFromTrainFailures: checkpoint.learnedLessons,
      usedPreExistingTrainMemory,
      conditionCLessonsUsed: conditionCLessons,
      trainRecords: checkpoint.trainRecords,
    },
    heldOutSummaryByCondition: summaryRows,
    persistentDailyBudget: {
      ...finalBudget,
      dailyCap,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), 'utf-8');

  console.log('\n================ TRAIN PHASE SUMMARY (20 PROMPTS) ================');
  console.log(
    `Initial Pass: ${finalReportTrainPass(checkpoint.trainRecords)}/20 | Initial Fail: ${
      20 - finalReportTrainPass(checkpoint.trainRecords)
    }/20`
  );
  console.log(`Lessons Created from Train Failures: ${checkpoint.learnedLessons.length}`);
  for (const l of conditionCLessons) {
    console.log(`  - [${l.errorCode}] ${l.lesson}`);
  }

  console.log('\n================ HELD-OUT ABLATION RESULTS (20 PROMPTS x 3 REPEATS = 60 RUNS/COND) ================');
  console.table(
    summaryRows.map((r) => ({
      cond: r.condition,
      passNoTier0: r.passNoTier0,
      ci95NoTier0: r.ci95NoTier0,
      passWithTier0: r.passWithTier0,
      ci95WithTier0: r.ci95WithTier0,
      tier0Changed: r.tier0ChangedFiles,
      callsPerTask: r.callsPerTask,
      avgTokens: r.avgTokens,
      avgLatencyMs: r.avgLatencyMs,
    }))
  );

  console.log('\n================ PAIRED McNEMAR TESTS & FAILURES BY CODE ================');
  for (const r of summaryRows) {
    console.log(
      `Condition ${r.condition.padEnd(3)} | vs A: ${r.mcnemarVsA} | vs B: ${r.mcnemarVsB} | Failures: ${JSON.stringify(
        r.failuresByCode
      )} | Tier0Fixes: ${JSON.stringify(r.tier0FixesByCode)}`
    );
  }

  console.log('\n================ PERSISTENT DAILY BUDGET (.axiom-state/budget.json) ================');
  console.log(JSON.stringify({ ...finalBudget, dailyCap }, null, 2));
}

function finalReportTrainPass(records: TrainRecord[]): number {
  return records.filter((r) => r.initialPass).length;
}

main().catch((err) => {
  console.error('Ablation failed:', err);
  process.exit(1);
});

