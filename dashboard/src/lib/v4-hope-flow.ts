// dashboard/src/lib/v4-hope-flow.ts
// Isomorphic typed telemetry contract, DAG routing helpers, and aggregation
// utilities for the Axiom-HOPE v4 live execution trace flow.

export type FlowNodeId =
  | 'TASK_IN'
  | 'FAST_CLOCK'
  | 'ORACLE_VERIFIER'
  | 'VERIFIED_OUTPUT'
  | 'QUARANTINE_VAULT'
  | 'SLOW_CLOCK_GATE'
  | 'GATE_APPROVED'
  | 'GATE_REJECTED';

export type FlowOutcome = 'PASS' | 'FAIL' | 'QUARANTINE';

export interface FlowPromptDelta {
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly savedTokens: number;
  readonly reductionPct: number;
  readonly lexicalLockPct: number;
  readonly promptChars?: number;
}

export interface FlowSlowClockGateInfo {
  readonly status: 'approved' | 'rejected' | 'staged' | 'none';
  readonly candidateId?: string;
  readonly factId?: string;
  readonly triggerFlag?: string;
  readonly g1LexicalPassed?: boolean;
  readonly g2ConflictPassed?: boolean;
  readonly g3CanaryPassed?: boolean;
  readonly canaryRegressions?: number;
  readonly targetDeltaPp?: number;
  readonly reason?: string;
}

export interface FlowRedTeamProbeInfo {
  readonly candidateId: string;
  readonly factId: string;
  readonly method: string;
  readonly route: string;
  readonly triggerFlag: string;
  readonly title?: string;
  readonly severity?: string;
  readonly expectedDefense?: string;
  readonly proposedRuleText: string;
  readonly evidenceHash: string;
  readonly status: 'staged' | 'approved' | 'rejected';
}

export interface FlowTraceEvent {
  readonly id: string;
  readonly kind: 'trial' | 'redteam_probe';
  readonly cartridgeId: 'policy-abac-v4' | 'ts-api-security-v4' | 'redteam-v1-loopback';
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly shortName: string;
  readonly taskId: string;
  readonly retrievedRuleIds: readonly string[];
  readonly fullTaskPass: boolean;
  readonly outcome: FlowOutcome;
  readonly terminalNode: FlowNodeId;
  readonly pathNodes: readonly FlowNodeId[];
  readonly passedFactsCount: number;
  readonly boundFactsCount: number;
  readonly factPassRate: number;
  readonly passedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly activeForensicFlags: readonly string[];
  readonly stderrSummary?: string;
  readonly latencyMs?: number;
  readonly timestamp: string;
  readonly source: string;
  readonly promptDelta: FlowPromptDelta;
  readonly slowClockGate: FlowSlowClockGateInfo;
  readonly redTeam?: FlowRedTeamProbeInfo;
}

export interface FlowTraceStats {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly quarantined: number;
  readonly approvedAtGate: number;
  readonly rejectedAtGate: number;
  readonly redTeamStaged: number;
  readonly savedTokens: number;
  readonly weightedReductionPct: number;
  readonly lexicalRetentionPct: number;
}

export interface FlowNodeMeta {
  readonly id: FlowNodeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly lane: 'spine' | 'quarantine';
  readonly description: string;
}

export const FLOW_NODE_ORDER: readonly FlowNodeId[] = [
  'TASK_IN',
  'FAST_CLOCK',
  'ORACLE_VERIFIER',
  'VERIFIED_OUTPUT',
  'QUARANTINE_VAULT',
  'SLOW_CLOCK_GATE',
  'GATE_APPROVED',
  'GATE_REJECTED',
];

