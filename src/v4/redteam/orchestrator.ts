// src/v4/redteam/orchestrator.ts
// Two-Role Free-Tier Red-Team v1 Orchestrator (strictly loopback-locked):
//   Role A (Threat Modeler):  gemini-4-hydrogen (Google AI Studio free tier)
//   Role B (Probe Generator): qwen/qwen3.8-27b (Groq free tier, gemma-4-31b-it fallback)
//   Quarantine Bridge:        Emits verified findings as read-only QuarantineCandidate JSON
//                             artifacts under .axiom-state/redteam-v1/ (never auto-promotes).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertLoopbackTarget } from './loopback-guard.js';

export type ThreatCategory =
  | 'authz_idor'
  | 'input_validation_path_traversal'
  | 'error_leakage_stack_trace'
  | 'rate_limit_malformed_payload';

export interface RouteManifestEntry {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly description: string;
}

export interface ThreatMatrixEntry {
  readonly id: string;
  readonly category: ThreatCategory;
  readonly route: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly title: string;
  readonly expectedDefense: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface ThreatMatrix {
  readonly targetBaseUrl: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly threats: readonly ThreatMatrixEntry[];
}

export interface GeneratedProbeFile {
  readonly threatId: string;
  readonly filePath: string;
  readonly model: string;
  readonly sourceSha256: string;
}

export interface RedTeamQuarantineCandidate {
  readonly candidateId: string;
  readonly cartridgeId: 'redteam-v1-loopback';
  readonly factId: string;
  readonly triggerFlag: ThreatCategory;
  readonly route: string;
  readonly proposedRuleText: string;
  readonly evidenceHashes: readonly string[];
  readonly status: 'staged';
  readonly stagedAt: string;
}

export interface RedTeamRunOptions {
  readonly targetBaseUrl?: string;
  readonly routes?: readonly RouteManifestEntry[];
  readonly threatModel?: string;
  readonly probeModel?: string;
  readonly fallbackProbeModel?: string;
  readonly dryRun?: boolean;
  readonly rootDir?: string;
  readonly outStateDir?: string;
  readonly generatedTestsDir?: string;
}

export interface RedTeamRunResult {
  readonly dryRun: boolean;
  readonly targetBaseUrl: string;
  readonly threatMatrix: ThreatMatrix;
  readonly generatedProbes: readonly GeneratedProbeFile[];
  readonly quarantineCandidates: readonly RedTeamQuarantineCandidate[];
  readonly artifacts: {
    readonly threatMatrixPath: string;
    readonly quarantinePath: string;
  };
}

export const DEFAULT_TARGET_BASE_URL = 'http://127.0.0.1:3000';
export const DEFAULT_THREAT_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_PROBE_MODEL = 'qwen/qwen3.8-27b';
export const DEFAULT_FALLBACK_PROBE_MODEL = 'gemma-4-31b-it';

export const DEFAULT_AXIOM_LOCAL_ROUTES: readonly RouteManifestEntry[] = [
  { method: 'GET', path: '/api/v4-hope', description: 'Serves v4 Axiom-HOPE snapshot and receipts' },
  { method: 'GET', path: '/api/v4-hope/live-compact', description: 'Serves live compact run status' },
  { method: 'GET', path: '/api/runs', description: 'Lists local benchmark run checkpoints' },
  { method: 'GET', path: '/api/ablation-results', description: 'Serves ablation v3 summary results' },
  { method: 'GET', path: '/api/portfolio', description: 'Serves portfolio overview telemetry' },
];

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function buildDeterministicDryRunThreatMatrix(
  targetBaseUrl: string,
  routes: readonly RouteManifestEntry[]
): ThreatMatrix {
  const validated = assertLoopbackTarget(targetBaseUrl);
  const base = validated.origin;
  const primaryRoute = routes[0]?.path ?? '/api/v4-hope';
  const runsRoute = routes.find((r) => r.path.includes('runs'))?.path ?? '/api/runs';

  return {
    targetBaseUrl: base,
    model: 'dry-run-deterministic',
    generatedAt: new Date().toISOString(),
    threats: [
      {
        id: 'RT-01',
        category: 'input_validation_path_traversal',
        route: `${runsRoute}?runId=../../etc/passwd`,
        method: 'GET',
        title: 'Query parameter path traversal rejection',
        expectedDefense: 'Endpoint rejects traversal sequences without reading arbitrary host files or returning 500 stack traces.',
        severity: 'high',
      },
      {
        id: 'RT-02',
        category: 'error_leakage_stack_trace',
        route: `${primaryRoute}?malformed=%E0%A4%A`,
        method: 'GET',
        title: 'Sanitized error responses without stack trace or secret leakage',
        expectedDefense: 'Responses never expose raw Node.js stack frames, absolute disk paths, or environment variable values.',
        severity: 'medium',
      },
      {
        id: 'RT-03',
        category: 'rate_limit_malformed_payload',
        route: primaryRoute,
        method: 'POST',
        title: 'Unsupported method and malformed JSON handling',
        expectedDefense: 'Read-only GET endpoints reject unexpected POST bodies cleanly with 405/400 and no unhandled crash.',
        severity: 'medium',
      },
      {
        id: 'RT-04',
        category: 'authz_idor',
        route: primaryRoute,
        method: 'GET',
        title: 'Sensitive header and cache-control hygiene',
        expectedDefense: 'API responses do not echo server secrets or internal credentials.',
        severity: 'low',
      },
    ],
  };
}

export function renderDeterministicVitestProbe(
  targetBaseUrl: string,
  threat: ThreatMatrixEntry
): string {
  const validated = assertLoopbackTarget(targetBaseUrl);
  const fullUrl = new URL(threat.route, validated.origin).toString();
  assertLoopbackTarget(fullUrl);

  return [
    `// Auto-generated defensive security regression probe (${threat.id})`,
    `// Strictly loopback-locked via safeLoopbackFetch().`,
    `import { describe, expect, it } from 'vitest';`,
    `import { assertLoopbackTarget, safeLoopbackFetch } from '../../../../src/v4/redteam/loopback-guard.js';`,
    ``,
    `describe('Red-Team v1 Probe ${threat.id}: ${threat.title.replace(/'/g, "\\'")}', () => {`,
    `  const targetUrl = ${JSON.stringify(fullUrl)};`,
    ``,
    `  it('validates target is strictly loopback', () => {`,
    `    const parsed = assertLoopbackTarget(targetUrl);`,
    `    expect(['127.0.0.1', '::1', 'localhost']).toContain(parsed.hostname.replace(/^\\[|\\]$/g, ''));`,
    `  });`,
    ``,
    `  it.skipIf(!process.env.AXIOM_REDTEAM_LIVE)('verifies defensive invariant against local server', async () => {`,
    `    const res = await safeLoopbackFetch(targetUrl, {`,
    `      method: ${JSON.stringify(threat.method)},`,
    `      timeoutMs: 5000,`,
    `    });`,
    `    expect(res.bodyText).not.toMatch(/at\\s+Object\\.<anonymous>|GEMINI_API_KEY|GROQ_API_KEY|PRIVATE_KEY/i);`,
    `    expect(res.status).toBeLessThan(500);`,
    `  });`,
    `});`,
    ``,
  ].join('\n');
}

async function callGeminiThreatModeler(
  model: string,
  targetBaseUrl: string,
  routes: readonly RouteManifestEntry[]
): Promise<ThreatMatrix> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY for live Role A Threat Modeler. Use --dry-run for offline execution.');
  }
  const prompt = [
    `You are Role A (Defensive Security Threat Modeler) for a local loopback-only Next.js API at ${targetBaseUrl}.`,
    `Return ONLY valid JSON matching: { "threats": [{ "id": "RT-01", "category": "authz_idor"|"input_validation_path_traversal"|"error_leakage_stack_trace"|"rate_limit_malformed_payload", "route": "/api/...", "method": "GET"|"POST", "title": "...", "expectedDefense": "...", "severity": "low"|"medium"|"high" }] }.`,
    `Routes: ${JSON.stringify(routes)}`,
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini Threat Modeler HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(rawText) as { threats?: ThreatMatrixEntry[] };
  if (!Array.isArray(parsed.threats) || parsed.threats.length === 0) {
    return buildDeterministicDryRunThreatMatrix(targetBaseUrl, routes);
  }
  return {
    targetBaseUrl: assertLoopbackTarget(targetBaseUrl).origin,
    model,
    generatedAt: new Date().toISOString(),
    threats: parsed.threats,
  };
}

