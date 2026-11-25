// src/v4/redteam/loopback-guard.ts
// Strict loopback-only guard (127.0.0.1, ::1, localhost) for Axiom Red-Team v1.
// Rejects all external hostnames, public IPs, RFC-1918 LAN ranges, link-local metadata IPs,
// 0.0.0.0, and non-HTTP(S) schemes before any socket is opened.

import crypto from 'node:crypto';

export const ALLOWED_LOOPBACK_HOSTS = new Set<string>(['127.0.0.1', '::1', 'localhost']);
export const ALLOWED_SCHEMES = new Set<string>(['http:', 'https:']);
export const DEFAULT_LOOPBACK_TIMEOUT_MS = 5000;

export class LoopbackGuardError extends Error {
  readonly code:
    | 'INVALID_URL'
    | 'DISALLOWED_SCHEME'
    | 'EMBEDDED_CREDENTIALS'
    | 'NON_LOOPBACK_HOST'
    | 'REDIRECT_BLOCKED';
  readonly rawUrl: string;

  constructor(
    code: LoopbackGuardError['code'],
    rawUrl: string,
    message: string
  ) {
    super(`[LOOPBACK_GUARD:${code}] ${message} (url="${rawUrl}")`);
    this.name = 'LoopbackGuardError';
    this.code = code;
    this.rawUrl = rawUrl;
  }
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.trim().toLowerCase();
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return lower.slice(1, -1);
  }
  return lower;
}

/**
 * Parses and strictly validates that a target URL points ONLY to local loopback
 * (`127.0.0.1`, `::1`, or `localhost`) over `http:` or `https:`.
 */
export function assertLoopbackTarget(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new LoopbackGuardError('INVALID_URL', rawUrl, 'Malformed URL.');
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new LoopbackGuardError(
      'DISALLOWED_SCHEME',
      rawUrl,
      `Scheme "${parsed.protocol}" is forbidden; only http: and https: are allowed.`
    );
  }

  if (parsed.username || parsed.password) {
    throw new LoopbackGuardError(
      'EMBEDDED_CREDENTIALS',
      rawUrl,
      'Embedded URL credentials are forbidden.'
    );
  }

  const host = normalizeHostname(parsed.hostname);
  if (!ALLOWED_LOOPBACK_HOSTS.has(host)) {
    throw new LoopbackGuardError(
      'NON_LOOPBACK_HOST',
      rawUrl,
      `Host "${host}" is not in the strict loopback allowlist (127.0.0.1, ::1, localhost).`
    );
  }

  return parsed;
}

export interface LoopbackAuditEntry {
  readonly timestamp: string;
  readonly method: string;
  readonly url: string;
  readonly status: number | null;
  readonly durationMs: number;
  readonly responseBytes: number;
  readonly responseSha256: string | null;
  readonly error?: string;
}

export interface SafeLoopbackFetchOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly auditLog?: LoopbackAuditEntry[];
  readonly fetchImpl?: typeof fetch;
}

export interface SafeLoopbackFetchResult {
  readonly url: string;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly bodyText: string;
  readonly audit: LoopbackAuditEntry;
}

/**
 * Executes an HTTP request strictly to a validated loopback target with:
 * - Hard pre-socket allowlist enforcement (`assertLoopbackTarget`)
 * - Strict timeout (default 5000ms)
 * - Zero redirects (`redirect: 'error'`) to prevent open-redirect SSRF
 * - Immutable audit logging
 */
export async function safeLoopbackFetch(
  rawUrl: string,
  options: SafeLoopbackFetchOptions = {}
): Promise<SafeLoopbackFetchResult> {
  const validated = assertLoopbackTarget(rawUrl);
  const method = (options.method ?? 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOOPBACK_TIMEOUT_MS;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetchFn(validated.toString(), {
      method,
      headers: options.headers,
      body: options.body,
      redirect: 'error',
      signal: controller.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      throw new LoopbackGuardError(
        'REDIRECT_BLOCKED',
        validated.toString(),
        `HTTP redirect (${res.status}) is forbidden in loopback-locked probes.`
      );
    }

    const bodyText = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const audit: LoopbackAuditEntry = Object.freeze({
      timestamp: new Date().toISOString(),
      method,
      url: validated.toString(),
      status: res.status,
      durationMs: Date.now() - startedAt,
      responseBytes: Buffer.byteLength(bodyText, 'utf8'),
      responseSha256: crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex'),
    });
    options.auditLog?.push(audit);

    return {
      url: validated.toString(),
      status: res.status,
      headers,
      bodyText,
      audit,
    };
  } catch (err) {
    const audit: LoopbackAuditEntry = Object.freeze({
      timestamp: new Date().toISOString(),
      method,
      url: validated.toString(),
      status: null,
      durationMs: Date.now() - startedAt,
      responseBytes: 0,
      responseSha256: null,
      error: err instanceof Error ? err.message : String(err),
    });
    options.auditLog?.push(audit);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
