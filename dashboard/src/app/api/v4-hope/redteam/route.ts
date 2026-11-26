import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  buildRedTeamFlowTraceEvent,
  type RawRedTeamCandidateInput,
  type RawRedTeamThreatInput,
} from '@/lib/v4-hope-flow';

export const dynamic = 'force-dynamic';

function findExistingFile(candidates: readonly string[]): string | null {
  for (const p of candidates) {
    try {
      if (
        fs.existsSync(/*turbopackIgnore: true*/ p) &&
        fs.statSync(/*turbopackIgnore: true*/ p).isFile()
      ) {
        return p;
      }
    } catch {
      // continue searching
    }
  }
  return null;
}

function resolveRepoFile(relPath: string): string | null {
  return findExistingFile([
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), '..', relPath),
    path.resolve(process.cwd(), '..', '..', relPath),
    path.resolve(process.cwd(), '..', '..', '..', relPath),
  ]);
}

function readJsonSafe<T>(filePath: string | null): T | null {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface RawLiveProbeSummary {
  readonly probeId?: unknown;
  readonly status?: unknown;
  readonly passedAssertions?: unknown;
  readonly failedAssertions?: unknown;
  readonly durationMs?: unknown;
  readonly executedAt?: unknown;
}

interface RawSlowCookReceipt {
  readonly candidateId?: unknown;
  readonly factId?: unknown;
  readonly status?: unknown;
  readonly rejectedByGate?: unknown;
  readonly receiptSha256?: unknown;
  readonly gateAudit?: unknown;
}

function indexSlowCookReceipts(
  receipts: readonly RawSlowCookReceipt[]
): ReadonlyMap<string, RawSlowCookReceipt> {
  const byCandidateId = new Map<string, RawSlowCookReceipt>();
  for (const receipt of receipts) {
    if (
      receipt &&
      typeof receipt.candidateId === 'string' &&
      typeof receipt.factId === 'string' &&
      (receipt.status === 'approved' || receipt.status === 'rejected') &&
      receipt.gateAudit &&
      typeof receipt.gateAudit === 'object'
    ) {
      byCandidateId.set(receipt.candidateId, receipt);
    }
  }
  return byCandidateId;
}

function readLiveProbeVerdict(
  candidate: RawRedTeamCandidateInput,
  summaries: Readonly<Record<string, RawLiveProbeSummary>> | null
): { readonly liveVerdict: 'pass' | 'fail' | 'staged'; readonly durationMs?: number } {
  const factId = typeof candidate.factId === 'string' ? candidate.factId : '';
  const summary = factId ? summaries?.[factId] : undefined;
  if (!summary || summary.probeId !== factId) {
    return { liveVerdict: 'staged' };
  }

  const durationMs =
    typeof summary.durationMs === 'number' &&
    Number.isFinite(summary.durationMs) &&
    summary.durationMs >= 0
      ? summary.durationMs
      : undefined;

  const passedAssertions =
    typeof summary.passedAssertions === 'number' &&
    Number.isInteger(summary.passedAssertions) &&
    summary.passedAssertions >= 0
      ? summary.passedAssertions
      : null;
  const failedAssertions =
    typeof summary.failedAssertions === 'number' &&
    Number.isInteger(summary.failedAssertions) &&
    summary.failedAssertions >= 0
      ? summary.failedAssertions
      : null;
  const executedAt =
    typeof summary.executedAt === 'string' &&
    !Number.isNaN(new Date(summary.executedAt).getTime());

  const status = summary.status === 'pass' || summary.status === 'fail' ? summary.status : null;
  const isCompletedPass =
    status === 'pass' && passedAssertions !== null && passedAssertions > 0 && failedAssertions === 0;
  const isCompletedFail = status === 'fail' && failedAssertions !== null && failedAssertions > 0;

  if (isCompletedPass && durationMs !== undefined && executedAt) {
    return {
      liveVerdict: 'pass',
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  }

  if (isCompletedFail && durationMs !== undefined && executedAt) {
    return { liveVerdict: 'fail', durationMs };
  }

  return { liveVerdict: 'staged' };
}

export async function GET() {
  try {
    const candidatesPath = resolveRepoFile('.axiom-state/redteam-v1/quarantine-candidates.json');
    const threatsPath = resolveRepoFile('.axiom-state/redteam-v1/threat-matrix.json');
    const summariesPath = resolveRepoFile('.axiom-state/redteam-v1/probe-results-summary.json');
    const slowCookPath = resolveRepoFile('.axiom-state/redteam-v1/slow-cook-receipts.json');

    const candidatesDoc = readJsonSafe<{
      readonly dryRun?: boolean;
      readonly targetBaseUrl?: string;
      readonly candidates?: readonly RawRedTeamCandidateInput[];
    }>(candidatesPath);
    const threatsDoc = readJsonSafe<{
      readonly model?: string;
      readonly targetBaseUrl?: string;
      readonly threats?: readonly RawRedTeamThreatInput[];
    }>(threatsPath);
    const summariesDoc = readJsonSafe<Record<string, RawLiveProbeSummary>>(summariesPath);
    const slowCookDoc = readJsonSafe<{
      readonly schemaVersion?: unknown;
      readonly generatedAt?: unknown;
      readonly receipts?: readonly RawSlowCookReceipt[];
    }>(slowCookPath);
    const slowCookReceipts = Array.isArray(slowCookDoc?.receipts) ? slowCookDoc.receipts : [];
    const slowCookByCandidateId = indexSlowCookReceipts(slowCookReceipts);

    const threats = Array.isArray(threatsDoc?.threats) ? threatsDoc.threats : [];
    const candidates = Array.isArray(candidatesDoc?.candidates)
      ? candidatesDoc.candidates.map((candidate) => ({
          ...candidate,
          ...readLiveProbeVerdict(candidate, summariesDoc),
          ...(typeof candidate.candidateId === 'string' &&
          slowCookByCandidateId.get(candidate.candidateId)?.factId === candidate.factId
            ? { slowCookDecision: slowCookByCandidateId.get(candidate.candidateId) }
            : {}),
        }))
      : [];

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          available: false,
          targetBaseUrl: candidatesDoc?.targetBaseUrl ?? threatsDoc?.targetBaseUrl ?? null,
          model: threatsDoc?.model ?? null,
          threats,
          candidates: [],
          traceEvents: [],
          slowCook: {
            available: slowCookReceipts.length > 0,
            generatedAt: typeof slowCookDoc?.generatedAt === 'string' ? slowCookDoc.generatedAt : null,
            decisions: slowCookReceipts,
          },
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const threatById = new Map<string, RawRedTeamThreatInput>();
    for (const t of threats) {
      if (t && typeof t.id === 'string') {
        threatById.set(t.id, t);
      }
    }

    const targetBaseUrl =
      typeof candidatesDoc?.targetBaseUrl === 'string' && candidatesDoc.targetBaseUrl.trim()
        ? candidatesDoc.targetBaseUrl.trim()
        : typeof threatsDoc?.targetBaseUrl === 'string' && threatsDoc.targetBaseUrl.trim()
          ? threatsDoc.targetBaseUrl.trim()
          : undefined;

    const traceEvents = candidates
      .filter(
        (c) =>
          c &&
          typeof c.candidateId === 'string' &&
          typeof c.factId === 'string' &&
          typeof c.stagedAt === 'string'
      )
      .map((candidate) =>
        buildRedTeamFlowTraceEvent({
          candidate,
          threat: threatById.get(candidate.factId) ?? null,
          modelId: threatsDoc?.model,
          dryRun: candidatesDoc?.dryRun,
          targetBaseUrl,
        })
      );

    return NextResponse.json(
      {
        available: true,
        targetBaseUrl: targetBaseUrl ?? null,
        model: threatsDoc?.model ?? null,
        threats,
        candidates,
        traceEvents,
        slowCook: {
          available: slowCookReceipts.length > 0,
          generatedAt: typeof slowCookDoc?.generatedAt === 'string' ? slowCookDoc.generatedAt : null,
          decisions: slowCookReceipts,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to read Red-Team quarantine telemetry' },
      { status: 500 }
    );
  }
}
