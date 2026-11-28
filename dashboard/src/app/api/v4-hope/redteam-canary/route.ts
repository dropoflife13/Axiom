import { NextResponse } from 'next/server';
import { applyShadowRuleGuard } from '../../../../../../src/v4/redteam/shadow-enforcer';

export const dynamic = 'force-dynamic';

const CANARY_LEAKED_REDIRECT = 'http://0.0.0.0:3000/leaked-canary';

function isStrictLoopbackCanaryRequest(request: Request): boolean {
  return request.headers.get('host')?.toLowerCase() === '127.0.0.1:3000';
}

/**
 * Dedicated fault-injection surface for loopback-only Red-Team measurement.
 * It is inert unless explicitly enabled on a standalone local server.
 * When AXIOM_SHADOW_RULES=1 and a verified PROMOTED_SHADOW receipt exists for
 * /api/v4-hope/redteam-canary, applyShadowRuleGuard() neutralizes the unsafe
 * redirect and stack marker cleanly and emits X-Axiom-Shadow-Rule.
 */
export async function GET(request: Request) {
  if (
    process.env.AXIOM_REDTEAM_FAULT_INJECT !== '1' ||
    !isStrictLoopbackCanaryRequest(request)
  ) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Intentional test-only violation: RT-07 must reject this non-loopback
  // redirect and stack marker while safeLoopbackFetch() retains redirect: 'manual',
  // unless mitigated by an explicitly enabled PROMOTED_SHADOW rule.
  const guard = applyShadowRuleGuard({
    route: '/api/v4-hope/redteam-canary',
    status: 307,
    headers: {
      Location: CANARY_LEAKED_REDIRECT,
      'Cache-Control': 'no-store',
    },
    body: {
      canary: 'fault_injection_unsafe_redirect',
      detail: 'CANARY_STACK_LEAK',
    },
  });

  const payload = guard.mitigated
    ? {
        ...guard.body,
        shadowMitigated: true,
        enforcedRuleIds: guard.enforcedRuleIds,
        violationsNeutralized: guard.violationsNeutralized,
      }
    : guard.body;

  return NextResponse.json(payload, {
    status: guard.status,
    headers: guard.headers,
  });
}
