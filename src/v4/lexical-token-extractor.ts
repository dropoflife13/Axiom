// src/v4/lexical-token-extractor.ts
// Deterministic, zero-LLM lexical extractor for concrete operational identifiers
// in Axiom-HOPE (Ablation v4). Replaces hand-curated REQUIRED_FACT_TOKENS maps.

const ENGLISH_STOP_WORDS = new Set<string>([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'belong', 'by', 'can',
  'combine', 'created', 'define', 'declared', 'do', 'does', 'each', 'either',
  'enforce', 'every', 'explicit', 'explicitly', 'for', 'forcing', 'from',
  'grant', 'have', 'if', 'in', 'include', 'input', 'into', 'is', 'it',
  'joining', 'level', 'must', 'name', 'named', 'never', 'no', 'non', 'not',
  'of', 'omit', 'on', 'once', 'only', 'or', 'order', 'rather', 'regardless',
  'revoke', 'row', 'rows', 'schema', 'scope', 'scoped', 'second', 'self',
  'set', 'should', 'skipping', 'state', 'status', 'table', 'tables', 'task',
  'than', 'that', 'the', 'their', 'this', 'to', 'underflow', 'use', 'using',
  'validated', 'when', 'where', 'with', 'without', 'zero', 'all', 'attach',
  'advances', 'against', 'allow', 'append', 'audit', 'business', 'client',
  'column', 'columns', 'composite', 'constraint', 'constraints', 'counter',
  'covered', 'decimal', 'exposed', 'foreign', 'functions', 'ingestion',
  'inline', 'ip', 'json', 'key', 'keys', 'list', 'monetary', 'multi',
  'mutable', 'negative', 'nouns', 'nullable', 'observation', 'partial',
  'plural', 'policies', 'primary', 'quota', 'raises', 'referential',
  'soft', 'deletable', 'tautological', 'tenant', 'timestamp', 'trigger',
  'underscores', 'views', 'write', 'address', 'btree', 'tree', 'backed',
  'check', 'indexed', 'names', 'clause', 'log', 'operation', 'rejected',
]);

const KNOWN_SQL_TYPES = new Set<string>([
  'uuid',
  'timestamptz',
  'numeric',
  'text',
  'jsonb',
  'inet',
  'bigint',
  'integer',
  'boolean',
  'bytea',
  'smallint',
  'date',
  'interval',
  'serial',
  'bigserial',
]);

const UPPERCASE_SQL_KEYWORDS = new Set<string>([
  'CHECK',
  'UNIQUE',
  'REVOKE',
  'GRANT',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'PUBLIC',
  'REFERENCES',
  'RESTRICT',
  'CASCADE',
  'NULL',
  'DEFAULT',
  'DESC',
  'ASC',
]);

const MULTI_WORD_SQL_CLAUSES: readonly RegExp[] = [
  /\bON\s+DELETE\s+(?:RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)\b/g,
  /\bON\s+UPDATE\s+(?:RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)\b/g,
  /\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/g,
  /\b(?:BEFORE|AFTER|INSTEAD\s+OF)\s+(?:INSERT|UPDATE|DELETE)(?:\s+OR\s+(?:INSERT|UPDATE|DELETE))*\b/g,
  /\bFOR\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b/g,
  /\bWITH\s+CHECK\s*\([^)]+\)/g,
  /\bUSING\s*\([^)]+\)/g,
  /\bSECURITY\s+(?:DEFINER|INVOKER)\b/g,
  /\bNOT\s+NULL\b/g,
  /\bPRIMARY\s+KEY\b/g,
  /\bFOREIGN\s+KEY\b/g,
  /\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\b/g,
];

const OPERATIONAL_STRUCTURAL_PHRASES: readonly RegExp[] = [
  /\bleading\s+column\b/gi,
  /\bunique\s+index\b/gi,
];

function addUnique(target: string[], seenLower: Set<string>, token: string): void {
  const cleaned = token.trim();
  if (!cleaned) return;
  const key = cleaned.toLowerCase();
  if (seenLower.has(key)) return;
  seenLower.add(key);
  target.push(cleaned);
}

