import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { analyzeTrials, type Trial, type Condition } from './analyze-ablation-v2.js';

export interface ExportSnapshotOptions {
  runPath: string;
  analysisPath?: string;
  id: string;
  outPath?: string;
  oraclePath?: string;
  tasksPath?: string;
  factsPath?: string;
  memoryPath?: string;
}

export interface TrialSummary {
  task: string;
  taskId: string;
  condition: string;
  boundFraction: number;
  boundFactFraction: number;
  failedFacts: string[];
  tokens: number;
  totalTokens: number;
  status: 'pass' | 'fail';
  boundPassed: boolean;
}

export interface RunSnapshot {
  id: string;
  runId: string;
  model: string;
  baseUrl: string;
  gitCommit: string;
  commit: string;
  dirty: boolean;
  sha256: {
    oracleTs: string;
    tasksJson: string;
    factsJson: string;
    memoryJson: string;
  };
  conditions: Record<string, unknown>;
  pairedComparisons: Record<string, unknown>;
  perFactPassRates: Record<string, Record<string, number>>;
  failuresByFact: Record<string, Record<string, number>>;
  trials: TrialSummary[];
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  passRate: string;
  generatedAt: string;
  lastModified: string;
}

function computeSha256(filePath: string): string {
  if (!fs.existsSync(filePath)) return 'FILE_NOT_FOUND';
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getGitStatus(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return { commit, dirty: status.length > 0 };
  } catch {
    return { commit: 'unknown', dirty: false };
  }
}

function sanitizeBaseUrl(raw?: string): string {
  if (!raw) return 'unknown';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return raw.replace(/key=[^&]+/gi, 'key=REDACTED');
  }
}

