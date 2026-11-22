// scripts/v4/run-policy-abac-pilot.ts
// Lightweight 4-Arm Policy-as-Code ABAC Pilot Runner (18 tasks x 4 arms = 72 calls/model)
// for Axiom-HOPE (Ablation v4).
//
// Arms:
//   A           — Zero-Shot (base Cedar grammar prompt only)
//   C           — Top-4 unconstrained distilled lessons (policy-abac-c.json)
//   C_ID_auto   — Top-4 lexical-locked distilled lessons (policy-abac-cid-auto.json)
//   C_ID_prereq — Top-4 lexical-locked + Prerequisite-Aware Retrieval (same K=4 budget)
//
// Outputs strictly under .axiom-state/runs-v4/ and out/v4/. Never touches v2/v3 state.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  getModelProfile,
  normalizeModelName,
  resolveEndpoint,
  sanitizeReasoningTags,
} from '../../src/executor.js';
import {
  DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH,
  PolicyAbacCartridge,
  type PolicyAbacTask,
} from '../../src/v4/cartridges/policy-abac-cartridge.js';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  computeArtifactSha256,
  evaluateLexicalIdentifierLock,
} from '../../src/v4/hope/index.js';
import { retrieveWithPrerequisites } from '../../src/v4/prerequisite-retriever.js';
import {
  POLICY_VAULT_C_PATH,
  POLICY_VAULT_CID_AUTO_PATH,
  type PolicyAbacVaultFile,
} from './build-policy-abac-vaults.js';

dotenv.config();

export type PilotArm = 'A' | 'C' | 'C_ID_auto' | 'C_ID_prereq' | 'C_ID_hope';
export const PILOT_ARMS: readonly PilotArm[] = ['A', 'C', 'C_ID_auto', 'C_ID_prereq'];
export const ALL_PILOT_ARMS: readonly PilotArm[] = [
  'A',
  'C',
  'C_ID_auto',
  'C_ID_prereq',
  'C_ID_hope',
];

export interface PilotTrialRecord {
  readonly key: string;
  readonly taskId: string;
  readonly domain: PolicyAbacTask['domain'];
  readonly cohortId: string;
  readonly arm: PilotArm;
  readonly retrievedRuleIds: readonly string[];
  readonly injectedPrerequisites: readonly string[];
  readonly displacedRuleIds: readonly string[];
  readonly promptChars: number;
  readonly artifactSha256: string;
  readonly policyText: string;
  readonly committed: boolean;
  readonly fullTaskPass: boolean;
  readonly boundFactsCount: number;
  readonly passedFactsCount: number;
  readonly factPassRate: number;
  readonly passedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly forensicFlags: Readonly<Record<string, boolean>>;
  readonly stderr?: string;
  readonly returnedModel: string;
  readonly finishReason: string;
  readonly latencyMs: number;
  readonly timestamp: string;
}

export interface PilotCheckpointFile {
  readonly schemaVersion: '4.0.0-policy-pilot';
  readonly cartridgeId: 'policy-abac-v4';
  readonly requestedModel: string;
  readonly modelSlug: string;
  readonly topK: number;
  readonly temperature: number;
  readonly totalPlannedTrials: number;
  readonly tasksSha256: string;
  readonly vaultCSha256: string;
  readonly vaultCidAutoSha256: string;
  readonly startedAt: string;
  updatedAt: string;
  trials: Record<string, PilotTrialRecord>;
}

export interface ArmSummaryStats {
  readonly arm: PilotArm;
  readonly totalTasks: number;
  readonly fullTaskPassCount: number;
  readonly fullTaskPassRate: number;
  readonly meanFactPassRate: number;
  readonly committedCount: number;
  readonly committedRate: number;
  readonly p01RetrievedCount: number;
  readonly p02RetrievedCount: number;
  readonly forensicDefectCounts: Record<string, number>;
}

