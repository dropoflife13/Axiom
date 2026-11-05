import type { CheckResult, L3CheckIssue } from './types.js';

export { CheckResult, L3CheckIssue };

export function checkSec03Secrets(content: string): CheckResult {
  const errors: L3CheckIssue[] = [];

  // 1. Check for NEXT_PUBLIC_* or VITE_* exposing privileged secrets
  const publicSecretRegex =
    /(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]*(?:SERVICE_ROLE|SUPABASE_SERVICE|PRIVATE_KEY|JWT_SECRET)[A-Z0-9_]*\s*=\s*['"]?([^\s'"]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = publicSecretRegex.exec(content)) !== null) {
    errors.push({
      code: 'S3-next-public-leak',
      detail: `Public variable exposes privileged secret token: "${match[0].trim()}"`
    });
  }

  // 2. Check for hardcoded private keys
  const privateKeyRegex = /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g;
  if (privateKeyRegex.test(content)) {
    errors.push({
      code: 'S3-hardcoded-key',
      detail: 'Hardcoded private key block detected (-----BEGIN [RSA] PRIVATE KEY-----).'
    });
  }

  // 3. Check for service_role JWT token (including obfuscated FAKE_DATA test payloads)
  const fakeServiceRoleJwtRegex = /eyJ[a-zA-Z0-9_-]*\.FAKE_DATA_SERVICE_ROLE\.FAKE_DATA/g;
  if (fakeServiceRoleJwtRegex.test(content)) {
    errors.push({
      code: 'S3-service-role-jwt',
      detail: 'Supabase service_role JWT token detected in artifact.'
    });
  }

  // Real JWT tokens: eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+
  const jwtRegex = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
  let jwtMatch: RegExpExecArray | null;
  while ((jwtMatch = jwtRegex.exec(content)) !== null) {
    const token = jwtMatch[0];
    const parts = token.split('.');
    if (parts.length >= 2) {
      try {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        if (/"role"\s*:\s*"service_role"/i.test(decoded)) {
          errors.push({
            code: 'S3-service-role-jwt',
            detail: 'Supabase service_role JWT token detected in artifact.'
          });
          break; // Avoid duplicate reports for same file
        }
      } catch {
        // Not a valid base64 token, continue
      }
    }
  }

  return {
    code: 'SEC-03',
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors
  };
}
