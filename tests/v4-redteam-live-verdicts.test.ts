import { describe, expect, it } from 'vitest';
import { buildRedTeamFlowTraceEvent } from '../dashboard/src/lib/v4-hope-flow.js';
import { parseVitestLiveProbeSummaries } from '../scripts/v4/run-redteam-live-verdicts.js';

const executionStart = 1_763_000_000_000;

describe('Red-Team live verdict telemetry', () => {
  it('extracts PASS/FAIL only from complete live Vitest assertions', () => {
    const summaries = parseVitestLiveProbeSummaries({
      testResults: [
        {
          name: 'tests/v4/redteam/generated/rt-01.test.ts',
          startTime: executionStart,
          endTime: executionStart + 37,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 2 },
            {
              title: 'verifies defensive invariant against local server',
              status: 'passed',
              duration: 35,
            },
          ],
        },
        {
          name: 'tests/v4/redteam/generated/rt-02.test.ts',
          startTime: executionStart,
          endTime: executionStart + 45,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 3 },
            {
              title: 'verifies defensive invariant against local server',
              status: 'failed',
              duration: 42,
            },
          ],
        },
        {
          name: 'tests/v4/redteam/generated/rt-03.test.ts',
          startTime: executionStart,
          endTime: executionStart + 5,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 5 },
            {
              title: 'verifies defensive invariant against local server',
              status: 'skipped',
              duration: 0,
            },
          ],
        },
      ],
    });

    expect(summaries['RT-01']).toMatchObject({
      probeId: 'RT-01',
      status: 'pass',
      passedAssertions: 2,
      failedAssertions: 0,
      durationMs: 37,
    });
    expect(summaries['RT-02']).toMatchObject({
      probeId: 'RT-02',
      status: 'fail',
      passedAssertions: 1,
      failedAssertions: 1,
      durationMs: 45,
    });
    expect(summaries['RT-03']).toBeUndefined();
  });

  it('renders live probe verdicts as PASS, FAIL, or staged quarantine without changing gate state', () => {
    const baseCandidate = {
      candidateId: 'candidate-01',
      factId: 'RT-01',
      triggerFlag: 'authz_idor',
      route: '/api/runs',
      proposedRuleText: 'Keep loopback probes isolated.',
      evidenceHashes: ['abc123'],
      status: 'staged',
      stagedAt: '2026-11-26T00:00:00.000Z',
    } as const;

    const passed = buildRedTeamFlowTraceEvent({
      candidate: { ...baseCandidate, liveVerdict: 'pass', durationMs: 31 },
    });
    expect(passed.outcome).toBe('PASS');
    expect(passed.terminalNode).toBe('VERIFIED_OUTPUT');
    expect(passed.redTeam?.status).toBe('staged');
    expect(passed.redTeam?.liveVerdict).toBe('pass');
    expect(passed.latencyMs).toBe(31);

    const failed = buildRedTeamFlowTraceEvent({
      candidate: { ...baseCandidate, liveVerdict: 'fail', durationMs: 53 },
    });
    expect(failed.outcome).toBe('FAIL');
    expect(failed.terminalNode).toBe('GATE_REJECTED');
    expect(failed.redTeam?.status).toBe('staged');
    expect(failed.redTeam?.liveVerdict).toBe('fail');

    const staged = buildRedTeamFlowTraceEvent({ candidate: baseCandidate });
    expect(staged.outcome).toBe('QUARANTINE');
    expect(staged.terminalNode).toBe('SLOW_CLOCK_GATE');
    expect(staged.redTeam?.liveVerdict).toBe('staged');
  });
});
