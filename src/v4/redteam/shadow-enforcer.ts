// src/v4/redteam/shadow-enforcer.ts
// Deterministic Shadow Rule Enforcer for Axiom Red-Team v1 & HOPE v4.
// Verifies canonical SHA-256 Slow Clock receipts, enforces an explicit opt-in
// gate (AXIOM_SHADOW_RULES === '1'), neutralizes verified PROMOTED_SHADOW faults
// at runtime without mutating canonical rule vaults, and surfaces read-only
// sweep prompt-patch selections.

import fs from 'node:fs';
import path from 'node:path';
import { computeCanonicalJsonSha256 } from '../hope/fast-clock.js';
import { assertLoopbackTarget, isSafeLoopbackRedirect } from './loopback-guard.js';
import type {
  GateCheckVerdict,
  RedTeamSlowClockReceipt,
} from './slow-cook-gate.js';

export const AXIOM_SHADOW_RULES_ENV = 'AXIOM_SHADOW_RULES' as const;
export const SHADOW_RULE_HEADER = 'X-Axiom-Shadow-Rule' as const;
export const DEFAULT_SLOW_CLOCK_RECEIPTS_REL_PATH =
  '.axiom-state/redteam-v1/slow-clock-receipts.json' as const;
export const DEFAULT_SWEEP_SUMMARY_REL_PATH =
  'out/v4/sweeps/2026-11-26T14-45Z/sweep-summary.json' as const;
export const DEFAULT_LOOPBACK_BASE_URL = 'http://127.0.0.1:3000' as const;
export const TARGET_REINFORCEMENT_FACTS = ['TS-04', 'TS-12', 'P-06'] as const;

export interface VerifiedShadowRule {
  readonly candidateId: string;
  readonly probeId: string;
  readonly route: string;
  readonly triggerFlag: string;
  readonly decision: 'PROMOTED_SHADOW';
  readonly gates: {
    readonly g1: GateCheckVerdict;
    readonly g2: GateCheckVerdict;
    readonly g3: GateCheckVerdict;
  };
  readonly evidenceHash: string;
  readonly receiptHash: string;
}

export interface ReceiptVerificationResult {
  readonly valid: boolean;
  readonly promoted: boolean;
  readonly reason: string;
  readonly candidateId: string | null;
  readonly receipt: VerifiedShadowRule | null;
}

