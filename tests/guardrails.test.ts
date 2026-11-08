import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUDGET_GUARD,
  assertBudgetAvailable,
  resetBudget,
} from '../src/guardrails.js';
import {
  saveLesson,
  loadMemory,
  sanitizeAndCapLesson,
  getRelevantLessons,
  MAX_STORED_LESSONS,
  MAX_INJECTED_LESSONS,
  Lesson,
} from '../src/memory.js';
import {
  generateAgentMarkdown,
  computeExecutorCacheKey,
  DEFAULT_EXECUTOR_CACHE_DIR,
  REQUIRED_EXECUTOR_MODEL,
  resolveExecutorModel,
  assertModelMatch,
} from '../src/executor.js';
import { buildTrial, TaskV2Item } from '../src/eval/ablation.js';

const TEST_MEMORY_PATH = path.join(process.cwd(), 'fixtures', 'test-guardrails-memory.json');
const TEST_CACHE_DIR = path.join(process.cwd(), '.axiom-cache', 'test-executor-cache');

describe('Circuit Breaker & Budget Guardrails', () => {
  beforeEach(() => {
    resetBudget();
    if (fs.existsSync(TEST_MEMORY_PATH)) {
      fs.unlinkSync(TEST_MEMORY_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_MEMORY_PATH)) {
      fs.unlinkSync(TEST_MEMORY_PATH);
    }
  });

  it('allows calls within budget and tracks counts', () => {
    expect(BUDGET_GUARD.currentLlmCalls).toBe(0);
    const signal = assertBudgetAvailable('EXECUTOR', 'Short task prompt');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(BUDGET_GUARD.currentLlmCalls).toBe(1);
    expect(BUDGET_GUARD.currentTier3Calls).toBe(0);
  });

  it('halts when reaching maxTotalLlmCallsPerProcess', () => {
    BUDGET_GUARD.currentLlmCalls = BUDGET_GUARD.maxTotalLlmCallsPerProcess;
    expect(() => assertBudgetAvailable('EXECUTOR', 'Prompt')).toThrowError(
      /\[BILLING_CIRCUIT_BREAKER\].*Reached max.*LLM calls/i
    );
  });

  it('halts when reaching maxTier3EscalationsPerProcess', () => {
    BUDGET_GUARD.currentTier3Calls = BUDGET_GUARD.maxTier3EscalationsPerProcess;
    expect(() => assertBudgetAvailable('TIER_3', 'Prompt')).toThrowError(
      /\[BILLING_CIRCUIT_BREAKER\].*Reached max Tier 3 heavy escalations/i
    );
  });

  it('halts when prompt length exceeds maxPromptChars to prevent prompt bloat billing', () => {
    const hugePrompt = 'x'.repeat(BUDGET_GUARD.maxPromptChars + 1);
    expect(() => assertBudgetAvailable('EXECUTOR', hugePrompt)).toThrowError(
      /\[BILLING_CIRCUIT_BREAKER\].*exceeds safety cap/i
    );
  });
});

describe('Memory Ring-Buffer & Prompt Safety Limits', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_MEMORY_PATH)) {
      fs.unlinkSync(TEST_MEMORY_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_MEMORY_PATH)) {
      fs.unlinkSync(TEST_MEMORY_PATH);
    }
  });

  it('sanitizes whitespace and caps lesson at 180 characters', () => {
    const raw = '   Line 1\n\nLine 2   ' + 'a'.repeat(250);
    const capped = sanitizeAndCapLesson(raw);
    expect(capped.length).toBeLessThanOrEqual(180);
    expect(capped).not.toContain('\n');
  });

  it('enforces FIFO ring-buffer cap of 25 lessons on disk', () => {
    // Add 30 distinct lessons
    for (let i = 1; i <= 30; i++) {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, i, 0)).toISOString();
      const lesson: Lesson = {
        errorCode: `ERR-${i}`,
        lesson: `Unique lesson rule number ${i} with specific content.`,
        createdAt: ts,
      };
      saveLesson(lesson, TEST_MEMORY_PATH);
    }

    const stored = loadMemory(TEST_MEMORY_PATH);
    expect(stored.length).toBe(MAX_STORED_LESSONS); // 25
    // Oldest items (1..5) should have been evicted; newest (6..30) retained
    expect(stored[0].errorCode).toBe('ERR-6');
    expect(stored[stored.length - 1].errorCode).toBe('ERR-30');
  });

  it('never injects more than MAX_INJECTED_LESSONS (8) into prompt context', () => {
    for (let i = 1; i <= 15; i++) {
      const lesson: Lesson = {
        errorCode: `A${i}`,
        lesson: `Rule variant number ${i}`,
        createdAt: new Date().toISOString(),
      };
      saveLesson(lesson, TEST_MEMORY_PATH);
    }

    const injected = getRelevantLessons([], TEST_MEMORY_PATH);
    const lines = injected.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(MAX_INJECTED_LESSONS); // <= 8
  });
});

