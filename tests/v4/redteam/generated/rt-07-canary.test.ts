// Controlled fault-injection probe (RT-07). This target is a dedicated,
// env-gated canary route; no hardened production route is weakened.
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackTarget,
  isSafeLoopbackRedirect,
  safeLoopbackFetch,
} from '../../../../src/v4/redteam/loopback-guard.js';

describe('Red-Team v1 Probe RT-07: Fault-injection canary unsafe redirect containment', () => {
  const targetUrl = 'http://127.0.0.1:3000/api/v4-hope/redteam-canary';

  it('validates target is strictly loopback', () => {
    const parsed = assertLoopbackTarget(targetUrl);
    expect(['127.0.0.1', '::1', 'localhost']).toContain(parsed.hostname.replace(/^\[|\]$/g, ''));
  });

  it.skipIf(
    !process.env.AXIOM_REDTEAM_LIVE || process.env.AXIOM_REDTEAM_FAULT_INJECT !== '1'
  )('verifies defensive invariant against local server', async () => {
    const baseUrl = assertLoopbackTarget('http://127.0.0.1:3000');
    const res = await safeLoopbackFetch(targetUrl, {
      method: 'GET',
      timeoutMs: 5000,
    });

    expect(res.status).toBeLessThan(500);
    expect(isSafeLoopbackRedirect(res.redirectLocation, baseUrl)).toBe(true);
    expect(res.bodyText).not.toContain('CANARY_STACK_LEAK');
  });
});
