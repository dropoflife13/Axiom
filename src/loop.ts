import fs from 'node:fs';
import path from 'node:path';
import { generateAgentMarkdown } from './executor.js';
import { verifyAgentMarkdown } from './verifier/agent-verifier.js';
import { buildVaultIndex } from './verifier/vault-index.js';
import { saveLesson, getRelevantLessons } from './memory.js';
import { generateLesson } from './advisor.js';
import { tryDeterministicFix } from './fixer.js';
import { callHeavyModel } from './escalation.js';

export interface LoopOptions {
  task?: string;
  maxAttempts?: number;
  quarantinePath?: string;
  executorFn?: (task: string, lesson?: string) => Promise<{ markdown: string; rawResponse: string }>;
  heavyFn?: (task: string, errors: string[], lessons?: string) => Promise<{ markdown: string; rawResponse: string }>;
  advisorFn?: (code: string, detail: string) => Promise<string>;
  silent?: boolean;
}

export async function runReflexionLoop(options: LoopOptions = {}) {
  const task = options.task || process.env.TASK || 'Create a DevOps Agent that handles multi-cloud deployments.';
  const maxAttempts = options.maxAttempts ?? 3;
  const quarantinePath = options.quarantinePath || path.join(process.cwd(), 'quarantine.json');
  const executor = options.executorFn || generateAgentMarkdown;
  const heavy = options.heavyFn || callHeavyModel;
  const advisor = options.advisorFn || generateLesson;
  const log = options.silent ? () => {} : console.log;

  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  let lesson = '';
  let lastErrors: Array<{ code: string; line: number; detail: string }> = [];
  let lastMarkdown = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`\n=== ATTEMPT ${attempt} ${attempt === 3 ? '(TIER 3 ESCALATION)' : '(FAST PATH)'} ===`);

    try {
      let result: { markdown: string; rawResponse: string };

      if (attempt === 3) {
        log('[TIER 3] Escalating to heavy model...');
        result = await heavy(task, lastErrors.map((e) => `[${e.code}] line ${e.line}: ${e.detail}`), lesson);
      } else {
        result = await executor(task, lesson);
      }

      lastMarkdown = result.markdown;
      let verdict = verifyAgentMarkdown(result.markdown, ctx);
      log(`Verdict: ${verdict.verdict}`);

      if (verdict.verdict === 'PASS') {
        log(`✅ SUCCESS on attempt ${attempt}`);
        log('\n--- GENERATED MARKDOWN ---');
        log(result.markdown);
        return { success: true, attempt, markdown: result.markdown };
      }

      lastErrors = verdict.errors;
      log('Errors:', verdict.errors.map((e) => `[${e.code}] line ${e.line}: ${e.detail}`));

      // Tier 0: Deterministic Auto-Fix
      const fixResult = tryDeterministicFix(result.markdown, verdict.errors);
      if (fixResult.applied.length > 0) {
        log(`[TIER 0] Applied deterministic fix: ${fixResult.applied.join('; ')}`);
        const recheck = verifyAgentMarkdown(fixResult.fixed, ctx);
        if (recheck.verdict === 'PASS') {
          log('[TIER 0] Fix succeeded! Verification passed.');
          log(`✅ SUCCESS on attempt ${attempt} (via Tier 0)`);
          log('\n--- GENERATED MARKDOWN ---');
          log(fixResult.fixed);
          return { success: true, attempt, markdown: fixResult.fixed, tier0Applied: fixResult.applied };
        } else {
          log('[TIER 0] Fix applied but file still failed re-verification.');
        }
      } else {
        log('[TIER 0] Skipped (errors need semantic fix)');
      }

      // If attempt is < maxAttempts, consult Advisor
      if (attempt < maxAttempts) {
        const firstError = verdict.errors[0];
        if (firstError) {
          log('Generating lesson for first error:', firstError.code);
          const newLesson = await advisor(firstError.code, firstError.detail);
          log('Lesson produced by Advisor:', newLesson);

          saveLesson({
            errorCode: firstError.code,
            lesson: newLesson,
            createdAt: new Date().toISOString(),
          });

          lesson = getRelevantLessons(verdict.errors.map((e) => e.code));
          log('Cumulative lessons for next attempt:\n', lesson);
        }
      }
    } catch (err: any) {
      log(`Error during attempt ${attempt}:`, err.message);
      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  // Persistent failure: Quarantine
  log(`\n❌ Failed after ${maxAttempts} attempts. Writing failure to quarantine...`);
  const quarantinePayload = {
    task,
    attempts: maxAttempts,
    errors: lastErrors,
    finalMarkdown: lastMarkdown,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(quarantinePath, JSON.stringify(quarantinePayload, null, 2), 'utf-8');
  log(`Quarantine trace recorded at ${quarantinePath}`);
  return { success: false, attempts: maxAttempts, quarantined: true };
}

// Execute directly if run as CLI script
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  runReflexionLoop();
} else if (process.argv[1]?.endsWith('loop.ts') || process.argv[1]?.endsWith('loop.js')) {
  runReflexionLoop();
}
