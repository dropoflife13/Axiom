import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { assertBudgetAvailable, BUDGET_GUARD } from './guardrails.js';
dotenv.config();

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const CHAT_URL = `${OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;

export const ALLOWED_EXECUTOR_MODELS = [
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'qwen/qwen3.8-27b',
  'xingchen-agi/xing4.0-29b-a4b:free',
  'z-ai/glm-5.3-flash',
  'liquid/lfm-3-1.7b',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemma-4-31b-it',
  'gemma-4-26b-it',
  'gemma-4-26b-a4b-it',
  'nvidia/nemotron-3.5-lightning:free',
  'openai/gpt-oss-120b',
] as const;
export const REQUIRED_MODELS = ALLOWED_EXECUTOR_MODELS;
export type AllowedExecutorModel = (typeof ALLOWED_EXECUTOR_MODELS)[number];

export const PROVIDER = 'openrouter';

export function resolveEndpoint(model: string) {
  const isKilo =
    model === 'nvidia/nemotron-3.5-lightning:free' ||
    model.startsWith('kilo-') ||
    model === process.env.KILO_NEMOTRON_MODEL ||
    model === process.env.KILO_CODE_MODEL ||
    model === process.env.KILO_AUTO_MODEL;
  if (isKilo) {
    const apiKey = process.env.KILO_API_KEY || '';
    const baseUrl = process.env.KILO_BASE_URL || 'https://api.kilo.ai/api/gateway';
    const chatUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return { provider: 'kilo', apiKey, baseUrl, chatUrl };
  }
  const isGemini =
    model === 'gemini-3.6-flash' ||
    model.startsWith('gemini-') ||
    model.startsWith('gemma-');
  if (isGemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error('GEMINI_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
    }
    const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const chatUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return { provider: 'gemini', apiKey, baseUrl, chatUrl };
  }
  const isGroq =
    model === 'openai/gpt-oss-120b' ||
    model.startsWith('openai/gpt-oss') ||
    model === 'qwen/qwen3.8-27b' ||
    model.startsWith('qwen/') ||
    model.startsWith('llama') ||
    model.startsWith('meta-llama/');
  if (isGroq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
    }
    const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    const chatUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return { provider: 'groq', apiKey, baseUrl, chatUrl };
  }
  const isNvidia =
    model.startsWith('nvidia/') ||
    model.startsWith('google/') ||
    model.startsWith('z-ai/');
  if (isNvidia) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      throw new Error('NVIDIA_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
    }
    const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const chatUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return { provider: 'nvidia', apiKey, baseUrl, chatUrl };
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('OPENROUTER_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }
  const baseUrl = OPENROUTER_BASE_URL;
  const chatUrl = CHAT_URL;
  return { provider: 'openrouter', apiKey, baseUrl, chatUrl };
}

export function resolveExecutorModel(explicitModel?: string): string {
  const resolved = (
    explicitModel ??
    process.env.NVIDIA_EXECUTOR_MODEL ??
    process.env.GEMINI_EXECUTOR_MODEL ??
    ''
  ).trim();
  if (!resolved) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Executor model is an explicit required setting with no silent default. Set NVIDIA_EXECUTOR_MODEL in the environment or pass options.model. Allowed models: ${ALLOWED_EXECUTOR_MODELS.join(', ')}.`
    );
  }
  if (!ALLOWED_EXECUTOR_MODELS.includes(resolved as any)) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Executor model must be one of [${ALLOWED_EXECUTOR_MODELS.join(', ')}], got "${resolved}".`
    );
  }
  return resolved;
}

export const REQUIRED_EXECUTOR_MODEL =
  process.env.OPENROUTER_EXECUTOR_MODEL ||
  process.env.NVIDIA_EXECUTOR_MODEL ||
  'z-ai/glm-5.3-flash';

export function assertModelMatch(requestedModel: string, returnedModel: string): void {
  const configured = resolveExecutorModel(requestedModel);
  if (requestedModel !== configured) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Requested model "${requestedModel}" does not match configured model "${configured}".`
    );
  }
  const normReturned = returnedModel.replace(/^models\//, '');
  const baseRequested = requestedModel.replace(/:free$/, '');
  const baseReturned = normReturned.replace(/:free$/, '');
  const isGemmaAlias =
    requestedModel === 'gemma-4-26b-it' &&
    (returnedModel === 'gemma-4-26b-a4b-it' || normReturned === 'gemma-4-26b-a4b-it');
  if (
    returnedModel !== requestedModel &&
    normReturned !== requestedModel &&
    baseReturned !== baseRequested &&
    !isGemmaAlias &&
    returnedModel !== `${requestedModel}:free` &&
    !returnedModel.startsWith(`${requestedModel}:`)
  ) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] Returned model "${returnedModel}" does not match requested model "${requestedModel}".`
    );
  }
}

const EXECUTOR_SELF_PATH = fileURLToPath(import.meta.url);

export function getExecutorSha256(filePath: string = EXECUTOR_SELF_PATH): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function getProviderProvenance(
  requestedModel: string,
  returnedModel: string = requestedModel
) {
  const endpoint = resolveEndpoint(requestedModel);
  const factsPath = path.resolve('fixtures/task-v2/facts.json');
  return {
    provider: endpoint.provider,
    baseUrl: endpoint.baseUrl,
    requestedModel,
    returnedModel,
    oracleCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    factsSha256: crypto.createHash('sha256').update(fs.readFileSync(factsPath)).digest('hex'),
    executorSha256: getExecutorSha256(),
  };
}

export interface ModelProfile {
  model: string;
  reasoningMode: 'off' | 'minimal' | 'low' | 'provider-default';
  reasoningLabel: string;
  maxTokens: number;
  timeoutMs: number;
  cacheKeySuffix?: string;
  extraRequestBody: Record<string, unknown>;
}

export function getModelProfile(model: string): ModelProfile {
  const effectiveModel = normalizeModelName(model);
  if (
    effectiveModel === 'gemma-4-26b-a4b-it' ||
    effectiveModel === 'gemma-4-31b-it'
  ) {
    return {
      model: effectiveModel,
      reasoningMode: 'minimal',
      reasoningLabel: 'thinking_level=minimal (extra_body.google.thinking_config)',
      maxTokens: 8192,
      timeoutMs: 180_000,
      cacheKeySuffix: '|profile=thinking_level:minimal',
      extraRequestBody: {
        extra_body: {
          google: {
            thinking_config: {
              thinking_level: 'minimal',
            },
          },
        },
      },
    };
  }
  if (effectiveModel.includes('lightning')) {
    return {
      model: effectiveModel,
      reasoningMode: 'off',
      reasoningLabel: 'reasoning_effort=none, enable_thinking=false',
      maxTokens: 16384,
      timeoutMs: 180_000,
      extraRequestBody: {
        reasoning_effort: 'none',
        chat_template_kwargs: { enable_thinking: false },
      },
    };
  }
  if (effectiveModel.includes('glm')) {
    return {
      model: effectiveModel,
      reasoningMode: 'low',
      reasoningLabel: 'reasoning_effort=low',
      maxTokens: 8192,
      timeoutMs: 180_000,
      extraRequestBody: {
        reasoning_effort: 'low',
      },
    };
  }
  return {
    model: effectiveModel,
    reasoningMode: 'provider-default',
    reasoningLabel: 'provider-default',
    maxTokens: 8192,
    timeoutMs: 180_000,
    extraRequestBody: {},
  };
}

export function normalizeModelName(m: string): string {
  if (m === 'gemma-4-26b-it') return 'gemma-4-26b-a4b-it';
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
  const endpoint = resolveEndpoint(model);
  const profile = getModelProfile(model);
  const suffix = profile.cacheKeySuffix ?? '';
  return crypto
    .createHash('sha256')
    .update(`${endpoint.baseUrl}${model}${system}${user}${temperature}${suffix}`)
    .digest('hex');
}

export type ReasoningTagError =
  | 'unclosed_tag'
  | 'unmatched_closing_tag'
  | 'mismatched_closing_tag'
  | 'leftover_tag';

export interface SanitizeTextResult {
  sanitizedText: string;
  tagError: ReasoningTagError | null;
  strippedBlocks: number;
  foundReasoningTags: boolean;
}

export interface SanitizeSqlResult {
  sanitizedSql: string;
  tagError: ReasoningTagError | null;
  strippedBlocks: number;
  foundReasoningTags: boolean;
}

function sha256String(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function tryConsumeSqlLiteralOrComment(text: string, i: number): number {
  const len = text.length;
  const ch = text[i];

  // SQL line comment: -- ... \n
  if (ch === '-' && text[i + 1] === '-') {
    const nl = text.indexOf('\n', i + 2);
    return nl === -1 ? len : nl + 1;
  }

  // SQL block comment: /* ... */ (with PostgreSQL nested block comment support)
  if (ch === '/' && text[i + 1] === '*') {
    let depth = 1;
    let j = i + 2;
    while (j < len && depth > 0) {
      if (text[j] === '/' && text[j + 1] === '*') {
        depth++;
        j += 2;
      } else if (text[j] === '*' && text[j + 1] === '/') {
        depth--;
        j += 2;
      } else {
        j++;
      }
    }
    return depth === 0 ? j : -1;
  }

  // SQL single-quoted string literal '...' or E'...'
  if (ch === '\'') {
    const isEscape =
      i > 0 &&
      (text[i - 1] === 'e' || text[i - 1] === 'E') &&
      (i === 1 || !/[A-Za-z0-9_$]/.test(text[i - 2]));
    let j = i + 1;
    while (j < len) {
      if (isEscape && text[j] === '\\') {
        j += 2;
        continue;
      }
      if (text[j] === '\'') {
        if (text[j + 1] === '\'') {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return -1;
  }

  // SQL double-quoted identifier "..." on single line
  if (ch === '"') {
    let j = i + 1;
    while (j < len) {
      if (text[j] === '\n' || text[j] === '\r') {
        return -1;
      }
      if (text[j] === '"') {
        if (text[j + 1] === '"') {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return -1;
  }

  // PostgreSQL dollar-quoted string $tag$...$tag$
  if (ch === '$') {
    const m = text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (m) {
      const delim = m[0];
      const closeIdx = text.indexOf(delim, i + delim.length);
      return closeIdx === -1 ? -1 : closeIdx + delim.length;
    }
  }

  return -1;
}

/**
 * Strips well-formed closed <think>...</think> and <thought>...</thought> reasoning
 * blocks (including nested blocks). When sqlAware=true (default), SQL comments and
 * literals at top level are preserved untouched. Unclosed, unmatched, or leftover tags
 * are preserved (never stripped to a silent empty string) and flagged via `tagError`.
 */
export function sanitizeReasoningTags(
  rawContent: string,
  options?: { sqlAware?: boolean }
): SanitizeTextResult {
  const sqlAware = options?.sqlAware ?? true;
  const stack: Array<{ tag: 'think' | 'thought'; startOffset: number }> = [];
  let out = '';
  let tagError: ReasoningTagError | null = null;
  let strippedBlocks = 0;
  let foundReasoningTags = false;
  let i = 0;

  while (i < rawContent.length) {
    if (stack.length === 0) {
      if (sqlAware) {
        const consumedEnd = tryConsumeSqlLiteralOrComment(rawContent, i);
        if (consumedEnd > i) {
          out += rawContent.slice(i, consumedEnd);
          i = consumedEnd;
          continue;
        }
      }

      if (rawContent[i] === '<') {
        const slice = rawContent.slice(i);
        const openMatch = slice.match(/^<(think|thought)(?:\s+[^>]*)?>/i);
        if (openMatch) {
          foundReasoningTags = true;
          stack.push({
            tag: openMatch[1].toLowerCase() as 'think' | 'thought',
            startOffset: i,
          });
          i += openMatch[0].length;
          continue;
        }

        const closeMatch = slice.match(/^<\/(think|thought)(?:\s+[^>]*)?>/i);
        if (closeMatch) {
          foundReasoningTags = true;
          tagError = tagError ?? 'unmatched_closing_tag';
          out += closeMatch[0];
          i += closeMatch[0].length;
          continue;
        }

        const partialMatch = slice.match(/^<\/?(?:think|thought)(?=[\s/>]|$)/i);
        if (partialMatch) {
          foundReasoningTags = true;
          tagError = tagError ?? 'leftover_tag';
          out += partialMatch[0];
          i += partialMatch[0].length;
          continue;
        }
      }

      out += rawContent[i];
      i++;
    } else {
      if (rawContent[i] === '<') {
        const slice = rawContent.slice(i);
        const openMatch = slice.match(/^<(think|thought)(?:\s+[^>]*)?>/i);
        if (openMatch) {
          stack.push({
            tag: openMatch[1].toLowerCase() as 'think' | 'thought',
            startOffset: i,
          });
          i += openMatch[0].length;
          continue;
        }

        const closeMatch = slice.match(/^<\/(think|thought)(?:\s+[^>]*)?>/i);
        if (closeMatch) {
          const closeTag = closeMatch[1].toLowerCase() as 'think' | 'thought';
          const top = stack[stack.length - 1];
          if (top.tag === closeTag) {
            stack.pop();
            i += closeMatch[0].length;
            if (stack.length === 0) {
              strippedBlocks++;
            }
            continue;
          } else {
            tagError = tagError ?? 'mismatched_closing_tag';
            const outermost = stack[0].startOffset;
            stack.length = 0;
            out += rawContent.slice(outermost, i + closeMatch[0].length);
            i += closeMatch[0].length;
            continue;
          }
        }
      }
      i++;
    }
  }

  if (stack.length > 0) {
    tagError = tagError ?? 'unclosed_tag';
    out += rawContent.slice(stack[0].startOffset);
  }

  return {
    sanitizedText: out,
    tagError,
    strippedBlocks,
    foundReasoningTags,
  };
}

export function sanitizeSqlOutput(rawContent: string): SanitizeSqlResult {
  const pass1 = sanitizeReasoningTags(rawContent, { sqlAware: true });
  if (pass1.tagError !== null) {
    return {
      sanitizedSql: pass1.sanitizedText.trim(),
      tagError: pass1.tagError,
      strippedBlocks: pass1.strippedBlocks,
      foundReasoningTags: pass1.foundReasoningTags,
    };
  }

  const candidate = stripSqlFences(pass1.sanitizedText);
  const pass2 = sanitizeReasoningTags(candidate, { sqlAware: true });
  if (pass2.tagError !== null || pass2.strippedBlocks > 0) {
    return {
      sanitizedSql: pass2.sanitizedText.trim(),
      tagError: pass2.tagError ?? 'leftover_tag',
      strippedBlocks: pass1.strippedBlocks + pass2.strippedBlocks,
      foundReasoningTags: pass1.foundReasoningTags || pass2.foundReasoningTags,
    };
  }

  return {
    sanitizedSql: candidate,
    tagError: null,
    strippedBlocks: pass1.strippedBlocks,
    foundReasoningTags: pass1.foundReasoningTags,
  };
}

function finalMessageContent(choice: any, context: string): string {
  const finishReason = choice?.finish_reason;
  if (finishReason === 'length') {
    throw new Error(`[ABORT_NON_RETRYABLE] ${context} response stopped at token limit (finish_reason=length).`);
  }
  const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  const sanitized = sanitizeReasoningTags(rawContent, { sqlAware: false });
  if (sanitized.tagError) {
    throw new Error(
      `[ABORT_NON_RETRYABLE] ${context} response contained malformed/unclosed reasoning tag (${sanitized.tagError}).`
    );
  }
  const content = sanitized.sanitizedText.trim();
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

  const endpoint = resolveEndpoint(model);

  if (!options?.disableCache && fs.existsSync(cacheFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      if (
        typeof cached.markdown === 'string' &&
        typeof cached.rawResponse === 'string' &&
        cached.provider === endpoint.provider &&
        cached.baseUrl === endpoint.baseUrl &&
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

  const effectiveModel = normalizeModelName(model);
  const profile = getModelProfile(model);
  const fullPrompt = `${systemPrompt}\n${task}`;
  const abortSignal = assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(endpoint.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(endpoint.apiKey && endpoint.apiKey !== 'your_key_here'
            ? { Authorization: `Bearer ${endpoint.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task },
          ],
          temperature,
          max_tokens: profile.maxTokens,
          ...profile.extraRequestBody,
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
          throw new Error(`[ABORT_NON_RETRYABLE] ${endpoint.provider.toUpperCase()} Executor ${response.status}: ${errText}`);
        }
        throw new Error(`${endpoint.provider.toUpperCase()} Executor 5xx ${response.status}: ${errText}`);
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
      if (attempt >= MAX_RETRIES) throw err;
      const backoffDelay = Math.min(Math.pow(2, Math.min(attempt, 6)) * 1000 + Math.random() * 1000, 30_000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}

