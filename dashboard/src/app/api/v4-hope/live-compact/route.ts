import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  buildRedTeamFlowTraceEvent,
  buildTrialFlowTraceEvent,
  computeFlowTraceStats,
  type FlowTraceEvent,
  type RawCandidateDecisionInput,
  type RawRedTeamCandidateInput,
  type RawRedTeamThreatInput,
  type RawReplayCacheEntryInput,
} from '@/lib/v4-hope-flow';

export const dynamic = 'force-dynamic';

interface ModelSpec {
  readonly modelId: string;
  readonly modelSlug: string;
  readonly shortName: string;
  readonly provider: string;
}

interface CartridgeSpec {
  readonly cartridgeId: 'policy-abac-v4' | 'ts-api-security-v4';
  readonly prefix: 'policy-abac' | 'ts-api';
  readonly label: string;
  readonly totalTasks: number;
}

const MODELS: readonly ModelSpec[] = [
  {
    modelId: 'gemini-3.1-flash-lite',
    modelSlug: 'gemini-3-1-flash-lite',
    shortName: 'Gemini 3.1 Flash-Lite',
    provider: 'Google AI Studio',
  },
  {
    modelId: 'gemma-4-31b-it',
    modelSlug: 'gemma-4-31b-it',
    shortName: 'Gemma 4 31B',
    provider: 'Google AI Studio',
  },
  {
    modelId: 'qwen/qwen3.8-27b',
    modelSlug: 'qwen-qwen3-8-27b',
    shortName: 'Qwen 3.8 27B',
    provider: 'Groq',
  },
];

const CARTRIDGES: readonly CartridgeSpec[] = [
  {
    cartridgeId: 'policy-abac-v4',
    prefix: 'policy-abac',
    label: 'Policy-as-Code ABAC',
    totalTasks: 18,
  },
  {
    cartridgeId: 'ts-api-security-v4',
    prefix: 'ts-api',
    label: 'TypeScript API Security',
    totalTasks: 15,
  },
];

