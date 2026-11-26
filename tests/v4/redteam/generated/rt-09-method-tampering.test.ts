// Auto-generated defensive security regression probe (RT-09)
// Strictly loopback-locked via safeLoopbackFetch().
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackTarget,
  isSafeLoopbackRedirect,
  safeLoopbackFetch,
} from '../../../../src/v4/redteam/loopback-guard.js';

describe('Red-Team v1 Probe RT-09: HTTP method tampering on read-only endpoints', () => {
  const baseOrigin = 'http://127.0.0.1:3000';
  const routes = ['/api/v4-hope', '/api/v4-hope/redteam', '/api/runs'] as const;
  const disallowedMethods = ['POST', 'PUT', 'DELETE'] as const;

  it('validates target is strictly loopback', () => {
    for (const route of routes) {
      const parsed = assertLoopbackTarget(`${baseOrigin}${route}`);
      expect(['127.0.0.1', '::1', 'localhost']).toContain(parsed.hostname.replace(/^\[|\]$/g, ''));
    }
  });

  it.skipIf(!process.env.AXIOM_REDTEAM_LIVE)(
    'verifies defensive invariant against local server',
    async () => {
      const baseUrl = assertLoopbackTarget(baseOrigin);

      for (const route of routes) {
        const targetUrl = `${baseOrigin}${route}`;
        for (const method of disallowedMethods) {
          const res = await safeLoopbackFetch(targetUrl, {
            method,
            timeoutMs: 5000,
          });

          expect(res.status).toBe(405);
          expect(res.status).toBeLessThan(500);
          expect(res.redirectLocation ?? '').not.toContain('0.0.0.0');
          expect(isSafeLoopbackRedirect(res.redirectLocation, baseUrl)).toBe(true);
          expect(res.bodyText).not.toMatch(
            /at\s+Object\.<anonymous>|at\s+\w+\s+\(|SyntaxError:|GEMINI_API_KEY|GROQ_API_KEY|PRIVATE_KEY/i
          );
        }
      }
    }
  );
});
