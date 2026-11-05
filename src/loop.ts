// src/loop.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateAgentMarkdown } from './executor.js';
import { verifyAgentMarkdown } from './verifier/agent-verifier.js';
import { buildVaultIndex } from './verifier/vault-index.js';
import { saveLesson, getRelevantLessons, hasLessonForCode, Lesson } from './memory.js';
import { generateLesson } from './advisor.js';
import { tryDeterministicFix, VerifierError } from './fixer.js';
import { callHeavyModel } from './escalation.js';

export interface LoopOptions {
  task?: string;
  maxAttempts?: number;
  quarantinePath?: string;
  memoryPath?: string;
  exitOnError?: boolean;
  executorFn?: (task: string, lesson?: string) => Promise<{ markdown: string; rawResponse: string }>;
  heavyFn?: (task: string, errors: VerifierError[], lessons: string) => Promise<string>;
  advisorFn?: (code: string, detail: string) => Promise<string>;
  silent?: boolean;
}

const DEFAULT_QUARANTINE_PATH = path.join(process.cwd(), '.axiom-state', 'quarantine.json');

export async function runReflexionLoop(options: LoopOptions = {}) {
  const task = options.task || process.env.TASK || 'Create a DevOps Agent that handles multi-cloud deployments.';
  const maxAttempts = Math.min(options.maxAttempts ?? 3, 3); // Hard ceiling of 3 attempts
  const quarantinePath = options.quarantinePath || DEFAULT_QUARANTINE_PATH;
  const exitOnError = options.exitOnError ?? false;
  const executor = options.executorFn || generateAgentMarkdown;
  const heavy = options.heavyFn || callHeavyModel;
  const advisor = options.advisorFn || generateLesson;
  const log = options.silent ? () => {} : console.log;

  const root = path.resolve('.');
  const vaultIndex = buildVaultIndex(root);
  const ctx = { vaultIndex, repoRoot: root };

  // Preload top historical lessons for Attempt 1 so Executor starts with prior knowledge
  const isTestMockRun = Boolean(options.executorFn || options.advisorFn || options.heavyFn);
  const shouldPreloadMemory = Boolean(options.memoryPath) || !isTestMockRun;
  let lesson = shouldPreloadMemory ? getRelevantLessons([], options.memoryPath) : '';
  let pendingLesson: Lesson | null = null;
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
      const verdict = verifyAgentMarkdown(markdown, ctx);
      log(`Verdict: ${verdict.verdict}`);

      if (verdict.verdict === 'PASS') {
        // Validate lesson utility before saving: only persist pendingLesson if Executor retry passed
        if (pendingLesson) {
          log(`[MEMORY PROVEN] Saving verified lesson for ${pendingLesson.errorCode}`);
          saveLesson(pendingLesson, options.memoryPath);
          pendingLesson = null;
        }
        log(`✅ SUCCESS on attempt ${attempt}`);
        return { success: true, successViaTier0: false, attempt, markdown };
      }

      // If a pending lesson failed to make the Executor pass on retry, discard it
      if (pendingLesson) {
        log(
          `[MEMORY DISCARDED] Candidate lesson for ${pendingLesson.errorCode} did not pass verification; discarding.`
        );
        pendingLesson = null;
      }

      lastErrors = verdict.errors;
      log('Errors:', verdict.errors.map((e) => `[${e.code}] line ${e.line}: ${e.detail}`));
      attemptsTrace.push({
        attempt,
        path: isHeavyAttempt ? 'tier3-heavy' : 'fast-path',
        verdict: 'FAIL',
        errors: verdict.errors,
      });

      // Tier 0: Deterministic Auto-Fix
      const fixResult = tryDeterministicFix(markdown, verdict.errors);

      if (fixResult.applied.length > 0) {
        for (const logLine of fixResult.applied) {
          log(logLine);
        }
        const recheck = verifyAgentMarkdown(fixResult.fixed, ctx);
        if (recheck.verdict === 'PASS') {
          log('[TIER 0] Fix succeeded! Verification passed.');
          log(`✅ SUCCESS on attempt ${attempt} (via Tier 0)`);
          return {
            success: true,
            successViaTier0: true,
            attempt,
            markdown: fixResult.fixed,
            tier0Applied: fixResult.applied,
          };
        } else {
          log('[TIER 0] Fix applied but file still failed re-verification.');
          lastErrors = recheck.errors;
        }
      } else {
        log('[TIER 0] Skipped (errors need semantic fix)');
      }

      // If fast attempt (< maxAttempts), consult Advisor (or cached memory)
      if (attempt < maxAttempts) {
        const firstError = lastErrors[0];
        if (firstError) {
          const isMockAdvisor = Boolean(options.advisorFn);
          const storedLessons = getRelevantLessons(
            lastErrors.map((e) => e.code),
            options.memoryPath
          );

          if (!isMockAdvisor && hasLessonForCode(firstError.code, options.memoryPath)) {
            log(`[MEMORY HIT] Reusing existing lesson for ${firstError.code} ($0 Advisor skip)`);
            lesson = storedLessons;
          } else {
            log('Generating lesson for first error:', firstError.code);
            let newLesson: string;
            try {
              newLesson = await advisor(firstError.code, firstError.detail || '');
            } catch (advisorErr: any) {
              log(`[ADVISOR_FATAL_ERROR] Advisor failed on ${firstError.code}: ${advisorErr.message}`);
              attemptsTrace.push({
                attempt,
                path: 'advisor',
                verdict: 'ADVISOR_ERROR',
                errors: [{ code: 'ADVISOR_ERROR', detail: advisorErr.message }],
              });
              throw new Error(`[ABORT_ADVISOR_FAILURE] ${advisorErr.message}`);
            }

            log('Lesson produced by Advisor (pending verification):', newLesson);
            pendingLesson = {
              errorCode: firstError.code,
              lesson: newLesson,
              createdAt: new Date().toISOString(),
            };

            const candidateLine = `[${pendingLesson.errorCode}] ${pendingLesson.lesson}`;
            lesson = storedLessons ? `${storedLessons}\n${candidateLine}` : candidateLine;
          }

          log('Cumulative lessons for next attempt:\n', lesson);
        }
      }
    } catch (err: any) {
      log(`Error during attempt ${attempt}:`, err.message);
      attemptsTrace.push({
        attempt,
        path: isHeavyAttempt ? 'tier3-heavy' : 'fast-path',
        verdict: 'ERROR',
        errors: [{ code: 'EXCEPTION', detail: err.message }],
      });

      // Immediately abort loop if Billing Circuit Breaker, Advisor Failure, or non-retryable error tripped
      if (
        err.message?.includes('[BILLING_CIRCUIT_BREAKER]') ||
        err.message?.includes('[ABORT_NON_RETRYABLE]') ||
        err.message?.includes('[ABORT_ADVISOR_FAILURE]')
      ) {
        log('🚨 Critical error or circuit breaker tripped. Aborting loop immediately.');
        break;
      }

      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  // Persistent failure: Quarantine & Halt
  log(`\n❌ HALTED: Persistent failure. Trace saved to ${path.basename(quarantinePath)}`);
  const quarantineDir = path.dirname(quarantinePath);
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  const quarantinePayload = {
    task,
    attempts: attemptsTrace,
    finalErrors: lastErrors,
    finalMarkdown: lastMarkdown,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(quarantinePath, JSON.stringify(quarantinePayload, null, 2), 'utf-8');

  if (exitOnError) {
    process.exit(1);
  }

  return { success: false, successViaTier0: false, attempts: maxAttempts, quarantined: true };
}

// Execute directly if run as CLI script
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
) {
  runReflexionLoop({ exitOnError: true });
} else if (process.argv[1]?.endsWith('loop.ts') || process.argv[1]?.endsWith('loop.js')) {
  runReflexionLoop({ exitOnError: true });
}
