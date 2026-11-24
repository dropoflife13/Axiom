// src/v4/hope/context-rot-detector.ts
// Zero-LLM Context Rot Detector for Axiom-HOPE v4.
// Analyzes canonical rule sets and episodic execution traces to identify:
//   1. Redundant rule pairs (Jaccard similarity >= threshold, default 0.65)
//   2. Dead-weight rules (retrieved >= minRetrievals with 0 failures & <= 0 pass-rate lift)
//   3. Oversized rules exceeding `maxRuleTokens` eligible for lexical-locked compaction
// Converts high-signal findings into `QuarantineCandidate` objects for Slow Clock verification
// (`Gate 1 Lexical Lock` -> `Gate 2 Contradiction Linter` -> `Gate 3 Paired Canary Replay`).

import type { CanonicalRule } from '../domain-cartridge.js';
import { extractRequiredTokens } from '../lexical-token-extractor.js';
import { compactRuleText, estimateTokens } from './context-compactor.js';
import { computeCanonicalJsonSha256, type EpisodicTraceRecord } from './fast-clock.js';
import type { QuarantineCandidate } from './quarantine-vault.js';
import { containsOperationalToken } from './slow-clock.js';

export interface RotEpisodicTrace extends EpisodicTraceRecord {
  /** Rule IDs retrieved into prompt context during this task execution. */
  readonly retrievedRuleIds?: readonly string[];
  /** Optional explicit full-task pass outcome (defaults to committed && failedFacts.length === 0). */
  readonly fullTaskPass?: boolean;
  /** Optional continuous fact pass rate in [0, 1]. */
  readonly factPassRate?: number;
}

export interface DetectContextRotOptions {
  /** Jaccard token similarity threshold for flagging redundant rule pairs (default: 0.65). */
  readonly similarityThreshold?: number;
  /** Minimum retrievals before flagging a zero-failure / zero-lift dead-weight rule (default: 3). */
  readonly minRetrievals?: number;
  /** Maximum estimated token budget per single rule before flagging oversized (default: 28). */
  readonly maxRuleTokens?: number;
  /** Optional map of taskId -> retrievedRuleIds when traces omit inline `retrievedRuleIds`. */
  readonly retrievedRulesByTask?:
    | ReadonlyMap<string, readonly string[]>
    | Readonly<Record<string, readonly string[]>>;
  /** Optional cartridge ID propagated to generated QuarantineCandidates. */
  readonly cartridgeId?: string;
  /** Whether to inspect inactive rules as well (default: false). */
  readonly includeInactive?: boolean;
  /** Optional custom deterministic token extractor (defaults to `extractRequiredTokens`). */
  readonly tokenExtractor?: (rule: CanonicalRule) => readonly string[];
}

export interface RedundantRulePair {
  readonly ruleIdA: string;
  readonly ruleIdB: string;
  readonly jaccardSimilarity: number;
  readonly sharedTokens: readonly string[];
  readonly keepRuleId: string;
  readonly candidateMergeRuleId: string;
  readonly proposedMergedText: string;
}

export interface DeadWeightRuleFinding {
  readonly ruleId: string;
  readonly retrievals: number;
  readonly associatedFailures: number;
  readonly passRateWhenRetrieved: number;
  readonly passRateWhenNotRetrieved: number;
  readonly passRateLift: number;
  readonly compactedText: string;
  readonly beforeTokens: number;
  readonly afterTokens: number;
}

export interface OversizedRuleFinding {
  readonly ruleId: string;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionPct: number;
  readonly tokenSavings: number;
  readonly maxRuleTokens: number;
  readonly originalText: string;
  readonly compactedText: string;
  readonly requiredTokens: readonly string[];
}

export interface ContextRotReportSummary {
  readonly totalActiveRules: number;
  readonly totalTracesAnalyzed: number;
  readonly redundantPairCount: number;
  readonly deadWeightCount: number;
  readonly oversizedCount: number;
  readonly potentialTokenSavings: number;
}

export interface ContextRotReport {
  readonly generatedAt: string;
  readonly cartridgeId?: string;
  readonly thresholds: {
    readonly similarityThreshold: number;
    readonly minRetrievals: number;
    readonly maxRuleTokens: number;
  };
  readonly redundantPairs: readonly RedundantRulePair[];
  readonly deadWeightRules: readonly DeadWeightRuleFinding[];
  readonly oversizedRules: readonly OversizedRuleFinding[];
  readonly summary: ContextRotReportSummary;
}

export interface ToQuarantineCandidatesOptions {
  /** Deterministic ISO timestamp override. */
  readonly timestamp?: string;
  /** Optional override for cartridgeId on generated candidates. */
  readonly cartridgeId?: string;
}

