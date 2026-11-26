// Isolated Red-Team fault-injection manifest helpers.
// These entries are telemetry-only and are never promoted to canonical rules.

import crypto from 'node:crypto';

export const REDTEAM_FAULT_INJECT_ENV = 'AXIOM_REDTEAM_FAULT_INJECT';
export const REDTEAM_CANARY_ROUTE = '/api/v4-hope/redteam-canary';

export interface RedTeamFaultInjectionThreat {
  readonly id: 'RT-07' | 'RT-08';
  readonly category: 'error_leakage_stack_trace' | 'input_validation_path_traversal';
  readonly route: string;
  readonly method: 'GET';
  readonly title: string;
  readonly expectedDefense: string;
  readonly severity: 'low' | 'high';
}

export interface RedTeamFaultInjectionCandidate {
  readonly candidateId: string;
  readonly cartridgeId: 'redteam-v1-loopback';
  readonly factId: 'RT-07' | 'RT-08';
  readonly triggerFlag: RedTeamFaultInjectionThreat['category'];
  readonly route: string;
  readonly proposedRuleText: string;
  readonly evidenceHashes: readonly [string];
  readonly status: 'staged';
  readonly stagedAt: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function isRedTeamFaultInjectionEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return environment[REDTEAM_FAULT_INJECT_ENV] === '1';
}

/**
 * Creates only read-only quarantine records. RT-07 is intentionally executed
 * by the fault probe; RT-08 has no test file and therefore remains staged.
 */
export function buildRedTeamFaultInjectionManifest(
  stagedAt = new Date().toISOString()
): {
  readonly threats: readonly RedTeamFaultInjectionThreat[];
  readonly candidates: readonly RedTeamFaultInjectionCandidate[];
} {
  const threats: readonly RedTeamFaultInjectionThreat[] = [
    {
      id: 'RT-07',
      category: 'input_validation_path_traversal',
      route: REDTEAM_CANARY_ROUTE,
      method: 'GET',
      title: 'Fault-injection canary unsafe redirect containment',
      expectedDefense:
        'The probe must reject a redirect whose Location leaves the strict loopback allowlist.',
      severity: 'high',
    },
    {
      id: 'RT-08',
      category: 'error_leakage_stack_trace',
      route: REDTEAM_CANARY_ROUTE,
      method: 'GET',
      title: 'Unexecuted fault-injection quarantine control',
      expectedDefense:
        'Without a complete Vitest JSON result, retain this candidate in staged quarantine.',
      severity: 'low',
    },
  ];

  return {
    threats,
    candidates: threats.map((threat) => ({
      candidateId: `Q-RT-${threat.id}`,
      cartridgeId: 'redteam-v1-loopback',
      factId: threat.id,
      triggerFlag: threat.category,
      route: threat.route,
      proposedRuleText: `On ${threat.method} ${threat.route}: ${threat.expectedDefense}`,
      evidenceHashes: [
        sha256(
          JSON.stringify({
            id: threat.id,
            route: threat.route,
            expectedDefense: threat.expectedDefense,
          })
        ),
      ],
      status: 'staged',
      stagedAt,
    })),
  };
}
