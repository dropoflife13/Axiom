import path from 'node:path';
import { generateAgentMarkdown } from './executor.js';
import { verifyAgentMarkdown } from './verifier/agent-verifier.js';
import { buildVaultIndex } from './verifier/vault-index.js';
import { saveLesson, getRelevantLessons } from './memory.js';
import { generateLesson } from './advisor.js';

const TASK = process.env.TASK || 'Create a DevOps Agent that handles multi-cloud deployments.';
const MAX_ATTEMPTS = 3;

async function runLoop() {
  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  let lesson = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n=== ATTEMPT ${attempt} ===`);

    try {
      const result = await generateAgentMarkdown(TASK, lesson);
      const verdict = verifyAgentMarkdown(result.markdown, ctx);

      console.log(`Verdict: ${verdict.verdict}`);

      if (verdict.verdict === 'PASS') {
        console.log('✅ SUCCESS on attempt', attempt);
        console.log('\n--- GENERATED MARKDOWN ---');
        console.log(result.markdown);
        return;
      }

      console.log('Errors:', verdict.errors.map(e => `[${e.code}] line ${e.line}: ${e.detail}`));

      const firstError = verdict.errors[0];
      if (!firstError) break;

      console.log('Generating lesson for first error:', firstError.code);
      const newLesson = await generateLesson(firstError.code, firstError.detail);
      console.log('Lesson produced by Advisor:', newLesson);

      saveLesson({
        errorCode: firstError.code,
        lesson: newLesson,
        createdAt: new Date().toISOString(),
      });

      lesson = getRelevantLessons(verdict.errors.map(e => e.code));
      console.log('Cumulative lessons for next attempt:\n', lesson);
    } catch (err: any) {
      console.error(`Error during attempt ${attempt}:`, err.message);
      return;
    }
  }

  console.log('\n❌ Failed after', MAX_ATTEMPTS, 'attempts');
}

runLoop();

