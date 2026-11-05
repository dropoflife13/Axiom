// src/benchmark.ts - 5-Agent Canary Batch Benchmark
import fs from 'node:fs';
import path from 'node:path';
import { runReflexionLoop } from './loop.js';
import { BUDGET_GUARD } from './guardrails.js';
import { loadMemory } from './memory.js';

interface CanaryTask {
  slug: string;
  cluster: 'SEC_DB' | 'OPS_INFRA' | 'BIZ_OPS' | 'UI_FE';
  task: string;
}

const CANARY_TASKS: CanaryTask[] = [
  {
    slug: 'db-audit-ledger',
    cluster: 'SEC_DB',
    task: 'Create a Database Audit Ledger Agent that enforces append-only PostgreSQL tables, REVOKE UPDATE/DELETE permissions, and BEFORE UPDATE triggers.',
  },
  {
    slug: 'docker-hardening',
    cluster: 'OPS_INFRA',
    task: 'Create a Docker Hardening Agent that validates non-root container execution, read-only root filesystems, and secret mount hygiene.',
  },
  {
    slug: 'hr-pds-encoder',
    cluster: 'BIZ_OPS',
    task: 'Create an HR Personal Data Sheet (PDS) Validation Agent that audits civil service form completeness, training hour logs, and eligibility records.',
  },
  {
    slug: 'ui-form-validator',
    cluster: 'UI_FE',
    task: 'Create a Frontend Form Validation Agent that enforces accessible ARIA error states, schema-driven input sanitization, and optimistic submit locks.',
  },
  {
    slug: 'sec-secret-scanner',
    cluster: 'SEC_DB',
    task: 'Create a Secret Hygiene Agent that blocks leaked NEXT_PUBLIC_ service keys, hardcoded bearer tokens, and unencrypted env dumps.',
  },
];

async function runCanaryBatch() {
  const results: Array<{
    slug: string;
    cluster: string;
    status: string;
    attempts: number;
    tier0Fixed: boolean;
    llmCallsAfter: number;
    memorySize: number;
    durationMs: number;
  }> = [];

  console.log('🚀 Starting 5-Agent Canary Batch (Hard Cap: 15 LLM Calls)...\n');

  for (const item of CANARY_TASKS) {
    const start = Date.now();
    console.log(`\n---------------------------------------------------------`);
    console.log(`▶ Running [${item.cluster}] ${item.slug}...`);
    console.log(`---------------------------------------------------------`);

    try {
      const res = await runReflexionLoop({
        task: item.task,
        exitOnError: false,
      });

      const memoryCount = loadMemory().length;
      results.push({
        slug: item.slug,
        cluster: item.cluster,
        status: res.success ? 'PASS' : 'QUARANTINED',
        attempts: res.attempt ?? res.attempts ?? 0,
        tier0Fixed: Boolean(res.tier0Applied && res.tier0Applied.length > 0),
        llmCallsAfter: BUDGET_GUARD.currentLlmCalls,
        memorySize: memoryCount,
        durationMs: Date.now() - start,
      });

      if (res.success && res.markdown) {
        const outDir = path.join(process.cwd(), '.axiom-state', 'canary-outputs');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${item.slug}.md`), res.markdown, 'utf-8');
      }
    } catch (err: any) {
      console.error(`🛑 Aborted during ${item.slug}:`, err.message);
      break;
    }

    // Small 2s breather between agents to keep Groq TPM bucket cool
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n================ CANARY BATCH TELEMETRY ================');
  console.table(results);
  console.log(
    `Total Process LLM Calls: ${BUDGET_GUARD.currentLlmCalls} / ${BUDGET_GUARD.maxTotalLlmCallsPerProcess}`
  );
  console.log(
    `Total Tier 3 Escalations: ${BUDGET_GUARD.currentTier3Calls} / ${BUDGET_GUARD.maxTier3EscalationsPerProcess}`
  );
  console.log('\nCurrent Lessons in .axiom-state/memory.json:');
  for (const l of loadMemory()) {
    console.log(` - [${l.errorCode}] ${l.lesson}`);
  }
}

runCanaryBatch();
