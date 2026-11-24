// scripts/v4/compile-policy-abac-cross-model-summary.ts
// Compiles cross-model Policy-as-Code ABAC v4 summary across gemini-3.1-flash-lite,
// gemma-4-31b-it, and qwen/qwen3.8-27b into out/v4/policy-abac-cross-model-summary.{md,json}.

import fs from 'node:fs';
import path from 'node:path';
import type { PolicyAbacHopeReceiptFile } from './run-policy-abac-hope-loop.js';
import {
  summarizePilotCheckpoint,
  type PilotCheckpointFile,
  type PilotSummaryReport,
} from './run-policy-abac-pilot.js';

export interface CrossModelTargetSpec {
  readonly modelId: string;
  readonly slug: string;
  readonly provider: string;
}

export const DEFAULT_CROSS_MODEL_TARGETS: readonly CrossModelTargetSpec[] = [
  { modelId: 'gemini-3.1-flash-lite', slug: 'gemini-3-1-flash-lite', provider: 'Google AI Studio' },
  { modelId: 'gemma-4-31b-it', slug: 'gemma-4-31b-it', provider: 'Google AI Studio' },
  { modelId: 'qwen/qwen3.8-27b', slug: 'qwen-qwen3-8-27b', provider: 'Groq' },
];

interface LoadedModelResult {
  readonly spec: CrossModelTargetSpec;
  readonly summary: PilotSummaryReport | null;
  readonly receipt: PolicyAbacHopeReceiptFile | null;
  readonly completedTrials: number;
  readonly status: 'complete-5-arm' | 'complete-4-arm' | 'partial' | 'missing';
}

function loadModelResult(spec: CrossModelTargetSpec): LoadedModelResult {
  const outDir = path.resolve('out', 'v4');
  const summaryPath = path.join(outDir, `policy-abac-${spec.slug}-summary.json`);
  const checkpointPath = path.resolve(
    '.axiom-state',
    'runs-v4',
    `policy-abac-${spec.slug}`,
    'checkpoint.json'
  );
  const receiptPath = path.join(outDir, `policy-abac-${spec.slug}-hope-receipt.json`);
  const legacyReceiptPath = path.join(outDir, 'policy-abac-hope-receipt.json');

  let summary: PilotSummaryReport | null = null;
  let completedTrials = 0;

  if (fs.existsSync(checkpointPath)) {
    const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as PilotCheckpointFile;
    completedTrials = Object.keys(cp.trials ?? {}).length;
    summary = summarizePilotCheckpoint(cp);
  } else if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as PilotSummaryReport;
    completedTrials = summary.totalTrials;
  }

  let receipt: PolicyAbacHopeReceiptFile | null = null;
  if (fs.existsSync(receiptPath)) {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as PolicyAbacHopeReceiptFile;
  } else if (spec.slug === 'gemini-3-1-flash-lite' && fs.existsSync(legacyReceiptPath)) {
    receipt = JSON.parse(fs.readFileSync(legacyReceiptPath, 'utf8')) as PolicyAbacHopeReceiptFile;
  }

  let status: LoadedModelResult['status'] = 'missing';
  if (summary) {
    const hasAll4 =
      summary.arms.A.totalTasks === 18 &&
      summary.arms.C.totalTasks === 18 &&
      summary.arms.C_ID_auto.totalTasks === 18 &&
      summary.arms.C_ID_prereq.totalTasks === 18;
    const hasHope = summary.arms.C_ID_hope?.totalTasks === 18;
    if (hasAll4 && hasHope) status = 'complete-5-arm';
    else if (hasAll4) status = 'complete-4-arm';
    else if (completedTrials > 0) status = 'partial';
  }

  return { spec, summary, receipt, completedTrials, status };
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtSignedPp(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
}

