// scripts/v3/verify-cid-vault.ts
// Deterministic Identifier-Preservation Gate for C_ID in Ablation v3.
// Verifies that .axiom-state/memory-v3-cid.json preserves 100% of mandatory AST/SQL tokens,
// contains <= 28 words per lesson, contains zero inline REFERENCES in F-36,
// and produces identical Top-K=10 retrieval IDs across all 200 tasks.

import fs from 'node:fs';
import path from 'node:path';
import { retrieveLessonsByFeatures, type Lesson } from '../../src/memory.js';

export const REQUIRED_FACT_TOKENS: Record<string, string[]> = Object.freeze({
  'F-01': ['id', 'uuid', 'NOT NULL', 'gen_random_uuid()'],
  'F-02': ['tenant_id', 'uuid', 'NOT NULL'],
  'F-03': ['ON DELETE RESTRICT'],
  'F-04': ['numeric'],
  'F-05': ['created_at', 'timestamptz', 'now()'],
  'F-06': ['updated_at', 'timestamptz', 'now()'],
  'F-07': ['timestamptz'],
  'F-08': ['text'],
  'F-09': ['jsonb', 'NOT NULL'],
  'F-10': ['deleted_at', 'timestamptz'],
  'F-11': ['inet'],
  'F-12': ['CHECK', 'text', 'NOT NULL'],
  'F-13': ['public', 'snake_case'],
  'F-15': ['<singular_ref_table>_id', 'supersedes_id'],
  'F-16': ['fk_<table>_<column>'],
  'F-17': ['chk_<table>_<column>'],
  'F-18': ['idx_<table>_'],
  'F-19': [
    'REVOKE',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'PUBLIC',
    'application',
    'readonly_user',
    'GRANT SELECT',
    'INSERT',
  ],
  'F-20': ['BEFORE UPDATE OR DELETE', 'Update/Delete operation rejected on audit log'],
  'F-21': ['BEFORE UPDATE', 'updated_at'],
  'F-22': ['leading column', 'index'],
  'F-23': ['tenant_id', 'leading column', 'index'],
  'F-24': ['deleted_at IS NULL', 'unique index'],
  'F-25': ['ENABLE ROW LEVEL SECURITY', 'FORCE ROW LEVEL SECURITY'],
  'F-26': ['app_metadata', 'tenant_id', 'user_metadata'],
  'F-27': ['FOR UPDATE', 'FOR DELETE', 'FOR ALL'],
  'F-30': ['USING (true)', 'WITH CHECK (true)'],
  'F-31': ['SECURITY DEFINER', 'search_path'],
  'F-32': ['UNIQUE', 'idempotency_key', 'tenant_id'],
  'F-34': ['CHECK', '>= 0'],
  'F-36': ['supersedes_id', 'fk_<table>_supersedes_id', 'ON DELETE RESTRICT'],
  'F-37': ['BEFORE INSERT', 'NEW.received_at', 'now()'],
  'F-38': ['observed_at DESC'],
  'F-39': ['security_invoker = true'],
});

export interface CidVerificationReport {
  pass: boolean;
  totalActiveFacts: number;
  memoryEntries: number;
  tokenPreservationPass: boolean;
  wordCountPass: boolean;
  f36NoInlineRefPass: boolean;
  retrievalEquivalencePass: boolean;
  totalTasksChecked: number;
  violations: string[];
}

