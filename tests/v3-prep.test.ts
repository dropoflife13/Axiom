import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyCidVault, REQUIRED_FACT_TOKENS } from '../scripts/v3/verify-cid-vault.js';
import { D_SAFE_TIPS, DDL_KEYWORD_REGEX, validateDSafeTips, formatDSafeHint } from '../scripts/v3/d-safe-tips.js';

describe('Ablation v3 Pre-Flight Gates', () => {
  it('preserves task-v2/facts.json immutability with verified SHA-256', () => {
    const v2Path = path.resolve('fixtures/task-v2/facts.json');
    expect(fs.existsSync(v2Path)).toBe(true);
    const content = fs.readFileSync(v2Path);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    expect(hash).toBe('c5a959088318715ac3367908c69c7c21bbd0ec64c8679849fcbd2ddf65688c72');
  });

  it('validates task-v3/facts.json version and repaired statements', () => {
    const v3Path = path.resolve('fixtures/task-v3/facts.json');
    expect(fs.existsSync(v3Path)).toBe(true);
    const data = JSON.parse(fs.readFileSync(v3Path, 'utf8'));
    expect(data.version).toBe('1.1.0-v3');
    expect(data.facts.length).toBe(39);

    const factMap = new Map(data.facts.map((f: any) => [f.id, f.statement]));

    // F-01
    expect(factMap.get('F-01')).toContain('declared once (do not combine an inline PRIMARY KEY with a second table-level PRIMARY KEY constraint)');

    // F-15
    expect(factMap.get('F-15')).toContain('[<role>_]<singular_ref_table>_id');

    // F-18
    expect(factMap.get('F-18')).toContain('idx_<table>_<col1>[_<col2>...] by joining all indexed column names in order with underscores');

    // F-19
    expect(factMap.get('F-19')).toContain('explicitly GRANT SELECT ON TABLE public.<table> TO readonly_user and GRANT SELECT, INSERT ON TABLE public.<table> TO application');

    // F-36
    expect(factMap.get('F-36')).toContain('explicit table-level constraint named fk_<table>_supersedes_id');
    expect(factMap.get('F-36')).toContain('(never an inline REFERENCES clause)');
  });

  it('verifies C_ID vault token preservation, word counts, and 200-task retrieval equivalence', () => {
    const report = verifyCidVault();
    expect(report.violations).toEqual([]);
    expect(report.memoryEntries).toBe(31);
    expect(report.totalActiveFacts).toBe(34);
    expect(report.totalTasksChecked).toBe(200);
    expect(report.tokenPreservationPass).toBe(true);
    expect(report.wordCountPass).toBe(true);
    expect(report.f36NoInlineRefPass).toBe(true);
    expect(report.retrievalEquivalencePass).toBe(true);
    expect(report.pass).toBe(true);
  });

  it('validates D_SAFE_TIPS token bounds and zero-DDL-keyword regex guard', () => {
    const validation = validateDSafeTips(D_SAFE_TIPS);
    expect(validation.violations).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.tipCount).toBe(8);
    expect(validation.estimatedTipTokens).toBeGreaterThanOrEqual(250);
    expect(validation.estimatedTipTokens).toBeLessThanOrEqual(350);
    expect(validation.estimatedTotalPromptTokens).toBeGreaterThanOrEqual(480);
    expect(validation.estimatedTotalPromptTokens).toBeLessThanOrEqual(560);

    for (const tip of D_SAFE_TIPS) {
      expect(DDL_KEYWORD_REGEX.test(tip)).toBe(false);
    }

    const formatted = formatDSafeHint(D_SAFE_TIPS);
    expect(formatted).toContain('UNRELATED POSTGRES INTERNALS:');
    expect(DDL_KEYWORD_REGEX.test(formatted)).toBe(false);
  });
});
