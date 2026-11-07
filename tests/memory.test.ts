import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveLesson,
  loadMemory,
  loadReadOnlyMemorySnapshot,
  getRelevantLessons,
  retrieveLessonsByFeatures,
  LESSON_TOP_K,
  isNearDuplicate,
  MAX_STORED_LESSONS,
  Lesson,
} from '../src/memory.js';
import {
  TaskV2Item,
  assertMemoryUnchanged,
  buildConditionHint,
  ensureSqlTrainMemory,
  getTaskApplicableFacts,
  loadTrainFailureFrequency,
  retrieveApplicableLessonsForTask,
} from '../src/eval/ablation.js';
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

  it('Item 5: restricts C and C0 retrieval to the task applicable set (same eligibility set as Condition B) before ranking', () => {
    const pool: Lesson[] = [
      {
        errorCode: 'F-39',
        factId: 'F-39',
        lesson: 'Synthetic lesson for F-39.',
        observedFeatures: {
          seenWhenTenantTrue: true,
          seenWhenTenantFalse: true,
          seenWhenAppendOnlyTrue: true,
          seenWhenAppendOnlyFalse: true,
          seenWhenIngestionTrue: true,
          seenWhenIngestionFalse: true,
        },
        utilityScore: 99,
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-14', // UNCONFIRMED (not in Condition B ELIGIBLE_FACTS)
        factId: 'F-14',
        lesson: 'Synthetic lesson for unconfirmed F-14.',
        observedFeatures: {
          seenWhenTenantTrue: true,
          seenWhenTenantFalse: true,
          seenWhenAppendOnlyTrue: true,
          seenWhenAppendOnlyFalse: true,
          seenWhenIngestionTrue: true,
          seenWhenIngestionFalse: true,
        },
        utilityScore: 100,
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-21',
        factId: 'F-21',
        lesson: 'Synthetic lesson for F-21.',
        observedFeatures: {
          seenWhenTenantTrue: true,
          seenWhenTenantFalse: true,
          seenWhenAppendOnlyTrue: false,
          seenWhenAppendOnlyFalse: true,
          seenWhenIngestionTrue: true,
          seenWhenIngestionFalse: true,
        },
        utilityScore: 19,
        createdAt: '2026-11-06T00:00:00.000Z',
      },
      {
        errorCode: 'F-18',
        factId: 'F-18',
        lesson: 'Synthetic lesson for F-18.',
        observedFeatures: {
          seenWhenTenantTrue: true,
          seenWhenTenantFalse: true,
          seenWhenAppendOnlyTrue: true,
          seenWhenAppendOnlyFalse: true,
          seenWhenIngestionTrue: true,
          seenWhenIngestionFalse: true,
        },
        utilityScore: 8,
        createdAt: '2026-11-06T00:00:00.000Z',
      },
    ];

    const nonTenantTask: TaskV2Item = {
      id: 'D-999',
      split: 'dev',
      cohortId: 'C8',
      table: 'audit_items',
      prompt: 'Create table public.audit_items without any views.',
      features: { tenant: false, append_only: false, ingestion: false },
      boundFacts: ['F-18', 'F-21'],
      applicableFacts: ['F-01', 'F-14', 'F-18', 'F-21'], // F-39 is not applicable; F-14 is UNCONFIRMED
      goldenSql: 'CREATE TABLE public.audit_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid());',
    };

    const applicable = getTaskApplicableFacts(nonTenantTask);
    expect(applicable).toEqual(['F-01', 'F-18', 'F-21']);
    expect(applicable).not.toContain('F-14');
    expect(applicable).not.toContain('F-39');

    const retrieved = retrieveApplicableLessonsForTask(nonTenantTask, pool, 6);
    expect(retrieved.map((l) => l.errorCode)).toEqual(['F-21', 'F-18']);

    const hintC = buildConditionHint('C', nonTenantTask, pool);
    const hintC0 = buildConditionHint('C0', nonTenantTask, pool);
    expect(hintC).toContain('[F-21]');
    expect(hintC).not.toContain('[F-39]');
    expect(hintC).not.toContain('[F-14]');
    expect(hintC0).toContain('[F-21]');
    expect(hintC0).not.toContain('[F-39]');
    expect(hintC0).not.toContain('[F-14]');
  });

  it('Item 6: ensureSqlTrainMemory computes observed feature flags from real train task flags only (no forced-true flags, correct sec_definer and latest_per_key names)', async () => {
    const syntheticTrain: TaskV2Item[] = [
      {
        id: 'T-SYN-1',
        split: 'train',
        cohortId: 'C1',
        table: 'tenant_metrics',
        prompt: 'Create tenant_metrics with view and status column and observed_at latest_per_key.',
        features: {
          tenant: true,
          append_only: true,
          ingestion: false,
          status: true,
          sec_definer: true,
          latest_per_key: true,
          view: true,
        },
        boundFacts: ['F-12', 'F-31', 'F-38', 'F-39'],
        goldenSql: 'CREATE TABLE public.tenant_metrics (id uuid PRIMARY KEY);',
      },
      {
        id: 'T-SYN-2',
        split: 'train',
        cohortId: 'C8',
        table: 'plain_records',
        prompt: 'Create plain_records table.',
        features: {
          tenant: false,
          append_only: false,
          ingestion: false,
          status: false,
          sec_definer: false,
          latest_per_key: false,
          view: false,
        },
        boundFacts: ['F-01', 'F-06'],
        goldenSql: 'CREATE TABLE public.plain_records (id uuid PRIMARY KEY);',
      },
    ];

    const mem = await ensureSqlTrainMemory(syntheticTrain, {
      memoryPath: TEST_MEMORY_FILE,
      forceRegenerate: true,
      failureFrequency: {
        'F-31': 2,
        'F-38': 2,
        'F-39': 2,
        'F-12': 2,
        'F-01': 2,
      },
      distillFn: async (factId) => `Distilled rule for ${factId}`,
    });

    const byFact = new Map(mem.map((l) => [l.factId ?? l.errorCode, l]));
    // F-31 (sec_definer) and F-38 (latest_per_key) must now be present!
    expect(byFact.has('F-31')).toBe(true);
    expect(byFact.has('F-38')).toBe(true);
    // F-39, F-31, F-38, F-12 were only true on T-SYN-1 (tenant=true, append_only=true), NOT on T-SYN-2 (tenant=false, append_only=false)
    for (const id of ['F-12', 'F-31', 'F-38', 'F-39']) {
      const lesson = byFact.get(id)!;
      expect(lesson.observedFeatures?.seenWhenTenantTrue).toBe(true);
      expect(lesson.observedFeatures?.seenWhenTenantFalse).toBe(false);
      expect(lesson.observedFeatures?.seenWhenAppendOnlyTrue).toBe(true);
      expect(lesson.observedFeatures?.seenWhenAppendOnlyFalse).toBe(false);
    }
    // Universal F-01 matched both T-SYN-1 and T-SYN-2
    const f01 = byFact.get('F-01')!;
    expect(f01.observedFeatures?.seenWhenTenantTrue).toBe(true);
    expect(f01.observedFeatures?.seenWhenTenantFalse).toBe(true);
  });

  it('Item 7: loadReadOnlyMemorySnapshot freezes lessons and assertMemoryUnchanged detects and flags mutation', () => {
    const tmpCheckpoint = `${TEST_MEMORY_FILE}.checkpoint.json`;
    try {
      saveLesson(
        {
          errorCode: 'F-01',
          factId: 'F-01',
          lesson: 'Immutable lesson.',
          features: { tenant: true, append_only: false, ingestion: false },
          createdAt: '2026-11-06T00:00:00.000Z',
          lastUsedAt: '2026-11-06T00:00:00.000Z',
        },
        TEST_MEMORY_FILE
      );

      const snapshot = loadReadOnlyMemorySnapshot(TEST_MEMORY_FILE);
      expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(() => {
        (snapshot.memory[0] as any).utilityScore = 999;
      }).toThrow();

      // Retrieval in readOnly mode must not touch the file or mutate timestamps
      const retrieved = retrieveLessonsByFeatures(
        { tenant: true, append_only: false, ingestion: false },
        TEST_MEMORY_FILE,
        6,
        ['F-01'],
        true
      );
      expect(retrieved).toHaveLength(1);
      expect(assertMemoryUnchanged(TEST_MEMORY_FILE, snapshot.sha256, tmpCheckpoint, [])).toBe(
        snapshot.sha256
      );

      // Mutate file on disk and verify assertMemoryUnchanged aborts and flags checkpoint
      fs.writeFileSync(TEST_MEMORY_FILE, '[]\n', 'utf-8');
      expect(() =>
        assertMemoryUnchanged(TEST_MEMORY_FILE, snapshot.sha256, tmpCheckpoint, [])
      ).toThrowError(/Memory immutability check failed/i);

      const flagged = JSON.parse(fs.readFileSync(tmpCheckpoint, 'utf-8'));
      expect(flagged.memoryMutated).toBe(true);
      expect(flagged.memorySha256AtStart).toBe(snapshot.sha256);
      expect(flagged.memorySha256AtEnd).not.toBe(snapshot.sha256);
    } finally {
      if (fs.existsSync(tmpCheckpoint)) fs.unlinkSync(tmpCheckpoint);
    }
  });

  it('Item 8: loadTrainFailureFrequency throws on missing file or missing provenance and loads valid calibration JSON', () => {
    const tmpCalib = `${TEST_MEMORY_FILE}.calib.json`;
    try {
      expect(() => loadTrainFailureFrequency(tmpCalib)).toThrowError(
        /Missing train calibration file/i
      );

      fs.writeFileSync(
        tmpCalib,
        JSON.stringify({ failureCountsByFact: { 'F-19': 10 } }),
        'utf-8'
      );
      expect(() => loadTrainFailureFrequency(tmpCalib)).toThrowError(
        /Invalid train calibration provenance/i
      );

      fs.writeFileSync(
        tmpCalib,
        JSON.stringify({
          model: 'google/gemma-4-31b-it',
          oracleHash: 'deadbeef',
          factsSha256: 'cafebabe',
          date: '2026-11-07T00:00:00.000Z',
          failureCountsByFact: { 'F-19': 25, 'F-20': 14 },
        }),
        'utf-8'
      );
      expect(loadTrainFailureFrequency(tmpCalib)).toEqual({
        'F-19': 25,
        'F-20': 14,
      });
    } finally {
      if (fs.existsSync(tmpCalib)) fs.unlinkSync(tmpCalib);
    }
  });
});
