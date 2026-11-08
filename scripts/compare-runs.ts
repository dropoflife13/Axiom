import fs from 'node:fs';
import path from 'node:path';
import { analyzeTrials, type Trial } from './analyze-ablation-v2.js';

export interface RunSummary {
  path: string;
  label: string;
  model?: string;
  gitCommit?: string;
  trialsCount: number;
}

export interface ContrastComparison {
  contrast: string;
  runA: {
    meanDifference: number;
    ci95: [number, number];
  };
  runB: {
    meanDifference: number;
    ci95: [number, number];
  };
  signAgrees: boolean;
  bothExcludeZero: boolean;
}

export interface CompareRunsResult {
  runA: RunSummary;
  runB: RunSummary;
  contrasts: ContrastComparison[];
  allSignsAgree: boolean;
  allContrastsAgreeAndExcludeZero: boolean;
  exploratoryNote: string;
}

export function resolveRunPath(input: string, root = path.resolve('.')): string {
  const directPath = path.resolve(input);
  if (fs.existsSync(directPath)) return directPath;

  const candidatePaths = [
    path.join(root, '.axiom-state', 'runs', input, 'checkpoint.json'),
    path.join(root, '.axiom-state', 'runs', input, 'results.json'),
    path.join(root, 'out', 'archive', `run-${input}`, 'ablation-v2-checkpoint.json'),
    path.join(root, 'out', 'archive', `run-${input}`, 'ablation-v2-results.json'),
    path.join(root, 'out', 'archive', `run-${input}`, 'checkpoint.json'),
    path.join(root, 'out', 'archive', `run-${input}`, 'results.json'),
    ...(input === 'nemotron-1'
      ? [
          path.join(root, '.axiom-state', 'ablation-v2-checkpoint.json'),
          path.join(root, '.axiom-state', 'ablation-v2-results.json'),
        ]
      : []),
  ];

  for (const cand of candidatePaths) {
    if (fs.existsSync(cand)) return cand;
  }

  throw new Error(`Cannot resolve run path for "${input}". Looked at: ${candidatePaths.join(', ')}`);
}

function loadRunData(runPath: string, defaultLabel: string): { trials: Trial[]; summary: RunSummary } {
  const raw = fs.readFileSync(runPath, 'utf8');
  const parsed = JSON.parse(raw);
  const trials: Trial[] = Array.isArray(parsed)
    ? parsed
    : (parsed.trials ?? []);

  const meta = parsed.metadata ?? parsed.runMetadata ?? {};
  const model = meta.requestedModel ?? parsed.requestedModel ?? parsed.model ?? (trials[0]?.requestedModel);
  const gitCommit = meta.gitCommit ?? parsed.gitCommit;

  return {
    trials,
    summary: {
      path: runPath,
      label: defaultLabel,
      model,
      gitCommit,
      trialsCount: trials.length,
    },
  };
}

export function compareRuns(
  runAInput: string,
  runBInput: string,
  root = path.resolve('.')
): CompareRunsResult {
  const pathA = resolveRunPath(runAInput, root);
  const pathB = resolveRunPath(runBInput, root);

  const { trials: trialsA, summary: summaryA } = loadRunData(pathA, runAInput);
  const { trials: trialsB, summary: summaryB } = loadRunData(pathB, runBInput);

  const analysisA = analyzeTrials(trialsA);
  const analysisB = analyzeTrials(trialsB);

  const baselines = ['A', 'B', 'C0', 'D'] as const;
  const contrasts: ContrastComparison[] = [];

  for (const baseline of baselines) {
    const key = `C_vs_${baseline}`;
    const compA = analysisA.comparisons[key];
    const compB = analysisB.comparisons[key];

    if (!compA || !compB) {
      throw new Error(`Missing comparison "${key}" in analysis.`);
    }

    const meanA = compA.primary.meanDifference;
    const ciA = (compA.primary.ci95 ?? compA.primary.confidenceInterval95) as [number, number];
    const meanB = compB.primary.meanDifference;
    const ciB = (compB.primary.ci95 ?? compB.primary.confidenceInterval95) as [number, number];

    const signA = Math.sign(meanA);
    const signB = Math.sign(meanB);
    const signAgrees = signA === signB && signA !== 0;

    const aExcludesZero = (ciA[0] > 0 && ciA[1] > 0) || (ciA[0] < 0 && ciA[1] < 0);
    const bExcludesZero = (ciB[0] > 0 && ciB[1] > 0) || (ciB[0] < 0 && ciB[1] < 0);
    const bothExcludeZero = signAgrees && aExcludesZero && bExcludesZero;

    contrasts.push({
      contrast: key,
      runA: { meanDifference: meanA, ci95: ciA },
      runB: { meanDifference: meanB, ci95: ciB },
      signAgrees,
      bothExcludeZero,
    });
  }

  const allSignsAgree = contrasts.every((c) => c.signAgrees);
  const allContrastsAgreeAndExcludeZero = contrasts.every((c) => c.bothExcludeZero);

  return {
    runA: summaryA,
    runB: summaryB,
    contrasts,
    allSignsAgree,
    allContrastsAgreeAndExcludeZero,
    exploratoryNote: 'Exploratory comparison across runs; no pooled statistical test performed.',
  };
}

