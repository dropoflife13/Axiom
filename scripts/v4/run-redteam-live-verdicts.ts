// Runs the generated Red-Team probes against the local dashboard and derives
// dashboard telemetry strictly from Vitest's JSON reporter output.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertLoopbackTarget,
  safeLoopbackFetch,
} from '../../src/v4/redteam/loopback-guard.js';

export const LIVE_REDTEAM_TARGET = 'http://127.0.0.1:3000';
export const REDTEAM_PROBE_IDS = ['RT-01', 'RT-02', 'RT-03', 'RT-04', 'RT-05', 'RT-06'] as const;

export type RedTeamProbeId = (typeof REDTEAM_PROBE_IDS)[number];
export type LiveProbeStatus = 'pass' | 'fail';

export interface LiveProbeVerdictSummary {
  readonly probeId: RedTeamProbeId;
  readonly status: LiveProbeStatus;
  readonly passedAssertions: number;
  readonly failedAssertions: number;
  readonly durationMs: number;
  readonly executedAt: string;
}

interface VitestAssertionResult {
  readonly title?: unknown;
  readonly fullName?: unknown;
  readonly status?: unknown;
  readonly duration?: unknown;
}

interface VitestTestResult {
  readonly name?: unknown;
  readonly assertionResults?: readonly VitestAssertionResult[];
  readonly startTime?: unknown;
  readonly endTime?: unknown;
}

interface VitestJsonReport {
  readonly testResults?: readonly VitestTestResult[];
}

export interface RunRedTeamLiveVerdictsOptions {
  readonly rootDir?: string;
  readonly targetBaseUrl?: string;
  readonly timeoutMs?: number;
}

export interface RunRedTeamLiveVerdictsResult {
  readonly exitCode: number;
  readonly reportPath: string;
  readonly summaryPath: string;
  readonly summaries: Readonly<Record<string, LiveProbeVerdictSummary>>;
}

function isProbeId(value: string): value is RedTeamProbeId {
  return (REDTEAM_PROBE_IDS as readonly string[]).includes(value);
}

function extractProbeId(...values: unknown[]): RedTeamProbeId | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const match = value.match(/\b(RT-0[1-6])\b/i);
    const normalized = match?.[1]?.toUpperCase() ?? '';
    if (isProbeId(normalized)) return normalized;
  }
  return null;
}

function toFiniteNonNegativeNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function isLiveAssertion(assertion: VitestAssertionResult): boolean {
  const title = [assertion.title, assertion.fullName]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /verifies defensive invariant against local server/i.test(title);
}

