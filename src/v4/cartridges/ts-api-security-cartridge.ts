// src/v4/cartridges/ts-api-security-cartridge.ts
// Deterministic TypeScript API Security Contracts DomainCartridge for Axiom-HOPE (Ablation v4).
// Zero LLM calls: compiles TypeScript with strict syntax checking, runs static AST/token hygiene
// checks, and executes candidate route handlers inside an isolated `node:vm` sandbox against
// bound security test vectors.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { z } from 'zod';
import {
  defaultExtractRequiredTokens,
  type CanonicalRule,
  type CanonicalRuleSet,
  type DomainCartridge,
  type OracleEvaluationResult,
} from '../domain-cartridge.js';
import type { PrerequisiteGraph } from '../prerequisite-retriever.js';

export interface RouteSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
}

export interface AuditEventRecord {
  readonly action?: string;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly tenantId?: string;
  readonly resourceId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MockHandlerRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly requestId: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  json(): Promise<unknown>;
}

export interface MockHandlerContext {
  readonly session: RouteSession | null;
  readonly emitAuditEvent: (event: AuditEventRecord) => void;
}

export interface HandlerResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type TsApiVectorKind =
  | 'valid'
  | 'cross_tenant'
  | 'unauthenticated'
  | 'malformed_payload'
  | 'unauthorized_role'
  | 'missing_idempotency_key'
  | 'out_of_bounds_amount'
  | 'excessive_export_limit'
  | 'cross_user_mutation'
  | 'mass_assignment';

export interface TsApiTestVector {
  readonly id: string;
  readonly factId: string;
  readonly kind: TsApiVectorKind;
  readonly description: string;
  readonly request: {
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly requestId: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly rawBody?: unknown;
    readonly invalidJson?: boolean;
  };
  readonly session: RouteSession | null;
  readonly expectedStatuses: readonly number[];
  readonly expectAuditEvent?: boolean;
}

export interface TsApiSecurityTask {
  readonly id: string;
  readonly cohortId: string;
  readonly domain: 'payouts' | 'admin' | 'profiles';
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly route: string;
  readonly title: string;
  readonly prompt: string;
  readonly allowedRoles: readonly string[];
  readonly boundFacts: readonly string[];
  readonly applicableFacts: readonly string[];
  readonly testVectors: readonly TsApiTestVector[];
}

export interface TsApiSecurityCartridgeOptions {
  /** Workspace root directory (defaults to process.cwd()). */
  readonly rootDir?: string;
  /** Optional override path to ts-api-security-tasks.json. */
  readonly tasksPath?: string;
  /** Optional prerequisite graph override (defaults to DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH). */
  readonly prerequisiteGraph?: PrerequisiteGraph;
  /** Per-vector sandbox execution timeout in milliseconds (default: 500). */
  readonly executionTimeoutMs?: number;
}

interface RawTsApiTasksJson {
  readonly version: string;
  readonly domain: string;
  readonly tasks: TsApiSecurityTask[];
}

// ---------------------------------------------------------------------------
// Canonical Domain Invariants (TS-01 .. TS-12) & Acyclic Prerequisite DAG
// ---------------------------------------------------------------------------