export interface PilotSummaryReport {
  readonly schemaVersion: '4.0.0-policy-pilot-summary';
  readonly model: string;
  readonly modelSlug: string;
  readonly topK: number;
  readonly temperature: number;
  readonly totalTrials: number;
  readonly arms: Partial<Record<PilotArm, ArmSummaryStats>> &
    Record<'A' | 'C' | 'C_ID_auto' | 'C_ID_prereq', ArmSummaryStats>;
  readonly contrastsPp: {
    readonly C_ID_auto_minus_C_task: number;
    readonly C_ID_auto_minus_C_fact: number;
    readonly C_ID_prereq_minus_C_ID_auto_task: number;
    readonly C_ID_prereq_minus_C_ID_auto_fact: number;
    readonly C_ID_prereq_minus_C_task: number;
    readonly C_ID_prereq_minus_C_fact: number;
    readonly C_ID_prereq_minus_A_task: number;
    readonly C_ID_prereq_minus_A_fact: number;
    readonly C_ID_hope_minus_C_task?: number;
    readonly C_ID_hope_minus_C_fact?: number;
    readonly C_ID_hope_minus_C_ID_auto_task?: number;
    readonly C_ID_hope_minus_C_ID_auto_fact?: number;
    readonly C_ID_hope_minus_C_ID_prereq_task?: number;
    readonly C_ID_hope_minus_C_ID_prereq_fact?: number;
    readonly C_ID_hope_minus_A_task?: number;
    readonly C_ID_hope_minus_A_fact?: number;
  };
  readonly generatedAt: string;
}

const RETRIEVAL_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'must', 'require', 'requiring',
  'write', 'cedar', 'style', 'abac', 'policy', 'policies', 'enforcing', 'every',
  'bundle', 'include', 'explicit', 'rule', 'actions', 'action', 'resource', 'principal',
  'context', 'when', 'all', 'including', 'true', 'false',
]);

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function slugifyModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tokenizes text into normalized retrieval terms (preserving namespaced entities and snake_case).
 */
function tokenizeForRetrieval(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  for (const m of lower.matchAll(/[a-z]+::"[^"]+"/g)) {
    tokens.push(m[0]);
  }
  for (const m of lower.matchAll(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g)) {
    tokens.push(m[0]);
  }
  for (const m of lower.matchAll(/[a-z0-9]{3,}/g)) {
    const w = m[0];
    if (!RETRIEVAL_STOP_WORDS.has(w)) {
      tokens.push(w);
    }
  }
  return tokens;
}

/**
 * Unsupervised TF-IDF ranking of all canonical vault rules against `task.prompt`
 * (zero access to `boundFacts` or `applicableFacts`).
 * Produces the exact same deterministic `rankedIds` order for C, C_ID_auto, and C_ID_prereq.
 */