function getExecutedAt(result: VitestTestResult): string | null {
  const endTime = toFiniteNonNegativeNumber(result.endTime);
  const startTime = toFiniteNonNegativeNumber(result.startTime);
  const timestamp = endTime ?? startTime;
  if (timestamp === null) return null;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getDurationMs(result: VitestTestResult, assertions: readonly VitestAssertionResult[]): number {
  const startedAt = toFiniteNonNegativeNumber(result.startTime);
  const endedAt = toFiniteNonNegativeNumber(result.endTime);
  if (startedAt !== null && endedAt !== null && endedAt >= startedAt) {
    return Math.round(endedAt - startedAt);
  }

  return Math.round(assertions.reduce((total, assertion) => {
    const duration = toFiniteNonNegativeNumber(assertion.duration);
    return total + (duration ?? 0);
  }, 0));
}

/**
 * Extracts complete live-probe verdicts from Vitest's JSON reporter document.
 * Incomplete, skipped, or malformed probe entries are deliberately omitted so
 * callers fall back to staged quarantine rather than inventing a verdict.
 */
export function parseVitestLiveProbeSummaries(
  report: unknown
): Readonly<Record<string, LiveProbeVerdictSummary>> {
  if (!report || typeof report !== 'object') return {};
  const testResults = (report as VitestJsonReport).testResults;
  if (!Array.isArray(testResults)) return {};

  const summaries: Record<string, LiveProbeVerdictSummary> = {};
  for (const result of testResults) {
    if (!result || typeof result !== 'object') continue;
    const assertions: readonly VitestAssertionResult[] = Array.isArray(result.assertionResults)
      ? result.assertionResults
      : [];
    const probeId = extractProbeId(
      result.name,
      ...assertions.flatMap((assertion) => [assertion.title, assertion.fullName])
    );
    const executedAt = getExecutedAt(result);
    const liveAssertions = assertions.filter(isLiveAssertion);

    // A complete live run must include exactly one completed network assertion.
    // This avoids treating the local guard-only assertion as a live PASS.
    if (!probeId || !executedAt || liveAssertions.length !== 1) continue;

    const statuses = assertions.map((assertion) => assertion.status);
    if (statuses.some((status) => status !== 'passed' && status !== 'failed')) continue;

    const passedAssertions = statuses.filter((status) => status === 'passed').length;
    const failedAssertions = statuses.filter((status) => status === 'failed').length;
    const liveStatus = liveAssertions[0].status;
    if (liveStatus !== 'passed' && liveStatus !== 'failed') continue;

    summaries[probeId] = {
      probeId,
      // A failed guard assertion must not be hidden by a passed live assertion.
      status: failedAssertions > 0 ? 'fail' : 'pass',
      passedAssertions,
      failedAssertions,
      durationMs: getDurationMs(result, assertions),
      executedAt,
    };
  }

  return summaries;
}

function runVitestLiveProbes(rootDir: string): Promise<number> {
  const vitestArgs = [
    'vitest',
    'run',
    'tests/v4/redteam/generated',
    '--reporter=json',
    '--outputFile=.axiom-state/redteam-v1/probe-results.json',
  ];
  const isWindows = process.platform === 'win32';
  // Run the fixed command through cmd.exe on Windows because Node cannot
  // directly spawn the npx.cmd shim from this tsx process (spawn EINVAL).
  // The command string is entirely static: no target, path, or user input is
  // interpolated into it.
  const command = isWindows ? process.env.ComSpec ?? 'cmd.exe' : 'npx';
  const args = isWindows ? ['/d', '/s', '/c', ['npx', ...vitestArgs].join(' ')] : vitestArgs;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        AXIOM_REDTEAM_LIVE: '1',
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Executes generated probes only after a loopback-only preflight. Both this
 * preflight and the generated probes use safeLoopbackFetch(), which enforces
 * assertLoopbackTarget() and redirect: 'manual'.
 */
export async function runRedTeamLiveVerdicts(
  options: RunRedTeamLiveVerdictsOptions = {}
): Promise<RunRedTeamLiveVerdictsResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const targetBaseUrl = options.targetBaseUrl ?? LIVE_REDTEAM_TARGET;
  const target = assertLoopbackTarget(targetBaseUrl);
  if (target.origin !== LIVE_REDTEAM_TARGET) {
    throw new Error(`Live Red-Team target must be ${LIVE_REDTEAM_TARGET}.`);
  }

  const stateDir = path.join(rootDir, '.axiom-state', 'redteam-v1');
  const reportPath = path.join(stateDir, 'probe-results.json');
  const summaryPath = path.join(stateDir, 'probe-results-summary.json');
  fs.mkdirSync(stateDir, { recursive: true });
  // Do not expose a stale verdict when this invocation cannot obtain new JSON.
  fs.rmSync(reportPath, { force: true });
  fs.rmSync(summaryPath, { force: true });

  // This is intentionally a connectivity check only. It cannot create a
  // PASS/FAIL verdict; those are derived exclusively below from Vitest JSON.
  await safeLoopbackFetch(target.toString(), {
    method: 'HEAD',
    timeoutMs: options.timeoutMs ?? 5_000,
  });

  const exitCode = await runVitestLiveProbes(rootDir);
  if (!fs.existsSync(reportPath)) {
    return { exitCode, reportPath, summaryPath, summaries: {} };
  }

  let summaries: Readonly<Record<string, LiveProbeVerdictSummary>> = {};
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as unknown;
    summaries = parseVitestLiveProbeSummaries(report);
    fs.writeFileSync(summaryPath, `${JSON.stringify(summaries, null, 2)}\n`, 'utf8');
  } catch {
    // A malformed reporter artifact is treated exactly like an absent artifact:
    // no summary file, and therefore staged quarantine in the dashboard.
    fs.rmSync(summaryPath, { force: true });
  }

  return { exitCode, reportPath, summaryPath, summaries };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('run-redteam-live-verdicts.ts');

if (isEntrypoint) {
  runRedTeamLiveVerdicts()
    .then((result) => {
      console.log(
        `[redteam-live-verdicts] exit=${result.exitCode} summaries=${Object.keys(result.summaries).length} report=${result.reportPath}`
      );
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
