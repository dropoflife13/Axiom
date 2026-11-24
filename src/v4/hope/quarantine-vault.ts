// src/v4/hope/quarantine-vault.ts
// Intermediate Clock: Cryptographic Quarantine Vault for Axiom-HOPE (Ablation v4).
// Stages recurring Fast Clock failure clusters as isolated candidate patches with
// SHA-256 provenance digests. Never mutates canonical rules or frozen v2/v3 state.

import fs from 'node:fs';
import path from 'node:path';
import {
  computeCanonicalJsonSha256,
  type EpisodicRingBuffer,
  type RecurringFailureCluster,
} from './fast-clock.js';

export type QuarantineStatus = 'staged' | 'approved' | 'rejected';

export interface PrerequisiteEdge {
  /** Dependent rule ID (e.g., 'F-36'). */
  readonly from: string;
  /** Required foundational prerequisite rule ID (e.g., 'F-05'). */
  readonly to: string;
}

export interface LexicalLockGateResult {
  readonly executed: boolean;
  readonly passed: boolean;
  readonly requiredTokens: readonly string[];
  readonly retainedTokens: readonly string[];
  readonly missingTokens: readonly string[];
  readonly retentionRate: number;
  readonly reason?: string;
}

export type ContradictionViolationCode =
  | 'INLINE_REFERENCES_CONTRADICTION'
  | 'DUPLICATE_PRIMARY_KEY_CONTRADICTION'
  | 'USER_METADATA_AUTH_CONTRADICTION'
  | 'MISSING_POSITIVE_GRANT_CONTRADICTION'
  | 'CIRCULAR_PREREQUISITE_EDGE'
  | 'INVALID_PREREQUISITE_EDGE';

export interface ContradictionViolation {
  readonly code: ContradictionViolationCode;
  readonly ruleId: string;
  readonly message: string;
  readonly cyclePath?: readonly string[];
}

export interface ContradictionLinterGateResult {
  readonly executed: boolean;
  readonly passed: boolean;
  readonly violations: readonly ContradictionViolation[];
}

export interface CanaryReplayGateResult {
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
}

export interface SlowClockGateAudit {
  readonly evaluatedAt: string;
  readonly passed: boolean;
  readonly rejectedByGate: 'lexical_lock' | 'contradiction_linter' | 'canary_replay' | null;
  readonly lexicalLock: LexicalLockGateResult;
  readonly contradictionLinter: ContradictionLinterGateResult;
  readonly canaryReplay: CanaryReplayGateResult;
}

