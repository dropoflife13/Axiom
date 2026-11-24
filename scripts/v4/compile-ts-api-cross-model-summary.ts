// scripts/v4/compile-ts-api-cross-model-summary.ts
// Compiles cross-model TypeScript API Security v4 summary across gemini-3.1-flash-lite,
// gemma-4-31b-it, and qwen/qwen3.8-27b into out/v4/ts-api-cross-model-summary.{md,json}.

import fs from 'node:fs';
import path from 'node:path';
import type { TsApiHopeReceiptFile } from './run-ts-api-hope-loop.js';
import {
  summarizeTsApiPilotCheckpoint,
  type TsApiPilotCheckpointFile,
  type TsApiPilotSummaryReport,
} from './run-ts-api-pilot.js';

export interface TsApiCrossModelTargetSpec {
  readonly modelId: string;
  readonly slug: string;
  readonly provider: string;
}

export const DEFAULT_TS_API_CROSS_MODEL_TARGETS: readonly TsApiCrossModelTargetSpec[] = [
  { modelId: 'gemini-3.1-flash-lite', slug: 'gemini-3-1-flash-lite', provider: 'Google AI Studio' },
  { modelId: 'gemma-4-31b-it', slug: 'gemma-4-31b-it', provider: 'Google AI Studio' },
  { modelId: 'qwen/qwen3.8-27b', slug: 'qwen-qwen3-8-27b', provider: 'Groq' },
];

interface LoadedTsApiModelResult {
  readonly spec: TsApiCrossModelTargetSpec;
  readonly summary: TsApiPilotSummaryReport | null;
  readonly receipt: TsApiHopeReceiptFile | null;
  readonly completedTrials: number;
  readonly status: 'complete-5-arm' | 'complete-4-arm' | 'partial' | 'missing';
}

