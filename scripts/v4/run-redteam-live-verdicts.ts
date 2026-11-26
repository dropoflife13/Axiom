// Runs the generated Red-Team probes against the local dashboard and derives
// dashboard telemetry strictly from Vitest's JSON reporter output.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertLoopbackTarget,
  safeLoopbackFetch,
} from '../../src/v4/redteam/loopback-guard.js';
import {
  buildRedTeamFaultInjectionManifest,
  isRedTeamFaultInjectionEnabled,
} from '../../src/v4/redteam/fault-injection.js';

export const LIVE_REDTEAM_TARGET = 'http://127.0.0.1:3000';
export const REDTEAM_PROBE_IDS = [
  'RT-01',
  'RT-02',
  'RT-03',
  'RT-04',
  'RT-05',
  'RT-06',
  'RT-07',
  'RT-08',
  'RT-09',
  'RT-10',
  'RT-11',
  'RT-12',
] as const;

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
    const match = value.match(/\b(RT-(?:0[1-9]|1[0-2]))\b/i);
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

function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

interface ManifestIdentityEntry {
  readonly factId?: unknown;
  readonly id?: unknown;
}

function appendMissingManifestEntries(
  entries: readonly ManifestIdentityEntry[],
  additions: readonly ManifestIdentityEntry[]
): readonly ManifestIdentityEntry[] {
  const existingFactIds = new Set(
    entries
      .map((entry) => entry.factId ?? entry.id)
      .filter((value): value is string => typeof value === 'string')
  );
  return [...entries, ...additions.filter((entry) => !existingFactIds.has(String(entry.factId ?? entry.id)))];
}

/**
 * Adds only staged, read-only RT-07/RT-08 entries to existing local Red-Team
 * telemetry. No canonical rule or domain file is ever written.
 */
