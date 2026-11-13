import fs from 'node:fs';
import path from 'node:path';
import { D_SAFE_TIPS, DDL_KEYWORD_REGEX } from './d-safe-tips.js';

export interface LintIssue {
  severity: 'error' | 'warning';
  source: string;
  ruleId: string;
  code: string;
  message: string;
}

export interface LintReport {
  passed: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

interface FactEntry {
  id: string;
  statement: string;
  status?: string;
}

interface LessonEntry {
  factId?: string;
  errorCode?: string;
  lesson: string;
}

function isActiveStatus(status?: string): boolean {
  return !status || status === 'CONFIRMED' || status === 'OWNER-ADOPTED';
}

/**
 * Checks whether a rule prescribes an unnamed inline REFERENCES clause
 * (i.e. `REFERENCES` without mentioning `fk_<table>` or `CONSTRAINT` or explicitly forbidding inline REFERENCES).
 */
export function hasUnnamedInlineReferencesPrescription(text: string): boolean {
  if (!/\bREFERENCES\b/i.test(text)) return false;
  const mentionsNamedFk = /\bfk_<[^>]+>/i.test(text) || /\bfk_[a-z0-9_]+/i.test(text);
  const forbidsInline = /\b(?:never|no|not|avoid)\s+(?:an?\s+)?inline\s+REFERENCES\b/i.test(text);
  return !mentionsNamedFk && !forbidsInline;
}

export function lintFactsFile(factsPath: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const raw = JSON.parse(fs.readFileSync(factsPath, 'utf8')) as { facts: FactEntry[] };
  const activeFacts = (raw.facts ?? []).filter((f) => isActiveStatus(f.status));
  const source = path.basename(factsPath);

  for (const fact of activeFacts) {
    if (hasUnnamedInlineReferencesPrescription(fact.statement)) {
      issues.push({
        severity: 'error',
        source,
        ruleId: fact.id,
        code: 'INLINE_REFERENCES_CONTRADICTION',
        message: `${fact.id} prescribes an unnamed inline REFERENCES clause that contradicts F-16.`,
      });
    }
  }

  const f18 = activeFacts.find((f) => f.id === 'F-18');
  if (f18 && !/_<col1>\[_<col2>/i.test(f18.statement)) {
    issues.push({
      severity: 'error',
      source,
      ruleId: 'F-18',
      code: 'SINGULAR_INDEX_NAMING',
      message: 'F-18 does not explicitly allow multi-column _<col1>[_<col2>...] index naming.',
    });
  }

  const f19 = activeFacts.find((f) => f.id === 'F-19');
  if (f19) {
    const hasRevoke =
      /\bREVOKE\b/i.test(f19.statement) &&
      /\bUPDATE\b/i.test(f19.statement) &&
      /\bDELETE\b/i.test(f19.statement) &&
      /\bTRUNCATE\b/i.test(f19.statement);
    const hasPositiveGrant =
      /\bGRANT\s+SELECT\b/i.test(f19.statement) &&
      /\bGRANT\s+SELECT\s*,\s*INSERT\b/i.test(f19.statement);
    if (!hasRevoke || !hasPositiveGrant) {
      issues.push({
        severity: 'error',
        source,
        ruleId: 'F-19',
        code: 'MISSING_POSITIVE_GRANT',
        message:
          'F-19 must explicitly include both REVOKE UPDATE, DELETE, TRUNCATE and positive GRANT SELECT / GRANT SELECT, INSERT.',
      });
    }
  }

  const f01 = activeFacts.find((f) => f.id === 'F-01');
  if (
    f01 &&
    !/\bdo not combine\b[\s\S]*\bPRIMARY KEY\b/i.test(f01.statement) &&
    !/\bdeclared once\b/i.test(f01.statement)
  ) {
    issues.push({
      severity: 'error',
      source,
      ruleId: 'F-01',
      code: 'MISSING_DUPLICATE_PK_WARNING',
      message:
        'F-01 does not explicitly warn against combining an inline PRIMARY KEY with a table-level PRIMARY KEY.',
    });
  }

  return issues;
}

export function lintMemoryFile(memoryPath: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const lessons = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as LessonEntry[];
  const source = path.basename(memoryPath);

  for (const entry of lessons) {
    const id = entry.factId ?? entry.errorCode ?? 'UNKNOWN';
    if (hasUnnamedInlineReferencesPrescription(entry.lesson)) {
      issues.push({
        severity: 'error',
        source,
        ruleId: id,
        code: 'INLINE_REFERENCES_CONTRADICTION',
        message: `${id} in ${source} prescribes an unnamed inline REFERENCES clause that contradicts F-16.`,
      });
    }
  }

  const f18 = lessons.find((l) => (l.factId ?? l.errorCode) === 'F-18');
  if (f18 && !/_<col1>\[_<col2>/i.test(f18.lesson)) {
    issues.push({
      severity: 'warning',
      source,
      ruleId: 'F-18',
      code: 'SINGULAR_INDEX_NAMING_IN_CID',
      message: `${source} F-18 uses singular _<column> rather than _<col1>[_<col2>...].`,
    });
  }

  const f19 = lessons.find((l) => (l.factId ?? l.errorCode) === 'F-19');
  if (f19) {
    const hasRevoke =
      /\bREVOKE\b/i.test(f19.lesson) &&
      /\bUPDATE\b/i.test(f19.lesson) &&
      /\bDELETE\b/i.test(f19.lesson) &&
      /\bTRUNCATE\b/i.test(f19.lesson);
    const hasPositiveGrant =
      /\bGRANT\s+SELECT\b/i.test(f19.lesson) &&
      /\bGRANT\s+SELECT\s*,\s*INSERT\b/i.test(f19.lesson);
    if (!hasRevoke || !hasPositiveGrant) {
      issues.push({
        severity: 'error',
        source,
        ruleId: 'F-19',
        code: 'MISSING_POSITIVE_GRANT',
        message: `${source} F-19 must include both REVOKE UPDATE, DELETE, TRUNCATE and positive GRANT SELECT / GRANT SELECT, INSERT.`,
      });
    }
  }

  return issues;
}

export function lintDSafeTips(tips: readonly string[] = D_SAFE_TIPS): LintIssue[] {
  const issues: LintIssue[] = [];
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    if (DDL_KEYWORD_REGEX.test(tip)) {
      issues.push({
        severity: 'error',
        source: 'd-safe-tips.ts',
        ruleId: `TIP-${i + 1}`,
        code: 'DDL_KEYWORD_IN_D_SAFE',
        message: `D_SAFE_TIPS[${i}] matches DDL_KEYWORD_REGEX.`,
      });
    }
    if (/\bpublic\./i.test(tip)) {
      issues.push({
        severity: 'error',
        source: 'd-safe-tips.ts',
        ruleId: `TIP-${i + 1}`,
        code: 'PUBLIC_SCHEMA_IN_D_SAFE',
        message: `D_SAFE_TIPS[${i}] contains "public.".`,
      });
    }
  }
  return issues;
}

export function lintRuleContradictions(options?: {
  factsPath?: string;
  memoryCidPath?: string;
}): LintReport {
  const root = path.resolve('.');
  const factsPath = options?.factsPath ?? path.join(root, 'fixtures', 'task-v3', 'facts.json');
  const memoryCidPath =
    options?.memoryCidPath ?? path.join(root, '.axiom-state', 'memory-v3-cid.json');

  const allIssues = [
    ...lintFactsFile(factsPath),
    ...lintMemoryFile(memoryCidPath),
    ...lintDSafeTips(),
  ];

  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const factsIdx = args.indexOf('--facts');
  const memIdx = args.indexOf('--memory');
  const report = lintRuleContradictions({
    factsPath: factsIdx >= 0 ? args[factsIdx + 1] : undefined,
    memoryCidPath: memIdx >= 0 ? args[memIdx + 1] : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    process.exit(1);
  }
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('lint-rule-contradictions.ts');

if (isEntrypoint) {
  main();
}
