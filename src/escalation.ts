import dotenv from 'dotenv';
dotenv.config();

export interface VerifierError {
  code: string;
  line?: number;
  detail?: string;
}

const HEAVY_SYSTEM_PROMPT = `You are an expert Cortex Agent generator. The fast model failed to produce a valid agent after 2 attempts. Study these lessons carefully and produce a Markdown agent that EXACTLY follows the format. Do not deviate.

The specification MUST strictly adhere to the following 6 H2 sections in exact order:
1. "## 1. Identity & Scope"
   - Must contain: - **Role:** ..., - **Owns:** ..., - **Does NOT own:** ...
2. "## 2. Read-First"
   - List essential reference files or documentation.
3. "## 3. Hard Restrictions"
   - Every rule MUST strictly match:
     "- **PREFIX-01** Title: WHEN <trigger> → DO <action>. *breaks: <condition>* | conf: <1-5>"
   - CRITICAL: The PREFIX before the hyphen MUST be between 1 and 5 uppercase letters (e.g., DEVOP-01, NOT DEVOPS-01).
   - Every rule line MUST end with "| conf: N" where N is between 1 and 5.
4. "## 4. Required Checks"
   - Must contain a checklist "- [ ] ... (PREFIX-nn)" where every item explicitly cites a rule ID defined in section 3.
5. "## 5. Gate vs Insight Mode"
   - Must explicitly contain: "GATE: PASS", "GATE: FAIL", and "INSIGHT".
6. "## 6. Handoff"
   - Explains who passes work to this agent and who gets the work next.

Output ONLY the raw markdown without any wrapping code fences (\`\`\`).`;

export async function callHeavyModel(
  task: string,
  errors: VerifierError[],
  lessons: string
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if ((!geminiKey || geminiKey === 'your_key_here') && (!anthropicKey || anthropicKey === 'your_key_here')) {
    throw new Error('Tier 3 escalation requires GEMINI_API_KEY or ANTHROPIC_API_KEY');
  }

  let prompt = `Task: ${task}\n\n`;
  if (errors.length > 0) {
    prompt += `PREVIOUS ATTEMPT ERRORS (MUST ALL BE RESOLVED):\n${errors.map((e) => `[${e.code}] ${e.detail || ''}`).join('\n')}\n\n`;
  }
  if (lessons) {
    prompt += `CRITICAL ARCHITECTURAL LESSONS:\n${lessons}\n\n`;
  }
  prompt += 'Generate the complete, compliant agent specification markdown now:';

  // 1. Gemini path
  if (geminiKey && geminiKey !== 'your_key_here') {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${geminiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: HEAVY_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini heavy model API error ${response.status}: ${errorBody}`);
    }

    const data: any = await response.json();
    const content = data.choices[0].message.content.trim();
    return content.replace(/^```markdown\s*/i, '').replace(/```$/g, '').trim();
  }

  // 2. Anthropic path
  if (anthropicKey && anthropicKey !== 'your_key_here') {
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system: HEAVY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic heavy model API error ${response.status}: ${errorBody}`);
    }

    const data: any = await response.json();
    const content = data.content[0].text.trim();
    return content.replace(/^```markdown\s*/i, '').replace(/```$/g, '').trim();
  }

  throw new Error('Tier 3 escalation requires GEMINI_API_KEY or ANTHROPIC_API_KEY');
}
