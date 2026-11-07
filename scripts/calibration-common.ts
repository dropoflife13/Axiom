import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FACTS, FACT_STATEMENTS, getApplicableFacts } from './facts.js';
import { deriveTaskFlags, type DerivedTaskFlags } from './propose-task-repair.js';
import type { FeatureFlags } from '../src/memory.js';

export interface CalibrationTask {
  id: string;
  split: 'train' | 'dev' | 'test';
  cohortId: string;
  table: string;
  prompt: string;
  features: FeatureFlags;
  boundFacts: string[];
  applicableFacts?: string[];
  goldenSql: string;
}

export interface CalibrationTaskResult {
  taskId: string;
  cohortId?: string;
  table?: string;
  features?: FeatureFlags;
  derivedFlags: DerivedTaskFlags;
  boundFacts?: string[];
  boundPassed?: boolean;
  boundPassedFacts?: string[];
  boundFailedFacts?: string[];
  boundFactFraction?: number;
  tableMissing?: boolean;
  migrationExitNonZero?: boolean;
  pass?: boolean;
  applicableFactCount?: number;
  passedFactCount?: number;
  factPassRate?: number;
  fromCache?: boolean;
  failedFacts: string[];
  applicableFacts: string[];
  promptTokens: number;
  totalTokens: number;
  requestedModel: string;
  returnedModel: string;
  finishReason?: string;
  latencyMs?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  generatedSql?: string;
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function canonicalizeValue(value: unknown, stripBoundFacts: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item, stripBoundFacts));
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((key) => !(stripBoundFacts && key === 'boundFacts'))
      .sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalizeValue(obj[key], stripBoundFacts);
    }
    return out;
  }
  return value;
}

/**
 * Computes the SHA-256 of canonical JSON of `tasks.json` with every task's `boundFacts` removed.
 * Accepts either a file path to `tasks.json` or an in-memory parsed tasks object.
 */
export function computeTaskContentSha256(
  tasksOrPath: string | Record<string, unknown> = path.resolve('fixtures/task-v2/tasks.json')
): string {
  const parsed =
    typeof tasksOrPath === 'string'
      ? (JSON.parse(fs.readFileSync(tasksOrPath, 'utf8')) as Record<string, unknown>)
      : tasksOrPath;
  const canonical = canonicalizeValue(parsed, true);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Verifies that a calibration object's `taskContentSha256` matches the canonical content hash
 * of `tasks.json` (ignoring `boundFacts`-only changes).
 */
export function assertTaskContentSha256Matches(
  calibration: { taskContentSha256?: string },
  tasksOrPath: string | Record<string, unknown> = path.resolve('fixtures/task-v2/tasks.json'),
  label = 'Calibration'
): void {
  const actual = computeTaskContentSha256(tasksOrPath);
  if (!calibration.taskContentSha256 || !calibration.taskContentSha256.trim()) {
    throw new Error(`${label} is missing taskContentSha256 provenance.`);
  }
  if (calibration.taskContentSha256 !== actual) {
    throw new Error(
      `${label} taskContentSha256 mismatch: calibration=${calibration.taskContentSha256} current=${actual}`
    );
  }
}

/**
 * Returns true if a repo-relative path belongs to the guarded source/fixture/spec/config surface:
 *   src/, scripts/, fixtures/, docs/spec/, package.json, package-lock.json, tsconfig*.json
 * Explicitly ignores out/, .axiom-state/, and .axiom-cache/.
 */
export function isGuardedDirtyPath(rawPath: string): boolean {
  const normalized = rawPath
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  if (!normalized) return false;

  if (
    normalized === 'out' ||
    normalized.startsWith('out/') ||
    normalized === '.axiom-state' ||
    normalized.startsWith('.axiom-state/') ||
    normalized === '.axiom-cache' ||
    normalized.startsWith('.axiom-cache/')
  ) {
    return false;
  }

  if (
    normalized === 'src' ||
    normalized.startsWith('src/') ||
    normalized === 'scripts' ||
    normalized.startsWith('scripts/') ||
    normalized === 'fixtures' ||
    normalized.startsWith('fixtures/') ||
    normalized === 'docs/spec' ||
    normalized.startsWith('docs/spec/')
  ) {
    return true;
  }

  if (
    normalized === 'package.json' ||
    normalized === 'package-lock.json' ||
    /^tsconfig[^/]*\.json$/.test(normalized)
  ) {
    return true;
  }

  return false;
}

/**
 * Parses `git status --porcelain` output and returns the list of modified, staged, or untracked
 * paths that fall within the guarded scope.
 */
export function parseGuardedDirtyPaths(porcelainOutput: string): string[] {
  const offending: string[] = [];
  for (const rawLine of porcelainOutput.split(/\r?\n/)) {
    if (!rawLine || rawLine.length < 4) continue;
    const pathPart = rawLine.slice(3).trim();
    if (!pathPart) continue;
    const candidates = pathPart.includes(' -> ')
      ? pathPart.split(' -> ').map((p) => p.trim())
      : [pathPart];
    for (const candidate of candidates) {
      if (isGuardedDirtyPath(candidate)) {
        offending.push(candidate.replace(/\\/g, '/'));
      }
    }
  }
  return offending;
}

export interface DirtyTreeGuardOptions {
  allowDirty?: boolean;
  cwd?: string;
  context?: string;
  gitStatus?: () => string;
}

/**
 * Shared dirty-tree guard for ablation, calibration, and bound-fact application scripts.
 * Fails only on modified, staged, or untracked files under src/, scripts/, fixtures/, docs/spec/,
 * package.json, package-lock.json, and tsconfig*.json; ignores out/, .axiom-state/, and .axiom-cache/.
 */
export function assertScopedCleanGitTree(options: DirtyTreeGuardOptions = {}): void {
  if (options.allowDirty) return;
  const getStatus =
    options.gitStatus ??
    (() =>
      execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: options.cwd ?? path.resolve('.'),
        encoding: 'utf8',
      }));
  const raw = getStatus();
  const dirtyPaths = parseGuardedDirtyPaths(raw);
  if (dirtyPaths.length > 0) {
    const label = options.context ?? 'operation';
    throw new Error(
      `Refusing ${label} with a dirty git tree (${dirtyPaths.join(', ')}); pass --allow-dirty explicitly.`
    );
  }
}

