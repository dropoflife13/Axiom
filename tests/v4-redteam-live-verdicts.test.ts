import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRedTeamFlowTraceEvent } from '../dashboard/src/lib/v4-hope-flow.js';
import {
  buildRedTeamMutationProbeManifest,
  parseVitestLiveProbeSummaries,
  registerMutationProbeManifest,
} from '../scripts/v4/run-redteam-live-verdicts.js';

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
        {
          name: 'tests/v4/redteam/generated/rt-07-canary.test.ts',
          startTime: executionStart,
          endTime: executionStart + 41,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 3 },
            {
              title: 'verifies defensive invariant against local server',
              status: 'failed',
              duration: 38,
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
    expect(summaries['RT-07']).toMatchObject({
      probeId: 'RT-07',
      status: 'fail',
      passedAssertions: 1,
      failedAssertions: 1,
      durationMs: 41,
    });
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

    const mitigated = buildRedTeamFlowTraceEvent({
      candidate: {
        ...baseCandidate,
        candidateId: 'Q-RT-RT-07',
        factId: 'RT-07',
        route: '/api/v4-hope/redteam-canary',
        liveVerdict: 'pass',
      },
      enforcedRuleIds: ['Q-RT-RT-07'],
    });
    expect(mitigated.outcome).toBe('PASS');
    expect(mitigated.terminalNode).toBe('VERIFIED_OUTPUT');
    expect(mitigated.shadowStatus).toBe('MITIGATED');
    expect(mitigated.redTeam?.shadowEnforced).toBe(true);
    expect(mitigated.redTeam?.mitigated).toBe(true);
    expect(mitigated.redTeam?.mitigationStatus).toBe('MITIGATED');
    expect(mitigated.terminalLog?.some((line) => line.text.includes('MITIGATED'))).toBe(true);
  });

  it('extracts RT-09 through RT-12 verdicts and registers staged SHA-256 manifests idempotently', () => {
    const summaries = parseVitestLiveProbeSummaries({
      testResults: [
        {
          name: 'tests/v4/redteam/generated/rt-09-method-tampering.test.ts',
          startTime: executionStart,
          endTime: executionStart + 12,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 1 },
            { title: 'verifies defensive invariant against local server', status: 'passed', duration: 11 },
          ],
        },
        {
          name: 'tests/v4/redteam/generated/rt-12-header-spoofing.test.ts',
          startTime: executionStart,
          endTime: executionStart + 19,
          assertionResults: [
            { title: 'validates target is strictly loopback', status: 'passed', duration: 2 },
            { title: 'verifies defensive invariant against local server', status: 'failed', duration: 17 },
          ],
        },
      ],
    });

    expect(summaries['RT-09']).toMatchObject({ probeId: 'RT-09', status: 'pass' });
    expect(summaries['RT-12']).toMatchObject({ probeId: 'RT-12', status: 'fail' });

    const manifest = buildRedTeamMutationProbeManifest('2026-11-26T00:00:00.000Z');
    expect(JSON.stringify(manifest)).not.toContain('evil.example');
    expect(manifest.threats.map((threat) => threat.id)).toEqual(['RT-09', 'RT-10', 'RT-11', 'RT-12']);
    expect(
      manifest.candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.evidenceHashes[0]))
    ).toBe(true);

    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-redteam-mutation-'));
    try {
      fs.writeFileSync(
        path.join(stateDir, 'quarantine-candidates.json'),
        JSON.stringify({
          candidates: [
            { factId: 'RT-01', proposedRuleText: 'keep-rt-01' },
            {
              factId: 'RT-12',
              proposedRuleText: 'stale evil.example rule',
              evidenceHashes: ['0'.repeat(64)],
              stagedAt: '2026-11-25T00:00:00.000Z',
            },
          ],
        })
      );
      fs.writeFileSync(
        path.join(stateDir, 'threat-matrix.json'),
        JSON.stringify({
          threats: [
            { id: 'RT-01', expectedDefense: 'keep-rt-01' },
            { id: 'RT-12', expectedDefense: 'stale evil.example defense' },
          ],
        })
      );

      registerMutationProbeManifest(stateDir, '2026-11-26T00:00:00.000Z');
      registerMutationProbeManifest(stateDir, '2026-11-26T00:00:00.000Z');

      const candidates = JSON.parse(
        fs.readFileSync(path.join(stateDir, 'quarantine-candidates.json'), 'utf8')
      ).candidates as Array<{
        factId: string;
        status?: string;
        proposedRuleText?: string;
        stagedAt?: string;
        evidenceHashes?: string[];
      }>;
      const threats = JSON.parse(fs.readFileSync(path.join(stateDir, 'threat-matrix.json'), 'utf8'))
        .threats as Array<{ id: string; expectedDefense?: string }>;

      expect(candidates.map((c) => c.factId)).toEqual(['RT-01', 'RT-12', 'RT-09', 'RT-10', 'RT-11']);
      expect(candidates[0].proposedRuleText).toBe('keep-rt-01');
      expect(candidates[1].stagedAt).toBe('2026-11-25T00:00:00.000Z');
      expect(candidates[1].proposedRuleText).not.toContain('evil.example');
      expect(candidates[1].evidenceHashes?.[0]).toBe(
        manifest.candidates.find((c) => c.factId === 'RT-12')?.evidenceHashes[0]
      );
      expect(candidates.slice(1).every((c) => c.status === 'staged')).toBe(true);
      expect(threats.map((t) => t.id)).toEqual(['RT-01', 'RT-12', 'RT-09', 'RT-10', 'RT-11']);
      expect(threats[0].expectedDefense).toBe('keep-rt-01');
      expect(threats[1].expectedDefense).not.toContain('evil.example');
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