export const FLOW_NODE_META: Readonly<Record<FlowNodeId, FlowNodeMeta>> = {
  TASK_IN: {
    id: 'TASK_IN',
    label: 'TASK / PROBE IN',
    shortLabel: 'TASK IN',
    lane: 'spine',
    description: 'Incoming benchmark task or loopback red-team probe.',
  },
  FAST_CLOCK: {
    id: 'FAST_CLOCK',
    label: 'FAST CLOCK',
    shortLabel: 'FAST CLOCK',
    lane: 'spine',
    description: 'Top-K=4 retrieval with --compact lexical identifier lock.',
  },
  ORACLE_VERIFIER: {
    id: 'ORACLE_VERIFIER',
    label: 'ORACLE / VERIFIER',
    shortLabel: 'ORACLE',
    lane: 'spine',
    description: 'Zero-LLM deterministic bound-fact & red-team verifier.',
  },
  VERIFIED_OUTPUT: {
    id: 'VERIFIED_OUTPUT',
    label: 'VERIFIED OUTPUT',
    shortLabel: 'VERIFIED',
    lane: 'spine',
    description: 'All bound facts verified cleanly on first pass.',
  },
  QUARANTINE_VAULT: {
    id: 'QUARANTINE_VAULT',
    label: 'QUARANTINE VAULT',
    shortLabel: 'QUARANTINE',
    lane: 'quarantine',
    description: 'Isolated failure cluster or red-team candidate staged with provenance.',
  },
  SLOW_CLOCK_GATE: {
    id: 'SLOW_CLOCK_GATE',
    label: 'SLOW CLOCK GATE',
    shortLabel: 'SLOW GATE',
    lane: 'quarantine',
    description: 'G1 Lexical Lock · G2 Contradiction Linter · G3 Paired Canary Replay.',
  },
  GATE_APPROVED: {
    id: 'GATE_APPROVED',
    label: 'APPROVED',
    shortLabel: 'APPROVED',
    lane: 'quarantine',
    description: 'Passed G1/G2/G3 with 0 canary regressions and promoted cleanly.',
  },
  GATE_REJECTED: {
    id: 'GATE_REJECTED',
    label: 'REJECTED',
    shortLabel: 'REJECTED',
    lane: 'quarantine',
    description: 'Blocked regression or non-improving candidate patch.',
  },
};

export interface FlowAggregateTotalsInput {
  readonly savedTokens?: number;
  readonly weightedReductionPct?: number;
  readonly lexicalRetentionPct?: number;
  readonly totalBeforeTokens?: number;
  readonly totalAfterTokens?: number;
  readonly totalPreservedTokens?: number;
  readonly totalRequiredTokens?: number;
}

export interface RawCompactionStatsInput {
  readonly beforeTokens?: unknown;
  readonly afterTokens?: unknown;
  readonly savedTokens?: unknown;
  readonly reductionPct?: unknown;
  readonly preservedTokenCount?: unknown;
  readonly totalRequiredTokens?: unknown;
}

export interface RawCandidateDecisionInput {
  readonly candidateId?: unknown;
  readonly factId?: unknown;
  readonly triggerFlag?: unknown;
  readonly proposedRuleTextChanged?: unknown;
  readonly evidenceHashes?: unknown;
  readonly status?: unknown;
  readonly gateAudit?: {
    readonly lexicalLock?: {
      readonly executed?: unknown;
      readonly passed?: unknown;
      readonly reason?: unknown;
    };
    readonly contradictionLinter?: {
      readonly executed?: unknown;
      readonly passed?: unknown;
      readonly violations?: ReadonlyArray<{ readonly message?: unknown }>;
    };
    readonly canaryReplay?: {
      readonly executed?: unknown;
      readonly passed?: unknown;
      readonly canaryRegressions?: unknown;
      readonly targetCohortDelta?: unknown;
      readonly reason?: unknown;
    };
  };
}

export interface RawReplayCacheEntryInput {
  readonly cacheKey?: unknown;
  readonly taskId?: unknown;
  readonly retrievedRuleIds?: unknown;
  readonly fullTaskPass?: unknown;
  readonly passedFactsCount?: unknown;
  readonly boundFactsCount?: unknown;
  readonly factPassRate?: unknown;
  readonly passedFacts?: unknown;
  readonly failedFacts?: unknown;
  readonly forensicFlags?: unknown;
  readonly stderr?: unknown;
  readonly latencyMs?: unknown;
  readonly source?: unknown;
  readonly timestamp?: unknown;
}

export interface RawRedTeamCandidateInput {
  readonly candidateId?: unknown;
  readonly cartridgeId?: unknown;
  readonly factId?: unknown;
  readonly triggerFlag?: unknown;
  readonly route?: unknown;
  readonly proposedRuleText?: unknown;
  readonly evidenceHashes?: unknown;
  readonly status?: unknown;
  readonly stagedAt?: unknown;
}

