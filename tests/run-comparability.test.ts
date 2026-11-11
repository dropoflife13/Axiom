import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  resolveExecutorModel,
  assertModelMatch,
  ALLOWED_EXECUTOR_MODELS,
  computeExecutorCacheKey,
  getExecutorSha256,
  getProviderProvenance,
  SQL_GENERATION_MAX_RETRIES,
  generateSqlMigration,
} from '../src/executor.js';
import {
  computeHintBSha256,
  computeHintDSha256,
  computeHintBuildersSha256,
  getRunMetadata,
  assertRunMetadataMatches,
  assertComparabilityWithRun,
  findRunCheckpoint,
  type RunMetadata,
} from '../src/eval/ablation.js';
import { parseArgs } from '../scripts/analyze-ablation-v2.js';
import { compareRuns, formatComparisonTable, type ContrastComparison } from '../scripts/compare-runs.js';
import { migrateRun1 } from '../scripts/migrate-run1.js';

describe('Model Configuration and Guardrails', () => {
  const originalEnv = process.env.NVIDIA_EXECUTOR_MODEL;
  const originalGemini = process.env.GEMINI_EXECUTOR_MODEL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NVIDIA_EXECUTOR_MODEL = originalEnv;
    } else {
      delete process.env.NVIDIA_EXECUTOR_MODEL;
    }
    if (originalGemini !== undefined) {
      process.env.GEMINI_EXECUTOR_MODEL = originalGemini;
    } else {
      delete process.env.GEMINI_EXECUTOR_MODEL;
    }
  });

  it('rejects missing NVIDIA_EXECUTOR_MODEL environment variable', () => {
    delete process.env.NVIDIA_EXECUTOR_MODEL;
    delete process.env.GEMINI_EXECUTOR_MODEL;
    expect(() => resolveExecutorModel()).toThrow(/Set NVIDIA_EXECUTOR_MODEL in the environment/i);
  });

  it('rejects models outside the pre-registered allow-list', () => {
    process.env.NVIDIA_EXECUTOR_MODEL = 'openai/gpt-4o';
    expect(() => resolveExecutorModel()).toThrow(/must be one of.*google\/gemma-4-31b-it.*nvidia\/nemotron-3-ultra-550b-a55b/i);
  });

  it('accepts allowed models without fallback', () => {
    for (const model of ALLOWED_EXECUTOR_MODELS) {
      process.env.NVIDIA_EXECUTOR_MODEL = model;
      expect(resolveExecutorModel()).toBe(model);
    }
  });

  it('assertModelMatch enforces requested matches configured and returned matches requested', () => {
    expect(() => assertModelMatch('google/gemma-4-31b-it', 'google/gemma-4-31b-it')).not.toThrow();
    expect(() => assertModelMatch('google/gemma-4-31b-it', 'nvidia/nemotron-3-ultra-550b-a55b')).toThrow(
      /does not match requested model/i
    );
  });
});

describe('Executor Cache Key Composition', () => {
  it('includes model, base URL, system/hint, user prompt, and temperature', () => {
    const key1 = computeExecutorCacheKey(
      'google/gemma-4-31b-it',
      'System with Hint A',
      'User Prompt X',
      0
    );
    const key2 = computeExecutorCacheKey(
      'google/gemma-4-31b-it',
      'System with Hint B',
      'User Prompt X',
      0
    );
    const key3 = computeExecutorCacheKey(
      'nvidia/nemotron-3-ultra-550b-a55b',
      'System with Hint A',
      'User Prompt X',
      0
    );
    const key4 = computeExecutorCacheKey(
      'google/gemma-4-31b-it',
      'System with Hint A',
      'User Prompt Y',
      0
    );
    const key5 = computeExecutorCacheKey(
      'google/gemma-4-31b-it',
      'System with Hint A',
      'User Prompt X',
      0.7
    );

    // All should be 64-char sha256 hex strings
    expect(key1).toMatch(/^[0-9a-f]{64}$/);
    // Keys must differ when hint, model, user prompt, or temperature change
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
    expect(key1).not.toBe(key5);
  });
});

