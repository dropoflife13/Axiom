// tests/v4-self-reflexion.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  captureReflexionTrace,
  getReflexionPaths,
  parseReflexionCaptureArgs,
  readReflexionQuarantine,
  readReflexionTraces,
} from '../scripts/v4/reflexion-capture.js';
import {
  parseLearnedRulesMarkdown,
  parseReflexionPromoteArgs,
  promoteReflexionCandidates,
  type ReflexionPromotionReceipt,
} from '../scripts/v4/reflexion-promote.js';
import { computeArtifactSha256, containsOperationalToken } from '../src/v4/hope/index.js';

function withTempWorkspace<T>(fn: (tmpDir: string) => T): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-self-reflexion-'));
  try {
    return fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('Antigravity Axiom Self-Reflexion Skill (capture -> quarantine -> compact -> dedup -> promote)', () => {
  it('parses CLI arguments for reflexion-capture and reflexion-promote', () => {
    const capArgs = parseReflexionCaptureArgs([
      '--signature',
      'TS2308-duplicate-export',
      '--command',
      'npx tsc --noEmit',
      '--fix',
      'Remove duplicate export from barrel',
      '--rule',
      'Never re-export estimateTokens from both context-compactor.ts and context-rot-detector.ts.',
      '--force-stage',
    ]);
    expect(capArgs.signature).toBe('TS2308-duplicate-export');
    expect(capArgs.forceStage).toBe(true);

    const promArgs = parseReflexionPromoteArgs([
      '--dry-run',
      '--skip-tests',
      '--similarity-threshold',
      '0.7',
    ]);
    expect(promArgs.dryRun).toBe(true);
    expect(promArgs.skipTests).toBe(true);
    expect(promArgs.similarityThreshold).toBe(0.7);
  });

  it('captures traces, stages at count >= 2, compacts with 100% lexical lock, deduplicates via detectContextRot, and emits SHA-256 receipts', () => {
    withTempWorkspace((tmpDir) => {
      const paths = getReflexionPaths(tmpDir);
      const verboseRule =
        'Please note that it is important to always make sure to export estimateTokens strictly from src/v4/hope/context-compactor.ts and never duplicate estimateTokens in src/v4/hope/context-rot-detector.ts to avoid TS2308 errors.';

      // 1st occurrence: logged to traces.jsonl, NOT yet staged
      const first = captureReflexionTrace({
        rootDir: tmpDir,
        signature: 'TS2308-duplicate-export',
        command: 'npx tsc --noEmit',
        fix: 'Removed duplicate export { estimateTokens }',
        rule: verboseRule,
        timestamp: '2026-11-24T13:00:00.000Z',
      });
      expect(first.signatureCount).toBe(1);
      expect(first.staged).toBe(false);
      expect(fs.existsSync(paths.quarantinePath)).toBe(false);

      // 2nd occurrence: hits count >= 2 -> auto-staged in reflexion-quarantine.json
      const second = captureReflexionTrace({
        rootDir: tmpDir,
        signature: 'TS2308-duplicate-export',
        command: 'npx tsc --noEmit',
        fix: 'Removed duplicate export { estimateTokens }',
        rule: verboseRule,
        timestamp: '2026-11-24T13:05:00.000Z',
      });
      expect(second.signatureCount).toBe(2);
      expect(second.staged).toBe(true);
      expect(second.candidate?.observedCount).toBe(2);
      expect(second.candidate?.evidenceHashes.length).toBe(2);
      expect(readReflexionTraces(paths.tracesPath).length).toBe(2);

      // Dry-run does not write LEARNED_RULES.md or receipts
      const dryRes = promoteReflexionCandidates({
        rootDir: tmpDir,
        dryRun: true,
        skipTests: true,
        timestamp: '2026-11-24T13:06:00.000Z',
      });
      expect(dryRes.promoted.length).toBe(1);
      expect(fs.existsSync(paths.learnedRulesPath)).toBe(false);
      expect(fs.existsSync(paths.receiptsPath)).toBe(false);

      // Failing canary gate blocks promotion cleanly
      const blockedByGate = promoteReflexionCandidates({
        rootDir: tmpDir,
        dryRun: false,
        skipTests: false,
        canaryGateRunner: () => ({ ok: false, error: 'Simulated tsc failure' }),
        timestamp: '2026-11-24T13:07:00.000Z',
      });
      expect(blockedByGate.gateExecuted).toBe(true);
      expect(blockedByGate.gatePassed).toBe(false);
      expect(blockedByGate.promoted.length).toBe(0);
      expect(fs.existsSync(paths.learnedRulesPath)).toBe(false);

      // Passing canary gate promotes compacted rule + emits cryptographic SHA-256 receipt
      const promotedRes = promoteReflexionCandidates({
        rootDir: tmpDir,
        dryRun: false,
        skipTests: false,
        canaryGateRunner: () => ({ ok: true }),
        timestamp: '2026-11-24T13:08:00.000Z',
      });
      expect(promotedRes.gateExecuted).toBe(true);
      expect(promotedRes.gatePassed).toBe(true);
      expect(promotedRes.promoted.length).toBe(1);
      expect(promotedRes.rejected.length).toBe(0);

      const receipt = promotedRes.promoted[0];
      expect(receipt.ruleId).toBe('LR-001');
      expect(receipt.afterTokens).toBeLessThan(receipt.beforeTokens);
      expect(receipt.reductionPct).toBeGreaterThan(0);
      expect(receipt.requiredTokens.length).toBeGreaterThan(0);
      for (const tok of receipt.requiredTokens) {
        expect(containsOperationalToken(receipt.compactedRuleText, tok)).toBe(true);
      }

      const learnedMd = fs.readFileSync(paths.learnedRulesPath, 'utf8');
      expect(computeArtifactSha256(learnedMd)).toBe(receipt.afterFileSha256);
      const parsedLearned = parseLearnedRulesMarkdown(learnedMd);
      expect(parsedLearned.length).toBe(1);
      expect(parsedLearned[0].id).toBe('LR-001');

      const receiptLines = fs
        .readFileSync(paths.receiptsPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((l) => JSON.parse(l) as ReflexionPromotionReceipt);
      expect(receiptLines.length).toBe(1);
      expect(receiptLines[0].receiptSha256).toBe(receipt.receiptSha256);

      // Stage a near-duplicate rule with --force-stage -> blocked by detectContextRot (Jaccard >= 0.65)
      const dupCapture = captureReflexionTrace({
        rootDir: tmpDir,
        signature: 'TS2308-duplicate-export-variant',
        command: 'npx tsc --noEmit',
        fix: 'Avoid duplicate estimateTokens export',
        rule: 'Export estimateTokens strictly from src/v4/hope/context-compactor.ts and never duplicate estimateTokens in src/v4/hope/context-rot-detector.ts to avoid TS2308 errors.',
        forceStage: true,
        timestamp: '2026-11-24T13:10:00.000Z',
      });
      expect(dupCapture.staged).toBe(true);

      const dedupRes = promoteReflexionCandidates({
        rootDir: tmpDir,
        dryRun: false,
        skipTests: true,
        timestamp: '2026-11-24T13:11:00.000Z',
      });
      expect(dedupRes.promoted.length).toBe(0);
      expect(dedupRes.rejected.length).toBe(1);
      expect(dedupRes.rejected[0].reason).toContain('context-rot deduplication');

      const finalQuarantine = readReflexionQuarantine(paths.quarantinePath);
      const dupEntry = finalQuarantine.candidates.find(
        (c) => c.signature === 'TS2308-duplicate-export-variant'
      );
      expect(dupEntry?.status).toBe('rejected');
    });
  });
});