export const TS_API_SECURITY_CANONICAL_RULES: readonly CanonicalRule[] = Object.freeze([
  Object.freeze({
    id: 'TS-01',
    statement:
      "Every authenticated tenant-scoped route must enforce tenant isolation by rejecting requests when session.tenantId !== payload.tenantId with HTTP status '403'.",
    active: true,
    status: 'CONFIRMED',
    check: 'tenant-isolation',
  }),
  Object.freeze({
    id: 'TS-02',
    statement:
      "Every route accepting a JSON request body must validate inputs via safeParse (never using raw unchecked req.json() fields) and reject malformed payloads with HTTP status '400'.",
    active: true,
    status: 'CONFIRMED',
    check: 'safe-parse-validation',
  }),
  Object.freeze({
    id: 'TS-03',
    statement:
      "Every protected route must verify an active session and session.userId, immediately returning HTTP status '401' when unauthenticated.",
    active: true,
    status: 'CONFIRMED',
    check: 'unauthenticated-guard',
  }),
  Object.freeze({
    id: 'TS-04',
    statement:
      "Every '400', '401', and '403' error response must return the standardized JSON error envelope { error: { code, message, requestId } }.",
    active: true,
    status: 'CONFIRMED',
    check: 'error-envelope',
  }),
  Object.freeze({
    id: 'TS-05',
    statement:
      "Privileged routes must enforce an explicit role guard via ALLOWED_ROLES.includes(session.role) and return HTTP status '403' when unauthorized.",
    active: true,
    status: 'CONFIRMED',
    check: 'role-allowlist-guard',
  }),
  Object.freeze({
    id: 'TS-06',
    statement:
      'Route handlers and JSON responses must never expose or include SUPABASE_SERVICE_ROLE_KEY, process.env.PRIVATE_KEY, or passwordHash.',
    active: true,
    status: 'CONFIRMED',
    check: 'zero-secret-leakage',
  }),
  Object.freeze({
    id: 'TS-07',
    statement:
      "Mutating financial and payout routes must enforce a non-empty x-idempotency-key request header and return HTTP status '400' when missing.",
    active: true,
    status: 'CONFIRMED',
    check: 'idempotency-key-header',
  }),
  Object.freeze({
    id: 'TS-08',
    statement:
      'Sensitive endpoints must attach the response header Cache-Control: no-store on both success and error responses.',
    active: true,
    status: 'CONFIRMED',
    check: 'cache-control-no-store',
  }),
  Object.freeze({
    id: 'TS-09',
    statement:
      'State-mutating and sensitive export endpoints must call emitAuditEvent with actorId and requestId before returning a success response.',
    active: true,
    status: 'CONFIRMED',
    check: 'audit-event-emission',
  }),
  Object.freeze({
    id: 'TS-10',
    statement:
      "Financial payout routes must enforce integer amountCents bounds (amountCents > 0 and amountCents <= 10000000) and reject out-of-range payouts with HTTP status '400'.",
    active: true,
    status: 'CONFIRMED',
    check: 'payout-amount-bounds',
  }),
  Object.freeze({
    id: 'TS-11',
    statement:
      "Multi-tenant admin export endpoints must project non-sensitive exportFields and cap limit <= 500, rejecting unbounded exports with HTTP status '400'.",
    active: true,
    status: 'CONFIRMED',
    check: 'admin-export-field-projection',
  }),
  Object.freeze({
    id: 'TS-12',
    statement:
      "User profile mutation routes must enforce ownership (session.userId === payload.targetUserId) unless session.role === 'tenant_admin' and forbid mass-assignment of 'role' or 'tenantId'.",
    active: true,
    status: 'CONFIRMED',
    check: 'profile-self-or-admin-mutation',
  }),
]);

/**
 * Default strictly acyclic prerequisite dependency DAG linking specialized API security
 * contracts to universal foundational guards (tenant isolation `TS-01`, `safeParse` `TS-02`,
 * session auth `TS-03`, error envelope `TS-04`, role guard `TS-05`, zero secret leak `TS-06`,
 * idempotency `TS-07`, and `Cache-Control: no-store` `TS-08`).
 */
export const DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH: PrerequisiteGraph = Object.freeze({
  'TS-05': Object.freeze(['TS-03', 'TS-04']),
  'TS-07': Object.freeze(['TS-02', 'TS-04']),
  'TS-09': Object.freeze(['TS-03']),
  'TS-10': Object.freeze(['TS-01', 'TS-02', 'TS-07']),
  'TS-11': Object.freeze(['TS-01', 'TS-05', 'TS-08']),
  'TS-12': Object.freeze(['TS-01', 'TS-02', 'TS-06']),
});

// ---------------------------------------------------------------------------
// Deterministic TypeScript Compiler Verification & Comment-Aware AST Analyzer
// ---------------------------------------------------------------------------