const ROT_STOP_WORDS = new Set<string>([
  'a', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'each',
  'every', 'for', 'from', 'if', 'in', 'is', 'it', 'its', 'must', 'of',
  'on', 'or', 'should', 'that', 'the', 'their', 'this', 'to', 'via',
  'when', 'where', 'with',
]);

function normalizeStem(word: string): string {
  const lower = word.toLowerCase();
  if (lower.includes('_') || lower.length <= 4) return lower;
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is')
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

/**
 * Tokenizes rule text into normalized lexical & domain tokens for symmetric Jaccard scoring.
 */
function tokenizeRuleForSimilarity(
  statement: string,
  requiredTokens: readonly string[]
): Set<string> {
  const out = new Set<string>();
  const words = statement.match(/[A-Za-z0-9_]+/g) ?? [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (lower.length < 2 || ROT_STOP_WORDS.has(lower)) continue;
    out.add(normalizeStem(lower));
  }
  for (const req of requiredTokens) {
    const norm = req.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm.length >= 2 && !ROT_STOP_WORDS.has(norm)) {
      out.add(norm);
    }
  }
  return out;
}

function getRetrievedRuleIds(
  trace: RotEpisodicTrace,
  sidecar?: ReadonlyMap<string, readonly string[]> | Readonly<Record<string, readonly string[]>>
): readonly string[] {
  if (trace.retrievedRuleIds) return trace.retrievedRuleIds;
  if (!sidecar) return [];
  if (sidecar instanceof Map) {
    return sidecar.get(trace.taskId) ?? [];
  }
  return (sidecar as Readonly<Record<string, readonly string[]>>)[trace.taskId] ?? [];
}

function resolveRequiredTokens(
  rule: CanonicalRule,
  extractor?: (rule: CanonicalRule) => readonly string[]
): readonly string[] {
  if (extractor) return extractor(rule);
  if (rule.requiredTokens && rule.requiredTokens.length > 0) return rule.requiredTokens;
  return extractRequiredTokens(rule.statement);
}

function buildMergedProposal(
  keepRule: CanonicalRule,
  mergeRule: CanonicalRule,
  keepTokens: readonly string[],
  mergeTokens: readonly string[]
): string {
  const compactedKeep = compactRuleText(keepRule.statement, keepTokens).compactedText;
  const combinedTokens: string[] = [...keepTokens];
  const seenLower = new Set(combinedTokens.map((t) => t.toLowerCase()));
  for (const tok of mergeTokens) {
    if (!seenLower.has(tok.toLowerCase())) {
      seenLower.add(tok.toLowerCase());
      combinedTokens.push(tok);
    }
  }

  const missingFromKeep = combinedTokens.filter(
    (tok) => !containsOperationalToken(compactedKeep, tok)
  );
  if (missingFromKeep.length === 0) {
    return compactedKeep;
  }

  // Append only minimal missing operational anchors from `mergeRule` while keeping `keepRule` intact
  const base = compactedKeep.replace(/[.;]+$/, '').trim();
  const extraList = missingFromKeep.join(', ');
  return `${base}; preserve ${extraList}.`;
}

/**
 * Deterministically inspects active rules and Fast Clock episodic traces for context rot:
 * redundant competing rules, zero-lift dead-weight retrievals, and oversized token-heavy rules.
 */
