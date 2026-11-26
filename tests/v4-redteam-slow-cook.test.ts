import { describe, expect, it } from 'vitest';
import {
  evaluateRedTeamSlowClockCandidate,
  type RedTeamGateCandidateInput,
  type RedTeamGateThreatInput,
  type RedTeamProbeSummaryInput,
} from '../src/v4/redteam/slow-cook-gate.js';

const validSha = 'a'.repeat(64);

const baselineSummaries: Record<string, RedTeamProbeSummaryInput> = {
  'RT-01': { probeId: 'RT-01', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-02': { probeId: 'RT-02', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-03': { probeId: 'RT-03', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-04': { probeId: 'RT-04', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-05': { probeId: 'RT-05', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-06': { probeId: 'RT-06', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-07': { probeId: 'RT-07', status: 'fail', passedAssertions: 1, failedAssertions: 1, durationMs: 200, executedAt: '2026-11-26T06:33:26Z' },
};

const rt07Threat: RedTeamGateThreatInput = {
  id: 'RT-07',
  category: 'input_validation_path_traversal',
  route: '/api/v4-hope/redteam-canary',
  method: 'GET',
  expectedDefense: 'The probe must reject a redirect whose Location leaves the strict loopback allowlist.',
};

const rt07Candidate: RedTeamGateCandidateInput = {
  candidateId: 'Q-RT-RT-07',
  cartridgeId: 'redteam-v1-loopback',
  factId: 'RT-07',
  triggerFlag: 'input_validation_path_traversal',
  route: '/api/v4-hope/redteam-canary',
  proposedRuleText: 'On GET /api/v4-hope/redteam-canary: The probe must reject a redirect whose Location leaves the strict loopback allowlist.',
  evidenceHashes: [validSha],
  status: 'staged',
  stagedAt: '2026-11-26T06:30:14Z',
};

const rt08Threat: RedTeamGateThreatInput = {
  id: 'RT-08',
  category: 'error_leakage_stack_trace',
  route: '/api/v4-hope/redteam-canary',
  method: 'GET',
  expectedDefense: 'Without a complete Vitest JSON result, retain this candidate in staged quarantine.',
};

const rt08Candidate: RedTeamGateCandidateInput = {
  candidateId: 'Q-RT-RT-08',
  cartridgeId: 'redteam-v1-loopback',
  factId: 'RT-08',
  triggerFlag: 'error_leakage_stack_trace',
  route: '/api/v4-hope/redteam-canary',
  proposedRuleText: 'On GET /api/v4-hope/redteam-canary: Without a complete Vitest JSON result, retain this candidate in staged quarantine.',
  evidenceHashes: [validSha],
  status: 'staged',
  stagedAt: '2026-11-26T06:30:14Z',
};

describe('Red-Team Slow Clock Gate (G1 / G2 / G3)', () => {
  it('promotes RT-07 to PROMOTED_SHADOW when G1, G2, and G3 all pass', () => {
    const receipt = evaluateRedTeamSlowClockCandidate({
      candidate: rt07Candidate,
      threat: rt07Threat,
      summaries: baselineSummaries,
      allCandidates: [rt07Candidate, rt08Candidate],
    });

    expect(receipt.decision).toBe('PROMOTED_SHADOW');
    expect(receipt.gates.g1.pass).toBe(true);
    expect(receipt.gates.g2.pass).toBe(true);
    expect(receipt.gates.g3.pass).toBe(true);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects RT-08 at G1 with missing_live_failure_evidence when no live failure summary exists', () => {
    const receipt = evaluateRedTeamSlowClockCandidate({
      candidate: rt08Candidate,
      threat: rt08Threat,
      summaries: baselineSummaries,
      allCandidates: [rt07Candidate, rt08Candidate],
    });

    expect(receipt.decision).toBe('REJECTED');
    expect(receipt.gates.g1).toEqual({
      pass: false,
      reason: 'missing_live_failure_evidence',
    });
  });

  it('rejects at G2 when a baseline hardened probe (RT-01) regresses', () => {
    const regressedSummaries: Record<string, RedTeamProbeSummaryInput> = {
      ...baselineSummaries,
      'RT-01': { ...baselineSummaries['RT-01'], status: 'fail', failedAssertions: 1 },
    };

    const receipt = evaluateRedTeamSlowClockCandidate({
      candidate: rt07Candidate,
      threat: rt07Threat,
      summaries: regressedSummaries,
      allCandidates: [rt07Candidate],
    });

    expect(receipt.decision).toBe('REJECTED');
    expect(receipt.gates.g1.pass).toBe(true);
    expect(receipt.gates.g2.pass).toBe(false);
    expect(receipt.gates.g2.reason).toContain('baseline_probe_regression:RT-01');
  });

  it('rejects at G1 for invalid SHA-256 and at G2 for broken lexical lock', () => {
    const badSha = evaluateRedTeamSlowClockCandidate({
      candidate: { ...rt07Candidate, evidenceHashes: ['not-a-sha256'] },
      threat: rt07Threat,
      summaries: baselineSummaries,
      allCandidates: [rt07Candidate],
    });
    expect(badSha.decision).toBe('REJECTED');
    expect(badSha.gates.g1).toEqual({ pass: false, reason: 'invalid_evidence_sha256' });

    const brokenLexicalLock = evaluateRedTeamSlowClockCandidate({
      candidate: {
        ...rt07Candidate,
        proposedRuleText: 'On GET: Reject unsafe external redirects.',
      },
      threat: rt07Threat,
      summaries: baselineSummaries,
      allCandidates: [rt07Candidate],
    });
    expect(brokenLexicalLock.decision).toBe('REJECTED');
    expect(brokenLexicalLock.gates.g1.pass).toBe(true);
    expect(brokenLexicalLock.gates.g2.pass).toBe(false);
    expect(brokenLexicalLock.gates.g2.reason).toContain(
      'lexical_lock_missing_tokens:/api/v4-hope/redteam-canary'
    );
  });
});