describe('Ablation Run Provenance and Metadata', () => {
  it('computes valid SHA-256 hashes for hints and hint builders', () => {
    const bHash = computeHintBSha256();
    const dHash = computeHintDSha256();
    const buildersHash = computeHintBuildersSha256();

    expect(bHash).toMatch(/^[0-9a-f]{64}$/);
    expect(dHash).toMatch(/^[0-9a-f]{64}$/);
    expect(buildersHash).toMatch(/^[0-9a-f]{64}$/);

    expect(bHash).toBe('1876a65e41ca490f336328b3f41816ea9c83046494ca3f96ae265abc0e12ae95');
    expect(dHash).toBe('130f12410b698480620ba5e12cead5e56f71931dd324b22cf836476f9372f1cd');
    expect(buildersHash).toBe('19033ced3b39e13399d0de8be86cb3cec4040b69f51da36880fdf42aed35b299');
  });

  it('records required fields in run metadata including diffSha256 when allowDirty is true', () => {
    const meta = getRunMetadata(path.resolve('.'), 'google/gemma-4-31b-it', true);
    expect(meta.requestedModel).toBe('google/gemma-4-31b-it');
    expect(meta.topK).toBe(10);
    expect(meta.hintBSha256).toBeDefined();
    expect(meta.hintDSha256).toBeDefined();
    expect(meta.hintBuildersSha256).toBeDefined();
    expect(meta.oracleSha256).toBeDefined();
    expect(meta.tasksSha256).toBeDefined();
    expect(meta.factsSha256).toBeDefined();
    expect(meta.memorySha256).toBeDefined();
    expect(meta.gitCommit).toBeDefined();
    expect(meta.diffSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('assertRunMetadataMatches throws on model mismatch on resume', () => {
    const expected: Partial<RunMetadata> = {
      requestedModel: 'nvidia/nemotron-3-ultra-550b-a55b',
      gitCommit: 'abc',
    };
    const actual: RunMetadata = {
      requestedModel: 'google/gemma-4-31b-it',
      gitCommit: 'abc',
      oracleSha256: '1',
      tasksSha256: '2',
      factsSha256: '3',
      memorySha256: '4',
      topK: 10,
      hintBSha256: 'hB',
      hintDSha256: 'hD',
      hintBuildersSha256: 'hBuild',
    };

    expect(() => assertRunMetadataMatches(expected, actual)).toThrow(
      /Ablation provenance mismatch for requestedModel/
    );
  });

  it('assertComparabilityWithRun verifies run comparability against nemotron-2 baseline', () => {
    const root = path.resolve('.');
    const currentMeta = getRunMetadata(root, 'google/gemma-4-31b-it', true);

    expect(() => assertComparabilityWithRun('nemotron-2', currentMeta, root)).not.toThrow();

    const tamperedMeta = { ...currentMeta, topK: 12 };
    expect(() => assertComparabilityWithRun('nemotron-2', tamperedMeta, root)).toThrow(
      /Comparability check failed against run "nemotron-2" for SQL_RETRIEVAL_TOP_K/
    );
  });
});

describe('CLI Argument Parsing', () => {
  it('parseArgs in analyze-ablation-v2 accepts space-separated and equals-separated flags', () => {
    const res1 = parseArgs(['--checkpoint', 'foo/bar.json', '--out', 'out/baz.json']);
    expect(res1.checkpoint).toBe(path.resolve('foo/bar.json'));
    expect(res1.out).toBe(path.resolve('out/baz.json'));

    const res2 = parseArgs(['--checkpoint=foo/bar.json', '--out=out/baz.json']);
    expect(res2.checkpoint).toBe(path.resolve('foo/bar.json'));
    expect(res2.out).toBe(path.resolve('out/baz.json'));
  });
});

describe('Run Comparison Script', () => {
  it('performs cross-run comparison, sign agreement check, and table formatting', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-comp-test-'));
    try {
      // Build synthetic trials for run A and run B
      const conditions = ['A', 'B', 'C', 'C0', 'D', 'E_B'] as const;
      const tasks = ['H-001', 'H-002'];

      const makeRun = (model: string, cBoost: number) => {
        const trials = [];
        for (const taskId of tasks) {
          for (const condition of conditions) {
            let frac = 0.5;
            if (condition === 'C') frac = 0.5 + cBoost;
            if (condition === 'B') frac = 0.7;
            trials.push({
              condition,
              taskId,
              boundFacts: ['F-01', 'F-02'],
              boundPassed: frac > 0.6,
              boundFactFraction: frac,
              failedFacts: [],
              retrievedFactIds: [],
              promptTokens: 100,
              totalTokens: 200,
              requestedModel: model,
              returnedModel: model,
            });
          }
        }
        return {
          metadata: { requestedModel: model, gitCommit: 'commit123' },
          trials,
        };
      };

      const pathA = path.join(tmpDir, 'runA.json');
      const pathB = path.join(tmpDir, 'runB.json');
      fs.writeFileSync(pathA, JSON.stringify(makeRun('model-a', 0.3)), 'utf8');
      fs.writeFileSync(pathB, JSON.stringify(makeRun('model-b', 0.2)), 'utf8');

      const result = compareRuns(pathA, pathB);
      expect(result.runA.model).toBe('model-a');
      expect(result.runB.model).toBe('model-b');
      expect(result.contrasts.length).toBe(4);
      expect(result.exploratoryNote).toContain('Exploratory');

      const formatted = formatComparisonTable(result);
      expect(formatted).toContain('# Ablation Multi-Run Comparison (Exploratory)');
      expect(formatted).toContain('C_vs_A');
      expect(formatted).toContain('C_vs_B');
      expect(formatted).toContain('C_vs_C0');
      expect(formatted).toContain('C_vs_D');
      expect(formatted).toContain('Sign Agrees?');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Migration Script Logic', () => {
  it('migrates run 1 files and verifies SHA-256 equality in a sandbox', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-migrate-test-'));
    try {
      const stateDir = path.join(tmpDir, '.axiom-state');
      const archiveDir = path.join(tmpDir, 'out', 'archive', 'run-nemotron-1');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(archiveDir, { recursive: true });

      const testContentCheckpoint = JSON.stringify({ test: 'checkpoint-data' });
      const testContentResults = JSON.stringify({ test: 'results-data' });

      fs.writeFileSync(path.join(stateDir, 'ablation-v2-checkpoint.json'), testContentCheckpoint, 'utf8');
      fs.writeFileSync(path.join(archiveDir, 'ablation-v2-checkpoint.json'), testContentCheckpoint, 'utf8');

      fs.writeFileSync(path.join(stateDir, 'ablation-v2-results.json'), testContentResults, 'utf8');
      fs.writeFileSync(path.join(archiveDir, 'ablation-v2-results.json'), testContentResults, 'utf8');

      const res = migrateRun1(tmpDir);
      expect(res.destCheckpointSha256).toBe(res.archiveCheckpointSha256);
      expect(res.destResultsSha256).toBe(res.archiveResultsSha256);
      expect(fs.existsSync(path.join(stateDir, 'runs', 'nemotron-1', 'checkpoint.json'))).toBe(true);
      expect(fs.existsSync(path.join(stateDir, 'runs', 'nemotron-1', 'results.json'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Executor SHA Provenance and Retry Cap', () => {
  it('records consistent executorSha256 on getExecutorSha256, getProviderProvenance, and getRunMetadata', () => {
    const expectedSha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.resolve('src/executor.ts'), 'utf8'))
      .digest('hex');

    expect(getExecutorSha256()).toBe(expectedSha);

    const prov = getProviderProvenance('z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flash');
    expect(prov.executorSha256).toBe(expectedSha);

    const prevModel = process.env.NVIDIA_EXECUTOR_MODEL;
    process.env.NVIDIA_EXECUTOR_MODEL = 'z-ai/glm-5.3-flash';
    try {
      const meta = getRunMetadata(process.cwd(), 'z-ai/glm-5.3-flash', true);
      expect(meta.executorSha256).toBe(expectedSha);
    } finally {
      if (prevModel === undefined) {
        delete process.env.NVIDIA_EXECUTOR_MODEL;
      } else {
        process.env.NVIDIA_EXECUTOR_MODEL = prevModel;
      }
    }
  });

  it('caps SQL generation retries at 3 so repeated 5xx errors fail after 3 attempts', async () => {
    expect(SQL_GENERATION_MAX_RETRIES).toBe(3);

    const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-retry-test-'));
    const fetchMock = vi.fn().mockImplementation(async () => new Response('upstream error', { status: 500 }));
    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.useFakeTimers();

    try {
      let caughtError: Error | undefined;
      const promise = generateSqlMigration(
        'Create test table',
        'audit_logs',
        { tenant: true, append_only: true, ingestion: false },
        undefined,
        {
          model: 'z-ai/glm-5.3-flash',
          disableCache: true,
          cacheDir: tmpCache,
        }
      ).catch((err: Error) => {
        caughtError = err;
      });
      await vi.runAllTimersAsync();
      await promise;
      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toMatch(/5xx 500/);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = prevFetch;
      fs.rmSync(tmpCache, { recursive: true, force: true });
    }
  });
});
