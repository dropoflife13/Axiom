import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildRunSnapshot, exportRunSnapshot } from '../scripts/export-run-snapshot';

describe('export-run-snapshot', () => {
  it(
    'generates a clean, vercel-safe snapshot from a synthetic checkpoint and excludes secrets',
    () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-snapshot-test-'));
    const checkpointFile = path.join(tmpDir, 'synthetic-checkpoint.json');
    const analysisFile = path.join(tmpDir, 'synthetic-analysis.json');
    const outFile = path.join(tmpDir, 'run-synthetic.json');

    const conditions = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
    const syntheticTrials = [];

    for (const condition of conditions) {
      for (let i = 1; i <= 5; i++) {
        const taskId = `task-${i}`;
        const boundPassed = condition === 'C' ? i % 2 === 0 : condition === 'B' ? true : false;
        syntheticTrials.push({
          condition,
          taskId,
          boundPassed,
          boundFactFraction: boundPassed ? 1.0 : 0.5,
          failedFacts: boundPassed ? [] : ['F-01', 'F-02'],
          boundFacts: ['F-01', 'F-02', 'F-03'],
          totalTokens: 1500 + i * 50,
          promptTokens: 800,
          generationStatus: 'ok',
          // Fields that must be EXCLUDED from the snapshot:
          generatedSql: 'SELECT secret_column FROM users WHERE id = 1;',
          prompt: 'You are a database bot. Secret internal instructions: top_secret_token_12345.',
          apiKey: 'nvapi-fake-secret-key-that-must-be-excluded-12345',
        });
      }
    }

    fs.writeFileSync(
      checkpointFile,
      JSON.stringify({
        metadata: {
          model: 'test-synthetic-model',
          baseUrl: 'https://api.example.com/v1?token=remove_token',
          gitCommit: '1234567890abcdef1234567890abcdef12345678',
          dirty: false,
        },
        trials: syntheticTrials,
      }),
      'utf8'
    );

    const { snapshot, outPath } = exportRunSnapshot({
      runPath: checkpointFile,
      id: 'synthetic-test',
      outPath: outFile,
    });

    expect(outPath).toBe(outFile);
    expect(fs.existsSync(outFile)).toBe(true);

    // Verify top-level fields
    expect(snapshot.id).toBe('synthetic-test');
    expect(snapshot.runId).toBe('synthetic-test');
    expect(snapshot.model).toBe('test-synthetic-model');
    expect(snapshot.baseUrl).toBe('https://api.example.com/v1');
    expect(snapshot.gitCommit).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(snapshot.commit).toBe('1234567');
    expect(snapshot.dirty).toBe(false);

    // Verify SHA-256 hashes
    expect(snapshot.sha256).toBeDefined();
    expect(typeof snapshot.sha256.oracleTs).toBe('string');
    expect(typeof snapshot.sha256.tasksJson).toBe('string');
    expect(typeof snapshot.sha256.factsJson).toBe('string');
    expect(typeof snapshot.sha256.memoryJson).toBe('string');

    // Verify conditions table
    expect(snapshot.conditions).toBeDefined();
    for (const c of conditions) {
      expect((snapshot.conditions as any)[c]).toBeDefined();
    }

    // Verify the four paired comparisons with Holm p-values & cell-level results
    expect(snapshot.pairedComparisons).toBeDefined();
    for (const baseline of ['A', 'B', 'C0', 'D']) {
      const comp = (snapshot.pairedComparisons as any)[`C_vs_${baseline}`];
      expect(comp).toBeDefined();
      expect(comp.n).toBeGreaterThan(0);
      expect(comp).toHaveProperty('holmPrimaryPValue');
      expect(comp).toHaveProperty('holmSecondaryPValue');
      expect(comp).toHaveProperty('cellLevelResults');
    }

    // Verify perFactPassRates & failuresByFact
    expect(snapshot.perFactPassRates).toBeDefined();
    expect(snapshot.failuresByFact).toBeDefined();
    expect(snapshot.failuresByFact.A).toHaveProperty('F-01');
    expect(snapshot.failuresByFact.A).toHaveProperty('F-02');

    // Verify trials summary structure
    expect(snapshot.trials).toHaveLength(syntheticTrials.length);
    for (const trial of snapshot.trials) {
      expect(trial).toHaveProperty('task');
      expect(trial).toHaveProperty('condition');
      expect(trial).toHaveProperty('boundFraction');
      expect(trial).toHaveProperty('failedFacts');
      expect(trial).toHaveProperty('tokens');
      expect(trial).toHaveProperty('status');
      expect(['pass', 'fail']).toContain(trial.status);

      // Verify STRICT EXCLUSION of sensitive fields
      expect((trial as any).generatedSql).toBeUndefined();
      expect((trial as any).prompt).toBeUndefined();
      expect((trial as any).apiKey).toBeUndefined();
    }

    // Verify full serialized JSON does not contain excluded secrets
    const rawOut = fs.readFileSync(outFile, 'utf8');
    expect(rawOut).not.toContain('SELECT secret_column');
    expect(rawOut).not.toContain('top_secret_token_12345');
    expect(rawOut).not.toContain('nvapi-fake-secret-key');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 15000);
});
