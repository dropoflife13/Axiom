// tests/v4/redteam/loopback-guard.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertLoopbackTarget,
  LoopbackGuardError,
  safeLoopbackFetch,
  type LoopbackAuditEntry,
} from '../../../src/v4/redteam/loopback-guard.js';
import { runRedTeamV1 } from '../../../src/v4/redteam/orchestrator.js';

describe('Axiom Red-Team v1 — Strict Loopback Guard', () => {
  it('accepts strictly allowed loopback targets', () => {
    expect(assertLoopbackTarget('http://127.0.0.1:3000/api/v4-hope').hostname).toBe('127.0.0.1');
    expect(assertLoopbackTarget('http://localhost:3000/api/v4-hope').hostname).toBe('localhost');
    expect(assertLoopbackTarget('http://[::1]:3000/api/v4-hope').hostname).toBe('[::1]');
  });

  it.each([
    'https://example.com',
    'http://192.168.1.1',
    'http://10.0.0.5:3000',
    'http://172.16.0.10:3000',
    'http://169.254.169.254/latest/meta-data/',
    'http://0.0.0.0:3000',
    'http://127.0.0.1.nip.io',
    'file:///etc/passwd',
    'ftp://localhost/file',
    'http://user:pass@localhost:3000/api',
  ])('rejects disallowed target before opening any socket: %s', (badUrl) => {
    expect(() => assertLoopbackTarget(badUrl)).toThrow(LoopbackGuardError);
  });

  it('safeLoopbackFetch blocks external URLs before calling fetch and logs immutable audits on loopback', async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(
      safeLoopbackFetch('https://example.com/api', { fetchImpl: mockFetch as unknown as typeof fetch })
    ).rejects.toThrow(LoopbackGuardError);
    expect(mockFetch).not.toHaveBeenCalled();

    const auditLog: LoopbackAuditEntry[] = [];
    const res = await safeLoopbackFetch('http://127.0.0.1:3000/api/v4-hope', {
      fetchImpl: mockFetch as unknown as typeof fetch,
      auditLog,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveLength(1);
    expect(Object.isFrozen(auditLog[0])).toBe(true);
    expect(auditLog[0].responseSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('runs full Red-Team v1 pipeline in deterministic --dry-run mode into isolated temp dirs', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-redteam-v1-'));
    try {
      const result = await runRedTeamV1({
        targetBaseUrl: 'http://127.0.0.1:3000',
        dryRun: true,
        rootDir: tmpRoot,
      });
      expect(result.dryRun).toBe(true);
      expect(result.threatMatrix.threats.length).toBeGreaterThanOrEqual(4);
      expect(result.generatedProbes.length).toBe(result.threatMatrix.threats.length);
      expect(result.quarantineCandidates.length).toBe(result.threatMatrix.threats.length);
      expect(fs.existsSync(result.artifacts.threatMatrixPath)).toBe(true);
      expect(fs.existsSync(result.artifacts.quarantinePath)).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
