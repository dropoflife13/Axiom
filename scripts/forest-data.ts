import fs from 'node:fs';
import path from 'node:path';

export const FOREST_CONTRASTS = ['C_vs_A', 'C_vs_B', 'C_vs_C0', 'C_vs_D'] as const;
export type ForestContrastKey = (typeof FOREST_CONTRASTS)[number];

export interface ForestContrastPoint {
  contrast: ForestContrastKey;
  n: number;
  meanDifference: number;
  ci95: [number, number];
  excludesZero: boolean;
  signFlipPValue: number | null;
  holmPrimaryPValue: number | null;
}

export interface ForestModelEntry {
  runId: string;
  label: string;
  model: string;
  returnedModel: string;
  provider: string;
  provenanced: boolean;
  matrixTier: 'main' | 'exploratory';
  contrasts: ForestContrastPoint[];
}

export interface ForestDataReport {
  generatedAt: string;
  exploratory: true;
  pooled: false;
  note: string;
  models: ForestModelEntry[];
}

export interface ForestInputSpec {
  runId: string;
  analysisPath: string;
  label?: string;
  matrixTier?: 'main' | 'exploratory';
}

export interface ForestReportInput {
  runId: string;
  label?: string;
  matrixTier?: 'main' | 'exploratory';
  report: any;
}

function ciExcludesZero(ci95: [number, number]): boolean {
  return (ci95[0] > 0 && ci95[1] > 0) || (ci95[0] < 0 && ci95[1] < 0);
}

function resolveProvenanceString(report: any, field: string, fallback = 'unknown'): string {
  const direct = report?.provenance?.[field] ?? report?.[field];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  const distinct = report?.provenance?.distinctValues?.[field];
  if (Array.isArray(distinct) && distinct.length > 0) {
    return distinct.join(', ');
  }
  return fallback;
}

/**
 * Extracts per-contrast descriptive mean differences and 95% bootstrap CIs
 * for a single model's analyze-ablation-v2 JSON report.
 */
export function extractModelForestEntry(input: ForestReportInput): ForestModelEntry {
  const { runId, label, matrixTier, report } = input;
  const comparisons = report?.analysis?.comparisons ?? report?.comparisons ?? {};
  const holmPrimary = report?.analysis?.holmPrimaryPValues ?? report?.holmPrimaryPValues ?? {};

  const contrasts: ForestContrastPoint[] = [];
  for (const key of FOREST_CONTRASTS) {
    const comp = comparisons[key];
    if (!comp?.primary) continue;
    const rawCi = comp.primary.ci95 ?? comp.primary.confidenceInterval95;
    if (!Array.isArray(rawCi) || rawCi.length !== 2) {
      throw new Error(`Invalid ci95 for ${runId} contrast ${key}`);
    }
    const ci95: [number, number] = [Number(rawCi[0]), Number(rawCi[1])];
    const meanDifference = Number(comp.primary.meanDifference);
    const n = Number(comp.n ?? comp.primary.n ?? 0);
    const signFlipPValue =
      typeof comp.primary.signFlipPValue === 'number' ? comp.primary.signFlipPValue : null;
    const holmPrimaryPValue =
      typeof holmPrimary[key] === 'number' ? holmPrimary[key] : null;

    contrasts.push({
      contrast: key,
      n,
      meanDifference,
      ci95,
      excludesZero: ciExcludesZero(ci95),
      signFlipPValue,
      holmPrimaryPValue,
    });
  }

  return {
    runId,
    label: label ?? runId,
    model: resolveProvenanceString(report, 'requestedModel'),
    returnedModel: resolveProvenanceString(report, 'returnedModel'),
    provider: resolveProvenanceString(report, 'provider'),
    provenanced: Boolean(report?.provenanced),
    matrixTier: matrixTier ?? 'main',
    contrasts,
  };
}

/**
 * Combines per-model analyzer summaries into a single descriptive JSON payload
 * for forest plotting. Strictly never computes pooled or meta-analytic estimates.
 */
export function buildForestData(inputs: ForestReportInput[]): ForestDataReport {
  return {
    generatedAt: new Date().toISOString(),
    exploratory: true,
    pooled: false,
    note: 'Descriptive per-model forest plot data extracted from committed analyzer outputs only. Cross-model pooling is intentionally omitted.',
    models: inputs.map((item) => extractModelForestEntry(item)),
  };
}

/**
 * Loads analyzer JSON files from disk, builds the descriptive forest-plot payload,
 * and writes it to `outPath`.
 */
export function writeForestData(
  specs: ForestInputSpec[],
  outPath = path.resolve('out/forest-data.json')
): ForestDataReport {
  const loaded: ForestReportInput[] = specs.map((spec) => {
    const resolved = path.resolve(spec.analysisPath);
    const report = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return {
      runId: spec.runId,
      label: spec.label,
      matrixTier: spec.matrixTier,
      report,
    };
  });
  const data = buildForestData(loaded);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(data, null, 2) + '\n', 'utf8');
  return data;
}

export function parseForestCliArgs(argv: string[]): {
  specs: ForestInputSpec[];
  out: string;
} {
  const specs: ForestInputSpec[] = [];
  let out = 'out/forest-data.json';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      out = argv[++i];
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg === '--input' && argv[i + 1]) {
      specs.push(parseInputSpec(argv[++i]));
    } else if (arg.startsWith('--input=')) {
      specs.push(parseInputSpec(arg.slice('--input='.length)));
    }
  }

  return { specs, out };
}

function parseInputSpec(raw: string): ForestInputSpec {
  // Format: runId=path[:tier] or path
  const eqIdx = raw.indexOf('=');
  if (eqIdx > 0) {
    const runId = raw.slice(0, eqIdx).trim();
    const rest = raw.slice(eqIdx + 1).trim();
    const tierMatch = rest.match(/^(.*):(main|exploratory)$/);
    if (tierMatch) {
      return {
        runId,
        analysisPath: tierMatch[1],
        matrixTier: tierMatch[2] as 'main' | 'exploratory',
      };
    }
    return { runId, analysisPath: rest };
  }
  const base = path.basename(raw, '.json').replace(/^analysis-/, '');
  return { runId: base, analysisPath: raw };
}

function discoverDefaultSpecs(outDir = path.resolve('out')): ForestInputSpec[] {
  if (!fs.existsSync(outDir)) return [];
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^analysis-.*\.json$/i.test(f))
    .sort();
  return files.map((file) => {
    const runId = file.replace(/^analysis-/i, '').replace(/\.json$/i, '');
    return {
      runId,
      analysisPath: path.join(outDir, file),
      matrixTier: runId.includes('lightning') ? 'exploratory' : 'main',
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('forest-data.ts')) {
  const { specs, out } = parseForestCliArgs(process.argv.slice(2));
  const resolvedSpecs = specs.length > 0 ? specs : discoverDefaultSpecs();
  if (resolvedSpecs.length === 0) {
    throw new Error('No analyzer outputs found. Provide --input <runId>=<analysis.json>.');
  }
  const data = writeForestData(resolvedSpecs, out);
  console.log(`Wrote ${path.resolve(out)} (${data.models.length} model(s), pooled=${data.pooled})`);
}
