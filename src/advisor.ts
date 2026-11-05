import dotenv from 'dotenv';
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

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a strict system architect. Analyze the error and write ONE sentence describing the general rule that prevents it. Do NOT reference any specific IDs, task names, or variable names from the error. The lesson must apply to ANY agent, not just this one.',
            },
            {
              role: 'user',
              content: `Error code: ${errorCode}\nError detail: ${errorDetail}`,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        const jitter = Math.random() * 1000;
        const delay = retryAfter * 1000 + jitter;

        console.warn(`[Advisor] Rate limited (429). Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Groq Advisor API error ${response.status}: ${errorBody}`);
      }

      const data: any = await response.json();
      return data.choices[0].message.content.trim();
    } catch (err: any) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(`[Advisor] Request failed: ${err.message}. Retrying in ${backoffDelay.toFixed(0)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  throw new Error(`[Advisor] Failed after ${MAX_RETRIES} attempts.`);
}