export interface QuarantineCandidate {
  readonly candidateId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly proposedRuleText: string;
  readonly proposedPrerequisiteEdges: readonly PrerequisiteEdge[];
  readonly evidenceHashes: readonly string[];
  readonly observedCount: number;
  readonly status: QuarantineStatus;
  readonly gateAudit: SlowClockGateAudit | null;
  readonly cartridgeId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StageCandidateInput {
  readonly candidateId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly proposedRuleText: string;
  readonly proposedPrerequisiteEdges?: readonly PrerequisiteEdge[];
  readonly evidenceHashes: readonly string[];
  readonly observedCount?: number;
  readonly cartridgeId?: string;
  readonly timestamp?: string;
}

export interface CandidatePatchProposal {
  readonly candidateId?: string;
  readonly proposedRuleText?: string;
  readonly proposedPrerequisiteEdges?: readonly PrerequisiteEdge[];
}

export type CandidateProposalBuilder = (
  cluster: RecurringFailureCluster
) => CandidatePatchProposal | null | undefined;

export interface IngestClustersOptions {
  /** Optional custom builder translating a failure cluster into a rule/edge patch proposal. */
  readonly proposalBuilder?: CandidateProposalBuilder;
  /** Optional map of current canonical rule texts used as default `proposedRuleText` for edge-only patches. */
  readonly canonicalRuleTexts?: ReadonlyMap<string, string>;
  /** Override minimum occurrences threshold for this ingestion call. */
  readonly minOccurrences?: number;
  /** Deterministic timestamp override (useful in tests). */
  readonly timestamp?: string;
}

export interface QuarantineIngestResult {
  readonly staged: readonly QuarantineCandidate[];
  readonly updated: readonly QuarantineCandidate[];
  readonly skippedBelowThreshold: number;
}

export interface QuarantineVaultOptions {
  /** Minimum occurrences required before staging a recurring cluster (default: 3). */
  readonly minOccurrences?: number;
  /** File path for deterministic JSON persistence (default: `.axiom-state/v4/quarantine-vault.json`). */
  readonly statePath?: string;
}

export interface SerializedQuarantineVault {
  readonly schemaVersion: '4.0.0';
  readonly minOccurrences: number;
  readonly candidates: readonly QuarantineCandidate[];
}

export const DEFAULT_QUARANTINE_STATE_PATH = path.resolve(
  '.axiom-state',
  'v4',
  'quarantine-vault.json'
);

const FORBIDDEN_FROZEN_PATH_FRAGMENTS: readonly RegExp[] = [
  /(?:^|[\\/])\.axiom-state[\\/]memory(?:-[^\\/]+)?\.json$/i,
  /(?:^|[\\/])\.axiom-state[\\/]runs-v3(?:[\\/]|$)/i,
  /(?:^|[\\/])\.axiom-state[\\/]quarantine[\\/]v3-candidates\.json$/i,
  /(?:^|[\\/])fixtures[\\/]task-v3(?:[\\/]|$)/i,
  /(?:^|[\\/])docs[\\/]AXIOM-(?:V3-PAPER-RESULTS|PAPER)\.md$/i,
];

function assertSafeV4StatePath(statePath: string): void {
  const resolved = path.resolve(statePath);
  for (const pattern of FORBIDDEN_FROZEN_PATH_FRAGMENTS) {
    if (pattern.test(resolved)) {
      throw new Error(
        `Refusing to bind QuarantineVault to frozen v2/v3 artifact path: ${resolved}`
      );
    }
  }
}

function normalizeEdges(
  edges: readonly PrerequisiteEdge[] | undefined
): readonly PrerequisiteEdge[] {
  if (!edges || edges.length === 0) return Object.freeze([]);
  const seen = new Set<string>();
  const normalized: PrerequisiteEdge[] = [];
  for (const edge of edges) {
    const from = edge.from.trim();
    const to = edge.to.trim();
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(Object.freeze({ from, to }));
  }
  normalized.sort((a, b) => {
    const cmp = a.from.localeCompare(b.from);
    return cmp !== 0 ? cmp : a.to.localeCompare(b.to);
  });
  return Object.freeze(normalized);
}

function mergeUniqueStrings(
  existing: readonly string[],
  incoming: readonly string[]
): readonly string[] {
  const seen = new Set<string>(existing);
  const out = [...existing];
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return Object.freeze(out);
}

function freezeCandidate(candidate: QuarantineCandidate): QuarantineCandidate {
  return Object.freeze({
    ...candidate,
    proposedPrerequisiteEdges: normalizeEdges(candidate.proposedPrerequisiteEdges),
    evidenceHashes: Object.freeze([...candidate.evidenceHashes]),
  });
}

function edgeSignature(edges: readonly PrerequisiteEdge[]): string {
  return edges.map((e) => `${e.from}->${e.to}`).join(',');
}

/**
 * Cryptographic Quarantine Vault (Intermediate Clock).
 *
 * Isolates recurring failure patches from canonical memory until promoted by the Slow Clock.
 * Every candidate carries SHA-256 artifact digests proving Fast Clock provenance.
 */
export class QuarantineVault {
  readonly minOccurrences: number;
  readonly statePath: string;
  private readonly candidates = new Map<string, QuarantineCandidate>();

  constructor(options: QuarantineVaultOptions = {}) {
    const minOccurrences = options.minOccurrences ?? 3;
    if (!Number.isInteger(minOccurrences) || minOccurrences < 1) {
      throw new Error(
        `QuarantineVault minOccurrences must be a positive integer (received ${minOccurrences}).`
      );
    }
    const resolvedPath = path.resolve(options.statePath ?? DEFAULT_QUARANTINE_STATE_PATH);
    assertSafeV4StatePath(resolvedPath);

    this.minOccurrences = minOccurrences;
    this.statePath = resolvedPath;
  }

