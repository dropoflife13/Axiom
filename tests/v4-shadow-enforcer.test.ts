import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isSafeLoopbackRedirect,
  assertLoopbackTarget,
} from '../src/v4/redteam/loopback-guard.js';
import {
  evaluateRedTeamSlowClockCandidate,
  type RedTeamGateCandidateInput,
  type RedTeamGateThreatInput,
  type RedTeamProbeSummaryInput,
  type RedTeamSlowClockReceipt,
} from '../src/v4/redteam/slow-cook-gate.js';
import {
  applyShadowRuleGuard,
  computeShadowReceiptHash,
  isShadowEnforcementEnabled,
  loadVerifiedShadowRules,
  selectPromotedSweepRules,
  SHADOW_RULE_HEADER,
  verifyShadowReceipt,
} from '../src/v4/redteam/shadow-enforcer.js';

const VALID_SHA = 'a'.repeat(64);

const BASELINE_SUMMARIES: Record<string, RedTeamProbeSummaryInput> = {
  'RT-01': { probeId: 'RT-01', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-02': { probeId: 'RT-02', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-03': { probeId: 'RT-03', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-04': { probeId: 'RT-04', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-05': { probeId: 'RT-05', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-06': { probeId: 'RT-06', status: 'pass', passedAssertions: 2, failedAssertions: 0, durationMs: 20, executedAt: '2026-11-26T00:00:00Z' },
  'RT-07': { probeId: 'RT-07', status: 'fail', passedAssertions: 1, failedAssertions: 1, durationMs: 200, executedAt: '2026-11-26T06:33:26Z' },
};

const RT07_THREAT: RedTeamGateThreatInput = {
  id: 'RT-07',
  category: 'input_validation_path_traversal',
  route: '/api/v4-hope/redteam-canary',
  method: 'GET',
  expectedDefense:
    'The probe must reject a redirect whose Location leaves the strict loopback allowlist.',
};

const RT07_CANDIDATE: RedTeamGateCandidateInput = {
  candidateId: 'Q-RT-RT-07',
  cartridgeId: 'redteam-v1-loopback',
  factId: 'RT-07',
  triggerFlag: 'input_validation_path_traversal',
  route: '/api/v4-hope/redteam-canary',
  proposedRuleText:
    'On GET /api/v4-hope/redteam-canary: The probe must reject a redirect whose Location leaves the strict loopback allowlist.',
  evidenceHashes: [VALID_SHA],
  status: 'staged',
  stagedAt: '2026-11-26T06:30:14Z',
};

const RT08_THREAT: RedTeamGateThreatInput = {
  id: 'RT-08',
  category: 'error_leakage_stack_trace',
  route: '/api/v4-hope/redteam-canary',
  method: 'GET',
  expectedDefense:
    'Without a complete Vitest JSON result, retain this candidate in staged quarantine.',
};

const RT08_CANDIDATE: RedTeamGateCandidateInput = {
  candidateId: 'Q-RT-RT-08',
  cartridgeId: 'redteam-v1-loopback',
  factId: 'RT-08',
  triggerFlag: 'error_leakage_stack_trace',
  route: '/api/v4-hope/redteam-canary',
  proposedRuleText:
    'On GET /api/v4-hope/redteam-canary: Without a complete Vitest JSON result, retain this candidate in staged quarantine.',
  evidenceHashes: [VALID_SHA],
  status: 'staged',
  stagedAt: '2026-11-26T06:30:14Z',
};

function createPromotedRt07Receipt(): RedTeamSlowClockReceipt {
  return evaluateRedTeamSlowClockCandidate({
    candidate: RT07_CANDIDATE,
    threat: RT07_THREAT,
    summaries: BASELINE_SUMMARIES,
    allCandidates: [RT07_CANDIDATE, RT08_CANDIDATE],
  });
}

function createRejectedRt08Receipt(): RedTeamSlowClockReceipt {
  return evaluateRedTeamSlowClockCandidate({
    candidate: RT08_CANDIDATE,
    threat: RT08_THREAT,
    summaries: BASELINE_SUMMARIES,
    allCandidates: [RT07_CANDIDATE, RT08_CANDIDATE],
  });
}

describe('Shadow Rule Enforcer (v4)', () => {
  it('verifies canonical SHA-256 hashes and rejects tampered receiptHash entries', () => {
    const validPromoted = createPromotedRt07Receipt();
    expect(validPromoted.decision).toBe('PROMOTED_SHADOW');
    expect(computeShadowReceiptHash(validPromoted)).toBe(validPromoted.receiptHash);

    const validCheck = verifyShadowReceipt(validPromoted);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.promoted).toBe(true);

    const tamperedHashReceipt: RedTeamSlowClockReceipt = {
      ...validPromoted,
      receiptHash: 'f'.repeat(64),
    };
    const tamperedCheck = verifyShadowReceipt(tamperedHashReceipt);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.promoted).toBe(false);
    expect(tamperedCheck.reason).toBe('receipt_hash_mismatch');

    const tamperedRouteReceipt: RedTeamSlowClockReceipt = {
      ...validPromoted,
      route: '/api/runs',
    };
    expect(verifyShadowReceipt(tamperedRouteReceipt).reason).toBe('receipt_hash_mismatch');

    const loaded = loadVerifiedShadowRules({
      receipts: [tamperedHashReceipt, tamperedRouteReceipt],
      env: { AXIOM_SHADOW_RULES: '1' },
    });
    expect(loaded.active).toBe(true);
    expect(loaded.rules).toEqual([]);
    expect(loaded.enforcedRuleIds).toEqual([]);
    expect(loaded.tamperedIds).toEqual(['Q-RT-RT-07', 'Q-RT-RT-07']);

    const guard = applyShadowRuleGuard({
      route: '/api/v4-hope/redteam-canary',
      status: 307,
      headers: { Location: 'http://0.0.0.0:3000/leaked-canary' },
      body: { canary: 'CANARY_STACK_LEAK' },
      receipts: [tamperedHashReceipt],
      env: { AXIOM_SHADOW_RULES: '1' },
    });
    expect(guard.enforced).toBe(false);
    expect(guard.mitigated).toBe(false);
    expect(guard.status).toBe(307);
    expect(guard.headers.Location).toBe('http://0.0.0.0:3000/leaked-canary');
    expect(guard.headers[SHADOW_RULE_HEADER]).toBeUndefined();
  });

  it('never enforces REJECTED or PENDING receipts (including Q-RT-RT-08) even when AXIOM_SHADOW_RULES=1', () => {
    const rejectedRt08 = createRejectedRt08Receipt();
    expect(rejectedRt08.candidateId).toBe('Q-RT-RT-08');
    expect(rejectedRt08.decision).toBe('REJECTED');

    const pendingReceipt = {
      ...rejectedRt08,
      candidateId: 'Q-RT-PENDING',
      decision: 'PENDING',
    };

    const loadedInMemory = loadVerifiedShadowRules({
      receipts: [rejectedRt08, pendingReceipt],
      env: { AXIOM_SHADOW_RULES: '1' },
    });
    expect(loadedInMemory.active).toBe(true);
    expect(loadedInMemory.rules).toEqual([]);
    expect(loadedInMemory.rejectedIds).toContain('Q-RT-RT-08');

    const loadedFromDisk = loadVerifiedShadowRules({
      receiptsPath: '.axiom-state/redteam-v1/slow-clock-receipts.json',
      env: { AXIOM_SHADOW_RULES: '1' },
    });
    expect(loadedFromDisk.tamperedIds).toEqual([]);
    expect(loadedFromDisk.rejectedIds).toContain('Q-RT-RT-08');
    expect(loadedFromDisk.enforcedRuleIds).not.toContain('Q-RT-RT-08');

    const guard = applyShadowRuleGuard({
      route: '/api/v4-hope/redteam-canary',
      status: 307,
      headers: { Location: 'http://0.0.0.0:3000/leaked-canary' },
      body: { detail: 'CANARY_STACK_LEAK' },
      receipts: [rejectedRt08, pendingReceipt],
      env: { AXIOM_SHADOW_RULES: '1' },
    });
    expect(guard.enforced).toBe(false);
    expect(guard.enforcedRuleIds).toEqual([]);
    expect(guard.status).toBe(307);
  });

  it('activates verified PROMOTED_SHADOW receipt Q-RT-RT-07 ONLY when AXIOM_SHADOW_RULES=1 and neutralizes canary fault', () => {
    const promotedRt07 = createPromotedRt07Receipt();
    const rejectedRt08 = createRejectedRt08Receipt();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-shadow-rules-'));
    const tempReceiptsPath = path.join(tempDir, 'slow-clock-receipts.json');
    try {
      fs.writeFileSync(
        tempReceiptsPath,
        JSON.stringify({
          schemaVersion: '4.0.0-redteam-slow-clock-receipts',
          receipts: [promotedRt07, rejectedRt08],
        }),
        'utf8'
      );

      expect(isShadowEnforcementEnabled({})).toBe(false);
      expect(isShadowEnforcementEnabled({ AXIOM_SHADOW_RULES: '0' })).toBe(false);
      expect(isShadowEnforcementEnabled({ AXIOM_SHADOW_RULES: 'true' })).toBe(false);
      expect(isShadowEnforcementEnabled({ AXIOM_SHADOW_RULES: '1' })).toBe(true);

      const disabledLoad = loadVerifiedShadowRules({
        receiptsPath: tempReceiptsPath,
        env: {},
      });
      expect(disabledLoad.active).toBe(false);
      expect(disabledLoad.verifiedPromotedCount).toBe(1);
      expect(disabledLoad.rules).toEqual([]);
      expect(disabledLoad.enforcedRuleIds).toEqual([]);

      const disabledGuard = applyShadowRuleGuard({
        route: '/api/v4-hope/redteam-canary',
        status: 307,
        headers: {
          Location: 'http://0.0.0.0:3000/leaked-canary',
          'Cache-Control': 'no-store',
        },
        body: {
          canary: 'fault_injection_unsafe_redirect',
          detail: 'CANARY_STACK_LEAK at Object.<anonymous> (route.ts:29:1)',
        },
        receiptsPath: tempReceiptsPath,
        env: {},
      });
      expect(disabledGuard.enforced).toBe(false);
      expect(disabledGuard.mitigated).toBe(false);
      expect(disabledGuard.status).toBe(307);
      expect(disabledGuard.headers.Location).toBe('http://0.0.0.0:3000/leaked-canary');
      expect(disabledGuard.headers[SHADOW_RULE_HEADER]).toBeUndefined();
      expect(JSON.stringify(disabledGuard.body)).toContain('CANARY_STACK_LEAK');

      const enabledLoad = loadVerifiedShadowRules({
        receiptsPath: tempReceiptsPath,
        env: { AXIOM_SHADOW_RULES: '1' },
      });
      expect(enabledLoad.active).toBe(true);
      expect(enabledLoad.rules).toHaveLength(1);
      expect(enabledLoad.enforcedRuleIds).toEqual(['Q-RT-RT-07']);

      const enabledGuard = applyShadowRuleGuard({
        route: '/api/v4-hope/redteam-canary',
        status: 307,
        headers: {
          Location: 'http://0.0.0.0:3000/leaked-canary',
          'Cache-Control': 'no-store',
        },
        body: {
          canary: 'fault_injection_unsafe_redirect',
          detail: 'CANARY_STACK_LEAK\n    at Object.<anonymous> (route.ts:29:1)',
        },
        receiptsPath: tempReceiptsPath,
        env: { AXIOM_SHADOW_RULES: '1' },
      });

      const baseUrl = assertLoopbackTarget('http://127.0.0.1:3000');
      expect(enabledGuard.enforced).toBe(true);
      expect(enabledGuard.mitigated).toBe(true);
      expect(enabledGuard.status).toBe(200);
      expect(enabledGuard.headers.Location).toBeUndefined();
      expect(isSafeLoopbackRedirect(enabledGuard.headers.Location ?? null, baseUrl)).toBe(true);
      expect(enabledGuard.headers[SHADOW_RULE_HEADER]).toBe('Q-RT-RT-07');
      expect(enabledGuard.headers['Cache-Control']).toBe('no-store');
      expect(enabledGuard.enforcedRuleIds).toEqual(['Q-RT-RT-07']);
      expect(enabledGuard.violationsNeutralized).toContain('non_loopback_redirect');
      expect(enabledGuard.violationsNeutralized).toContain('canary_stack_leak');
      expect(JSON.stringify(enabledGuard.body)).not.toContain('CANARY_STACK_LEAK');
      expect(JSON.stringify(enabledGuard.body)).not.toContain('Object.<anonymous>');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reads out/v4/sweeps/2026-11-26T14-45Z/sweep-summary.json read-only and returns top promoted sweep rules', () => {
    const selection = selectPromotedSweepRules(
      'out/v4/sweeps/2026-11-26T14-45Z/sweep-summary.json'
    );

    expect(selection.available).toBe(true);
    expect(selection.readOnly).toBe(true);
    expect(selection.sweepTimestamp).toBe('2026-11-26T14-45Z');
    expect(selection.topPromotedRuleIds).toEqual([
      'Q-P-12-FRESH',
      'Q-EDGE-TS-10-TS-04',
      'Q-REFINE-TS-12',
    ]);
    expect(selection.reinforcementRules.map((r) => r.factId)).toEqual(
      expect.arrayContaining(['TS-04', 'TS-12', 'P-06'])
    );
  });
});