function findExistingFile(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (
        fs.existsSync(/*turbopackIgnore: true*/ p) &&
        fs.statSync(/*turbopackIgnore: true*/ p).isFile()
      ) {
        return p;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function resolveRepoFile(relPath: string): string | null {
  return findExistingFile([
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), '..', relPath),
    path.resolve(process.cwd(), '..', '..', relPath),
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

function getMtimeIso(filePath: string | null): string | null {
  if (!filePath) return null;
  try {
    return fs.statSync(/*turbopackIgnore: true*/ filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

interface LiveReplayEvent {
  readonly cartridgeId: string;
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly shortName: string;
  readonly taskId: string;
  readonly retrievedRuleIds: string[];
  readonly fullTaskPass: boolean;
  readonly passedFactsCount: number;
  readonly boundFactsCount: number;
  readonly factPassRate: number;
  readonly failedFacts: string[];
  readonly latencyMs?: number;
  readonly source: string;
  readonly timestamp: string;
}

export async function GET() {
  try {
    const runs: Array<Record<string, unknown>> = [];
    const allReplayEvents: LiveReplayEvent[] = [];
    const traceStream: FlowTraceEvent[] = [];

    let completedRuns = 0;
    let activeRuns = 0;
    let totalCompletedTasks = 0;
    let totalTargetTasks = 0;
    let totalBeforeTokens = 0;
    let totalAfterTokens = 0;
    let totalPreservedTokens = 0;
    let totalRequiredTokens = 0;
    let totalPromotedRegressions = 0;

    for (const cart of CARTRIDGES) {
      for (const model of MODELS) {
        totalTargetTasks += cart.totalTasks;
        const baseKey = `${cart.prefix}-${model.modelSlug}`;
        const compactKey = `${baseKey}-compact`;

        const baselineSummaryPath = resolveRepoFile(`out/v4/${baseKey}-summary.json`);
        const compactSummaryPath = resolveRepoFile(`out/v4/${compactKey}-summary.json`);
        const compactReceiptPath = resolveRepoFile(`out/v4/${compactKey}-hope-receipt.json`);
        const compactCheckpointPath = resolveRepoFile(
          `.axiom-state/runs-v4/${compactKey}/checkpoint.json`
        );
        const compactReplayPath = resolveRepoFile(
          `.axiom-state/runs-v4/${compactKey}/hope-replay-cache.json`
        );

        const baselineSummary = readJsonSafe<any>(baselineSummaryPath);
        const compactSummary = readJsonSafe<any>(compactSummaryPath);
        const compactReceipt = readJsonSafe<any>(compactReceiptPath);
        const compactCheckpoint = readJsonSafe<any>(compactCheckpointPath);
        const compactReplay = readJsonSafe<Record<string, RawReplayCacheEntryInput>>(
          compactReplayPath
        );

        const compaction = compactSummary?.compaction ?? compactReceipt?.compaction ?? null;
        if (compaction) {
          totalBeforeTokens += Number(compaction.beforeTokens ?? 0);
          totalAfterTokens += Number(compaction.afterTokens ?? 0);
          totalPreservedTokens += Number(compaction.preservedTokenCount ?? 0);
          totalRequiredTokens += Number(compaction.totalRequiredTokens ?? 0);
        }

        const decisions: RawCandidateDecisionInput[] = Array.isArray(
          compactReceipt?.candidateDecisions
        )
          ? compactReceipt.candidateDecisions
          : [];

        const replayObjectEntries = compactReplay ? Object.entries(compactReplay) : [];
        const replayEntries = replayObjectEntries.map(([, entry]) => entry);
        const liveReplayCount = replayEntries.filter((e) => e?.source === 'live-replay').length;

        // Collect recent live-replay events and structured FlowTraceEvents
        for (const [cacheKey, e] of replayObjectEntries) {
          if (e && typeof e.taskId === 'string' && typeof e.timestamp === 'string') {
            allReplayEvents.push({
              cartridgeId: cart.cartridgeId,
              cartridgeLabel: cart.label,
              modelId: model.modelId,
              shortName: model.shortName,
              taskId: e.taskId,
              retrievedRuleIds: Array.isArray(e.retrievedRuleIds) ? e.retrievedRuleIds : [],
              fullTaskPass: Boolean(e.fullTaskPass),
              passedFactsCount: Number(e.passedFactsCount ?? 0),
              boundFactsCount: Number(e.boundFactsCount ?? 0),
              factPassRate: Number(e.factPassRate ?? 0),
              failedFacts: Array.isArray(e.failedFacts) ? e.failedFacts : [],
              latencyMs: typeof e.latencyMs === 'number' ? e.latencyMs : undefined,
              source: String(e.source ?? 'live-replay'),
              timestamp: e.timestamp,
            });

            const hopeTrial = compactCheckpoint?.trials?.[`${e.taskId}::C_ID_hope`];
            const baselineCTrial = compactCheckpoint?.trials?.[`${e.taskId}::C`];
            const promptChars =
              typeof hopeTrial?.promptChars === 'number'
                ? hopeTrial.promptChars
                : typeof baselineCTrial?.promptChars === 'number'
                  ? baselineCTrial.promptChars
                  : undefined;
            const artifactSha256 =
              typeof hopeTrial?.artifactSha256 === 'string' && hopeTrial.artifactSha256.length > 0
                ? hopeTrial.artifactSha256
                : typeof baselineCTrial?.artifactSha256 === 'string' &&
                    baselineCTrial.artifactSha256.length > 0
                  ? baselineCTrial.artifactSha256
                  : undefined;

            traceStream.push(
              buildTrialFlowTraceEvent({
                runId: compactKey,
                cacheKey,
                cartridgeId: cart.cartridgeId,
                cartridgeLabel: cart.label,
                modelId: model.modelId,
                shortName: model.shortName,
                entry: e,
                compaction,
                promptChars,
                candidateDecisions: decisions,
                provider: model.provider,
                artifactSha256,
              })
            );
          }
        }

        // Count C_ID_hope tasks completed in compact checkpoint
        let hopeCompletedTasks = 0;
        let hopePassedTasks = 0;
        let hopeMeanFactRate: number | null = null;
        if (compactCheckpoint?.trials && typeof compactCheckpoint.trials === 'object') {
          const hopeTrials = Object.values(compactCheckpoint.trials as Record<string, any>).filter(
            (t) => t?.arm === 'C_ID_hope'
          );
          hopeCompletedTasks = hopeTrials.length;
          hopePassedTasks = hopeTrials.filter((t) => Boolean(t?.fullTaskPass)).length;
          if (hopeTrials.length > 0) {
            hopeMeanFactRate =
              hopeTrials.reduce((acc, t) => acc + Number(t?.factPassRate ?? 0), 0) /
              hopeTrials.length;
          }
        }

        if (compactSummary?.arms?.C_ID_hope) {
          hopeCompletedTasks = compactSummary.arms.C_ID_hope.totalTasks ?? cart.totalTasks;
          hopePassedTasks = compactSummary.arms.C_ID_hope.fullTaskPassCount ?? hopePassedTasks;
          hopeMeanFactRate = compactSummary.arms.C_ID_hope.meanFactPassRate ?? hopeMeanFactRate;
        }

        let status: 'completed' | 'evaluating_hope' | 'slow_clock_replay' | 'queued' = 'queued';
        if (compactSummary?.arms?.C_ID_hope && compactReceipt) {
          status = 'completed';
          completedRuns++;
        } else if (hopeCompletedTasks > 0) {
          status = 'evaluating_hope';
          activeRuns++;
        } else if (replayEntries.length > 0) {
          status = 'slow_clock_replay';
          activeRuns++;
        }

        totalCompletedTasks += Math.min(hopeCompletedTasks, cart.totalTasks);

        const baseHope = baselineSummary?.arms?.C_ID_hope ?? null;
        const compHope = compactSummary?.arms?.C_ID_hope ?? null;

        const baselineFullTaskRate = baseHope ? Number(baseHope.fullTaskPassRate) : null;
        const baselineMeanFactRate = baseHope ? Number(baseHope.meanFactPassRate) : null;
        const compactFullTaskRate = compHope
          ? Number(compHope.fullTaskPassRate)
          : hopeCompletedTasks > 0
            ? hopePassedTasks / hopeCompletedTasks
            : null;
        const compactMeanFactRate = compHope
          ? Number(compHope.meanFactPassRate)
          : hopeMeanFactRate;

        const deltaFullTaskPp =
          baselineFullTaskRate !== null && compactFullTaskRate !== null
            ? Number(((compactFullTaskRate - baselineFullTaskRate) * 100).toFixed(2))
            : null;
        const deltaMeanFactPp =
          baselineMeanFactRate !== null && compactMeanFactRate !== null
            ? Number(((compactMeanFactRate - baselineMeanFactRate) * 100).toFixed(2))
            : null;

        const approvedCount = decisions.filter((d: any) => d?.status === 'approved').length;
        const rejectedCount = decisions.filter((d: any) => d?.status === 'rejected').length;
        const promotedRegressions = decisions
          .filter((d: any) => d?.status === 'approved')
          .reduce(
            (acc: number, d: any) =>
              acc + Number(d?.gateAudit?.canaryReplay?.canaryRegressions ?? 0),
            0
          );
        totalPromotedRegressions += promotedRegressions;

        const mtimes = [
          getMtimeIso(compactSummaryPath),
          getMtimeIso(compactReceiptPath),
          getMtimeIso(compactCheckpointPath),
          getMtimeIso(compactReplayPath),
        ].filter((m): m is string => Boolean(m));
        const lastUpdatedAt = mtimes.sort().at(-1) ?? null;

        runs.push({
          id: compactKey,
          cartridgeId: cart.cartridgeId,
          cartridgeLabel: cart.label,
          modelId: model.modelId,
          modelSlug: model.modelSlug,
          shortName: model.shortName,
          provider: model.provider,
          status,
          totalTasks: cart.totalTasks,
          hopeCompletedTasks,
          hopePassedTasks,
          replayCacheTotal: replayEntries.length,
          liveReplayCount,
          baseline: {
            fullTaskPassRate: baselineFullTaskRate,
            meanFactPassRate: baselineMeanFactRate,
            fullTaskPassCount: baseHope?.fullTaskPassCount ?? null,
          },
          compact: {
            fullTaskPassRate: compactFullTaskRate,
            meanFactPassRate: compactMeanFactRate,
            fullTaskPassCount: compHope?.fullTaskPassCount ?? (hopeCompletedTasks > 0 ? hopePassedTasks : null),
          },
          deltaPp: {
            fullTask: deltaFullTaskPp,
            meanFact: deltaMeanFactPp,
          },
          compaction,
          governance: compactReceipt
            ? {
                totalAudits: decisions.length,
                approvedCount,
                rejectedCount,
                promotedRegressions,
                finalSnapshotSha256: compactReceipt.finalSnapshotSha256 ?? null,
              }
            : null,
          lastUpdatedAt,
        });
      }
    }

    // Collect staged Red-Team Loopback v1 candidates (safe when absent in standalone environments)
    const redTeamCandidatesPath = resolveRepoFile('.axiom-state/redteam-v1/quarantine-candidates.json');
    const redTeamThreatsPath = resolveRepoFile('.axiom-state/redteam-v1/threat-matrix.json');
    const redTeamCandidatesDoc = readJsonSafe<{
      readonly dryRun?: boolean;
      readonly targetBaseUrl?: string;
      readonly candidates?: readonly RawRedTeamCandidateInput[];
    }>(redTeamCandidatesPath);
    const redTeamThreatsDoc = readJsonSafe<{
      readonly model?: string;
      readonly targetBaseUrl?: string;
      readonly threats?: readonly RawRedTeamThreatInput[];
    }>(redTeamThreatsPath);

    const redTeamTargetBaseUrl =
      typeof redTeamCandidatesDoc?.targetBaseUrl === 'string' &&
      redTeamCandidatesDoc.targetBaseUrl.trim().length > 0
        ? redTeamCandidatesDoc.targetBaseUrl.trim()
        : typeof redTeamThreatsDoc?.targetBaseUrl === 'string' &&
            redTeamThreatsDoc.targetBaseUrl.trim().length > 0
          ? redTeamThreatsDoc.targetBaseUrl.trim()
          : undefined;

    const threatById = new Map<string, RawRedTeamThreatInput>();
    if (Array.isArray(redTeamThreatsDoc?.threats)) {
      for (const threat of redTeamThreatsDoc.threats) {
        if (threat && typeof threat.id === 'string') {
          threatById.set(threat.id, threat);
        }
      }
    }

    if (Array.isArray(redTeamCandidatesDoc?.candidates)) {
      for (const candidate of redTeamCandidatesDoc.candidates) {
        if (
          candidate &&
          typeof candidate.candidateId === 'string' &&
          typeof candidate.factId === 'string' &&
          typeof candidate.stagedAt === 'string'
        ) {
          const threat = threatById.get(candidate.factId) ?? null;
          traceStream.push(
            buildRedTeamFlowTraceEvent({
              candidate,
              threat,
              modelId: redTeamThreatsDoc?.model,
              dryRun: redTeamCandidatesDoc.dryRun,
              targetBaseUrl: redTeamTargetBaseUrl,
            })
          );
        }
      }
    }

    // Sort live replay stream newest first (preserved for existing Matrix / feed)
    allReplayEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Sort traceStream chronologically ascending (index 0 = earliest, end = latest / LIVE)
    traceStream.sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });

    // Also include compiled summary if available
    const compiledSummaryPath = resolveRepoFile('out/v4/compact-benchmark-summary.json');
    const compiledSummary = readJsonSafe<Record<string, unknown>>(compiledSummaryPath);

    const savedTokens = Math.max(0, totalBeforeTokens - totalAfterTokens);
    const weightedReductionPct =
      totalBeforeTokens > 0
        ? Number(((savedTokens / totalBeforeTokens) * 100).toFixed(2))
        : 0;
    const lexicalRetentionPct =
      totalRequiredTokens > 0
        ? Number(((totalPreservedTokens / totalRequiredTokens) * 100).toFixed(2))
        : 100;

    const traceStats = computeFlowTraceStats(traceStream, {
      savedTokens,
      weightedReductionPct,
      lexicalRetentionPct,
      totalBeforeTokens,
      totalAfterTokens,
      totalPreservedTokens,
      totalRequiredTokens,
    });

    return NextResponse.json({
      polledAt: new Date().toISOString(),
      totals: {
        totalRuns: runs.length,
        completedRuns,
        activeRuns,
        queuedRuns: runs.length - completedRuns - activeRuns,
        totalCompletedTasks,
        totalTargetTasks,
        totalBeforeTokens,
        totalAfterTokens,
        savedTokens,
        weightedReductionPct,
        totalPreservedTokens,
        totalRequiredTokens,
        lexicalRetentionPct,
        totalPromotedRegressions,
      },
      runs,
      recentReplayEvents: allReplayEvents.slice(0, 14),
      compiledSummaryAvailable: Boolean(compiledSummary),
      traceStream,
      traceStats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read live HOPE --compact run telemetry', details: String(err) },
      { status: 500 }
    );
  }
}
