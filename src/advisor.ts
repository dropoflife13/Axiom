import dotenv from 'dotenv';
import { assertBudgetAvailable, BUDGET_GUARD } from './guardrails.js';
dotenv.config();

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const CHAT_URL = `${OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
const MODEL =
  process.env.OPENROUTER_ADVISOR_MODEL ||
  process.env.OPENROUTER_EXECUTOR_MODEL ||
  'meta-llama/llama-3.3-70b-instruct';

function normalizeAdvisorModel(m: string): string {
  if (m === 'gemini-3.5') return 'gemini-3.5-flash';
  if (m === 'gemini-3.8') return 'gemini-3.8-flash';
  return m;
}

export const ADVISOR_SYSTEM_PROMPT =
  'You are a terse syntax coach. Convert the verifier error into one concrete rule under 24 words. Do NOT reference any specific IDs, task names, or variable names from the error.';

export async function generateLesson(
  errorCode: string,
  errorDetail: string
): Promise<string> {
  const executorModel = (
    process.env.OPENROUTER_EXECUTOR_MODEL ||
    process.env.NVIDIA_EXECUTOR_MODEL ||
    'z-ai/glm-5.3-flash'
  ).trim();
  const isGroq = executorModel === 'qwen/qwen3.8-27b' || executorModel.startsWith('qwen/');
  const isNvidia =
    executorModel.startsWith('nvidia/') ||
    executorModel.startsWith('google/') ||
    executorModel.startsWith('z-ai/');
  const isOpenRouter = !isGroq && !isNvidia;

  const apiKey = isGroq
    ? process.env.GROQ_API_KEY
    : isNvidia
    ? process.env.NVIDIA_API_KEY
    : process.env.OPENROUTER_API_KEY;

  if (!apiKey || apiKey === 'your_key_here') {
    const keyName = isGroq
      ? 'GROQ_API_KEY'
      : isNvidia
      ? 'NVIDIA_API_KEY'
      : 'OPENROUTER_API_KEY';
    throw new Error(`${keyName} is not set or is still the placeholder. Please set a valid key in .env`);
  }

  const baseUrl = isGroq
    ? (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1')
    : isNvidia
    ? (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1')
    : OPENROUTER_BASE_URL;

  const chatUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const rawModel = isGroq
    ? (process.env.GROQ_ADVISOR_MODEL || 'qwen/qwen3.8-27b')
    : isNvidia
    ? (process.env.NVIDIA_ADVISOR_MODEL || 'z-ai/glm-5.3-flash')
    : MODEL;
  const effectiveModel = normalizeAdvisorModel(rawModel);
  const systemPrompt = ADVISOR_SYSTEM_PROMPT;
  const userPrompt = `Error code: ${errorCode}\nError detail: ${errorDetail}`;
  const fullPrompt = `${systemPrompt}\n${userPrompt}`;

  const abortSignal = assertBudgetAvailable('ADVISOR', fullPrompt.length);

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const reqSignal =
        attempt === 0 ? abortSignal : AbortSignal.timeout(BUDGET_GUARD.callTimeoutMs);
      const response = await fetch(chatUrl, {
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
          temperature: 0.3,
          max_tokens: 4096,
        }),
        signal: reqSignal,
      });

      if (response.status === 429 || response.status === 503) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '3', 10);
        if (retryAfter > 30) {
          throw new Error(`[ABORT_NON_RETRYABLE] Rate limit / 503 retry-after too high (${retryAfter}s).`);
        }
        const delay = (retryAfter + (attempt + 1) * 2) * 1000 + Math.random() * 1000;
        console.warn(`[Advisor] ${response.status === 429 ? 'Rate limited' : 'High demand (503)'}. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        const providerName = isOpenRouter ? 'OpenRouter' : isGroq ? 'Groq' : 'NVIDIA';
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] ${providerName} Advisor ${response.status}: ${errText}`);
        }
        throw new Error(`${providerName} Advisor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new Error('[ABORT_NON_RETRYABLE] Advisor response stopped at token limit (finish_reason=length).');
      }
      const rawContent = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      const content = rawContent
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')
        .trim();
      if (!content) {
        throw new Error('[ABORT_NON_RETRYABLE] Advisor response contained no final content.');
      }
      return content;
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

  throw new Error(`[Advisor] Failed after ${MAX_RETRIES} attempts.`);
}
