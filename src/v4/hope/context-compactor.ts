// src/v4/hope/context-compactor.ts
// Zero-LLM Lexical-Locked Context Compactor for Axiom-HOPE v4.
// Deterministically removes English prose filler, markdown formatting fluff, and duplicate clauses
// while guaranteeing 100% verbatim retention of every operational identifier returned by
// `extractRequiredTokens()`. Never mutates input rules or canonical vault files.

import type { CanonicalRule } from '../domain-cartridge.js';
import { extractRequiredTokens } from '../lexical-token-extractor.js';
import { containsOperationalToken } from './slow-clock.js';

export interface CompactRuleTextOptions {
  /**
   * Optional custom/aggressive post-strip transform applied to the un-placeholdered or
   * compacted candidate before the 100% lexical lock verification & verbatim fallback check.
   */
  readonly aggressiveTransform?: (text: string) => string;
}

export interface CompactedRuleTextResult {
  readonly compactedText: string;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionPct: number;
  readonly requiredTokens: readonly string[];
  readonly preservedTokens: readonly string[];
  readonly preservedTokenCount: number;
  readonly totalRequiredTokens: number;
  readonly usedFallback: boolean;
}

export interface CompactContextBundleOptions {
  /** Maximum token budget allowed for the compacted rule bundle. */
  readonly maxTokens: number;
  /** Optional custom deterministic token extractor (defaults to `extractRequiredTokens`). */
  readonly tokenExtractor?: (rule: CanonicalRule) => readonly string[];
  /** Whether to include inactive rules (default: false, keeping active rules only). */
  readonly includeInactive?: boolean;
}

export interface CompactContextBundleResult {
  readonly compactedRules: readonly CanonicalRule[];
  readonly droppedRuleIds: readonly string[];
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionPct: number;
  readonly preservedTokenCount: number;
  readonly totalRequiredTokens: number;
  readonly fallbackRuleIds: readonly string[];
}

interface TextSpan {
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

const TOKENIZER_RE =
  /[A-Za-z0-9_]+|!==|===|>=|<=|<>|!=|==|->>|->|::|[^\sA-Za-z0-9_]/g;

/**
 * Deterministic zero-LLM token count estimator mirroring BPE lexical subword chunking.
 * Separates alphanumeric identifiers (splitting long identifiers at 6-char boundaries) and
 * multi-character operators while ignoring whitespace.
 */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  let count = 0;
  TOKENIZER_RE.lastIndex = 0;
  for (const match of trimmed.matchAll(TOKENIZER_RE)) {
    const unit = match[0];
    if (/^[A-Za-z0-9_]+$/.test(unit)) {
      count += Math.max(1, Math.ceil(unit.length / 6));
    } else {
      count += 1;
    }
  }
  return count;
}

function escapeRegexLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingSpans(
  text: string,
  pattern: RegExp,
  target: TextSpan[]
): void {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || m[0].length === 0) continue;
    target.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
}

/**
 * Protects concrete operational literals, extractor contextual anchors, and Gate-2 safety guards
 * so downstream prose filler stripping can never corrupt required tokens or policy polarity.
 */