export interface LoadVerifiedShadowRulesOptions {
  readonly receiptsPath?: string;
  readonly receipts?: readonly unknown[];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface VerifiedShadowRulesResult {
  readonly active: boolean;
  readonly rules: readonly VerifiedShadowRule[];
  readonly enforcedRuleIds: readonly string[];
  readonly verifiedPromotedCount: number;
  readonly rejectedIds: readonly string[];
  readonly tamperedIds: readonly string[];
  readonly receiptsPath: string | null;
}

export interface ShadowRuleGuardInput {
  readonly route: string;
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly candidateId?: string;
  readonly baseUrl?: string;
  readonly receiptsPath?: string;
  readonly receipts?: readonly unknown[];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface ShadowRuleGuardResult<TBody = unknown> {
  readonly enforced: boolean;
  readonly mitigated: boolean;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: TBody;
  readonly enforcedRuleIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
  readonly violationsNeutralized: readonly string[];
}

export interface PromotedSweepRuleSummary {
  readonly candidateId: string;
  readonly cartridgeId: string;
  readonly factId: string;
  readonly triggerFlag: string;
  readonly approvedModels: readonly string[];
  readonly rejectedCount: number;
  readonly failedOccurrences: number;
  readonly reinforcementTarget: boolean;
}

export interface PromotedSweepRulesResult {
  readonly available: boolean;
  readonly readOnly: true;
  readonly sweepSummaryPath: string | null;
  readonly sweepTimestamp: string | null;
  readonly topPromotedRuleIds: readonly string[];
  readonly topPromotedRules: readonly PromotedSweepRuleSummary[];
  readonly reinforcementRules: readonly PromotedSweepRuleSummary[];
  readonly allPromotedRules: readonly PromotedSweepRuleSummary[];
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const STACK_LEAK_MARKER_RE = /CANARY_STACK_LEAK/g;
const NODE_STACK_FRAME_RE = /\n?\s*at\s+(?:[^\n(]+\s+\([^)]+\)|[^\s\n]+:\d+:\d+)/g;
const SENSITIVE_ENV_LEAK_RE = /\b(?:GEMINI_API_KEY|GROQ_API_KEY|PRIVATE_KEY)\s*[:=]\s*\S+/gi;

function resolveRepoFile(targetPath: string): string | null {
  const candidates = path.isAbsolute(targetPath)
    ? [targetPath]
    : [
        path.resolve(process.cwd(), targetPath),
        path.resolve(process.cwd(), '..', targetPath),
        path.resolve(process.cwd(), '..', '..', targetPath),
        path.resolve(process.cwd(), '..', '..', '..', targetPath),
      ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // continue searching
    }
  }
  return null;
}

function readJsonSafe<T>(filePath: string | null): T | null {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isGateCheckVerdict(value: unknown): value is GateCheckVerdict {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.pass === 'boolean' && typeof record.reason === 'string';
}

function isSafeRouteValue(route: string): boolean {
  const trimmed = route.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    assertLoopbackTarget(trimmed);
    return true;
  } catch {
    return false;
  }
}

function normalizeRoutePath(route: string): string {
  const trimmed = route.trim();
  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      pathname = trimmed;
    }
  } else {
    const queryIdx = trimmed.indexOf('?');
    if (queryIdx >= 0) {
      pathname = trimmed.slice(0, queryIdx);
    }
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * Explicit opt-in gate: shadow enforcement activates ONLY when AXIOM_SHADOW_RULES === '1'.
 */
export function isShadowEnforcementEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env[AXIOM_SHADOW_RULES_ENV] === '1';
}

/**
 * Recomputes the canonical SHA-256 receiptHash matching src/v4/redteam/slow-cook-gate.ts
 * byte-for-byte over { candidateId, probeId, route, triggerFlag, decision, gates, evidenceHash }.
 */
export function computeShadowReceiptHash(
  receipt: Omit<RedTeamSlowClockReceipt, 'receiptHash'>
): string {
  const receiptBody = {
    candidateId: receipt.candidateId,
    probeId: receipt.probeId,
    route: receipt.route,
    triggerFlag: receipt.triggerFlag,
    decision: receipt.decision,
    gates: {
      g1: { pass: receipt.gates.g1.pass, reason: receipt.gates.g1.reason },
      g2: { pass: receipt.gates.g2.pass, reason: receipt.gates.g2.reason },
      g3: { pass: receipt.gates.g3.pass, reason: receipt.gates.g3.reason },
    },
    evidenceHash: receipt.evidenceHash,
  };
  return computeCanonicalJsonSha256(receiptBody);
}

/**
 * Verifies a single Slow Clock receipt's schema, canonical SHA-256 hash,
 * gate verdicts, and promotion status.
 */
export function verifyShadowReceipt(raw: unknown): ReceiptVerificationResult {
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      promoted: false,
      reason: 'malformed_receipt_object',
      candidateId: null,
      receipt: null,
    };
  }

  const record = raw as Record<string, unknown>;
  const candidateId = isNonEmptyString(record.candidateId) ? record.candidateId : null;

  if (
    !candidateId ||
    !isNonEmptyString(record.probeId) ||
    !isNonEmptyString(record.route) ||
    !isNonEmptyString(record.triggerFlag) ||
    (record.decision !== 'PROMOTED_SHADOW' && record.decision !== 'REJECTED') ||
    !isNonEmptyString(record.evidenceHash) ||
    !SHA256_HEX_RE.test(record.evidenceHash) ||
    !isNonEmptyString(record.receiptHash) ||
    !SHA256_HEX_RE.test(record.receiptHash) ||
    !record.gates ||
    typeof record.gates !== 'object'
  ) {
    return {
      valid: false,
      promoted: false,
      reason: 'invalid_receipt_schema',
      candidateId,
      receipt: null,
    };
  }

  const gatesRecord = record.gates as Record<string, unknown>;
  if (
    !isGateCheckVerdict(gatesRecord.g1) ||
    !isGateCheckVerdict(gatesRecord.g2) ||
    !isGateCheckVerdict(gatesRecord.g3)
  ) {
    return {
      valid: false,
      promoted: false,
      reason: 'invalid_gate_verdict_schema',
      candidateId,
      receipt: null,
    };
  }

  const expectedHash = computeShadowReceiptHash({
    candidateId,
    probeId: record.probeId,
    route: record.route,
    triggerFlag: record.triggerFlag,
    decision: record.decision,
    gates: {
      g1: gatesRecord.g1,
      g2: gatesRecord.g2,
      g3: gatesRecord.g3,
    },
    evidenceHash: record.evidenceHash,
  });

  if (record.receiptHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return {
      valid: false,
      promoted: false,
      reason: 'receipt_hash_mismatch',
      candidateId,
      receipt: null,
    };
  }

  if (record.decision !== 'PROMOTED_SHADOW') {
    return {
      valid: true,
      promoted: false,
      reason: 'decision_not_promoted_shadow',
      candidateId,
      receipt: null,
    };
  }

  if (!gatesRecord.g1.pass || !gatesRecord.g2.pass || !gatesRecord.g3.pass) {
    return {
      valid: false,
      promoted: false,
      reason: 'promoted_decision_with_failed_gate',
      candidateId,
      receipt: null,
    };
  }

  if (!isSafeRouteValue(record.route)) {
    return {
      valid: false,
      promoted: false,
      reason: 'non_loopback_route',
      candidateId,
      receipt: null,
    };
  }

  const verifiedRule: VerifiedShadowRule = Object.freeze({
    candidateId,
    probeId: record.probeId,
    route: record.route,
    triggerFlag: record.triggerFlag,
    decision: 'PROMOTED_SHADOW',
    gates: Object.freeze({
      g1: Object.freeze({ pass: gatesRecord.g1.pass, reason: gatesRecord.g1.reason }),
      g2: Object.freeze({ pass: gatesRecord.g2.pass, reason: gatesRecord.g2.reason }),
      g3: Object.freeze({ pass: gatesRecord.g3.pass, reason: gatesRecord.g3.reason }),
    }),
    evidenceHash: record.evidenceHash,
    receiptHash: expectedHash,
  });

  return {
    valid: true,
    promoted: true,
    reason: 'verified_promoted_shadow',
    candidateId,
    receipt: verifiedRule,
  };
}

