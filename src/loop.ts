import fs from 'node:fs';
import path from 'node:path';
import { generateAgentMarkdown } from './executor.js';
import { verifyAgentMarkdown } from './verifier/agent-verifier.js';
import { buildVaultIndex } from './verifier/vault-index.js';
import { saveLesson, getRelevantLessons, STATE_DIR } from './memory.js';
import { generateLesson } from './advisor.js';
import { tryDeterministicFix, VerifierError } from './fixer.js';
import { callHeavyModel } from './escalation.js';

export interface LoopOptions {
  task?: string;
  maxAttempts?: number;
  quarantinePath?: string;
  exitOnError?: boolean;
  executorFn?: (task: string, lesson?: string) => Promise<{ markdown: string; rawResponse: string }>;
  heavyFn?: (task: string, errors: VerifierError[], lessons: string) => Promise<string>;
  advisorFn?: (code: string, detail: string) => Promise<string>;
  silent?: boolean;
}

export async function runReflexionLoop(options: LoopOptions = {}) {
  const task = options.task || process.env.TASK || 'Create a DevOps Agent that handles multi-cloud deployments.';
  const maxAttempts = options.maxAttempts ?? 3;
  const defaultQuarantine = path.join(STATE_DIR, 'quarantine.json');
  const quarantinePath = options.quarantinePath || defaultQuarantine;
  const exitOnError = options.exitOnError ?? false;
  const executor = options.executorFn || generateAgentMarkdown;
  const heavy = options.heavyFn || callHeavyModel;
  const advisor = options.advisorFn || generateLesson;
  const log = options.silent ? () => {} : console.log;

  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  let lesson = '';
  let lastErrors: VerifierError[] = [];
  let lastMarkdown = '';
  const attemptsTrace: Array<{ attempt: number; path: string; verdict: string; errors: any[] }> = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isHeavyAttempt = attempt === 3;
    log(`\n=== ATTEMPT ${attempt} (${isHeavyAttempt ? 'TIER 3 HEAVY' : 'FAST PATH'}) ===`);

    try {
      let markdown = '';

      if (isHeavyAttempt) {
        log('[TIER 3] Escalating to heavy model...');
        markdown = await heavy(task, lastErrors, lesson);
      } else {
        const result = await executor(task, lesson);
        markdown = result.markdown;
      }

      lastMarkdown = markdown;
      let verdict = verifyAgentMarkdown(markdown, ctx);
      log(`Verdict: ${verdict.verdict}`);

      if (verdict.verdict === 'PASS') {
        log(`✅ SUCCESS on attempt ${attempt}`);
        log('\n--- GENERATED MARKDOWN ---');
        log(markdown);
        return { success: true, attempt, markdown };
      }

      lastErrors = verdict.errors;
      log('Errors:', verdict.errors.map((e) => `[${e.code}] line ${e.line}: ${e.detail}`));
      attemptsTrace.push({ attempt, path: isHeavyAttempt ? 'tier3-heavy' : 'fast-path', verdict: 'FAIL', errors: verdict.errors });

      // Tier 0: Deterministic Auto-Fix
      const fixResult = tryDeterministicFix(markdown, verdict.errors);
      let targetForAdvisor = markdown;

      if (fixResult.applied.length > 0) {
        for (const logLine of fixResult.applied) {
          log(logLine);
        }
        const recheck = verifyAgentMarkdown(fixResult.fixed, ctx);
        if (recheck.verdict === 'PASS') {
          log('[TIER 0] Fix succeeded! Verification passed.');
          log(`✅ SUCCESS on attempt ${attempt} (via Tier 0)`);
          log('\n--- GENERATED MARKDOWN ---');
          log(fixResult.fixed);
          return { success: true, attempt, markdown: fixResult.fixed, tier0Applied: fixResult.applied };
        } else {
          log('[TIER 0] Fix applied but file still failed re-verification.');
          targetForAdvisor = fixResult.fixed;
          lastErrors = recheck.errors;
        }
      } else {
        log('[TIER 0] Skipped (errors need semantic fix)');
      }

      // If fast attempt (< 3), consult Advisor
      if (attempt < maxAttempts) {
        const firstError = lastErrors[0];
        if (firstError) {
          log('Generating lesson for first error:', firstError.code);
          const newLesson = await advisor(firstError.code, firstError.detail || '');
          log('Lesson produced by Advisor:', newLesson);

          saveLesson({
            errorCode: firstError.code,
            lesson: newLesson,
            createdAt: new Date().toISOString(),
          });

          lesson = getRelevantLessons(lastErrors.map((e) => e.code));
          log('Cumulative lessons for next attempt:\n', lesson);
        }
      }
    } catch (err: any) {
      log(`Error during attempt ${attempt}:`, err.message);
      attemptsTrace.push({ attempt, path: isHeavyAttempt ? 'tier3-heavy' : 'fast-path', verdict: 'ERROR', errors: [{ code: 'EXCEPTION', detail: err.message }] });
      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  // Persistent failure: Quarantine & Halt
  log(`\n❌ HALTED: Persistent failure. Trace saved to ${path.basename(quarantinePath)}`);
  const quarantinePayload = {
    task,
    attempts: attemptsTrace,
    finalErrors: lastErrors,
    finalMarkdown: lastMarkdown,
    timestamp: new Date().toISOString(),
  };

  const qDir = path.dirname(quarantinePath);
  if (!fs.existsSync(qDir)) {
    fs.mkdirSync(qDir, { recursive: true });
  }

  fs.writeFileSync(quarantinePath, JSON.stringify(quarantinePayload, null, 2), 'utf-8');

  if (exitOnError) {
    process.exit(1);
  }

  return { success: false, attempts: maxAttempts, quarantined: true };
}

// Execute directly if run as CLI script
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  runReflexionLoop({ exitOnError: true });
} else if (process.argv[1]?.endsWith('loop.ts') || process.argv[1]?.endsWith('loop.js')) {
  runReflexionLoop({ exitOnError: true });
}
