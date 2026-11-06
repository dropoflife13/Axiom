// scripts/mutate-oracle.ts
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
  parseMigrationMeta,
  OracleReport,
} from './oracle.js';

/**
 * Character-by-character SQL lexical state machine splitter.
 * Respects:
 *  - Line comments (-- ...\n)
 *  - Block comments (/* ... *\/, including nested block comments)
 *  - Single-quoted string literals ('...', including '' escapes)
 *  - Double-quoted identifiers ("...", including "" escapes)
 *  - Dollar-quoted string literals ($$...$$ or $tag$...$tag$)
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const n = sql.length;

  type State =
    | 'NORMAL'
    | 'LINE_COMMENT'
    | 'BLOCK_COMMENT'
    | 'SINGLE_QUOTE'
    | 'DOUBLE_QUOTE'
    | 'DOLLAR_QUOTE';

  let state: State = 'NORMAL';
  let blockCommentDepth = 0;
  let dollarTag = '';

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';

    if (state === 'NORMAL') {
      // Check line comment
      if (ch === '-' && next === '-') {
        state = 'LINE_COMMENT';
        current += '--';
        i += 2;
        continue;
      }
      // Check block comment
      if (ch === '/' && next === '*') {
        state = 'BLOCK_COMMENT';
        blockCommentDepth = 1;
        current += '/*';
        i += 2;
        continue;
      }
      // Check single quote
      if (ch === "'") {
        state = 'SINGLE_QUOTE';
        current += ch;
        i += 1;
        continue;
      }
      // Check double quote
      if (ch === '"') {
        state = 'DOUBLE_QUOTE';
        current += ch;
        i += 1;
        continue;
      }
      // Check dollar quote: $[a-zA-Z0-9_]*$
      if (ch === '$') {
        const rest = sql.slice(i);
        const match = rest.match(/^\$([a-zA-Z0-9_]*)\$/);
        if (match) {
          dollarTag = match[0];
          state = 'DOLLAR_QUOTE';
          current += dollarTag;
          i += dollarTag.length;
          continue;
        }
      }
      // Statement terminator at top level
      if (ch === ';') {
        const trimmed = current.trim();
        if (trimmed.length > 0 && !isCommentOnly(trimmed)) {
          statements.push(trimmed);
        }
        current = '';
        i += 1;
        continue;
      }

      current += ch;
      i += 1;
    } else if (state === 'LINE_COMMENT') {
      current += ch;
      i += 1;
      if (ch === '\n') {
        state = 'NORMAL';
      }
    } else if (state === 'BLOCK_COMMENT') {
      if (ch === '/' && next === '*') {
        blockCommentDepth += 1;
        current += '/*';
        i += 2;
        continue;
      }
      if (ch === '*' && next === '/') {
        blockCommentDepth -= 1;
        current += '*/';
        i += 2;
        if (blockCommentDepth === 0) {
          state = 'NORMAL';
        }
        continue;
      }
      current += ch;
      i += 1;
    } else if (state === 'SINGLE_QUOTE') {
      if (ch === "'" && next === "'") {
        current += "''";
        i += 2;
        continue;
      }
      if (ch === "'") {
        current += ch;
        i += 1;
        state = 'NORMAL';
        continue;
      }
      current += ch;
      i += 1;
    } else if (state === 'DOUBLE_QUOTE') {
      if (ch === '"' && next === '"') {
        current += '""';
        i += 2;
        continue;
      }
      if (ch === '"') {
        current += ch;
        i += 1;
        state = 'NORMAL';
        continue;
      }
      current += ch;
      i += 1;
    } else if (state === 'DOLLAR_QUOTE') {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        state = 'NORMAL';
        dollarTag = '';
        continue;
      }
      current += ch;
      i += 1;
    }
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed.length > 0 && !isCommentOnly(finalTrimmed)) {
    statements.push(finalTrimmed);
  }

  return statements;
}

function isCommentOnly(stmt: string): boolean {
  const lines = stmt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--'));
  return lines.length === 0;
}

