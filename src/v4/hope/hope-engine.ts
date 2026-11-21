// src/v4/hope/hope-engine.ts
// End-to-End 3-Clock Symbolic Axiom-HOPE Orchestrator (Ablation v4).
// Parameterized by any DomainCartridge<TTask, TArtifact> to wire:
//   Fast Clock (EpisodicRingBuffer) -> Intermediate Clock (QuarantineVault) -> Slow Clock (DeepMetaOptimizer)

import type {
  DomainCartridge,
  OracleEvaluationResult,
} from '../domain-cartridge.js';
import {
  retrieveWithPrerequisites,
  type PrerequisiteGraph,
  type PrerequisiteRetrievalResult,
} from '../prerequisite-retriever.js';
import {
  computeArtifactSha256,
  EpisodicRingBuffer,
  stableStringify,
  type EpisodicTraceRecord,
} from './fast-clock.js';
import {
  QuarantineVault,
  type CandidateProposalBuilder,
  type QuarantineIngestResult,
} from './quarantine-vault.js';
import {
  cloneAndFreezeSnapshot,
  computeSnapshotSha256,
  DeepMetaOptimizer,
  type CanarySuite,
  type HopeMemorySnapshot,
  type PairedCanaryEvaluator,
  type PromotionReceipt,
  type SlowClockEvaluationResult,
} from './slow-clock.js';

export interface AxiomHopeEngineOptions<TTask, TArtifact> {
  readonly cartridge: DomainCartridge<TTask, TArtifact>;
  /** Maximum traces retained in the Fast Clock ring buffer (default: 128). */
  readonly fastClockCapacity?: number;
  /** Recurring failure threshold before staging into QuarantineVault (default: 3). */
  readonly minOccurrences?: number;
  /** Optional isolated v4 persistence path for QuarantineVault (default: `.axiom-state/v4/quarantine-vault.json`). */
  readonly quarantineStatePath?: string;
  /** Optional initial prerequisite graph override (defaults to `cartridge.loadCanonicalRules().prerequisiteGraph`). */
  readonly initialPrerequisiteGraph?: PrerequisiteGraph;
  /** Optional task ID extractor (defaults to reading `task.id`). */
  readonly getTaskId?: (task: TTask) => string;
  /** Optional deterministic artifact serializer used for SHA-256 provenance hashing. */
  readonly serializeArtifact?: (artifact: TArtifact) => string;
}

export interface RecordTrialOptions {
  /** Pre-computed deterministic oracle evaluation (if omitted, `cartridge.evaluate()` is invoked). */
  readonly evaluation?: OracleEvaluationResult;
  /** Pre-computed deterministic forensic flags (if omitted, `cartridge.classifyForensics?.()` is invoked). */
  readonly forensicFlags?: Readonly<Record<string, boolean>>;
  /** Optional deterministic ISO timestamp override. */
  readonly timestamp?: string;
}

export interface FlushToQuarantineOptions {
  readonly proposalBuilder?: CandidateProposalBuilder;
  readonly minOccurrences?: number;
  readonly timestamp?: string;
}

export interface RunSlowClockPromotionOptions {
  readonly evaluatedAt?: string;
}

function defaultGetTaskId<TTask>(task: TTask): string {
  if (
    task !== null &&
    typeof task === 'object' &&
    'id' in task &&
    typeof (task as { id?: unknown }).id === 'string'
  ) {
    return (task as { id: string }).id;
  }
  throw new Error(
    'AxiomHopeEngine could not infer task.id; supply a custom `getTaskId` extractor in options.'
  );
}

function defaultSerializeArtifact<TArtifact>(artifact: TArtifact): string {
  if (typeof artifact === 'string') return artifact;
  return stableStringify(artifact);
}

/**
 * Domain-agnostic 3-Clock Symbolic Axiom-HOPE Engine.
 *
 * Enforces strict clock separation:
 * - Fast Clock (`recordTrial`): captures task-scoped telemetry into a bounded ring buffer;
 *   NEVER mutates canonical rules or prerequisite graph.
 * - Intermediate Clock (`flushToQuarantine`): stages recurring failure clusters into an
 *   isolated QuarantineVault with SHA-256 provenance digests; NEVER mutates canonical memory.
 * - Slow Clock (`runSlowClockPromotion`): gates quarantined candidates through Lexical Lock,
 *   Contradiction Linter, and Paired Canary Replay before atomically publishing a new
 *   immutable `{ rules, prerequisiteGraph }` snapshot and cryptographic promotion receipt.
 */
export class AxiomHopeEngine<TTask = unknown, TArtifact = string> {
  readonly cartridge: DomainCartridge<TTask, TArtifact>;
  readonly fastClock: EpisodicRingBuffer;
  readonly quarantineVault: QuarantineVault;
  readonly slowClock: DeepMetaOptimizer;

  private readonly getTaskId: (task: TTask) => string;
  private readonly serializeArtifact: (artifact: TArtifact) => string;
  private currentSnapshot: HopeMemorySnapshot;
  private readonly promotionReceipts: PromotionReceipt[] = [];

