// src/v4/hope/slow-clock.ts
// Slow Clock: Deep Meta-Optimizer & 3 Sequential Zero-LLM Deterministic Promotion Gates
// for Axiom-HOPE (Ablation v4).
//
// Gate 1: Automated Lexical Identifier Lock (100% token retention via extractRequiredTokens)
// Gate 2: Cross-Rule Contradiction Linter (FK/PK/JWT/Grant contradictions + DAG cycle check)
// Gate 3: Paired Canary Replay Gate (strict targetCohortDelta > 0 && canaryRegressions === 0)

import type { CanonicalRule } from '../domain-cartridge.js';
import { extractRequiredTokens } from '../lexical-token-extractor.js';
import type { PrerequisiteGraph } from '../prerequisite-retriever.js';
import { computeCanonicalJsonSha256 } from './fast-clock.js';
import type {
  CanaryReplayGateResult,
  ContradictionLinterGateResult,
  ContradictionViolation,
  LexicalLockGateResult,
  PrerequisiteEdge,
  QuarantineCandidate,
  SlowClockGateAudit,
} from './quarantine-vault.js';

export type {
  CanaryReplayGateResult,
  ContradictionLinterGateResult,
  ContradictionViolation,
  LexicalLockGateResult,
  SlowClockGateAudit,
};

export interface HopeMemorySnapshot {
  readonly rules: readonly CanonicalRule[];
  readonly prerequisiteGraph: PrerequisiteGraph;
}

export interface CanarySuite<TTask = unknown> {
  /** Tasks exhibiting the target failure mode where net improvement is required. */
  readonly targetTasks: readonly TTask[];
  /** Frozen regression-guard tasks that must experience strictly zero regressions. */
  readonly canaryTasks: readonly TTask[];
}

export interface CanaryTaskOutcome {
  readonly taskId: string;
  readonly passed: boolean;
  /** Optional continuous score in [0, 1]; defaults to `passed ? 1 : 0`. */
  readonly score?: number;
  readonly failedFacts?: readonly string[];
}

export type PairedCanaryEvaluator<TTask = unknown> = (
  task: TTask,
  snapshot: HopeMemorySnapshot
) => CanaryTaskOutcome | Promise<CanaryTaskOutcome>;

export interface PromotionReceipt {
  readonly candidateId: string;
  readonly factId: string;
  readonly approvedAt: string;
  readonly beforeSha256: string;
  readonly afterSha256: string;
  readonly updatedRuleIds: readonly string[];
  readonly addedPrerequisiteEdges: readonly PrerequisiteEdge[];
  readonly evidenceHashes: readonly string[];
  readonly gateAudit: SlowClockGateAudit;
}

export interface SlowClockEvaluationResult {
  readonly candidateId: string;
  readonly status: 'approved' | 'rejected';
  readonly rejectedByGate: 'lexical_lock' | 'contradiction_linter' | 'canary_replay' | null;
  readonly gateAudit: SlowClockGateAudit;
  readonly nextSnapshot?: HopeMemorySnapshot;
  readonly receipt?: PromotionReceipt;
}