export function detectContextRot(
  rules: readonly CanonicalRule[],
  episodicTraces: readonly RotEpisodicTrace[],
  options: DetectContextRotOptions = {}
): ContextRotReport {
  const similarityThreshold = options.similarityThreshold ?? 0.65;
  const minRetrievals = options.minRetrievals ?? 3;
  const maxRuleTokens = options.maxRuleTokens ?? 28;

  const activeRules = options.includeInactive
    ? [...rules]
    : rules.filter((r) => r.active);

  const reqTokensByRule = new Map<string, readonly string[]>();
  const tokenSetsByRule = new Map<string, Set<string>>();

  for (const rule of activeRules) {
    const req = resolveRequiredTokens(rule, options.tokenExtractor);
    reqTokensByRule.set(rule.id, req);
    tokenSetsByRule.set(rule.id, tokenizeRuleForSimilarity(rule.statement, req));
  }

  // 1. Redundant Rule Pairs (Jaccard >= similarityThreshold)
  const redundantPairs: RedundantRulePair[] = [];
  for (let i = 0; i < activeRules.length; i++) {
    for (let j = i + 1; j < activeRules.length; j++) {
      const ruleA = activeRules[i];
      const ruleB = activeRules[j];
      const setA = tokenSetsByRule.get(ruleA.id)!;
      const setB = tokenSetsByRule.get(ruleB.id)!;

      const shared: string[] = [];
      for (const t of setA) {
        if (setB.has(t)) shared.push(t);
      }
      const unionSize = setA.size + setB.size - shared.length;
      if (unionSize === 0) continue;

      const jaccard = shared.length / unionSize;
      if (jaccard + 1e-12 >= similarityThreshold) {
        const reqA = reqTokensByRule.get(ruleA.id)!;
        const reqB = reqTokensByRule.get(ruleB.id)!;
        const keepA =
          reqA.length > reqB.length ||
          (reqA.length === reqB.length && ruleA.id.localeCompare(ruleB.id) <= 0);
        const keepRule = keepA ? ruleA : ruleB;
        const mergeRule = keepA ? ruleB : ruleA;
        const keepReq = keepA ? reqA : reqB;
        const mergeReq = keepA ? reqB : reqA;

        redundantPairs.push(
          Object.freeze({
            ruleIdA: ruleA.id,
            ruleIdB: ruleB.id,
            jaccardSimilarity: Number(jaccard.toFixed(4)),
            sharedTokens: Object.freeze(shared.sort()),
            keepRuleId: keepRule.id,
            candidateMergeRuleId: mergeRule.id,
            proposedMergedText: buildMergedProposal(keepRule, mergeRule, keepReq, mergeReq),
          })
        );
      }
    }
  }
  redundantPairs.sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity);

  // 2. Dead-Weight Rules (>= minRetrievals, 0 associated failures, <= 0 pass-rate lift)
  const deadWeightRules: DeadWeightRuleFinding[] = [];
  for (const rule of activeRules) {
    let retrievals = 0;
    let retrievedPasses = 0;
    let notRetrievedTotal = 0;
    let notRetrievedPasses = 0;
    let associatedFailures = 0;

    for (const trace of episodicTraces) {
      const retrievedIds = getRetrievedRuleIds(trace, options.retrievedRulesByTask);
      const wasRetrieved = retrievedIds.includes(rule.id);
      const failedThisRule = trace.failedFacts.includes(rule.id);
      const taskPassed = trace.fullTaskPass ?? (trace.committed && trace.failedFacts.length === 0);

      if (failedThisRule) {
        associatedFailures++;
      }
      if (wasRetrieved) {
        retrievals++;
        if (taskPassed) retrievedPasses++;
      } else {
        notRetrievedTotal++;
        if (taskPassed) notRetrievedPasses++;
      }
    }

    if (retrievals < minRetrievals || associatedFailures > 0) {
      continue;
    }

    const passRateWhenRetrieved = retrievals > 0 ? retrievedPasses / retrievals : 0;
    const passRateWhenNotRetrieved =
      notRetrievedTotal > 0 ? notRetrievedPasses / notRetrievedTotal : passRateWhenRetrieved;
    const passRateLift = Number((passRateWhenRetrieved - passRateWhenNotRetrieved).toFixed(4));

    if (passRateLift <= 0) {
      const req = reqTokensByRule.get(rule.id)!;
      const compacted = compactRuleText(rule.statement, req);
      deadWeightRules.push(
        Object.freeze({
          ruleId: rule.id,
          retrievals,
          associatedFailures,
          passRateWhenRetrieved: Number(passRateWhenRetrieved.toFixed(4)),
          passRateWhenNotRetrieved: Number(passRateWhenNotRetrieved.toFixed(4)),
          passRateLift,
          compactedText: compacted.compactedText,
          beforeTokens: compacted.beforeTokens,
          afterTokens: compacted.afterTokens,
        })
      );
    }
  }

  // 3. Oversized Rules (estimated tokens > maxRuleTokens)
  const oversizedRules: OversizedRuleFinding[] = [];
  let potentialTokenSavings = 0;
  for (const rule of activeRules) {
    const req = reqTokensByRule.get(rule.id)!;
    const compacted = compactRuleText(rule.statement, req);
    if (compacted.beforeTokens > maxRuleTokens) {
      const tokenSavings = Math.max(0, compacted.beforeTokens - compacted.afterTokens);
      potentialTokenSavings += tokenSavings;
      oversizedRules.push(
        Object.freeze({
          ruleId: rule.id,
          beforeTokens: compacted.beforeTokens,
          afterTokens: compacted.afterTokens,
          reductionPct: compacted.reductionPct,
          tokenSavings,
          maxRuleTokens,
          originalText: rule.statement,
          compactedText: compacted.compactedText,
          requiredTokens: compacted.requiredTokens,
        })
      );
    }
  }
  oversizedRules.sort((a, b) => b.tokenSavings - a.tokenSavings || b.beforeTokens - a.beforeTokens);

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    ...(options.cartridgeId ? { cartridgeId: options.cartridgeId } : {}),
    thresholds: Object.freeze({
      similarityThreshold,
      minRetrievals,
      maxRuleTokens,
    }),
    redundantPairs: Object.freeze(redundantPairs),
    deadWeightRules: Object.freeze(deadWeightRules),
    oversizedRules: Object.freeze(oversizedRules),
    summary: Object.freeze({
      totalActiveRules: activeRules.length,
      totalTracesAnalyzed: episodicTraces.length,
      redundantPairCount: redundantPairs.length,
      deadWeightCount: deadWeightRules.length,
      oversizedCount: oversizedRules.length,
      potentialTokenSavings,
    }),
  });
}