/**
 * Metamorphic Transform 1: Toggle keyword case outside literals/comments/dollar-quotes
 */
function transformKeywordCase(statements: string[]): string {
  const keywords = new Set([
    'create', 'table', 'if', 'not', 'exists', 'uuid', 'null', 'default',
    'text', 'integer', 'bigint', 'numeric', 'boolean', 'timestamptz', 'inet', 'jsonb',
    'constraint', 'primary', 'key', 'foreign', 'references', 'on', 'delete', 'restrict',
    'check', 'in', 'between', 'and', 'or', 'unique', 'index', 'desc', 'asc', 'where', 'is',
    'replace', 'function', 'returns', 'trigger', 'language', 'plpgsql', 'security', 'definer',
    'set', 'as', 'begin', 'return', 'end', 'before', 'insert', 'update', 'for', 'each', 'row',
    'execute', 'alter', 'enable', 'force', 'level', 'policy', 'select', 'to', 'using', 'with',
    'view', 'from', 'revoke', 'all', 'grant',
  ]);

  return statements
    .map((stmt) => {
      // Transform only outside quotes/dollar-quotes
      let out = '';
      let i = 0;
      const n = stmt.length;
      while (i < n) {
        if (stmt[i] === "'") {
          out += stmt[i++];
          while (i < n) {
            if (stmt[i] === "'" && stmt[i + 1] === "'") {
              out += "''";
              i += 2;
            } else if (stmt[i] === "'") {
              out += stmt[i++];
              break;
            } else {
              out += stmt[i++];
            }
          }
        } else if (stmt[i] === '$') {
          const m = stmt.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
          if (m) {
            const tag = m[0];
            out += tag;
            i += tag.length;
            const endIdx = stmt.indexOf(tag, i);
            if (endIdx !== -1) {
              out += stmt.slice(i, endIdx + tag.length);
              i = endIdx + tag.length;
            }
          } else {
            out += stmt[i++];
          }
        } else if (/[a-zA-Z_]/.test(stmt[i])) {
          let word = '';
          while (i < n && /[a-zA-Z0-9_]/.test(stmt[i])) {
            word += stmt[i++];
          }
          const lower = word.toLowerCase();
          if (keywords.has(lower)) {
            // Invert case: if originally uppercase, make lowercase; if lowercase, make UPPERCASE
            out += word === word.toUpperCase() ? lower : word.toUpperCase();
          } else {
            out += word;
          }
        } else {
          out += stmt[i++];
        }
      }
      return out + ';';
    })
    .join('\n\n');
}

/**
 * Metamorphic Transform 2: Extra comments interspersed throughout statements
 */
function transformExtraComments(statements: string[]): string {
  return statements
    .map(
      (stmt, idx) =>
        `-- [Metamorphic Header Comment #${idx + 1}]\n/* Block comment before statement ${idx + 1} */\n` +
        stmt.replace(/\n/g, ' /* inline-meta-comment */\n') +
        `;\n-- [End Statement #${idx + 1}]`
    )
    .join('\n\n');
}

/**
 * Metamorphic Transform 3: Quoted identifiers ("public"."<table>", role names, column names)
 */
function transformQuotedIdentifiers(statements: string[], table: string): string {
  return statements
    .map((stmt) => {
      let s = stmt;
      // Quote schema.table references outside dollar quotes
      const dollarIdx = s.indexOf('$$');
      if (dollarIdx === -1) {
        s = s.replace(new RegExp(`\\bpublic\\.${table}\\b`, 'g'), `"public"."${table}"`);
        s = s.replace(/\bpublic\.tenants\b/g, '"public"."tenants"');
        s = s.replace(/\bpublic\.users\b/g, '"public"."users"');
        s = s.replace(/\bpublic\.customers\b/g, '"public"."customers"');
        s = s.replace(/\bTO application\b/g, 'TO "application"');
        s = s.replace(/\bTO readonly_user\b/g, 'TO "readonly_user"');
        s = s.replace(/\bTO application, readonly_user\b/g, 'TO "application", "readonly_user"');
      } else {
        const before = s
          .slice(0, dollarIdx)
          .replace(new RegExp(`\\bpublic\\.${table}\\b`, 'g'), `"public"."${table}"`);
        s = before + s.slice(dollarIdx);
      }
      return s + ';';
    })
    .join('\n\n');
}