export interface EvaluateCandidateOptions {
  /** Optional domain-specific deterministic token extractor (defaults to Module 1 extractRequiredTokens). */
  readonly tokenExtractor?: (rule: CanonicalRule) => string[];
  /** Optional deterministic ISO timestamp override for reproducible receipts/audits. */
  readonly evaluatedAt?: string;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a concrete operational token is retained inside `haystack`
 * using boundary-aware, whitespace-normalized, case-insensitive matching.
 */
export function containsOperationalToken(haystack: string, token: string): boolean {
  const normHaystack = haystack.replace(/\s+/g, ' ');
  const normToken = token.trim().replace(/\s+/g, ' ');
  if (!normToken) return true;

  const startsAlphaNum = /^[a-zA-Z0-9]/.test(normToken);
  const endsAlphaNum = /[a-zA-Z0-9]$/.test(normToken);
  const escaped = escapeRegex(normToken).replace(/\s+/g, '\\s+');
  const pattern = `${startsAlphaNum ? '(?<![a-zA-Z0-9_])' : ''}${escaped}${
    endsAlphaNum ? '(?![a-zA-Z0-9_])' : ''
  }`;
  return new RegExp(pattern, 'i').test(normHaystack);
}

/**
 * Clones and deeply freezes a `PrerequisiteGraph` without mutating the input.
 */
export function clonePrerequisiteGraph(graph: PrerequisiteGraph): PrerequisiteGraph {
  const out: Record<string, readonly string[]> = {};
  for (const key of Object.keys(graph).sort()) {
    const uniqueSorted = Array.from(new Set(graph[key] ?? [])).sort();
    out[key] = Object.freeze(uniqueSorted);
  }
  return Object.freeze(out);
}

/**
 * Merges `addedEdges` onto a fresh copy of `currentGraph` without mutating inputs.
 */
export function mergePrerequisiteGraph(
  currentGraph: PrerequisiteGraph,
  addedEdges: readonly PrerequisiteEdge[]
): {
  readonly graph: PrerequisiteGraph;
  readonly newlyAddedEdges: readonly PrerequisiteEdge[];
} {
  const mutable: Record<string, Set<string>> = {};
  for (const [from, targets] of Object.entries(currentGraph)) {
    mutable[from] = new Set(targets);
  }

  const newlyAddedEdges: PrerequisiteEdge[] = [];
  for (const edge of addedEdges) {
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to) continue;
    if (!mutable[from]) {
      mutable[from] = new Set<string>();
    }
    if (!mutable[from].has(to)) {
      mutable[from].add(to);
      newlyAddedEdges.push(Object.freeze({ from, to }));
    }
  }

  const frozen: Record<string, readonly string[]> = {};
  for (const key of Object.keys(mutable).sort()) {
    frozen[key] = Object.freeze(Array.from(mutable[key]).sort());
  }

  newlyAddedEdges.sort((a, b) => {
    const cmp = a.from.localeCompare(b.from);
    return cmp !== 0 ? cmp : a.to.localeCompare(b.to);
  });

  return {
    graph: Object.freeze(frozen),
    newlyAddedEdges: Object.freeze(newlyAddedEdges),
  };
}

/**
 * Clones and freezes a `{ rules, prerequisiteGraph }` snapshot without mutating inputs.
 */
export function cloneAndFreezeSnapshot(
  rules: readonly CanonicalRule[],
  prerequisiteGraph: PrerequisiteGraph
): HopeMemorySnapshot {
  const frozenGraph = clonePrerequisiteGraph(prerequisiteGraph);
  const frozenRules = Object.freeze(
    rules.map((r) => {
      const prereqs = frozenGraph[r.id]
        ? frozenGraph[r.id]
        : r.prerequisites
          ? Object.freeze([...r.prerequisites])
          : undefined;
      return Object.freeze({
        ...r,
        ...(r.requiredTokens ? { requiredTokens: Object.freeze([...r.requiredTokens]) } : {}),
        ...(prereqs ? { prerequisites: prereqs } : {}),
      });
    })
  );

  return Object.freeze({
    rules: frozenRules,
    prerequisiteGraph: frozenGraph,
  });
}

/**
 * Produces a canonical SHA-256 hex digest of a `HopeMemorySnapshot` for cryptographic receipts.
 */
export function computeSnapshotSha256(snapshot: HopeMemorySnapshot): string {
  const canonicalPayload = {
    rules: [...snapshot.rules]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({
        id: r.id,
        statement: r.statement,
        active: r.active,
        prerequisites: [...(snapshot.prerequisiteGraph[r.id] ?? r.prerequisites ?? [])].sort(),
      })),
    prerequisiteGraph: Object.fromEntries(
      Object.keys(snapshot.prerequisiteGraph)
        .sort()
        .map((k) => [k, [...(snapshot.prerequisiteGraph[k] ?? [])].sort()])
    ),
  };
  return computeCanonicalJsonSha256(canonicalPayload);
}

/**
 * Deterministic 3-color DFS detecting any directed cycle (including self-loops)
 * in a `PrerequisiteGraph`. Returns the first cycle path found, or `null` if acyclic.
 */