/**
 * Converts high-signal findings from a `ContextRotReport` into cryptographically hashed
 * `QuarantineCandidate` objects eligible for Slow Clock verification (`Gate 1 Lexical Lock`,
 * `Gate 2 Contradiction Linter`, `Gate 3 Paired Canary Replay`).
 */
export function toQuarantineCandidates(
  report: ContextRotReport,
  options: ToQuarantineCandidatesOptions = {}
): QuarantineCandidate[] {
  const timestamp = options.timestamp ?? report.generatedAt;
  const cartridgeId = options.cartridgeId ?? report.cartridgeId;
  const candidates: QuarantineCandidate[] = [];
  const emittedIds = new Set<string>();

  // 1. Oversized rules with real token savings -> lexical-locked compaction candidate
  for (const item of report.oversizedRules) {
    if (item.tokenSavings <= 0) continue;
    const candidateId = `Q-COMPACT-${item.ruleId}`;
    if (emittedIds.has(candidateId)) continue;
    emittedIds.add(candidateId);

    const evidenceHash = computeCanonicalJsonSha256({
      kind: 'context_rot_oversized',
      ruleId: item.ruleId,
      beforeTokens: item.beforeTokens,
      afterTokens: item.afterTokens,
      compactedText: item.compactedText,
    });

    candidates.push(
      Object.freeze({
        candidateId,
        factId: item.ruleId,
        triggerFlag: 'context_rot_oversized',
        proposedRuleText: item.compactedText,
        proposedPrerequisiteEdges: Object.freeze([]),
        evidenceHashes: Object.freeze([evidenceHash]),
        observedCount: 1,
        status: 'staged',
        gateAudit: null,
        ...(cartridgeId ? { cartridgeId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
  }

  // 2. Redundant rule pairs -> consolidated canonical rule candidate on `keepRuleId`
  for (const pair of report.redundantPairs) {
    const candidateId = `Q-DEDUP-${pair.keepRuleId}-${pair.candidateMergeRuleId}`;
    if (emittedIds.has(candidateId)) continue;
    emittedIds.add(candidateId);

    const evidenceHash = computeCanonicalJsonSha256({
      kind: 'context_rot_redundant',
      ruleIdA: pair.ruleIdA,
      ruleIdB: pair.ruleIdB,
      jaccardSimilarity: pair.jaccardSimilarity,
      keepRuleId: pair.keepRuleId,
    });

    candidates.push(
      Object.freeze({
        candidateId,
        factId: pair.keepRuleId,
        triggerFlag: 'context_rot_redundant',
        proposedRuleText: pair.proposedMergedText,
        proposedPrerequisiteEdges: Object.freeze([]),
        evidenceHashes: Object.freeze([evidenceHash]),
        observedCount: Math.max(1, Math.round(pair.jaccardSimilarity * 10)),
        status: 'staged',
        gateAudit: null,
        ...(cartridgeId ? { cartridgeId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
  }

  // 3. Dead-weight rules -> lexical-locked trimmed candidate governed by Gate 3 Paired Canary Replay
  for (const dead of report.deadWeightRules) {
    const candidateId = `Q-TRIM-${dead.ruleId}`;
    if (emittedIds.has(candidateId)) continue;
    emittedIds.add(candidateId);

    const evidenceHash = computeCanonicalJsonSha256({
      kind: 'context_rot_dead_weight',
      ruleId: dead.ruleId,
      retrievals: dead.retrievals,
      associatedFailures: dead.associatedFailures,
      passRateLift: dead.passRateLift,
    });

    candidates.push(
      Object.freeze({
        candidateId,
        factId: dead.ruleId,
        triggerFlag: 'context_rot_dead_weight',
        proposedRuleText: dead.compactedText,
        proposedPrerequisiteEdges: Object.freeze([]),
        evidenceHashes: Object.freeze([evidenceHash]),
        observedCount: dead.retrievals,
        status: 'staged',
        gateAudit: null,
        ...(cartridgeId ? { cartridgeId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
  }

  return candidates;
}