export interface RawRedTeamThreatInput {
  readonly id?: unknown;
  readonly category?: unknown;
  readonly route?: unknown;
  readonly method?: unknown;
  readonly title?: unknown;
  readonly expectedDefense?: unknown;
  readonly severity?: unknown;
}

export interface FlowTraceFilterOptions {
  readonly cartridgeId?: FlowTraceEvent['cartridgeId'] | null;
  readonly modelId?: string | null;
  readonly nodeId?: FlowNodeId | null;
  readonly outcome?: FlowOutcome | null;
  readonly kind?: FlowTraceEvent['kind'] | null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Truncates raw stderr diagnostics into a compact summary bounded by `maxLength`.
 */
export function truncateStderrSummary(stderr: unknown, maxLength = 300): string | undefined {
  if (typeof stderr !== 'string') return undefined;
  const normalized = stderr.replace(/\r\n/g, '\n').trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 1) return normalized.slice(0, Math.max(0, maxLength));
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Extracts active forensic flag names whose boolean value is true.
 */
export function extractActiveForensicFlags(forensicFlags: unknown): string[] {
  if (!forensicFlags || typeof forensicFlags !== 'object') return [];
  return Object.entries(forensicFlags as Record<string, unknown>)
    .filter(([, val]) => Boolean(val))
    .map(([key]) => key);
}

/**
 * Builds normalized token compaction and lexical lock metrics for a flow event.
 */
export function buildFlowPromptDelta(
  compaction: RawCompactionStatsInput | null | undefined,
  promptChars?: number
): FlowPromptDelta {
  const beforeTokens = Math.max(0, toFiniteNumber(compaction?.beforeTokens, 0));
  const afterTokens = Math.max(0, toFiniteNumber(compaction?.afterTokens, 0));
  const savedTokens =
    compaction?.savedTokens !== undefined
      ? Math.max(0, toFiniteNumber(compaction.savedTokens, 0))
      : Math.max(0, beforeTokens - afterTokens);
  const reductionPct =
    compaction?.reductionPct !== undefined
      ? toFiniteNumber(compaction.reductionPct, 0)
      : beforeTokens > 0
        ? Number(((savedTokens / beforeTokens) * 100).toFixed(2))
        : 0;
  const preserved = Math.max(0, toFiniteNumber(compaction?.preservedTokenCount, 0));
  const required = Math.max(0, toFiniteNumber(compaction?.totalRequiredTokens, 0));
  const lexicalLockPct = required > 0 ? Number(((preserved / required) * 100).toFixed(2)) : 100;

  return {
    beforeTokens,
    afterTokens,
    savedTokens,
    reductionPct,
    lexicalLockPct,
    ...(typeof promptChars === 'number' && Number.isFinite(promptChars) ? { promptChars } : {}),
  };
}

/**
 * Matches a failing trial trace to the most relevant Slow Clock candidate decision.
 * Prioritizes approved decisions that remediated a failing fact or exact evidence hash,
 * falling back to rejected decisions for failing facts, and finally forensic flag matches.
 */
export function matchCandidateDecisionForFailure(
  failedFacts: readonly string[],
  forensicFlags: Readonly<Record<string, unknown>> | undefined,
  cacheKey: string,
  decisions: readonly RawCandidateDecisionInput[]
): RawCandidateDecisionInput | null {
  if (!Array.isArray(decisions) || decisions.length === 0) return null;

  let bestDecision: RawCandidateDecisionInput | null = null;
  let bestScore = -1;

  for (const dec of decisions) {
    if (!dec || typeof dec !== 'object') continue;
    const hashes = toStringArray(dec.evidenceHashes);
    const hashMatch = Boolean(cacheKey) && hashes.includes(cacheKey);
    const factMatch = typeof dec.factId === 'string' && failedFacts.includes(dec.factId);
    const flagMatch =
      typeof dec.triggerFlag === 'string' && Boolean(forensicFlags?.[dec.triggerFlag]);

    if (!hashMatch && !factMatch && !flagMatch) continue;

    const isApproved = dec.status === 'approved';
    const directMatch = hashMatch || factMatch;

    let tierScore = 0;
    if (isApproved && directMatch) {
      tierScore = 1000;
    } else if (!isApproved && directMatch) {
      tierScore = 500;
    } else if (isApproved && flagMatch) {
      tierScore = 200;
    } else {
      tierScore = 100;
    }

    const specificity =
      (hashMatch ? 40 : 0) +
      (factMatch ? 20 : 0) +
      (flagMatch ? 10 : 0) +
      (dec.proposedRuleTextChanged === true ? 5 : 0);

    const totalScore = tierScore + specificity;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDecision = dec;
    }
  }