/**
 * Metamorphic Transform 4: Reorder independent statements
 * (Reverse order of CREATE INDEX statements, reverse order of CREATE POLICY statements,
 *  swap ENABLE/FORCE RLS order, swap GRANT order)
 */
function transformReorderStatements(statements: string[]): string {
  const result = [...statements];

  // Helper to reverse contiguous or grouped statements matching a predicate
  const reverseGroup = (pred: (s: string) => boolean) => {
    const indices: number[] = [];
    const matched: string[] = [];
    for (let i = 0; i < result.length; i++) {
      if (pred(result[i])) {
        indices.push(i);
        matched.push(result[i]);
      }
    }
    matched.reverse();
    for (let k = 0; k < indices.length; k++) {
      result[indices[k]] = matched[k];
    }
  };

  reverseGroup((s) => /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(s));
  reverseGroup((s) => /^CREATE\s+POLICY\b/i.test(s));
  reverseGroup((s) => /^ALTER\s+TABLE\s+.*ROW\s+LEVEL\s+SECURITY$/i.test(s));
  reverseGroup((s) => /^GRANT\s+/i.test(s));

  return result.map((s) => s + ';').join('\n\n');
}

/**
 * Metamorphic Transform 5: Extract inline FOREIGN KEY, CHECK, and UNIQUE constraints from CREATE TABLE
 * into out-of-line ALTER TABLE public.<table> ADD CONSTRAINT ... statements.
 */
function transformOutOfLineConstraints(statements: string[], table: string): string {
  const out: string[] = [];

  for (const stmt of statements) {
    if (/^CREATE\s+TABLE\b/i.test(stmt)) {
      const lines = stmt.split(/\r?\n/);
      const keptLines: string[] = [];
      const extractedConstraints: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Keep PRIMARY KEY inline, extract FOREIGN KEY, CHECK, UNIQUE constraints
        const m = trimmed.match(
          /^CONSTRAINT\s+([a-zA-Z0-9_]+)\s+((?:FOREIGN\s+KEY|CHECK|UNIQUE)\b.*?)(\s*,\s*)?$/i
        );
        if (m) {
          const conName = m[1];
          const conBody = m[2];
          extractedConstraints.push(
            `ALTER TABLE public.${table} ADD CONSTRAINT ${conName} ${conBody}`
          );
        } else {
          keptLines.push(line);
        }
      }

      // Clean up trailing comma on the last line before closing ');'
      for (let i = keptLines.length - 1; i >= 0; i--) {
        if (keptLines[i].trim() === ')') {
          if (i > 0) {
            keptLines[i - 1] = keptLines[i - 1].replace(/,\s*$/, '');
          }
          break;
        }
      }

      out.push(keptLines.join('\n'));
      for (const alterStmt of extractedConstraints) {
        out.push(alterStmt);
      }
    } else {
      out.push(stmt);
    }
  }

  return out.map((s) => s + ';').join('\n\n');
}

