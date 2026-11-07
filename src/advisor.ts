import dotenv from 'dotenv';
import { assertBudgetAvailable } from './guardrails.js';
dotenv.config();

const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const CHAT_URL = `${NVIDIA_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
const MODEL = process.env.NVIDIA_ADVISOR_MODEL || 'deepseek-ai/deepseek-v4.1-flash';

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
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('NVIDIA_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const effectiveModel = normalizeAdvisorModel(MODEL);
  const systemPrompt = ADVISOR_SYSTEM_PROMPT;
  const userPrompt = `Error code: ${errorCode}\nError detail: ${errorDetail}`;
  const fullPrompt = `${systemPrompt}\n${userPrompt}`;

  const abortSignal = assertBudgetAvailable('ADVISOR', fullPrompt.length);

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
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
        signal: abortSignal,
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
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] NVIDIA Advisor ${response.status}: ${errText}`);
        }
        throw new Error(`NVIDIA Advisor 5xx ${response.status}: ${errText}`);
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
