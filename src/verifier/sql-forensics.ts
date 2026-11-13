export interface ForensicTaskContext {
  table: string;
  features: {
    tenant: boolean;
    append_only: boolean;
    ingestion: boolean;
  };
}

export type ForensicExecutionClass =
  | 'execution_fatal'
  | 'invariant_violating'
  | 'compliance_marker';

export interface SqlForensicFlags {
  hasInlineSupersedesFk: boolean;
  hasExplicitSupersedesFk: boolean;
  hasDuplicatePrimaryKey: boolean;
  hasPublicAuthJwt: boolean;
  hasPublicConstraintQualifier: boolean;
  omittedSupersedesId: boolean;
  inventedLineageCol: boolean;
  hasHallucinatedLineageCol: boolean;
  hasUserMetadataLeak: boolean;
  hasSingularCompositeIndexName: boolean;
  hasRevokeWithoutPositiveGrant: boolean;
  missingCreatedAtColumn: boolean;
  missingDeletedAtOnMutable: boolean;
}

export type SqlForensicFlagName = keyof SqlForensicFlags;

export const SQL_FORENSIC_FLAG_NAMES: readonly SqlForensicFlagName[] = Object.freeze([
  'hasInlineSupersedesFk',
  'hasExplicitSupersedesFk',
  'hasDuplicatePrimaryKey',
  'hasPublicAuthJwt',
  'hasPublicConstraintQualifier',
  'omittedSupersedesId',
  'inventedLineageCol',
  'hasHallucinatedLineageCol',
  'hasUserMetadataLeak',
  'hasSingularCompositeIndexName',
  'hasRevokeWithoutPositiveGrant',
  'missingCreatedAtColumn',
  'missingDeletedAtOnMutable',
]);

export const FORENSIC_FLAG_METADATA: Record<
  SqlForensicFlagName,
  { executionClass: ForensicExecutionClass; description: string }
> = Object.freeze({
  hasInlineSupersedesFk: {
    executionClass: 'invariant_violating',
    description: 'Inline supersedes_id REFERENCES without explicit CONSTRAINT fk_<table>_supersedes_id',
  },
  hasExplicitSupersedesFk: {
    executionClass: 'compliance_marker',
    description: 'Explicit table-level CONSTRAINT fk_<table>_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES',
  },
  hasDuplicatePrimaryKey: {
    executionClass: 'execution_fatal',
    description: 'Two or more PRIMARY KEY declarations inside a single CREATE TABLE block',
  },
  hasPublicAuthJwt: {
    executionClass: 'execution_fatal',
    description: 'Invalid schema qualification public.auth.jwt()',
  },
  hasPublicConstraintQualifier: {
    executionClass: 'execution_fatal',
    description: 'Invalid schema qualification CONSTRAINT public.<name>',
  },
  omittedSupersedesId: {
    executionClass: 'invariant_violating',
    description: 'Append-only table omits supersedes_id column',
  },
  inventedLineageCol: {
    executionClass: 'invariant_violating',
    description: 'Append-only table declares an invented lineage column (parent_id, previous_id, prior_id, superseded_by, prev_id)',
  },
  hasHallucinatedLineageCol: {
    executionClass: 'invariant_violating',
    description: 'Append-only table omits supersedes_id and invents an alternative lineage column',
  },
  hasUserMetadataLeak: {
    executionClass: 'invariant_violating',
    description: 'CREATE POLICY references user_metadata instead of app_metadata',
  },
  hasSingularCompositeIndexName: {
    executionClass: 'invariant_violating',
    description: 'Multi-column index named idx_<table>_<col1> omitting <col2>',
  },
  hasRevokeWithoutPositiveGrant: {
    executionClass: 'invariant_violating',
    description: 'Append-only REVOKE without positive GRANT SELECT (readonly_user) and GRANT SELECT, INSERT (application)',
  },
  missingCreatedAtColumn: {
    executionClass: 'invariant_violating',
    description: 'CREATE TABLE omits created_at column completely',
  },
  missingDeletedAtOnMutable: {
    executionClass: 'invariant_violating',
    description: 'Mutable CREATE TABLE omits deleted_at column completely',
  },
});

/**
 * Strips SQL `--` line comments and `/* ... *\/` block comments while preserving
 * single-quoted string literals (`'...'`) and double-quoted identifiers (`"..."`).
 */
