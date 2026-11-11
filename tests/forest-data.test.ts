import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FOREST_CONTRASTS,
  buildForestData,
  extractModelForestEntry,
  parseForestCliArgs,
  writeForestData,
} from '../scripts/forest-data.js';

function makeSyntheticAnalysisReport(opts: {
  model: string;
  provider: string;
  provenanced: boolean;
  deltas: Record<(typeof FOREST_CONTRASTS)[number], { mean: number; ci: [number, number]; p: number; holm: number }>;
}) {
  const comparisons = Object.fromEntries(
    FOREST_CONTRASTS.map((key) => [
      key,
      {
        n: 120,
        primary: {
          n: 120,
          meanDifference: opts.deltas[key].mean,
          ci95: opts.deltas[key].ci,
          signFlipPValue: opts.deltas[key].p,
        },
      },
    ])
  );
  const holmPrimaryPValues = Object.fromEntries(
    FOREST_CONTRASTS.map((key) => [key, opts.deltas[key].holm])
  );

  return {
    provenanced: opts.provenanced,
    provenance: {
      provider: opts.provider,
      requestedModel: opts.model,
      returnedModel: opts.model,
    },
    analysis: {
      comparisons,
      holmPrimaryPValues,
    },
  };
}

describe('forest-data descriptive extraction', () => {
  it('extracts per-model, per-contrast mean differences and CIs without pooling across models', () => {
    const modelAReport = makeSyntheticAnalysisReport({
      model: 'synthetic/model-a',
      provider: 'prov-a',
      provenanced: true,
      deltas: {
        C_vs_A: { mean: 0.25, ci: [0.18, 0.32], p: 1e-5, holm: 4e-5 },
        C_vs_B: { mean: -0.20, ci: [-0.26, -0.14], p: 1e-5, holm: 4e-5 },
        C_vs_C0: { mean: -0.15, ci: [-0.20, -0.10], p: 1e-5, holm: 4e-5 },
        C_vs_D: { mean: 0.22, ci: [0.15, 0.29], p: 1e-5, holm: 4e-5 },
      },
    });
    const modelBReport = makeSyntheticAnalysisReport({
      model: 'synthetic/model-b',
      provider: 'prov-b',
      provenanced: false,
      deltas: {
        C_vs_A: { mean: 0.30, ci: [0.22, 0.38], p: 1e-5, holm: 4e-5 },
        C_vs_B: { mean: -0.12, ci: [-0.18, -0.06], p: 2e-4, holm: 6e-4 },
        C_vs_C0: { mean: 0.02, ci: [-0.04, 0.08], p: 0.55, holm: 0.55 },
        C_vs_D: { mean: 0.40, ci: [0.33, 0.47], p: 1e-5, holm: 4e-5 },
      },
    });

    const forest = buildForestData([
      { runId: 'run-a', label: 'Model A', matrixTier: 'main', report: modelAReport },
      { runId: 'run-b', label: 'Model B', matrixTier: 'exploratory', report: modelBReport },
    ]);

    expect(forest.pooled).toBe(false);
    expect(forest.exploratory).toBe(true);
    expect(forest.note).toMatch(/no|omitted/i);
    expect('pooledEstimate' in forest).toBe(false);
    expect('combinedMean' in forest).toBe(false);

    expect(forest.models).toHaveLength(2);
    expect(forest.models[0]).toMatchObject({
      runId: 'run-a',
      label: 'Model A',
      model: 'synthetic/model-a',
      provider: 'prov-a',
      provenanced: true,
      matrixTier: 'main',
    });
    expect(forest.models[0].contrasts.map((c) => c.contrast)).toEqual([...FOREST_CONTRASTS]);
    expect(forest.models[0].contrasts[2]).toMatchObject({
      contrast: 'C_vs_C0',
      n: 120,
      meanDifference: -0.15,
      ci95: [-0.20, -0.10],
      excludesZero: true,
    });
    expect(forest.models[1].contrasts[2]).toMatchObject({
      contrast: 'C_vs_C0',
      meanDifference: 0.02,
      ci95: [-0.04, 0.08],
      excludesZero: false,
    });
  });

  it('writes single descriptive JSON from synthetic analyzer files on disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-forest-test-'));
    try {
      const fileA = path.join(tmpDir, 'analysis-a.json');
      const fileB = path.join(tmpDir, 'analysis-b.json');
      const outFile = path.join(tmpDir, 'forest-data.json');

      fs.writeFileSync(
        fileA,
        JSON.stringify(
          makeSyntheticAnalysisReport({
            model: 'synth-1',
            provider: 'nvidia',
            provenanced: true,
            deltas: {
              C_vs_A: { mean: 0.2, ci: [0.1, 0.3], p: 1e-4, holm: 4e-4 },
              C_vs_B: { mean: -0.1, ci: [-0.2, 0.0], p: 0.05, holm: 0.1 },
              C_vs_C0: { mean: -0.15, ci: [-0.25, -0.05], p: 1e-3, holm: 3e-3 },
              C_vs_D: { mean: 0.2, ci: [0.1, 0.3], p: 1e-4, holm: 4e-4 },
            },
          })
        ),
        'utf8'
      );
      fs.writeFileSync(
        fileB,
        JSON.stringify(
          makeSyntheticAnalysisReport({
            model: 'synth-2',
            provider: 'kilo',
            provenanced: false,
            deltas: {
              C_vs_A: { mean: -0.02, ci: [-0.08, 0.04], p: 0.5, holm: 0.8 },
              C_vs_B: { mean: -0.03, ci: [-0.10, 0.04], p: 0.4, holm: 0.8 },
              C_vs_C0: { mean: -0.22, ci: [-0.28, -0.16], p: 1e-5, holm: 4e-5 },
              C_vs_D: { mean: -0.06, ci: [-0.12, 0.00], p: 0.04, holm: 0.12 },
            },
          })
        ),
        'utf8'
      );

      const written = writeForestData(
        [
          { runId: 'synth-a', analysisPath: fileA, matrixTier: 'main' },
          { runId: 'synth-b', analysisPath: fileB, matrixTier: 'exploratory' },
        ],
        outFile
      );

      expect(fs.existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(parsed.pooled).toBe(false);
      expect(parsed.models).toHaveLength(2);
      expect(parsed.models[0].contrasts[1].excludesZero).toBe(false);
      expect(parsed.models[1].contrasts[3].excludesZero).toBe(false);
      expect(written.models[0].runId).toBe('synth-a');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects malformed ci95 intervals and parses CLI flags cleanly', () => {
    expect(() =>
      extractModelForestEntry({
        runId: 'bad',
        report: {
          analysis: {
            comparisons: {
              C_vs_A: { n: 10, primary: { meanDifference: 0.1, ci95: [0.1] } },
            },
          },
        },
      })
    ).toThrow(/Invalid ci95/i);

    const parsed = parseForestCliArgs([
      '--input',
      'nemotron-2=out/analysis-nemotron-2.json:main',
      '--input=nemotron-lightning-full=out/analysis-nemotron-lightning-full.json:exploratory',
      '--out',
      'out/custom-forest.json',
    ]);
    expect(parsed.out).toBe('out/custom-forest.json');
    expect(parsed.specs).toEqual([
      { runId: 'nemotron-2', analysisPath: 'out/analysis-nemotron-2.json', matrixTier: 'main' },
      {
        runId: 'nemotron-lightning-full',
        analysisPath: 'out/analysis-nemotron-lightning-full.json',
        matrixTier: 'exploratory',
      },
    ]);
  });
});
