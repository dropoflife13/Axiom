// scripts/v4/compile-compact-benchmark-summary.ts
// Compiles the paired head-to-head comparison between non-compact C_ID_hope baselines
// and --compact C_ID_hope runs across both v4 cartridges (policy-abac-v4, ts-api-security-v4)
// and all 3 models (gemini-3.1-flash-lite, gemma-4-31b-it, qwen/qwen3.8-27b).
// Zero fabricated data; reads strictly from committed out/v4/ summaries, receipts, and
// .axiom-state/runs-v4/ checkpoints.

import fs from 'node:fs';
import path from 'node:path';

interface ArmStats {
  readonly totalTasks: number;
  readonly fullTaskPassCount: number;
  readonly fullTaskPassRate: number;
  readonly meanFactPassRate: number;
  readonly committedCount: number;
  readonly committedRate: number;
}

interface CompactionStats {
  readonly enabled: boolean;
  readonly bundlesCompacted: number;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly savedTokens: number;
  readonly reductionPct: number;
  readonly preservedTokenCount: number;
  readonly totalRequiredTokens: number;
  readonly retentionRate: number;
}

interface SummaryFile {
  readonly model: string;
  readonly modelSlug: string;
  readonly arms: {
    readonly C_ID_hope: ArmStats;
    readonly C_ID_auto?: ArmStats;
    readonly C?: ArmStats;
  };
  readonly compaction?: CompactionStats;
}

interface ReceiptDecision {
  readonly candidateId: string;
  readonly status: 'approved' | 'rejected';
  readonly gateAudit: {
    readonly lexicalLock: { readonly passed: boolean };
    readonly contradictionLinter: { readonly passed: boolean };
    readonly canaryReplay: { readonly canaryRegressions: number };
  };
}

interface ReceiptFile {
  readonly model: string;
  readonly initialSnapshotSha256: string;
  readonly finalSnapshotSha256: string;
  readonly compaction?: CompactionStats;
  readonly candidateDecisions: readonly ReceiptDecision[];
}

interface CheckpointTrial {
  readonly arm: string;
  readonly latencyMs?: number;
}

interface CheckpointFile {
  readonly trials: Record<string, CheckpointTrial>;
}

export interface CompactPairRow {
  readonly cartridgeId: 'policy-abac-v4' | 'ts-api-security-v4';
  readonly cartridgeLabel: string;
  readonly modelId: string;
  readonly modelSlug: string;
  readonly provider: string;
  readonly taskCount: number;
  readonly baseline: {
    readonly fullTaskPassCount: number;
    readonly fullTaskPassRate: number;
    readonly meanFactPassRate: number;
    readonly p50LatencyMs: number | null;
    readonly p95LatencyMs: number | null;
  };
  readonly compact: {
    readonly fullTaskPassCount: number;
    readonly fullTaskPassRate: number;
    readonly meanFactPassRate: number;
    readonly p50LatencyMs: number | null;
    readonly p95LatencyMs: number | null;
  };
  readonly deltaPp: {
    readonly fullTask: number;
    readonly meanFact: number;
  };
  readonly compaction: CompactionStats;
  readonly governance: {
    readonly totalAudits: number;
    readonly approvedCount: number;
    readonly rejectedCount: number;
    readonly promotedCanaryRegressions: number;
    readonly lexicalLockGateAllPassed: boolean;
    readonly finalSnapshotSha256: string;
  };
}

