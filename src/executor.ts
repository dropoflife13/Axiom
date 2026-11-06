import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { assertBudgetAvailable, BUDGET_GUARD } from './guardrails.js';
dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_EXECUTOR_MODEL || 'openai/gpt-oss-120b';

export const DEFAULT_EXECUTOR_CACHE_DIR = path.join(process.cwd(), '.axiom-cache');

export interface ExecutorResult {
  markdown: string;
  rawResponse: string;
  fromCache?: boolean;
  cacheKey?: string;
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
    .update(`${model}${system}${user}${temperature}`)
    .digest('hex');
}

export async function generateAgentMarkdown(
  task: string,
  lesson?: string,
  options?: ExecutorOptions
): Promise<ExecutorResult> {
  const model = options?.model || MODEL;
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
      if (typeof cached.markdown === 'string' && typeof cached.rawResponse === 'string') {
        return {
          markdown: cached.markdown,
          rawResponse: cached.rawResponse,
          fromCache: true,
          cacheKey,
        };
      }
    } catch {
      // Fall through and recompute if cache file is unreadable
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const fullPrompt = `${systemPrompt}\n${task}`;
  const abortSignal = assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
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
            { role: 'user', content: task },
          ],
          temperature,
        }),
        signal: abortSignal,
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        if (retryAfter > 30) {
          throw new Error(`[ABORT_NON_RETRYABLE] Rate limit retry-after too high (${retryAfter}s).`);
        }
        const delay = retryAfter * 1000 + Math.random() * 1000;
        console.warn(`[Executor] Rate limited. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] Groq Executor ${response.status}: ${errText}`);
        }
        throw new Error(`Groq Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const markdown = data.choices[0].message.content;
      const rawResponse = JSON.stringify(data);

      if (!options?.disableCache) {
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const tmpCachePath = `${cacheFilePath}.tmp.${process.pid}.${Date.now()}`;
        fs.writeFileSync(
          tmpCachePath,
          JSON.stringify({ cacheKey, model, temperature, markdown, rawResponse }, null, 2),
          'utf-8'
        );
        fs.renameSync(tmpCachePath, cacheFilePath);
      }

      return { markdown, rawResponse, fromCache: false, cacheKey };
    } catch (err: any) {
      if (
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]')
      ) {
        throw err;
      }
      attempt++;
      if (attempt >= MAX_RETRIES) throw err;
      const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}

export interface SqlExecutorResult {
  sql: string;
  rawResponse: string;
  fromCache?: boolean;
  cacheKey?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
  const model = options?.model || MODEL;
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
      if (typeof cached.sql === 'string' && typeof cached.rawResponse === 'string') {
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
        return {
          sql: cached.sql,
          rawResponse: cached.rawResponse,
          fromCache: true,
          cacheKey,
          usage,
        };
      }
    } catch {
      // Fall through and recompute if cache file is unreadable
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const fullPrompt = `${systemPrompt}\n${userPrompt}`;
  assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  const MAX_RETRIES = 10;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const reqSignal = AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
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
        signal: reqSignal,
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const resetTokensHeader = response.headers.get('x-ratelimit-reset-tokens');
        let delaySec = 5;
        if (retryAfterHeader) {
          delaySec = parseFloat(retryAfterHeader);
        } else if (resetTokensHeader) {
          delaySec = parseFloat(resetTokensHeader);
        }
        if (isNaN(delaySec) || delaySec <= 0) delaySec = 5;
        const waitSec = Math.min(Math.ceil(delaySec) + 1, 600);
        console.warn(`[Executor] Rate limited (retry-after: ${delaySec}s). Backing off for ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] Groq Executor ${response.status}: ${errText}`);
        }
        throw new Error(`Groq Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const sql = stripSqlFences(rawContent);
      const rawResponse = JSON.stringify(data);
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
        fs.writeFileSync(
          tmpCachePath,
          JSON.stringify({ cacheKey, model, temperature, sql, rawResponse }, null, 2),
          'utf-8'
        );
        fs.renameSync(tmpCachePath, cacheFilePath);
      }

      return { sql, rawResponse, fromCache: false, cacheKey, usage };
    } catch (err: any) {
      if (
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]')
      ) {
        throw err;
      }
      attempt++;
      if (attempt >= MAX_RETRIES) throw err;
      const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}
