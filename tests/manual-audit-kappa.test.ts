import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCohensKappa,
  evaluateManualAuditKappa,
  parseNumberedFlagSelection,
  saveRaterAuditCsv,
} from '../scripts/v3/score-manual-audit.js';
import type { SqlForensicFlagName } from '../src/verifier/sql-forensics.js';

describe("Cohen's kappa & blind manual-audit evaluator (scripts/v3/score-manual-audit.ts)", () => {
  it('parses single-prompt comma-separated defect numbers (1..13, 0 for none, q to quit)', () => {
    const none = parseNumberedFlagSelection('0');
    expect(none.action).toBe('select');
    if (none.action === 'select') expect(none.flags.size).toBe(0);

    const two = parseNumberedFlagSelection('2, 12');
    expect(two.action).toBe('select');
    if (two.action === 'select') {
      expect([...two.flags]).toEqual(['hasExplicitSupersedesFk', 'missingCreatedAtColumn']);
    }

    const quit = parseNumberedFlagSelection('q');
    expect(quit.action).toBe('quit');

    const bad = parseNumberedFlagSelection('14');
    expect(bad.action).toBe('invalid');
  });
  it('returns exact kappa = 1.0 on perfect agreement (both balanced and constant degenerate prevalence)', () => {
    const ref = [true, true, false, false, true, false, true, false];
    const comp = [true, true, false, false, true, false, true, false];
    const res = computeCohensKappa(ref, comp);

    expect(res.kappa).toBeCloseTo(1.0, 10);
    expect(res.percentAgreement).toBeCloseTo(1.0, 10);
    expect(res.precision).toBeCloseTo(1.0, 10);
    expect(res.recall).toBeCloseTo(1.0, 10);
    expect(res.f1).toBeCloseTo(1.0, 10);
    expect(res.ci95[0]).toBeLessThanOrEqual(1.0);
    expect(res.ci95[1]).toBeCloseTo(1.0, 10);

    // Degenerate all-negative 100% agreement
    const allFalse = [false, false, false, false, false];
    const deg = computeCohensKappa(allFalse, allFalse);
    expect(deg.kappa).toBe(1.0);
    expect(deg.percentAgreement).toBe(1.0);
  });

  it('returns exact kappa = 0.0 on independent chance agreement', () => {
    // 2x2 table with tp=25, fp=25, fn=25, tn=25 -> p_o = 0.5, p_e = 0.5 -> kappa = 0.0
    const ref: boolean[] = [
      ...Array(25).fill(true),
      ...Array(25).fill(false),
      ...Array(25).fill(true),
      ...Array(25).fill(false),
    ];
    const comp: boolean[] = [
      ...Array(25).fill(true),
      ...Array(25).fill(true),
      ...Array(25).fill(false),
      ...Array(25).fill(false),
    ];
    const res = computeCohensKappa(ref, comp);

    expect(res.percentAgreement).toBeCloseTo(0.5, 10);
    expect(res.expectedAgreement).toBeCloseTo(0.5, 10);
    expect(res.kappa).toBeCloseTo(0.0, 10);
    expect(res.ci95[0]).toBeLessThan(0.0);
    expect(res.ci95[1]).toBeGreaterThan(0.0);
  });

  it('handles asymmetric prevalence edge cases and reports PABAK & Fleiss 95% CIs accurately', () => {
    // Rare event prevalence: tp=8, fp=1, fn=1, tn=90 (n=100)
    // p_o = 0.98, pRefPos = 0.09, pCompPos = 0.09 -> p_e = 0.09*0.09 + 0.91*0.91 = 0.0081 + 0.8281 = 0.8362
    // kappa = (0.98 - 0.8362) / (1 - 0.8362) = 0.1438 / 0.1638 = 0.87790
    const ref: boolean[] = [
      ...Array(8).fill(true),
      false,
      true,
      ...Array(90).fill(false),
    ];
    const comp: boolean[] = [
      ...Array(8).fill(true),
      true,
      false,
      ...Array(90).fill(false),
    ];
    const res = computeCohensKappa(ref, comp);

    expect(res.percentAgreement).toBeCloseTo(0.98, 10);
    expect(res.expectedAgreement).toBeCloseTo(0.8362, 10);
    expect(res.kappa).toBeCloseTo(0.1438 / 0.1638, 6);
    expect(res.pabak).toBeCloseTo(0.96, 10);
    expect(res.prevalenceIndex).toBeCloseTo(82 / 100, 10);
    expect(res.biasIndex).toBeCloseTo(0, 10);
    expect(res.se).toBeGreaterThan(0);
    expect(res.ci95[0]).toBeGreaterThan(0.65);
    expect(res.ci95[1]).toBeLessThanOrEqual(1.0);
  });

  it('evaluates Rater 1 vs. sql-forensics.ts and Rater 1 vs. Rater 2 from CSV files in an isolated temp dir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-kappa-test-'));
    try {
      const sampleCsv = path.join(tmpDir, 'manual-audit-sample.csv');
      const rater1Csv = path.join(tmpDir, 'manual-audit-rater1.csv');
      const rater2Csv = path.join(tmpDir, 'manual-audit-rater2.csv');

      fs.writeFileSync(
        sampleCsv,
        [
          'sampleIndex,runId,taskId,condition,boundPassed,boundFactFraction,migrationExitNonZero,tableMissing,failedFacts,triggeredForensicFlags,sqlSha256,sqlPreview',
          '1,nemotron-v3,V3-H-001,C0,false,0.5,false,false,F-16,hasInlineSupersedesFk,aaa111,"CREATE TABLE public.t1 ();"',
          '2,nemotron-v3,V3-H-002,C,false,0.5,false,false,F-36,omittedSupersedesId,bbb222,"CREATE TABLE public.t2 ();"',
          '3,nemotron-v3,V3-H-003,C_ID,true,1.0,false,false,,,ccc333,"CREATE TABLE public.t3 ();"',
        ].join('\n') + '\n',
        'utf8'
      );

      saveRaterAuditCsv(rater1Csv, [
        {
          sampleIndex: 1,
          taskId: 'V3-H-001',
          condition: 'C0',
          sqlSha256: 'aaa111',
          ratedAt: '2026-11-21T00:00:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(['hasInlineSupersedesFk']),
        },
        {
          sampleIndex: 2,
          taskId: 'V3-H-002',
          condition: 'C',
          sqlSha256: 'bbb222',
          ratedAt: '2026-11-21T00:01:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(['omittedSupersedesId']),
        },
        {
          sampleIndex: 3,
          taskId: 'V3-H-003',
          condition: 'C_ID',
          sqlSha256: 'ccc333',
          ratedAt: '2026-11-21T00:02:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(),
        },
      ]);

      saveRaterAuditCsv(rater2Csv, [
        {
          sampleIndex: 1,
          taskId: 'V3-H-001',
          condition: 'C0',
          sqlSha256: 'aaa111',
          ratedAt: '2026-11-21T00:00:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(['hasInlineSupersedesFk']),
        },
        {
          sampleIndex: 2,
          taskId: 'V3-H-002',
          condition: 'C',
          sqlSha256: 'bbb222',
          ratedAt: '2026-11-21T00:01:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(['omittedSupersedesId']),
        },
        {
          sampleIndex: 3,
          taskId: 'V3-H-003',
          condition: 'C_ID',
          sqlSha256: 'ccc333',
          ratedAt: '2026-11-21T00:02:00Z',
          triggeredForensicFlags: new Set<SqlForensicFlagName>(),
        },
      ]);

      const report = evaluateManualAuditKappa(sampleCsv, rater1Csv, rater2Csv);
      expect(report.sampleCount).toBe(3);
      expect(report.rater1RatedCount).toBe(3);
      expect(report.rater2RatedCount).toBe(3);
      expect(report.rater1VsClassifier?.overallMicro.kappa).toBeCloseTo(1.0, 10);
      expect(report.rater1VsRater2?.overallMicro.kappa).toBeCloseTo(1.0, 10);
      expect(report.rater1VsClassifier?.byFlag.hasInlineSupersedesFk.kappa).toBeCloseTo(1.0, 10);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