export function compilePolicyAbacCrossModelSummary(
  targets: readonly CrossModelTargetSpec[] = DEFAULT_CROSS_MODEL_TARGETS
): { markdown: string; jsonPath: string; mdPath: string } {
  const loaded = targets.map(loadModelResult);
  const complete5 = loaded.filter((m) => m.status === 'complete-5-arm' && m.summary);

  const lines: string[] = [
    '# Axiom-HOPE v4 Cross-Model Policy-as-Code (ABAC) Replication Summary',
    '',
    '- **Cartridge:** `policy-abac-v4` (`18` held-out Cedar-style ABAC tasks across banking, healthcare, and admin domains)',
    '- **Frozen Vaults:** `.axiom-state/v4/policy-abac-c.json` (`6.4%` token retention) vs. `.axiom-state/v4/policy-abac-cid-auto.json` (`100.0%` automated token retention via `extractRequiredTokens()`)',
    '- **Protocol:** `K = 4` retrieval budget, `temperature = 0`, deterministic zero-LLM Cedar execution oracle + unmodified 3-clock `AxiomHopeEngine`',
    '',
    '## 1. Cross-Model 5-Arm Full-Task Pass Rate Comparison',
    '',
    '| Model | Provider | Status | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const m of loaded) {
    const s = m.summary;
    const statusLabel =
      m.status === 'complete-5-arm'
        ? '90/90'
        : m.status === 'complete-4-arm'
          ? '72/90'
          : `${m.completedTrials}/90`;
    if (!s) {
      lines.push(
        `| \`${m.spec.modelId}\` | ${m.spec.provider} | ${statusLabel} | — | — | — | — | — | — | — | — |`
      );
      continue;
    }
    const c = s.contrastsPp;
    lines.push(
      `| \`${m.spec.modelId}\` | ${m.spec.provider} | ${statusLabel} | ${fmtPct(s.arms.A.fullTaskPassRate)} | ${fmtPct(s.arms.C.fullTaskPassRate)} | ${fmtPct(s.arms.C_ID_prereq.fullTaskPassRate)} | ${fmtPct(s.arms.C_ID_auto.fullTaskPassRate)} | **${fmtPct(s.arms.C_ID_hope?.fullTaskPassRate)}** | ${fmtSignedPp(c.C_ID_auto_minus_C_task)} | **${fmtSignedPp(c.C_ID_hope_minus_C_task)}** | **${fmtSignedPp(c.C_ID_hope_minus_C_ID_prereq_task)}** |`
    );
  }

  if (complete5.length >= 2) {
    const avg = (fn: (s: PilotSummaryReport) => number) =>
      complete5.reduce((acc, m) => acc + fn(m.summary!), 0) / complete5.length;

    lines.push(
      `| **Pooled Mean (n=${complete5.length})** | Multi-Provider | Complete | ${fmtPct(avg((s) => s.arms.A.fullTaskPassRate))} | ${fmtPct(avg((s) => s.arms.C.fullTaskPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_prereq.fullTaskPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_auto.fullTaskPassRate))} | **${fmtPct(avg((s) => s.arms.C_ID_hope!.fullTaskPassRate))}** | ${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_auto_minus_C_task))} | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_task!))}** | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_ID_prereq_task!))}** |`
    );
  }

  lines.push(
    '',
    '## 2. Cross-Model 5-Arm Mean Fact Pass Rate Comparison',
    '',
    '| Model | `A` | `C` | `C_ID_prereq` | `C_ID_auto` | `C_ID_hope` | `C_ID_auto - C` | `C_ID_hope - C` | `C_ID_hope - C_ID_prereq` |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
  );

  for (const m of loaded) {
    const s = m.summary;
    if (!s) continue;
    const c = s.contrastsPp;
    lines.push(
      `| \`${m.spec.modelId}\` | ${fmtPct(s.arms.A.meanFactPassRate)} | ${fmtPct(s.arms.C.meanFactPassRate)} | ${fmtPct(s.arms.C_ID_prereq.meanFactPassRate)} | ${fmtPct(s.arms.C_ID_auto.meanFactPassRate)} | **${fmtPct(s.arms.C_ID_hope?.meanFactPassRate)}** | ${fmtSignedPp(c.C_ID_auto_minus_C_fact)} | **${fmtSignedPp(c.C_ID_hope_minus_C_fact)}** | **${fmtSignedPp(c.C_ID_hope_minus_C_ID_prereq_fact)}** |`
    );
  }

  if (complete5.length >= 2) {
    const avg = (fn: (s: PilotSummaryReport) => number) =>
      complete5.reduce((acc, m) => acc + fn(m.summary!), 0) / complete5.length;

    lines.push(
      `| **Pooled Mean (n=${complete5.length})** | ${fmtPct(avg((s) => s.arms.A.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_prereq.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_auto.meanFactPassRate))} | **${fmtPct(avg((s) => s.arms.C_ID_hope!.meanFactPassRate))}** | ${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_auto_minus_C_fact))} | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_fact!))}** | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_ID_prereq_fact!))}** |`
    );
  }

  lines.push(
    '',
    '## 3. Slow Clock Governance Receipts (Accepted vs. Rejected Candidates per Model)',
    '',
    '| Model | Candidate | Status | Gate Outcome | Target Delta | Canary Regressions |',
    '| :--- | :--- | :---: | :--- | :---: | :---: |'
  );

  for (const m of loaded) {
    if (!m.receipt) {
      lines.push(`| \`${m.spec.modelId}\` | *(pending)* | — | — | — | — |`);
      continue;
    }
    for (const dec of m.receipt.candidateDecisions) {
      const cr = dec.gateAudit.canaryReplay;
      const gateStr =
        dec.status === 'approved'
          ? 'All 3 gates PASS'
          : `Rejected by \`${dec.rejectedByGate}\``;
      const regStr =
        cr.canaryRegressions > 0
          ? `${cr.canaryRegressions} (${cr.regressedCanaryTaskIds.join(', ')})`
          : '0';
      lines.push(
        `| \`${m.spec.modelId}\` | \`${dec.candidateId}\` | **${dec.status.toUpperCase()}** | ${gateStr} | ${fmtSignedPp(cr.targetCohortDelta * 100)} | ${regStr} |`
      );
    }
  }

  const outDir = path.resolve('out', 'v4');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'policy-abac-cross-model-summary.md');
  const jsonPath = path.join(outDir, 'policy-abac-cross-model-summary.json');
  const markdown = `${lines.join('\n')}\n`;

  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        schemaVersion: '4.0.0-policy-cross-model-summary',
        generatedAt: new Date().toISOString(),
        models: loaded.map((m) => ({
          modelId: m.spec.modelId,
          provider: m.spec.provider,
          status: m.status,
          completedTrials: m.completedTrials,
          summary: m.summary,
          promotedPrerequisiteGraph: m.receipt?.promotedPrerequisiteGraph ?? null,
          updatedRuleIds: m.receipt ? Object.keys(m.receipt.updatedRuleStatements) : [],
          candidateDecisions: m.receipt?.candidateDecisions.map((d) => ({
            candidateId: d.candidateId,
            status: d.status,
            rejectedByGate: d.rejectedByGate,
            targetCohortDelta: d.gateAudit.canaryReplay.targetCohortDelta,
            canaryRegressions: d.gateAudit.canaryReplay.canaryRegressions,
            regressedCanaryTaskIds: d.gateAudit.canaryReplay.regressedCanaryTaskIds,
          })) ?? [],
        })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return { markdown, jsonPath, mdPath };
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('compile-policy-abac-cross-model-summary.ts');

if (isEntrypoint) {
  const { markdown, mdPath, jsonPath } = compilePolicyAbacCrossModelSummary();
  console.log(markdown);
  console.log(`[v4-cross-model] Wrote ${mdPath}`);
  console.log(`[v4-cross-model] Wrote ${jsonPath}`);
}
