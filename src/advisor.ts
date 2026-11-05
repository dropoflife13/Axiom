import dotenv from 'dotenv';
dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

export async function generateLesson(
  errorCode: string,
  errorDetail: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GROQ_API_KEY is not set or is still the placeholder. Please set a valid key in .env');
  }

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
            'You are a strict system architect. Analyze the error and write ONE sentence describing the rule that prevents it. Be specific and actionable.',
        },
        {
          role: 'user',
          content: `Error code: ${errorCode}\nError detail: ${errorDetail}`,
        },
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

