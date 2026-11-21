import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FACT_TOKENS } from '../scripts/v3/verify-cid-vault.js';
import {
  computeTokenRecallAgainstReference,
  extractRequiredTokens,
} from '../src/v4/lexical-token-extractor.js';

interface RawV3FactsFile {
  version: string;
  facts: Array<{
    id: string;
    statement: string;
    applicability?: { never?: boolean };
    status?: string;
  }>;
}

describe('v4 Automated Lexical Token Extractor (src/v4/lexical-token-extractor.ts)', () => {
  it('extracts quoted literals, snake_case identifiers, dotted calls, and SQL policy clauses while filtering English stop-words', () => {
    const rule =
      "Tenant RLS policies must use auth.jwt() -> 'app_metadata' ->> 'tenant_id', declare created_at timestamptz DEFAULT gen_random_uuid(), enforce ON DELETE RESTRICT, ENABLE ROW LEVEL SECURITY, and FORCE ROW LEVEL SECURITY, and raise 'Update/Delete operation rejected on audit log'.";
    const tokens = extractRequiredTokens(rule);
    const lower = new Set(tokens.map((t) => t.toLowerCase()));

    expect(tokens).toContain('app_metadata');
    expect(tokens).toContain('tenant_id');
    expect(tokens).toContain('Update/Delete operation rejected on audit log');
    expect(tokens).toContain('created_at');
    expect(tokens).toContain('auth.jwt()');
    expect(tokens).toContain('gen_random_uuid()');
    expect(tokens).toContain('ON DELETE RESTRICT');
    expect(tokens).toContain('ENABLE ROW LEVEL SECURITY');
    expect(tokens).toContain('FORCE ROW LEVEL SECURITY');
    expect(tokens).toContain('timestamptz');

    // Generic English stop-words must not leak into extracted tokens
    for (const stopWord of ['must', 'the', 'and', 'with', 'policies', 'tables', 'enforce']) {
      expect(lower.has(stopWord)).toBe(false);
    }
  });

  it('extracts identifiers from optional stderrHint without duplicating rule tokens', () => {
    const tokens = extractRequiredTokens(
      'Every table must include created_at timestamptz NOT NULL DEFAULT now().',
      'ERROR:  column "deleted_at" of relation "orders" does not exist; violates fk_orders_supersedes_id'
    );
    expect(tokens).toContain('created_at');
    expect(tokens).toContain('deleted_at');
    expect(tokens).toContain('fk_orders_supersedes_id');

    // No case-insensitive duplicates
    const lowerSet = new Set(tokens.map((t) => t.toLowerCase()));
    expect(lowerSet.size).toBe(tokens.length);
  });

  it('runs across all 34 active v3 canonical rules and reports exact token recall against REQUIRED_FACT_TOKENS', () => {
    const factsPath = path.resolve('fixtures', 'task-v3', 'facts.json');
    const raw = JSON.parse(fs.readFileSync(factsPath, 'utf8')) as RawV3FactsFile;
    const activeFacts = raw.facts.filter(
      (f) =>
        !f.applicability?.never &&
        !['DROPPED', 'UNCONFIRMED', 'PROPOSED'].includes((f.status ?? '').toUpperCase())
    );
    expect(activeFacts.length).toBe(34);

    const rulesById = new Map(activeFacts.map((f) => [f.id, f.statement]));
    const metrics = computeTokenRecallAgainstReference(rulesById, REQUIRED_FACT_TOKENS);

    const missedSummary = Object.entries(metrics.byFact)
      .filter(([, m]) => m.missed.length > 0)
      .map(([fid, m]) => `${fid}: missed [${m.missed.join(', ')}]`);

    console.log(
      `[v4 Lexical Token Extractor Recall] ${metrics.matchedTokens}/${metrics.totalExpectedTokens} (${(metrics.recall * 100).toFixed(2)}%) across ${Object.keys(metrics.byFact).length} active v3 rules` +
        (missedSummary.length > 0 ? ` | Missed: ${missedSummary.join('; ')}` : ' | 0 misses')
    );

    expect(Object.keys(metrics.byFact).length).toBe(34);
    expect(metrics.totalExpectedTokens).toBeGreaterThanOrEqual(70);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.95);
    expect(missedSummary).toEqual([]);
  });
});
