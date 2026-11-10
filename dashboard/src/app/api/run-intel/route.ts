import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Run intelligence for the Data Intel sidebar.
 * Everything here is derived deterministically from the run's results file,
 * the facts fixture and the oracle source — no LLM involvement.
 */

type FailMap = Record<string, number>;

interface Trial {
  condition?: string;
  provider?: string;
  baseUrl?: string;
  requestedModel?: string;
  returnedModel?: string;
  factsSha256?: string;
  oracleSha256?: string;
}

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

function repoRoots(): string[] {
  return [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '../..')];
}

function findFile(rel: string): string | null {
  for (const root of repoRoots()) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sha256(file: string | null): string | null {
  if (!file) return null;
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

function readJson(file: string | null): Record<string, unknown> | null {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function inferProvider(provider: string | undefined, baseUrl: string | undefined, model: string): string {
  const p = (provider ?? '').toLowerCase();
  const u = (baseUrl ?? '').toLowerCase();
  if (p === 'nvidia' || u.includes('nvidia')) return 'NVIDIA NIM';
  if (p === 'gemini' || u.includes('generativelanguage') || model.startsWith('gemini') || model.startsWith('gemma')) return 'Google AI Studio';
  if (p === 'groq' || u.includes('groq')) return 'Groq';
  if (p === 'kilo' || u.includes('kilo')) return 'Kilo Gateway';
  if (p === 'openrouter' || u.includes('openrouter') || model.endsWith(':free')) return 'OpenRouter';
  return provider ? provider : 'Unknown';
}

/** Mirrors getModelProfile() in src/executor.ts. */
function reasoningFor(model: string): { mode: string; label: string } {
  const m = model === 'gemma-4-26b-it' ? 'gemma-4-26b-a4b-it' : model;
  if (m === 'gemma-4-26b-a4b-it' || m === 'gemma-4-31b-it') return { mode: 'Minimal', label: 'thinking_level=minimal' };
  if (m.includes('lightning')) return { mode: 'Disabled', label: 'reasoning_effort=none, enable_thinking=false' };
  if (m.includes('glm')) return { mode: 'Low', label: 'reasoning_effort=low' };
  return { mode: 'Provider Default', label: 'provider-default' };
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run') ?? '';
  if (!SAFE_ID.test(runId)) {
    return NextResponse.json({ error: 'invalid run id' }, { status: 400 });
  }

  const stateFile = findFile(path.join('.axiom-state', 'runs', runId, 'results.json'));
  const publicFile = findFile(path.join('public', 'data', `run-${runId}.json`)) ?? findFile(path.join('dashboard', 'public', 'data', `run-${runId}.json`));
  const raw = readJson(stateFile) ?? readJson(publicFile);
  if (!raw) {
    return NextResponse.json({ runId, available: false }, { status: 200 });
  }

  const trials = (Array.isArray(raw.trials) ? raw.trials : []) as Trial[];
  const first = trials[0] ?? {};

  // Per-condition means + failure maps (two supported shapes).
  const means: Record<string, number> = {};
  const failures: Record<string, FailMap> = {};
  const counts: Record<string, number> = {};
  if (Array.isArray(raw.results)) {
    for (const r of raw.results as Array<Record<string, unknown>>) {
      const c = String(r.condition);
      if (typeof r.primaryMeanBoundFactFraction === 'number') means[c] = r.primaryMeanBoundFactFraction;
      if (r.failuresByFact && typeof r.failuresByFact === 'object') failures[c] = r.failuresByFact as FailMap;
      if (typeof r.trials === 'number') counts[c] = r.trials;
    }
  }
  if (raw.conditions && typeof raw.conditions === 'object' && !Array.isArray(raw.conditions)) {
    for (const [c, v] of Object.entries(raw.conditions as Record<string, Record<string, unknown>>)) {
      if (means[c] === undefined && typeof v?.meanBoundFactFraction === 'number') means[c] = v.meanBoundFactFraction;
      if (counts[c] === undefined && typeof v?.n === 'number') counts[c] = v.n;
    }
  }
  if (raw.failuresByFact && typeof raw.failuresByFact === 'object') {
    for (const [c, m] of Object.entries(raw.failuresByFact as Record<string, FailMap>)) {
      if (!failures[c]) failures[c] = m;
    }
  }

  const model = String(raw.model ?? first.requestedModel ?? runId);
  const requestedModel = String(raw.requestedModel ?? first.requestedModel ?? model);
  const returned = new Map<string, number>();
  for (const t of trials) if (t.returnedModel) returned.set(t.returnedModel, (returned.get(t.returnedModel) ?? 0) + 1);

  const sha = (raw.sha256 ?? {}) as Record<string, string>;
  const recordedFacts = (raw.factsSha256 as string) ?? sha.factsJson ?? first.factsSha256 ?? null;
  const recordedOracle = (raw.oracleSha256 as string) ?? sha.oracleTs ?? first.oracleSha256 ?? null;
  const factsPath = findFile(path.join('fixtures', 'task-v2', 'facts.json'));
  const actualFacts = sha256(factsPath);
  const actualOracle = sha256(findFile(path.join('scripts', 'oracle.ts')));

  const factsDoc = readJson(factsPath) as { facts?: Array<{ id: string; statement: string }> } | null;
  const statements: Record<string, string> = {};
  for (const f of factsDoc?.facts ?? []) statements[f.id] = f.statement;

  // Paired comparison C vs C0, if recorded.
  const pc = (raw.pairedComparisons ?? {}) as Record<string, { primary?: { meanDifference?: number; signFlipPValue?: number }; holmPrimaryPValue?: number }>;
  const cVsC0 = pc.C_vs_C0 ?? pc.C0_vs_C ?? null;

  return NextResponse.json({
    runId,
    available: true,
    source: stateFile ? 'results.json' : 'snapshot',
    provider: inferProvider(first.provider, first.baseUrl ?? (raw.baseUrl as string | undefined), model),
    baseUrl: first.baseUrl ?? raw.baseUrl ?? null,
    requestedModel,
    returnedModels: [...returned.entries()].map(([name, n]) => ({ name, n })),
    reasoning: reasoningFor(model),
    gitCommit: raw.gitCommit ?? null,
    generatedAt: raw.generatedAt ?? null,
    integrity: {
      facts: { recorded: recordedFacts, actual: actualFacts, ok: !!recordedFacts && recordedFacts === actualFacts },
      oracle: { recorded: recordedOracle, actual: actualOracle, ok: !!recordedOracle && recordedOracle === actualOracle },
    },
    means,
    counts,
    failures,
    statements,
    pairedCvsC0: cVsC0
      ? {
          key: pc.C_vs_C0 ? 'C_vs_C0' : 'C0_vs_C',
          meanDifference: cVsC0.primary?.meanDifference ?? null,
          pValue: cVsC0.holmPrimaryPValue ?? cVsC0.primary?.signFlipPValue ?? null,
        }
      : null,
  });
}
