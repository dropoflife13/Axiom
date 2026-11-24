// dashboard/src/lib/v4-hope.ts
// Strongly-typed contracts & loader for the Axiom-HOPE v4 Governance Dashboard.

export type V4PilotArm = 'A' | 'C' | 'C_ID_prereq' | 'C_ID_auto' | 'C_ID_hope';

export interface V4ArmStats {
  readonly arm: string;
  readonly totalTasks: number;
  readonly fullTaskPassCount: number;
  readonly fullTaskPassRate: number;
  readonly meanFactPassRate: number;
  readonly committedCount: number;
  readonly committedRate: number;
  readonly p01RetrievedCount?: number;
  readonly p02RetrievedCount?: number;
  readonly ts01RetrievedCount?: number;
  readonly ts04RetrievedCount?: number;
  readonly ts08RetrievedCount?: number;
  readonly forensicDefectCounts: Record<string, number>;
}

export interface V4TsApiSummary {
  readonly schemaVersion: string;
  readonly cartridgeId: string;
  readonly model: string;
  readonly modelSlug: string;
  readonly topK: number;
  readonly temperature: number;
  readonly totalTrials: number;
  readonly arms: Record<V4PilotArm, V4ArmStats>;
  readonly contrastsPp: V4ContrastsPp;
  readonly generatedAt: string;
}

export interface V4ContrastsPp {
  readonly C_ID_auto_minus_C_task: number;
  readonly C_ID_auto_minus_C_fact: number;
  readonly C_ID_prereq_minus_C_ID_auto_task: number;
  readonly C_ID_prereq_minus_C_ID_auto_fact: number;
  readonly C_ID_prereq_minus_C_task: number;
  readonly C_ID_prereq_minus_C_fact: number;
  readonly C_ID_prereq_minus_A_task: number;
  readonly C_ID_prereq_minus_A_fact: number;
  readonly C_ID_hope_minus_C_task: number;
  readonly C_ID_hope_minus_C_fact: number;
  readonly C_ID_hope_minus_C_ID_auto_task: number;
  readonly C_ID_hope_minus_C_ID_auto_fact: number;
  readonly C_ID_hope_minus_C_ID_prereq_task: number;
  readonly C_ID_hope_minus_C_ID_prereq_fact: number;
  readonly C_ID_hope_minus_A_task: number;
  readonly C_ID_hope_minus_A_fact: number;
}

export interface V4ModelSummaryEntry {
  readonly modelId: string;
  readonly provider: string;
  readonly status: string;
  readonly completedTrials: number;
  readonly summary: {
    readonly model: string;
    readonly modelSlug: string;
    readonly topK: number;
    readonly temperature: number;
    readonly totalTrials: number;
    readonly arms: Record<V4PilotArm, V4ArmStats>;
    readonly contrastsPp: V4ContrastsPp;
  };
  readonly promotedPrerequisiteGraph: Record<string, readonly string[]>;
  readonly updatedRuleIds: readonly string[];
}

export interface V4PrerequisiteEdge {
  readonly from: string;
  readonly to: string;
}

export interface V4CandidateGateAudit {
  readonly evaluatedAt: string;
  readonly passed: boolean;
  readonly rejectedByGate: 'lexical_lock' | 'contradiction_linter' | 'canary_replay' | null;
  readonly lexicalLock: {
    readonly executed: boolean;
    readonly passed: boolean;
    readonly requiredTokens: readonly string[];
    readonly retainedTokens: readonly string[];
    readonly missingTokens: readonly string[];
    readonly retentionRate: number;
  };
  readonly contradictionLinter: {
    readonly executed: boolean;
    readonly passed: boolean;
    readonly violations: ReadonlyArray<{
      readonly code: string;
      readonly ruleId: string;
      readonly message: string;
    }>;
  };
  readonly canaryReplay: {
    readonly executed: boolean;
    readonly passed: boolean;
    readonly targetBeforePassCount: number;
    readonly targetAfterPassCount: number;
    readonly targetTotal: number;
    readonly targetCohortDelta: number;
    readonly canaryBeforePassCount: number;
    readonly canaryAfterPassCount: number;
    readonly canaryTotal: number;
    readonly canaryRegressions: number;
    readonly regressedCanaryTaskIds: readonly string[];
    readonly reason?: string;
  };
}

export interface V4PromotionReceipt {
  readonly candidateId: string;
  readonly factId: string;
  readonly approvedAt: string;
  readonly beforeSha256: string;
  readonly afterSha256: string;
  readonly updatedRuleIds: readonly string[];
  readonly addedPrerequisiteEdges: readonly V4PrerequisiteEdge[];
  readonly evidenceHashes: readonly string[];
}

export interface V4CandidateDecision {
  readonly candidateId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly origin: string;
  readonly proposedPrerequisiteEdges: readonly V4PrerequisiteEdge[];
  readonly proposedRuleTextChanged: boolean;
  readonly evidenceHashes: readonly string[];
  readonly status: 'approved' | 'rejected';
  readonly rejectedByGate: 'lexical_lock' | 'contradiction_linter' | 'canary_replay' | null;
  readonly gateAudit: V4CandidateGateAudit;
  readonly receipt?: V4PromotionReceipt;
}