/**
 * Loads and cryptographically verifies Slow Clock receipts from disk (or supplied array).
 * Enforces the Explicit Opt-In Gate: returns zero active rules unless AXIOM_SHADOW_RULES === '1'.
 */
export function loadVerifiedShadowRules(
  options: LoadVerifiedShadowRulesOptions = {}
): VerifiedShadowRulesResult {
  const env = options.env ?? process.env;
  const active = isShadowEnforcementEnabled(env);

  let resolvedPath: string | null = null;
  let rawReceipts: readonly unknown[] = [];

  if (Array.isArray(options.receipts)) {
    rawReceipts = options.receipts;
  } else {
    resolvedPath = resolveRepoFile(
      options.receiptsPath ?? DEFAULT_SLOW_CLOCK_RECEIPTS_REL_PATH
    );
    const doc = readJsonSafe<{ readonly receipts?: unknown }>(resolvedPath);
    if (doc && Array.isArray(doc.receipts)) {
      rawReceipts = doc.receipts;
    }
  }

  const verifiedPromoted: VerifiedShadowRule[] = [];
  const rejectedIds: string[] = [];
  const tamperedIds: string[] = [];

  for (const item of rawReceipts) {
    const check = verifyShadowReceipt(item);
    if (!check.valid) {
      tamperedIds.push(check.candidateId ?? 'UNKNOWN');
      continue;
    }
    if (!check.promoted || !check.receipt) {
      if (check.candidateId) {
        rejectedIds.push(check.candidateId);
      }
      continue;
    }
    verifiedPromoted.push(check.receipt);
  }

  const enforcedRules = active ? Object.freeze(verifiedPromoted) : Object.freeze([]);
  const enforcedRuleIds = Object.freeze(enforcedRules.map((rule) => rule.candidateId));

  return Object.freeze({
    active,
    rules: enforcedRules,
    enforcedRuleIds,
    verifiedPromotedCount: verifiedPromoted.length,
    rejectedIds: Object.freeze(rejectedIds),
    tamperedIds: Object.freeze(tamperedIds),
    receiptsPath: resolvedPath,
  });
}

