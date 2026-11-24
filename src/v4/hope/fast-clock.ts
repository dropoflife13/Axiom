// src/v4/hope/fast-clock.ts
// Fast Clock: Task-Scoped Episodic Ring Buffer for Axiom-HOPE (Ablation v4).
// Records single-task execution traces with fixed capacity and FIFO eviction.
// Strictly read-only with respect to persistent canonical memory and prerequisite graphs.

import crypto from 'node:crypto';

export interface EpisodicTraceInput {
  readonly taskId: string;
  readonly cartridgeId: string;
  readonly artifactSha256: string;
  readonly committed: boolean;
  readonly failedFacts: readonly string[];
  readonly forensicFlags: Readonly<Record<string, boolean>>;
  readonly stderr?: string;
  readonly timestamp?: string;
}

export interface EpisodicTraceRecord {
  readonly taskId: string;
  readonly cartridgeId: string;
  readonly artifactSha256: string;
  readonly committed: boolean;
  readonly failedFacts: readonly string[];
  readonly forensicFlags: Readonly<Record<string, boolean>>;
  readonly stderr?: string;
  readonly timestamp: string;
}

export interface RecurringFailureCluster {
  readonly cartridgeId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly occurrences: number;
  readonly taskIds: readonly string[];
  readonly evidenceHashes: readonly string[];
  readonly sampleStderr?: string;
  readonly latestTimestamp: string;
}

export const UNSPECIFIED_TRIGGER_FLAG = 'UNSPECIFIED';

/**
 * Deterministic SHA-256 hex digest for a generated artifact string or buffer.
 */
export function computeArtifactSha256(artifact: string | Uint8Array): string {
  return crypto.createHash('sha256').update(artifact).digest('hex');
}

/**
 * Recursively produces a key-sorted JSON string for deterministic cryptographic hashing.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}

/**
 * Deterministic SHA-256 hex digest over any JSON-serializable structure.
 */
