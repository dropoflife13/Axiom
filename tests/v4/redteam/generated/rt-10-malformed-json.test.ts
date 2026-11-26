// Auto-generated defensive security regression probe (RT-10)
// Strictly loopback-locked via safeLoopbackFetch().
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackTarget,
  safeLoopbackFetch,
} from '../../../../src/v4/redteam/loopback-guard.js';

describe('Red-Team v1 Probe RT-10: Malformed JSON, prototype-pollution keys, and mismatched Content-Type handling', () => {
  const baseOrigin = 'http://127.0.0.1:3000';
  const routes = ['/api/v4-hope/redteam', '/api/runs'] as const;
  const payloads = [
    {
      label: 'truncated-json',
      contentType: 'application/json',
      body: '{"bad":',
    },
    {
      label: 'prototype-pollution',
      contentType: 'application/json',
      body: '{"__proto__":{"polluted":true}}',
    },
    {
      label: 'mismatched-content-type',
      contentType: 'text/plain',
      body: '{"plain":true}',
    },
  ] as const;

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
        for (const payload of payloads) {
          const res = await safeLoopbackFetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': payload.contentType,
            },
            body: payload.body,
            timeoutMs: 5000,
          });

          expect(res.status).toBeGreaterThanOrEqual(400);
          expect(res.status).toBeLessThan(500);
          expect(res.bodyText).not.toMatch(
            /SyntaxError|at\s+JSON\.parse|at\s+Object\.<anonymous>|GEMINI_API_KEY|GROQ_API_KEY|PRIVATE_KEY/i
          );
        }
      }
    }
  );
});