export type CompileTypeScriptResult =
  | { readonly ok: true; readonly jsCode: string; readonly script: vm.Script }
  | { readonly ok: false; readonly error: string };

/**
 * Compiles TypeScript route handler source deterministically via esbuild's strict TS parser
 * and verifies that the emitted CommonJS script compiles under V8 `vm.Script`.
 */
export function compileTypeScriptHandler(tsSource: string): CompileTypeScriptResult {
  if (!tsSource || tsSource.trim().length === 0) {
    return {
      ok: false,
      error: 'TypeScriptCompileError: Handler source is empty.',
    };
  }

  try {
    const transformed = transformSync(tsSource, {
      loader: 'ts',
      format: 'cjs',
      target: 'es2022',
      sourcefile: 'route-handler.ts',
    });

    const script = new vm.Script(transformed.code, {
      filename: 'route-handler.js',
    });

    return {
      ok: true,
      jsCode: transformed.code,
      script,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `TypeScriptCompileError: ${message}`,
    };
  }
}

/**
 * Deterministically strips `//` and `/* ... *\/` comments while preserving string literals
 * (`'...'`, `"..."`, and template literals `` `...` ``) and line numbers so static checks
 * never false-positive or false-negative on commented-out code.
 */
export function stripTypeScriptComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : '';

    // Single-line comment
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n) {
        if (source[i] === '*' && i + 1 < n && source[i + 1] === '/') {
          i += 2;
          break;
        }
        if (source[i] === '\n') out += '\n';
        i++;
      }
      continue;
    }

    // String literals ('...', "...", `...`)
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        const c = source[i];
        out += c;
        i++;
        if (c === '\\' && i < n) {
          out += source[i];
          i++;
          continue;
        }
        if (c === quote) {
          break;
        }
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

const FORBIDDEN_SECRET_PATTERNS: readonly { readonly token: string; readonly regex: RegExp }[] = [
  { token: 'SUPABASE_SERVICE_ROLE_KEY', regex: /\bSUPABASE_SERVICE_ROLE_KEY\b/ },
  { token: 'process.env.PRIVATE_KEY', regex: /\bprocess\s*\.\s*env\s*\.\s*PRIVATE_KEY\b/ },
  { token: 'PRIVATE_KEY', regex: /\bPRIVATE_KEY\b/ },
  { token: 'passwordHash', regex: /\bpasswordHash\b/ },
];

export interface StaticHandlerAnalysis {
  readonly hasSafeParse: boolean;
  readonly hasTenantCheck: boolean;
  readonly hasRoleAllowlistGuard: boolean;
  readonly hasErrorEnvelope: boolean;
  readonly hasIdempotencyKey: boolean;
  readonly hasNoStoreHeader: boolean;
  readonly hasEmitAuditEvent: boolean;
  readonly leakedSecretTokens: readonly string[];
}