function sanitizeStringContent(
  text: string,
  violationsNeutralized: Set<string>
): string {
  let next = text;

  if (STACK_LEAK_MARKER_RE.test(next)) {
    STACK_LEAK_MARKER_RE.lastIndex = 0;
    next = next.replace(STACK_LEAK_MARKER_RE, '[REDACTED_SHADOW_RULE]');
    violationsNeutralized.add('canary_stack_leak');
  }
  STACK_LEAK_MARKER_RE.lastIndex = 0;

  if (NODE_STACK_FRAME_RE.test(next)) {
    NODE_STACK_FRAME_RE.lastIndex = 0;
    next = next.replace(NODE_STACK_FRAME_RE, '');
    violationsNeutralized.add('stack_trace_leak');
  }
  NODE_STACK_FRAME_RE.lastIndex = 0;

  if (SENSITIVE_ENV_LEAK_RE.test(next)) {
    SENSITIVE_ENV_LEAK_RE.lastIndex = 0;
    next = next.replace(SENSITIVE_ENV_LEAK_RE, '[REDACTED_SECRET]');
    violationsNeutralized.add('sensitive_secret_leak');
  }
  SENSITIVE_ENV_LEAK_RE.lastIndex = 0;

  return next;
}

function sanitizePayloadValue(
  value: unknown,
  violationsNeutralized: Set<string>
): unknown {
  if (typeof value === 'string') {
    return sanitizeStringContent(value, violationsNeutralized);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadValue(item, violationsNeutralized));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizePayloadValue(v, violationsNeutralized);
    }
    return out;
  }
  return value;
}

function cloneHeaders(headers?: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function findHeaderKeyCaseInsensitive(
  headers: Readonly<Record<string, string>>,
  targetLowerName: string
): string | null {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === targetLowerName) {
      return key;
    }
  }
  return null;
}

/**
 * Deterministic response/request guard helper.
 * Activates ONLY when AXIOM_SHADOW_RULES === '1' AND at least one cryptographically
 * verified PROMOTED_SHADOW rule matches the route (and optional candidateId).
 * Neutralizes non-loopback redirects (e.g. 0.0.0.0) and leaked stack markers
 * (e.g. CANARY_STACK_LEAK), while attaching X-Axiom-Shadow-Rule: <candidateId>.
 */
