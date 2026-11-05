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
Follow this EXACT format:

# [Name] Agent — [Subtitle]

## 1. Identity & Scope
- **Role:** [Role description]
- **Owns:** [Owned domains and deliverables]
- **Does NOT own:** [Explicitly unowned areas]

## 2. Read-First (Docs to open before acting)
- [List of reference files or docs]

## 3. Hard Restrictions (With Rule IDs)
- **[PREFIX]-01** [Rule title]: WHEN [trigger] → DO [action]. *breaks: [boundary condition]* | conf: 3

## 4. Required Checks (Checklist)
- [ ] [Verification item] ([PREFIX]-01)

## 5. Gate vs Insight Mode
- **Gate**: Evaluate rules. Output GATE: PASS or GATE: FAIL.
- **Insight**: Output INSIGHT [details].

## 6. Handoff (Who gets the work next)
- Receives work from and hands off to appropriate agents.

CRITICAL INVARIANTS:
1. H1 MUST use an em dash "—" (not a hyphen).
2. Section 1 MUST have bullets "- **Role:**", "- **Owns:**", "- **Does NOT own:**".
3. All 6 H2 sections must be present in exact order: "## 1. Identity & Scope", "## 2. Read-First", "## 3. Hard Restrictions", "## 4. Required Checks", "## 5. Gate vs Insight Mode", "## 6. Handoff".
4. Section 3 rules containing WHEN must contain "→ DO" and end with "| conf: N" where N is 1..5.
5. Section 4 checklist items must cite rule IDs like ([PREFIX]-01).
6. Section 5 must explicitly contain "GATE: PASS", "GATE: FAIL", and "INSIGHT".

${lesson ? `\nCRITICAL LESSON FROM PREVIOUS FAILURE:\n${lesson}` : ''}`;

  const promptPayload = `${systemPrompt}\n${task}`;
  const signal = assertBudgetAvailable('EXECUTOR', promptPayload);

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  const markdown = data.choices[0].message.content;
  return { markdown, rawResponse: JSON.stringify(data) };
}