function loadTsApiModelResult(spec: TsApiCrossModelTargetSpec): LoadedTsApiModelResult {
  const outDir = path.resolve('out', 'v4');
  const summaryPath = path.join(outDir, `ts-api-${spec.slug}-summary.json`);
  const checkpointPath = path.resolve(
    '.axiom-state',
    'runs-v4',
    `ts-api-${spec.slug}`,
    'checkpoint.json'
  );
  const receiptPath = path.join(outDir, `ts-api-${spec.slug}-hope-receipt.json`);
  const canonicalGeminiReceiptPath = path.join(outDir, 'ts-api-hope-receipt.json');

  let summary: TsApiPilotSummaryReport | null = null;
  let completedTrials = 0;

  if (fs.existsSync(checkpointPath)) {
    const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as TsApiPilotCheckpointFile;
    completedTrials = Object.keys(cp.trials ?? {}).length;
    summary = summarizeTsApiPilotCheckpoint(cp);
  } else if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as TsApiPilotSummaryReport;
    completedTrials = summary.totalTrials;
  }

  let receipt: TsApiHopeReceiptFile | null = null;
  if (fs.existsSync(receiptPath)) {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as TsApiHopeReceiptFile;
  } else if (spec.slug === 'gemini-3-1-flash-lite' && fs.existsSync(canonicalGeminiReceiptPath)) {
    receipt = JSON.parse(
      fs.readFileSync(canonicalGeminiReceiptPath, 'utf8')
    ) as TsApiHopeReceiptFile;
  }

  let status: LoadedTsApiModelResult['status'] = 'missing';
  if (summary) {
    const hasAll4 =
      summary.arms.A.totalTasks === 15 &&
      summary.arms.C.totalTasks === 15 &&
      summary.arms.C_ID_auto.totalTasks === 15 &&
      summary.arms.C_ID_prereq.totalTasks === 15;
    const hasHope = summary.arms.C_ID_hope?.totalTasks === 15;
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

export function compileTsApiCrossModelSummary(
  targets: readonly TsApiCrossModelTargetSpec[] = DEFAULT_TS_API_CROSS_MODEL_TARGETS
): { markdown: string; jsonPath: string; mdPath: string } {
  const loaded = targets.map(loadTsApiModelResult);
  const complete5 = loaded.filter((m) => m.status === 'complete-5-arm' && m.summary);

  const lines: string[] = [
    '# Axiom-HOPE v4 Cross-Model TypeScript API Security Replication Summary',
    '',
    '- **Cartridge:** `ts-api-security-v4` (`15` held-out TypeScript API security endpoints across financial payouts, multi-tenant admin exports, and user profile mutations)',
    '- **Frozen Vaults:** `.axiom-state/v4/ts-api-c.json` (`18/47` = `38.3%` token retention) vs. `.axiom-state/v4/ts-api-cid-auto.json` (`47/47` = `100.0%` automated token retention via `extractRequiredTokens()`)',
    '- **Protocol:** `K = 4` retrieval budget, `temperature = 0`, deterministic zero-LLM `esbuild` + `node:vm` execution oracle + unmodified 3-clock `AxiomHopeEngine`',
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
        ? '75/75'
        : m.status === 'complete-4-arm'
          ? '60/75'
          : `${m.completedTrials}/75`;
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
    const avg = (fn: (s: TsApiPilotSummaryReport) => number) =>
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
    const avg = (fn: (s: TsApiPilotSummaryReport) => number) =>
      complete5.reduce((acc, m) => acc + fn(m.summary!), 0) / complete5.length;

    lines.push(
      `| **Pooled Mean (n=${complete5.length})** | ${fmtPct(avg((s) => s.arms.A.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_prereq.meanFactPassRate))} | ${fmtPct(avg((s) => s.arms.C_ID_auto.meanFactPassRate))} | **${fmtPct(avg((s) => s.arms.C_ID_hope!.meanFactPassRate))}** | ${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_auto_minus_C_fact))} | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_fact!))}** | **${fmtSignedPp(avg((s) => s.contrastsPp.C_ID_hope_minus_C_ID_prereq_fact!))}** |`
    );
  }

  lines.push(
    '',
    '## 3. Slow Clock Governance Receipts (Accepted vs. Rejected Candidates per Model)',
    '',
    '| Model | Candidate | Status | Gate Outcome | Target Delta (Full Pass) | Canary Regressions |',
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
        `| \`${m.spec.modelId}\` | \`${dec.candidateId}\` | **${dec.status.toUpperCase()}** | ${gateStr} | ${fmtSignedPp(cr.targetCohortDelta * 100)} (${cr.targetBeforePassCount}→${cr.targetAfterPassCount}/${cr.targetTotal}) | ${regStr} |`
      );
    }
  }

  const outDir = path.resolve('out', 'v4');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'ts-api-cross-model-summary.md');
  const jsonPath = path.join(outDir, 'ts-api-cross-model-summary.json');
  const markdown = `${lines.join('\n')}\n`;

  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        schemaVersion: '4.0.0-ts-api-cross-model-summary',
        generatedAt: new Date().toISOString(),
        models: loaded.map((m) => ({
          modelId: m.spec.modelId,
          provider: m.spec.provider,
          status: m.status,
          completedTrials: m.completedTrials,
          summary: m.summary,
          promotedPrerequisiteGraph: m.receipt?.promotedPrerequisiteGraph ?? null,
          updatedRuleIds: m.receipt ? Object.keys(m.receipt.updatedRuleStatements) : [],
          candidateDecisions:
            m.receipt?.candidateDecisions.map((d) => ({
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
  path.resolve(process.argv[1]).endsWith('compile-ts-api-cross-model-summary.ts');

if (isEntrypoint) {
  const { markdown, mdPath, jsonPath } = compileTsApiCrossModelSummary();
  console.log(markdown);
  console.log(`[v4-ts-cross-model] Wrote ${mdPath}`);
  console.log(`[v4-ts-cross-model] Wrote ${jsonPath}`);
}