export function analyzeTypeScriptHandlerStatic(tsSource: string): StaticHandlerAnalysis {
  const code = stripTypeScriptComments(tsSource);

  const hasSafeParse = /\.\s*safeParse\s*\(/.test(code);

  const hasTenantCheck =
    /\bsession\s*\??\.\s*tenantId\s*(?:!==|===|!=|==)\s*[a-zA-Z_$][a-zA-Z0-9_$.?]*tenantId\b/.test(
      code
    ) ||
    /\b[a-zA-Z_$][a-zA-Z0-9_$.?]*tenantId\s*(?:!==|===|!=|==)\s*session\s*\??\.\s*tenantId\b/.test(
      code
    );

  const hasRoleAllowlistGuard =
    /\bALLOWED_ROLES\b/.test(code) &&
    /\bALLOWED_ROLES\s*\.\s*(?:includes|has)\s*\(\s*session\s*\??\.\s*role(?:\s+as\b[^)]*)?\s*\)/.test(
      code
    );

  const hasErrorEnvelope =
    /\berror\s*:\s*\{[\s\S]{0,240}\}/.test(code) &&
    /\bcode\b/.test(code) &&
    /\bmessage\b/.test(code) &&
    /\brequestId\b/.test(code);

  const hasIdempotencyKey = /['"`]x-idempotency-key['"`]/i.test(code);

  const hasNoStoreHeader =
    /['"`]cache-control['"`]/i.test(code) && /['"`][^'"`]*\bno-store\b[^'"`]*['"`]/i.test(code);

  const hasEmitAuditEvent = /\bemitAuditEvent\s*\(/.test(code);

  const leakedSecretTokens: string[] = [];
  for (const { token, regex } of FORBIDDEN_SECRET_PATTERNS) {
    if (regex.test(code) && !leakedSecretTokens.includes(token)) {
      leakedSecretTokens.push(token);
    }
  }

  return Object.freeze({
    hasSafeParse,
    hasTenantCheck,
    hasRoleAllowlistGuard,
    hasErrorEnvelope,
    hasIdempotencyKey,
    hasNoStoreHeader,
    hasEmitAuditEvent,
    leakedSecretTokens: Object.freeze(leakedSecretTokens),
  });
}

// ---------------------------------------------------------------------------
// Isolated `node:vm` Execution Sandbox
// ---------------------------------------------------------------------------

type ExportedHandlerFn = (
  req: MockHandlerRequest,
  ctx: MockHandlerContext
) => Promise<HandlerResponse> | HandlerResponse;

interface VectorExecutionOutcome {
  readonly vector: TsApiTestVector;
  readonly ok: boolean;
  readonly status: number | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly auditEvents: readonly AuditEventRecord[];
  readonly runtimeError?: string;
}

function loadExportedHandler(
  script: vm.Script,
  preferredMethod: string,
  timeoutMs: number
): { ok: true; handler: ExportedHandlerFn } | { ok: false; error: string } {
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };

  const safeRequire = (specifier: string): unknown => {
    if (specifier === 'zod') {
      return { z, default: z, ...z };
    }
    throw new Error(
      `SecuritySandboxError: Disallowed module import "${specifier}". Only "zod" is permitted in API contract sandbox.`
    );
  };

  const silentConsole = Object.freeze({
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  });

  const sandboxGlobals = {
    exports: moduleObj.exports,
    module: moduleObj,
    require: safeRequire,
    console: silentConsole,
    process: Object.freeze({
      env: Object.freeze({}),
    }),
    Promise,
    JSON,
    Map,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    URL,
    URLSearchParams,
  };

  try {
    const context = vm.createContext(sandboxGlobals);
    script.runInContext(context, { timeout: timeoutMs });

    const exp = moduleObj.exports;
    if (typeof exp === 'function') {
      return { ok: true, handler: exp as unknown as ExportedHandlerFn };
    }

    const candidateNames = [
      'handle',
      'handler',
      preferredMethod.toUpperCase(),
      'POST',
      'PATCH',
      'PUT',
      'GET',
      'DELETE',
      'default',
    ];
    for (const name of candidateNames) {
      const fn = exp?.[name];
      if (typeof fn === 'function') {
        return { ok: true, handler: fn as ExportedHandlerFn };
      }
    }

    return {
      ok: false,
      error:
        'HandlerExportError: Module must export a route handler function (e.g., `export async function handle(req, ctx)` or `POST`/`PATCH`).',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `SandboxLoadError: ${message}`,
    };
  }
}

function normalizeHeaders(
  rawHeaders: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!rawHeaders || typeof rawHeaders !== 'object') return Object.freeze(out);
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof v === 'string') {
      out[k.toLowerCase()] = v;
    }
  }
  return Object.freeze(out);
}