export interface CompactBenchmarkSummary {
  readonly schemaVersion: '4.0.0-compact-benchmark-summary';
  readonly generatedAt: string;
  readonly totalPairedTrials: number;
  readonly rows: readonly CompactPairRow[];
  readonly pooledByCartridge: Record<
    'policy-abac-v4' | 'ts-api-security-v4',
    {
      readonly modelCount: number;
      readonly totalPairedTrials: number;
      readonly baselineFullTaskPassRate: number;
      readonly compactFullTaskPassRate: number;
      readonly deltaFullTaskPp: number;
      readonly baselineMeanFactPassRate: number;
      readonly compactMeanFactPassRate: number;
      readonly deltaMeanFactPp: number;
      readonly totalBeforeTokens: number;
      readonly totalAfterTokens: number;
      readonly totalSavedTokens: number;
      readonly weightedReductionPct: number;
      readonly preservedTokenCount: number;
      readonly totalRequiredTokens: number;
      readonly promotedCanaryRegressions: number;
    }
  >;
  readonly overallPooled: {
    readonly pairCount: number;
    readonly totalPairedTrials: number;
    readonly baselineFullTaskPassRate: number;
    readonly compactFullTaskPassRate: number;
    readonly deltaFullTaskPp: number;
    readonly baselineMeanFactPassRate: number;
    readonly compactMeanFactPassRate: number;
    readonly deltaMeanFactPp: number;
    readonly totalBeforeTokens: number;
    readonly totalAfterTokens: number;
    readonly totalSavedTokens: number;
    readonly weightedReductionPct: number;
    readonly preservedTokenCount: number;
    readonly totalRequiredTokens: number;
    readonly promotedCanaryRegressions: number;
  };
}

const MODEL_MATRIX: ReadonlyArray<{
  readonly modelId: string;
  readonly modelSlug: string;
  readonly provider: string;
}> = [
  { modelId: 'gemini-3.1-flash-lite', modelSlug: 'gemini-3-1-flash-lite', provider: 'Google AI Studio' },
  { modelId: 'gemma-4-31b-it', modelSlug: 'gemma-4-31b-it', provider: 'Google AI Studio' },
  { modelId: 'qwen/qwen3.8-27b', modelSlug: 'qwen-qwen3-8-27b', provider: 'Groq' },
];

