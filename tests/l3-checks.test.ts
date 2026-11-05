import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkDb01AppendOnly } from '../src/checks/l3/db-01-append-only.js';
import { checkSec03Secrets } from '../src/checks/l3/sec-03-secrets.js';
import { verifyL3Check } from '../src/verifier/index.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'l3');

describe('L3 Executable Checks Suite', () => {
  describe('DB-01: Append-Only Entity 3-Layer Defense', () => {
    it('passes compliant fixture with all 3 layers intact (pass.sql)', () => {
      const sql = fs.readFileSync(path.join(FIXTURES_DIR, 'db-01', 'pass.sql'), 'utf-8');
      const result = checkDb01AppendOnly(sql);

      expect(result.code).toBe('DB-01');
      expect(result.verdict).toBe('PASS');
      expect(result.errors).toHaveLength(0);
    });

    it('fails when Layer 1 (REVOKE UPDATE, DELETE, TRUNCATE) is missing (fail-missing-revoke.sql)', () => {
      const sql = fs.readFileSync(
        path.join(FIXTURES_DIR, 'db-01', 'fail-missing-revoke.sql'),
        'utf-8'
      );
      const result = checkDb01AppendOnly(sql);

      expect(result.code).toBe('DB-01');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('D3-layer1');
    });

    it('fails when Layer 2 is violated by an UPDATE policy (fail-has-update-policy.sql)', () => {
      const sql = fs.readFileSync(
        path.join(FIXTURES_DIR, 'db-01', 'fail-has-update-policy.sql'),
        'utf-8'
      );
      const result = checkDb01AppendOnly(sql);

      expect(result.code).toBe('DB-01');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('D3-layer2');
    });

    it('fails when Layer 3 (BEFORE UPDATE/DELETE trigger) is missing (fail-missing-trigger.sql)', () => {
      const sql = fs.readFileSync(
        path.join(FIXTURES_DIR, 'db-01', 'fail-missing-trigger.sql'),
        'utf-8'
      );
      const result = checkDb01AppendOnly(sql);

      expect(result.code).toBe('DB-01');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('D3-layer3');
    });
  });

  describe('SEC-03: Secret Hygiene & Client Bundle Containment', () => {
    it('passes clean public env configuration (pass.env)', () => {
      const env = fs.readFileSync(path.join(FIXTURES_DIR, 'sec-03', 'pass.env'), 'utf-8');
      const result = checkSec03Secrets(env);

      expect(result.code).toBe('SEC-03');
      expect(result.verdict).toBe('PASS');
      expect(result.errors).toHaveLength(0);
    });

    it('detects privileged service_role key leaked in NEXT_PUBLIC_* variable (fail-service-role-in-next-public.env)', () => {
      const env = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sec-03', 'fail-service-role-in-next-public.env'),
        'utf-8'
      );
      const result = checkSec03Secrets(env);

      expect(result.code).toBe('SEC-03');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('S3-next-public-leak');
    });

    it('detects embedded RSA private key in source code (fail-hardcoded-private-key.js)', () => {
      const js = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sec-03', 'fail-hardcoded-private-key.js'),
        'utf-8'
      );
      const result = checkSec03Secrets(js);

      expect(result.code).toBe('SEC-03');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('S3-hardcoded-key');
    });

    it('detects service_role JWT token payload (fail-service-role-jwt.txt)', () => {
      const txt = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sec-03', 'fail-service-role-jwt.txt'),
        'utf-8'
      );
      const result = checkSec03Secrets(txt);

      expect(result.code).toBe('SEC-03');
      expect(result.verdict).toBe('FAIL');
      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('S3-service-role-jwt');
    });
  });

  describe('verifyL3Check Dispatcher Integration', () => {
    it('dispatches DB-01 check through verifier pipeline', () => {
      const sql = fs.readFileSync(path.join(FIXTURES_DIR, 'db-01', 'pass.sql'), 'utf-8');
      const result = verifyL3Check('DB-01', sql);
      expect(result.verdict).toBe('PASS');
    });

    it('dispatches SEC-03 check through verifier pipeline', () => {
      const env = fs.readFileSync(path.join(FIXTURES_DIR, 'sec-03', 'pass.env'), 'utf-8');
      const result = verifyL3Check('SEC-03', env);
      expect(result.verdict).toBe('PASS');
    });
  });
});