  /**
   * Stages or deduplicates a single isolated candidate record.
   * Deduplicates by `candidateId` OR matching `(factId, triggerFlag, proposedRuleText, edges)`.
   */
  stageCandidate(input: StageCandidateInput): {
    candidate: QuarantineCandidate;
    isNew: boolean;
  } {
    const now = input.timestamp ?? new Date().toISOString();
    const normalizedEdges = normalizeEdges(input.proposedPrerequisiteEdges);
    const incomingHashes = mergeUniqueStrings([], input.evidenceHashes);
    const incomingCount = Math.max(input.observedCount ?? incomingHashes.length, incomingHashes.length);

    let existing = this.candidates.get(input.candidateId);
    if (!existing) {
      const targetSig = `${input.factId}::${input.triggerFlag}::${input.proposedRuleText}::${edgeSignature(normalizedEdges)}`;
      for (const candidate of this.candidates.values()) {
        const sig = `${candidate.factId}::${candidate.triggerFlag}::${candidate.proposedRuleText}::${edgeSignature(candidate.proposedPrerequisiteEdges)}`;
        if (sig === targetSig) {
          existing = candidate;
          break;
        }
      }
    }

    if (existing) {
      const mergedHashes = mergeUniqueStrings(existing.evidenceHashes, incomingHashes);
      const mergedEdges = normalizeEdges([
        ...existing.proposedPrerequisiteEdges,
        ...normalizedEdges,
      ]);
      const updated = freezeCandidate({
        ...existing,
        proposedPrerequisiteEdges: mergedEdges,
        evidenceHashes: mergedHashes,
        observedCount: Math.max(existing.observedCount, incomingCount, mergedHashes.length),
        updatedAt: now,
      });
      this.candidates.set(existing.candidateId, updated);
      return { candidate: updated, isNew: false };
    }

    const created = freezeCandidate({
      candidateId: input.candidateId,
      factId: input.factId,
      triggerFlag: input.triggerFlag,
      proposedRuleText: input.proposedRuleText,
      proposedPrerequisiteEdges: normalizedEdges,
      evidenceHashes: incomingHashes,
      observedCount: incomingCount,
      status: 'staged',
      gateAudit: null,
      ...(input.cartridgeId !== undefined ? { cartridgeId: input.cartridgeId } : {}),
      createdAt: now,
      updatedAt: now,
    });

    this.candidates.set(created.candidateId, created);
    return { candidate: created, isNew: true };
  }

  /**
   * Ingests recurring failure clusters directly from a Fast Clock `EpisodicRingBuffer`.
   */
  ingestFromFastClock(
    fastClock: EpisodicRingBuffer,
    options: IngestClustersOptions = {}
  ): QuarantineIngestResult {
    const threshold = options.minOccurrences ?? this.minOccurrences;
    const allClusters = fastClock.getRecurringFailureClusters(1);
    return this.ingestClusters(allClusters, { ...options, minOccurrences: threshold });
  }

  /**
   * Filters clusters by `minOccurrences`, translates qualifying clusters into isolated
   * `QuarantineCandidate` records, and deduplicates evidence hashes deterministically.
   */
  ingestClusters(
    clusters: readonly RecurringFailureCluster[],
    options: IngestClustersOptions = {}
  ): QuarantineIngestResult {
    const threshold = options.minOccurrences ?? this.minOccurrences;
    const staged: QuarantineCandidate[] = [];
    const updated: QuarantineCandidate[] = [];
    let skippedBelowThreshold = 0;

    // When no custom proposalBuilder is supplied, select the strongest cluster per factId
    // so a single failing rule with multiple correlated flags doesn't stage noisy duplicates.
    const seenDefaultFacts = new Set<string>();

    for (const cluster of clusters) {
      if (cluster.occurrences < threshold) {
        skippedBelowThreshold++;
        continue;
      }

      let proposal: CandidatePatchProposal | null | undefined;
      if (options.proposalBuilder) {
        proposal = options.proposalBuilder(cluster);
        if (!proposal) continue;
      } else {
        if (seenDefaultFacts.has(cluster.factId)) continue;
        seenDefaultFacts.add(cluster.factId);
        proposal = {
          candidateId: `Q-${cluster.factId}`,
          proposedPrerequisiteEdges: [],
        };
      }

      const candidateId = proposal.candidateId ?? `Q-${cluster.factId}`;
      const proposedRuleText =
        proposal.proposedRuleText ??
        options.canonicalRuleTexts?.get(cluster.factId) ??
        '';

      const res = this.stageCandidate({
        candidateId,
        factId: cluster.factId,
        triggerFlag: cluster.triggerFlag,
        proposedRuleText,
        proposedPrerequisiteEdges: proposal.proposedPrerequisiteEdges ?? [],
        evidenceHashes: cluster.evidenceHashes,
        observedCount: cluster.occurrences,
        cartridgeId: cluster.cartridgeId,
        timestamp: options.timestamp ?? cluster.latestTimestamp,
      });

      if (res.isNew) {
        staged.push(res.candidate);
      } else {
        updated.push(res.candidate);
      }
    }

    return {
      staged: Object.freeze(staged),
      updated: Object.freeze(updated),
      skippedBelowThreshold,
    };
  }