function extractFromText(
  text: string,
  out: string[],
  seenLower: Set<string>,
  isStderr: boolean
): void {
  // 1. Quoted string literals ('...' or "...")
  const singleQuoted = /'([^'\r\n]+)'/g;
  for (const m of text.matchAll(singleQuoted)) {
    const inner = m[1].trim();
    if (inner.length > 0) {
      addUnique(out, seenLower, inner);
    }
  }
  const doubleQuoted = /"([^"\r\n]+)"/g;
  for (const m of text.matchAll(doubleQuoted)) {
    const inner = m[1].trim();
    if (inner.length > 0 && !ENGLISH_STOP_WORDS.has(inner.toLowerCase())) {
      addUnique(out, seenLower, inner);
    }
  }

  // 2. Dotted function calls & standalone function calls: auth.jwt(), gen_random_uuid(), now()
  const fnCallRe = /(?:\b[a-zA-Z_][a-zA-Z0-9_]*\.)?\b[a-zA-Z_][a-zA-Z0-9_]*\(\)/g;
  for (const m of text.matchAll(fnCallRe)) {
    addUnique(out, seenLower, m[0]);
  }

  // 3. Placeholder-template identifiers: fk_<table>_<column>, chk_<table>_<column>,
  //    idx_<table>_<col1>, <singular_ref_table>_id, fk_<table>_supersedes_id
  const templateIdRe = /(?:[a-zA-Z][a-zA-Z0-9_]*_)?<[a-zA-Z][a-zA-Z0-9_]*>(?:_[a-zA-Z0-9_<>]+)*/g;
  for (const m of text.matchAll(templateIdRe)) {
    const full = m[0];
    // Skip bare single placeholders like <col> or <key> that have no surrounding lexical anchor
    if (/^<[a-zA-Z0-9_]+>$/.test(full)) continue;
    addUnique(out, seenLower, full);
    // If a naming pattern has numbered suffix like idx_<table>_<col1>, also record its fixed prefix idx_<table>_
    const numberedPrefixMatch = full.match(/^([a-zA-Z]+_<[a-zA-Z0-9_]+>_)<[a-zA-Z]+\d+>$/);
    if (numberedPrefixMatch) {
      addUnique(out, seenLower, numberedPrefixMatch[1]);
    }
  }

  // 4. Dotted schema/record/property references: NEW.received_at, app_metadata.tenant_id, user_metadata.tenant_id
  const dottedRefRe = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  for (const m of text.matchAll(dottedRefRe)) {
    const full = m[0];
    const lhs = m[1];
    const rhs = m[2];
    // Avoid English abbreviations like "e.g."
    if (lhs.length <= 1 && rhs.length <= 1) continue;
    addUnique(out, seenLower, full);
    if (lhs.includes('_')) addUnique(out, seenLower, lhs);
    if (rhs.includes('_')) addUnique(out, seenLower, rhs);
  }

  // 5. Key-value option assignments, nullity predicates, ordering clauses, and numeric bounds
  const optionAssignRe = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*=\s*(true|false|\d+)\b/g;
  for (const m of text.matchAll(optionAssignRe)) {
    addUnique(out, seenLower, `${m[1]} = ${m[2]}`);
  }

  const nullPredRe = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s+IS\s+(?:NOT\s+)?NULL\b/g;
  for (const m of text.matchAll(nullPredRe)) {
    addUnique(out, seenLower, m[0].replace(/\s+/g, ' '));
  }

  const orderClauseRe = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s+(ASC|DESC)\b/g;
  for (const m of text.matchAll(orderClauseRe)) {
    addUnique(out, seenLower, `${m[1]} ${m[2]}`);
  }

  const numericBoundRe = /(?:>=|<=|<>|!=|>|<)\s*-?\d+(?:\.\d+)?/g;
  for (const m of text.matchAll(numericBoundRe)) {
    addUnique(out, seenLower, m[0].replace(/\s+/g, ' '));
  }

  // 6. snake_case identifiers (columns, roles, naming conventions, prefixes)
  const snakeCaseRe = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
  for (const m of text.matchAll(snakeCaseRe)) {
    const tok = m[0];
    if (!ENGLISH_STOP_WORDS.has(tok.toLowerCase())) {
      addUnique(out, seenLower, tok);
    }
  }

  // 7. Multi-word uppercase SQL / policy clauses
  for (const clauseRe of MULTI_WORD_SQL_CLAUSES) {
    clauseRe.lastIndex = 0;
    for (const m of text.matchAll(clauseRe)) {
      addUnique(out, seenLower, m[0].replace(/\s+/g, ' '));
    }
  }

  // 8. Standalone uppercase SQL / DCL keywords (plus lowercase "revoke" when paired with privileges)
  if (!isStderr) {
    if (/\brevoke\s+(?:UPDATE|DELETE|TRUNCATE|INSERT|SELECT|ALL)\b/i.test(text)) {
      addUnique(out, seenLower, 'REVOKE');
    }
    const upperWordRe = /\b[A-Z][A-Z0-9_]{2,}\b/g;
    for (const m of text.matchAll(upperWordRe)) {
      if (UPPERCASE_SQL_KEYWORDS.has(m[0])) {
        addUnique(out, seenLower, m[0]);
      }
    }
  }

  // 9. SQL data types & contextual operational identifiers (column/schema/role names, index phrases)
  if (!isStderr) {
    // Strip negative parenthetical/contrastive clauses ("never float...", "rather than varchar(n)...")
    // ONLY for plain data-type matching so prohibited types are not mistaken for required types.
    const positiveOnly = text
      .replace(/\(\s*never\b[^)]*\)/gi, ' ')
      .replace(/,\s*never\b[^.;)]*/gi, ' ')
      .replace(/\brather\s+than\b[^.;)]*/gi, ' ');

    const wordRe = /\b[a-z][a-z0-9_]*\b/g;
    for (const m of positiveOnly.matchAll(wordRe)) {
      const w = m[0];
      if (KNOWN_SQL_TYPES.has(w)) {
        addUnique(out, seenLower, w);
      }
    }

    // Explicit "column <ident>" declarations (e.g., "Primary key column id")
    const colDeclRe = /\bcolumn\s+([a-z][a-z0-9_]*)\b/gi;
    for (const m of positiveOnly.matchAll(colDeclRe)) {
      const ident = m[1];
      if (!ENGLISH_STOP_WORDS.has(ident.toLowerCase())) {
        addUnique(out, seenLower, ident);
      }
    }

    // Explicit "<schema> schema" declarations (e.g., "in public schema")
    const schemaDeclRe = /\b([a-z][a-z0-9_]*)\s+schema\b/gi;
    for (const m of positiveOnly.matchAll(schemaDeclRe)) {
      const ident = m[1];
      if (!ENGLISH_STOP_WORDS.has(ident.toLowerCase())) {
        addUnique(out, seenLower, ident);
      }
    }

    // Explicit SQL privilege targets: "TO <role>" or "FROM PUBLIC, <role>"
    const roleDeclRe = /\bTO\s+([a-z][a-z0-9_]*)\b/g;
    for (const m of text.matchAll(roleDeclRe)) {
      const role = m[1];
      if (!ENGLISH_STOP_WORDS.has(role.toLowerCase())) {
        addUnique(out, seenLower, role);
      }
    }

    // Operational indexing phrases ("leading column", "unique index", "index")
    for (const phraseRe of OPERATIONAL_STRUCTURAL_PHRASES) {
      phraseRe.lastIndex = 0;
      for (const m of positiveOnly.matchAll(phraseRe)) {
        addUnique(out, seenLower, m[0].toLowerCase());
      }
    }
    if (/\bindex\b/i.test(positiveOnly) && /\bleading\s+column\b/i.test(positiveOnly)) {
      addUnique(out, seenLower, 'index');
    }
  }
}