async function runSingleVector(
  handler: ExportedHandlerFn,
  vector: TsApiTestVector,
  timeoutMs: number
): Promise<VectorExecutionOutcome> {
  const auditEvents: AuditEventRecord[] = [];

  // Normalize incoming request headers with case-insensitive fallback proxy so both
  // `req.headers['x-idempotency-key']` and `req.headers['X-Idempotency-Key']` work cleanly.
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(vector.request.headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }
  const headerProxy = new Proxy(lowerHeaders, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return target[prop.toLowerCase()];
      }
      return undefined;
    },
  });

  const clonedBody =
    vector.request.rawBody !== undefined
      ? JSON.parse(JSON.stringify(vector.request.rawBody))
      : undefined;

  const mockReq: MockHandlerRequest = Object.freeze({
    method: vector.request.method,
    requestId: vector.request.requestId,
    headers: headerProxy,
    async json(): Promise<unknown> {
      if (vector.request.invalidJson) {
        throw new SyntaxError('Unexpected token in JSON payload');
      }
      return clonedBody;
    },
  });

  const mockCtx: MockHandlerContext = Object.freeze({
    session: vector.session ? Object.freeze({ ...vector.session }) : null,
    emitAuditEvent: (event: AuditEventRecord) => {
      if (event && typeof event === 'object') {
        auditEvents.push(Object.freeze({ ...event }));
      }
    },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race<HandlerResponse>([
      Promise.resolve(handler(mockReq, mockCtx)),
      new Promise<HandlerResponse>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`HandlerTimeoutError: exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);

    if (!result || typeof result !== 'object' || typeof result.status !== 'number') {
      return {
        vector,
        ok: false,
        status: null,
        headers: Object.freeze({}),
        body: null,
        auditEvents: Object.freeze(auditEvents),
        runtimeError: `InvalidResponseError: Handler did not return { status, headers?, body } for ${vector.id}.`,
      };
    }

    return {
      vector,
      ok: true,
      status: result.status,
      headers: normalizeHeaders(result.headers),
      body: result.body,
      auditEvents: Object.freeze(auditEvents),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      vector,
      ok: false,
      status: null,
      headers: Object.freeze({}),
      body: null,
      auditEvents: Object.freeze(auditEvents),
      runtimeError: `HandlerRuntimeError (${vector.id}): ${message}`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasValidErrorEnvelope(body: unknown, expectedRequestId: string): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const errObj = (body as Record<string, unknown>).error;
  if (!errObj || typeof errObj !== 'object' || Array.isArray(errObj)) return false;
  const rec = errObj as Record<string, unknown>;
  return (
    typeof rec.code === 'string' &&
    rec.code.trim().length > 0 &&
    typeof rec.message === 'string' &&
    rec.message.trim().length > 0 &&
    rec.requestId === expectedRequestId
  );
}

function findLeakedSecretInPayload(value: unknown): string | null {
  if (typeof value === 'string') {
    for (const { token, regex } of FORBIDDEN_SECRET_PATTERNS) {
      if (regex.test(value)) return token;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findLeakedSecretInPayload(item);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    for (const { token, regex } of FORBIDDEN_SECRET_PATTERNS) {
      if (regex.test(k)) return token;
    }
    const hit = findLeakedSecretInPayload(v);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// TypeScript API Security DomainCartridge Implementation
// ---------------------------------------------------------------------------

export class TsApiSecurityCartridge implements DomainCartridge<TsApiSecurityTask, string> {
  readonly id = 'ts-api-security-v4';
  readonly name = 'TypeScript API Security Contracts (v4)';
  readonly version = '4.0.0-ts-api-security';

  private readonly tasksPath: string;
  private readonly prerequisiteGraph: PrerequisiteGraph;
  private readonly executionTimeoutMs: number;
  private cachedTasks: TsApiSecurityTask[] | null = null;

  constructor(options: TsApiSecurityCartridgeOptions = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    this.tasksPath =
      options.tasksPath ??
      path.resolve(rootDir, 'fixtures', 'v4', 'ts-api-security-tasks.json');
    this.prerequisiteGraph =
      options.prerequisiteGraph ?? DEFAULT_TS_API_SECURITY_PREREQUISITE_GRAPH;
    this.executionTimeoutMs = options.executionTimeoutMs ?? 500;
  }

  loadTasks(): TsApiSecurityTask[] {
    if (this.cachedTasks) {
      return [...this.cachedTasks];
    }
    const raw = JSON.parse(fs.readFileSync(this.tasksPath, 'utf-8')) as RawTsApiTasksJson;
    this.cachedTasks = raw.tasks;
    return [...this.cachedTasks];
  }

  loadCanonicalRules(): CanonicalRuleSet {
    return {
      version: this.version,
      rules: TS_API_SECURITY_CANONICAL_RULES,
      prerequisiteGraph: this.prerequisiteGraph,
    };
  }

  extractRequiredTokens(rule: CanonicalRule, stderrHint?: string): string[] {
    return defaultExtractRequiredTokens(rule, stderrHint);
  }

  /**
   * Deterministic execution oracle:
   * 1. Strictly compiles TypeScript source (syntax errors -> `committed: false`).
   * 2. Loads exported route handler inside an isolated `node:vm` sandbox.
   * 3. Executes all bound security test vectors + static AST checks per bound fact.
   */
  async evaluate(
    task: TsApiSecurityTask,
    tsSource: string
  ): Promise<OracleEvaluationResult> {
    const boundFacts = [...task.boundFacts];

    // Step 1: Strict TypeScript compile & syntax verification
    const compiled = compileTypeScriptHandler(tsSource);
    if (!compiled.ok) {
      return {
        committed: false,
        boundFacts,
        passedFacts: [],
        failedFacts: boundFacts,
        stderr: compiled.error,
      };
    }

    // Step 2: Load handler inside isolated vm sandbox
    const loaded = loadExportedHandler(compiled.script, task.method, this.executionTimeoutMs);
    if (!loaded.ok) {
      return {
        committed: false,
        boundFacts,
        passedFacts: [],
        failedFacts: boundFacts,
        stderr: loaded.error,
      };
    }

    // Step 3: Static AST hygiene analysis (comment-stripped)
    const ast = analyzeTypeScriptHandlerStatic(tsSource);

    // Step 4: Execute all deterministic security test vectors
    const outcomes: VectorExecutionOutcome[] = [];
    for (const vec of task.testVectors) {
      outcomes.push(await runSingleVector(loaded.handler, vec, this.executionTimeoutMs));
    }

    const byKind = new Map<TsApiVectorKind, VectorExecutionOutcome[]>();
    for (const outcome of outcomes) {
      const list = byKind.get(outcome.vector.kind) ?? [];
      list.push(outcome);
      byKind.set(outcome.vector.kind, list);
    }

    const validOutcomes = byKind.get('valid') ?? [];
    const validPassed =
      validOutcomes.length > 0 &&
      validOutcomes.every(
        (o) =>
          o.ok &&
          o.status !== null &&
          o.vector.expectedStatuses.includes(o.status)
      );

    const failureNotes = new Map<string, string[]>();
    const markFailure = (factId: string, reason: string) => {
      const list = failureNotes.get(factId) ?? [];
      list.push(reason);
      failureNotes.set(factId, list);
    };

    // Grade every bound fact deterministically
    for (const factId of boundFacts) {
      switch (factId) {
        case 'TS-01': {
          if (!ast.hasTenantCheck) {
            markFailure(
              'TS-01',
              'Missing explicit tenant isolation comparison (session.tenantId !== payload.tenantId).'
            );
          }
          const xTenant = byKind.get('cross_tenant') ?? [];
          if (xTenant.length === 0) {
            markFailure('TS-01', 'Task has no cross_tenant test vector.');
          }
          for (const o of xTenant) {
            if (!o.ok || o.status !== 403) {
              markFailure(
                'TS-01',
                `${o.vector.id}: expected 403 on cross-tenant probe, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          if (!validPassed) {
            markFailure('TS-01', 'Valid same-tenant request failed to return 200/201.');
          }
          break;
        }

        case 'TS-02': {
          if (!ast.hasSafeParse) {
            markFailure(
              'TS-02',
              'Handler does not validate JSON input via safeParse (raw unchecked req.json() forbidden).'
            );
          }
          const malformed = byKind.get('malformed_payload') ?? [];
          for (const o of malformed) {
            if (!o.ok || o.status !== 400) {
              markFailure(
                'TS-02',
                `${o.vector.id}: expected 400 on malformed payload, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          break;
        }

        case 'TS-03': {
          const unauth = byKind.get('unauthenticated') ?? [];
          for (const o of unauth) {
            if (!o.ok || o.status !== 401) {
              markFailure(
                'TS-03',
                `${o.vector.id}: expected 401 on unauthenticated request, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          break;
        }

        case 'TS-04': {
          if (!ast.hasErrorEnvelope) {
            markFailure(
              'TS-04',
              'Missing standardized { error: { code, message, requestId } } error envelope structure.'
            );
          }
          const returnedErrorOutcomes = outcomes.filter(
            (o) => o.ok && o.status !== null && o.status >= 400
          );
          if (returnedErrorOutcomes.length === 0) {
            markFailure(
              'TS-04',
              'Handler produced no 4xx error responses to validate error envelope conformance.'
            );
          }
          for (const o of returnedErrorOutcomes) {
            if (!hasValidErrorEnvelope(o.body, o.vector.request.requestId)) {
              markFailure(
                'TS-04',
                `${o.vector.id}: response body violates { error: { code, message, requestId: "${o.vector.request.requestId}" } }.`
              );
            }
          }
          break;
        }

        case 'TS-05': {
          if (!ast.hasRoleAllowlistGuard) {
            markFailure(
              'TS-05',
              'Missing explicit ALLOWED_ROLES.includes(session.role) role guard.'
            );
          }
          const badRole = byKind.get('unauthorized_role') ?? [];
          for (const o of badRole) {
            if (!o.ok || o.status !== 403) {
              markFailure(
                'TS-05',
                `${o.vector.id}: expected 403 for unauthorized role, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          break;
        }

        case 'TS-06': {
          if (ast.leakedSecretTokens.length > 0) {
            markFailure(
              'TS-06',
              `Forbidden secret identifier(s) referenced in handler source: [${ast.leakedSecretTokens.join(', ')}].`
            );
          }
          for (const o of outcomes) {
            const leaked = findLeakedSecretInPayload(o.body);
            if (leaked) {
              markFailure(
                'TS-06',
                `${o.vector.id}: leaked forbidden secret token "${leaked}" in response payload.`
              );
            }
          }
          break;
        }

        case 'TS-07': {
          if (!ast.hasIdempotencyKey) {
            markFailure('TS-07', 'Handler does not inspect required x-idempotency-key header.');
          }
          const noIdem = byKind.get('missing_idempotency_key') ?? [];
          for (const o of noIdem) {
            if (!o.ok || o.status !== 400) {
              markFailure(
                'TS-07',
                `${o.vector.id}: expected 400 when x-idempotency-key is missing/blank, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          break;
        }

        case 'TS-08': {
          if (!ast.hasNoStoreHeader) {
            markFailure('TS-08', 'Handler source lacks Cache-Control: no-store header.');
          }
          for (const o of outcomes) {
            if (!o.ok) {
              markFailure('TS-08', `${o.vector.id}: handler failed (${o.runtimeError}).`);
              continue;
            }
            const cc = o.headers['cache-control'] ?? '';
            if (!/\bno-store\b/i.test(cc)) {
              markFailure(
                'TS-08',
                `${o.vector.id}: response missing "Cache-Control: no-store" header (got "${cc || '<missing>'}").`
              );
            }
          }
          break;
        }

        case 'TS-09': {
          if (!ast.hasEmitAuditEvent) {
            markFailure('TS-09', 'Handler never invokes emitAuditEvent.');
          }
          for (const o of validOutcomes) {
            if (!o.ok || !o.vector.session) {
              markFailure('TS-09', `${o.vector.id}: valid vector did not complete.`);
              continue;
            }
            const matching = o.auditEvents.some(
              (ev) =>
                ev.actorId === o.vector.session!.userId &&
                ev.requestId === o.vector.request.requestId
            );
            if (!matching) {
              markFailure(
                'TS-09',
                `${o.vector.id}: expected emitAuditEvent with actorId="${o.vector.session.userId}" and requestId="${o.vector.request.requestId}".`
              );
            }
          }
          // Rejected 4xx/5xx responses must NOT emit success mutation audit events
          for (const o of outcomes) {
            if (
              o.ok &&
              o.status !== null &&
              o.status >= 400 &&
              o.vector.expectAuditEvent === false &&
              o.auditEvents.length > 0
            ) {
              markFailure(
                'TS-09',
                `${o.vector.id}: rejected ${o.status} response emitted unexpected audit event(s).`
              );
            }
          }
          break;
        }

        case 'TS-10': {
          const oob = byKind.get('out_of_bounds_amount') ?? [];
          for (const o of oob) {
            if (!o.ok || o.status !== 400) {
              markFailure(
                'TS-10',
                `${o.vector.id}: expected 400 for out-of-range amountCents, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          if (!validPassed) {
            markFailure('TS-10', 'Valid bounded payout request failed.');
          }
          break;
        }

        case 'TS-11': {
          const overLimit = byKind.get('excessive_export_limit') ?? [];
          for (const o of overLimit) {
            if (!o.ok || o.status !== 400) {
              markFailure(
                'TS-11',
                `${o.vector.id}: expected 400 for export limit > 500, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          if (!validPassed) {
            markFailure('TS-11', 'Valid bounded export request failed.');
          }
          break;
        }

        case 'TS-12': {
          const crossUser = byKind.get('cross_user_mutation') ?? [];
          for (const o of crossUser) {
            if (!o.ok || o.status !== 403) {
              markFailure(
                'TS-12',
                `${o.vector.id}: expected 403 for non-admin cross-user profile mutation, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          const massAssign = byKind.get('mass_assignment') ?? [];
          for (const o of massAssign) {
            if (!o.ok || o.status === null || !o.vector.expectedStatuses.includes(o.status)) {
              markFailure(
                'TS-12',
                `${o.vector.id}: expected 400/403 rejecting mass-assignment of role/tenantId, got ${o.status ?? o.runtimeError}`
              );
            }
          }
          if (!validPassed) {
            markFailure('TS-12', 'Valid profile mutation failed.');
          }
          break;
        }

        default: {
          if (!validPassed) {
            markFailure(factId, `Valid vector failed for ${factId}.`);
          }
        }
      }
    }

    const failedFacts = boundFacts.filter((f) => failureNotes.has(f));
    const passedFacts = boundFacts.filter((f) => !failureNotes.has(f));

    const stderrLines: string[] = [];
    for (const factId of failedFacts) {
      for (const note of failureNotes.get(factId) ?? []) {
        stderrLines.push(`[${factId}] ${note}`);
      }
    }

    return {
      committed: true,
      boundFacts,
      passedFacts,
      failedFacts,
      ...(stderrLines.length > 0 ? { stderr: stderrLines.join('\n') } : {}),
    };
  }

  /**
   * Deterministic static forensic failure-mode classifier for TypeScript API handlers.
   */
  classifyForensics(
    task: TsApiSecurityTask,
    tsSource: string
  ): Record<string, boolean> {
    const compiled = compileTypeScriptHandler(tsSource);
    const syntaxError = !compiled.ok;
    const ast = analyzeTypeScriptHandlerStatic(tsSource);
    const bound = new Set(task.boundFacts);

    return {
      syntaxError,
      missingSafeParse: bound.has('TS-02') && !ast.hasSafeParse,
      missingTenantCheck: bound.has('TS-01') && !ast.hasTenantCheck,
      leakedSecretIdentifier: ast.leakedSecretTokens.length > 0,
      missingErrorEnvelope: bound.has('TS-04') && !ast.hasErrorEnvelope,
      missingIdempotencyKey: bound.has('TS-07') && !ast.hasIdempotencyKey,
      missingNoStoreHeader: bound.has('TS-08') && !ast.hasNoStoreHeader,
    };
  }
}