  /**
   * Records a Slow Clock gate decision (`approved` or `rejected`) and structured `gateAudit`.
   */
  recordGateDecision(
    candidateId: string,
    status: 'approved' | 'rejected',
    gateAudit: SlowClockGateAudit
  ): QuarantineCandidate {
    const existing = this.candidates.get(candidateId);
    if (!existing) {
      throw new Error(`QuarantineCandidate "${candidateId}" not found in QuarantineVault.`);
    }
    const updated = freezeCandidate({
      ...existing,
      status,
      gateAudit,
      updatedAt: gateAudit.evaluatedAt,
    });
    this.candidates.set(candidateId, updated);
    return updated;
  }

  getCandidate(candidateId: string): QuarantineCandidate | undefined {
    return this.candidates.get(candidateId);
  }

  listCandidates(status?: QuarantineStatus): readonly QuarantineCandidate[] {
    const all = Array.from(this.candidates.values())
      .filter((c) => (status ? c.status === status : true))
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    return Object.freeze(all);
  }

  get size(): number {
    return this.candidates.size;
  }

  toJSON(): SerializedQuarantineVault {
    return {
      schemaVersion: '4.0.0',
      minOccurrences: this.minOccurrences,
      candidates: this.listCandidates(),
    };
  }

  /**
   * Deterministic canonical JSON serialization (candidates sorted by `candidateId`).
   */
  serialize(): string {
    return `${JSON.stringify(this.toJSON(), null, 2)}\n`;
  }

  computeSha256(): string {
    return computeCanonicalJsonSha256(this.toJSON());
  }

  /**
   * Persists the QuarantineVault to `this.statePath` (always isolated from frozen v2/v3 state).
   * Returns the SHA-256 digest of the written vault snapshot.
   */
  saveToDisk(): string {
    assertSafeV4StatePath(this.statePath);
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const serialized = this.serialize();
    fs.writeFileSync(this.statePath, serialized, 'utf8');
    return this.computeSha256();
  }

  static deserialize(
    json: string,
    options: QuarantineVaultOptions = {}
  ): QuarantineVault {
    const parsed = JSON.parse(json) as Partial<SerializedQuarantineVault>;
    if (parsed.schemaVersion !== '4.0.0') {
      throw new Error(
        `Unsupported QuarantineVault schemaVersion: ${String(parsed.schemaVersion)}`
      );
    }
    const vault = new QuarantineVault({
      minOccurrences: options.minOccurrences ?? parsed.minOccurrences ?? 3,
      statePath: options.statePath,
    });
    for (const rawCandidate of parsed.candidates ?? []) {
      const frozen = freezeCandidate(rawCandidate);
      vault.candidates.set(frozen.candidateId, frozen);
    }
    return vault;
  }

  static loadFromDisk(
    statePath: string = DEFAULT_QUARANTINE_STATE_PATH,
    options: Omit<QuarantineVaultOptions, 'statePath'> = {}
  ): QuarantineVault {
    const resolved = path.resolve(statePath);
    assertSafeV4StatePath(resolved);
    if (!fs.existsSync(resolved)) {
      return new QuarantineVault({ ...options, statePath: resolved });
    }
    const raw = fs.readFileSync(resolved, 'utf8');
    return QuarantineVault.deserialize(raw, { ...options, statePath: resolved });
  }
}