  constructor(options: AxiomHopeEngineOptions<TTask, TArtifact>) {
    this.cartridge = options.cartridge;
    this.fastClock = new EpisodicRingBuffer(options.fastClockCapacity ?? 128);
    this.quarantineVault = new QuarantineVault({
      minOccurrences: options.minOccurrences ?? 3,
      statePath: options.quarantineStatePath,
    });
    this.slowClock = new DeepMetaOptimizer();
    this.getTaskId = options.getTaskId ?? defaultGetTaskId;
    this.serializeArtifact = options.serializeArtifact ?? defaultSerializeArtifact;

    const loaded = this.cartridge.loadCanonicalRules();
    this.currentSnapshot = cloneAndFreezeSnapshot(
      loaded.rules,
      options.initialPrerequisiteGraph ?? loaded.prerequisiteGraph
    );
  }

  /**
   * Fast Clock entry point: evaluates (or accepts) a single-task trial, hashes the artifact
   * with SHA-256, classifies deterministic forensic flags, and appends to the episodic ring buffer.
   * Strictly read-only with respect to canonical rules and prerequisite graph.
   */
  async recordTrial(
    task: TTask,
    artifact: TArtifact,
    options: RecordTrialOptions = {}
  ): Promise<EpisodicTraceRecord> {
    const taskId = this.getTaskId(task);
    const artifactSha256 = computeArtifactSha256(this.serializeArtifact(artifact));
    const evaluation =
      options.evaluation ?? (await this.cartridge.evaluate(task, artifact));
    const forensicFlags =
      options.forensicFlags ??
      (this.cartridge.classifyForensics
        ? this.cartridge.classifyForensics(task, artifact)
        : {});

    return this.fastClock.record({
      taskId,
      cartridgeId: this.cartridge.id,
      artifactSha256,
      committed: evaluation.committed,
      failedFacts: evaluation.failedFacts,
      forensicFlags,
      stderr: evaluation.stderr,
      timestamp: options.timestamp,
    });
  }

  /**
   * Intermediate Clock entry point: scans recurring Fast Clock failure clusters meeting
   * `minOccurrences` and stages isolated `QuarantineCandidate` patches in `quarantineVault`.
   * Strictly read-only with respect to canonical rules and prerequisite graph.
   */
  flushToQuarantine(
    options: FlushToQuarantineOptions = {}
  ): QuarantineIngestResult {
    const canonicalRuleTexts = new Map<string, string>(
      this.currentSnapshot.rules.map((r) => [r.id, r.statement])
    );

    return this.quarantineVault.ingestFromFastClock(this.fastClock, {
      proposalBuilder: options.proposalBuilder,
      canonicalRuleTexts,
      minOccurrences: options.minOccurrences,
      timestamp: options.timestamp,
    });
  }

  /**
   * Slow Clock entry point: evaluates a staged QuarantineCandidate through all 3 deterministic
   * promotion gates (Lexical Lock -> Contradiction Linter -> Paired Canary Replay).
   *
   * Records the structured `gateAudit` and status (`'approved' | 'rejected'`) on the candidate
   * in QuarantineVault. Only if `'approved'`, atomically swaps to the new immutable snapshot
   * and appends the cryptographic `PromotionReceipt`.
   */
  async runSlowClockPromotion(
    candidateId: string,
    canarySuite: CanarySuite<TTask>,
    evaluator: PairedCanaryEvaluator<TTask>,
    options: RunSlowClockPromotionOptions = {}
  ): Promise<SlowClockEvaluationResult> {
    const candidate = this.quarantineVault.getCandidate(candidateId);
    if (!candidate) {
      throw new Error(
        `Cannot run Slow Clock promotion: candidate "${candidateId}" is not staged in QuarantineVault.`
      );
    }

    const result = await this.slowClock.evaluateCandidate(
      candidate,
      this.currentSnapshot.rules,
      this.currentSnapshot.prerequisiteGraph,
      canarySuite,
      evaluator,
      {
        tokenExtractor: (rule) => this.cartridge.extractRequiredTokens(rule),
        evaluatedAt: options.evaluatedAt,
      }
    );

    this.quarantineVault.recordGateDecision(
      candidateId,
      result.status,
      result.gateAudit
    );

    if (result.status === 'approved' && result.nextSnapshot && result.receipt) {
      this.currentSnapshot = result.nextSnapshot;
      this.promotionReceipts.push(result.receipt);
    }

    return result;
  }

  /**
   * Returns the current deeply frozen `{ rules, prerequisiteGraph }` canonical memory snapshot.
   */
  getCurrentSnapshot(): HopeMemorySnapshot {
    return this.currentSnapshot;
  }

  /**
   * Returns the canonical SHA-256 digest of the current `{ rules, prerequisiteGraph }` snapshot.
   */
  getCurrentSnapshotSha256(): string {
    return computeSnapshotSha256(this.currentSnapshot);
  }

  /**
   * Returns all Slow Clock promotion receipts approved during this engine lifecycle.
   */
  getPromotionReceipts(): readonly PromotionReceipt[] {
    return Object.freeze([...this.promotionReceipts]);
  }

  /**
   * Convenience wrapper invoking v4 Prerequisite-Aware Retrieval against the engine's
   * currently active (promoted) prerequisite graph under an exact Top-K budget.
   */
  retrieveRules(
    rankedFactIds: readonly string[],
    budgetK: number,
    applicableFactIds?: ReadonlySet<string>
  ): PrerequisiteRetrievalResult {
    return retrieveWithPrerequisites(
      rankedFactIds,
      budgetK,
      this.currentSnapshot.prerequisiteGraph,
      applicableFactIds
    );
  }
}
