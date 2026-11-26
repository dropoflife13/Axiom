// Deterministic, read-only Slow Clock decisions for Red-Team quarantine candidates.
// Receipts describe candidate eligibility only; they never alter domain rules or
// the source quarantine manifest.

import { computeCanonicalJsonSha256 } from '../hope/fast-clock.js';

export const REDTEAM_SLOW_COOK_SCHEMA = '4.0.0-redteam-slow-cook' as const;

export interface RedTeamSlowCookCandidate {
  readonly candidateId: string;
  readonly cartridgeId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly route: string;
  readonly proposedRuleText: string;
  readonly evidenceHashes: readonly string[];
  readonly status: string;
  readonly stagedAt: string;
}

export interface RedTeamSlowCookThreat {
  readonly id: string;
  readonly category: string;
  readonly route: string;
  readonly method: string;
}

export interface RedTeamLiveProbeSummary {
  readonly probeId: string;
  readonly status: 'pass' | 'fail';
  readonly passedAssertions: number;
  readonly failedAssertions: number;
  readonly durationMs: number;
  readonly executedAt: string;
}

export interface RedTeamSlowCookLexicalGate {
  readonly executed: boolean;
  readonly passed: boolean;
  readonly requiredTokens: readonly string[];
  readonly retainedTokens: readonly string[];
  readonly missingTokens: readonly string[];
  readonly retentionRate: number;
  readonly reason?: string;
}

export interface RedTeamSlowCookViolation {
  readonly code:
    | 'UNKNOWN_THREAT'
    | 'FACT_ID_MISMATCH'
    | 'ROUTE_MISMATCH'
    | 'TRIGGER_FLAG_MISMATCH'
    | 'DUPLICATE_CANDIDATE_CONFLICT'
    | 'DUPLICATE_FACT_CONFLICT';
  readonly message: string;
}

export interface RedTeamSlowCookContradictionGate {
  readonly executed: boolean;
  readonly passed: boolean;
  readonly violations: readonly RedTeamSlowCookViolation[];
}

export interface RedTeamSlowCookCanaryGate {
  readonly executed: boolean;
  readonly passed: boolean;
  readonly targetBeforePassCount: number;
  readonly targetAfterPassCount: number;
  readonly targetCohortDelta: number;
  readonly canaryBeforePassCount: number;
  readonly canaryAfterPassCount: number;
  readonly canaryRegressions: number;
  readonly regressedCanaryTaskIds: readonly string[];
  readonly reason?: string;
}

export interface RedTeamSlowCookGateAudit {
  readonly evaluatedAt: string;
  readonly lexicalLock: RedTeamSlowCookLexicalGate;
  readonly contradictionLinter: RedTeamSlowCookContradictionGate;
  readonly canaryReplay: RedTeamSlowCookCanaryGate;
}

export interface RedTeamSlowCookReceipt {
  readonly schemaVersion: typeof REDTEAM_SLOW_COOK_SCHEMA;
  readonly candidateId: string;
  readonly factId: string;
  readonly sourceCandidateSha256: string;
  readonly status: 'approved' | 'rejected';
  readonly rejectedByGate: 'lexical_lock' | 'contradiction_linter' | 'canary_replay' | null;
  readonly gateAudit: RedTeamSlowCookGateAudit;
  readonly receiptSha256: string;
}

export interface RedTeamSlowCookReceiptDocument {
  readonly schemaVersion: typeof REDTEAM_SLOW_COOK_SCHEMA;
  readonly generatedAt: string;
  readonly readOnlyNotice: string;
  readonly receipts: readonly RedTeamSlowCookReceipt[];
}

