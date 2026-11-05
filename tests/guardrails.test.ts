import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

const TEST_MEMORY_PATH = path.join(process.cwd(), 'fixtures', 'test-guardrails-memory.json');

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
      /BILLING CIRCUIT BREAKER.*Reached max LLM calls/
    );
  });

  it('halts when reaching maxTier3EscalationsPerProcess', () => {
    BUDGET_GUARD.currentTier3Calls = BUDGET_GUARD.maxTier3EscalationsPerProcess;
    expect(() => assertBudgetAvailable('TIER_3', 'Prompt')).toThrowError(
      /BILLING CIRCUIT BREAKER.*Reached max Tier 3 heavy escalations/
    );
  });

  it('halts when prompt length exceeds maxPromptChars to prevent prompt bloat billing', () => {
    const hugePrompt = 'x'.repeat(BUDGET_GUARD.maxPromptChars + 1);
    expect(() => assertBudgetAvailable('EXECUTOR', hugePrompt)).toThrowError(
      /BILLING CIRCUIT BREAKER.*Prompt length.*exceeds safety cap/
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
      const lesson: Lesson = {
        errorCode: `ERR-${i}`,
        lesson: `Unique lesson rule number ${i} with specific content.`,
        createdAt: new Date().toISOString(),
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
        errorCode: 'A5',
        lesson: `Rule variant number ${i}`,
        createdAt: new Date().toISOString(),
      };
      saveLesson(lesson, TEST_MEMORY_PATH);
    }

    const injected = getRelevantLessons(['A5'], TEST_MEMORY_PATH);
    const lines = injected.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(MAX_INJECTED_LESSONS); // <= 8
  });
});
