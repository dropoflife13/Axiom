import type { CheckResult, L3CheckIssue } from './types.js';

export { CheckResult, L3CheckIssue };

export function checkDb01AppendOnly(sqlContent: string): CheckResult {
  const errors: L3CheckIssue[] = [];

  // 1. Identify declared append-only tables
  // Support explicit marker: -- @append-only <table_name>
  const markerRegex = /--\s*@append-only\s+([a-zA-Z0-9_.]+)/gi;
  const declaredTables = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(sqlContent)) !== null) {
    declaredTables.add(match[1].trim());
  }

  // Fallback: if no marker, infer from CREATE TABLE statements
  if (declaredTables.size === 0) {
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_.]+)/gi;
    while ((match = createTableRegex.exec(sqlContent)) !== null) {
      declaredTables.add(match[1].trim());
    }
  }

  // If still no tables found, pass
  if (declaredTables.size === 0) {
    return {
      code: 'DB-01',
      verdict: 'PASS',
      errors: []
    };
  }

  for (const rawTable of declaredTables) {
    const tableBare = rawTable.replace(/^public\./i, '');
    const tablePattern = `(?:public\\.)?${tableBare}`;

    // LAYER 1: REVOKE UPDATE, DELETE, TRUNCATE ON <table> FROM ...
    const revokeAllRegex = new RegExp(
      `REVOKE\\s+(?:ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+(?:TABLE\\s+)?${tablePattern}\\s+FROM`,
      'i'
    );
    const revokeSpecificRegex = new RegExp(
      `REVOKE\\s+([\\s\\S]*?)\\s+ON\\s+(?:TABLE\\s+)?${tablePattern}\\s+FROM`,
      'gi'
    );

    let hasRevokeAll = revokeAllRegex.test(sqlContent);
    const revokedPrivileges = new Set<string>();

    if (!hasRevokeAll) {
      let rMatch: RegExpExecArray | null;
      while ((rMatch = revokeSpecificRegex.exec(sqlContent)) !== null) {
        const rawPrivs = rMatch[1].toUpperCase().split(',');
        for (const p of rawPrivs) {
          revokedPrivileges.add(p.trim());
        }
      }
    }

    const hasLayer1 =
      hasRevokeAll ||
      (revokedPrivileges.has('UPDATE') &&
        revokedPrivileges.has('DELETE') &&
        revokedPrivileges.has('TRUNCATE'));

    if (!hasLayer1) {
      errors.push({
        code: 'D3-layer1',
        detail: `Layer 1 violation: Table "${rawTable}" must explicitly REVOKE UPDATE, DELETE, TRUNCATE from app roles.`
      });
    }

    // LAYER 2: No CREATE POLICY ... FOR UPDATE or FOR DELETE on the table
    // Policy name can be "quoted with spaces" or unquoted
    const policyRegex = new RegExp(
      `CREATE\\s+POLICY\\s+(?:(?:"[^"]+")|(?:[a-zA-Z0-9_]+))\\s+ON\\s+${tablePattern}\\s+([\\s\\S]*?);`,
      'gi'
    );
    let pMatch: RegExpExecArray | null;
    let hasForbiddenPolicy = false;

    while ((pMatch = policyRegex.exec(sqlContent)) !== null) {
      const policyBody = pMatch[1].toUpperCase();
      if (
        policyBody.includes('FOR UPDATE') ||
        policyBody.includes('FOR DELETE') ||
        policyBody.includes('FOR ALL')
      ) {
        hasForbiddenPolicy = true;
        break;
      }
    }

    if (hasForbiddenPolicy) {
      errors.push({
        code: 'D3-layer2',
        detail: `Layer 2 violation: Append-only table "${rawTable}" must have no UPDATE or DELETE RLS policies.`
      });
    }

    // LAYER 3: A BEFORE UPDATE OR DELETE trigger on the table raising an exception
    const triggerRegex = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+(?:(?:"[^"]+")|(?:[a-zA-Z0-9_]+))\\s+BEFORE\\s+([\\s\\S]*?)\\s+ON\\s+${tablePattern}`,
      'gi'
    );

    let tMatch: RegExpExecArray | null;
    let hasBeforeUpdate = false;
    let hasBeforeDelete = false;
    const triggerFunctionDefinesRaise = /RAISE\s+EXCEPTION/i.test(sqlContent);

    while ((tMatch = triggerRegex.exec(sqlContent)) !== null) {
      const eventPart = tMatch[1].toUpperCase();
      if (eventPart.includes('UPDATE')) hasBeforeUpdate = true;
      if (eventPart.includes('DELETE')) hasBeforeDelete = true;
    }

    const hasLayer3 = hasBeforeUpdate && hasBeforeDelete && triggerFunctionDefinesRaise;

    if (!hasLayer3) {
      errors.push({
        code: 'D3-layer3',
        detail: `Layer 3 violation: Table "${rawTable}" must define a BEFORE UPDATE OR DELETE trigger that raises an exception.`
      });
    }
  }

  return {
    code: 'DB-01',
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    errors
  };
}