function collectProtectedSpans(
  ruleText: string,
  requiredTokens: readonly string[]
): TextSpan[] {
  const rawSpans: TextSpan[] = [];

  // 1. Namespaced entity literals & quoted literals
  findMatchingSpans(ruleText, /\b[A-Z][a-zA-Z0-9_]*::"[^"\r\n]+"/g, rawSpans);
  findMatchingSpans(ruleText, /'[^'\r\n]+'/g, rawSpans);
  findMatchingSpans(ruleText, /"[^"\r\n]+"/g, rawSpans);
  findMatchingSpans(ruleText, /`[^`\r\n]+`/g, rawSpans);

  // 2. Braced template/error envelopes such as { error: { code, message, requestId } }
  findMatchingSpans(ruleText, /\{[^{}\r\n]*(?:\{[^{}\r\n]*\}[^{}\r\n]*)?\}/g, rawSpans);

  // 3. Contextual extractor anchors (`column id`, `public schema`, `TO readonly_user`, `revoke UPDATE`)
  findMatchingSpans(ruleText, /\bcolumn\s+[a-z][a-z0-9_]*\b/gi, rawSpans);
  findMatchingSpans(ruleText, /\b[a-z][a-z0-9_]*\s+schema\b/gi, rawSpans);
  findMatchingSpans(ruleText, /\bTO\s+[a-z][a-z0-9_]*\b/g, rawSpans);
  findMatchingSpans(
    ruleText,
    /\brevoke\s+(?:UPDATE|DELETE|TRUNCATE|INSERT|SELECT|ALL)\b/gi,
    rawSpans
  );
  findMatchingSpans(ruleText, /\bGRANT\s+SELECT(?:\s*,\s*INSERT)?\b/gi, rawSpans);

  // 4. Slow Clock Gate-2 prohibition & polarity guards
  findMatchingSpans(ruleText, /\bdeclared\s+once\b/gi, rawSpans);
  findMatchingSpans(ruleText, /\bzero\s+access\b/gi, rawSpans);
  findMatchingSpans(
    ruleText,
    /\b(?:do\s+not|don't|must\s+not|never|avoid|forbid|disallow|without|omit|no|not)\b[^.;)]*\b(?:PRIMARY\s+KEY|REFERENCES|user_metadata)\b/gi,
    rawSpans
  );
  findMatchingSpans(ruleText, /\binline\s+REFERENCES\b/gi, rawSpans);
  findMatchingSpans(ruleText, /\brather\s+than\b[^.;)]*/gi, rawSpans);
  findMatchingSpans(ruleText, /\b(?:never|forbid|unless|omit|not)\b/gi, rawSpans);

  // 5. Explicit required operational tokens (sorted longest-first below)
  const sortedTokens = [...requiredTokens]
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const token of sortedTokens) {
    const normToken = token.replace(/\s+/g, ' ');
    const startsAlphaNum = /^[a-zA-Z0-9]/.test(normToken);
    const endsAlphaNum = /[a-zA-Z0-9]$/.test(normToken);
    const escaped = escapeRegexLiteral(normToken).replace(/\s+/g, '\\s+');
    const pattern = `${startsAlphaNum ? '(?<![a-zA-Z0-9_])' : ''}${escaped}${
      endsAlphaNum ? '(?![a-zA-Z0-9_])' : ''
    }`;
    findMatchingSpans(ruleText, new RegExp(pattern, 'gi'), rawSpans);
  }

  // Merge overlapping spans preferring earlier start, then longer span
  rawSpans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: TextSpan[] = [];
  for (const span of rawSpans) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(span);
    } else if (span.start < prev.end) {
      if (span.end > prev.end) {
        merged[merged.length - 1] = {
          start: prev.start,
          end: span.end,
          raw: ruleText.slice(prev.start, span.end),
        };
      }
    } else {
      merged.push(span);
    }
  }
  return merged;
}

function deduplicateClauses(text: string): string {
  const parts = text
    .split(/(?<=[.;])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length <= 1) return text.trim();

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const norm = part.replace(/[.;]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    kept.push(part);
  }
  return kept.join(' ');
}

function stripFillerOutsidePlaceholders(maskedText: string): string {
  let out = maskedText;

  // Strip markdown emphasis, inline list bullets, and headings outside protected spans
  out = out.replace(/\*\*([^*\r\n]+)\*\*/g, '$1');
  out = out.replace(/__([^_\r\n]+)__/g, '$1');
  out = out.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|#+\s+)/gm, '');

  // Strip boilerplate hedging & instructional filler
  out = out.replace(
    /\b(?:please\s+note\s+that|note\s+that|it\s+is\s+important\s+to\s+note\s+that|it\s+is\s+important\s+to|always\s+make\s+sure\s+to|make\s+sure\s+(?:that|to)|always\s+ensure\s+(?:that|to)|in\s+order\s+to\s+ensure\s+compliance(?:\s+with)?|to\s+ensure\s+(?:strict\s+)?compliance(?:\s+with)?|for\s+security\s+compliance|regardless\s+of\s+client\s+input|before\s+returning\s+a?\s*success\s+response|on\s+both\s+success\s+and\s+error\s+responses|in\s+order\s+to)\b/gi,
    ' '
  );

  // Strip verbose rule preambles & modal bloat outside protected spans
  out = out.replace(
    /\bevery\s+policy\s+bundle\s+must\s+include\s+an?\s+explicit\b/gi,
    'Include'
  );
  out = out.replace(/\bpolicy\s+bundle\b/gi, 'bundle');
  out = out.replace(/\bmust\s+explicitly\b/gi, '');
  out = out.replace(/\bmust\s+always\b/gi, '');
  out = out.replace(/\bmust\s+include\s+an?\s+explicit\b/gi, 'include');
  out = out.replace(/\bmust\s+enforce\s+an?\s+explicit\b/gi, 'enforce');
  out = out.replace(/\bmust\s+enforce\s+strict\b/gi, 'enforce');
  out = out.replace(/\bmust\s+be\s+created\s+with\b/gi, 'use');
  out = out.replace(
    /\bmust\s+(?:require|enforce|include|use|have|define|attach|scope|verify|validate|return|call|index|revoke|be)\b/gi,
    (m) => {
      const verb = m.replace(/^must\s+/i, '');
      if (/^(?:use|have|be|include)$/i.test(verb)) return '';
      return verb;
    }
  );
  out = out.replace(/\b(?:are|is)\s+required\s+to\b/gi, '');
  out = out.replace(
    /\bmust\s+be\s+(named|covered|created|validated|declared)\b/gi,
    '$1'
  );
  out = out.replace(/\bbe\s+(named|covered|created|validated|declared)\b/gi, '$1');

  // Tighten verbose phrase connectors & boilerplate nouns outside protected spans
  out = out.replace(/\bby\s+rejecting\s+(?:unbounded\s+exports|malformed\s+payloads|requests)\s+when\b/gi, 'reject when');
  out = out.replace(/\brejecting\s+(?:unbounded\s+exports|malformed\s+payloads|requests)\s+with\b/gi, 'reject with');
  out = out.replace(/\breject\s+(?:out-of-range|malformed)\s+\w+\s+with\b/gi, 'reject invalid with');
  out = out.replace(/\bblocking\s+all\s+actions\s+when\b/gi, 'block when');
  out = out.replace(/\benforce\s+strict\s+tenant\s+isolation\s+requiring\b/gi, 'require');
  out = out.replace(/\btenant\s+isolation\s+require\b/gi, 'require');
  out = out.replace(/\bseparation\s+of\s+duties\s+requiring\b/gi, 'require');
  out = out.replace(/\brequiring\b/gi, 'require');
  out = out.replace(/\bactions\s+including\b/gi, 'for');
  out = out.replace(/\bactions\s+on\b/gi, 'on');
  out = out.replace(/\bpolicies\s+for\b/gi, 'for');
  out = out.replace(/\baccepting\s+(?:a\s+)?JSON\s+request\s+body\b/gi, 'JSON body');
  out = out.replace(/\brequest\s+header\b/gi, 'header');
  out = out.replace(/\bresponse\s+header\b/gi, 'header');
  out = out.replace(/\band\s+also\s+include\b/gi, 'plus');
  out = out.replace(/\band\s+explicitly\b/gi, 'and');
  out = out.replace(/\bwith\s+HTTP\s+status\b/gi, '->');
  out = out.replace(/\breturning\s+HTTP\s+status\b/gi, '->');
  out = out.replace(/\breturn\s+HTTP\s+status\b/gi, '->');
  out = out.replace(/\bHTTP\s+status\b/gi, 'status');
  out = out.replace(/\bvalidated\s+by\b/gi, 'with');
  out = out.replace(/\bevery\b|\ball\b|\beach\b|\bstrict\b|\bexplicit\b|\bexplicitly\b|\bimmediately\b|\bappropriately\b|\bnullable\b|\bsensitive\b/gi, ' ');
  out = out.replace(/\b(?:the|a|an)\b/gi, ' ');

  // Normalize punctuation & whitespace artifacts
  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/\s+([,.;:!?])/g, '$1');
  out = out.replace(/([,;:])\s*\1+/g, '$1');
  out = out.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  out = out.replace(/,\s*\./g, '.').replace(/\.\s*\./g, '.');
  out = out.replace(/\s+/g, ' ').trim();

  out = deduplicateClauses(out);
  return out;
}

function findMinimalVerbatimSegment(ruleText: string, missingToken: string): string {
  const segments = ruleText
    .split(/(?<=[.;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const seg of segments) {
    if (containsOperationalToken(seg, missingToken)) {
      return seg;
    }
  }
  return ruleText.trim().replace(/\s+/g, ' ');
}

/**
 * Deterministically compacts a canonical rule statement by stripping English prose filler,
 * markdown fluff, and redundant clauses while strictly preserving 100% of `requiredTokens`.
 * Automatically falls back to the uncompacted verbatim segment if any required token would be lost.
 */
export function compactRuleText(
  ruleText: string,
  requiredTokens?: readonly string[],
  options: CompactRuleTextOptions = {}
): CompactedRuleTextResult {
  const normalizedOriginal = ruleText.trim().replace(/\s+/g, ' ');
  const resolvedTokens =
    requiredTokens !== undefined
      ? [...requiredTokens]
      : extractRequiredTokens(normalizedOriginal);

  const beforeTokens = estimateTokens(normalizedOriginal);
  if (!normalizedOriginal) {
    return Object.freeze({
      compactedText: '',
      beforeTokens: 0,
      afterTokens: 0,
      reductionPct: 0,
      requiredTokens: Object.freeze([]),
      preservedTokens: Object.freeze([]),
      preservedTokenCount: 0,
      totalRequiredTokens: 0,
      usedFallback: false,
    });
  }

  // Mask protected token spans with SENTINEL placeholders before prose compaction
  const protectedSpans = collectProtectedSpans(normalizedOriginal, resolvedTokens);
  let masked = '';
  let cursor = 0;
  for (let i = 0; i < protectedSpans.length; i++) {
    const span = protectedSpans[i];
    masked += normalizedOriginal.slice(cursor, span.start);
    masked += `\u0000TOK_${i}\u0000`;
    cursor = span.end;
  }
  masked += normalizedOriginal.slice(cursor);

  // Strip English filler outside protected spans, then restore verbatim spans
  const strippedMasked = stripFillerOutsidePlaceholders(masked);
  let compacted = strippedMasked.replace(/\u0000TOK_(\d+)\u0000/g, (_m, idxStr) => {
    const idx = Number(idxStr);
    return protectedSpans[idx]?.raw ?? '';
  });
  compacted = compacted.replace(/\s+/g, ' ').trim();

  if (options.aggressiveTransform) {
    compacted = options.aggressiveTransform(compacted).replace(/\s+/g, ' ').trim();
  }

  // Preserve leading capitalization when safe
  if (/^[a-z]/.test(compacted) && /^[A-Z]/.test(normalizedOriginal)) {
    const firstWordMatch = compacted.match(/^([a-z]+)/);
    const firstIsProtected =
      firstWordMatch &&
      resolvedTokens.some((t) => t.toLowerCase().startsWith(firstWordMatch[1].toLowerCase()));
    if (!firstIsProtected) {
      compacted = compacted[0].toUpperCase() + compacted.slice(1);
    }
  }

  // Verify 100% retention against `requiredTokens` AND default extractor parity if using default extraction
  const checkTokenRetained = (candidateText: string, tok: string): boolean => {
    if (!containsOperationalToken(candidateText, tok)) return false;
    if (requiredTokens === undefined) {
      const reExtracted = new Set(
        extractRequiredTokens(candidateText).map((t) => t.toLowerCase())
      );
      if (!reExtracted.has(tok.toLowerCase())) return false;
    }
    return true;
  };

  let usedFallback = false;
  const missingTokens = resolvedTokens.filter((tok) => !checkTokenRetained(compacted, tok));

  if (missingTokens.length > 0) {
    usedFallback = true;
    const segmentsToAppend: string[] = [];
    for (const tok of missingTokens) {
      if (checkTokenRetained(compacted, tok)) continue;
      const seg = findMinimalVerbatimSegment(normalizedOriginal, tok);
      if (seg && !segmentsToAppend.includes(seg)) {
        segmentsToAppend.push(seg);
      }
    }

    const base = compacted.replace(/[.;]+$/, '').trim();
    const stitched =
      base.length > 0
        ? `${base}; ${segmentsToAppend.join(' ')}`
        : segmentsToAppend.join(' ');
    const stillMissing = resolvedTokens.filter((tok) => !checkTokenRetained(stitched, tok));
    compacted =
      stillMissing.length === 0 && estimateTokens(stitched) <= beforeTokens
        ? stitched
        : normalizedOriginal;
  }

  // Never emit a "compacted" string strictly larger than the normalized original
  let afterTokens = estimateTokens(compacted);
  if (afterTokens > beforeTokens) {
    usedFallback = true;
    compacted = normalizedOriginal;
    afterTokens = beforeTokens;
  }

  const preservedTokens = resolvedTokens.filter((tok) =>
    containsOperationalToken(compacted, tok)
  );
  if (preservedTokens.length !== resolvedTokens.length) {
    const retainedSet = new Set(preservedTokens.map((t) => t.toLowerCase()));
    const failed = resolvedTokens.filter((t) => !retainedSet.has(t.toLowerCase()));
    throw new Error(
      `Lexical-locked compaction violated 100% token retention invariant: lost [${failed.join(', ')}]`
    );
  }

  const reductionPct =
    beforeTokens > 0
      ? Number((((beforeTokens - afterTokens) / beforeTokens) * 100).toFixed(2))
      : 0;

  return Object.freeze({
    compactedText: compacted,
    beforeTokens,
    afterTokens,
    reductionPct,
    requiredTokens: Object.freeze([...resolvedTokens]),
    preservedTokens: Object.freeze(preservedTokens),
    preservedTokenCount: preservedTokens.length,
    totalRequiredTokens: resolvedTokens.length,
    usedFallback,
  });
}

/**
 * Compacts a bundle of `CanonicalRule` entries deterministically under a strict `maxTokens`
 * budget while asserting 100% lexical token retention for every included rule.
 */
export function compactContextBundle(
  rules: readonly CanonicalRule[],
  options: CompactContextBundleOptions
): CompactContextBundleResult {
  if (!Number.isFinite(options.maxTokens) || options.maxTokens < 0) {
    throw new Error(`maxTokens must be a finite non-negative number (received ${options.maxTokens}).`);
  }

  const candidateRules = options.includeInactive
    ? [...rules]
    : rules.filter((r) => r.active);

  let beforeTokens = 0;
  let afterTokens = 0;
  let preservedTokenCount = 0;
  let totalRequiredTokens = 0;

  const compactedRules: CanonicalRule[] = [];
  const droppedRuleIds: string[] = [];
  const fallbackRuleIds: string[] = [];

  for (const rule of candidateRules) {
    const reqTokens = options.tokenExtractor
      ? [...options.tokenExtractor(rule)]
      : rule.requiredTokens && rule.requiredTokens.length > 0
        ? [...rule.requiredTokens]
        : extractRequiredTokens(rule.statement);

    const compactedResult = compactRuleText(rule.statement, reqTokens);
    beforeTokens += compactedResult.beforeTokens;

    if (afterTokens + compactedResult.afterTokens > options.maxTokens) {
      droppedRuleIds.push(rule.id);
      continue;
    }

    // Double-check 100% lexical retention invariant per included rule
    if (compactedResult.preservedTokenCount !== compactedResult.totalRequiredTokens) {
      throw new Error(
        `Bundle compaction failed lexical lock for rule "${rule.id}": preserved ${compactedResult.preservedTokenCount}/${compactedResult.totalRequiredTokens}.`
      );
    }

    afterTokens += compactedResult.afterTokens;
    preservedTokenCount += compactedResult.preservedTokenCount;
    totalRequiredTokens += compactedResult.totalRequiredTokens;
    if (compactedResult.usedFallback) {
      fallbackRuleIds.push(rule.id);
    }

    compactedRules.push(
      Object.freeze({
        ...rule,
        statement: compactedResult.compactedText,
        requiredTokens: Object.freeze([...reqTokens]),
        ...(rule.prerequisites ? { prerequisites: Object.freeze([...rule.prerequisites]) } : {}),
      })
    );
  }

  const reductionPct =
    beforeTokens > 0
      ? Number((((beforeTokens - afterTokens) / beforeTokens) * 100).toFixed(2))
      : 0;

  return Object.freeze({
    compactedRules: Object.freeze(compactedRules),
    droppedRuleIds: Object.freeze(droppedRuleIds),
    beforeTokens,
    afterTokens,
    reductionPct,
    preservedTokenCount,
    totalRequiredTokens,
    fallbackRuleIds: Object.freeze(fallbackRuleIds),
  });
}