function classifyDeletedStatement(stmt: string): string {
  const s = stmt.replace(/\s+/g, ' ').trim();
  if (/^CREATE TABLE/i.test(s)) return 'CREATE TABLE';
  if (/^CREATE UNIQUE INDEX/i.test(s)) return 'CREATE UNIQUE INDEX';
  if (/^CREATE INDEX/i.test(s)) return 'CREATE INDEX';
  if (/^CREATE OR REPLACE FUNCTION/i.test(s)) return 'CREATE FUNCTION';
  if (/^CREATE TRIGGER/i.test(s)) return 'CREATE TRIGGER';
  if (/ENABLE ROW LEVEL SECURITY/i.test(s)) return 'ENABLE RLS';
  if (/FORCE ROW LEVEL SECURITY/i.test(s)) return 'FORCE RLS';
  if (/^CREATE POLICY.*FOR SELECT/i.test(s)) return 'CREATE POLICY (SELECT)';
  if (/^CREATE POLICY.*FOR INSERT/i.test(s)) return 'CREATE POLICY (INSERT)';
  if (/^CREATE POLICY.*FOR UPDATE/i.test(s)) return 'CREATE POLICY (UPDATE)';
  if (/^CREATE VIEW/i.test(s)) return 'CREATE VIEW';
  if (/^REVOKE ALL/i.test(s)) return 'REVOKE ALL';
  if (/^GRANT .* ON TABLE public\.v_/i.test(s) || /^GRANT .* ON public\.v_/i.test(s))
    return 'GRANT ON VIEW';
  if (/^GRANT .* TO application/i.test(s)) return 'GRANT TO application';
  if (/^GRANT .* TO readonly_user/i.test(s)) return 'GRANT TO readonly_user';
  return 'OTHER';
}