export function verifyCidVault(
  cidMemoryPath = path.resolve('.axiom-state/memory-v3-cid.json'),
  baselineMemoryPath = path.resolve('.axiom-state/memory.json'),
  tasksPath = path.resolve('fixtures/task-v2/tasks.json')
): CidVerificationReport {
  const violations: string[] = [];

  if (!fs.existsSync(cidMemoryPath)) {
    throw new Error(`CID memory file not found: ${cidMemoryPath}`);
  }
  if (!fs.existsSync(baselineMemoryPath)) {
    throw new Error(`Baseline memory file not found: ${baselineMemoryPath}`);
  }
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`Tasks file not found: ${tasksPath}`);
  }

  const cidMemory = JSON.parse(fs.readFileSync(cidMemoryPath, 'utf8')) as Lesson[];
  const baselineMemory = JSON.parse(fs.readFileSync(baselineMemoryPath, 'utf8')) as Lesson[];
  const tasksRaw = JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as {
    train: Array<{ id: string; features: any; applicableFacts: string[] }>;
    dev: Array<{ id: string; features: any; applicableFacts: string[] }>;
    test: Array<{ id: string; features: any; applicableFacts: string[] }>;
  };
  const allTasks = [...tasksRaw.train, ...tasksRaw.dev, ...tasksRaw.test];

  let tokenPreservationPass = true;
  let wordCountPass = true;
  let f36NoInlineRefPass = true;

  for (const entry of cidMemory) {
    const fid = entry.factId ?? entry.errorCode;
    const required = REQUIRED_FACT_TOKENS[fid];
    if (required) {
      const lessonLower = entry.lesson.toLowerCase();
      const missing = required.filter((tok) => !lessonLower.includes(tok.toLowerCase()));
      if (missing.length > 0) {
        tokenPreservationPass = false;
        violations.push(
          `[Token Preservation] ${fid} missing tokens: [${missing.join(', ')}] in "${entry.lesson}"`
        );
      }
    }

    const words = entry.lesson.trim().split(/\s+/).length;
    if (words > 28) {
      wordCountPass = false;
      violations.push(`[Word Count] ${fid} exceeds 28 words (${words} words): "${entry.lesson}"`);
    }

    if (fid === 'F-36') {
      if (/\breferences\s+(?:public\.)?\w+\s*\(/i.test(entry.lesson)) {
        f36NoInlineRefPass = false;
        violations.push(`[F-36 Inline REFERENCES] F-36 contains inline REFERENCES clause: "${entry.lesson}"`);
      }
    }
  }

  let retrievalEquivalencePass = true;
  let retrievalMismatchCount = 0;

  for (const task of allTasks) {
    const baseRet = retrieveLessonsByFeatures(
      task.features,
      baselineMemory,
      10,
      task.applicableFacts,
      true
    ).map((l) => l.errorCode);

    const cidRet = retrieveLessonsByFeatures(
      task.features,
      cidMemory,
      10,
      task.applicableFacts,
      true
    ).map((l) => l.errorCode);

    if (JSON.stringify(baseRet) !== JSON.stringify(cidRet)) {
      retrievalEquivalencePass = false;
      retrievalMismatchCount++;
      if (retrievalMismatchCount <= 5) {
        violations.push(
          `[Retrieval Mismatch] Task ${task.id}: baseline=[${baseRet.join(',')}] cid=[${cidRet.join(',')}]`
        );
      }
    }
  }

  const pass =
    tokenPreservationPass &&
    wordCountPass &&
    f36NoInlineRefPass &&
    retrievalEquivalencePass &&
    cidMemory.length === baselineMemory.length;

  return {
    pass,
    totalActiveFacts: Object.keys(REQUIRED_FACT_TOKENS).length,
    memoryEntries: cidMemory.length,
    tokenPreservationPass,
    wordCountPass,
    f36NoInlineRefPass,
    retrievalEquivalencePass,
    totalTasksChecked: allTasks.length,
    violations,
  };
}

function main() {
  console.log('Running Deterministic Identifier-Preservation Gate (verify-cid-vault)...');
  const report = verifyCidVault();

  console.log(`Active facts covered: ${report.totalActiveFacts}`);
  console.log(`Memory entries checked: ${report.memoryEntries}`);
  console.log(`Tasks verified for retrieval equivalence: ${report.totalTasksChecked}`);
  console.log(`Token preservation (100%): ${report.tokenPreservationPass ? 'PASS' : 'FAIL'}`);
  console.log(`Word count (<= 28 words): ${report.wordCountPass ? 'PASS' : 'FAIL'}`);
  console.log(`F-36 no inline REFERENCES: ${report.f36NoInlineRefPass ? 'PASS' : 'FAIL'}`);
  console.log(`Retrieval equivalence (200/200): ${report.retrievalEquivalencePass ? 'PASS' : 'FAIL'}`);

  if (!report.pass) {
    console.error('\nVerification FAILURES:');
    for (const v of report.violations) {
      console.error(' - ' + v);
    }
    process.exit(1);
  }

  console.log('\n[PASS] Deterministic Identifier-Preservation Gate passed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('verify-cid-vault.ts')) {
  main();
}