export function detectPrerequisiteGraphCycle(graph: PrerequisiteGraph): string[] | null {
  const nodes = new Set<string>(Object.keys(graph));
  for (const targets of Object.values(graph)) {
    for (const t of targets) {
      nodes.add(t);
    }
  }
  const sortedNodes = Array.from(nodes).sort();

  // 0 = unvisited, 1 = visiting (on active DFS stack), 2 = fully explored
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const dfs = (u: string): string[] | null => {
    color.set(u, 1);
    stack.push(u);

    const neighbors = [...(graph[u] ?? [])].sort();
    for (const v of neighbors) {
      const state = color.get(v) ?? 0;
      if (state === 1) {
        const startIdx = stack.indexOf(v);
        return [...stack.slice(startIdx), v];
      }
      if (state === 0) {
        const found = dfs(v);
        if (found) return found;
      }
    }

    stack.pop();
    color.set(u, 2);
    return null;
  };

  for (const node of sortedNodes) {
    if ((color.get(node) ?? 0) === 0) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Checks whether rule prose prescribes an unnamed or inline REFERENCES clause
 * contradicting explicit table-level `fk_<table>_<column>` naming (F-16 / F-36).
 */
function hasInlineReferencesContradiction(text: string): boolean {
  if (!/\bREFERENCES\b/i.test(text)) return false;

  // 1. Unnamed REFERENCES clause (no fk_ naming and not explicitly forbidding inline REFERENCES)
  const mentionsNamedFk =
    /\bfk_<[^>]+>/i.test(text) || /\bfk_[a-z0-9_]+/i.test(text) || /\bCONSTRAINT\s+fk_/i.test(text);
  const forbidsInline =
    /\b(?:never|no|not|avoid|forbid|disallow|without|do\s+not|must\s+not)\b[^.;)]*\binline\s+REFERENCES\b/i.test(
      text
    );
  if (!mentionsNamedFk && !forbidsInline) {
    return true;
  }

  // 2. Explicit positive prescription of an inline REFERENCES clause
  if (/\binline\s+REFERENCES\b/i.test(text) && !forbidsInline) {
    return true;
  }

  // 3. Direct inline `supersedes_id <type> [NULL] REFERENCES` syntax without FOREIGN KEY / CONSTRAINT
  if (/\bsupersedes_id\s+uuid(?:\s+(?:NOT\s+)?NULL)?\s+REFERENCES\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Checks whether rule prose prescribes duplicate PRIMARY KEY definitions (inline + table-level).
 */
function hasDuplicatePrimaryKeyContradiction(text: string): boolean {
  const pkMatches = text.match(/\bPRIMARY\s+KEY\b/gi);
  if (!pkMatches || pkMatches.length < 2) {
    return false;
  }

  // Explicitly rejects positive prescriptions like "and also add a table-level PRIMARY KEY"
  if (
    /\b(?:and\s+also|plus|alongside|in\s+addition\s+to)\b[^.;)]*\b(?:table-level\s+|second\s+)?PRIMARY\s+KEY\b/i.test(
      text
    )
  ) {
    return true;
  }

  // Check whether the sentence explicitly prohibits combining duplicate PKs
  const hasProhibition =
    /\b(?:do\s+not|don't|never|avoid|must\s+not|forbid)\b[^.;)]*\b(?:combine|duplicate|second|both|multiple)\b[^.;)]*\bPRIMARY\s+KEY\b/i.test(
      text
    ) ||
    /\bdeclared\s+once\b/i.test(text) &&
      !/\b(?<!do\s+not\s+)(?<!never\s+)(?<!avoid\s+)combine\b[^.;)]*\bPRIMARY\s+KEY\b/i.test(text);

  return !hasProhibition;
}

/**
 * Checks whether rule prose grants or scopes tenant access via client-mutable `user_metadata`
 * instead of server-trusted `app_metadata` (F-26).
 */
function hasUserMetadataAuthContradiction(text: string): boolean {
  if (!/\buser_metadata\b/i.test(text)) return false;

  // Reject explicit positive authorization/scoping patterns referencing user_metadata
  if (
    /\b(?:or|and)\s+user_metadata\b/i.test(text) ||
    /->+?\s*'user_metadata'/i.test(text) ||
    /\b(?:scope|filter|authorize|authenticate|read|extract)\b[^.;]*\buser_metadata\b/i.test(text) &&
      !/\b(?:never|not|zero|no\s+access|deny|forbid|reject|disallow|ignore)\b[^.;]*\buser_metadata\b/i.test(
        text
      )
  ) {
    return true;
  }

  // Otherwise every mention of user_metadata must be guarded by a clear prohibition
  const clauses = text.split(/[.;]/);
  for (const clause of clauses) {
    if (!/\buser_metadata\b/i.test(clause)) continue;
    const hasProhibition =
      /\b(?:zero\s+access|no\s+access|never|forbid|forbidden|deny|denied|reject|disallow|do\s+not|must\s+not|not\s+use|ignore)\b[^.;]*\buser_metadata\b/i.test(
        clause
      ) ||
      /\buser_metadata\b[^.;]*\b(?:must\s+not|never|forbidden|prohibited|denied|rejected|disallowed|zero\s+access)\b/i.test(
        clause
      );
    if (!hasProhibition) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether F-19 omits positive GRANT SELECT / GRANT SELECT, INSERT alongside REVOKE.
 */
function hasMissingPositiveGrantContradiction(ruleId: string, text: string): boolean {
  if (ruleId !== 'F-19') return false;
  const hasRevoke =
    /\bREVOKE\b/i.test(text) &&
    /\bUPDATE\b/i.test(text) &&
    /\bDELETE\b/i.test(text) &&
    /\bTRUNCATE\b/i.test(text);
  const hasPositiveGrant =
    /\bGRANT\s+SELECT\b/i.test(text) && /\bGRANT\s+SELECT\s*,\s*INSERT\b/i.test(text);
  return !hasRevoke || !hasPositiveGrant;
}

/**
 * Gate 1: Automated Lexical Identifier Lock.
 * Runs `extractRequiredTokens()` on the canonical rule and verifies 100% retention
 * of concrete operational identifiers inside `candidate.proposedRuleText`.
 */
export function evaluateLexicalIdentifierLock(
  candidate: QuarantineCandidate,
  currentRules: readonly CanonicalRule[],
  tokenExtractor?: (rule: CanonicalRule) => string[]
): LexicalLockGateResult {
  const canonicalRule = currentRules.find((r) => r.id === candidate.factId);
  if (!canonicalRule) {
    return Object.freeze({
      executed: true,
      passed: false,
      requiredTokens: Object.freeze([]),
      retainedTokens: Object.freeze([]),
      missingTokens: Object.freeze([]),
      retentionRate: 0,
      reason: `Canonical rule "${candidate.factId}" not found in current rule set.`,
    });
  }

  const requiredTokens = tokenExtractor
    ? tokenExtractor(canonicalRule)
    : extractRequiredTokens(canonicalRule.statement);

  const retainedTokens: string[] = [];
  const missingTokens: string[] = [];

  for (const token of requiredTokens) {
    if (containsOperationalToken(candidate.proposedRuleText, token)) {
      retainedTokens.push(token);
    } else {
      missingTokens.push(token);
    }
  }

  const retentionRate =
    requiredTokens.length > 0 ? retainedTokens.length / requiredTokens.length : 1;
  const passed = missingTokens.length === 0;

  return Object.freeze({
    executed: true,
    passed,
    requiredTokens: Object.freeze([...requiredTokens]),
    retainedTokens: Object.freeze(retainedTokens),
    missingTokens: Object.freeze(missingTokens),
    retentionRate,
    ...(passed
      ? {}
      : {
          reason: `Lexical Identifier Lock failed for ${candidate.factId}: missing required token(s) [${missingTokens.join(', ')}].`,
        }),
  });
}

/**
 * Gate 2: Cross-Rule Contradiction Linter.
 * Deterministically validates the candidate rule text and merged prerequisite graph
 * against syntax/policy contradictions and circular prerequisite dependencies.
 */
export function evaluateCrossRuleContradictions(
  candidate: QuarantineCandidate,
  currentRules: readonly CanonicalRule[],
  currentGraph: PrerequisiteGraph
): ContradictionLinterGateResult {
  const violations: ContradictionViolation[] = [];

  // Validate proposed prerequisite edge syntax
  for (const edge of candidate.proposedPrerequisiteEdges) {
    if (!edge.from.trim() || !edge.to.trim()) {
      violations.push(
        Object.freeze({
          code: 'INVALID_PREREQUISITE_EDGE',
          ruleId: candidate.factId,
          message: `Invalid prerequisite edge "${edge.from}" -> "${edge.to}": both endpoints must be non-empty rule IDs.`,
        })
      );
    }
  }

  // Merge prerequisite graph immutably and enforce strict acyclicity (DAG invariant)
  const { graph: mergedGraph } = mergePrerequisiteGraph(
    currentGraph,
    candidate.proposedPrerequisiteEdges
  );
  const cycle = detectPrerequisiteGraphCycle(mergedGraph);
  if (cycle) {
    violations.push(
      Object.freeze({
        code: 'CIRCULAR_PREREQUISITE_EDGE',
        ruleId: candidate.factId,
        cyclePath: Object.freeze([...cycle]),
        message: `Circular prerequisite dependency detected: ${cycle.join(' -> ')}.`,
      })
    );
  }

  // Build candidate merged active rule set and lint rule statements
  const mergedRules: CanonicalRule[] = currentRules.map((r) =>
    r.id === candidate.factId ? { ...r, statement: candidate.proposedRuleText } : r
  );

  for (const rule of mergedRules) {
    if (!rule.active) continue;

    if (hasInlineReferencesContradiction(rule.statement)) {
      violations.push(
        Object.freeze({
          code: 'INLINE_REFERENCES_CONTRADICTION',
          ruleId: rule.id,
          message: `${rule.id} prescribes an unnamed or inline REFERENCES clause contradicting explicit fk_<table>_<column> naming.`,
        })
      );
    }

    if (hasDuplicatePrimaryKeyContradiction(rule.statement)) {
      violations.push(
        Object.freeze({
          code: 'DUPLICATE_PRIMARY_KEY_CONTRADICTION',
          ruleId: rule.id,
          message: `${rule.id} prescribes combining duplicate PRIMARY KEY constraints (inline + table-level).`,
        })
      );
    }

    if (hasUserMetadataAuthContradiction(rule.statement)) {
      violations.push(
        Object.freeze({
          code: 'USER_METADATA_AUTH_CONTRADICTION',
          ruleId: rule.id,
          message: `${rule.id} scopes or grants access via client-mutable user_metadata instead of server-trusted app_metadata.`,
        })
      );
    }

    if (hasMissingPositiveGrantContradiction(rule.id, rule.statement)) {
      violations.push(
        Object.freeze({
          code: 'MISSING_POSITIVE_GRANT_CONTRADICTION',
          ruleId: rule.id,
          message: `${rule.id} must pair REVOKE UPDATE, DELETE, TRUNCATE with positive GRANT SELECT and GRANT SELECT, INSERT.`,
        })
      );
    }
  }

  return Object.freeze({
    executed: true,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

function buildProposedSnapshot(
  currentRules: readonly CanonicalRule[],
  currentGraph: PrerequisiteGraph,
  candidate: QuarantineCandidate,
  tokenExtractor?: (rule: CanonicalRule) => string[]
): {
  readonly snapshot: HopeMemorySnapshot;
  readonly updatedRuleIds: readonly string[];
  readonly addedPrerequisiteEdges: readonly PrerequisiteEdge[];
} {
  const { graph: mergedGraph, newlyAddedEdges } = mergePrerequisiteGraph(
    currentGraph,
    candidate.proposedPrerequisiteEdges
  );

  const updatedRuleIds: string[] = [];
  const nextRules: CanonicalRule[] = currentRules.map((rule) => {
    const isTarget = rule.id === candidate.factId;
    const statementChanged = isTarget && rule.statement !== candidate.proposedRuleText;
    if (statementChanged) {
      updatedRuleIds.push(rule.id);
    }
    const statement = isTarget ? candidate.proposedRuleText : rule.statement;
    const updatedBase: CanonicalRule = {
      ...rule,
      statement,
      ...(mergedGraph[rule.id] ? { prerequisites: mergedGraph[rule.id] } : {}),
    };
    const nextTokens =
      statementChanged && rule.requiredTokens
        ? tokenExtractor
          ? tokenExtractor(updatedBase)
          : extractRequiredTokens(statement)
        : rule.requiredTokens;

    return Object.freeze({
      ...updatedBase,
      ...(nextTokens ? { requiredTokens: Object.freeze([...nextTokens]) } : {}),
    });
  });

  const snapshot = Object.freeze({
    rules: Object.freeze(nextRules),
    prerequisiteGraph: mergedGraph,
  });

  return {
    snapshot,
    updatedRuleIds: Object.freeze(updatedRuleIds),
    addedPrerequisiteEdges: newlyAddedEdges,
  };
}

function createSkippedLinterResult(): ContradictionLinterGateResult {
  return Object.freeze({
    executed: false,
    passed: false,
    violations: Object.freeze([]),
  });
}

function createSkippedCanaryResult(): CanaryReplayGateResult {
  return Object.freeze({
    executed: false,
    passed: false,
    targetBeforePassCount: 0,
    targetAfterPassCount: 0,
    targetTotal: 0,
    targetCohortDelta: 0,
    canaryBeforePassCount: 0,
    canaryAfterPassCount: 0,
    canaryTotal: 0,
    canaryRegressions: 0,
    regressedCanaryTaskIds: Object.freeze([]),
  });
}

/**
 * Slow Clock: Deep Meta-Optimizer enforcing 3 sequential zero-LLM deterministic promotion gates.
 */
export class DeepMetaOptimizer {
  /**
   * Sequentially evaluates `candidate` through:
   *   1. Automated Lexical Identifier Lock
   *   2. Cross-Rule Contradiction Linter
   *   3. Paired Canary Replay Gate (`targetCohortDelta > 0 && canaryRegressions === 0`)
   *
   * Never mutates `currentRules`, `currentGraph`, or `candidate` in place.
   * On `'approved'`, returns a brand-new deeply frozen `{ rules, prerequisiteGraph }`
   * snapshot and a cryptographic `PromotionReceipt` with SHA-256 before/after digests.
   */
  async evaluateCandidate<TTask>(
    candidate: QuarantineCandidate,
    currentRules: readonly CanonicalRule[],
    currentGraph: PrerequisiteGraph,
    canarySuite: CanarySuite<TTask>,
    evaluator: PairedCanaryEvaluator<TTask>,
    options: EvaluateCandidateOptions = {}
  ): Promise<SlowClockEvaluationResult> {
    const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();

    // --- Gate 1: Automated Lexical Identifier Lock ---
    const lexicalLock = evaluateLexicalIdentifierLock(
      candidate,
      currentRules,
      options.tokenExtractor
    );
    if (!lexicalLock.passed) {
      const gateAudit: SlowClockGateAudit = Object.freeze({
        evaluatedAt,
        passed: false,
        rejectedByGate: 'lexical_lock',
        lexicalLock,
        contradictionLinter: createSkippedLinterResult(),
        canaryReplay: createSkippedCanaryResult(),
      });
      return Object.freeze({
        candidateId: candidate.candidateId,
        status: 'rejected',
        rejectedByGate: 'lexical_lock',
        gateAudit,
      });
    }

    // --- Gate 2: Cross-Rule Contradiction Linter ---
    const contradictionLinter = evaluateCrossRuleContradictions(
      candidate,
      currentRules,
      currentGraph
    );
    if (!contradictionLinter.passed) {
      const gateAudit: SlowClockGateAudit = Object.freeze({
        evaluatedAt,
        passed: false,
        rejectedByGate: 'contradiction_linter',
        lexicalLock,
        contradictionLinter,
        canaryReplay: createSkippedCanaryResult(),
      });
      return Object.freeze({
        candidateId: candidate.candidateId,
        status: 'rejected',
        rejectedByGate: 'contradiction_linter',
        gateAudit,
      });
    }

    // --- Gate 3: Paired Canary Replay Gate ---
    const beforeSnapshot = cloneAndFreezeSnapshot(currentRules, currentGraph);
    const {
      snapshot: afterSnapshot,
      updatedRuleIds,
      addedPrerequisiteEdges,
    } = buildProposedSnapshot(
      currentRules,
      currentGraph,
      candidate,
      options.tokenExtractor
    );

    let targetBeforePassCount = 0;
    let targetAfterPassCount = 0;
    let targetBeforeScoreSum = 0;
    let targetAfterScoreSum = 0;

    for (const task of canarySuite.targetTasks) {
      const beforeOutcome = await evaluator(task, beforeSnapshot);
      const afterOutcome = await evaluator(task, afterSnapshot);
      const beforeScore = beforeOutcome.score ?? (beforeOutcome.passed ? 1 : 0);
      const afterScore = afterOutcome.score ?? (afterOutcome.passed ? 1 : 0);

      if (beforeOutcome.passed) targetBeforePassCount++;
      if (afterOutcome.passed) targetAfterPassCount++;
      targetBeforeScoreSum += beforeScore;
      targetAfterScoreSum += afterScore;
    }

    const targetTotal = canarySuite.targetTasks.length;
    const targetCohortDelta =
      targetTotal > 0 ? (targetAfterScoreSum - targetBeforeScoreSum) / targetTotal : 0;

    let canaryBeforePassCount = 0;
    let canaryAfterPassCount = 0;
    let canaryRegressions = 0;
    const regressedCanaryTaskIds: string[] = [];

    for (const task of canarySuite.canaryTasks) {
      const beforeOutcome = await evaluator(task, beforeSnapshot);
      const afterOutcome = await evaluator(task, afterSnapshot);
      const beforeScore = beforeOutcome.score ?? (beforeOutcome.passed ? 1 : 0);
      const afterScore = afterOutcome.score ?? (afterOutcome.passed ? 1 : 0);

      if (beforeOutcome.passed) canaryBeforePassCount++;
      if (afterOutcome.passed) canaryAfterPassCount++;

      if ((beforeOutcome.passed && !afterOutcome.passed) || afterScore < beforeScore) {
        canaryRegressions++;
        regressedCanaryTaskIds.push(afterOutcome.taskId);
      }
    }

    const canaryPassed = targetCohortDelta > 0 && canaryRegressions === 0;
    let canaryReason: string | undefined;
    if (!canaryPassed) {
      if (canaryRegressions > 0) {
        canaryReason = `Canary Replay Gate failed: ${canaryRegressions} canary regression(s) detected [${regressedCanaryTaskIds.join(', ')}] (zero-regression policy violated).`;
      } else {
        canaryReason = `Canary Replay Gate failed: targetCohortDelta=${targetCohortDelta.toFixed(4)} is not strictly positive.`;
      }
    }

    const canaryReplay: CanaryReplayGateResult = Object.freeze({
      executed: true,
      passed: canaryPassed,
      targetBeforePassCount,
      targetAfterPassCount,
      targetTotal,
      targetCohortDelta,
      canaryBeforePassCount,
      canaryAfterPassCount,
      canaryTotal: canarySuite.canaryTasks.length,
      canaryRegressions,
      regressedCanaryTaskIds: Object.freeze(regressedCanaryTaskIds),
      ...(canaryReason ? { reason: canaryReason } : {}),
    });

    const gateAudit: SlowClockGateAudit = Object.freeze({
      evaluatedAt,
      passed: canaryPassed,
      rejectedByGate: canaryPassed ? null : 'canary_replay',
      lexicalLock,
      contradictionLinter,
      canaryReplay,
    });

    if (!canaryPassed) {
      return Object.freeze({
        candidateId: candidate.candidateId,
        status: 'rejected',
        rejectedByGate: 'canary_replay',
        gateAudit,
      });
    }

    const beforeSha256 = computeSnapshotSha256(beforeSnapshot);
    const afterSha256 = computeSnapshotSha256(afterSnapshot);

    const receipt: PromotionReceipt = Object.freeze({
      candidateId: candidate.candidateId,
      factId: candidate.factId,
      approvedAt: evaluatedAt,
      beforeSha256,
      afterSha256,
      updatedRuleIds,
      addedPrerequisiteEdges,
      evidenceHashes: Object.freeze([...candidate.evidenceHashes]),
      gateAudit,
    });

    return Object.freeze({
      candidateId: candidate.candidateId,
      status: 'approved',
      rejectedByGate: null,
      gateAudit,
      nextSnapshot: afterSnapshot,
      receipt,
    });
  }
}