export type GenerationStatus = 'ok' | 'empty' | 'length' | 'other';

export interface SqlExecutorResult {
  sql: string;
  rawResponse: string;
  rawSha256?: string;
  sanitizedSql?: string;
  sanitizedSha256?: string;
  tagError?: ReasoningTagError | null;
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
  explicitStatus?: GenerationStatus,
  tagError?: ReasoningTagError | null
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
  if (tagError) {
    return 'other';
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
    const candidateSanitized = res.sanitizedSql ?? res.sql;
    const generationStatus = classifyGenerationStatus(
      res.finishReason,
      candidateSanitized,
      res.generationStatus,
      res.tagError
    );
    const sql = generationStatus === 'ok' ? res.sql : '';
    const rawResponse = res.rawResponse ?? '';
    return {
      ...res,
      sql,
      rawResponse,
      rawSha256: res.rawSha256 ?? sha256String(rawResponse),
      sanitizedSql: candidateSanitized,
      sanitizedSha256: res.sanitizedSha256 ?? sha256String(candidateSanitized),
      generationStatus,
    };
  } catch (err) {
    const coerced = coerceDeterministicGenerationFailure(err, requestedModel);
    if (coerced) {
      assertModelMatch(coerced.requestedModel, coerced.returnedModel);
      const rawResponse = coerced.rawResponse ?? '';
      return {
        ...coerced,
        sql: '',
        rawResponse,
        rawSha256: coerced.rawSha256 ?? sha256String(rawResponse),
        sanitizedSql: coerced.sanitizedSql ?? '',
        sanitizedSha256: coerced.sanitizedSha256 ?? sha256String(coerced.sanitizedSql ?? ''),
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

export const SQL_GENERATION_MAX_RETRIES = 3;

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

  const endpoint = resolveEndpoint(model);

  if (!options?.disableCache && fs.existsSync(cacheFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      if (
        typeof cached.sql === 'string' &&
        typeof cached.rawResponse === 'string' &&
        cached.provider === endpoint.provider &&
        cached.baseUrl === endpoint.baseUrl &&
        cached.requestedModel === model
      ) {
        assertModelMatch(cached.requestedModel, cached.returnedModel);
        let usage: SqlExecutorResult['usage'] | undefined;
        let cachedRawContent: string | undefined;
        try {
          const parsedRaw = JSON.parse(cached.rawResponse);
          if (parsedRaw?.usage) {
            usage = {
              promptTokens: parsedRaw.usage.prompt_tokens ?? 0,
              completionTokens: parsedRaw.usage.completion_tokens ?? 0,
              totalTokens: parsedRaw.usage.total_tokens ?? 0,
            };
          }
          if (typeof parsedRaw?.choices?.[0]?.message?.content === 'string') {
            cachedRawContent = parsedRaw.choices[0].message.content;
          }
        } catch {
          // ignore
        }
        const sanitizedFromCache = sanitizeSqlOutput(
          cachedRawContent !== undefined ? cachedRawContent : cached.sql
        );
        const explicitCachedStatus =
          cached.generationStatus === 'length' || cached.generationStatus === 'other'
            ? cached.generationStatus
            : undefined;
        const cachedStatus = classifyGenerationStatus(
          cached.finishReason,
          sanitizedFromCache.sanitizedSql,
          explicitCachedStatus,
          sanitizedFromCache.tagError
        );
        const finalSql = cachedStatus === 'ok' ? sanitizedFromCache.sanitizedSql : '';
        return {
          sql: finalSql,
          rawResponse: cached.rawResponse,
          rawSha256: cached.rawSha256 ?? sha256String(cached.rawResponse),
          sanitizedSql: sanitizedFromCache.sanitizedSql,
          sanitizedSha256: sha256String(sanitizedFromCache.sanitizedSql),
          tagError: sanitizedFromCache.tagError,
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

  const effectiveModel = normalizeModelName(model);
  const profile = getModelProfile(model);
  const fullPrompt = `${systemPrompt}\n${userPrompt}`;
  assertBudgetAvailable('EXECUTOR', fullPrompt.length);

  // Cap retries at 3 so repeated 180s timeouts or 5xx errors fail after 3 attempts.
  const MAX_RETRIES = SQL_GENERATION_MAX_RETRIES;
  const MAX_RATE_LIMIT_RETRIES = 50;
  let attempt = 0;
  let rateLimitAttempts = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const reqSignal = AbortSignal.timeout(Math.max(BUDGET_GUARD.callTimeoutMs, profile.timeoutMs));
      const response = await fetch(endpoint.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(endpoint.apiKey && endpoint.apiKey !== 'your_key_here'
            ? { Authorization: `Bearer ${endpoint.apiKey}` }
            : {}),
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
        signal: reqSignal,
      });

      if (response.status === 429 || response.status === 503) {
        rateLimitAttempts++;
        if (rateLimitAttempts >= MAX_RATE_LIMIT_RETRIES) {
          throw new Error(`[ABORT_NON_RETRYABLE] Exceeded ${MAX_RATE_LIMIT_RETRIES} rate limit backoff attempts.`);
        }
        const retryAfterHeader = response.headers.get('retry-after');
        let delaySec = 10 + rateLimitAttempts * 5;
        if (retryAfterHeader) {
          const parsed = parseFloat(retryAfterHeader);
          if (!isNaN(parsed) && parsed > 0) delaySec = Math.max(delaySec, parsed);
        }
        const waitSec = Math.min(Math.ceil(delaySec) + Math.random() * 2, 60);
        console.warn(
          `[Executor] ${response.status === 429 ? 'Rate limited (429)' : 'High demand (503)'} on attempt ${rateLimitAttempts}/${MAX_RATE_LIMIT_RETRIES}. Backing off for ${waitSec.toFixed(1)}s...`
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] ${endpoint.provider.toUpperCase()} Executor ${response.status}: ${errText}`);
        }
        throw new Error(`${endpoint.provider.toUpperCase()} Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      const finishReason: string = choice?.finish_reason ?? 'unknown';
      const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const sanitized = sanitizeSqlOutput(rawContent);
      const generationStatus = classifyGenerationStatus(
        finishReason,
        sanitized.sanitizedSql,
        undefined,
        sanitized.tagError
      );
      const sql = generationStatus === 'ok' ? sanitized.sanitizedSql : '';
      const rawResponse = JSON.stringify(data);
      const rawSha256 = sha256String(rawResponse);
      const sanitizedSha256 = sha256String(sanitized.sanitizedSql);
      const returnedModel = data.model || effectiveModel;
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
            sanitizedSql: sanitized.sanitizedSql,
            sanitizedSha256,
            rawResponse,
            rawSha256,
            tagError: sanitized.tagError,
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
        rawSha256,
        sanitizedSql: sanitized.sanitizedSql,
        sanitizedSha256,
        tagError: sanitized.tagError,
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
      if (attempt >= MAX_RETRIES) throw err;
      const backoffDelay = Math.min(Math.pow(2, Math.min(attempt, 6)) * 1000 + Math.random() * 1000, 30_000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Executor] Failed after ${MAX_RETRIES} attempts.`);
}
