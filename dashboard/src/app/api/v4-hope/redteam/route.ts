import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  buildRedTeamFlowTraceEvent,
  type RawRedTeamCandidateInput,
  type RawRedTeamThreatInput,
} from '@/lib/v4-hope-flow';
import { loadVerifiedShadowRules } from '../../../../../../src/v4/redteam/shadow-enforcer';

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

interface RawSlowClockReceipt {
  readonly candidateId?: unknown;
  readonly probeId?: unknown;
  readonly decision?: unknown;
  readonly gates?: {
    readonly g1?: { readonly pass?: boolean; readonly reason?: string };
    readonly g2?: { readonly pass?: boolean; readonly reason?: string };
    readonly g3?: { readonly pass?: boolean; readonly reason?: string };
  };
  readonly receiptHash?: unknown;
}

function indexSlowClockReceipts(
  receipts: readonly RawSlowClockReceipt[]
): ReadonlyMap<string, RawSlowClockReceipt> {
  const byCandidateId = new Map<string, RawSlowClockReceipt>();
  for (const receipt of receipts) {
    if (
      receipt &&
      typeof receipt.candidateId === 'string' &&
      (receipt.decision === 'PROMOTED_SHADOW' || receipt.decision === 'REJECTED') &&
      receipt.gates &&
      typeof receipt.gates === 'object'
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
    const slowClockPath = resolveRepoFile('.axiom-state/redteam-v1/slow-clock-receipts.json');

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
    const slowClockDoc = readJsonSafe<{
      readonly schemaVersion?: unknown;
      readonly generatedAt?: unknown;
      readonly receipts?: readonly RawSlowClockReceipt[];
    }>(slowClockPath);
    const slowClockReceipts = Array.isArray(slowClockDoc?.receipts) ? slowClockDoc.receipts : [];
    const slowClockByCandidateId = indexSlowClockReceipts(slowClockReceipts);
    const shadowRulesState = loadVerifiedShadowRules(
      slowClockPath ? { receiptsPath: slowClockPath } : {}
    );
    const shadowEnforcementActive = shadowRulesState.active;
    const enforcedRuleIds = shadowRulesState.enforcedRuleIds;
    const enforcedRuleIdSet = new Set(enforcedRuleIds);

    const threats = Array.isArray(threatsDoc?.threats) ? threatsDoc.threats : [];
    const candidates = Array.isArray(candidatesDoc?.candidates)
      ? candidatesDoc.candidates.map((candidate) => {
          const receipt =
            typeof candidate.candidateId === 'string'
              ? slowClockByCandidateId.get(candidate.candidateId)
              : undefined;
          const slowClockDecision: 'PROMOTED_SHADOW' | 'REJECTED' | 'PENDING' =
            receipt?.decision === 'PROMOTED_SHADOW' || receipt?.decision === 'REJECTED'
              ? receipt.decision
              : 'PENDING';
          const verdictInfo = readLiveProbeVerdict(candidate, summariesDoc);
          const candidateId =
            typeof candidate.candidateId === 'string' ? candidate.candidateId : '';
          const shadowEnforced =
            shadowEnforcementActive &&
            candidateId.length > 0 &&
            enforcedRuleIdSet.has(candidateId);
          const mitigated = shadowEnforced && verdictInfo.liveVerdict === 'pass';
          return {
            ...candidate,
            ...verdictInfo,
            slowClockDecision,
            gateBreakdown: receipt?.gates ?? null,
            receiptHash: typeof receipt?.receiptHash === 'string' ? receipt.receiptHash : null,
            shadowEnforced,
            mitigated,
            ...(mitigated ? { mitigationStatus: 'MITIGATED' as const } : {}),
          };
        })
      : [];

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          available: false,
          targetBaseUrl: candidatesDoc?.targetBaseUrl ?? threatsDoc?.targetBaseUrl ?? null,
          model: threatsDoc?.model ?? null,
          shadowEnforcementActive,
          enforcedRuleIds,
          threats,
          candidates: [],
          traceEvents: [],
          slowClock: {
            available: slowClockReceipts.length > 0,
            generatedAt: typeof slowClockDoc?.generatedAt === 'string' ? slowClockDoc.generatedAt : null,
            receipts: slowClockReceipts,
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
      .map((candidate) => {
        const baseEvent = buildRedTeamFlowTraceEvent({
          candidate,
          threat: threatById.get(candidate.factId) ?? null,
          modelId: threatsDoc?.model,
          dryRun: candidatesDoc?.dryRun,
          targetBaseUrl,
          enforcedRuleIds,
        });
        return {
          ...baseEvent,
          slowClockDecision: candidate.slowClockDecision,
          gateBreakdown: candidate.gateBreakdown,
          receiptHash: candidate.receiptHash,
        };
      });

    return NextResponse.json(
      {
        available: true,
        targetBaseUrl: targetBaseUrl ?? null,
        model: threatsDoc?.model ?? null,
        shadowEnforcementActive,
        enforcedRuleIds,
        threats,
        candidates,
        traceEvents,
        slowClock: {
          available: slowClockReceipts.length > 0,
          generatedAt: typeof slowClockDoc?.generatedAt === 'string' ? slowClockDoc.generatedAt : null,
          receipts: slowClockReceipts,
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
