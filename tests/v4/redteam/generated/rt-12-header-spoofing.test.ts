// Auto-generated defensive security regression probe (RT-12)
// Strictly loopback-locked via safeLoopbackFetch().
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackTarget,
  safeLoopbackFetch,
} from '../../../../src/v4/redteam/loopback-guard.js';

describe('Red-Team v1 Probe RT-12: Spoofed forwarded host, origin, and proto header non-reflection', () => {
  const baseOrigin = 'http://127.0.0.1:3000';
  const routes = ['/api/ablation-results', '/api/portfolio', '/api/v4-hope/redteam'] as const;
  const methods = ['GET', 'POST'] as const;
  const spoofedHeaders = {
    'X-Forwarded-Host': 'evil.example',
    Origin: 'https://evil.example',
    'X-Forwarded-Proto': 'http',
  };

  it('validates target is strictly loopback', () => {
    for (const route of routes) {
      const parsed = assertLoopbackTarget(`${baseOrigin}${route}`);
      expect(['127.0.0.1', '::1', 'localhost']).toContain(parsed.hostname.replace(/^\[|\]$/g, ''));
    }
  });

  it.skipIf(!process.env.AXIOM_REDTEAM_LIVE)(
    'verifies defensive invariant against local server',
    async () => {
      for (const route of routes) {
        const targetUrl = `${baseOrigin}${route}`;
        for (const method of methods) {
          const res = await safeLoopbackFetch(targetUrl, {
            method,
            headers: spoofedHeaders,
            timeoutMs: 5000,
          });

          expect(res.status).toBeLessThan(500);
          expect(res.redirectLocation ?? '').not.toContain('evil.example');
          expect(res.headers['location'] ?? '').not.toContain('evil.example');
          expect(res.headers['access-control-allow-origin'] ?? '').not.toContain('evil.example');
          expect(res.bodyText).not.toContain('evil.example');
        }
      }
    }
  );
});
