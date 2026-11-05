import dotenv from 'dotenv';
import { assertBudgetAvailable } from './guardrails.js';
dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_EXECUTOR_MODEL || 'openai/gpt-oss-120b';

export interface ExecutorResult {
  markdown: string;
  rawResponse: string;
}

export async function generateAgentMarkdown(
  task: string,
  lesson?: string
): Promise<ExecutorResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

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
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task },
          ],
          temperature: 0.1,
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
          // Do NOT retry 400, 401, 403, 413, 422!
          throw new Error(`[ABORT_NON_RETRYABLE] Groq Executor ${response.status}: ${errText}`);
        }
        throw new Error(`Groq Executor 5xx ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const markdown = data.choices[0].message.content;
      return { markdown, rawResponse: JSON.stringify(data) };
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