export function formatComparisonTable(result: CompareRunsResult): string {
  const lines: string[] = [];
  lines.push('# Ablation Multi-Run Comparison (Exploratory)');
  lines.push('');
  lines.push(`> Note: ${result.exploratoryNote}`);
  lines.push('');
  lines.push(`- **Run A**: ${result.runA.label} (${result.runA.model ?? 'unknown model'}, ${result.runA.trialsCount} trials)`);
  lines.push(`  Path: \`${result.runA.path}\``);
  lines.push(`- **Run B**: ${result.runB.label} (${result.runB.model ?? 'unknown model'}, ${result.runB.trialsCount} trials)`);
  lines.push(`  Path: \`${result.runB.path}\``);
  lines.push('');
  lines.push('| Contrast | Run A Mean Diff [95% CI] | Run B Mean Diff [95% CI] | Sign Agrees? | Both Exclude Zero? |');
  lines.push('|:---|:---:|:---:|:---:|:---:|');

  for (const c of result.contrasts) {
    const meanAStr = `${c.runA.meanDifference >= 0 ? '+' : ''}${c.runA.meanDifference.toFixed(4)}`;
    const ciAStr = `[${c.runA.ci95[0].toFixed(4)}, ${c.runA.ci95[1].toFixed(4)}]`;
    const meanBStr = `${c.runB.meanDifference >= 0 ? '+' : ''}${c.runB.meanDifference.toFixed(4)}`;
    const ciBStr = `[${c.runB.ci95[0].toFixed(4)}, ${c.runB.ci95[1].toFixed(4)}]`;

    lines.push(
      `| ${c.contrast} | ${meanAStr} ${ciAStr} | ${meanBStr} ${ciBStr} | ${c.signAgrees ? 'Yes' : 'No'} | ${c.bothExcludeZero ? 'Yes' : 'No'} |`
    );
  }

  lines.push('');
  lines.push(`- Overall sign agreement across all 4 contrasts: **${result.allSignsAgree ? 'YES' : 'NO'}**`);
  lines.push(`- All 4 contrasts agree in sign and exclude zero: **${result.allContrastsAgreeAndExcludeZero ? 'YES' : 'NO'}**`);

  return lines.join('\n');
}

function parseCliArgs(argv: string[]): { runA?: string; runB?: string } {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run-a' || arg === '--run1') {
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags.runA = argv[++i];
    } else if (arg.startsWith('--run-a=') || arg.startsWith('--run1=')) {
      flags.runA = arg.split('=')[1];
    } else if (arg === '--run-b' || arg === '--run2') {
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags.runB = argv[++i];
    } else if (arg.startsWith('--run-b=') || arg.startsWith('--run2=')) {
      flags.runB = arg.split('=')[1];
    } else if (!arg.startsWith('--')) {
      positionals.push(arg);
    }
  }

  return {
    runA: flags.runA ?? positionals[0],
    runB: flags.runB ?? positionals[1],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('compare-runs.ts')) {
  const { runA, runB } = parseCliArgs(process.argv.slice(2));
  if (!runA || !runB) {
    console.error('Usage: tsx scripts/compare-runs.ts <runA> <runB> or --run-a <runA> --run-b <runB>');
    process.exit(1);
  }

  try {
    const result = compareRuns(runA, runB);
    console.log(formatComparisonTable(result));
  } catch (err: any) {
    console.error(`Comparison failed: ${err.message}`);
    process.exit(1);
  }
}