export function rankRulesByPromptTfIdf(
  taskPrompt: string,
  canonicalRules: readonly CanonicalRule[]
): string[] {
  const docTokens = canonicalRules.map((rule) => {
    const raw = `${rule.statement} ${(rule.check ?? '').replace(/-/g, ' ')}`;
    return new Set(tokenizeForRetrieval(raw));
  });

  const df = new Map<string, number>();
  for (const termSet of docTokens) {
    for (const term of termSet) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const N = canonicalRules.length;
  const queryTerms = Array.from(new Set(tokenizeForRetrieval(taskPrompt)));

  const scored = canonicalRules.map((rule, idx) => {
    const termSet = docTokens[idx];
    let score = 0;
    for (const qt of queryTerms) {
      if (termSet.has(qt)) {
        const docFreq = df.get(qt) ?? 1;
        const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
        // Boost exact namespaced entity matches (e.g., action::"approve_payout")
        const boost = qt.includes('::"') ? 2.5 : qt.includes('_') ? 1.5 : 1.0;
        score += idf * boost;
      }
    }
    // Slight length normalization so short generic rules don't artificially dominate or collapse
    const normScore = score / Math.sqrt(Math.max(termSet.size, 1));
    return { id: rule.id, score: normScore };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-12) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return scored.map((s) => s.id);
}

/**
 * Base Cedar-style ABAC syntax prompt (grammar only; zero leakage of hidden attribute names
 * or numeric thresholds). Identical across all 4 arms.
 */
export function buildBasePolicySystemPrompt(lessonsBlock?: string): string {
  const base = [
    'You generate Cedar-style Policy-as-Code (ABAC) authorization policies.',
    'Output ONLY raw Cedar-style policy statements (no Markdown code fences, no commentary, no explanations).',
    '',
    'Strict Grammar Supported by the Execution Engine:',
    '- Optional annotation before each statement: @id("rule-name")',
    '- Statement header: permit (principal, action == Action::"<action_name>", resource == Resource::"<ResourceType>")',
    '  or wildcard forbid: forbid (principal, action, resource)',
    '- Optional condition blocks: when { <boolean_expr> } and/or unless { <boolean_expr> }',
    '- Every statement MUST terminate with a semicolon `;`.',
    '- Expression syntax:',
    '  * Attribute paths rooted at `principal`, `resource`, or `context` (e.g., `principal.attr_a == resource.attr_a`, `context.flag_x == true`).',
    '  * Literals: double-quoted strings `"..."`, integers, `true`, `false`, `null`.',
    '  * Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, `in`.',
    '- Do NOT use unsupported Cedar extensions such as `principal is ...`, `has`, `like`, `decimal(...)`, or `ip(...)`.',
    '- Semantics: Explicit `forbid` overrides `permit`; unmatched requests are default-denied.',
  ].join('\n');

  if (!lessonsBlock) return base;
  return `${base}\n\nCRITICAL AUTHORIZATION LESSONS FROM PRIOR AUDITS:\n${lessonsBlock}`;
}

export function stripPolicyFences(raw: string): string {
  const sanitized = sanitizeReasoningTags(raw, { sqlAware: false }).sanitizedText.trim();
  const fullFence = sanitized.match(/^```[a-zA-Z0-9_-]*\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (fullFence) {
    return fullFence[1].trim();
  }
  return sanitized
    .replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
}

export type PolicyProviderOverride = 'gemini' | 'groq';

export function resolvePolicyProviderEndpoint(
  model: string,
  providerOverride?: PolicyProviderOverride
): { provider: string; apiKey: string; baseUrl: string; chatUrl: string } {
  if (providerOverride === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error('GEMINI_API_KEY is not set in .env.');
    }
    const baseUrl =
      process.env.GEMINI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta/openai/';
    return {
      provider: 'gemini',
      apiKey,
      baseUrl,
      chatUrl: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    };
  }
  if (providerOverride === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error('GROQ_API_KEY is not set in .env.');
    }
    const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    return {
      provider: 'groq',
      apiKey,
      baseUrl,
      chatUrl: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    };
  }
  return resolveEndpoint(model);
}

export async function generatePolicyViaLlm(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0,
  providerOverride?: PolicyProviderOverride
): Promise<{
  policyText: string;
  returnedModel: string;
  finishReason: string;
  latencyMs: number;
}> {
  const endpoint = resolvePolicyProviderEndpoint(model, providerOverride);
  const effectiveModel = normalizeModelName(model);
  const profile = getModelProfile(model);
  const MAX_RETRIES = 4;
  let rateLimitAttempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const response = await fetch(endpoint.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: profile.maxTokens,
          ...profile.extraRequestBody,
        }),
        signal: AbortSignal.timeout(Math.max(90_000, profile.timeoutMs)),
      });

      if (response.status === 429 || response.status === 503) {
        const errBody = await response.text().catch(() => '');
        const retryAfterRaw = response.headers.get('retry-after');
        const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : 5;
        const isDailyQuota =
          /tokens per day|requests per day|daily.*limit|quota exceeded/i.test(errBody) ||
          (!Number.isNaN(retryAfter) && retryAfter > 180);
        if (isDailyQuota) {
          throw new Error(
            `[RATE_LIMIT_QUOTA] ${endpoint.provider.toUpperCase()} HTTP ${response.status} (retry-after=${retryAfterRaw ?? 'n/a'}): ${errBody.slice(0, 300)}`
          );
        }

        rateLimitAttempts++;
        if (rateLimitAttempts > 20) {
          throw new Error(
            `[RATE_LIMIT_EXHAUSTED] Exceeded rate-limit retries (HTTP ${response.status}): ${errBody.slice(0, 200)}`
          );
        }
        const baseDelay = !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter : 5;
        const delayMs = Math.min((baseDelay + rateLimitAttempts * 2) * 1000, 45_000);
        console.warn(
          `[v4-pilot] ${endpoint.provider} HTTP ${response.status}; waiting ${(delayMs / 1000).toFixed(1)}s before retry (${rateLimitAttempts}/20)...`
        );
        await sleep(delayMs);
        attempt--;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(
            `[NON_RETRYABLE] ${endpoint.provider.toUpperCase()} executor HTTP ${response.status}: ${errText}`
          );
        }
        throw new Error(`${endpoint.provider.toUpperCase()} executor 5xx HTTP ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string };
        }>;
      };
      const choice = data.choices?.[0];
      const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const policyText = stripPolicyFences(rawContent);
      return {
        policyText,
        returnedModel: data.model ?? effectiveModel,
        finishReason: choice?.finish_reason ?? 'unknown',
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('[RATE_LIMIT_QUOTA]') ||
        msg.includes('[RATE_LIMIT_EXHAUSTED]') ||
        msg.includes('[NON_RETRYABLE]')
      ) {
        throw err;
      }
      if (attempt >= MAX_RETRIES) throw err;
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.warn(
        `[v4-pilot] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${backoffMs}ms...`
      );
      await sleep(backoffMs);
    }
  }

  throw new Error('Policy generation exhausted retries.');
}