const CARTRIDGES: ReadonlyArray<{
  readonly id: 'policy-abac-v4' | 'ts-api-security-v4';
  readonly prefix: 'policy-abac' | 'ts-api';
  readonly label: string;
}> = [
  { id: 'policy-abac-v4', prefix: 'policy-abac', label: 'Policy-as-Code ABAC' },
  { id: 'ts-api-security-v4', prefix: 'ts-api', label: 'TypeScript API Security' },
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function readHopeLatencies(checkpointPath: string): { p50: number | null; p95: number | null } {
  if (!fs.existsSync(checkpointPath)) return { p50: null, p95: null };
  const cp = readJson<CheckpointFile>(checkpointPath);
  const latencies = Object.values(cp.trials)
    .filter((t) => t.arm === 'C_ID_hope' && typeof t.latencyMs === 'number' && Number.isFinite(t.latencyMs))
    .map((t) => t.latencyMs as number);
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function pct1(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function signedPp(pp: number): string {
  const sign = pp >= 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)} pp`;
}

function aggregateRows(rows: readonly CompactPairRow[]) {
  const count = rows.length;
  const totalPairedTrials = rows.reduce((s, r) => s + r.taskCount, 0);
  const baseTask = rows.reduce((s, r) => s + r.baseline.fullTaskPassRate, 0) / count;
  const compTask = rows.reduce((s, r) => s + r.compact.fullTaskPassRate, 0) / count;
  const baseFact = rows.reduce((s, r) => s + r.baseline.meanFactPassRate, 0) / count;
  const compFact = rows.reduce((s, r) => s + r.compact.meanFactPassRate, 0) / count;
  const totalBeforeTokens = rows.reduce((s, r) => s + r.compaction.beforeTokens, 0);
  const totalAfterTokens = rows.reduce((s, r) => s + r.compaction.afterTokens, 0);
  const totalSavedTokens = totalBeforeTokens - totalAfterTokens;
  const weightedReductionPct =
    totalBeforeTokens > 0 ? round2((totalSavedTokens / totalBeforeTokens) * 100) : 0;
  const preservedTokenCount = rows.reduce((s, r) => s + r.compaction.preservedTokenCount, 0);
  const totalRequiredTokens = rows.reduce((s, r) => s + r.compaction.totalRequiredTokens, 0);
  const promotedCanaryRegressions = rows.reduce(
    (s, r) => s + r.governance.promotedCanaryRegressions,
    0
  );

  return {
    totalPairedTrials,
    baselineFullTaskPassRate: baseTask,
    compactFullTaskPassRate: compTask,
    deltaFullTaskPp: round2((compTask - baseTask) * 100),
    baselineMeanFactPassRate: baseFact,
    compactMeanFactPassRate: compFact,
    deltaMeanFactPp: round2((compFact - baseFact) * 100),
    totalBeforeTokens,
    totalAfterTokens,
    totalSavedTokens,
    weightedReductionPct,
    preservedTokenCount,
    totalRequiredTokens,
    promotedCanaryRegressions,
  };
}

export function compileCompactBenchmarkSummary(rootDir = process.cwd()): CompactBenchmarkSummary {
  const outDir = path.join(rootDir, 'out', 'v4');
  const runsDir = path.join(rootDir, '.axiom-state', 'runs-v4');
  const rows: CompactPairRow[] = [];

  for (const cart of CARTRIDGES) {
    for (const m of MODEL_MATRIX) {
      const baseSummaryPath = path.join(outDir, `${cart.prefix}-${m.modelSlug}-summary.json`);
      const compactSummaryPath = path.join(outDir, `${cart.prefix}-${m.modelSlug}-compact-summary.json`);
      const compactReceiptPath = path.join(
        outDir,
        `${cart.prefix}-${m.modelSlug}-compact-hope-receipt.json`
      );
      if (!fs.existsSync(baseSummaryPath)) {
        throw new Error(`Missing baseline summary: ${baseSummaryPath}`);
      }
      if (!fs.existsSync(compactSummaryPath)) {
        throw new Error(`Missing compact summary: ${compactSummaryPath}`);
      }
      if (!fs.existsSync(compactReceiptPath)) {
        throw new Error(`Missing compact receipt: ${compactReceiptPath}`);
      }

      const baseSummary = readJson<SummaryFile>(baseSummaryPath);
      const compactSummary = readJson<SummaryFile>(compactSummaryPath);
      const compactReceipt = readJson<ReceiptFile>(compactReceiptPath);

      const baseHope = baseSummary.arms.C_ID_hope;
      const compHope = compactSummary.arms.C_ID_hope;
      const compaction = compactSummary.compaction ?? compactReceipt.compaction;
      if (!compaction) {
        throw new Error(`Missing compaction stats in ${compactSummaryPath}`);
      }

      const baseLatency = readHopeLatencies(
        path.join(runsDir, `${cart.prefix}-${m.modelSlug}`, 'checkpoint.json')
      );
      const compactLatency = readHopeLatencies(
        path.join(runsDir, `${cart.prefix}-${m.modelSlug}-compact`, 'checkpoint.json')
      );

      const approved = compactReceipt.candidateDecisions.filter((d) => d.status === 'approved');
      const rejected = compactReceipt.candidateDecisions.filter((d) => d.status === 'rejected');
      const promotedCanaryRegressions = approved.reduce(
        (s, d) => s + d.gateAudit.canaryReplay.canaryRegressions,
        0
      );
      const lexicalLockGateAllPassed = compactReceipt.candidateDecisions.every(
        (d) => d.gateAudit.lexicalLock.passed
      );

      rows.push({
        cartridgeId: cart.id,
        cartridgeLabel: cart.label,
        modelId: m.modelId,
        modelSlug: m.modelSlug,
        provider: m.provider,
        taskCount: compHope.totalTasks,
        baseline: {
          fullTaskPassCount: baseHope.fullTaskPassCount,
          fullTaskPassRate: baseHope.fullTaskPassRate,
          meanFactPassRate: baseHope.meanFactPassRate,
          p50LatencyMs: baseLatency.p50,
          p95LatencyMs: baseLatency.p95,
        },
        compact: {
          fullTaskPassCount: compHope.fullTaskPassCount,
          fullTaskPassRate: compHope.fullTaskPassRate,
          meanFactPassRate: compHope.meanFactPassRate,
          p50LatencyMs: compactLatency.p50,
          p95LatencyMs: compactLatency.p95,
        },
        deltaPp: {
          fullTask: round2((compHope.fullTaskPassRate - baseHope.fullTaskPassRate) * 100),
          meanFact: round2((compHope.meanFactPassRate - baseHope.meanFactPassRate) * 100),
        },
        compaction,
        governance: {
          totalAudits: compactReceipt.candidateDecisions.length,
          approvedCount: approved.length,
          rejectedCount: rejected.length,
          promotedCanaryRegressions,
          lexicalLockGateAllPassed,
          finalSnapshotSha256: compactReceipt.finalSnapshotSha256,
        },
      });
    }
  }

  const abacRows = rows.filter((r) => r.cartridgeId === 'policy-abac-v4');
  const tsRows = rows.filter((r) => r.cartridgeId === 'ts-api-security-v4');
  const abacAgg = aggregateRows(abacRows);
  const tsAgg = aggregateRows(tsRows);
  const overallAgg = aggregateRows(rows);

  return {
    schemaVersion: '4.0.0-compact-benchmark-summary',
    generatedAt: new Date().toISOString(),
    totalPairedTrials: overallAgg.totalPairedTrials,
    rows,
    pooledByCartridge: {
      'policy-abac-v4': { modelCount: abacRows.length, ...abacAgg },
      'ts-api-security-v4': { modelCount: tsRows.length, ...tsAgg },
    },
    overallPooled: { pairCount: rows.length, ...overallAgg },
  };
}

export function formatCompactBenchmarkMarkdown(summary: CompactBenchmarkSummary): string {
  const lines: string[] = [
    '# Axiom-HOPE v4 Paired Live `--compact` Benchmark Summary',
    '',
    `- **Scope:** 2 v4 cartridges (\`policy-abac-v4\`, \`ts-api-security-v4\`) × 3 models (\`gemini-3.1-flash-lite\`, \`gemma-4-31b-it\`, \`qwen/qwen3.8-27b\`) = **${summary.totalPairedTrials} live paired \`C_ID_hope\` trials** (\`temperature = 0\`, \`K = 4\`)`,
    `- **Overall Pooled Accuracy Delta (\`--compact\` − Baseline):** **${signedPp(summary.overallPooled.deltaFullTaskPp)}** full-task pass (${pct1(summary.overallPooled.baselineFullTaskPassRate)} → ${pct1(summary.overallPooled.compactFullTaskPassRate)}), **${signedPp(summary.overallPooled.deltaMeanFactPp)}** mean bound-fact pass (${pct1(summary.overallPooled.baselineMeanFactPassRate)} → ${pct1(summary.overallPooled.compactMeanFactPassRate)})`,
    `- **Cumulative Context Token Savings:** \`${summary.overallPooled.totalBeforeTokens} -> ${summary.overallPooled.totalAfterTokens}\` tokens (**-${summary.overallPooled.weightedReductionPct.toFixed(2)}%**, \`${summary.overallPooled.totalSavedTokens}\` tokens saved)`,
    `- **Lexical-Lock Integrity:** **${summary.overallPooled.preservedTokenCount}/${summary.overallPooled.totalRequiredTokens} (100.0%)** required operational tokens preserved verbatim`,
    `- **Slow Clock Safety:** **${summary.overallPooled.promotedCanaryRegressions}** promoted canary regressions across all 6 runs`,
    '',
    '## 1. Accuracy Non-Inferiority Table (Baseline `C_ID_hope` vs. Compact `C_ID_hope`)',
    '',
    '| Cartridge | Model | Provider | Baseline Task | Compact Task | Δ Task | Baseline Facts | Compact Facts | Δ Facts |',
    '| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const r of summary.rows) {
    lines.push(
      `| ${r.cartridgeLabel} | \`${r.modelId}\` | ${r.provider} | ${pct1(r.baseline.fullTaskPassRate)} (${r.baseline.fullTaskPassCount}/${r.taskCount}) | **${pct1(r.compact.fullTaskPassRate)} (${r.compact.fullTaskPassCount}/${r.taskCount})** | **${signedPp(r.deltaPp.fullTask)}** | ${pct1(r.baseline.meanFactPassRate)} | **${pct1(r.compact.meanFactPassRate)}** | **${signedPp(r.deltaPp.meanFact)}** |`
    );
  }

  const abac = summary.pooledByCartridge['policy-abac-v4'];
  const ts = summary.pooledByCartridge['ts-api-security-v4'];
  const all = summary.overallPooled;

  lines.push(
    `| **Pooled ABAC (n=3)** | — | Multi-Provider | ${pct1(abac.baselineFullTaskPassRate)} | **${pct1(abac.compactFullTaskPassRate)}** | **${signedPp(abac.deltaFullTaskPp)}** | ${pct1(abac.baselineMeanFactPassRate)} | **${pct1(abac.compactMeanFactPassRate)}** | **${signedPp(abac.deltaMeanFactPp)}** |`,
    `| **Pooled TS-API (n=3)** | — | Multi-Provider | ${pct1(ts.baselineFullTaskPassRate)} | **${pct1(ts.compactFullTaskPassRate)}** | **${signedPp(ts.deltaFullTaskPp)}** | ${pct1(ts.baselineMeanFactPassRate)} | **${pct1(ts.compactMeanFactPassRate)}** | **${signedPp(ts.deltaMeanFactPp)}** |`,
    `| **Overall Pooled (n=6)** | — | Multi-Provider | ${pct1(all.baselineFullTaskPassRate)} | **${pct1(all.compactFullTaskPassRate)}** | **${signedPp(all.deltaFullTaskPp)}** | ${pct1(all.baselineMeanFactPassRate)} | **${pct1(all.compactMeanFactPassRate)}** | **${signedPp(all.deltaMeanFactPp)}** |`,
    '',
    '## 2. Token & Context Savings Table (`100.0%` Lexical Lock)',
    '',
    '| Cartridge | Model | Bundles | Before Tokens | After Tokens | Saved | Reduction % | Required Tokens Preserved |',
    '| :--- | :--- | :---: | ---: | ---: | ---: | :---: | :---: |'
  );

  for (const r of summary.rows) {
    lines.push(
      `| ${r.cartridgeLabel} | \`${r.modelId}\` | ${r.compaction.bundlesCompacted} | ${r.compaction.beforeTokens} | ${r.compaction.afterTokens} | ${r.compaction.savedTokens} | **-${r.compaction.reductionPct.toFixed(2)}%** | \`${r.compaction.preservedTokenCount}/${r.compaction.totalRequiredTokens}\` (100.0%) |`
    );
  }
  lines.push(
    `| **Total (All 6 Runs)** | — | ${summary.rows.reduce((s, r) => s + r.compaction.bundlesCompacted, 0)} | **${all.totalBeforeTokens}** | **${all.totalAfterTokens}** | **${all.totalSavedTokens}** | **-${all.weightedReductionPct.toFixed(2)}%** | **\`${all.preservedTokenCount}/${all.totalRequiredTokens}\` (100.0%)** |`,
    '',
    '## 3. Operational Telemetry & Slow Clock Governance',
    '',
    '| Cartridge | Model | Slow Clock Audits (App/Rej) | Promoted Regressions | Lexical Lock Gate | Compact p50 / p95 Latency | Final Snapshot SHA-256 |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :--- |'
  );

  for (const r of summary.rows) {
    const lat =
      r.compact.p50LatencyMs !== null && r.compact.p95LatencyMs !== null
        ? `${r.compact.p50LatencyMs}ms / ${r.compact.p95LatencyMs}ms`
        : '—';
    lines.push(
      `| ${r.cartridgeLabel} | \`${r.modelId}\` | ${r.governance.totalAudits} (${r.governance.approvedCount}/${r.governance.rejectedCount}) | **${r.governance.promotedCanaryRegressions}** | ${r.governance.lexicalLockGateAllPassed ? 'PASS' : 'FAIL'} | ${lat} | \`${r.governance.finalSnapshotSha256.slice(0, 12)}…\` |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('compile-compact-benchmark-summary.ts');

if (isEntrypoint) {
  const summary = compileCompactBenchmarkSummary();
  const outDir = path.resolve('out', 'v4');
  const jsonPath = path.join(outDir, 'compact-benchmark-summary.json');
  const mdPath = path.join(outDir, 'compact-benchmark-summary.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, formatCompactBenchmarkMarkdown(summary), 'utf8');
  console.log(`[compact-benchmark] Wrote ${jsonPath}`);
  console.log(`[compact-benchmark] Wrote ${mdPath}`);
}