function runMutationAndMetamorphicSuite() {
  const containerName = `axiom-mutate-oracle-${process.pid}`;
  console.log(`Starting persistent postgres:16 container (${containerName})...`);
  startPostgresContainer(containerName);

  try {
    // Confirm Postgres version inside container
    const verProc = spawnSync(
      'docker',
      ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'template_axiom', '-t', '-A', '-c', 'SELECT version();'],
      { encoding: 'utf-8' }
    );
    const pgVersion = (verProc.stdout || '').trim();
    console.log(`Postgres Version: ${pgVersion}`);

    const goodDir = path.resolve('fixtures/task-v2/good');
    const goodFiles = fs.readdirSync(goodDir).filter((f) => f.endsWith('.sql')).sort();

    // =========================================================================
    // PART 1: Statement-Deletion Mutation Testing
    // =========================================================================
    let totalMutants = 0;
    let killedMutants = 0;
    let survivedMutants = 0;

    let survivors: Array<{
      file: string;
      table: string;
      tenant: boolean;
      append_only: boolean;
      ingestion: boolean;
      statementIndex: number;
      statementCategory: string;
      deletedStatement: string;
    }> = [];

    let allMutantRecords: Array<{
      file: string;
      statementIndex: number;
      statementCategory: string;
      deletedStatement: string;
      status: 'KILLED' | 'SURVIVED';
      failedFacts: string[];
    }> = [];

    const forceMutations = process.argv.includes('--force-mutations');
    const reportPath = path.resolve('out/mutation-and-metamorphic-report.json');
    if (!forceMutations && fs.existsSync(reportPath)) {
      const prev = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      totalMutants = prev.mutationTesting.totalMutants;
      killedMutants = prev.mutationTesting.killedMutants;
      survivedMutants = prev.mutationTesting.survivedMutants;
      survivors = prev.mutationTesting.survivors;
      allMutantRecords = prev.mutationTesting.allMutantRecords;
    } else {
      for (const file of goodFiles) {
        const fullPath = path.join(goodDir, file);
        const rawSql = fs.readFileSync(fullPath, 'utf-8');
        const meta = parseMigrationMeta(rawSql, fullPath);
        const sqlBody = rawSql.replace(/^--\s*META:.*$/m, '');
        const statements = splitSqlStatements(sqlBody);

        for (let idx = 0; idx < statements.length; idx++) {
          totalMutants++;
          const deletedStmt = statements[idx];
          const category = classifyDeletedStatement(deletedStmt);
          const remaining = statements.filter((_, j) => j !== idx);
          const mutantSql = remaining.map((s) => s + ';').join('\n\n');

          const report: OracleReport = evaluateMigrationSqlInContainer(
            containerName,
            mutantSql,
            meta,
            `mut_${path.basename(file, '.sql')}_${idx}`
          );

          const killed = !report.pass && report.failedFacts.length > 0;
          if (killed) {
            killedMutants++;
          } else {
            survivedMutants++;
            survivors.push({
              file,
              table: meta.table,
              tenant: meta.tenant,
              append_only: meta.append_only,
              ingestion: meta.ingestion,
              statementIndex: idx,
              statementCategory: category,
              deletedStatement: deletedStmt,
            });
          }

          allMutantRecords.push({
            file,
            statementIndex: idx,
            statementCategory: category,
            deletedStatement: deletedStmt,
            status: killed ? 'KILLED' : 'SURVIVED',
            failedFacts: report.failedFacts,
          });
        }
        console.log(
          `[Mutate] ${file} (${statements.length} stmts) -> cumulative: ${killedMutants}/${totalMutants} killed, ${survivedMutants} survived`
        );
      }
    }

    // =========================================================================
    // PART 2: Metamorphic Testing (5 semantics-preserving variants x 30 files)
    // =========================================================================
    let totalMetamorphic = 0;
    let passedMetamorphic = 0;
    const metamorphicFailures: Array<{
      file: string;
      variant: string;
      failedFacts: string[];
      details: string;
    }> = [];

    for (const file of goodFiles) {
      const fullPath = path.join(goodDir, file);
      const rawSql = fs.readFileSync(fullPath, 'utf-8');
      const meta = parseMigrationMeta(rawSql, fullPath);
      const sqlBody = rawSql.replace(/^--\s*META:.*$/m, '');
      const statements = splitSqlStatements(sqlBody);

      const variants: Array<{ name: string; sql: string }> = [
        { name: 'UPPERCASE_KEYWORDS', sql: transformKeywordCase(statements) },
        { name: 'EXTRA_COMMENTS', sql: transformExtraComments(statements) },
        { name: 'QUOTED_IDENTIFIERS', sql: transformQuotedIdentifiers(statements, meta.table) },
        { name: 'REORDERED_STATEMENTS', sql: transformReorderStatements(statements) },
        {
          name: 'OUT_OF_LINE_CONSTRAINTS',
          sql: transformOutOfLineConstraints(statements, meta.table),
        },
      ];

      for (const v of variants) {
        totalMetamorphic++;
        const report = evaluateMigrationSqlInContainer(
          containerName,
          v.sql,
          meta,
          `meta_${path.basename(file, '.sql')}_${v.name}`
        );
        if (report.pass) {
          passedMetamorphic++;
        } else {
          metamorphicFailures.push({
            file,
            variant: v.name,
            failedFacts: report.failedFacts,
            details: report.details,
          });
          console.error(`[METAMORPHIC FAIL] ${file} (${v.name}):`, report.failedFacts);
        }
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      postgresVersion: pgVersion,
      mutationTesting: {
        goodFilesCount: goodFiles.length,
        totalMutants,
        killedMutants,
        survivedMutants,
        killRatePct: `${((killedMutants / totalMutants) * 100).toFixed(1)}%`,
        survivors,
        allMutantRecords,
      },
      metamorphicTesting: {
        totalVariants: totalMetamorphic,
        passedVariants: passedMetamorphic,
        failedVariants: metamorphicFailures.length,
        passRatePct: `${((passedMetamorphic / totalMetamorphic) * 100).toFixed(1)}%`,
        failures: metamorphicFailures,
      },
    };

    fs.mkdirSync(path.resolve('out'), { recursive: true });
    fs.writeFileSync(
      path.resolve('out/mutation-and-metamorphic-report.json'),
      JSON.stringify(summary, null, 2),
      'utf-8'
    );

    console.log('\n=== SUMMARY ===');
    console.log(`Postgres Version: ${pgVersion}`);
    console.log(
      `Statement-Deletion Mutants: ${killedMutants}/${totalMutants} killed (${summary.mutationTesting.killRatePct}), ${survivedMutants} survived`
    );
    console.log(
      `Metamorphic Variants: ${passedMetamorphic}/${totalMetamorphic} passed (${summary.metamorphicTesting.passRatePct}), ${metamorphicFailures.length} failed`
    );
  } finally {
    stopPostgresContainer(containerName);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('mutate-oracle.ts')) {
  runMutationAndMetamorphicSuite();
}

