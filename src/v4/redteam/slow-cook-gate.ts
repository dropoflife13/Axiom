// src/v4/redteam/slow-cook-gate.ts
// Dedicated deterministic Red-Team Slow Clock Gate (G1 / G2 / G3).
// Evaluates quarantined Red-Team candidates against real probe-results-summary.json
// evidence and emits frozen SHA-256 shadow promotion receipts without mutating
// canonical HOPE v4 rule vaults.

import { computeCanonicalJsonSha256 } from '../hope/fast-clock.js';
import { extractRequiredTokens } from '../lexical-token-extractor.js';
import { assertLoopbackTarget } from './loopback-guard.js';

export const REDTEAM_SLOW_CLOCK_SCHEMA = '4.0.0-redteam-slow-clock-receipts' as const;
export const BASELINE_HARDENED_PROBE_IDS = [
  'RT-01',
  'RT-02',
  'RT-03',
  'RT-04',
  'RT-05',
  'RT-06',
] as const;

export interface RedTeamGateCandidateInput {
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

export interface RedTeamGateThreatInput {
  readonly id: string;
  readonly category: string;
  readonly route: string;
  readonly method: string;
  readonly title?: string;
  readonly expectedDefense?: string;
  readonly severity?: string;
}

export interface RedTeamProbeSummaryInput {
  readonly probeId: string;
  readonly status: 'pass' | 'fail';
  readonly passedAssertions: number;
  readonly failedAssertions: number;
  readonly durationMs: number;
  readonly executedAt: string;
}

export interface GateCheckVerdict {
  readonly pass: boolean;
  readonly reason: string;
}

export interface RedTeamSlowClockReceipt {
  readonly candidateId: string;
  readonly probeId: string;
  readonly route: string;
  readonly triggerFlag: string;
  readonly decision: 'PROMOTED_SHADOW' | 'REJECTED';
  readonly gates: {
    readonly g1: GateCheckVerdict;
    readonly g2: GateCheckVerdict;
    readonly g3: GateCheckVerdict;
  };
  readonly evidenceHash: string;
  readonly receiptHash: string;
}

export interface RedTeamSlowClockReceiptDocument {
  readonly schemaVersion: typeof REDTEAM_SLOW_CLOCK_SCHEMA;
  readonly generatedAt: string;
  readonly readOnlyNotice: string;
  readonly receipts: readonly RedTeamSlowClockReceipt[];
}

function isValidSha256(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isLoopbackRoute(route: string): boolean {
  const trimmed = route.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    assertLoopbackTarget(trimmed);
    return true;
  } catch {
    return false;
  }
}

function checkTokenRetained(text: string, token: string): boolean {
  return text.includes(token);
}

export function evaluateRedTeamSlowClockCandidate(params: {
  readonly candidate: RedTeamGateCandidateInput;
  readonly threat: RedTeamGateThreatInput | null;
  readonly summaries: Readonly<Record<string, RedTeamProbeSummaryInput>>;
  readonly allCandidates: readonly RedTeamGateCandidateInput[];
}): RedTeamSlowClockReceipt {
  const { candidate, threat, summaries, allCandidates } = params;
  const evidenceHash = candidate.evidenceHashes[0] ?? '';
  const summary = summaries[candidate.factId];

  // =========================================================================
  // G1 — Evidence & Schema Integrity
  // =========================================================================
  let g1: GateCheckVerdict;
  const expectedDefense = threat?.expectedDefense?.trim() ?? '';

  if (!isValidSha256(evidenceHash)) {
    g1 = { pass: false, reason: 'invalid_evidence_sha256' };
  } else if (!isLoopbackRoute(candidate.route)) {
    g1 = { pass: false, reason: 'non_loopback_route' };
  } else if (!candidate.proposedRuleText.trim() || !expectedDefense) {
    g1 = { pass: false, reason: 'missing_rule_or_expected_defense' };
  } else if (!summary || summary.probeId !== candidate.factId) {
    g1 = { pass: false, reason: 'missing_live_failure_evidence' };
  } else if (summary.status !== 'fail' || summary.failedAssertions <= 0) {
    g1 = { pass: false, reason: `probe_status_${summary.status}_not_failing` };
  } else {
    g1 = { pass: true, reason: 'valid_sha256_loopback_and_live_failure' };
  }

  // =========================================================================
  // G2 — Lexical-Lock & Non-Regression Check
  // =========================================================================
  let g2: GateCheckVerdict;
  if (!g1.pass) {
    g2 = { pass: false, reason: 'skipped_due_to_g1_failure' };
  } else {
    const requiredTokens = new Set<string>([
      candidate.route,
      ...(threat?.method ? [threat.method] : []),
      ...extractRequiredTokens(expectedDefense),
    ]);

    const missingTokens: string[] = [];
    for (const token of requiredTokens) {
      if (!checkTokenRetained(candidate.proposedRuleText, token)) {
        missingTokens.push(token);
      }
    }

    const regressedBaselineProbes: string[] = [];
    for (const baselineId of BASELINE_HARDENED_PROBE_IDS) {
      const baseSummary = summaries[baselineId];
      if (baseSummary && (baseSummary.status !== 'pass' || baseSummary.failedAssertions > 0)) {
        regressedBaselineProbes.push(baselineId);
      }
    }

    if (missingTokens.length > 0) {
      g2 = {
        pass: false,
        reason: `lexical_lock_missing_tokens:${missingTokens.join(',')}`,
      };
    } else if (regressedBaselineProbes.length > 0) {
      g2 = {
        pass: false,
        reason: `baseline_probe_regression:${regressedBaselineProbes.join(',')}`,
      };
    } else {
      g2 = { pass: true, reason: 'lexical_lock_100pct_zero_baseline_regressions' };
    }
  }

  // =========================================================================
  // G3 — Canary Reproducibility & Shadow Promotion
  // =========================================================================
  let g3: GateCheckVerdict;
  if (!g1.pass || !g2.pass) {
    g3 = { pass: false, reason: 'skipped_due_to_prior_gate_failure' };
  } else {
    const duplicateIds = allCandidates.filter(
      (other) => other.candidateId === candidate.candidateId
    );
    const conflictingFacts = allCandidates.filter(
      (other) =>
        other.candidateId !== candidate.candidateId && other.factId === candidate.factId
    );

    if (!threat || threat.route !== candidate.route || threat.category !== candidate.triggerFlag) {
      g3 = { pass: false, reason: 'threat_manifest_mismatch' };
    } else if (duplicateIds.length > 1 || conflictingFacts.length > 0) {
      g3 = { pass: false, reason: 'duplicate_or_conflicting_shadow_rule' };
    } else if (!summary || summary.failedAssertions <= 0) {
      g3 = { pass: false, reason: 'zero_failed_assertions' };
    } else {
      g3 = {
        pass: true,
        reason: `reproducible_failure_${summary.failedAssertions}_assertions_shadow_promoted`,
      };
    }
  }

  const decision: RedTeamSlowClockReceipt['decision'] =
    g1.pass && g2.pass && g3.pass ? 'PROMOTED_SHADOW' : 'REJECTED';

  const receiptBody = {
    candidateId: candidate.candidateId,
    probeId: candidate.factId,
    route: candidate.route,
    triggerFlag: candidate.triggerFlag,
    decision,
    gates: { g1, g2, g3 },
    evidenceHash,
  };

  return Object.freeze({
    ...receiptBody,
    receiptHash: computeCanonicalJsonSha256(receiptBody),
  });
}

export function buildRedTeamSlowClockReceiptDocument(
  candidates: readonly RedTeamGateCandidateInput[],
  threats: readonly RedTeamGateThreatInput[],
  summaries: Readonly<Record<string, RedTeamProbeSummaryInput>>
): RedTeamSlowClockReceiptDocument {
  const threatById = new Map<string, RedTeamGateThreatInput>(
    threats.map((t) => [t.id, t])
  );

  const receipts = candidates.map((candidate) =>
    evaluateRedTeamSlowClockCandidate({
      candidate,
      threat: threatById.get(candidate.factId) ?? null,
      summaries,
      allCandidates: candidates,
    })
  );

  return {
    schemaVersion: REDTEAM_SLOW_CLOCK_SCHEMA,
    generatedAt: new Date().toISOString(),
    readOnlyNotice:
      'Shadow-only Slow Clock receipts; canonical HOPE v4 rule vaults are untouched.',
    receipts,
  };
}