export function buildRunSnapshot(options: ExportSnapshotOptions): RunSnapshot {
  const {
    runPath,
    analysisPath,
    id,
    oraclePath = 'scripts/oracle.ts',
    tasksPath = 'fixtures/task-v2/tasks.json',
    factsPath = 'fixtures/task-v2/facts.json',
    memoryPath = '.axiom-state/memory.json',
  } = options;

  if (!fs.existsSync(runPath)) {
    throw new Error(`Checkpoint file not found at: ${runPath}`);
  }

  // Read Checkpoint
  const rawCheckpoint = fs.readFileSync(runPath, 'utf8');
  const checkpointParsed = JSON.parse(rawCheckpoint);
  const rawTrials: any[] = Array.isArray(checkpointParsed)
    ? checkpointParsed
    : checkpointParsed.trials ?? [];
  const checkpointMetadata = !Array.isArray(checkpointParsed)
    ? checkpointParsed.metadata ?? {}
    : {};

  // Read Analysis if provided and exists
  let analysisParsed: any = null;
  if (analysisPath && fs.existsSync(analysisPath)) {
    try {
      analysisParsed = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    } catch {
      analysisParsed = null;
    }
  }

  // Git and Provenance
  const git = getGitStatus();
  const gitCommit =
    analysisParsed?.gitCommit ||
    checkpointMetadata.gitCommit ||
    rawTrials[0]?.gitCommit ||
    git.commit;
  const commit = typeof gitCommit === 'string' ? gitCommit.slice(0, 7) : 'unknown';
  const dirty =
    typeof analysisParsed?.dirty === 'boolean'
      ? analysisParsed.dirty
      : typeof checkpointMetadata.dirty === 'boolean'
      ? checkpointMetadata.dirty
      : git.dirty;

  const model =
    analysisParsed?.model ||
    checkpointMetadata.model ||
    rawTrials[0]?.returnedModel ||
    rawTrials[0]?.requestedModel ||
    'unknown';

  const baseUrl = sanitizeBaseUrl(
    analysisParsed?.baseUrl || checkpointMetadata.baseUrl || rawTrials[0]?.baseUrl
  );

  // Compute Hashes
  const sha256 = {
    oracleTs:
      analysisParsed?.oracleSha256 ||
      checkpointMetadata.oracleSha256 ||
      computeSha256(path.resolve(process.cwd(), oraclePath)),
    tasksJson:
      analysisParsed?.tasksSha256 ||
      checkpointMetadata.tasksSha256 ||
      computeSha256(path.resolve(process.cwd(), tasksPath)),
    factsJson:
      analysisParsed?.factsSha256 ||
      checkpointMetadata.factsSha256 ||
      computeSha256(path.resolve(process.cwd(), factsPath)),
    memoryJson:
      analysisParsed?.memorySha256AtStart ||
      checkpointMetadata.memorySha256 ||
      computeSha256(path.resolve(process.cwd(), memoryPath)),
  };

  // Run statistical analysis on trials
  const analysis = analyzeTrials(rawTrials as Trial[]);

  // Paired comparisons with Holm-adjusted p-values and cell-level results
  const pairedComparisons: Record<string, unknown> = {};
  for (const baseline of ['A', 'B', 'C0', 'D'] as Condition[]) {
    const key = `C_vs_${baseline}`;
    const comp = analysis.comparisons?.[key] ?? {};
    const holmPrimary = analysis.holmPrimaryPValues?.[key] ?? null;
    const holmSecondary = analysis.holmSecondaryPValues?.[key] ?? null;
    const cellResults = analysis.perCellAnalysis?.comparisons?.[key] ?? null;

    pairedComparisons[key] = {
      ...comp,
      holmPrimaryPValue: holmPrimary,
      holmSecondaryPValue: holmSecondary,
      cellLevelResults: cellResults,
    };
  }

  // Conditions table
  const conditions = analysis.conditions ?? {};

  // Per-fact pass rates & failures by fact per condition
  const conditionsList = ['A', 'B', 'C', 'C0', 'D', 'E_B'];
  const failuresByFact: Record<string, Record<string, number>> = {};
  const perFactPassRates: Record<string, Record<string, number>> = {};

  for (const cond of conditionsList) {
    const cTrials = rawTrials.filter((t) => t.condition === cond);
    const failures: Record<string, number> = {};
    const totalTrialsForCond = cTrials.length || 1;

    for (const t of cTrials) {
      for (const f of t.failedFacts ?? []) {
        failures[f] = (failures[f] ?? 0) + 1;
      }
    }
    failuresByFact[cond] = failures;

    const rates: Record<string, number> = {};
    for (const [factId, count] of Object.entries(failures)) {
      const passed = Math.max(0, totalTrialsForCond - count);
      rates[factId] = Number((passed / totalTrialsForCond).toFixed(4));
    }
    perFactPassRates[cond] = rates;
  }

  // Per-trial summaries (task, condition, bound fraction, failed facts, tokens, status)
  // Strictly EXCLUDE generated SQL, prompts, and secrets
  const trialSummaries: TrialSummary[] = rawTrials.map((t) => {
    const task = String(t.taskId ?? t.task ?? '');
    const condition = String(t.condition ?? '');
    const boundFraction = Number(t.boundFactFraction ?? t.boundFraction ?? 0);
    const failedFacts = Array.isArray(t.failedFacts) ? [...t.failedFacts] : [];
    const tokens = Number(t.totalTokens ?? t.tokens ?? 0);
    const boundPassed = Boolean(t.boundPassed);
    const status: 'pass' | 'fail' = boundPassed ? 'pass' : 'fail';

    return {
      task,
      taskId: task,
      condition,
      boundFraction,
      boundFactFraction: boundFraction,
      failedFacts,
      tokens,
      totalTokens: tokens,
      status,
      boundPassed,
    };
  });

  const passedCount = trialSummaries.filter((t) => t.boundPassed).length;
  const totalCount = trialSummaries.length;
  const passRate = totalCount > 0 ? `${((passedCount / totalCount) * 100).toFixed(1)}%` : '0.0%';

  const now = new Date().toISOString();
  // Get checkpoint file mtime
  let checkpointMtime = now;
  try {
    const stat = fs.statSync(runPath);
    checkpointMtime = stat.mtime.toISOString();
  } catch {
    checkpointMtime = now;
  }

  return {
    id,
    runId: id,
    model,
    baseUrl,
    gitCommit,
    commit,
    dirty,
    sha256,
    conditions,
    pairedComparisons,
    perFactPassRates,
    failuresByFact,
    trials: trialSummaries,
    totalTrials: totalCount,
    passedTrials: passedCount,
    failedTrials: totalCount - passedCount,
    passRate,
    generatedAt: now,
    lastModified: checkpointMtime,
  };
}

export function exportRunSnapshot(options: ExportSnapshotOptions): { snapshot: RunSnapshot; outPath: string } {
  const snapshot = buildRunSnapshot(options);
  const outPath =
    options.outPath ||
    path.resolve(process.cwd(), `dashboard/public/data/run-${options.id}.json`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(`[Axiom Snapshot] Exported snapshot for run "${options.id}" -> ${outPath}`);
  console.log(`[Axiom Snapshot] Total trials: ${snapshot.totalTrials}, Pass Rate: ${snapshot.passRate}, Model: ${snapshot.model}`);

  return { snapshot, outPath };
}

function parseCliArgs(argv: string[]): ExportSnapshotOptions {
  let runPath = '.axiom-state/ablation-v2-checkpoint.json';
  let analysisPath = '.axiom-state/ablation-v2-results.json';
  let id = 'ablation-v2';
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run' && argv[i + 1]) {
      runPath = argv[++i];
    } else if (arg === '--analysis' && argv[i + 1]) {
      analysisPath = argv[++i];
    } else if (arg === '--id' && argv[i + 1]) {
      id = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    }
  }

  return { runPath, analysisPath, id, outPath };
}

if (process.argv[1]?.includes('export-run-snapshot')) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    exportRunSnapshot(opts);
  } catch (err) {
    console.error('[Axiom Snapshot Error]', err);
    process.exit(1);
  }
}