/**
 * Deterministically extracts concrete operational tokens (quoted string literals,
 * snake_case identifiers, placeholder naming templates, dotted references/function calls,
 * SQL/policy clauses, and SQL data types) from a canonical rule statement and optional
 * execution stderr hint without any LLM calls.
 */
export function extractRequiredTokens(ruleText: string, stderrHint?: string): string[] {
  const tokens: string[] = [];
  const seenLower = new Set<string>();

  if (ruleText && ruleText.trim().length > 0) {
    extractFromText(ruleText, tokens, seenLower, false);
  }
  if (stderrHint && stderrHint.trim().length > 0) {
    extractFromText(stderrHint, tokens, seenLower, true);
  }

  return tokens;
}

export interface TokenRecallMetrics {
  totalExpectedTokens: number;
  matchedTokens: number;
  recall: number;
  byFact: Record<
    string,
    {
      expected: string[];
      extracted: string[];
      matched: string[];
      missed: string[];
      recall: number;
    }
  >;
}

/**
 * Evaluates exact case-insensitive token recall of `extractRequiredTokens()` against
 * a reference map such as v3's hand-curated `REQUIRED_FACT_TOKENS`.
 */
export function computeTokenRecallAgainstReference(
  rulesById: ReadonlyMap<string, string>,
  referenceTokensById: Readonly<Record<string, readonly string[]>>
): TokenRecallMetrics {
  let totalExpectedTokens = 0;
  let matchedTokens = 0;
  const byFact: TokenRecallMetrics['byFact'] = {};

  for (const [factId, expectedList] of Object.entries(referenceTokensById)) {
    const statement = rulesById.get(factId) ?? '';
    const extracted = extractRequiredTokens(statement);
    const extractedLower = new Set(extracted.map((t) => t.toLowerCase()));

    const matched: string[] = [];
    const missed: string[] = [];
    for (const exp of expectedList) {
      totalExpectedTokens++;
      if (extractedLower.has(exp.toLowerCase())) {
        matchedTokens++;
        matched.push(exp);
      } else {
        missed.push(exp);
      }
    }

    byFact[factId] = {
      expected: [...expectedList],
      extracted,
      matched,
      missed,
      recall: expectedList.length > 0 ? matched.length / expectedList.length : 1,
    };
  }

  return {
    totalExpectedTokens,
    matchedTokens,
    recall: totalExpectedTokens > 0 ? matchedTokens / totalExpectedTokens : 1,
    byFact,
  };
}