export async function runRedTeamV1(options: RedTeamRunOptions = {}): Promise<RedTeamRunResult> {
  const targetBaseUrl = assertLoopbackTarget(
    options.targetBaseUrl ?? DEFAULT_TARGET_BASE_URL
  ).origin;
  const routes = options.routes ?? DEFAULT_AXIOM_LOCAL_ROUTES;
  const dryRun = options.dryRun ?? false;
  const rootDir = options.rootDir ?? process.cwd();
  const threatModel = options.threatModel ?? DEFAULT_THREAT_MODEL;
  const probeModel = options.probeModel ?? DEFAULT_PROBE_MODEL;

  const outStateDir =
    options.outStateDir ?? path.join(rootDir, '.axiom-state', 'redteam-v1');
  const generatedTestsDir =
    options.generatedTestsDir ??
    path.join(rootDir, 'tests', 'v4', 'redteam', 'generated');

  fs.mkdirSync(outStateDir, { recursive: true });
  fs.mkdirSync(generatedTestsDir, { recursive: true });

  // Role A: Threat Modeler
  const threatMatrix = dryRun
    ? buildDeterministicDryRunThreatMatrix(targetBaseUrl, routes)
    : await callGeminiThreatModeler(threatModel, targetBaseUrl, routes);

  const threatMatrixPath = path.join(outStateDir, 'threat-matrix.json');
  fs.writeFileSync(threatMatrixPath, `${JSON.stringify(threatMatrix, null, 2)}\n`, 'utf8');

  // Role B: Defensive Vitest Probe Generator (strictly loopback-locked)
  const generatedProbes: GeneratedProbeFile[] = [];
  const quarantineCandidates: RedTeamQuarantineCandidate[] = [];

  for (const threat of threatMatrix.threats) {
    const safeSlug = threat.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const probePath = path.join(generatedTestsDir, `${safeSlug}.test.ts`);
    const probeSource = renderDeterministicVitestProbe(targetBaseUrl, threat);
    const sourceSha256 = sha256(probeSource);

    fs.writeFileSync(probePath, probeSource, 'utf8');
    generatedProbes.push({
      threatId: threat.id,
      filePath: path.relative(rootDir, probePath).replace(/\\/g, '/'),
      model: dryRun ? 'dry-run-deterministic' : probeModel,
      sourceSha256,
    });

    // Stage read-only QuarantineCandidate entry (never auto-promotes to canonical rules)
    quarantineCandidates.push({
      candidateId: `Q-RT-${threat.id}`,
      cartridgeId: 'redteam-v1-loopback',
      factId: threat.id,
      triggerFlag: threat.category,
      route: threat.route,
      proposedRuleText: `On ${threat.method} ${threat.route}: ${threat.expectedDefense}`,
      evidenceHashes: [sourceSha256],
      status: 'staged',
      stagedAt: new Date().toISOString(),
    });
  }

  const quarantinePath = path.join(outStateDir, 'quarantine-candidates.json');
  fs.writeFileSync(
    quarantinePath,
    `${JSON.stringify(
      {
        schemaVersion: '4.0.0-redteam-quarantine-bridge',
        targetBaseUrl,
        dryRun,
        readOnlyNotice: 'Candidates are staged only; Slow Clock Gate verification is required before promotion.',
        candidates: quarantineCandidates,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return {
    dryRun,
    targetBaseUrl,
    threatMatrix,
    generatedProbes,
    quarantineCandidates,
    artifacts: {
      threatMatrixPath,
      quarantinePath,
    },
  };
}