export function summarizePilotCheckpoint(
  checkpoint: PilotCheckpointFile
): PilotSummaryReport {
  const trialsList = Object.values(checkpoint.trials);
  const presentArms = ALL_PILOT_ARMS.filter(
    (arm) => PILOT_ARMS.includes(arm) || trialsList.some((t) => t.arm === arm)
  );

  const armStats = {} as Record<PilotArm, ArmSummaryStats>;
  for (const arm of presentArms) {
    const subset = trialsList.filter((t) => t.arm === arm);
    const totalTasks = subset.length;
    const fullTaskPassCount = subset.filter((t) => t.fullTaskPass).length;
    const committedCount = subset.filter((t) => t.committed).length;
    const meanFactPassRate =
      totalTasks > 0
        ? subset.reduce((acc, t) => acc + t.factPassRate, 0) / totalTasks
        : 0;
    const p01RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('P-01')).length;
    const p02RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('P-02')).length;

    const defectCounts: Record<string, number> = {};
    for (const t of subset) {
      for (const [flag, val] of Object.entries(t.forensicFlags)) {
        if (defectCounts[flag] === undefined) defectCounts[flag] = 0;
        if (val) defectCounts[flag]++;
      }
    }

    armStats[arm] = {
      arm,
      totalTasks,
      fullTaskPassCount,
      fullTaskPassRate: totalTasks > 0 ? fullTaskPassCount / totalTasks : 0,
      meanFactPassRate,
      committedCount,
      committedRate: totalTasks > 0 ? committedCount / totalTasks : 0,
      p01RetrievedCount,
      p02RetrievedCount,
      forensicDefectCounts: defectCounts,
    };
  }

  const pp = (a: number, b: number) => Number(((a - b) * 100).toFixed(2));
  const hopeStats = armStats.C_ID_hope;

  return {
    schemaVersion: '4.0.0-policy-pilot-summary',
    model: checkpoint.requestedModel,
    modelSlug: checkpoint.modelSlug,
    topK: checkpoint.topK,
    temperature: checkpoint.temperature,
    totalTrials: trialsList.length,
    arms: armStats,
    contrastsPp: {
      C_ID_auto_minus_C_task: pp(
        armStats.C_ID_auto.fullTaskPassRate,
        armStats.C.fullTaskPassRate
      ),
      C_ID_auto_minus_C_fact: pp(
        armStats.C_ID_auto.meanFactPassRate,
        armStats.C.meanFactPassRate
      ),
      C_ID_prereq_minus_C_ID_auto_task: pp(
        armStats.C_ID_prereq.fullTaskPassRate,
        armStats.C_ID_auto.fullTaskPassRate
      ),
      C_ID_prereq_minus_C_ID_auto_fact: pp(
        armStats.C_ID_prereq.meanFactPassRate,
        armStats.C_ID_auto.meanFactPassRate
      ),
      C_ID_prereq_minus_C_task: pp(
        armStats.C_ID_prereq.fullTaskPassRate,
        armStats.C.fullTaskPassRate
      ),
      C_ID_prereq_minus_C_fact: pp(
        armStats.C_ID_prereq.meanFactPassRate,
        armStats.C.meanFactPassRate
      ),
      C_ID_prereq_minus_A_task: pp(
        armStats.C_ID_prereq.fullTaskPassRate,
        armStats.A.fullTaskPassRate
      ),
      C_ID_prereq_minus_A_fact: pp(
        armStats.C_ID_prereq.meanFactPassRate,
        armStats.A.meanFactPassRate
      ),
      ...(hopeStats
        ? {
            C_ID_hope_minus_C_task: pp(
              hopeStats.fullTaskPassRate,
              armStats.C.fullTaskPassRate
            ),
            C_ID_hope_minus_C_fact: pp(
              hopeStats.meanFactPassRate,
              armStats.C.meanFactPassRate
            ),
            C_ID_hope_minus_C_ID_auto_task: pp(
              hopeStats.fullTaskPassRate,
              armStats.C_ID_auto.fullTaskPassRate
            ),
            C_ID_hope_minus_C_ID_auto_fact: pp(
              hopeStats.meanFactPassRate,
              armStats.C_ID_auto.meanFactPassRate
            ),
            C_ID_hope_minus_C_ID_prereq_task: pp(
              hopeStats.fullTaskPassRate,
              armStats.C_ID_prereq.fullTaskPassRate
            ),
            C_ID_hope_minus_C_ID_prereq_fact: pp(
              hopeStats.meanFactPassRate,
              armStats.C_ID_prereq.meanFactPassRate
            ),
            C_ID_hope_minus_A_task: pp(
              hopeStats.fullTaskPassRate,
              armStats.A.fullTaskPassRate
            ),
            C_ID_hope_minus_A_fact: pp(
              hopeStats.meanFactPassRate,
              armStats.A.meanFactPassRate
            ),
          }
        : {}),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatSummaryMarkdown(summary: PilotSummaryReport): string {
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
  const activeArms = ALL_PILOT_ARMS.filter((arm) => Boolean(summary.arms[arm]));
  const armCount = activeArms.length;

  const lines: string[] = [
    `# Axiom-HOPE v4 Policy-as-Code ABAC Pilot Summary — \`${summary.model}\``,
    '',
    `- **Cartridge:** \`policy-abac-v4\` (18 held-out tasks × ${armCount} arms = ${summary.totalTrials} trials)`,
    `- **Retrieval Budget:** \`K = ${summary.topK}\`, \`temperature = ${summary.temperature}\``,
    '',
    `## 1. ${armCount}-Arm Performance Table`,
    '',
    '| Arm | Full-Task Pass | Mean Fact Pass | Committed | P-01 Retrieved | P-02 Retrieved |',
    '| :--- | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const arm of activeArms) {
    const s = summary.arms[arm]!;
    lines.push(
      `| \`${arm}\` | ${s.fullTaskPassCount}/${s.totalTasks} (${fmtPct(s.fullTaskPassRate)}) | ${fmtPct(s.meanFactPassRate)} | ${s.committedCount}/${s.totalTasks} (${fmtPct(s.committedRate)}) | ${s.p01RetrievedCount}/${s.totalTasks} | ${s.p02RetrievedCount}/${s.totalTasks} |`
    );
  }

  const c = summary.contrastsPp;
  lines.push(
    '',
    '## 2. Key Causal Contrasts',
    '',
    '| Contrast | Effect Isolated | Full-Task Delta | Mean Fact Delta |',
    '| :--- | :--- | :---: | :---: |',
    `| \`C_ID_auto - C\` | Automated Lexical Identifier Lock | ${fmtSigned(c.C_ID_auto_minus_C_task)} | ${fmtSigned(c.C_ID_auto_minus_C_fact)} |`,
    `| \`C_ID_prereq - C_ID_auto\` | Naive Static Prerequisite Injection (same K=${summary.topK}) | ${fmtSigned(c.C_ID_prereq_minus_C_ID_auto_task)} | ${fmtSigned(c.C_ID_prereq_minus_C_ID_auto_fact)} |`,
    `| \`C_ID_prereq - C\` | Static Prereq + Lexical Lock vs. Unconstrained \`C\` | ${fmtSigned(c.C_ID_prereq_minus_C_task)} | ${fmtSigned(c.C_ID_prereq_minus_C_fact)} |`,
    `| \`C_ID_prereq - A\` | Static Prereq vs. Zero-Shot Baseline | ${fmtSigned(c.C_ID_prereq_minus_A_task)} | ${fmtSigned(c.C_ID_prereq_minus_A_fact)} |`
  );

  if (summary.arms.C_ID_hope && c.C_ID_hope_minus_C_task !== undefined) {
    lines.push(
      `| \`C_ID_hope - C\` | **Closed-Loop 3-Clock Axiom-HOPE vs. Unconstrained \`C\`** | **${fmtSigned(c.C_ID_hope_minus_C_task)}** | **${fmtSigned(c.C_ID_hope_minus_C_fact!)}** |`,
      `| \`C_ID_hope - C_ID_auto\` | **Slow-Clock Promoted Graph/Rule Governance vs. \`C_ID_auto\`** | **${fmtSigned(c.C_ID_hope_minus_C_ID_auto_task!)}** | **${fmtSigned(c.C_ID_hope_minus_C_ID_auto_fact!)}** |`,
      `| \`C_ID_hope - C_ID_prereq\` | **Closed-Loop Canary-Gated HOPE vs. Naive Static Prereq** | **${fmtSigned(c.C_ID_hope_minus_C_ID_prereq_task!)}** | **${fmtSigned(c.C_ID_hope_minus_C_ID_prereq_fact!)}** |`,
      `| \`C_ID_hope - A\` | **Closed-Loop Axiom-HOPE vs. Zero-Shot \`A\`** | **${fmtSigned(c.C_ID_hope_minus_A_task!)}** | **${fmtSigned(c.C_ID_hope_minus_A_fact!)}** |`
    );
  }

  lines.push(
    '',
    '## 3. Forensic Defect Counts (out of 18 tasks per arm)',
    '',
    `| Forensic Flag | ${activeArms.map((a) => `\`${a}\``).join(' | ')} |`,
    `| :--- | ${activeArms.map(() => ':---:').join(' | ')} |`
  );

  const flagNames = Object.keys(summary.arms.A.forensicDefectCounts).sort();
  for (const flag of flagNames) {
    const counts = activeArms.map(
      (a) => `${summary.arms[a]?.forensicDefectCounts[flag] ?? 0}`
    );
    lines.push(`| \`${flag}\` | ${counts.join(' | ')} |`);
  }

  return `${lines.join('\n')}\n`;
}