export function loadTasksFile(filePath = path.resolve('fixtures/task-v2/tasks.json')): {
  train: CalibrationTask[];
  dev: CalibrationTask[];
  test: CalibrationTask[];
} {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    train: CalibrationTask[];
    dev: CalibrationTask[];
    test: CalibrationTask[];
  };
}

export function deriveCalibrationFlags(
  task: Pick<CalibrationTask, 'features' | 'prompt' | 'goldenSql'>
): DerivedTaskFlags {
  return deriveTaskFlags({
    features: {
      tenant: Boolean(task.features.tenant),
      append_only: Boolean(task.features.append_only),
      ingestion: Boolean(task.features.ingestion),
    },
    prompt: task.prompt,
    goldenSql: task.goldenSql,
  });
}

export function derivedApplicableFacts(
  task: Pick<CalibrationTask, 'features' | 'prompt' | 'goldenSql'>
): string[] {
  const flags = deriveCalibrationFlags(task);
  return getApplicableFacts({ ...flags });
}

export function emptyFactStats(): Record<
  string,
  { applicableCount: number; failedCount: number; passedCount: number; passRate: number }
> {
  return Object.fromEntries(
    FACTS.map((fact) => [
      fact.id,
      { applicableCount: 0, failedCount: 0, passedCount: 0, passRate: 0 },
    ])
  );
}

export function updateFactStats(
  stats: ReturnType<typeof emptyFactStats>,
  result: Pick<CalibrationTaskResult, 'failedFacts' | 'applicableFacts'>
): void {
  const failed = new Set(result.failedFacts);
  for (const factId of result.applicableFacts) {
    const item = stats[factId];
    if (!item) continue;
    item.applicableCount++;
    if (failed.has(factId)) item.failedCount++;
    else item.passedCount++;
    item.passRate = item.passedCount / item.applicableCount;
  }
}

export function stableTaskSeed(taskId: string): number {
  return crypto.createHash('sha256').update(taskId).digest().readUInt32BE(0);
}

export function canonicalFactStatement(factId: string): string {
  const statement = FACT_STATEMENTS[factId];
  if (!statement) throw new Error(`Unknown fact ID ${factId}`);
  return statement;
}
