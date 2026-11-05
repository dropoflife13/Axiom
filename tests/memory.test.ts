import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { saveLesson, loadMemory, isNearDuplicate, Lesson } from '../src/memory.js';
import { generateLesson } from '../src/advisor.js';

const TEST_MEMORY_FILE = path.join(process.cwd(), 'fixtures', 'test-memory.json');

describe('Memory Hygiene & Deduplication', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_MEMORY_FILE)) {
      fs.unlinkSync(TEST_MEMORY_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_MEMORY_FILE)) {
      fs.unlinkSync(TEST_MEMORY_FILE);
    }
  });

  it('detects near-duplicate sentences across phrasing variations', () => {
    const s1 = 'All checklist entries must reference only rule IDs that exist in the rule repository.';
    const s2 = 'All checklist entries must reference rule IDs that are already defined in the vault.';
    const s3 = 'Rule prefixes before the hyphen are strictly limited to 1 to 5 uppercase letters.';

    expect(isNearDuplicate(s1, s2)).toBe(true);
    expect(isNearDuplicate(s1, s3)).toBe(false);
  });

  it('saveLesson refuses to add a near-duplicate and updates timestamp instead', () => {
    const initialLesson: Lesson = {
      errorCode: 'A8',
      lesson: 'All checklist entries must reference only rule IDs that exist in the rule repository.',
      createdAt: '2026-11-05T10:00:00.000Z',
    };

    const firstResult = saveLesson(initialLesson, TEST_MEMORY_FILE);
    expect(firstResult.saved).toBe(true);
    expect(firstResult.updated).toBe(false);

    let memory = loadMemory(TEST_MEMORY_FILE);
    expect(memory).toHaveLength(1);
    expect(memory[0].createdAt).toBe('2026-11-05T10:00:00.000Z');

    // Attempt to save a near-duplicate lesson for the same errorCode
    const duplicateLesson: Lesson = {
      errorCode: 'A8',
      lesson: 'All checklist entries must reference rule IDs that exist in the vault repository.',
      createdAt: '2026-11-05T12:00:00.000Z',
    };

    const secondResult = saveLesson(duplicateLesson, TEST_MEMORY_FILE);
    expect(secondResult.saved).toBe(false);
    expect(secondResult.updated).toBe(true);

    memory = loadMemory(TEST_MEMORY_FILE);
    expect(memory).toHaveLength(1);
    expect(memory[0].createdAt).toBe('2026-11-05T12:00:00.000Z');

    // Saving a different error code succeeds
    const differentLesson: Lesson = {
      errorCode: 'A5',
      lesson: 'Rule prefixes before the hyphen are strictly limited to 1 to 5 uppercase letters.',
      createdAt: '2026-11-05T13:00:00.000Z',
    };

    const thirdResult = saveLesson(differentLesson, TEST_MEMORY_FILE);
    expect(thirdResult.saved).toBe(true);

    memory = loadMemory(TEST_MEMORY_FILE);
    expect(memory).toHaveLength(2);
  });

  it('verifies Advisor prompt enforces task-agnostic lessons without task-specific IDs', async () => {
    // Mock fetch to verify prompt format and response filtering
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  'All rule prefixes must strictly adhere to uppercase characters with a maximum length of five letters before the hyphen.',
              },
            },
          ],
        }),
      };
    }) as any;

    try {
      process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test_key';
      const lesson = await generateLesson(
        'A5',
        'Line in section 3 does not match required rule format: - **DEVOPS-01** Credential Validation'
      );

      // Verify the system prompt instructs task-agnosticism
      const systemMessage = capturedBody.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('Do NOT reference any specific IDs, task names, or variable names');

      // Verify lesson contains no task-specific mentions
      expect(lesson).not.toMatch(/DEVOPS/i);
      expect(lesson).not.toMatch(/LEG-01/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

