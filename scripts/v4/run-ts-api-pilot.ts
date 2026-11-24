// scripts/v4/run-ts-api-pilot.ts
// Lightweight 4-Arm TypeScript API Security Pilot Runner (15 tasks x 4 arms = 60 calls/model)
// for Axiom-HOPE (Ablation v4).
//
// Arms:
//   A           — Zero-Shot (base TypeScript handler runtime contract only)
//   C           — Top-4 unconstrained distilled lessons (ts-api-c.json)
//   C_ID_auto   — Top-4 lexical-locked distilled lessons (ts-api-cid-auto.json)
//   C_ID_prereq — Top-4 lexical-locked + static DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH (K=4)
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
  DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH,
  TsApiSecurityCartridge,
  type TsApiSecurityTask,
} from '../../src/v4/cartridges/ts-api-security-cartridge.js';
import type { CanonicalRule } from '../../src/v4/domain-cartridge.js';
import {
  computeArtifactSha256,
  evaluateLexicalIdentifierLock,
} from '../../src/v4/hope/index.js';
import { retrieveWithPrerequisites } from '../../src/v4/prerequisite-retriever.js';
import {
  TS_API_VAULT_C_PATH,
  TS_API_VAULT_CID_AUTO_PATH,
  type TsApiVaultFile,
} from './build-ts-api-vaults.js';
import {
  assemblePromptBundleWithOptionalCompaction,
  createCompactionAccumulator,
  finalizeCompactionStats,
  parseCompactionCliFlags,
  recordCompactionStat,
  type AssembledPromptResult,
  type CompactionStatsSummary,
} from './run-policy-abac-pilot.js';

dotenv.config();

export type TsApiPilotArm = 'A' | 'C' | 'C_ID_auto' | 'C_ID_prereq' | 'C_ID_hope';
export const TS_API_PILOT_ARMS: readonly TsApiPilotArm[] = [
  'A',
  'C',
  'C_ID_auto',
  'C_ID_prereq',
];
export const ALL_TS_API_PILOT_ARMS: readonly TsApiPilotArm[] = [
  'A',
  'C',
  'C_ID_auto',
  'C_ID_prereq',
  'C_ID_hope',
];

export interface TsApiPilotTrialRecord {
  readonly key: string;
  readonly taskId: string;
  readonly domain: TsApiSecurityTask['domain'];
  readonly cohortId: string;
  readonly arm: TsApiPilotArm;
  readonly retrievedRuleIds: readonly string[];
  readonly injectedPrerequisites: readonly string[];
  readonly displacedRuleIds: readonly string[];
  readonly promptChars: number;
  readonly artifactSha256: string;
  readonly tsSource: string;
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

export interface TsApiPilotCheckpointFile {
  readonly schemaVersion: '4.0.0-ts-api-pilot';
  readonly cartridgeId: 'ts-api-security-v4';
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
  trials: Record<string, TsApiPilotTrialRecord>;
}

export interface TsApiArmSummaryStats {
  readonly arm: TsApiPilotArm;
  readonly totalTasks: number;
  readonly fullTaskPassCount: number;
  readonly fullTaskPassRate: number;
  readonly meanFactPassRate: number;
  readonly committedCount: number;
  readonly committedRate: number;
  readonly ts01RetrievedCount: number;
  readonly ts04RetrievedCount: number;
  readonly ts08RetrievedCount: number;
  readonly forensicDefectCounts: Record<string, number>;
}

export interface TsApiPilotSummaryReport {
  readonly schemaVersion: '4.0.0-ts-api-pilot-summary';
  readonly cartridgeId: 'ts-api-security-v4';
  readonly model: string;
  readonly modelSlug: string;
  readonly topK: number;
  readonly temperature: number;
  readonly totalTrials: number;
  readonly compaction?: CompactionStatsSummary;
  readonly arms: Partial<Record<TsApiPilotArm, TsApiArmSummaryStats>> &
    Record<'A' | 'C' | 'C_ID_auto' | 'C_ID_prereq', TsApiArmSummaryStats>;
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
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'must', 'every', 'when', 'all',
  'route', 'routes', 'endpoint', 'endpoints', 'http', 'status', 'return', 'returning',
  'implement', 'typescript', 'api', 'handler', 'handlers', 'request', 'response', 'responses',
  'body', 'json', 'fields', 'using', 'via', 'both', 'never', 'only', 'non', 'code',
]);

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function slugifyModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeForRetrieval(text: string): string[] {
  const tokens: string[] = [];
  // Split camelCase so e.g. amountCents -> amountCents, amount, cents
  const expanded = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/g)) {
    tokens.push(m[0]);
  }
  for (const m of expanded.matchAll(/[a-z0-9]{3,}/g)) {
    const w = m[0];
    if (!RETRIEVAL_STOP_WORDS.has(w)) {
      tokens.push(w);
    }
  }
  return tokens;
}