export function applyShadowRuleGuard<TBody = unknown>(
  input: ShadowRuleGuardInput & { readonly body?: TBody }
): ShadowRuleGuardResult<TBody> {
  const initialStatus = input.status ?? 200;
  const headers = cloneHeaders(input.headers);
  const env = input.env ?? process.env;

  const loaded = loadVerifiedShadowRules({
    receiptsPath: input.receiptsPath,
    receipts: input.receipts,
    env,
  });

  if (!loaded.active || loaded.rules.length === 0) {
    return {
      enforced: false,
      mitigated: false,
      status: initialStatus,
      headers,
      body: input.body as TBody,
      enforcedRuleIds: [],
      matchedRuleIds: [],
      violationsNeutralized: [],
    };
  }

  const targetRoute = normalizeRoutePath(input.route);
  const matchingRules = loaded.rules.filter((rule) => {
    const routeMatches = normalizeRoutePath(rule.route) === targetRoute;
    const candidateMatches =
      !input.candidateId || rule.candidateId === input.candidateId;
    return routeMatches && candidateMatches;
  });

  if (matchingRules.length === 0) {
    return {
      enforced: false,
      mitigated: false,
      status: initialStatus,
      headers,
      body: input.body as TBody,
      enforcedRuleIds: [],
      matchedRuleIds: [],
      violationsNeutralized: [],
    };
  }

  const enforcedRuleIds = matchingRules.map((r) => r.candidateId);
  const violationsNeutralized = new Set<string>();
  let nextStatus = initialStatus;

  const baseUrlObj = assertLoopbackTarget(
    input.baseUrl ?? DEFAULT_LOOPBACK_BASE_URL
  );
  const locationKey = findHeaderKeyCaseInsensitive(headers, 'location');
  if (locationKey) {
    const locationVal = headers[locationKey];
    if (!isSafeLoopbackRedirect(locationVal, baseUrlObj)) {
      delete headers[locationKey];
      if (nextStatus >= 300 && nextStatus < 400) {
        nextStatus = 200;
      }
      violationsNeutralized.add('non_loopback_redirect');
    }
  }

  const sanitizedBody = sanitizePayloadValue(
    input.body,
    violationsNeutralized
  ) as TBody;

  const shadowHeaderKey =
    findHeaderKeyCaseInsensitive(headers, SHADOW_RULE_HEADER.toLowerCase()) ??
    SHADOW_RULE_HEADER;
  headers[shadowHeaderKey] = enforcedRuleIds.join(', ');

  return {
    enforced: true,
    mitigated: violationsNeutralized.size > 0,
    status: nextStatus,
    headers,
    body: sanitizedBody,
    enforcedRuleIds,
    matchedRuleIds: enforcedRuleIds,
    violationsNeutralized: Array.from(violationsNeutralized),
  };
}

interface RawSweepGovernanceEntry {
  readonly cartridgeId?: unknown;
  readonly candidateId?: unknown;
  readonly factId?: unknown;
  readonly triggerFlag?: unknown;
  readonly approvedModels?: unknown;
  readonly rejectedModels?: unknown;
}

interface RawTopFailingFact {
  readonly fact?: unknown;
  readonly failedOccurrences?: unknown;
}

interface RawSweepSummaryDocument {
  readonly sweepTimestamp?: unknown;
  readonly candidateGovernance?: readonly RawSweepGovernanceEntry[];
  readonly topFailingFacts?: readonly RawTopFailingFact[];
}

/**
 * Read-only shadow prompt-patch selector reading
 * out/v4/sweeps/2026-11-26T14-45Z/sweep-summary.json (or a supplied path)
 * to surface the top promoted sweep rules (e.g. Q-P-12-FRESH,
 * Q-EDGE-TS-10-TS-04, Q-REFINE-TS-12) for TS-04 / TS-12 / P-06 reinforcement.
 */