  return bestDecision;
}

function readGatePassed(gate: { readonly executed?: unknown; readonly passed?: unknown } | undefined): boolean | undefined {
  if (!gate || gate.executed === false) return undefined;
  return typeof gate.passed === 'boolean' ? gate.passed : undefined;
}

/**
 * Extracts structured Slow Clock Gate G1/G2/G3 audit metadata from a candidate decision.
 */
export function buildSlowClockGateInfo(
  dec: RawCandidateDecisionInput | null
): FlowSlowClockGateInfo {
  if (!dec) {
    return { status: 'staged' };
  }

  const status: 'approved' | 'rejected' = dec.status === 'approved' ? 'approved' : 'rejected';
  const audit = dec.gateAudit;
  const g1LexicalPassed = readGatePassed(audit?.lexicalLock);
  const g2ConflictPassed = readGatePassed(audit?.contradictionLinter);
  const g3CanaryPassed = readGatePassed(audit?.canaryReplay);

  const canaryRegressions =
    typeof audit?.canaryReplay?.canaryRegressions === 'number' &&
    Number.isFinite(audit.canaryReplay.canaryRegressions)
      ? audit.canaryReplay.canaryRegressions
      : undefined;

  const targetDeltaPp =
    typeof audit?.canaryReplay?.targetCohortDelta === 'number' &&
    Number.isFinite(audit.canaryReplay.targetCohortDelta)
      ? Number((audit.canaryReplay.targetCohortDelta * 100).toFixed(2))
      : undefined;

  const reasonCandidates = [
    audit?.canaryReplay?.reason,
    audit?.lexicalLock?.reason,
    audit?.contradictionLinter?.violations?.[0]?.message,
  ];
  const reason = reasonCandidates.find(
    (r): r is string => typeof r === 'string' && r.trim().length > 0
  );

  return {
    status,
    ...(typeof dec.candidateId === 'string' ? { candidateId: dec.candidateId } : {}),
    ...(typeof dec.factId === 'string' ? { factId: dec.factId } : {}),
    ...(typeof dec.triggerFlag === 'string' ? { triggerFlag: dec.triggerFlag } : {}),
    ...(g1LexicalPassed !== undefined ? { g1LexicalPassed } : {}),
    ...(g2ConflictPassed !== undefined ? { g2ConflictPassed } : {}),
    ...(g3CanaryPassed !== undefined ? { g3CanaryPassed } : {}),
    ...(canaryRegressions !== undefined ? { canaryRegressions } : {}),
    ...(targetDeltaPp !== undefined ? { targetDeltaPp } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Builds a FlowTraceEvent from a real hope-replay-cache entry and run artifacts.
 */
export function buildTrialFlowTraceEvent(params: {
  readonly runId: string;
  readonly cacheKey: string;
  readonly cartridgeId: 'policy-abac-v4' | 'ts-api-security-v4';
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly shortName: string;
  readonly entry: RawReplayCacheEntryInput;
  readonly compaction?: RawCompactionStatsInput | null;
  readonly promptChars?: number;
  readonly candidateDecisions?: readonly RawCandidateDecisionInput[];
}): FlowTraceEvent {
  const {
    runId,
    cacheKey,
    cartridgeId,
    cartridgeLabel,
    modelId,
    shortName,
    entry,
    compaction,
    promptChars,
    candidateDecisions = [],
  } = params;

  const effectiveCacheKey =
    typeof entry.cacheKey === 'string' && entry.cacheKey.length > 0 ? entry.cacheKey : cacheKey;
  const taskId = String(entry.taskId ?? '');
  const timestamp = String(entry.timestamp ?? '');
  const fullTaskPass = Boolean(entry.fullTaskPass);
  const passedFacts = toStringArray(entry.passedFacts);
  const failedFacts = toStringArray(entry.failedFacts);
  const forensicFlagsObj =
    entry.forensicFlags && typeof entry.forensicFlags === 'object'
      ? (entry.forensicFlags as Readonly<Record<string, unknown>>)
      : undefined;
  const activeForensicFlags = extractActiveForensicFlags(forensicFlagsObj);
  const stderrSummary = truncateStderrSummary(entry.stderr, 300);
  const latencyMs =
    typeof entry.latencyMs === 'number' && Number.isFinite(entry.latencyMs)
      ? entry.latencyMs
      : undefined;

  let outcome: FlowOutcome;
  let terminalNode: FlowNodeId;
  let pathNodes: readonly FlowNodeId[];
  let slowClockGate: FlowSlowClockGateInfo;

  if (fullTaskPass) {
    outcome = 'PASS';
    terminalNode = 'VERIFIED_OUTPUT';
    pathNodes = ['TASK_IN', 'FAST_CLOCK', 'ORACLE_VERIFIER', 'VERIFIED_OUTPUT'];
    slowClockGate = { status: 'none' };
  } else {
    const matched = matchCandidateDecisionForFailure(
      failedFacts,
      forensicFlagsObj,
      effectiveCacheKey,
      candidateDecisions
    );

    if (matched && matched.status === 'approved') {
      outcome = 'QUARANTINE';
      terminalNode = 'GATE_APPROVED';
      pathNodes = [
        'TASK_IN',
        'FAST_CLOCK',
        'ORACLE_VERIFIER',
        'QUARANTINE_VAULT',
        'SLOW_CLOCK_GATE',
        'GATE_APPROVED',
      ];
      slowClockGate = buildSlowClockGateInfo(matched);
    } else if (matched && matched.status === 'rejected') {
      outcome = 'FAIL';
      terminalNode = 'GATE_REJECTED';
      pathNodes = [
        'TASK_IN',
        'FAST_CLOCK',
        'ORACLE_VERIFIER',
        'QUARANTINE_VAULT',
        'SLOW_CLOCK_GATE',
        'GATE_REJECTED',
      ];
      slowClockGate = buildSlowClockGateInfo(matched);
    } else {
      outcome = 'FAIL';
      terminalNode = 'QUARANTINE_VAULT';
      pathNodes = [
        'TASK_IN',
        'FAST_CLOCK',
        'ORACLE_VERIFIER',
        'QUARANTINE_VAULT',
        'SLOW_CLOCK_GATE',
      ];
      slowClockGate = { status: 'staged' };
    }
  }

  return {
    id: `${runId}:${effectiveCacheKey}`,
    kind: 'trial',
    cartridgeId,
    cartridgeLabel,
    modelId,
    shortName,
    taskId,
    retrievedRuleIds: toStringArray(entry.retrievedRuleIds),
    fullTaskPass,
    outcome,
    terminalNode,
    pathNodes,
    passedFactsCount: toFiniteNumber(entry.passedFactsCount, passedFacts.length),
    boundFactsCount: toFiniteNumber(
      entry.boundFactsCount,
      passedFacts.length + failedFacts.length
    ),
    factPassRate: toFiniteNumber(entry.factPassRate, 0),
    passedFacts,
    failedFacts,
    activeForensicFlags,
    ...(stderrSummary !== undefined ? { stderrSummary } : {}),
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    timestamp,
    source: String(entry.source ?? 'live-replay'),
    promptDelta: buildFlowPromptDelta(compaction, promptChars),
    slowClockGate,
  };
}

/**
 * Builds a FlowTraceEvent from a staged Red-Team Loopback candidate and its threat metadata.
 */
export function buildRedTeamFlowTraceEvent(params: {
  readonly candidate: RawRedTeamCandidateInput;
  readonly threat?: RawRedTeamThreatInput | null;
  readonly modelId?: string;
  readonly dryRun?: boolean;
}): FlowTraceEvent {
  const { candidate, threat, modelId, dryRun } = params;
  const candidateId = String(candidate.candidateId ?? '');
  const factId = String(candidate.factId ?? threat?.id ?? '');
  const triggerFlag = String(candidate.triggerFlag ?? threat?.category ?? '');
  const route = String(candidate.route ?? threat?.route ?? '/');
  const method = String(threat?.method ?? 'GET');
  const proposedRuleText = String(candidate.proposedRuleText ?? '');
  const evidenceHashes = toStringArray(candidate.evidenceHashes);
  const evidenceHash = evidenceHashes[0] ?? '';
  const timestamp = String(candidate.stagedAt ?? '');
  const gateStatus: 'staged' | 'approved' | 'rejected' =
    candidate.status === 'approved' || candidate.status === 'rejected'
      ? candidate.status
      : 'staged';

  let outcome: FlowOutcome = 'QUARANTINE';
  let terminalNode: FlowNodeId = 'SLOW_CLOCK_GATE';
  let pathNodes: readonly FlowNodeId[] = [
    'TASK_IN',
    'FAST_CLOCK',
    'ORACLE_VERIFIER',
    'QUARANTINE_VAULT',
    'SLOW_CLOCK_GATE',
  ];

  if (gateStatus === 'approved') {
    outcome = 'QUARANTINE';
    terminalNode = 'GATE_APPROVED';
    pathNodes = [
      'TASK_IN',
      'FAST_CLOCK',
      'ORACLE_VERIFIER',
      'QUARANTINE_VAULT',
      'SLOW_CLOCK_GATE',
      'GATE_APPROVED',
    ];
  } else if (gateStatus === 'rejected') {
    outcome = 'FAIL';
    terminalNode = 'GATE_REJECTED';
    pathNodes = [
      'TASK_IN',
      'FAST_CLOCK',
      'ORACLE_VERIFIER',
      'QUARANTINE_VAULT',
      'SLOW_CLOCK_GATE',
      'GATE_REJECTED',
    ];
  }

  const title = typeof threat?.title === 'string' ? threat.title : undefined;
  const severity = typeof threat?.severity === 'string' ? threat.severity : undefined;
  const expectedDefense =
    typeof threat?.expectedDefense === 'string' ? threat.expectedDefense : undefined;
  const stderrSummary = truncateStderrSummary(
    title ? `${method} ${route} — ${title}` : proposedRuleText,
    300
  );

  const resolvedModelId =
    typeof modelId === 'string' && modelId.trim().length > 0
      ? modelId.trim()
      : 'dry-run-deterministic';

  return {
    id: `redteam:${candidateId}:${timestamp}`,
    kind: 'redteam_probe',
    cartridgeId: 'redteam-v1-loopback',
    cartridgeLabel: 'Red-Team Loopback v1',
    modelId: resolvedModelId,
    shortName: 'Red-Team Loopback',
    taskId: factId,
    retrievedRuleIds: [],
    fullTaskPass: false,
    outcome,
    terminalNode,
    pathNodes,
    passedFactsCount: 0,
    boundFactsCount: 1,
    factPassRate: 0,
    passedFacts: [],
    failedFacts: factId ? [factId] : [],
    activeForensicFlags: triggerFlag ? [triggerFlag] : [],
    ...(stderrSummary !== undefined ? { stderrSummary } : {}),
    timestamp,
    source: dryRun ? 'redteam-dry-run' : 'redteam-loopback',
    promptDelta: {
      beforeTokens: 0,
      afterTokens: 0,
      savedTokens: 0,
      reductionPct: 0,
      lexicalLockPct: 100,
    },
    slowClockGate: {
      status: gateStatus,
      candidateId,
      factId,
      triggerFlag,
      ...(expectedDefense !== undefined ? { reason: expectedDefense } : {}),
    },
    redTeam: {
      candidateId,
      factId,
      method,
      route,
      triggerFlag,
      ...(title !== undefined ? { title } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(expectedDefense !== undefined ? { expectedDefense } : {}),
      proposedRuleText,
      evidenceHash,
      status: gateStatus,
    },
  };
}

/**
 * Computes deterministic aggregate statistics across a slice of FlowTraceEvents.
 * Uses `aggregateTotals` when provided so run-level compaction token savings are
 * never double-counted across multiple task trials in the same run.
 */
export function computeFlowTraceStats(
  events: readonly FlowTraceEvent[],
  aggregateTotals?: FlowAggregateTotalsInput
): FlowTraceStats {
  let passed = 0;
  let failed = 0;
  let quarantined = 0;
  let approvedAtGate = 0;
  let rejectedAtGate = 0;
  let redTeamStaged = 0;

  // Deduplicate run-level compaction metrics by (cartridgeId, modelId)
  const seenRunDeltas = new Map<string, FlowPromptDelta>();

  for (const ev of events) {
    if (ev.outcome === 'PASS') passed++;
    else if (ev.outcome === 'FAIL') failed++;
    else if (ev.outcome === 'QUARANTINE') quarantined++;

    if (ev.slowClockGate.status === 'approved') approvedAtGate++;
    else if (ev.slowClockGate.status === 'rejected') rejectedAtGate++;

    if (ev.kind === 'redteam_probe' && ev.slowClockGate.status === 'staged') {
      redTeamStaged++;
    }

    if (ev.promptDelta.beforeTokens > 0) {
      const runKey = `${ev.cartridgeId}::${ev.modelId}`;
      if (!seenRunDeltas.has(runKey)) {
        seenRunDeltas.set(runKey, ev.promptDelta);
      }
    }
  }

  let savedTokens = 0;
  let weightedReductionPct = 0;
  let lexicalRetentionPct = 0;

  if (
    aggregateTotals &&
    (aggregateTotals.savedTokens !== undefined ||
      (aggregateTotals.totalBeforeTokens !== undefined &&
        aggregateTotals.totalAfterTokens !== undefined))
  ) {
    const before = Math.max(0, toFiniteNumber(aggregateTotals.totalBeforeTokens, 0));
    const after = Math.max(0, toFiniteNumber(aggregateTotals.totalAfterTokens, 0));
    savedTokens =
      aggregateTotals.savedTokens !== undefined
        ? Math.max(0, toFiniteNumber(aggregateTotals.savedTokens, 0))
        : Math.max(0, before - after);
    weightedReductionPct =
      aggregateTotals.weightedReductionPct !== undefined
        ? toFiniteNumber(aggregateTotals.weightedReductionPct, 0)
        : before > 0
          ? Number(((savedTokens / before) * 100).toFixed(2))
          : 0;
    const preserved = Math.max(0, toFiniteNumber(aggregateTotals.totalPreservedTokens, 0));
    const required = Math.max(0, toFiniteNumber(aggregateTotals.totalRequiredTokens, 0));
    lexicalRetentionPct =
      aggregateTotals.lexicalRetentionPct !== undefined
        ? toFiniteNumber(aggregateTotals.lexicalRetentionPct, 100)
        : required > 0
          ? Number(((preserved / required) * 100).toFixed(2))
          : 100;
  } else if (seenRunDeltas.size > 0) {
    let totalBefore = 0;
    let totalAfter = 0;
    let weightedLexicalSum = 0;
    for (const delta of seenRunDeltas.values()) {
      totalBefore += delta.beforeTokens;
      totalAfter += delta.afterTokens;
      weightedLexicalSum += delta.lexicalLockPct * delta.beforeTokens;
    }
    savedTokens = Math.max(0, totalBefore - totalAfter);
    weightedReductionPct =
      totalBefore > 0 ? Number(((savedTokens / totalBefore) * 100).toFixed(2)) : 0;
    lexicalRetentionPct =
      totalBefore > 0 ? Number((weightedLexicalSum / totalBefore).toFixed(2)) : 100;
  } else if (events.length > 0) {
    const avgLex =
      events.reduce((acc, ev) => acc + ev.promptDelta.lexicalLockPct, 0) / events.length;
    lexicalRetentionPct = Number(avgLex.toFixed(2));
  } else {
    lexicalRetentionPct = 100;
  }

  return {
    total: events.length,
    passed,
    failed,
    quarantined,
    approvedAtGate,
    rejectedAtGate,
    redTeamStaged,
    savedTokens,
    weightedReductionPct,
    lexicalRetentionPct,
  };
}

/**
 * Filters a FlowTraceEvent slice by cartridge, model, visited DAG node, outcome, or kind.
 */
export function filterFlowTraceEvents(
  events: readonly FlowTraceEvent[],
  filters: FlowTraceFilterOptions
): readonly FlowTraceEvent[] {
  return events.filter((ev) => {
    if (filters.cartridgeId && ev.cartridgeId !== filters.cartridgeId) return false;
    if (filters.modelId && ev.modelId !== filters.modelId) return false;
    if (filters.nodeId && !ev.pathNodes.includes(filters.nodeId)) return false;
    if (filters.outcome && ev.outcome !== filters.outcome) return false;
    if (filters.kind && ev.kind !== filters.kind) return false;
    return true;
  });
}