export function stripSqlComments(sql: string): string {
  if (!sql) return '';
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';

    // Single-quoted string literal
    if (ch === "'") {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === "'") {
          if (i + 1 < n && sql[i + 1] === "'") {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      out += ch;
      i++;
      while (i < n) {
        out += sql[i];
        if (sql[i] === '"') {
          if (i + 1 < n && sql[i + 1] === '"') {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Dollar-quoted PL/pgSQL string / body ($tag$...$tag$ or $$...$$)
    if (ch === '$') {
      const dollarMatch = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        out += tag;
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx === -1) {
          out += sql.slice(i);
          break;
        }
        out += sql.slice(i, closeIdx + tag.length);
        i = closeIdx + tag.length;
        continue;
      }
    }

    // Line comment --
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') {
        i++;
      }
      if (i < n && sql[i] === '\n') {
        out += '\n';
        i++;
      }
      continue;
    }

    // Block comment /* ... */ (supports nesting in PostgreSQL)
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && i + 1 < n && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && i + 1 < n && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += ' ';
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts the parenthesized body of the target `CREATE TABLE ... <table> (...)`
 * statement, or falls back to the first `CREATE TABLE` body if not matched by name.
 */
function extractTargetCreateTableBody(strippedSql: string, table: string): string | null {
  const escapedTable = escapeRegExp(table);
  const targetRegex = new RegExp(
    `\\bCREATE\\s+(?:UNLOGGED\\s+|TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"?public"?\\.)?"?${escapedTable}"?\\s*\\(`,
    'i'
  );
  let match = targetRegex.exec(strippedSql);
  if (!match) {
    const fallbackRegex =
      /\bCREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z_][a-zA-Z0-9_"]*\.)?[a-zA-Z_][a-zA-Z0-9_"]*\s*\(/i;
    match = fallbackRegex.exec(strippedSql);
  }
  if (!match) return null;

  const openParenIdx = match.index + match[0].length - 1;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = openParenIdx; i < strippedSql.length; i++) {
    const ch = strippedSql[i];
    if (inSingleQuote) {
      if (ch === "'") {
        if (i + 1 < strippedSql.length && strippedSql[i + 1] === "'") {
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"') {
        if (i + 1 < strippedSql.length && strippedSql[i + 1] === '"') {
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return strippedSql.slice(openParenIdx + 1, i);
      }
    }
  }
  return strippedSql.slice(openParenIdx + 1);
}

function extractAllCreateTableBodies(strippedSql: string): string[] {
  const bodies: string[] = [];
  const createRegex =
    /\bCREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z_][a-zA-Z0-9_"]*\.)?[a-zA-Z_][a-zA-Z0-9_"]*\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createRegex.exec(strippedSql)) !== null) {
    const openParenIdx = match.index + match[0].length - 1;
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let endIdx = strippedSql.length;

    for (let i = openParenIdx; i < strippedSql.length; i++) {
      const ch = strippedSql[i];
      if (inSingleQuote) {
        if (ch === "'") {
          if (i + 1 < strippedSql.length && strippedSql[i + 1] === "'") i++;
          else inSingleQuote = false;
        }
        continue;
      }
      if (inDoubleQuote) {
        if (ch === '"') {
          if (i + 1 < strippedSql.length && strippedSql[i + 1] === '"') i++;
          else inDoubleQuote = false;
        }
        continue;
      }
      if (ch === "'") inSingleQuote = true;
      else if (ch === '"') inDoubleQuote = true;
      else if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    bodies.push(strippedSql.slice(openParenIdx + 1, endIdx));
  }
  return bodies;
}

function splitTopLevelCommas(exprList: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < exprList.length; i++) {
    const ch = exprList[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      items.push(exprList.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = exprList.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

function extractColumnIdentifier(colExpr: string): string | null {
  const cleaned = colExpr
    .replace(/\b(ASC|DESC|NULLS\s+FIRST|NULLS\s+LAST|COLLATE\s+\S+)\b/gi, '')
    .trim();
  const simpleMatch = cleaned.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?$/);
  if (simpleMatch) return simpleMatch[1].toLowerCase();
  const funcMatch = cleaned.match(/\(\s*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\)/);
  if (funcMatch) return funcMatch[1].toLowerCase();
  return null;
}

function detectSingularCompositeIndexName(strippedSql: string, table: string): boolean {
  const escapedTable = escapeRegExp(table);
  const indexRegex = new RegExp(
    `\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"?public"?\\.)?"?(idx_${escapedTable}_[a-zA-Z0-9_]+)"?\\s+ON\\s+(?:"?public"?\\.)?"?${escapedTable}"?(?:\\s+USING\\s+[a-zA-Z0-9_]+)?\\s*\\(`,
    'gi'
  );

  let m: RegExpExecArray | null;
  while ((m = indexRegex.exec(strippedSql)) !== null) {
    const indexName = m[1].toLowerCase();
    const openIdx = m.index + m[0].length - 1;
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < strippedSql.length; i++) {
      if (strippedSql[i] === '(') depth++;
      else if (strippedSql[i] === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) continue;
    const colsRaw = strippedSql.slice(openIdx + 1, closeIdx);
    const cols = splitTopLevelCommas(colsRaw)
      .map(extractColumnIdentifier)
      .filter((c): c is string => Boolean(c));

    if (cols.length >= 2) {
      const col1 = cols[0];
      const col2 = cols[1];
      const prefix = `idx_${table.toLowerCase()}_${col1}`;
      if (indexName === prefix || (indexName.startsWith(prefix) && !indexName.includes(col2))) {
        return true;
      }
    }
  }
  return false;
}

function detectUserMetadataLeak(strippedSql: string): boolean {
  const policyRegex = /\bCREATE\s+POLICY\b[\s\S]*?(?:;|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = policyRegex.exec(strippedSql)) !== null) {
    if (/\buser_metadata\b/i.test(m[0])) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministically classifies a candidate SQL migration across 10 failure & contradiction
 * mechanisms without invoking any LLM or external database.
 */
export function classifySqlForensics(
  sql: string,
  task: ForensicTaskContext
): SqlForensicFlags {
  const stripped = stripSqlComments(sql);
  const table = task.table;
  const escapedTable = escapeRegExp(table);
  const tableBody = extractTargetCreateTableBody(stripped, table);

  // 1 & 2: Explicit vs inline supersedes_id FK
  const explicitSupersedesFkRegex = new RegExp(
    `\\bCONSTRAINT\\s+"?fk_${escapedTable}_supersedes_id"?\\s+FOREIGN\\s+KEY\\s*\\(\\s*"?supersedes_id"?\\s*\\)\\s*REFERENCES\\b`,
    'i'
  );
  const hasExplicitSupersedesFk = explicitSupersedesFkRegex.test(stripped);

  const inlineSupersedesFkRegex = /\b"?supersedes_id"?\b[^,;\n)]*\bREFERENCES\b/i;
  const hasNamedSupersedesConstraint = new RegExp(
    `\\bCONSTRAINT\\s+"?fk_${escapedTable}_supersedes_id"?\\b`,
    'i'
  ).test(stripped);
  const hasInlineSupersedesFk =
    inlineSupersedesFkRegex.test(stripped) && !hasNamedSupersedesConstraint;

  // 3: Duplicate PRIMARY KEY declarations scoped per CREATE TABLE block
  const allTableBodies = extractAllCreateTableBodies(stripped);
  const hasDuplicatePrimaryKey = allTableBodies.some(
    (body) => (body.match(/\bPRIMARY\s+KEY\b/gi)?.length ?? 0) >= 2
  );

  // 4: public.auth.jwt()
  const hasPublicAuthJwt = /\bpublic\s*\.\s*auth\s*\.\s*jwt\s*\(\s*\)/i.test(stripped);

  // 5: CONSTRAINT public.<name>
  const hasPublicConstraintQualifier =
    /\bCONSTRAINT\s+"?public"?\s*\.\s*"?[a-zA-Z_][a-zA-Z0-9_]*"?/i.test(stripped);

  // 6: Orthogonal append_only lineage flags (omittedSupersedesId & inventedLineageCol)
  const lineageScope = tableBody ?? stripped;
  const omittedSupersedesId = task.features.append_only && !/\bsupersedes_id\b/i.test(lineageScope);
  const inventedLineageCol =
    task.features.append_only &&
    /\b(parent_id|previous_id|prior_id|superseded_by|prev_id)\b/i.test(lineageScope);
  const hasHallucinatedLineageCol = omittedSupersedesId && inventedLineageCol;

  // 7: user_metadata inside CREATE POLICY
  const hasUserMetadataLeak = detectUserMetadataLeak(stripped);

  // 8: Singular composite index name idx_<table>_<col1> on (col1, col2...)
  const hasSingularCompositeIndexName = detectSingularCompositeIndexName(stripped, table);

  // 9: REVOKE ... FROM application/readonly_user without positive GRANTs on append_only
  let hasRevokeWithoutPositiveGrant = false;
  if (task.features.append_only) {
    const hasRevoke = /\bREVOKE\b[\s\S]*?\bFROM\b[\s\S]*?\b(application|readonly_user)\b/i.test(
      stripped
    );
    if (hasRevoke) {
      const hasReadonlyGrant = new RegExp(
        `\\bGRANT\\s+SELECT\\b[\\s\\S]*?\\bON\\s+(?:TABLE\\s+)?(?:"?public"?\\.)?"?${escapedTable}"?\\s+TO\\s+[^;]*\\breadonly_user\\b`,
        'i'
      ).test(stripped);
      const hasAppGrant = new RegExp(
        `\\bGRANT\\s+(?:SELECT\\s*,\\s*INSERT|INSERT\\s*,\\s*SELECT)\\b[\\s\\S]*?\\bON\\s+(?:TABLE\\s+)?(?:"?public"?\\.)?"?${escapedTable}"?\\s+TO\\s+[^;]*\\bapplication\\b`,
        'i'
      ).test(stripped);
      hasRevokeWithoutPositiveGrant = !(hasReadonlyGrant && hasAppGrant);
    }
  }

  // 10: Complete omission of created_at or deleted_at (on mutable tables)
  const columnScope = tableBody ?? stripped;
  const missingCreatedAtColumn = !/\bcreated_at\b/i.test(columnScope);
  const missingDeletedAtOnMutable =
    !task.features.append_only && !/\bdeleted_at\b/i.test(columnScope);

  return {
    hasInlineSupersedesFk,
    hasExplicitSupersedesFk,
    hasDuplicatePrimaryKey,
    hasPublicAuthJwt,
    hasPublicConstraintQualifier,
    omittedSupersedesId,
    inventedLineageCol,
    hasHallucinatedLineageCol,
    hasUserMetadataLeak,
    hasSingularCompositeIndexName,
    hasRevokeWithoutPositiveGrant,
    missingCreatedAtColumn,
    missingDeletedAtOnMutable,
  };
}

export interface ForensicTrialInput {
  condition: string;
  taskId: string;
  sanitizedSql?: string;
  generatedSql?: string;
  table?: string;
  features?: {
    tenant: boolean;
    append_only: boolean;
    ingestion: boolean;
  };
}

export interface ForensicConditionSummary {
  n: number;
  counts: Record<SqlForensicFlagName, number>;
  rates: Record<SqlForensicFlagName, number>;
}

/**
 * Aggregates deterministic `SqlForensicFlags` counts and rates grouped by condition.
 */
export function summarizeForensicsByCondition(
  trials: readonly ForensicTrialInput[],
  taskLookup?: ReadonlyMap<string, ForensicTaskContext>
): Record<string, ForensicConditionSummary> {
  const byCondition = new Map<string, ForensicTrialInput[]>();
  for (const trial of trials) {
    const list = byCondition.get(trial.condition);
    if (list) list.push(trial);
    else byCondition.set(trial.condition, [trial]);
  }

  const result: Record<string, ForensicConditionSummary> = {};
  for (const [condition, rows] of byCondition.entries()) {
    const counts = Object.fromEntries(
      SQL_FORENSIC_FLAG_NAMES.map((name) => [name, 0])
    ) as Record<SqlForensicFlagName, number>;

    for (const row of rows) {
      const ctx = taskLookup?.get(row.taskId) ?? {
        table: row.table ?? '',
        features: row.features ?? { tenant: false, append_only: false, ingestion: false },
      };
      const sql = row.sanitizedSql ?? row.generatedSql ?? '';
      const flags = classifySqlForensics(sql, ctx);
      for (const name of SQL_FORENSIC_FLAG_NAMES) {
        if (flags[name]) {
          counts[name]++;
        }
      }
    }

    const n = rows.length;
    const rates = Object.fromEntries(
      SQL_FORENSIC_FLAG_NAMES.map((name) => [name, n > 0 ? counts[name] / n : 0])
    ) as Record<SqlForensicFlagName, number>;

    result[condition] = { n, counts, rates };
  }

  return result;
}
