import { describe, expect, it } from 'vitest';
import {
  buildRedTeamSlowCookReceiptDocument,
  evaluateRedTeamSlowCookCandidate,
  type RedTeamLiveProbeSummary,
  type RedTeamSlowCookCandidate,
  type RedTeamSlowCookThreat,
} from '../src/v4/redteam/slow-cook.js';
import { buildRedTeamFlowTraceEvent } from '../dashboard/src/lib/v4-hope-flow.js';

const stagedAt = '2026-11-26T00:00:00.000Z';
const threat: RedTeamSlowCookThreat = {
  id: 'RT-01',
  category: 'input_validation_path_traversal',
  route: '/api/runs',
  method: 'GET',
};
const candidate: RedTeamSlowCookCandidate = {
  candidateId: 'Q-RT-RT-01',
  cartridgeId: 'redteam-v1-loopback',
  factId: 'RT-01',
  triggerFlag: 'input_validation_path_traversal',
  route: '/api/runs',
  proposedRuleText: 'On GET /api/runs: reject unsafe query path traversal.',
  evidenceHashes: ['a'.repeat(64)],
  status: 'staged',
  stagedAt,
};
const passingSummary: RedTeamLiveProbeSummary = {
  probeId: 'RT-01',
  status: 'pass',
  passedAssertions: 2,
  failedAssertions: 0,
  durationMs: 18,
  executedAt: '2026-11-26T00:01:00.000Z',
};

describe('Red-Team Slow Cook shadow gate', () => {
  it('approves a complete staged candidate and creates a stable canonical receipt', () => {
    const first = evaluateRedTeamSlowCookCandidate(
      candidate,
      [threat],
      { 'RT-01': passingSummary },
      [candidate]
    );
    const second = evaluateRedTeamSlowCookCandidate(
      candidate,
      [threat],
      { 'RT-01': passingSummary },
      [candidate]
    );

    expect(first.status).toBe('approved');
    expect(first.rejectedByGate).toBeNull();
    expect(first.gateAudit.lexicalLock).toMatchObject({ executed: true, passed: true, retentionRate: 1 });
    expect(first.gateAudit.contradictionLinter).toMatchObject({ executed: true, passed: true });
    expect(first.gateAudit.canaryReplay).toMatchObject({
      executed: true,
      passed: true,
      canaryRegressions: 0,
    });
    expect(first.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.receiptSha256).toBe(first.receiptSha256);
  });

  it('rejects failed and absent live replays while leaving source candidates staged', () => {
    const failed = evaluateRedTeamSlowCookCandidate(
      candidate,
      [threat],
      { 'RT-01': { ...passingSummary, status: 'fail', failedAssertions: 1 } },
      [candidate]
    );
    const absent = evaluateRedTeamSlowCookCandidate(candidate, [threat], {}, [candidate]);

    expect(failed).toMatchObject({ status: 'rejected', rejectedByGate: 'canary_replay' });
    expect(failed.gateAudit.canaryReplay).toMatchObject({ passed: false, canaryRegressions: 1 });
    expect(absent.gateAudit.canaryReplay).toMatchObject({ passed: false, canaryRegressions: 0 });
    expect(candidate.status).toBe('staged');
  });

  it('halts at G1 for malformed provenance and exposes shadow gate data on trace events', () => {
    const malformed = { ...candidate, evidenceHashes: ['not-a-sha'] };
    const rejected = evaluateRedTeamSlowCookCandidate(
      malformed,
      [threat],
      { 'RT-01': passingSummary },
      [malformed]
    );
    expect(rejected).toMatchObject({ status: 'rejected', rejectedByGate: 'lexical_lock' });
    expect(rejected.gateAudit.contradictionLinter.executed).toBe(false);
    expect(rejected.gateAudit.canaryReplay.executed).toBe(false);

    const document = buildRedTeamSlowCookReceiptDocument(
      [candidate],
      [threat],
      { 'RT-01': passingSummary }
    );
    const trace = buildRedTeamFlowTraceEvent({
      candidate: { ...candidate, liveVerdict: 'pass', slowCookDecision: document.receipts[0] },
      threat,
    });
    expect(trace.redTeam?.status).toBe('staged');
    expect(trace.slowClockGate).toMatchObject({
      status: 'approved',
      g1LexicalPassed: true,
      g2ConflictPassed: true,
      g3CanaryPassed: true,
    });
  });
});
