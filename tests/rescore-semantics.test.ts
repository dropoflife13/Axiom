import { describe, expect, it } from 'vitest';
import {
  stripTopLevelBeginCommit,
  transformSqlForSemantics,
} from '../scripts/rescore-semantics.js';
import { INCLUSION_RULE } from '../scripts/generate-run-ledger.js';
import { auditRetrievalPrerequisites } from '../scripts/retrieval-prerequisites.js';

describe('Rescoring Semantics Transformations', () => {
  it('strips top-level BEGIN and COMMIT statements correctly', () => {
    const sql = `BEGIN;
CREATE TABLE public.test (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
COMMIT;`;
    const stripped = stripTopLevelBeginCommit(sql);
    expect(stripped).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(stripped).not.toMatch(/^\s*COMMIT\s*;/m);
    expect(stripped).toContain('-- [S2 STRIPPED] BEGIN;');
    expect(stripped).toContain('-- [S2 STRIPPED] COMMIT;');
    expect(stripped).toContain('CREATE TABLE public.test');
  });

  it('strips BEGIN TRANSACTION and COMMIT TRANSACTION variants', () => {
    const sql = `BEGIN TRANSACTION;
CREATE TABLE public.test (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
COMMIT TRANSACTION;`;
    const stripped = stripTopLevelBeginCommit(sql);
    expect(stripped).toContain('-- [S2 STRIPPED] BEGIN;');
    expect(stripped).toContain('-- [S2 STRIPPED] COMMIT;');
  });

  it('preserves inner PL/pgSQL BEGIN/END blocks in functions', () => {
    const sql = `BEGIN;
CREATE FUNCTION public.test_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'inside plpgsql';
  RETURN NEW;
END;
$$;
COMMIT;`;
    const stripped = stripTopLevelBeginCommit(sql);
    expect(stripped).toContain('-- [S2 STRIPPED] BEGIN;');
    expect(stripped).toContain('-- [S2 STRIPPED] COMMIT;');
    // In plpgsql, BEGIN does not have a semicolon, so it is preserved
    expect(stripped).toContain('BEGIN\n  RAISE NOTICE');
    expect(stripped).toContain('RETURN NEW;');
  });

  it('transformSqlForSemantics S1 prepends ON_ERROR_STOP off', () => {
    const sql = 'CREATE TABLE public.test (id uuid PRIMARY KEY);';
    const s1 = transformSqlForSemantics(sql, 'S1');
    expect(s1.startsWith('\\set ON_ERROR_STOP off\n')).toBe(true);
    expect(s1).toContain(sql);
  });

  it('transformSqlForSemantics S2 strips top-level transaction and prepends ON_ERROR_STOP off', () => {
    const sql = 'BEGIN;\nCREATE TABLE public.test (id uuid PRIMARY KEY);\nCOMMIT;';
    const s2 = transformSqlForSemantics(sql, 'S2');
    expect(s2.startsWith('\\set ON_ERROR_STOP off\n')).toBe(true);
    expect(s2).toContain('-- [S2 STRIPPED] BEGIN;');
    expect(s2).toContain('-- [S2 STRIPPED] COMMIT;');
  });
});

describe('Run Ledger Inclusion Rules', () => {
  it('has valid inclusion rule metadata', () => {
    expect(INCLUSION_RULE.adoptedAt).toBe('2026-11-10');
    expect(INCLUSION_RULE.basis).toContain('adopted after the first three completed runs were analyzed');
    expect(INCLUSION_RULE.criteria).toEqual([
      'completion_720',
      'constant_settings',
      'standard_endpoint',
      'pinned_model_version',
      'verified_sanitization',
      'validity_gate_b_gt_a',
    ]);
  });
});

describe('Retrieval Prerequisites Audit', () => {
  it('correctly calculates F-01 and F-05 stats and flags dependent rules', () => {
    const audit = auditRetrievalPrerequisites();
    expect(audit.totalTasks).toBe(120);
    expect(audit.f01Stats.applicableCount).toBe(40);
    expect(audit.f01Stats.passedCount).toBe(39);
    expect(audit.f01Stats.failedCount).toBe(1);
    expect(audit.f01Stats.failureRate).toBe(0.025);
    expect(audit.f01Stats.rankByFailureCount).toBe(20);

    expect(audit.f05Stats.applicableCount).toBe(40);
    expect(audit.f05Stats.failedCount).toBe(9);
    expect(audit.f05Stats.rankByFailureCount).toBe(14);

    expect(audit.tasksWithF01Retrieved).toBe(0);
    expect(audit.tasksWithF01MissingDeps).toBe(120);
    expect(audit.tasksWithF05MissingDeps).toBe(60);
    expect(audit.tasksWithAnyMissingPrereq).toBe(120);
  });
});