export function computeCanonicalJsonSha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function freezeTraceRecord(input: EpisodicTraceInput): EpisodicTraceRecord {
  const uniqueFailedFacts = Array.from(new Set(input.failedFacts));
  const sortedFlags: Record<string, boolean> = {};
  for (const key of Object.keys(input.forensicFlags).sort()) {
    sortedFlags[key] = Boolean(input.forensicFlags[key]);
  }

  const record: EpisodicTraceRecord = {
    taskId: input.taskId,
    cartridgeId: input.cartridgeId,
    artifactSha256: input.artifactSha256,
    committed: Boolean(input.committed),
    failedFacts: Object.freeze(uniqueFailedFacts),
    forensicFlags: Object.freeze(sortedFlags),
    ...(input.stderr !== undefined ? { stderr: input.stderr } : {}),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  return Object.freeze(record);
}

/**
 * Fixed-capacity FIFO episodic ring buffer (Fast Clock).
 *
 * Architectural Invariant:
 * The Fast Clock holds ZERO mutable references to canonical rules or prerequisite graphs.
 * It can only capture task-scoped execution telemetry for downstream Intermediate Clock clustering.
 */
export class EpisodicRingBuffer {
  readonly maxCapacity: number;
  private readonly traces: EpisodicTraceRecord[] = [];
  private evictedCount = 0;

  constructor(maxCapacity = 128) {
    if (!Number.isInteger(maxCapacity) || maxCapacity < 1) {
      throw new Error(
        `EpisodicRingBuffer maxCapacity must be a positive integer (received ${maxCapacity}).`
      );
    }
    this.maxCapacity = maxCapacity;
  }

  /**
   * Appends a single-task execution trace, evicting the oldest record (FIFO) if at capacity.
   */
  record(input: EpisodicTraceInput): EpisodicTraceRecord {
    const frozen = freezeTraceRecord(input);
    if (this.traces.length >= this.maxCapacity) {
      this.traces.shift();
      this.evictedCount++;
    }
    this.traces.push(frozen);
    return frozen;
  }

  /**
   * Returns a frozen snapshot of all buffered traces in chronological FIFO order (oldest -> newest).
   */
  getTraces(): readonly EpisodicTraceRecord[] {
    return Object.freeze([...this.traces]);
  }

  /**
   * Returns traces that recorded a failure on `factId`.
   */
  getTracesForFact(factId: string): readonly EpisodicTraceRecord[] {
    return Object.freeze(this.traces.filter((t) => t.failedFacts.includes(factId)));
  }

  /**
   * Aggregates recurring failure clusters across buffered traces that occur at least
   * `minOccurrences` times, grouped deterministically by (cartridgeId, factId, triggerFlag).
   */
  getRecurringFailureClusters(minOccurrences = 3): RecurringFailureCluster[] {
    if (!Number.isInteger(minOccurrences) || minOccurrences < 1) {
      throw new Error(
        `minOccurrences must be a positive integer (received ${minOccurrences}).`
      );
    }

    interface Bucket {
      cartridgeId: string;
      factId: string;
      triggerFlag: string;
      occurrences: number;
      taskIds: string[];
      evidenceHashes: string[];
      seenHashes: Set<string>;
      sampleStderr?: string;
      latestTimestamp: string;
    }

    const buckets = new Map<string, Bucket>();

    for (const trace of this.traces) {
      if (trace.failedFacts.length === 0) continue;

      const activeFlags = Object.entries(trace.forensicFlags)
        .filter(([, active]) => active === true)
        .map(([flag]) => flag)
        .sort();

      const triggerFlags = activeFlags.length > 0 ? activeFlags : [UNSPECIFIED_TRIGGER_FLAG];

      for (const factId of trace.failedFacts) {
        for (const triggerFlag of triggerFlags) {
          const key = `${trace.cartridgeId}::${factId}::${triggerFlag}`;
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = {
              cartridgeId: trace.cartridgeId,
              factId,
              triggerFlag,
              occurrences: 0,
              taskIds: [],
              evidenceHashes: [],
              seenHashes: new Set<string>(),
              sampleStderr: trace.stderr,
              latestTimestamp: trace.timestamp,
            };
            buckets.set(key, bucket);
          }

          bucket.occurrences++;
          bucket.taskIds.push(trace.taskId);
          if (!bucket.seenHashes.has(trace.artifactSha256)) {
            bucket.seenHashes.add(trace.artifactSha256);
            bucket.evidenceHashes.push(trace.artifactSha256);
          }
          if (!bucket.sampleStderr && trace.stderr) {
            bucket.sampleStderr = trace.stderr;
          }
          if (trace.timestamp > bucket.latestTimestamp) {
            bucket.latestTimestamp = trace.timestamp;
          }
        }
      }
    }

    const clusters: RecurringFailureCluster[] = [];
    for (const bucket of buckets.values()) {
      if (bucket.occurrences < minOccurrences) continue;
      clusters.push(
        Object.freeze({
          cartridgeId: bucket.cartridgeId,
          factId: bucket.factId,
          triggerFlag: bucket.triggerFlag,
          occurrences: bucket.occurrences,
          taskIds: Object.freeze([...bucket.taskIds]),
          evidenceHashes: Object.freeze([...bucket.evidenceHashes]),
          ...(bucket.sampleStderr !== undefined ? { sampleStderr: bucket.sampleStderr } : {}),
          latestTimestamp: bucket.latestTimestamp,
        })
      );
    }

    clusters.sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      const factCmp = a.factId.localeCompare(b.factId);
      if (factCmp !== 0) return factCmp;
      const flagCmp = a.triggerFlag.localeCompare(b.triggerFlag);
      if (flagCmp !== 0) return flagCmp;
      return a.cartridgeId.localeCompare(b.cartridgeId);
    });

    return clusters;
  }

  get size(): number {
    return this.traces.length;
  }

  get totalEvicted(): number {
    return this.evictedCount;
  }

  clear(): void {
    this.traces.length = 0;
  }
}
