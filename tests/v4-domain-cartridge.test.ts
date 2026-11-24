import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadReadOnlyMemorySnapshot } from '../src/memory.js';
import {
  DomainCartridgeRegistry,
  type CanonicalRule,
  type DomainCartridge,
} from '../src/v4/domain-cartridge.js';
import {
  PostgresV3Cartridge,
  type PostgresV3Task,
} from '../src/v4/cartridges/postgres-v3-adapter.js';

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('v4 DomainCartridge interface & PostgresV3Cartridge adapter', () => {
  it('registers, retrieves, lists, and guards duplicate cartridge IDs in DomainCartridgeRegistry', () => {
    const registry = new DomainCartridgeRegistry();
    const pgCartridge = new PostgresV3Cartridge();

    registry.register(pgCartridge);
    expect(registry.has('postgres-v3')).toBe(true);
    expect(registry.get<PostgresV3Task, string>('postgres-v3')).toBe(pgCartridge);
    expect(registry.require('postgres-v3').version).toBe('1.1.0-v3');
    expect(registry.list().map((c) => c.id)).toEqual(['postgres-v3']);

    // Duplicate registration must fail deterministically
    expect(() => registry.register(pgCartridge)).toThrow(/already registered/i);

    // Register a custom synthetic second domain cartridge to prove domain-agnosticism
    const dummyRule: CanonicalRule = {
      id: 'PY-01',
      statement: "Functions must pass timeout_seconds and raise 'RequestTimeoutError'.",
      active: true,
    };
    const pythonCartridge: DomainCartridge<{ id: string }, string> = {
      id: 'python-api-v1',
      name: 'Python API Cartridge',
      version: '0.1.0',
      loadTasks: () => [{ id: 'PY-T-001' }],
      loadCanonicalRules: () => ({
        version: '0.1.0',
        rules: [dummyRule],
        prerequisiteGraph: {},
      }),
      extractRequiredTokens: (rule) => [rule.id],
      evaluate: () => ({
        committed: true,
        boundFacts: ['PY-01'],
        passedFacts: ['PY-01'],
        failedFacts: [],
      }),
    };
    registry.register(pythonCartridge);
    expect(registry.list().length).toBe(2);
    expect(registry.unregister('python-api-v1')).toBe(true);
    expect(registry.has('python-api-v1')).toBe(false);
  });

  it('loads frozen v3 held-out tasks and canonical rules read-only without mutating vault hashes', () => {
    const tasksPath = path.resolve('fixtures', 'task-v3', 'tasks.json');
    const factsPath = path.resolve('fixtures', 'task-v3', 'facts.json');
    const tasksShaBefore = sha256File(tasksPath);
    const factsShaBefore = sha256File(factsPath);

    const cartridge = new PostgresV3Cartridge();
    const tasks = cartridge.loadTasks();
    const ruleSet = cartridge.loadCanonicalRules();

    expect(tasks.length).toBe(120);
    expect(tasks[0].id).toBe('V3-H-001');
    expect(tasks[tasks.length - 1].id).toBe('V3-H-120');

    expect(ruleSet.version).toBe('1.1.0-v3');
    expect(ruleSet.rules.length).toBe(39);
    const activeRules = ruleSet.rules.filter((r) => r.active);
    expect(activeRules.length).toBe(34);

    // Every active rule automatically receives extracted requiredTokens
    for (const rule of activeRules) {
      expect(rule.requiredTokens && rule.requiredTokens.length).toBeGreaterThan(0);
    }

    // Read-only invariant: frozen vault digests are completely unchanged
    expect(sha256File(tasksPath)).toBe(tasksShaBefore);
    expect(sha256File(factsPath)).toBe(factsShaBefore);
  });

  it('integrates prerequisite-aware retrieval, forensic tagging, and deterministic oracle evaluation', () => {
    const cartridge = new PostgresV3Cartridge({
      evaluator: (sql, meta) => {
        if (sql.includes('BROKEN_SYNTAX')) {
          return {
            pass: false,
            failedFacts: ['F-13'],
            details: 'F-13: Table missing',
            failureDetails: ['F-13: syntax error near BROKEN_SYNTAX'],
            migrationExitNonZero: true,
          };
        }
        const missingCreatedAt = !/\bcreated_at\b/i.test(sql);
        const failedFacts = missingCreatedAt ? ['F-05'] : [];
        return {
          pass: failedFacts.length === 0,
          failedFacts,
          details: failedFacts.length === 0 ? 'All bound facts passed.' : `F-05 failed on ${meta.table}`,
          migrationExitNonZero: false,
        };
      },
    });

    const tasks = cartridge.loadTasks();
    const { memory } = loadReadOnlyMemorySnapshot(
      path.resolve('.axiom-state', 'memory-v3-cid.json')
    );

    // Pick a C1_TTT append-only multi-tenant ingestion task where F-05 was displaced in v3
    const task = tasks.find((t) => t.id === 'V3-H-001')!;
    const ret = cartridge.retrieveRulesWithPrerequisites(task, memory, 10);
    expect(ret.selected.length).toBe(10);
    expect(ret.selected).toContain('F-01');
    expect(ret.selected).toContain('F-05');
    expect(ret.injectedPrerequisites).toContain('F-05');

    // Static forensics classification works through the cartridge interface
    const missingCreatedSql = `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`;
    const forensics = cartridge.classifyForensics(task, missingCreatedSql);
    expect(forensics.missingCreatedAtColumn).toBe(true);
    expect(forensics.omittedSupersedesId).toBe(true);

    // Deterministic oracle evaluation: normal committed execution
    const okEval = cartridge.evaluate(
      task,
      `CREATE TABLE public.${task.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());`
    );
    expect(okEval.committed).toBe(true);
    expect(okEval.failedFacts).toEqual([]);
    expect(okEval.passedFacts).toEqual(task.boundFacts);

    // Deterministic oracle evaluation: F-13 crash fails all bound facts
    const crashEval = cartridge.evaluate(task, 'BROKEN_SYNTAX;');
    expect(crashEval.committed).toBe(false);
    expect(crashEval.passedFacts).toEqual([]);
    expect(crashEval.failedFacts).toContain('F-13');
    for (const bf of task.boundFacts) {
      expect(crashEval.failedFacts).toContain(bf);
    }
    expect(crashEval.stderr).toContain('BROKEN_SYNTAX');
  });
});