export async function runPolicyAbacPilot(options: {
  model?: string;
  provider?: PolicyProviderOverride;
  topK?: number;
  delayMs?: number;
  vaultCPath?: string;
  vaultCidAutoPath?: string;
} = {}): Promise<PilotSummaryReport> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const provider = options.provider;
  const topK = options.topK ?? 4;
  const delayMs = options.delayMs ?? 350;
  const modelSlug = slugifyModel(model);

  const vaultCPath = path.resolve(options.vaultCPath ?? POLICY_VAULT_C_PATH);
  const vaultCidAutoPath = path.resolve(
    options.vaultCidAutoPath ?? POLICY_VAULT_CID_AUTO_PATH
  );

  if (!fs.existsSync(vaultCPath) || !fs.existsSync(vaultCidAutoPath)) {
    throw new Error(
      `Missing frozen v4 policy vaults. Run "npx tsx scripts/v4/build-policy-abac-vaults.ts" first.`
    );
  }

  const cartridge = new PolicyAbacCartridge();
  const tasks = cartridge.loadTasks();
  const { rules: canonicalRules } = cartridge.loadCanonicalRules();

  const vaultC = JSON.parse(fs.readFileSync(vaultCPath, 'utf8')) as PolicyAbacVaultFile;
  const vaultCidAuto = JSON.parse(
    fs.readFileSync(vaultCidAutoPath, 'utf8')
  ) as PolicyAbacVaultFile;

  // Verify C_ID_auto vault still passes 100% automated lexical identifier lock before executing
  for (const lesson of vaultCidAuto.lessons) {
    const lock = evaluateLexicalIdentifierLock(
      {
        candidateId: `VERIFY-${lesson.factId}`,
        factId: lesson.factId,
        triggerFlag: 'verify',
        proposedRuleText: lesson.lesson,
        proposedPrerequisiteEdges: [],
        evidenceHashes: [],
        observedCount: 1,
        status: 'staged',
        gateAudit: null,
        createdAt: '',
        updatedAt: '',
      },
      canonicalRules
    );
    if (!lock.passed) {
      throw new Error(
        `Vault integrity error: ${lesson.factId} in policy-abac-cid-auto.json failed Lexical Lock (${lock.missingTokens.join(', ')}).`
      );
    }
  }

  const lessonsCById = new Map(vaultC.lessons.map((l) => [l.factId, l.lesson]));
  const lessonsCidById = new Map(vaultCidAuto.lessons.map((l) => [l.factId, l.lesson]));

  const runDir = path.resolve('.axiom-state', 'runs-v4', `policy-abac-${modelSlug}`);
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  const outDir = path.resolve('out', 'v4');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tasksPath = path.resolve('fixtures', 'v4', 'policy-abac-tasks.json');
  const tasksSha256 = sha256File(tasksPath);
  const vaultCSha256 = sha256File(vaultCPath);
  const vaultCidAutoSha256 = sha256File(vaultCidAutoPath);

  let checkpoint: PilotCheckpointFile;
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf8')
    ) as PilotCheckpointFile;
    console.log(
      `[v4-pilot] Resuming ${checkpointPath} (${Object.keys(checkpoint.trials).length}/${checkpoint.totalPlannedTrials} completed)`
    );
  } else {
    const now = new Date().toISOString();
    checkpoint = {
      schemaVersion: '4.0.0-policy-pilot',
      cartridgeId: 'policy-abac-v4',
      requestedModel: model,
      modelSlug,
      topK,
      temperature: 0,
      totalPlannedTrials: tasks.length * PILOT_ARMS.length,
      tasksSha256,
      vaultCSha256,
      vaultCidAutoSha256,
      startedAt: now,
      updatedAt: now,
      trials: {},
    };
  }

  const saveCheckpoint = () => {
    checkpoint.updatedAt = new Date().toISOString();
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  };

  let completedCount = Object.keys(checkpoint.trials).length;
  const totalCount = tasks.length * PILOT_ARMS.length;

  for (const task of tasks) {
    const rankedRuleIds = rankRulesByPromptTfIdf(task.prompt, canonicalRules);
    const baselineTopK = rankedRuleIds.slice(0, topK);
    const prereqRetrieval = retrieveWithPrerequisites(
      rankedRuleIds,
      topK,
      DEFAULT_POLICY_ABAC_PREREQUISITE_GRAPH
    );

    for (const arm of PILOT_ARMS) {
      const key = `${task.id}::${arm}`;
      if (checkpoint.trials[key]) {
        continue;
      }

      let retrievedRuleIds: readonly string[] = [];
      let injectedPrerequisites: readonly string[] = [];
      let displacedRuleIds: readonly string[] = [];
      let lessonsBlock: string | undefined;

      if (arm === 'C') {
        retrievedRuleIds = baselineTopK;
        lessonsBlock = retrievedRuleIds
          .map((id) => `[${id}] ${lessonsCById.get(id) ?? ''}`)
          .join('\n');
      } else if (arm === 'C_ID_auto') {
        retrievedRuleIds = baselineTopK;
        lessonsBlock = retrievedRuleIds
          .map((id) => `[${id}] ${lessonsCidById.get(id) ?? ''}`)
          .join('\n');
      } else if (arm === 'C_ID_prereq') {
        retrievedRuleIds = prereqRetrieval.selected;
        injectedPrerequisites = prereqRetrieval.injectedPrerequisites;
        displacedRuleIds = prereqRetrieval.displaced;
        lessonsBlock = retrievedRuleIds
          .map((id) => `[${id}] ${lessonsCidById.get(id) ?? ''}`)
          .join('\n');
      }

      const systemPrompt = buildBasePolicySystemPrompt(lessonsBlock);
      const userPrompt = `Task ${task.id} (${task.domain}): ${task.title}\n${task.prompt}`;

      const gen = await generatePolicyViaLlm(model, systemPrompt, userPrompt, 0, provider);
      const evaluation = cartridge.evaluate(task, gen.policyText);
      const forensicFlags = cartridge.classifyForensics(task, gen.policyText);
      const boundCount = evaluation.boundFacts.length;
      const passedCount = evaluation.passedFacts.length;
      const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

      const record: PilotTrialRecord = {
        key,
        taskId: task.id,
        domain: task.domain,
        cohortId: task.cohortId,
        arm,
        retrievedRuleIds: [...retrievedRuleIds],
        injectedPrerequisites: [...injectedPrerequisites],
        displacedRuleIds: [...displacedRuleIds],
        promptChars: systemPrompt.length + userPrompt.length,
        artifactSha256: computeArtifactSha256(gen.policyText),
        policyText: gen.policyText,
        committed: evaluation.committed,
        fullTaskPass,
        boundFactsCount: boundCount,
        passedFactsCount: passedCount,
        factPassRate: boundCount > 0 ? passedCount / boundCount : 1,
        passedFacts: [...evaluation.passedFacts],
        failedFacts: [...evaluation.failedFacts],
        forensicFlags,
        ...(evaluation.stderr ? { stderr: evaluation.stderr } : {}),
        returnedModel: gen.returnedModel,
        finishReason: gen.finishReason,
        latencyMs: gen.latencyMs,
        timestamp: new Date().toISOString(),
      };

      checkpoint.trials[key] = record;
      completedCount++;
      saveCheckpoint();

      const statusMark = fullTaskPass ? 'PASS' : evaluation.committed ? 'FAIL' : 'SYNTAX_ERR';
      console.log(
        `[${String(completedCount).padStart(2, '0')}/${totalCount}] ${task.id} | ${arm.padEnd(11)} | ${statusMark.padEnd(10)} | facts=${passedCount}/${boundCount} | rules=[${retrievedRuleIds.join(',')}] | failed=[${evaluation.failedFacts.join(',')}] (${gen.latencyMs}ms)`
      );

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const summary = summarizePilotCheckpoint(checkpoint);
  const summaryJsonPath = path.join(outDir, `policy-abac-${modelSlug}-summary.json`);
  const summaryMdPath = path.join(outDir, `policy-abac-${modelSlug}-summary.md`);
  const summaryMd = formatSummaryMarkdown(summary);

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryMdPath, summaryMd, 'utf8');

  console.log(`\n${summaryMd}`);
  console.log(`[v4-pilot] Checkpoint: ${checkpointPath}`);
  console.log(`[v4-pilot] Summary:    ${summaryJsonPath}`);
  console.log(`[v4-pilot] Report:     ${summaryMdPath}`);

  return summary;
}

function parseCliArgs(argv: string[]) {
  const modelIdx = argv.indexOf('--model');
  const providerIdx = argv.indexOf('--provider');
  const topKIdx = argv.indexOf('--top-k');
  const delayIdx = argv.indexOf('--delay-ms');
  const rawProvider =
    providerIdx >= 0 && argv[providerIdx + 1] ? argv[providerIdx + 1].toLowerCase() : undefined;
  if (rawProvider !== undefined && rawProvider !== 'gemini' && rawProvider !== 'groq') {
    throw new Error(`Invalid --provider "${rawProvider}". Expected "gemini" or "groq".`);
  }
  return {
    model: modelIdx >= 0 && argv[modelIdx + 1] ? argv[modelIdx + 1] : 'gemini-3.1-flash-lite',
    provider: rawProvider as PolicyProviderOverride | undefined,
    topK: topKIdx >= 0 && argv[topKIdx + 1] ? Number(argv[topKIdx + 1]) : 4,
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 350,
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-policy-abac-pilot.ts');

if (isEntrypoint) {
  const args = parseCliArgs(process.argv.slice(2));
  runPolicyAbacPilot(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