export function selectPromotedSweepRules(
  sweepSummaryPath?: string
): PromotedSweepRulesResult {
  const resolvedPath = resolveRepoFile(
    sweepSummaryPath ?? DEFAULT_SWEEP_SUMMARY_REL_PATH
  );
  const doc = readJsonSafe<RawSweepSummaryDocument>(resolvedPath);

  if (!doc || !Array.isArray(doc.candidateGovernance)) {
    return {
      available: false,
      readOnly: true,
      sweepSummaryPath: resolvedPath,
      sweepTimestamp: null,
      topPromotedRuleIds: [],
      topPromotedRules: [],
      reinforcementRules: [],
      allPromotedRules: [],
    };
  }

  const failureCountByFact = new Map<string, number>();
  if (Array.isArray(doc.topFailingFacts)) {
    for (const entry of doc.topFailingFacts) {
      if (
        entry &&
        typeof entry.fact === 'string' &&
        typeof entry.failedOccurrences === 'number' &&
        Number.isFinite(entry.failedOccurrences)
      ) {
        failureCountByFact.set(entry.fact, entry.failedOccurrences);
      }
    }
  }

  const targetSet = new Set<string>(TARGET_REINFORCEMENT_FACTS);
  const indexed: Array<{
    readonly index: number;
    readonly summary: PromotedSweepRuleSummary;
  }> = [];

  for (let i = 0; i < doc.candidateGovernance.length; i++) {
    const raw = doc.candidateGovernance[i];
    if (!raw || typeof raw !== 'object') continue;
    if (
      !isNonEmptyString(raw.candidateId) ||
      !isNonEmptyString(raw.cartridgeId) ||
      !isNonEmptyString(raw.factId) ||
      !isNonEmptyString(raw.triggerFlag) ||
      !Array.isArray(raw.approvedModels)
    ) {
      continue;
    }

    const approvedModels = raw.approvedModels.filter(
      (m: unknown): m is string => typeof m === 'string' && m.trim().length > 0
    );
    if (approvedModels.length === 0) continue;

    const rejectedCount = Array.isArray(raw.rejectedModels)
      ? raw.rejectedModels.length
      : 0;
    const factKey = `${raw.cartridgeId}::${raw.factId}`;
    const failedOccurrences = failureCountByFact.get(factKey) ?? 0;

    indexed.push({
      index: i,
      summary: Object.freeze({
        candidateId: raw.candidateId,
        cartridgeId: raw.cartridgeId,
        factId: raw.factId,
        triggerFlag: raw.triggerFlag,
        approvedModels: Object.freeze(approvedModels),
        rejectedCount,
        failedOccurrences,
        reinforcementTarget: targetSet.has(raw.factId),
      }),
    });
  }

  const sortByPromotionPriority = (
    a: { readonly index: number; readonly summary: PromotedSweepRuleSummary },
    b: { readonly index: number; readonly summary: PromotedSweepRuleSummary }
  ): number => {
    if (b.summary.approvedModels.length !== a.summary.approvedModels.length) {
      return b.summary.approvedModels.length - a.summary.approvedModels.length;
    }
    if (a.summary.rejectedCount !== b.summary.rejectedCount) {
      return a.summary.rejectedCount - b.summary.rejectedCount;
    }
    if (b.summary.failedOccurrences !== a.summary.failedOccurrences) {
      return b.summary.failedOccurrences - a.summary.failedOccurrences;
    }
    return a.index - b.index;
  };

  const sortedAll = [...indexed].sort(sortByPromotionPriority);

  const bestPerFact = new Map<
    string,
    { readonly index: number; readonly summary: PromotedSweepRuleSummary }
  >();
  for (const item of sortedAll) {
    const key = `${item.summary.cartridgeId}::${item.summary.factId}`;
    if (!bestPerFact.has(key)) {
      bestPerFact.set(key, item);
    }
  }

  const topPromotedRules = Array.from(bestPerFact.values())
    .sort(sortByPromotionPriority)
    .slice(0, 3)
    .map((item) => item.summary);

  const reinforcementRules = Array.from(bestPerFact.values())
    .filter((item) => item.summary.reinforcementTarget)
    .sort(sortByPromotionPriority)
    .map((item) => item.summary);

  return {
    available: true,
    readOnly: true,
    sweepSummaryPath: resolvedPath,
    sweepTimestamp:
      typeof doc.sweepTimestamp === 'string' ? doc.sweepTimestamp : null,
    topPromotedRuleIds: Object.freeze(
      topPromotedRules.map((rule) => rule.candidateId)
    ),
    topPromotedRules: Object.freeze(topPromotedRules),
    reinforcementRules: Object.freeze(reinforcementRules),
    allPromotedRules: Object.freeze(sortedAll.map((item) => item.summary)),
  };
}
