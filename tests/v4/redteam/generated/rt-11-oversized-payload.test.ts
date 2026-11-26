// Auto-generated defensive security regression probe (RT-11)
// Strictly loopback-locked via safeLoopbackFetch().
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackTarget,
  safeLoopbackFetch,
} from '../../../../src/v4/redteam/loopback-guard.js';

describe('Red-Team v1 Probe RT-11: Oversized 256KB payload rejection', () => {
  const targetUrl = 'http://127.0.0.1:3000/api/v4-hope/redteam';
  const oversizedPayload = JSON.stringify({ pad: 'A'.repeat(256 * 1024) });

  it('validates target is strictly loopback', () => {
    const parsed = assertLoopbackTarget(targetUrl);
    expect(['127.0.0.1', '::1', 'localhost']).toContain(parsed.hostname.replace(/^\[|\]$/g, ''));
  });

  it.skipIf(!process.env.AXIOM_REDTEAM_LIVE)(
    'verifies defensive invariant against local server',
    async () => {
      const res = await safeLoopbackFetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: oversizedPayload,
        timeoutMs: 5000,
      });

      expect([400, 405, 413]).toContain(res.status);
      expect(res.status).toBeLessThan(500);
      expect(res.audit.durationMs).toBeLessThan(5000);
      expect(res.bodyText).not.toMatch(
        /at\s+Object\.<anonymous>|SyntaxError:|GEMINI_API_KEY|GROQ_API_KEY|PRIVATE_KEY/i
      );
    }
  );
});