/**
 * Conceptual API endpoint prompt for `TsApiSecurityTask` — supplies the route, HTTP method,
 * allowed roles, and JSON body schema field names without leaking hidden security contract
 * literals/constants/bounds that must come from the memory vault.
 * Identical across all 5 arms (A, C, C_ID_auto, C_ID_prereq, C_ID_hope).
 */
export function buildTsApiUserPrompt(task: TsApiSecurityTask): string {
  const domainSpec =
    task.domain === 'payouts'
      ? [
          'Domain: Financial Payouts (mutating financial transaction).',
          'Expected JSON payload fields: { tenantId: string, destinationAccount: string, amountCents: integer, currency: string }.',
          'Identifier format: tenantId and destinationAccount are non-empty opaque strings (e.g. "tenant-acme", "acct-991"), NOT UUIDs.',
          'Requirements: Enforce authentication, role authorization, strict schema validation, tenant isolation, duplicate-submission idempotency protection, payout amount bounds, standardized error responses, sensitive response cache control, zero secret leakage, and audit logging.',
        ]
      : task.domain === 'admin'
        ? [
            'Domain: Multi-Tenant Admin Data Export (sensitive bulk export).',
            'Expected JSON payload fields: { tenantId: string, exportFields: string[], limit: integer }.',
            'Identifier format: tenantId is a non-empty opaque string (e.g. "tenant-sec"), NOT a UUID; accept any non-empty array of caller-requested exportFields strings (do not hardcode a narrow field allowlist).',
            'Requirements: Enforce authentication, privileged role authorization, strict schema validation, tenant isolation, bounded export row limits and non-sensitive field projection, standardized error responses, sensitive response cache control, zero secret leakage, and audit logging.',
          ]
        : [
            'Domain: User Profile Mutation (account profile update).',
            'Expected JSON payload fields: { tenantId: string, targetUserId: string, displayName: string }.',
            'Identifier format: tenantId and targetUserId are non-empty opaque strings (e.g. "tenant-u1", "usr-11"), NOT UUIDs.',
            'Requirements: Enforce authentication, strict schema validation, tenant isolation, user ownership / admin override guard, prevention of unauthorized role/tenant mass-assignment, standardized error responses, sensitive response cache control, zero secret leakage, and audit logging.',
          ];

  return [
    `Task ${task.id}: ${task.title}`,
    `Endpoint: ${task.method} ${task.route}`,
    `Authorized roles for this endpoint: ${JSON.stringify(task.allowedRoles)}`,
    ...domainSpec,
  ].join('\n');
}

/**
 * Unsupervised TF-IDF ranking of all 12 canonical rules against the conceptual task query
 * (zero access to `boundFacts` or `applicableFacts`).
 */
