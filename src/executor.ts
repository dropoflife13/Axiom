import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { assertBudgetAvailable, BUDGET_GUARD } from './guardrails.js';
dotenv.config();

const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const CHAT_URL = `${NVIDIA_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
export const REQUIRED_EXECUTOR_MODEL = 'google/gemma-4-31b-it';
export const PROVIDER = 'nvidia';

export function resolveExecutorModel(explicitModel?: string): string {
  const resolved = (explicitModel ?? process.env.NVIDIA_EXECUTOR_MODEL ?? '').trim();
  if (!resolved) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Executor model is an explicit required setting (${REQUIRED_EXECUTOR_MODEL}) with no silent default. Pass options.model or set NVIDIA_EXECUTOR_MODEL=${REQUIRED_EXECUTOR_MODEL}.`
    );
  }
  if (resolved !== REQUIRED_EXECUTOR_MODEL) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Executor model must equal "${REQUIRED_EXECUTOR_MODEL}", got "${resolved}".`
    );
  }
  return resolved;
}

export function assertModelMatch(requestedModel: string, returnedModel: string): void {
  if (requestedModel !== REQUIRED_EXECUTOR_MODEL) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Requested model "${requestedModel}" does not equal required model "${REQUIRED_EXECUTOR_MODEL}".`
    );
  }
  if (returnedModel !== requestedModel) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Returned model "${returnedModel}" does not match requested model "${requestedModel}".`
    );
  }
}

export function getProviderProvenance(
  requestedModel: string,
  returnedModel: string = requestedModel
) {
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  return {
    provider: PROVIDER,
    baseUrl: NVIDIA_BASE_URL,
    requestedModel,
    returnedModel,
    oracleCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    factsSha256: crypto.createHash('sha256').update(fs.readFileSync(factsPath)).digest('hex'),
  };
}

export function normalizeModelName(m: string): string {
  if (m === 'gemini-3.8') return 'gemini-3.8-flash';
  if (m === 'gemini-3.5') return 'gemini-3.5-flash';
  return m;
}

export const DEFAULT_EXECUTOR_CACHE_DIR = path.join(process.cwd(), '.axiom-cache');

export interface ExecutorResult {
  markdown: string;
  rawResponse: string;
  fromCache?: boolean;
  cacheKey?: string;
  finishReason?: string;
}

export interface ExecutorOptions {
  cacheDir?: string;
  disableCache?: boolean;
  temperature?: number;
  model?: string;
}

export function computeExecutorCacheKey(
  model: string,
  system: string,
  user: string,
  temperature: number | string
): string {
  return crypto
    .createHash('sha256')
    .update(`${NVIDIA_BASE_URL}${model}${system}${user}${temperature}`)
    .digest('hex');
}

function finalMessageContent(choice: any, context: string): string {
  const finishReason = choice?.finish_reason;
  if (finishReason === 'length') {
    throw new Error(`[ABORT_NON_RETRYABLE] ${context} response stopped at token limit (finish_reason=length).`);
  }
  // Ignore separate reasoning fields (e.g. choice.message.reasoning_content) and strip any <think> blocks
  const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  const content = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
  if (!content) {
    throw new Error(`[ABORT_NON_RETRYABLE] ${context} response contained no final content.`);
  }
  return content;
}

export async function generateAgentMarkdown(
  task: string,
  lesson?: string,
  options?: ExecutorOptions
): Promise<ExecutorResult> {
  const model = resolveExecutorModel(options?.model);
  const temperature = options?.temperature ?? 0.1;
  const cacheDir = options?.cacheDir ?? DEFAULT_EXECUTOR_CACHE_DIR;

  const systemPrompt = `You generate Cortex Agent Markdown files.
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
- [Receives work from and hands off to appropriate agents]
${lesson ? `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${lesson}` : ''}`;

  const cacheKey = computeExecutorCacheKey(model, systemPrompt, task, temperature);
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);

  if (!options?.disableCache && fs.existsSync(cacheFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      if (
        typeof cached.markdown === 'string' &&
        typeof cached.rawResponse === 'string' &&
        cached.provider === PROVIDER &&
        cached.baseUrl === NVIDIA_BASE_URL &&
        cached.requestedModel === model
      ) {
        return {
          markdown: cached.markdown,
          rawResponse: cached.rawResponse,
          fromCache: true,
          cacheKey,
          finishReason: cached.finishReason,
        };
      }
    } catch {
      // Fall through and recompute if cache file is unreadable
    }
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('NVIDIA_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const effectiveModel = normalizeModelName(model);
  const fullPrompt = `${systemPrompt}\n${task}`;
  const abortSignal = assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task },
          ],
          temperature,
          max_tokens: 8192,
          ...(effectiveModel.includes('glm') ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        signal: abortSignal,
      });

      if (response.status === 429 || response.status === 503) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '3', 10);
        if (retryAfter > 30) {
          throw new Error(`[ABORT_NON_RETRYABLE] Rate limit / 503 retry-after too high (${retryAfter}s).`);
        }
        const delay = (retryAfter + (attempt + 1) * 2) * 1000 + Math.random() * 1000;
        console.warn(`[Executor] ${response.status === 429 ? 'Rate limited' : 'High demand (503)'}. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] NVIDIA Executor ${response.status}: ${errText}`);
        }
        throw new Error(`NVIDIA Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const finishReason = data.choices?.[0]?.finish_reason;
      const markdown = finalMessageContent(data.choices?.[0], 'Executor');
      const rawResponse = JSON.stringify(data);
      const returnedModel = data.model || effectiveModel;
      const provenance = getProviderProvenance(model, returnedModel);

      if (!options?.disableCache) {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const tmpCachePath = `${cacheFilePath}.tmp.${process.pid}.${Date.now()}`;
        fs.writeFileSync(
          tmpCachePath,
          JSON.stringify({ cacheKey, model, temperature, markdown, rawResponse, finishReason, ...provenance }, null, 2),
          'utf-8'
        );
        fs.renameSync(tmpCachePath, cacheFilePath);
      }

      return { markdown, rawResponse, fromCache: false, cacheKey, finishReason };
    } catch (err: any) {
      if (
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]')
      ) {
        throw err;
      }
      attempt++;
      console.warn(`[Executor] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt >= 3) throw err;
      const backoffDelay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, 10_000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}

export type GenerationStatus = 'ok' | 'empty' | 'length' | 'other';

export interface SqlExecutorResult {
  sql: string;
  rawResponse: string;
  fromCache?: boolean;
  cacheKey?: string;
  requestedModel: string;
  returnedModel: string;
  finishReason: string;
  generationStatus?: GenerationStatus;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function classifyGenerationStatus(
  finishReason?: string,
  sql?: string,
  explicitStatus?: GenerationStatus
): GenerationStatus {
  if (
    explicitStatus === 'ok' ||
    explicitStatus === 'empty' ||
    explicitStatus === 'length' ||
    explicitStatus === 'other'
  ) {
    return explicitStatus;
  }
  const reason = (finishReason ?? '').trim().toLowerCase();
  if (reason === 'length' || reason === 'max_tokens') {
    return 'length';
  }
  if (reason === 'empty') {
    return 'empty';
  }
  if (
    reason.length > 0 &&
    reason !== 'stop' &&
    reason !== 'end_turn' &&
    reason !== 'unknown'
  ) {
    return 'other';
  }
  if (!sql || !sql.trim()) {
    return 'empty';
  }
  return 'ok';
}

export function coerceDeterministicGenerationFailure(
  err: unknown,
  requestedModel: string = REQUIRED_EXECUTOR_MODEL
): SqlExecutorResult | null {
  const message =
    err && typeof err === 'object' && typeof (err as any).message === 'string'
      ? (err as any).message
      : String(err ?? '');
  const errObj = (err && typeof err === 'object' ? err : {}) as Record<string, any>;
  const returnedModel =
    typeof errObj.returnedModel === 'string' && errObj.returnedModel.trim()
      ? errObj.returnedModel
      : requestedModel;
  const usage =
    errObj.usage && typeof errObj.usage === 'object'
      ? errObj.usage
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  if (
    errObj.generationStatus === 'length' ||
    errObj.finishReason === 'length' ||
    /finish_reason\s*=\s*length|stopped at token limit/i.test(message)
  ) {
    return {
      sql: '',
      rawResponse: '',
      fromCache: false,
      requestedModel,
      returnedModel,
      finishReason: typeof errObj.finishReason === 'string' ? errObj.finishReason : 'length',
      generationStatus: 'length',
      usage,
    };
  }
  if (
    errObj.generationStatus === 'other' ||
    errObj.finishReason === 'content_filter' ||
    /content[_-\s]?filter/i.test(message)
  ) {
    return {
      sql: '',
      rawResponse: '',
      fromCache: false,
      requestedModel,
      returnedModel,
      finishReason:
        typeof errObj.finishReason === 'string' ? errObj.finishReason : 'content_filter',
      generationStatus: 'other',
      usage,
    };
  }
  if (
    errObj.generationStatus === 'empty' ||
    errObj.finishReason === 'empty' ||
    /contained no final content|empty response/i.test(message)
  ) {
    return {
      sql: '',
      rawResponse: '',
      fromCache: false,
      requestedModel,
      returnedModel,
      finishReason: typeof errObj.finishReason === 'string' ? errObj.finishReason : 'stop',
      generationStatus: 'empty',
      usage,
    };
  }
  return null;
}

export async function executeSqlWithPolicy(
  executorFn: typeof generateSqlMigration,
  taskPrompt: string,
  table: string,
  features: { tenant: boolean; append_only: boolean; ingestion: boolean },
  lesson?: string,
  options?: ExecutorOptions
): Promise<SqlExecutorResult & { generationStatus: GenerationStatus }> {
  const requestedModel = resolveExecutorModel(options?.model);
  try {
    const res = await executorFn(taskPrompt, table, features, lesson, options);
    assertModelMatch(res.requestedModel, res.returnedModel);
    const generationStatus = classifyGenerationStatus(
      res.finishReason,
      res.sql,
      res.generationStatus
    );
    const sql = generationStatus === 'ok' ? res.sql : '';
    return {
      ...res,
      sql,
      generationStatus,
    };
  } catch (err) {
    const coerced = coerceDeterministicGenerationFailure(err, requestedModel);
    if (coerced) {
      assertModelMatch(coerced.requestedModel, coerced.returnedModel);
      return {
        ...coerced,
        sql: '',
        generationStatus: coerced.generationStatus ?? 'other',
      };
    }
    throw err;
  }
}

export function stripSqlFences(raw: string): string {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:sql|postgresql|pgsql)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  cleaned = cleaned.replace(/^```(?:sql|postgresql|pgsql)?\s*\r?\n?/i, '');
  cleaned = cleaned.replace(/\r?\n?```\s*$/i, '');
  return cleaned.trim();
}

export async function generateSqlMigration(
  taskPrompt: string,
  table: string,
  features: { tenant: boolean; append_only: boolean; ingestion: boolean },
  lesson?: string,
  options?: ExecutorOptions
): Promise<SqlExecutorResult> {
  const model = resolveExecutorModel(options?.model);
  const temperature = options?.temperature ?? 0;
  const cacheDir = options?.cacheDir ?? DEFAULT_EXECUTOR_CACHE_DIR;

  const systemPrompt = `You generate PostgreSQL 16 SQL migrations.
Output raw executable PostgreSQL 16 SQL DDL only (no Markdown code fences, no commentary).
Environment context:
- Database: PostgreSQL 16, schema \`public\`.
- Existing reference tables: \`public.tenants(id uuid PRIMARY KEY)\`, \`public.users(id uuid PRIMARY KEY, tenant_id uuid)\`, \`public.customers(id uuid PRIMARY KEY, tenant_id uuid)\`.
- Existing JWT helper function: \`auth.jwt() RETURNS jsonb\`.
- Existing database roles: \`deployer\`, \`application\`, \`readonly_user\`.
Create the requested table \`public.${table}\` along with appropriate columns, constraints, indexes, triggers, row-level security policies, views, and role grants for the given table flags.${lesson ? `\n\nCRITICAL LESSONS FROM PREVIOUS FAILURES:\n${lesson}` : ''}`;

  const userPrompt = `${taskPrompt}\nTarget Table: public.${table}\nFeature Flags: tenant=${features.tenant}, append_only=${features.append_only}, ingestion=${features.ingestion}`;

  const cacheKey = computeExecutorCacheKey(model, systemPrompt, userPrompt, temperature);
  const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);

  if (!options?.disableCache && fs.existsSync(cacheFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      if (
        typeof cached.sql === 'string' &&
        typeof cached.rawResponse === 'string' &&
        cached.provider === PROVIDER &&
        cached.baseUrl === NVIDIA_BASE_URL &&
        cached.requestedModel === model
      ) {
        assertModelMatch(cached.requestedModel, cached.returnedModel);
        let usage: SqlExecutorResult['usage'] | undefined;
        try {
          const parsedRaw = JSON.parse(cached.rawResponse);
          if (parsedRaw?.usage) {
            usage = {
              promptTokens: parsedRaw.usage.prompt_tokens ?? 0,
              completionTokens: parsedRaw.usage.completion_tokens ?? 0,
              totalTokens: parsedRaw.usage.total_tokens ?? 0,
            };
          }
        } catch {
          // ignore
        }
        const cachedStatus = classifyGenerationStatus(
          cached.finishReason,
          cached.sql,
          cached.generationStatus
        );
        return {
          sql: cachedStatus === 'ok' ? cached.sql : '',
          rawResponse: cached.rawResponse,
          fromCache: true,
          cacheKey,
          requestedModel: cached.requestedModel,
          returnedModel: cached.returnedModel,
          finishReason: cached.finishReason ?? 'unknown',
          generationStatus: cachedStatus,
          usage,
        };
      }
    } catch (err: any) {
      if (err.message?.includes('[ABORT_NON_RETRYABLE]')) {
        throw err;
      }
      // Fall through and recompute if cache file is unreadable
    }
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('NVIDIA_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const effectiveModel = normalizeModelName(model);
  const fullPrompt = `${systemPrompt}\n${userPrompt}`;
  assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  const MAX_RETRIES = 20;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const reqSignal = AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: 8192,
          ...(effectiveModel.includes('glm') ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        signal: reqSignal,
      });

      if (response.status === 429 || response.status === 503) {
        const retryAfterHeader = response.headers.get('retry-after');
        let delaySec = 10 + attempt * 5;
        if (retryAfterHeader) {
          const parsed = parseFloat(retryAfterHeader);
          if (!isNaN(parsed) && parsed > 0) delaySec = Math.max(delaySec, parsed);
        }
        const waitSec = Math.min(Math.ceil(delaySec) + Math.random() * 2, 60);
        console.warn(
          `[Executor] ${response.status === 429 ? 'Rate limited (429)' : 'High demand (503)'} on attempt ${attempt + 1}/${MAX_RETRIES}. Backing off for ${waitSec.toFixed(1)}s...`
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] NVIDIA Executor ${response.status}: ${errText}`);
        }
        throw new Error(`NVIDIA Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      const finishReason: string = choice?.finish_reason ?? 'unknown';
      const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const strippedContent = rawContent
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')
        .trim();
      const candidateSql = stripSqlFences(strippedContent);
      const generationStatus = classifyGenerationStatus(finishReason, candidateSql);
      const sql = generationStatus === 'ok' ? candidateSql : '';
      const rawResponse = JSON.stringify(data);
      const returnedModel = data.model || '';
      assertModelMatch(model, returnedModel);
      const provenance = getProviderProvenance(model, returnedModel);
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined;

      if (!options?.disableCache) {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const tmpCachePath = `${cacheFilePath}.tmp.${process.pid}.${Date.now()}`;
        const cachePayload = JSON.stringify(
          {
            cacheKey,
            model,
            temperature,
            sql,
            rawResponse,
            finishReason,
            generationStatus,
            ...provenance,
          },
          null,
          2
        );
        fs.writeFileSync(tmpCachePath, cachePayload, 'utf-8');
        try {
          fs.renameSync(tmpCachePath, cacheFilePath);
        } catch {
          fs.writeFileSync(cacheFilePath, cachePayload, 'utf-8');
          try {
            fs.unlinkSync(tmpCachePath);
          } catch {
            // ignore cleanup error
          }
        }
      }

      return {
        sql,
        rawResponse,
        fromCache: false,
        cacheKey,
        usage,
        requestedModel: model,
        returnedModel,
        finishReason,
        generationStatus,
      };
    } catch (err: any) {
      if (
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]')
      ) {
        throw err;
      }
      attempt++;
      console.warn(`[Executor] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt >= 3) throw err;
      const backoffDelay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, 10_000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}