export interface EvaluateRedTeamSlowCookOptions {
  /** A deterministic override for reproducible fixtures. */
  readonly evaluatedAt?: string;
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function lexicalMatch(text: string, token: string): boolean {
  if (/^[A-Za-z0-9_]+$/.test(token)) {
    return new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`, 'i').test(text);
  }
  return text.includes(token);
}

function sourceCandidatePayload(candidate: RedTeamSlowCookCandidate): object {
  return {
    candidateId: candidate.candidateId,
    cartridgeId: candidate.cartridgeId,
    evidenceHashes: [...candidate.evidenceHashes],
    factId: candidate.factId,
    proposedRuleText: candidate.proposedRuleText,
    route: candidate.route,
    stagedAt: candidate.stagedAt,
    status: candidate.status,
    triggerFlag: candidate.triggerFlag,
  };
}

function skippedContradictionGate(): RedTeamSlowCookContradictionGate {
  return { executed: false, passed: false, violations: [] };
}

function skippedCanaryGate(): RedTeamSlowCookCanaryGate {
  return {
    executed: false,
    passed: false,
    targetBeforePassCount: 0,
    targetAfterPassCount: 0,
    targetCohortDelta: 0,
    canaryBeforePassCount: 0,
    canaryAfterPassCount: 0,
    canaryRegressions: 0,
    regressedCanaryTaskIds: [],
  };
}

function candidateConflict(
  candidate: RedTeamSlowCookCandidate,
  other: RedTeamSlowCookCandidate
): boolean {
  return computeCanonicalJsonSha256(sourceCandidatePayload(candidate)) !==
    computeCanonicalJsonSha256(sourceCandidatePayload(other));
}

function evaluateLexicalLock(
  candidate: RedTeamSlowCookCandidate,
  threat: RedTeamSlowCookThreat | undefined
): RedTeamSlowCookLexicalGate {
  const requiredTokens = threat ? [threat.method, candidate.route] : [candidate.route];
  const retainedTokens = requiredTokens.filter((token) => lexicalMatch(candidate.proposedRuleText, token));
  const missingTokens = requiredTokens.filter((token) => !retainedTokens.includes(token));
  const failures: string[] = [];

  if (candidate.cartridgeId !== 'redteam-v1-loopback') {
    failures.push('candidate is not scoped to redteam-v1-loopback');
  }
  if (candidate.status !== 'staged') {
    failures.push('candidate is not staged quarantine');
  }
  if (!isIsoDate(candidate.stagedAt)) {
    failures.push('candidate has no valid stagedAt timestamp');
  }
  if (candidate.evidenceHashes.length === 0 || !candidate.evidenceHashes.every(isSha256)) {
    failures.push('candidate evidence hashes are not SHA-256 hex digests');
  }
  if (!threat) {
    failures.push(`matching threat ${candidate.factId} is absent`);
  }
  if (missingTokens.length > 0) {
    failures.push(`missing lexical token(s) [${missingTokens.join(', ')}]`);
  }

  const passed = failures.length === 0;
  return {
    executed: true,
    passed,
    requiredTokens,
    retainedTokens,
    missingTokens,
    retentionRate: requiredTokens.length === 0 ? 1 : retainedTokens.length / requiredTokens.length,
    ...(passed ? {} : { reason: `Red-Team lexical lock failed: ${failures.join('; ')}.` }),
  };
}

function evaluateContradictions(
  candidate: RedTeamSlowCookCandidate,
  threat: RedTeamSlowCookThreat | undefined,
  candidates: readonly RedTeamSlowCookCandidate[]
): RedTeamSlowCookContradictionGate {
  const violations: RedTeamSlowCookViolation[] = [];
  const add = (code: RedTeamSlowCookViolation['code'], message: string): void => {
    violations.push({ code, message });
  };

  if (!threat) {
    add('UNKNOWN_THREAT', `No threat manifest entry matches ${candidate.factId}.`);
  } else {
    if (threat.id !== candidate.factId) {
      add('FACT_ID_MISMATCH', `Candidate fact ${candidate.factId} does not match threat ${threat.id}.`);
    }
    if (threat.route !== candidate.route) {
      add('ROUTE_MISMATCH', `Candidate route ${candidate.route} does not match threat route ${threat.route}.`);
    }
    if (threat.category !== candidate.triggerFlag) {
      add(
        'TRIGGER_FLAG_MISMATCH',
        `Candidate flag ${candidate.triggerFlag} does not match threat category ${threat.category}.`
      );
    }
  }

  for (const other of candidates) {
    if (other === candidate || !candidateConflict(candidate, other)) continue;
    if (other.candidateId === candidate.candidateId) {
      add(
        'DUPLICATE_CANDIDATE_CONFLICT',
        `Candidate ID ${candidate.candidateId} has incompatible quarantine records.`
      );
    }
    if (other.factId === candidate.factId) {
      add(
        'DUPLICATE_FACT_CONFLICT',
        `Fact ${candidate.factId} has incompatible quarantine records.`
      );
    }
  }

  return { executed: true, passed: violations.length === 0, violations };
}

function evaluateCanaryReplay(
  candidate: RedTeamSlowCookCandidate,
  summary: RedTeamLiveProbeSummary | undefined
): RedTeamSlowCookCanaryGate {
  const completePass =
    summary?.probeId === candidate.factId &&
    summary.status === 'pass' &&
    Number.isInteger(summary.passedAssertions) &&
    summary.passedAssertions > 0 &&
    Number.isInteger(summary.failedAssertions) &&
    summary.failedAssertions === 0 &&
    Number.isFinite(summary.durationMs) &&
    summary.durationMs >= 0 &&
    isIsoDate(summary.executedAt);

  if (completePass) {
    return {
      executed: true,
      passed: true,
      targetBeforePassCount: 0,
      targetAfterPassCount: 1,
      targetCohortDelta: 1,
      canaryBeforePassCount: 1,
      canaryAfterPassCount: 1,
      canaryRegressions: 0,
      regressedCanaryTaskIds: [],
    };
  }

  const failedAssertions =
    summary?.probeId === candidate.factId && Number.isInteger(summary.failedAssertions)
      ? Math.max(0, summary.failedAssertions)
      : 0;
  const hasRegression = summary?.probeId === candidate.factId && summary.status === 'fail';
  return {
    executed: true,
    passed: false,
    targetBeforePassCount: 0,
    targetAfterPassCount: 0,
    targetCohortDelta: 0,
    canaryBeforePassCount: 1,
    canaryAfterPassCount: hasRegression ? 0 : 1,
    canaryRegressions: hasRegression ? Math.max(1, failedAssertions) : 0,
    regressedCanaryTaskIds: hasRegression ? [candidate.factId] : [],
    reason: summary
      ? `Recorded replay for ${candidate.factId} is not a complete passing verdict.`
      : `No complete recorded replay exists for ${candidate.factId}.`,
  };
}

/**
 * Evaluates one staged Red-Team candidate. The result is a shadow decision:
 * the candidate remains in the quarantine manifest and no domain file is changed.
 */
export function evaluateRedTeamSlowCookCandidate(
  candidate: RedTeamSlowCookCandidate,
  threats: readonly RedTeamSlowCookThreat[],
  summaries: Readonly<Record<string, RedTeamLiveProbeSummary>>,
  candidates: readonly RedTeamSlowCookCandidate[] = [candidate],
  options: EvaluateRedTeamSlowCookOptions = {}
): RedTeamSlowCookReceipt {
  const threat = threats.find((entry) => entry.id === candidate.factId);
  const evaluatedAt =
    options.evaluatedAt ??
    summaries[candidate.factId]?.executedAt ??
    (isIsoDate(candidate.stagedAt) ? candidate.stagedAt : '1970-01-01T00:00:00.000Z');
  const lexicalLock = evaluateLexicalLock(candidate, threat);
  const sourceCandidateSha256 = computeCanonicalJsonSha256(sourceCandidatePayload(candidate));

  let status: 'approved' | 'rejected' = 'rejected';
  let rejectedByGate: RedTeamSlowCookReceipt['rejectedByGate'] = 'lexical_lock';
  let contradictionLinter = skippedContradictionGate();
  let canaryReplay = skippedCanaryGate();

  if (lexicalLock.passed) {
    contradictionLinter = evaluateContradictions(candidate, threat, candidates);
    rejectedByGate = 'contradiction_linter';
    if (contradictionLinter.passed) {
      canaryReplay = evaluateCanaryReplay(candidate, summaries[candidate.factId]);
      rejectedByGate = 'canary_replay';
      if (canaryReplay.passed) {
        status = 'approved';
        rejectedByGate = null;
      }
    }
  }

  const gateAudit: RedTeamSlowCookGateAudit = {
    evaluatedAt,
    lexicalLock,
    contradictionLinter,
    canaryReplay,
  };
  const payload = {
    schemaVersion: REDTEAM_SLOW_COOK_SCHEMA,
    candidateId: candidate.candidateId,
    factId: candidate.factId,
    sourceCandidateSha256,
    status,
    rejectedByGate,
    gateAudit,
  };

  return { ...payload, receiptSha256: computeCanonicalJsonSha256(payload) };
}

/** Builds a deterministic, read-only receipt document ordered by candidate ID. */
export function buildRedTeamSlowCookReceiptDocument(
  candidates: readonly RedTeamSlowCookCandidate[],
  threats: readonly RedTeamSlowCookThreat[],
  summaries: Readonly<Record<string, RedTeamLiveProbeSummary>>,
  options: EvaluateRedTeamSlowCookOptions = {}
): RedTeamSlowCookReceiptDocument {
  const receipts = [...candidates]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    .map((candidate) => evaluateRedTeamSlowCookCandidate(candidate, threats, summaries, candidates, options));
  const generatedAt =
    options.evaluatedAt ??
    receipts.map((receipt) => receipt.gateAudit.evaluatedAt).sort().at(-1) ??
    '1970-01-01T00:00:00.000Z';

  return {
    schemaVersion: REDTEAM_SLOW_COOK_SCHEMA,
    generatedAt,
    readOnlyNotice:
      'Shadow receipts record deterministic gate decisions only; quarantine candidates and domain rules remain unchanged.',
    receipts,
  };
}