export function rankTsApiRulesByPromptTfIdf(
  task: TsApiSecurityTask,
  canonicalRules: readonly CanonicalRule[]
): string[] {
  const queryText = `${task.title} ${task.route} ${buildTsApiUserPrompt(task)}`;
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
  const queryTerms = Array.from(new Set(tokenizeForRetrieval(queryText)));

  const scored = canonicalRules.map((rule, idx) => {
    const termSet = docTokens[idx];
    let score = 0;
    for (const qt of queryTerms) {
      if (termSet.has(qt)) {
        const docFreq = df.get(qt) ?? 1;
        const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
        const boost = qt.includes('-') || qt.includes('_') ? 1.5 : 1.0;
        score += idf * boost;
      }
    }
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
 * Base TypeScript Route Handler Runtime Contract Prompt (identical across all 5 arms).
 * Supplies ONLY the sandbox runtime signature and allowed `zod` import — zero leakage of
 * domain security contract rules or exact constants.
 */
export function buildBaseTsApiSystemPrompt(lessonsBlock?: string): string {
  const base = [
    'You generate production-grade TypeScript API route handlers.',
    'Output ONLY raw TypeScript code (no Markdown code fences, no commentary, no explanations).',
    '',
    'Strict Runtime Sandbox Contract:',
    '- The ONLY permitted module import is `import { z } from \'zod\';` (do NOT import node:fs, crypto, next/server, or any other package).',
    '- You MUST export `export async function handle(req, ctx)` with this exact signature:',
    '  interface RouteSession { userId: string; tenantId: string; role: string; }',
    '  interface ApiRequest { method: string; requestId: string; headers: Record<string, string | undefined>; json(): Promise<unknown>; }',
    '  interface ApiContext { session: RouteSession | null; emitAuditEvent(event: { action?: string; actorId?: string; requestId?: string; tenantId?: string }): void; }',
    '  Return type: Promise<{ status: number; headers?: Record<string, string>; body: unknown }>',
    '- Handle invalid/malformed JSON thrown by `await req.json()` gracefully (never allow unhandled exceptions).',
    '- Return status 200 or 201 on valid requests.',
  ].join('\n');

  if (!lessonsBlock) return base;
  return `${base}\n\nCRITICAL API SECURITY LESSONS FROM PRIOR AUDITS:\n${lessonsBlock}`;
}

/**
 * Assembles the TypeScript API Security system prompt from retrieved rule IDs,
 * applying `compactContextBundle()` ONLY when `compact === true`. When `compact`
 * is false/omitted, output is 100% identical to the uncompacted baseline prompt.
 */
export function assembleTsApiPromptWithOptionalCompaction(params: {
  readonly retrievedRuleIds: readonly string[];
  readonly lessonsById: ReadonlyMap<string, string>;
  readonly canonicalRules: readonly CanonicalRule[];
  readonly cartridge: TsApiSecurityCartridge;
  readonly enforceCanonicalLock: boolean;
  readonly compact?: boolean;
  readonly maxContextTokens?: number;
}): AssembledPromptResult {
  return assemblePromptBundleWithOptionalCompaction({
    retrievedRuleIds: params.retrievedRuleIds,
    lessonsById: params.lessonsById,
    canonicalRules: params.canonicalRules,
    tokenExtractor: (r) => params.cartridge.extractRequiredTokens(r),
    buildSystemPrompt: buildBaseTsApiSystemPrompt,
    enforceCanonicalLock: params.enforceCanonicalLock,
    compact: params.compact,
    maxContextTokens: params.maxContextTokens,
  });
}

export function stripTsCodeFences(raw: string): string {
  const sanitized = sanitizeReasoningTags(raw, { sqlAware: false }).sanitizedText.trim();
  const fullFence = sanitized.match(/^```[a-zA-Z0-9_-]*\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (fullFence) {
    return fullFence[1].trim();
  }
  // If fenced block exists inside prose, extract the first fenced TypeScript block
  const embeddedFence = sanitized.match(/```(?:ts|typescript)?\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (embeddedFence) {
    return embeddedFence[1].trim();
  }
  return sanitized
    .replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
}

export type TsApiProviderOverride = 'gemini' | 'groq';

export function resolveTsApiProviderEndpoint(
  model: string,
  providerOverride?: TsApiProviderOverride
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

export async function generateTsHandlerViaLlm(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0,
  providerOverride?: TsApiProviderOverride
): Promise<{
  tsSource: string;
  returnedModel: string;
  finishReason: string;
  latencyMs: number;
}> {
  const endpoint = resolveTsApiProviderEndpoint(model, providerOverride);
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
          max_tokens: Math.max(2048, profile.maxTokens),
          ...profile.extraRequestBody,
        }),
        signal: AbortSignal.timeout(Math.max(90_000, profile.timeoutMs)),
      });

      if (response.status === 429 || response.status === 503) {
        const errBody = await response.text().catch(() => '');
        const retryAfterRaw = response.headers.get('retry-after');
        const retryAfter = retryAfterRaw ? parseFloat(retryAfterRaw) : 12;
        const isPerMinuteQuota = /PerMinute|per minute|RPM|TPM/i.test(errBody);
        const isDailyQuotaMsg = /tokens per day|requests per day|PerDay|daily.*limit/i.test(errBody);
        // Treat rolling-window TPD waits <= 1200s (e.g. Groq rolling 24h TPD) as retryable,
        // while still failing fast on genuinely exhausted daily quotas (> 1200s or no retry-after).
        const isUnrecoverableDailyQuota =
          !isPerMinuteQuota &&
          ((isDailyQuotaMsg && (Number.isNaN(retryAfter) || retryAfter > 1200)) ||
            (!Number.isNaN(retryAfter) && retryAfter > 1200));
        if (isUnrecoverableDailyQuota) {
          throw new Error(
            `[RATE_LIMIT_QUOTA] ${endpoint.provider.toUpperCase()} HTTP ${response.status} (retry-after=${retryAfterRaw ?? 'n/a'}): ${errBody.slice(0, 300)}`
          );
        }

        rateLimitAttempts++;
        if (rateLimitAttempts > 25) {
          throw new Error(
            `[RATE_LIMIT_EXHAUSTED] Exceeded rate-limit retries (HTTP ${response.status}): ${errBody.slice(0, 200)}`
          );
        }
        const retryDelayMatch = errBody.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
        const parsedHintSec = retryDelayMatch ? Math.ceil(parseFloat(retryDelayMatch[1])) : NaN;
        const baseDelay =
          !Number.isNaN(parsedHintSec) && parsedHintSec > 0
            ? parsedHintSec + 2
            : !Number.isNaN(retryAfter) && retryAfter > 0
              ? retryAfter
              : 15;
        const maxCapMs = isDailyQuotaMsg ? 1_215_000 : 65_000;
        const delayMs = Math.min((baseDelay + Math.min(rateLimitAttempts * 3, 15)) * 1000, maxCapMs);
        console.warn(
          `[v4-ts-pilot] ${endpoint.provider} HTTP ${response.status}; waiting ${(delayMs / 1000).toFixed(1)}s before retry (${rateLimitAttempts}/25)...`
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
        throw new Error(
          `${endpoint.provider.toUpperCase()} executor 5xx HTTP ${response.status}: ${errText}`
        );
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
      const tsSource = stripTsCodeFences(rawContent);
      return {
        tsSource,
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
        `[v4-ts-pilot] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${backoffMs}ms...`
      );
      await sleep(backoffMs);
    }
  }

  throw new Error('TypeScript handler generation exhausted retries.');
}

export function summarizeTsApiPilotCheckpoint(
  checkpoint: TsApiPilotCheckpointFile,
  compaction?: CompactionStatsSummary
): TsApiPilotSummaryReport {
  const trialsList = Object.values(checkpoint.trials);
  const presentArms = ALL_TS_API_PILOT_ARMS.filter(
    (arm) => TS_API_PILOT_ARMS.includes(arm) || trialsList.some((t) => t.arm === arm)
  );

  const armStats = {} as Record<TsApiPilotArm, TsApiArmSummaryStats>;
  for (const arm of presentArms) {
    const subset = trialsList.filter((t) => t.arm === arm);
    const totalTasks = subset.length;
    const fullTaskPassCount = subset.filter((t) => t.fullTaskPass).length;
    const committedCount = subset.filter((t) => t.committed).length;
    const meanFactPassRate =
      totalTasks > 0
        ? subset.reduce((acc, t) => acc + t.factPassRate, 0) / totalTasks
        : 0;
    const ts01RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('TS-01')).length;
    const ts04RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('TS-04')).length;
    const ts08RetrievedCount = subset.filter((t) => t.retrievedRuleIds.includes('TS-08')).length;

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
      ts01RetrievedCount,
      ts04RetrievedCount,
      ts08RetrievedCount,
      forensicDefectCounts: defectCounts,
    };
  }

  const pp = (a: number, b: number) => Number(((a - b) * 100).toFixed(2));
  const hopeStats = armStats.C_ID_hope;

  return {
    schemaVersion: '4.0.0-ts-api-pilot-summary',
    cartridgeId: 'ts-api-security-v4',
    model: checkpoint.requestedModel,
    modelSlug: checkpoint.modelSlug,
    topK: checkpoint.topK,
    temperature: checkpoint.temperature,
    totalTrials: trialsList.length,
    ...(compaction ? { compaction } : {}),
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

export function formatTsApiSummaryMarkdown(summary: TsApiPilotSummaryReport): string {
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
  const activeArms = ALL_TS_API_PILOT_ARMS.filter((arm) => Boolean(summary.arms[arm]));
  const armCount = activeArms.length;

  const lines: string[] = [
    `# Axiom-HOPE v4 TypeScript API Security Pilot Summary — \`${summary.model}\``,
    '',
    `- **Cartridge:** \`ts-api-security-v4\` (15 held-out tasks × ${armCount} arms = ${summary.totalTrials} trials)`,
    `- **Retrieval Budget:** \`K = ${summary.topK}\`, \`temperature = ${summary.temperature}\``,
    ...(summary.compaction
      ? [
          `- **Context Compaction (\`--compact\`):** ${summary.compaction.beforeTokens} -> ${summary.compaction.afterTokens} tokens (**-${summary.compaction.reductionPct.toFixed(2)}%**, ${summary.compaction.preservedTokenCount}/${summary.compaction.totalRequiredTokens} required tokens preserved${
            summary.compaction.maxContextTokens !== undefined
              ? `, cap=${summary.compaction.maxContextTokens}`
              : ''
          })`,
        ]
      : []),
    '',
    `## 1. ${armCount}-Arm Performance Table`,
    '',
    '| Arm | Full-Task Pass | Mean Fact Pass | Committed | TS-01 Retrieved | TS-04 Retrieved | TS-08 Retrieved |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const arm of activeArms) {
    const s = summary.arms[arm]!;
    lines.push(
      `| \`${arm}\` | ${s.fullTaskPassCount}/${s.totalTasks} (${fmtPct(s.fullTaskPassRate)}) | ${fmtPct(s.meanFactPassRate)} | ${s.committedCount}/${s.totalTasks} (${fmtPct(s.committedRate)}) | ${s.ts01RetrievedCount}/${s.totalTasks} | ${s.ts04RetrievedCount}/${s.totalTasks} | ${s.ts08RetrievedCount}/${s.totalTasks} |`
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
    '## 3. Forensic Defect Counts (out of 15 tasks per arm)',
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

export async function runTsApiPilot(options: {
  model?: string;
  provider?: TsApiProviderOverride;
  topK?: number;
  delayMs?: number;
  vaultCPath?: string;
  vaultCidAutoPath?: string;
  compact?: boolean;
  maxContextTokens?: number;
} = {}): Promise<TsApiPilotSummaryReport> {
  const model = options.model ?? 'gemini-3.1-flash-lite';
  const provider = options.provider;
  const topK = options.topK ?? 4;
  const delayMs = options.delayMs ?? 350;
  const compact = options.compact ?? false;
  const maxContextTokens = options.maxContextTokens;
  const modelSlug = slugifyModel(model);
  const runIdSlug = compact ? `${modelSlug}-compact` : modelSlug;

  const vaultCPath = path.resolve(options.vaultCPath ?? TS_API_VAULT_C_PATH);
  const vaultCidAutoPath = path.resolve(
    options.vaultCidAutoPath ?? TS_API_VAULT_CID_AUTO_PATH
  );

  if (!fs.existsSync(vaultCPath) || !fs.existsSync(vaultCidAutoPath)) {
    throw new Error(
      `Missing frozen v4 TS-API vaults. Run "npx tsx scripts/v4/build-ts-api-vaults.ts" first.`
    );
  }

  const cartridge = new TsApiSecurityCartridge();
  const tasks = cartridge.loadTasks();
  const { rules: canonicalRules } = cartridge.loadCanonicalRules();

  const vaultC = JSON.parse(fs.readFileSync(vaultCPath, 'utf8')) as TsApiVaultFile;
  const vaultCidAuto = JSON.parse(
    fs.readFileSync(vaultCidAutoPath, 'utf8')
  ) as TsApiVaultFile;

  // Verify C_ID_auto vault passes 100% automated lexical identifier lock before running
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
        `Vault integrity error: ${lesson.factId} in ts-api-cid-auto.json failed Lexical Lock (${lock.missingTokens.join(', ')}).`
      );
    }
  }

  const lessonsCById = new Map(vaultC.lessons.map((l) => [l.factId, l.lesson]));
  const lessonsCidById = new Map(vaultCidAuto.lessons.map((l) => [l.factId, l.lesson]));

  const runDir = path.resolve('.axiom-state', 'runs-v4', `ts-api-${runIdSlug}`);
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  const outDir = path.resolve('out', 'v4');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tasksPath = path.resolve('fixtures', 'v4', 'ts-api-security-tasks.json');
  const tasksSha256 = sha256File(tasksPath);
  const vaultCSha256 = sha256File(vaultCPath);
  const vaultCidAutoSha256 = sha256File(vaultCidAutoPath);

  let checkpoint: TsApiPilotCheckpointFile;
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf8')
    ) as TsApiPilotCheckpointFile;
    console.log(
      `[v4-ts-pilot] Resuming ${checkpointPath} (${Object.keys(checkpoint.trials).length}/${checkpoint.totalPlannedTrials} completed)`
    );
  } else {
    const now = new Date().toISOString();
    checkpoint = {
      schemaVersion: '4.0.0-ts-api-pilot',
      cartridgeId: 'ts-api-security-v4',
      requestedModel: model,
      modelSlug,
      topK,
      temperature: 0,
      totalPlannedTrials: tasks.length * TS_API_PILOT_ARMS.length,
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
  const totalCount = tasks.length * TS_API_PILOT_ARMS.length;
  const compactionAcc = compact ? createCompactionAccumulator(maxContextTokens) : null;

  for (const task of tasks) {
    const rankedRuleIds = rankTsApiRulesByPromptTfIdf(task, canonicalRules);
    const baselineTopK = rankedRuleIds.slice(0, topK);
    const prereqRetrieval = retrieveWithPrerequisites(
      rankedRuleIds,
      topK,
      DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH
    );

    for (const arm of TS_API_PILOT_ARMS) {
      const key = `${task.id}::${arm}`;
      if (checkpoint.trials[key]) {
        continue;
      }

      let retrievedRuleIds: readonly string[] = [];
      let injectedPrerequisites: readonly string[] = [];
      let displacedRuleIds: readonly string[] = [];
      let lessonsById: ReadonlyMap<string, string> | undefined;
      let enforceCanonicalLock = false;

      if (arm === 'C') {
        retrievedRuleIds = baselineTopK;
        lessonsById = lessonsCById;
        enforceCanonicalLock = false;
      } else if (arm === 'C_ID_auto') {
        retrievedRuleIds = baselineTopK;
        lessonsById = lessonsCidById;
        enforceCanonicalLock = true;
      } else if (arm === 'C_ID_prereq') {
        retrievedRuleIds = prereqRetrieval.selected;
        injectedPrerequisites = prereqRetrieval.injectedPrerequisites;
        displacedRuleIds = prereqRetrieval.displaced;
        lessonsById = lessonsCidById;
        enforceCanonicalLock = true;
      }

      const assembled =
        lessonsById !== undefined
          ? assembleTsApiPromptWithOptionalCompaction({
              retrievedRuleIds,
              lessonsById,
              canonicalRules,
              cartridge,
              enforceCanonicalLock,
              compact,
              maxContextTokens,
            })
          : assembleTsApiPromptWithOptionalCompaction({
              retrievedRuleIds: [],
              lessonsById: new Map(),
              canonicalRules,
              cartridge,
              enforceCanonicalLock: false,
              compact,
              maxContextTokens,
            });

      if (compactionAcc && retrievedRuleIds.length > 0) {
        recordCompactionStat(compactionAcc, assembled);
      }

      const effectiveRetrievedIds = assembled.includedRuleIds;
      const systemPrompt = assembled.systemPrompt;
      const userPrompt = buildTsApiUserPrompt(task);

      const gen = await generateTsHandlerViaLlm(model, systemPrompt, userPrompt, 0, provider);
      const evaluation = await cartridge.evaluate(task, gen.tsSource);
      const forensicFlags = cartridge.classifyForensics(task, gen.tsSource);
      const boundCount = evaluation.boundFacts.length;
      const passedCount = evaluation.passedFacts.length;
      const fullTaskPass = evaluation.committed && evaluation.failedFacts.length === 0;

      const record: TsApiPilotTrialRecord = {
        key,
        taskId: task.id,
        domain: task.domain,
        cohortId: task.cohortId,
        arm,
        retrievedRuleIds: [...effectiveRetrievedIds],
        injectedPrerequisites: [...injectedPrerequisites],
        displacedRuleIds: [...displacedRuleIds],
        promptChars: systemPrompt.length + userPrompt.length,
        artifactSha256: computeArtifactSha256(gen.tsSource),
        tsSource: gen.tsSource,
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

      const statusMark = fullTaskPass ? 'PASS' : evaluation.committed ? 'FAIL' : 'COMPILE_ERR';
      console.log(
        `[${String(completedCount).padStart(2, '0')}/${totalCount}] ${task.id} | ${arm.padEnd(11)} | ${statusMark.padEnd(11)} | facts=${passedCount}/${boundCount} | rules=[${effectiveRetrievedIds.join(',')}] | failed=[${evaluation.failedFacts.join(',')}] (${gen.latencyMs}ms)`
      );

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const compactionSummary = compactionAcc
    ? finalizeCompactionStats(compactionAcc)
    : undefined;
  const summary = summarizeTsApiPilotCheckpoint(checkpoint, compactionSummary);
  const summaryJsonPath = path.join(outDir, `ts-api-${runIdSlug}-summary.json`);
  const summaryMdPath = path.join(outDir, `ts-api-${runIdSlug}-summary.md`);
  const summaryMd = formatTsApiSummaryMarkdown(summary);

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(summaryMdPath, summaryMd, 'utf8');

  console.log(`\n${summaryMd}`);
  if (compactionSummary) {
    console.log(
      `[v4-ts-pilot][compact] Cumulative context tokens: ${compactionSummary.beforeTokens} -> ${compactionSummary.afterTokens} (-${compactionSummary.reductionPct.toFixed(2)}% saved across ${compactionSummary.bundlesCompacted} bundles, preserved ${compactionSummary.preservedTokenCount}/${compactionSummary.totalRequiredTokens} required tokens)`
    );
  }
  console.log(`[v4-ts-pilot] Checkpoint: ${checkpointPath}`);
  console.log(`[v4-ts-pilot] Summary:    ${summaryJsonPath}`);
  console.log(`[v4-ts-pilot] Report:     ${summaryMdPath}`);

  return summary;
}

export function parseTsApiPilotCliArgs(argv: string[]) {
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
    provider: rawProvider as TsApiProviderOverride | undefined,
    topK: topKIdx >= 0 && argv[topKIdx + 1] ? Number(argv[topKIdx + 1]) : 4,
    delayMs: delayIdx >= 0 && argv[delayIdx + 1] ? Number(argv[delayIdx + 1]) : 350,
    ...parseCompactionCliFlags(argv),
  };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-ts-api-pilot.ts');

if (isEntrypoint) {
  const args = parseTsApiPilotCliArgs(process.argv.slice(2));
  runTsApiPilot(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