describe('Executor SHA-256 Disk Cache & Documentation Claims', () => {
  beforeEach(() => {
    resetBudget();
    fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  it('caches Executor responses in .axiom-cache\\ keyed by sha256(model+system+user+temperature)', async () => {
    expect(DEFAULT_EXECUTOR_CACHE_DIR.endsWith('.axiom-cache')).toBe(true);

    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: REQUIRED_EXECUTOR_MODEL,
        choices: [{ finish_reason: 'stop', message: { content: '# Cached Agent — Test' } }],
      }),
    });
    globalThis.fetch = mockFetch as any;

    try {
      process.env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'test_key';

      const first = await generateAgentMarkdown('Create a Cache Test Agent', undefined, {
        cacheDir: TEST_CACHE_DIR,
        temperature: 0,
        model: REQUIRED_EXECUTOR_MODEL,
      });
      expect(first.fromCache).toBe(false);
      expect(first.markdown).toBe('# Cached Agent — Test');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const expectedCacheFile = path.join(TEST_CACHE_DIR, `${first.cacheKey}.json`);
      expect(fs.existsSync(expectedCacheFile)).toBe(true);

      const second = await generateAgentMarkdown('Create a Cache Test Agent', undefined, {
        cacheDir: TEST_CACHE_DIR,
        temperature: 0,
        model: REQUIRED_EXECUTOR_MODEL,
      });
      expect(second.fromCache).toBe(true);
      expect(second.cacheKey).toBe(first.cacheKey);
      expect(second.markdown).toBe('# Cached Agent — Test');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const keyT0 = computeExecutorCacheKey('m', 'sys', 'usr', 0);
      const keyT1 = computeExecutorCacheKey('m', 'sys', 'usr', 0.1);
      expect(keyT0).not.toBe(keyT1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('verifies README.md and docs/PROJECT.md use the required description and omit prohibited claims', () => {
    const requiredDescription =
      'Axiom is a deterministic verifier and reflexion test harness for Cortex agent and rule files, with two executable checks (DB-01, SEC-03) and an evaluation harness for LLM-generated rules.';
    const updatedReadmeDescription =
      'Axiom is a deterministic verification and reflexion harness for LLM-generated architecture rules and SQL migrations.';

    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    const projectDoc = fs.readFileSync(path.join(process.cwd(), 'docs', 'PROJECT.md'), 'utf-8');

    expect(
      readme.includes(requiredDescription) || readme.includes(updatedReadmeDescription)
    ).toBe(true);
    expect(projectDoc).toContain(requiredDescription);

    const prohibitedClaims = [
      /epistemic circuit breaker/i,
      /stress test/i,
      /contradiction check/i,
      /0%\s*hallucination/i,
    ];

    for (const pattern of prohibitedClaims) {
      expect(readme).not.toMatch(pattern);
      expect(projectDoc).not.toMatch(pattern);
    }
  });
});

describe('Ablation v2 Integrity: F-13 Scoring, Provenance Fields, and Model Assertion', () => {
  const sampleTask: TaskV2Item = {
    id: 'H-001',
    split: 'test',
    cohortId: 'C1',
    table: 'pos_transaction_ingests',
    prompt: 'Create a multi-tenant append-only ingestion table in PostgreSQL.',
    features: { tenant: true, append_only: true, ingestion: true },
    boundFacts: ['F-03', 'F-12', 'F-18'],
    goldenSql: 'CREATE TABLE public.pos_transaction_ingests ();',
  };

  it('counts all bound facts as failed and sets tableMissing=true when F-13 is in failedFacts', () => {
    const mockOracle = vi.fn().mockReturnValue({
      pass: false,
      failedFacts: ['F-13'],
      details: 'F-13: Table must exist in public schema.',
      migrationExitNonZero: true,
    });

    const trial = buildTrial(
      'mock-container',
      sampleTask,
      'A',
      'INVALID SQL;',
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      [],
      {
        requestedModel: REQUIRED_EXECUTOR_MODEL,
        returnedModel: REQUIRED_EXECUTOR_MODEL,
        finishReason: 'stop',
      },
      mockOracle
    );

    expect(trial.tableMissing).toBe(true);
    expect(trial.migrationExitNonZero).toBe(true);
    expect(trial.boundPassed).toBe(false);
    expect(trial.boundFactFraction).toBe(0);
    expect(trial.failedFacts).toEqual(['F-13']);
    expect(trial.oracleFailedFacts).toEqual(['F-13']);
  });

  it('scores boundFacts normally when F-13 does not fail and records provenance and reusedFromCondition', () => {
    const mockOracle = vi.fn().mockReturnValue({
      pass: false,
      failedFacts: ['F-12'],
      details: 'F-12: Status check missing.',
      migrationExitNonZero: false,
    });

    const trialEB = buildTrial(
      'mock-container',
      sampleTask,
      'E_B',
      'CREATE TABLE public.pos_transaction_ingests ();',
      { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
      [],
      {
        requestedModel: REQUIRED_EXECUTOR_MODEL,
        returnedModel: REQUIRED_EXECUTOR_MODEL,
        finishReason: 'stop',
        fromCache: true,
      },
      mockOracle
    );

    expect(trialEB.tableMissing).toBe(false);
    expect(trialEB.migrationExitNonZero).toBe(false);
    expect(trialEB.boundPassed).toBe(false);
    expect(trialEB.boundFactFraction).toBeCloseTo(2 / 3, 4);
    const isGroq = REQUIRED_EXECUTOR_MODEL.startsWith('qwen/');
    expect(trialEB.provider).toBe(isGroq ? 'groq' : 'nvidia');
    expect(trialEB.baseUrl).toBe(isGroq ? 'https://api.groq.com/openai/v1' : 'https://integrate.api.nvidia.com/v1');
    expect(trialEB.requestedModel).toBe(REQUIRED_EXECUTOR_MODEL);
    expect(trialEB.returnedModel).toBe(REQUIRED_EXECUTOR_MODEL);
    expect(trialEB.finishReason).toBe('stop');
    expect(trialEB.oracleCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(trialEB.factsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(trialEB.reusedFromCondition).toBe('B');
  });

  it('requires an explicit Executor model with no silent default and asserts returnedModel === requestedModel', () => {
    const prevEnv = process.env.NVIDIA_EXECUTOR_MODEL;
    try {
      delete process.env.NVIDIA_EXECUTOR_MODEL;
      expect(() => resolveExecutorModel(undefined)).toThrowError(
        /explicit required setting.*no silent default/i
      );
      expect(() => resolveExecutorModel('z-ai/glm-5.3-flash')).toThrowError(
        /must be one of/i
      );
      expect(resolveExecutorModel(REQUIRED_EXECUTOR_MODEL)).toBe(REQUIRED_EXECUTOR_MODEL);

      expect(() =>
        assertModelMatch(REQUIRED_EXECUTOR_MODEL, 'z-ai/glm-5.3-flash')
      ).toThrowError(/does not match requested model/i);
    } finally {
      if (prevEnv !== undefined) {
        process.env.NVIDIA_EXECUTOR_MODEL = prevEnv;
      }
    }
  });
});