export interface V4HopeReceipt {
  readonly file?: string;
  readonly model: string;
  readonly topK: number;
  readonly temperature: number;
  readonly initialSnapshotSha256: string;
  readonly finalSnapshotSha256: string;
  readonly promotedPrerequisiteGraph: Record<string, readonly string[]>;
  readonly updatedRuleStatements: Record<string, string>;
  readonly fastClockTraceCount: number;
  readonly canaryCohortTaskIds: readonly string[];
  readonly candidateDecisions: readonly V4CandidateDecision[];
  readonly promotionReceipts: readonly V4PromotionReceipt[];
  readonly generatedAt: string;
}

export interface V4HopeDashboardPayload {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly source?: 'live-artifacts' | 'static-snapshot';
  readonly cartridges: {
    readonly policyAbac: {
      readonly id: string;
      readonly name: string;
      readonly version: string;
      readonly taskCount: number;
      readonly ruleCount: number;
      readonly totalLiveTrials: number;
      readonly modelCount: number;
      readonly topK: number;
      readonly domainBreakdown: Record<string, number>;
      readonly tasksSha256: string;
      readonly defaultPrerequisiteEdgeCount: number;
      readonly vaultAudits: {
        readonly c: {
          readonly sha256: string;
          readonly retained: number;
          readonly total: number;
          readonly rate: number;
          readonly rulesAt100Pct: number;
        };
        readonly cidAuto: {
          readonly sha256: string;
          readonly retained: number;
          readonly total: number;
          readonly rate: number;
          readonly rulesAt100Pct: number;
        };
      };
    };
    readonly postgresV3: {
      readonly id: string;
      readonly name: string;
      readonly version: string;
      readonly taskCount: number;
      readonly ruleCount: number;
      readonly totalV3Trials: number;
      readonly modelCount: number;
      readonly topK: number;
      readonly cohortBreakdown: Record<string, number>;
      readonly factsSha256: string;
      readonly tasksSha256: string;
      readonly lexicalRecallMatched: number;
      readonly lexicalRecallTotal: number;
      readonly f05BaselineDisplacedBoundTasks: number;
      readonly f05V4DisplacedBoundTasks: number;
      readonly f05V3OmissionsAcrossPool: number;
      readonly defaultPrerequisiteEdgeCount: number;
      readonly v3PooledHeadline: {
        readonly modelCount: number;
        readonly totalTrials: number;
        readonly cidMinusC_remlPp: number;
        readonly cidMinusC_piLowPp: number;
        readonly cidMinusC_piHighPp: number;
        readonly did_remlPp: number;
      };
    };
    readonly tsApiSecurity: {
      readonly id: string;
      readonly name: string;
      readonly version: string;
      readonly taskCount: number;
      readonly ruleCount: number;
      readonly totalLiveTrials: number;
      readonly modelCount: number;
      readonly topK: number;
      readonly domainBreakdown: Record<string, number>;
      readonly tasksSha256: string;
      readonly defaultPrerequisiteEdgeCount: number;
      readonly vaultAudits: {
        readonly c: {
          readonly sha256: string;
          readonly retained: number;
          readonly total: number;
          readonly rate: number;
          readonly rulesAt100Pct: number;
        };
        readonly cidAuto: {
          readonly sha256: string;
          readonly retained: number;
          readonly total: number;
          readonly rate: number;
          readonly rulesAt100Pct: number;
        };
      };
    };
  };
  readonly crossModel: {
    readonly generatedAt: string;
    readonly models: readonly V4ModelSummaryEntry[];
  };
  readonly receipts: readonly V4HopeReceipt[];
  readonly tsApi: {
    readonly crossModel: {
      readonly generatedAt: string;
      readonly models: readonly V4ModelSummaryEntry[];
    };
    readonly receipts: readonly V4HopeReceipt[];
    readonly summary: V4TsApiSummary;
    readonly receipt: V4HopeReceipt;
  };
}

export async function fetchV4HopePayload(
  signal?: AbortSignal
): Promise<V4HopeDashboardPayload> {
  try {
    const apiRes = await fetch('/api/v4-hope', { cache: 'no-store', signal });
    if (apiRes.ok) {
      return (await apiRes.json()) as V4HopeDashboardPayload;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
  }

  const snapRes = await fetch('/data/v4-hope-snapshot.json', {
    cache: 'no-store',
    signal,
  });
  if (!snapRes.ok) {
    throw new Error(`Failed to load v4 Axiom-HOPE data (HTTP ${snapRes.status}).`);
  }
  const data = (await snapRes.json()) as V4HopeDashboardPayload;
  return { ...data, source: 'static-snapshot' };
}

export function formatPct1(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatSignedPp(pp: number): string {
  const sign = pp >= 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)} pp`;
}

export function shortSha(sha: string, prefix = 12, suffix = 6): string {
  if (!sha || sha.length <= prefix + suffix + 3) return sha || '—';
  return `${sha.slice(0, prefix)}…${sha.slice(-suffix)}`;
}
