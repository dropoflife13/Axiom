import dotenv from 'dotenv';
import { assertBudgetAvailable } from './guardrails.js';
dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_ADVISOR_MODEL || 'qwen/qwen3.8-27b';

export const ADVISOR_SYSTEM_PROMPT =
  'You are a terse syntax coach. Convert the verifier error into one concrete rule under 24 words. Do NOT reference any specific IDs, task names, or variable names from the error.';

export async function generateLesson(
  errorCode: string,
  errorDetail: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const systemPrompt = ADVISOR_SYSTEM_PROMPT;
  const userPrompt = `Error code: ${errorCode}\nError detail: ${errorDetail}`;
  const fullPrompt = `${systemPrompt}\n${userPrompt}`;

  const abortSignal = assertBudgetAvailable('ADVISOR', fullPrompt.length);

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
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
        signal: abortSignal,
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        if (retryAfter > 30) {
          throw new Error(`[ABORT_NON_RETRYABLE] Rate limit retry-after too high (${retryAfter}s).`);
        }
        const delay = retryAfter * 1000 + Math.random() * 1000;
        console.warn(`[Advisor] Rate limited. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        if (response.status < 500) {
          throw new Error(`[ABORT_NON_RETRYABLE] Groq Advisor ${response.status}: ${errText}`);
        }
        throw new Error(`Groq Advisor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      return data.choices[0].message.content.trim();
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
