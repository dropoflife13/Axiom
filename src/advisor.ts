import dotenv from 'dotenv';
import { assertBudgetAvailable } from './guardrails.js';
dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_ADVISOR_MODEL || 'qwen/qwen3.8-27b';

export async function generateLesson(
  errorCode: string,
  errorDetail: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

  const systemContent =
    'You are a strict system architect. Analyze the error and write ONE sentence describing the general rule that prevents it. Do NOT reference any specific IDs, task names, or variable names from the error. The lesson must apply to ANY agent, not just this one.';
  const userContent = `Error code: ${errorCode}\nError detail: ${errorDetail}`;
  const promptPayload = `${systemContent}\n${userContent}`;

  const signal = assertBudgetAvailable('ADVISOR', promptPayload);

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq Advisor API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content.trim();
}