export function registerFaultInjectionManifest(stateDir: string, stagedAt?: string): void {
  const candidatesPath = path.join(stateDir, 'quarantine-candidates.json');
  const threatsPath = path.join(stateDir, 'threat-matrix.json');
  const candidatesDoc = readJsonObject(candidatesPath);
  const threatsDoc = readJsonObject(threatsPath);
  const candidates = Array.isArray(candidatesDoc.candidates)
    ? candidatesDoc.candidates.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'
      )
    : null;
  const threats = Array.isArray(threatsDoc.threats)
    ? threatsDoc.threats.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'
      )
    : null;

  if (!candidates || !threats) {
    throw new Error(
      'Fault injection requires existing .axiom-state/redteam-v1 candidate and threat manifests.'
    );
  }

  const manifest = buildRedTeamFaultInjectionManifest(stagedAt);
  const nextCandidates = appendMissingManifestEntries(candidates, manifest.candidates);
  const nextThreats = appendMissingManifestEntries(threats, manifest.threats);

  fs.writeFileSync(
    candidatesPath,
    `${JSON.stringify({ ...candidatesDoc, candidates: nextCandidates }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    threatsPath,
    `${JSON.stringify({ ...threatsDoc, threats: nextThreats }, null, 2)}\n`,
    'utf8'
  );
}

export interface RedTeamMutationProbeThreat {
  readonly id: 'RT-09' | 'RT-10' | 'RT-11' | 'RT-12';
  readonly category:
    | 'authz_idor'
    | 'error_leakage_stack_trace'
    | 'rate_limit_malformed_payload';
  readonly route: string;
  readonly method: 'GET' | 'POST';
  readonly title: string;
  readonly expectedDefense: string;
  readonly severity: 'medium' | 'high';
}

export interface RedTeamMutationProbeCandidate {
  readonly candidateId: string;
  readonly cartridgeId: 'redteam-v1-loopback';
  readonly factId: RedTeamMutationProbeThreat['id'];
  readonly triggerFlag: RedTeamMutationProbeThreat['category'];
  readonly route: string;
  readonly proposedRuleText: string;
  readonly evidenceHashes: readonly [string];
  readonly status: 'staged';
  readonly stagedAt: string;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Builds staged, read-only manifest entries for RT-09 through RT-12.
 * Never mutates canonical rule vaults.
 */
export function buildRedTeamMutationProbeManifest(
  stagedAt = new Date().toISOString()
): {
  readonly threats: readonly RedTeamMutationProbeThreat[];
  readonly candidates: readonly RedTeamMutationProbeCandidate[];
} {
  const threats: readonly RedTeamMutationProbeThreat[] = [
    {
      id: 'RT-09',
      category: 'authz_idor',
      route: '/api/v4-hope',
      method: 'POST',
      title: 'HTTP method tampering on read-only endpoints',
      expectedDefense:
        'Read-only endpoints (/api/v4-hope, /api/v4-hope/redteam, /api/runs) must reject POST, PUT, and DELETE with 405 Method Not Allowed, zero stack traces, and zero 0.0.0.0 redirects.',
      severity: 'medium',
    },
    {
      id: 'RT-10',
      category: 'error_leakage_stack_trace',
      route: '/api/v4-hope/redteam',
      method: 'POST',
      title: 'Malformed JSON, prototype-pollution keys, and mismatched Content-Type handling',
      expectedDefense:
        'Endpoints (/api/v4-hope/redteam, /api/runs) must reject truncated JSON, __proto__ payloads, and text/plain bodies with a clean 4xx status (< 500) and zero SyntaxError stack leakage.',
      severity: 'high',
    },
    {
      id: 'RT-11',
      category: 'rate_limit_malformed_payload',
      route: '/api/v4-hope/redteam',
      method: 'POST',
      title: 'Oversized 256KB payload rejection',
      expectedDefense:
        'POST /api/v4-hope/redteam must reject an oversized 256KB payload quickly with 405, 413, or 400 (< 500) within timeout and zero server crash.',
      severity: 'medium',
    },
    {
      id: 'RT-12',
      category: 'authz_idor',
      route: '/api/ablation-results',
      method: 'GET',
      title: 'Spoofed forwarded host, origin, and proto header non-reflection',
      expectedDefense:
        'Endpoints (/api/ablation-results, /api/portfolio, /api/v4-hope/redteam) must never reflect spoofed X-Forwarded-Host, Origin, or X-Forwarded-Proto values in Location, Access-Control-Allow-Origin, or the response body.',
      severity: 'high',
    },
  ];

  return {
    threats,
    candidates: threats.map((threat) => ({
      candidateId: `Q-RT-${threat.id}`,
      cartridgeId: 'redteam-v1-loopback',
      factId: threat.id,
      triggerFlag: threat.category,
      route: threat.route,
      proposedRuleText: `On ${threat.method} ${threat.route}: ${threat.expectedDefense}`,
      evidenceHashes: [
        sha256Hex(
          JSON.stringify({
            id: threat.id,
            route: threat.route,
            method: threat.method,
            expectedDefense: threat.expectedDefense,
          })
        ),
      ],
      status: 'staged',
      stagedAt,
    })),
  };
}

/**
 * Idempotently registers staged RT-09..RT-12 entries into existing local
 * Red-Team telemetry manifests without mutating canonical vaults.
 */
export function registerMutationProbeManifest(stateDir: string, stagedAt?: string): void {
  const candidatesPath = path.join(stateDir, 'quarantine-candidates.json');
  const threatsPath = path.join(stateDir, 'threat-matrix.json');
  const candidatesDoc = readJsonObject(candidatesPath);
  const threatsDoc = readJsonObject(threatsPath);
  const candidates = Array.isArray(candidatesDoc.candidates)
    ? candidatesDoc.candidates.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'
      )
    : null;
  const threats = Array.isArray(threatsDoc.threats)
    ? threatsDoc.threats.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'
      )
    : null;

  if (!candidates || !threats) {
    return;
  }

  const manifest = buildRedTeamMutationProbeManifest(stagedAt);
  const candidateByFactId = new Map(manifest.candidates.map((c) => [c.factId, c]));
  const seenFactIds = new Set<string>();
  const refreshedCandidates = candidates.map((entry) => {
    const factId = typeof entry.factId === 'string' ? entry.factId : '';
    const replacement = candidateByFactId.get(factId as RedTeamMutationProbeCandidate['factId']);
    if (!replacement) return entry;
    seenFactIds.add(factId);
    const existingStagedAt =
      typeof entry.stagedAt === 'string' && entry.stagedAt.length > 0
        ? entry.stagedAt
        : replacement.stagedAt;
    return { ...replacement, stagedAt: existingStagedAt };
  });
  const nextCandidates = [
    ...refreshedCandidates,
    ...manifest.candidates.filter((c) => !seenFactIds.has(c.factId)),
  ];

  const threatById = new Map(manifest.threats.map((t) => [t.id, t]));
  const seenThreatIds = new Set<string>();
  const refreshedThreats = threats.map((entry) => {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const replacement = threatById.get(id as RedTeamMutationProbeThreat['id']);
    if (!replacement) return entry;
    seenThreatIds.add(id);
    return replacement;
  });
  const nextThreats = [
    ...refreshedThreats,
    ...manifest.threats.filter((t) => !seenThreatIds.has(t.id)),
  ];

  fs.writeFileSync(
    candidatesPath,
    `${JSON.stringify({ ...candidatesDoc, candidates: nextCandidates }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    threatsPath,
    `${JSON.stringify({ ...threatsDoc, threats: nextThreats }, null, 2)}\n`,
    'utf8'
  );
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
  registerMutationProbeManifest(stateDir);
  if (isRedTeamFaultInjectionEnabled()) {
    registerFaultInjectionManifest(stateDir);
  }
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
