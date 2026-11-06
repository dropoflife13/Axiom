import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveLesson,
  loadMemory,
  getRelevantLessons,
  retrieveLessonsByFeatures,
  LESSON_TOP_K,
  isNearDuplicate,
  MAX_STORED_LESSONS,
  Lesson,
} from '../src/memory.js';
import { generateLesson, ADVISOR_SYSTEM_PROMPT } from '../src/advisor.js';

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
    const dir = path.dirname(TEST_MEMORY_FILE);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('test-memory.json.bak.')) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
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

  it('renames corrupted JSON to memory.json.bak.<timestamp> and throws instead of returning [] silently', () => {
    fs.writeFileSync(TEST_MEMORY_FILE, '{ invalid json syntax ', 'utf-8');

    expect(() => loadMemory(TEST_MEMORY_FILE)).toThrowError(/Corrupted memory JSON/i);
    expect(fs.existsSync(TEST_MEMORY_FILE)).toBe(false);

    const files = fs.readdirSync(path.dirname(TEST_MEMORY_FILE));
    const bakFile = files.find((f) => /^test-memory\.json\.bak\.\d+$/.test(f));
    expect(bakFile).toBeDefined();
  });

  it('updates lastUsedAt when a lesson is injected and orders eviction by lastUsedAt while keeping one lesson per errorCode', () => {
    for (let i = 1; i <= MAX_STORED_LESSONS; i++) {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, i, 0)).toISOString();
      saveLesson(
        {
          errorCode: `CODE-${i}`,
          lesson: `Unique rule lesson content for error ${i}.`,
          createdAt: ts,
          lastUsedAt: ts,
        },
        TEST_MEMORY_FILE
      );
    }

    // Inject CODE-1 (originally the oldest) so its lastUsedAt is updated to now
    const injected = getRelevantLessons(['CODE-1'], TEST_MEMORY_FILE);
    expect(injected).toContain('[CODE-1]');

    const afterInject = loadMemory(TEST_MEMORY_FILE);
    const code1Entry = afterInject.find((m) => m.errorCode === 'CODE-1');
    expect(code1Entry?.lastUsedAt).toBeDefined();
    expect(code1Entry!.lastUsedAt! > '2026-01-01T01:00:00.000Z').toBe(true);

    // Add a 26th lesson (CODE-26); CODE-2 (now the oldest lastUsedAt) must be evicted, while CODE-1 survives
    const ts26 = new Date(Date.UTC(2026, 0, 1, 2, 0, 0)).toISOString();
    saveLesson(
      {
        errorCode: 'CODE-26',
        lesson: 'Unique rule lesson content for error 26.',
        createdAt: ts26,
        lastUsedAt: ts26,
      },
      TEST_MEMORY_FILE
    );

    const finalMemory = loadMemory(TEST_MEMORY_FILE);
    expect(finalMemory).toHaveLength(MAX_STORED_LESSONS);
    expect(finalMemory.some((m) => m.errorCode === 'CODE-1')).toBe(true);
    expect(finalMemory.some((m) => m.errorCode === 'CODE-2')).toBe(false);
    expect(finalMemory.some((m) => m.errorCode === 'CODE-26')).toBe(true);
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

      // Verify the system prompt instructs task-agnosticism and contains "one concrete rule under 24 words"
      const systemMessage = capturedBody.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('Do NOT reference any specific IDs, task names, or variable names');
      expect(systemMessage.content).toContain('one concrete rule under 24 words');
      expect(ADVISOR_SYSTEM_PROMPT).toContain('one concrete rule under 24 words');

      // Verify system prompt contains none of the verifier's own regexes or sample sentences
      const forbiddenPatterns = [
        /\[A-Z\]\{1,5\}/i,
        /\\d\{2,3\}/i,
        /conf:\\s\*\[1-5\]/i,
        /for A5:/i,
        /for A7:/i,
        /for A9:/i,
        /DEVOP-01/i,
        /GATE:\s*PASS/i,
        /GATE:\s*FAIL/i,
        /\bINSIGHT\b/,
        /→\s*DO/,
        /\|\s*conf:\s*N/i,
      ];
      for (const pat of forbiddenPatterns) {
        expect(systemMessage.content).not.toMatch(pat);
      }

      // Verify lesson contains no task-specific mentions
      expect(lesson).not.toMatch(/DEVOPS/i);
      expect(lesson).not.toMatch(/LEG-01/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retrieves top-6 lessons strictly by feature-flag overlap (LESSON_TOP_K = 6)', () => {
    expect(LESSON_TOP_K).toBe(6);

    const pool: Lesson[] = [
      {
        errorCode: 'F-09',
        factId: 'F-09',
        lesson: 'JSON columns must use jsonb NOT NULL, never json.',
        features: { tenant: true, append_only: true, ingestion: true },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-20',
        factId: 'F-20',
        lesson: 'Append-only tables must raise Update/Delete operation rejected on audit log.',
        features: { tenant: true, append_only: true, ingestion: true },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-32',
        factId: 'F-32',
        lesson: 'Ingestion tables must enforce a UNIQUE constraint on idempotency_key.',
        features: { tenant: true, append_only: true, ingestion: true },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-37',
        factId: 'F-37',
        lesson: 'Ingestion tables must force NEW.received_at = now() in BEFORE INSERT trigger.',
        features: { tenant: true, append_only: true, ingestion: true },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-01',
        factId: 'F-01',
        lesson: 'Primary key column id must be uuid NOT NULL with default gen_random_uuid().',
        features: { tenant: false, append_only: false, ingestion: false },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-08',
        factId: 'F-08',
        lesson: 'Text columns must use text rather than varchar(n) or char(n).',
        features: { tenant: false, append_only: false, ingestion: false },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-12',
        factId: 'F-12',
        lesson: 'Tables must enforce domain integrity with at least one CHECK constraint.',
        features: { tenant: false, append_only: false, ingestion: false },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-19',
        factId: 'F-19',
        lesson: 'Table privileges must be revoked from PUBLIC and granted minimally.',
        features: { tenant: false, append_only: false, ingestion: false },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
    ];

    const retrieved = retrieveLessonsByFeatures(
      { tenant: true, append_only: true, ingestion: true },
      pool,
      LESSON_TOP_K
    );

    expect(retrieved).toHaveLength(6);
    const top4Codes = retrieved.slice(0, 4).map((l) => l.errorCode);
    expect(top4Codes).toEqual(['F-09', 'F-20', 'F-32', 'F-37']);

    // Verify incompatible lessons (e.g. tenant-only F-25 or append_only-only F-20) are filtered out when flags are false
    const filteredForGlobalMutable = retrieveLessonsByFeatures(
      { tenant: false, append_only: false, ingestion: false },
      pool,
      LESSON_TOP_K
    );
    expect(filteredForGlobalMutable.map((l) => l.errorCode)).toEqual([
      'F-01',
      'F-08',
      'F-12',
      'F-19',
    ]);

    // Verify empirical seenWhen* learning via saveLesson across Train tasks (including mutable-only exclusion)
    saveLesson(
      {
        errorCode: 'F-21',
        lesson: 'Mutable tables must attach a BEFORE UPDATE trigger advancing updated_at.',
        features: { tenant: true, append_only: false, ingestion: false },
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      TEST_MEMORY_FILE
    );
    saveLesson(
      {
        errorCode: 'F-21',
        lesson: 'Mutable tables must attach a BEFORE UPDATE trigger advancing updated_at.',
        features: { tenant: false, append_only: false, ingestion: true },
        createdAt: '2026-11-06T00:01:00.000Z',
      },
      TEST_MEMORY_FILE
    );

    const learned = loadMemory(TEST_MEMORY_FILE);
    expect(learned).toHaveLength(1);
    expect(learned[0].utilityScore).toBe(2);
    expect(learned[0].observedFeatures).toEqual({
      seenWhenTenantTrue: true,
      seenWhenTenantFalse: true,
      seenWhenAppendOnlyTrue: false,
      seenWhenAppendOnlyFalse: true,
      seenWhenIngestionTrue: true,
      seenWhenIngestionFalse: true,
    });

    // Because F-21 was only ever observed when append_only === false, it must be excluded on append_only === true tasks
    expect(
      retrieveLessonsByFeatures(
        { tenant: true, append_only: true, ingestion: false },
        learned,
        LESSON_TOP_K
      )
    ).toHaveLength(0);
    expect(
      retrieveLessonsByFeatures(
        { tenant: true, append_only: false, ingestion: false },
        learned,
        LESSON_TOP_K
      )
    ).toHaveLength(1);
  });
});
