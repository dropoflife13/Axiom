import type { VerificationIssue, VerificationContext } from '../schema/types.js';

const META_PREFIXES = new Set([
  'CV', 'BN', 'OP', 'TA', 'EP', 'TE', 'SP', 'AA',
  'S', 'A', 'H', 'RF', 'P', 'M', 'Q', 'X', 'TS', 'PB', 'LN'
]);

export interface ExtractedReference {
  id: string;
  line: number;
  raw: string;
}

export function extractReferencesFromLine(
  line: string,
  lineNum: number,
  kind: 'agent' | 'domain' | 'candidate'
): ExtractedReference[] {
  const refs: ExtractedReference[] = [];

  // If line defines a rule, skip the definition at the start
  let text = line;
  const defMatch = text.match(/^-\s+\*\*([A-Z]{1,5}-\d+)\*\*/);
  if (defMatch) {
    text = text.substring(defMatch[0].length);
  }

  // In domain Profile A, skip header like "## Rules (`ARB-01` .. `ARB-99`)"
  if (text.startsWith('## Rules')) {
    return refs;
  }

  // 1. Shorthand in parentheses: e.g. (UX-02, 03, 07) or (UX-05, 10) or (UX-09, 06)
  const parenMatches = text.matchAll(/\(([^)]+)\)/g);
  for (const pm of parenMatches) {
    const inner = pm[1];
    // Check if inner has a pattern like PREFIX-NN followed by comma/space and more numbers
    const listMatch = inner.match(/^([A-Z]{1,5})-(\d{1,3})(?:(?:\s*,\s*|\s+and\s+)(?:([A-Z]{1,5}-)?\d{1,3}))+/);
    if (listMatch) {
      const defaultPrefix = listMatch[1];
      const items = inner.split(/[,;/]|\band\b/).map(s => s.trim());
      for (const item of items) {
        const full = item.match(/^([A-Z]{1,5})-(\d{1,3})$/);
        if (full) {
          const num = parseInt(full[2], 10);
          const pad = num < 10 ? `0${num}` : `${num}`;
          refs.push({ id: `${full[1]}-${pad}`, line: lineNum, raw: item });
        } else if (/^\d{1,3}$/.test(item)) {
          const num = parseInt(item, 10);
          const pad = num < 10 ? `0${num}` : `${num}`;
          refs.push({ id: `${defaultPrefix}-${pad}`, line: lineNum, raw: item });
        }
      }
    }
  }

  // 2. Ranges: e.g. IR-05..IR-08
  const rangeMatches = text.matchAll(/\b([A-Z]{1,5})-(\d{1,3})\.\.([A-Z]{1,5}-)?(\d{1,3})\b/g);
  for (const rm of rangeMatches) {
    const startPrefix = rm[1];
    const startNum = parseInt(rm[2], 10);
    const endPrefix = rm[3] ? rm[3].replace('-', '') : startPrefix;
    const endNum = parseInt(rm[4], 10);

    if (startPrefix === endPrefix && startNum <= endNum) {
      for (let n = startNum; n <= endNum; n++) {
        const pad = n < 10 ? `0${n}` : `${n}`;
        refs.push({ id: `${startPrefix}-${pad}`, line: lineNum, raw: rm[0] });
      }
    } else {
      // Bad range
      refs.push({ id: `${startPrefix}-${rm[2]}..${rm[3] || ''}${rm[4]}`, line: lineNum, raw: rm[0] });
    }
  }

  // 3. Shorthand slash: e.g. DB-02/03
  const slashMatches = text.matchAll(/\b([A-Z]{1,5})-(\d{1,3})\/(\d{1,3})\b/g);
  for (const sm of slashMatches) {
    const prefix = sm[1];
    const n1 = parseInt(sm[2], 10);
    const n2 = parseInt(sm[3], 10);
    refs.push({ id: `${prefix}-${n1 < 10 ? '0' + n1 : n1}`, line: lineNum, raw: sm[0] });
    refs.push({ id: `${prefix}-${n2 < 10 ? '0' + n2 : n2}`, line: lineNum, raw: sm[0] });
  }

  // 4. Standalone IDs: e.g. See SEC-09, via ARB-07, viaARB-07, or (PM-05)
  const singleMatches = text.matchAll(/(?:via|See\s+)?\b([A-Z]{1,5})-(\d{1,3})\b/g);
  for (const m of singleMatches) {
    const prefix = m[1];
    const num = parseInt(m[2], 10);
    const pad = num < 10 ? `0${num}` : `${num}`;
    const id = `${prefix}-${pad}`;
    // Don't duplicate if already added
    if (!refs.some(r => r.id === id)) {
      refs.push({ id, line: lineNum, raw: m[0] });
    }
  }

  // Filter out ignored prefixes
  return refs.filter(r => {
    const p = r.id.split('-')[0];
    if (kind === 'agent' && (p === 'BR' || p.startsWith('BR') || p === 'CAND')) {
      return false;
    }
    if (META_PREFIXES.has(p)) {
      return false;
    }
    return true;
  });
}

export function validateCrossReferences(
  lines: string[],
  kind: 'agent' | 'domain' | 'candidate',
  ctx: VerificationContext
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const refs = extractReferencesFromLine(lines[i], lineNum, kind);
    for (const ref of refs) {
      if (!ctx.vaultIndex.has(ref.id)) {
        issues.push({
          code: 'UNRESOLVED_REF',
          line: lineNum,
          detail: `Reference ${ref.id} (from "${ref.raw}") does not resolve in vaultIndex`
        });
      }
    }
  }

  return issues;
}

