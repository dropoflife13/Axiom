import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');

// Input data files
const FACTS_PATH = path.join(ROOT, 'fixtures/task-v2/facts.json');
const TASKS_PATH = path.join(ROOT, 'fixtures/task-v2/tasks.json');
const LEDGER_PATH = path.join(ROOT, 'out/run-ledger.json');
const ITEMS_2346_PATH = path.join(ROOT, 'out/analysis-v3-prep/items-2-3-4-6.json');
const MIXED_MODEL_PATH = path.join(ROOT, 'out/analysis-v3-prep/item-7-mixed-model.json');

const VALID_RUN_IDS = [
  'nemotron-2',
  'gemma4-31b-full',
  'glm5-2',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-full',
  'qwen27b-2',
] as const;

type ValidRunId = (typeof VALID_RUN_IDS)[number];

const RUN_DISPLAY_NAMES: Record<ValidRunId, { name: string; model: string; provider: string }> = {
  'nemotron-2': {
    name: 'Nemotron-3-Ultra-550B',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    provider: 'NVIDIA NIM',
  },
  'gemma4-31b-full': {
    name: 'Gemma-4-31B-IT',
    model: 'google/gemma-4-31b-it',
    provider: 'Google AI Studio',
  },
  'glm5-2': {
    name: 'GLM-5.3-Flash',
    model: 'zhipu/glm-5.3-flash',
    provider: 'NVIDIA NIM',
  },
  'gemini-3.1-flash-lite': {
    name: 'Gemini-3.1-Flash-Lite',
    model: 'google/gemini-3.1-flash-lite',
    provider: 'Google AI Studio',
  },
  'gemini-flash-lite-full': {
    name: 'Gemini-3.5-Flash-Lite',
    model: 'google/gemini-3.5-flash-lite',
    provider: 'Google AI Studio',
  },
  'qwen27b-2': {
    name: 'Qwen-3.8-27B',
    model: 'qwen/qwen3.8-27b',
    provider: 'Groq',
  },
};

export function formatPct(val: number, decimals = 1): string {
  return (val * 100).toFixed(decimals) + '%';
}

export function formatPts(val: number, decimals = 2): string {
  const sign = val > 0 ? '+' : '';
  return sign + (val * 100).toFixed(decimals);
}

export function formatPtsRaw(val: number, decimals = 2): string {
  const sign = val > 0 ? '+' : '';
  return sign + val.toFixed(decimals);
}

export function formatPVal(p: number): string {
  if (p < 0.0001) {
    return p.toExponential(2).replace('e', ' × 10^');
  }
  return p.toFixed(4);
}

export function loadAllData() {
  const facts = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf8'));
  const tasks = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const items2346 = JSON.parse(fs.readFileSync(ITEMS_2346_PATH, 'utf8'));
  const mixedModel = JSON.parse(fs.readFileSync(MIXED_MODEL_PATH, 'utf8'));

  const analysis: Record<ValidRunId, any> = {} as any;
  for (const id of VALID_RUN_IDS) {
    const p = path.join(ROOT, `out/analysis-${id}.json`);
    analysis[id] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  return { facts, tasks, ledger, items2346, mixedModel, analysis };
}

export function generateFactsTable(factsData: any): string {
  const lines: string[] = [
    '| Fact ID | Canonical Invariant Statement | Applicability Condition | Status |',
    '| :--- | :--- | :--- | :--- |',
  ];

  for (const f of factsData.facts) {
    let appStr = 'Universal';
    if (f.applicability.never) {
      appStr = 'Never (`never: true`)';
    } else if (f.applicability.all && f.applicability.all.length > 0) {
      appStr = f.applicability.all.map((c: any) => `${c.flag} = ${c.equals}`).join(', ');
    }
    const cleanStmt = f.statement
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/\|/g, '\\|');
    lines.push(`| **${f.id}** | ${cleanStmt} | \`${appStr}\` | ${f.status} |`);
  }

  return lines.join('\n');
}

export function generateFeatureDefinitionsTable(): string {
  const lines: string[] = [
    '| Feature Flag | Type | Evaluated Semantics & Schema Requirements | Active Invariants Governed |',
    '| :--- | :---: | :--- | :--- |',
    '| `tenant` | Boolean | **Multi-Tenant Isolation:** Table requires `tenant_id uuid NOT NULL`, foreign key referencing `public.tenants(id) ON DELETE RESTRICT`, row-level security enabled and forced (`ENABLE/FORCE ROW LEVEL SECURITY`), and tenant-isolation RLS policies (`SELECT`, `INSERT`) checking `tenant_id` against `request.jwt.claims -> \'app_metadata\' ->> \'tenant_id\'`. | `F-02`, `F-05`, `F-23`, `F-24`, `F-25`, `F-26`, `F-30` |',
    '| `append_only` | Boolean | **Audit & Immutability:** When `true`, updates/deletes/truncates are strictly blocked via a `BEFORE UPDATE OR DELETE` trigger raising exception `P0001` (`\'Update/Delete operation rejected on audit log\'`), all table permissions are revoked from `PUBLIC, application, readonly_user`, and explicit `GRANT SELECT, INSERT` is given to `application` and `GRANT SELECT` to `readonly_user`; requires a self-referential `supersedes_id uuid NULL` column. When `false`, table is mutable with `updated_at timestamptz NOT NULL DEFAULT now()` maintained via a `BEFORE UPDATE` trigger, and `deleted_at timestamptz NULL` for soft deletes with partial unique indexing (`WHERE deleted_at IS NULL`). | `F-06`, `F-10`, `F-19`, `F-20`, `F-21`, `F-24`, `F-27`, `F-36` |',
    '| `ingestion` | Boolean | **Event & Streaming Ingestion:** Table represents a high-throughput event buffer requiring `received_at timestamptz NOT NULL DEFAULT now()` with a `BEFORE INSERT` trigger forcing `NEW.received_at := now()`, an `idempotency_key text NOT NULL` with a composite unique constraint/index, and payload storage (`payload jsonb NOT NULL DEFAULT \'{}\'::jsonb`). | `F-09`, `F-32`, `F-34`, `F-37` |',
    '| `status` | Secondary | State-machine entities requiring column check constraint `CHECK (status IN (...))`. | `F-12` |',
    '| `view` | Secondary | Tenant-scoped projection view created `WITH (security_invoker = true)` and explicit role `SELECT` grants. | `F-39` |',
    '| `sec_definer` | Secondary | Stored PL/pgSQL functions marked `SECURITY DEFINER` with explicit `SET search_path = \'\'`. | `F-31` |',
    '| `latest_per_key`| Secondary | Latest-record-per-key partial/window view or index partitioned by tenant and key. | `F-38` |',
  ];
  return lines.join('\n');
}

export function generatePrimaryBenchmarkTable(analysis: Record<ValidRunId, any>): string {
  const lines: string[] = [
    '| Run ID | Model Family | Cond | Prompt Treatment | Mean Bound % | Strict Pass@1 [Wilson 95% CI] | Prompt Tok | Total Tok | Crashes (Exit≠0) | Table Missing |',
    '| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  const condLabels: Record<string, string> = {
    A: 'Zero-Shot Baseline',
    D: 'Placebo Distractor',
    C: 'Failure-Prioritized Distilled (Top 10)',
    C0: 'Failure-Prioritized Verbatim (Top 10)',
    B: 'Static Reference (34 Active Rules)',
    E_B: 'Ablation Reference (Reused B)',
  };

  for (const runId of VALID_RUN_IDS) {
    const r = analysis[runId];
    const mInfo = RUN_DISPLAY_NAMES[runId];
    const conds = ['A', 'D', 'C', 'C0', 'B', 'E_B'];

    for (const c of conds) {
      const cd = r.analysis.conditions[c];
      const boundPct = formatPct(cd.meanBoundFactFraction);
      const passAt1 = formatPct(cd.strictBoundPassAt1);
      const wilson = `[${formatPct(cd.strictBoundPassAt1Wilson95[0])}, ${formatPct(cd.strictBoundPassAt1Wilson95[1])}]`;
      const pTok = cd.meanPromptTokens.toFixed(1);
      const tTok = cd.meanTotalTokens.toFixed(1);
      const crashes = cd.migrationExitNonZero ?? 0;
      const tm = cd.tableMissing ?? 0;

      lines.push(
        `| \`${runId}\` | ${mInfo.name} | **${c}** | ${condLabels[c]} | ${boundPct} | ${passAt1} ${wilson} | ${pTok} | ${tTok} | ${crashes} | ${tm} |`
      );
    }
  }

  return lines.join('\n');
}

export function generatePrimaryContrastsTable(analysis: Record<ValidRunId, any>): string {
  const lines: string[] = [
    '| Model Family | Contrast | Mean Diff (pp) | 95% Bootstrap CI | Sign-Flip p (raw) | Holm Primary p | Cell-Level Exact p |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: |',
  ];

  const contrasts = ['C_vs_A', 'C_vs_D', 'C_vs_C0', 'C_vs_B', 'B_vs_A'] as const;

  for (const runId of VALID_RUN_IDS) {
    const r = analysis[runId];
    const mInfo = RUN_DISPLAY_NAMES[runId];

    for (const cName of contrasts) {
      const cmp = r.analysis.comparisons[cName];
      const diff = formatPts(cmp.primary.meanDifference);
      const ci = `[${formatPts(cmp.primary.ci95[0])}, ${formatPts(cmp.primary.ci95[1])}]`;
      const signFlip = formatPVal(cmp.primary.signFlipPValue);
      const holm = r.analysis.holmPrimaryPValues[cName] != null ? formatPVal(r.analysis.holmPrimaryPValues[cName]) : '—';
      const cellP = r.analysis.holmCellPValues?.[cName] != null ? formatPVal(r.analysis.holmCellPValues[cName]) : '—';
      const cLabel = cName.replace(/_/g, ' ');

      lines.push(
        `| ${mInfo.name} | **${cLabel}** | ${diff} | ${ci} | ${signFlip} | ${holm} | ${cellP} |`
      );
    }
  }

  return lines.join('\n');
}

export function generateEightCellsTable(analysis: Record<ValidRunId, any>): string {
  const cellKeys = [
    'tenant=false,append_only=false,ingestion=false',
    'tenant=false,append_only=false,ingestion=true',
    'tenant=false,append_only=true,ingestion=false',
    'tenant=false,append_only=true,ingestion=true',
    'tenant=true,append_only=false,ingestion=false',
    'tenant=true,append_only=false,ingestion=true',
    'tenant=true,append_only=true,ingestion=false',
    'tenant=true,append_only=true,ingestion=true',
  ];

  const cellShort: Record<string, string> = {
    'tenant=false,append_only=false,ingestion=false': '000',
    'tenant=false,append_only=false,ingestion=true': '001',
    'tenant=false,append_only=true,ingestion=false': '010',
    'tenant=false,append_only=true,ingestion=true': '011',
    'tenant=true,append_only=false,ingestion=false': '100',
    'tenant=true,append_only=false,ingestion=true': '101',
    'tenant=true,append_only=true,ingestion=false': '110',
    'tenant=true,append_only=true,ingestion=true': '111',
  };

  const lines: string[] = [
    '| Cell (T A I) | Feature Description | Nemotron-550B C−A | Gemma-31B C−A | GLM-5.3 C−A | Gemini-3.1 C−A | Gemini-3.5 C−A | Qwen-27B C−A |',
    '| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const k of cellKeys) {
    const code = cellShort[k];
    const diffs = VALID_RUN_IDS.map((rId) => {
      const diff = analysis[rId].analysis.perCellAnalysis.comparisons.C_vs_A.perCell[k]?.meanDifference ?? 0;
      return formatPts(diff);
    });

    lines.push(`| **\`${code}\`** | \`${k}\` | ${diffs.join(' | ')} |`);
  }

  return lines.join('\n');
}

export function generateEightCellsC0MinusCTable(items2346: any): string {
  const cellCodes = ['000', '001', '010', '011', '100', '101', '110', '111'];
  const lines: string[] = [
    '| Cell (T A I) | Flag Semantics | Nemotron-550B C0−C [95% CI] | Gemma-31B C0−C [95% CI] | GLM-5.3 C0−C [95% CI] | Gemini-3.1 C0−C [95% CI] | Gemini-3.5 C0−C [95% CI] | Qwen-27B C0−C [95% CI] |',
    '| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const code of cellCodes) {
    const colStrs = VALID_RUN_IDS.map((rId) => {
      const cData = items2346.item3[rId]?.[code];
      if (!cData) return '—';
      return `${formatPtsRaw(cData.c0MinusCPts)} [${formatPtsRaw(cData.ci95Pts[0])}, ${formatPtsRaw(cData.ci95Pts[1])}]`;
    });
    lines.push(`| **\`${code}\`** | Cell \`${code}\` | ${colStrs.join(' | ')} |`);
  }

  return lines.join('\n');
}

export function generateCleanPairsTable(items2346: any): string {
  const lines: string[] = [
    '| Model Family | Contrast | Clean Pairs (n) | Clean Diff (pp) | 95% Bootstrap CI |',
    '| :--- | :--- | :---: | :---: | :---: |',
  ];

  const contrasts = ['D_vs_A', 'C_vs_A', 'C0_vs_A', 'B_vs_A', 'C0_vs_C', 'C_vs_D', 'C0_vs_B'] as const;

  for (const runId of VALID_RUN_IDS) {
    const mInfo = RUN_DISPLAY_NAMES[runId];
    const pc = items2346.item2[runId]?.pairwiseClean;
    if (!pc) continue;

    for (const c of contrasts) {
      const d = pc[c];
      if (!d) continue;
      const cLabel = c.replace(/_/g, ' ');
      const diff = formatPtsRaw(d.diffPts);
      const ci = `[${formatPtsRaw(d.ci95Pts[0])}, ${formatPtsRaw(d.ci95Pts[1])}]`;
      lines.push(`| ${mInfo.name} | **${cLabel}** | ${d.n} | ${diff} | ${ci} |`);
    }
  }

  return lines.join('\n');
}

export function generateMixedModelVarianceTable(mixedModel: any): string {
  const lines: string[] = [
    '| Model Family | Observations (N) | REML Deviance | `task` (k=120) SD / ICC% | `fact` (k=18) SD / ICC% | `cell` (k=8) SD / ICC% | `fact:cond` (k=90) SD / ICC% | Residual SD | Clustered Share |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const runId of VALID_RUN_IDS) {
    const mInfo = RUN_DISPLAY_NAMES[runId];
    const r = mixedModel.runs[runId];
    if (!r) continue;

    const taskRe = r.randomEffects.find((x: any) => x.name === 'task') ?? { stdDev: 0, iccPct: 0 };
    const factRe = r.randomEffects.find((x: any) => x.name === 'fact') ?? { stdDev: 0, iccPct: 0 };
    const cellRe = r.randomEffects.find((x: any) => x.name === 'cell') ?? { stdDev: 0, iccPct: 0 };
    const factCondRe =
      r.randomEffects.find((x: any) => x.name === 'fact:condition' || x.name === 'fact:cond') ?? {
        stdDev: 0,
        iccPct: 0,
      };

    const taskStr = `${taskRe.stdDev.toFixed(3)} / ${taskRe.iccPct.toFixed(2)}%`;
    const factStr = `${factRe.stdDev.toFixed(3)} / ${factRe.iccPct.toFixed(2)}%`;
    const cellStr = `${cellRe.stdDev.toFixed(3)} / ${cellRe.iccPct.toFixed(2)}%`;
    const factCondStr = `${factCondRe.stdDev.toFixed(3)} / ${factCondRe.iccPct.toFixed(2)}%`;

    lines.push(
      `| ${mInfo.name} | ${r.nObs} | ${r.remlDeviance.toFixed(2)} | ${taskStr} | ${factStr} | ${cellStr} | ${factCondStr} | ${r.residualStdDev.toFixed(4)} | ${r.totalClusteredSharePct.toFixed(2)}% |`
    );
  }

  return lines.join('\n');
}

export function generateMixedModelContrastsTable(mixedModel: any): string {
  const lines: string[] = [
    '| Model Family | Contrast | Est (pp) | REML SE | REML 95% CI | REML p | CR1 Task SE | CR1 95% CI | CR1 p |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const runId of VALID_RUN_IDS) {
    const mInfo = RUN_DISPLAY_NAMES[runId];
    const r = mixedModel.runs[runId];
    if (!r) continue;

    for (const c of r.contrastsPts) {
      const est = formatPtsRaw(c.estPts);
      const remlSe = c.sePts.toFixed(2);
      const remlCi = `[${formatPtsRaw(c.ci95Pts[0])}, ${formatPtsRaw(c.ci95Pts[1])}]`;
      const remlP = formatPVal(c.pValue);
      const cr1Se = c.cr1SePts.toFixed(2);
      const cr1Ci = `[${formatPtsRaw(c.cr1Ci95Pts[0])}, ${formatPtsRaw(c.cr1Ci95Pts[1])}]`;
      const cr1P = formatPVal(c.cr1PValue);

      lines.push(
        `| ${mInfo.name} | **${c.name}** | ${est} | ${remlSe} | ${remlCi} | ${remlP} | ${cr1Se} | ${cr1Ci} | ${cr1P} |`
      );
    }
  }

  return lines.join('\n');
}

export function generateRetrievalStratificationTable(items2346: any): string {
  const lines: string[] = [
    '| Model Family | Stratum | A % | D % | C % | C0 % | B % | D−A [95% CI] | C−A [95% CI] | C0−A [95% CI] | B−A [95% CI] |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const runId of VALID_RUN_IDS) {
    const mInfo = RUN_DISPLAY_NAMES[runId];
    const it2 = items2346.item2[runId];
    if (!it2) continue;

    const ret = it2.retrieved396;
    const nret = it2.nonRetrieved82;

    const rRates = ret.ratesPct;
    const rC = ret.contrasts;
    const nrRates = nret.ratesPct;
    const nrC = nret.contrasts;

    lines.push(
      `| ${mInfo.name} | **Retrieved (n=396)** | ${rRates.A.toFixed(1)}% | ${rRates.D.toFixed(1)}% | ${rRates.C.toFixed(1)}% | ${rRates.C0.toFixed(1)}% | ${rRates.B.toFixed(1)}% | ${formatPtsRaw(rC.D_minus_A.diffPts)} [${formatPtsRaw(rC.D_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(rC.D_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(rC.C_minus_A.diffPts)} [${formatPtsRaw(rC.C_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(rC.C_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(rC.C0_minus_A.diffPts)} [${formatPtsRaw(rC.C0_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(rC.C0_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(rC.B_minus_A.diffPts)} [${formatPtsRaw(rC.B_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(rC.B_minus_A.taskClusterBootstrapCi95Pts[1])}] |`
    );
    lines.push(
      `| | **Non-Retrieved (n=82)** | ${nrRates.A.toFixed(1)}% | ${nrRates.D.toFixed(1)}% | ${nrRates.C.toFixed(1)}% | ${nrRates.C0.toFixed(1)}% | ${nrRates.B.toFixed(1)}% | ${formatPtsRaw(nrC.D_minus_A.diffPts)} [${formatPtsRaw(nrC.D_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(nrC.D_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(nrC.C_minus_A.diffPts)} [${formatPtsRaw(nrC.C_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(nrC.C_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(nrC.C0_minus_A.diffPts)} [${formatPtsRaw(nrC.C0_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(nrC.C0_minus_A.taskClusterBootstrapCi95Pts[1])}] | ${formatPtsRaw(nrC.B_minus_A.diffPts)} [${formatPtsRaw(nrC.B_minus_A.taskClusterBootstrapCi95Pts[0])}, ${formatPtsRaw(nrC.B_minus_A.taskClusterBootstrapCi95Pts[1])}] |`
    );
  }

  return lines.join('\n');
}

export function generateRunLedgerTable(ledgerData: any): string {
  const lines: string[] = [
    '| Run ID | Requested Model | Provider | Trials | Matrix Scope | Inclusion Status | Exclusion Criteria & Governance Note |',
    '| :--- | :--- | :--- | :---: | :---: | :---: | :--- |',
  ];

  const runIds = Object.keys(ledgerData.runs).sort();

  for (const rId of runIds) {
    const r = ledgerData.runs[rId];
    const model = r.requestedModel ?? rId;
    const provider = r.provider ?? '—';
    const trials = r.trialCount ?? 0;
    const scope = r.matrixScope ?? '—';
    const status = r.inclusionStatus ?? '—';
    const crit = (r.exclusionCriteria && r.exclusionCriteria.length > 0)
      ? `\`${r.exclusionCriteria.join(', ')}\`: ${r.reason ?? ''}`
      : (r.reason ?? 'Eligible / Confirmatory primary matrix.');

    lines.push(
      `| \`${rId}\` | \`${model}\` | ${provider} | ${trials} | ${scope} | **${status}** | ${crit.replace(/\|/g, '\\|')} |`
    );
  }

  return lines.join('\n');
}

export function buildAllPlaceholders() {
  const { facts, tasks, ledger, items2346, mixedModel, analysis } = loadAllData();

  const dict: Record<string, string> = {};

  // Generated tables
  dict['table_facts'] = generateFactsTable(facts);
  dict['table_feature_definitions'] = generateFeatureDefinitionsTable();
  dict['table_primary_benchmark'] = generatePrimaryBenchmarkTable(analysis);
  dict['table_primary_contrasts'] = generatePrimaryContrastsTable(analysis);
  dict['table_eight_cells'] = generateEightCellsTable(analysis);
  dict['table_eight_cells_c0_c'] = generateEightCellsC0MinusCTable(items2346);
  dict['table_clean_pairs'] = generateCleanPairsTable(items2346);
  dict['table_mixed_model_variance'] = generateMixedModelVarianceTable(mixedModel);
  dict['table_mixed_model_contrasts'] = generateMixedModelContrastsTable(mixedModel);
  dict['table_retrieval_stratification'] = generateRetrievalStratificationTable(items2346);
  dict['table_run_ledger'] = generateRunLedgerTable(ledger);

  // High-level trial counts
  dict['total_trials'] = '4,320';
  dict['independent_generations'] = '3,600';
  dict['confirmatory_runs_count'] = '6';
  dict['held_out_tasks_count'] = '120';
  dict['factorial_cells_count'] = '8';
  dict['tasks_per_cell'] = '15';
  dict['active_facts_count'] = '34';
  dict['total_registry_facts_count'] = '39';

  // Per-model primary numbers
  for (const runId of VALID_RUN_IDS) {
    const a = analysis[runId];
    const prefix = runId.replace(/[-.]/g, '_');

    // Condition mean bounds
    dict[`${prefix}_a_mean`] = formatPct(a.analysis.conditions.A.meanBoundFactFraction);
    dict[`${prefix}_d_mean`] = formatPct(a.analysis.conditions.D.meanBoundFactFraction);
    dict[`${prefix}_c_mean`] = formatPct(a.analysis.conditions.C.meanBoundFactFraction);
    dict[`${prefix}_c0_mean`] = formatPct(a.analysis.conditions.C0.meanBoundFactFraction);
    dict[`${prefix}_b_mean`] = formatPct(a.analysis.conditions.B.meanBoundFactFraction);

    // Pass@1
    dict[`${prefix}_a_pass1`] = formatPct(a.analysis.conditions.A.strictBoundPassAt1);
    dict[`${prefix}_d_pass1`] = formatPct(a.analysis.conditions.D.strictBoundPassAt1);
    dict[`${prefix}_c_pass1`] = formatPct(a.analysis.conditions.C.strictBoundPassAt1);
    dict[`${prefix}_c0_pass1`] = formatPct(a.analysis.conditions.C0.strictBoundPassAt1);
    dict[`${prefix}_b_pass1`] = formatPct(a.analysis.conditions.B.strictBoundPassAt1);

    // Prompt tokens
    dict[`${prefix}_a_prompt_tok`] = a.analysis.conditions.A.meanPromptTokens.toFixed(1);
    dict[`${prefix}_c_prompt_tok`] = a.analysis.conditions.C.meanPromptTokens.toFixed(1);
    dict[`${prefix}_c0_prompt_tok`] = a.analysis.conditions.C0.meanPromptTokens.toFixed(1);
    dict[`${prefix}_b_prompt_tok`] = a.analysis.conditions.B.meanPromptTokens.toFixed(1);

    // Total tokens
    dict[`${prefix}_a_total_tok`] = a.analysis.conditions.A.meanTotalTokens.toFixed(1);
    dict[`${prefix}_c_total_tok`] = a.analysis.conditions.C.meanTotalTokens.toFixed(1);
    dict[`${prefix}_c0_total_tok`] = a.analysis.conditions.C0.meanTotalTokens.toFixed(1);
    dict[`${prefix}_b_total_tok`] = a.analysis.conditions.B.meanTotalTokens.toFixed(1);

    // Contrasts
    const cVsA = a.analysis.comparisons.C_vs_A;
    dict[`${prefix}_c_a_diff`] = formatPts(cVsA.primary.meanDifference);
    dict[`${prefix}_c_a_ci`] = `[${formatPts(cVsA.primary.ci95[0])}, ${formatPts(cVsA.primary.ci95[1])}]`;
    dict[`${prefix}_c_a_signflip_p`] = formatPVal(cVsA.primary.signFlipPValue);
    dict[`${prefix}_c_a_holm_p`] = formatPVal(a.analysis.holmPrimaryPValues.C_vs_A);

    const cVsD = a.analysis.comparisons.C_vs_D;
    dict[`${prefix}_c_d_diff`] = formatPts(cVsD.primary.meanDifference);
    dict[`${prefix}_c_d_ci`] = `[${formatPts(cVsD.primary.ci95[0])}, ${formatPts(cVsD.primary.ci95[1])}]`;
    dict[`${prefix}_c_d_signflip_p`] = formatPVal(cVsD.primary.signFlipPValue);

    const cVsC0 = a.analysis.comparisons.C_vs_C0;
    dict[`${prefix}_c_c0_diff`] = formatPts(cVsC0.primary.meanDifference);
    dict[`${prefix}_c_c0_ci`] = `[${formatPts(cVsC0.primary.ci95[0])}, ${formatPts(cVsC0.primary.ci95[1])}]`;
    dict[`${prefix}_c_c0_signflip_p`] = formatPVal(cVsC0.primary.signFlipPValue);
    dict[`${prefix}_c_c0_holm_p`] = formatPVal(a.analysis.holmPrimaryPValues.C_vs_C0);

    const c0VsC = -cVsC0.primary.meanDifference;
    dict[`${prefix}_c0_c_diff`] = formatPts(c0VsC);

    const bVsA = a.analysis.comparisons.B_vs_A;
    dict[`${prefix}_b_a_diff`] = formatPts(bVsA.primary.meanDifference);
    dict[`${prefix}_b_a_ci`] = `[${formatPts(bVsA.primary.ci95[0])}, ${formatPts(bVsA.primary.ci95[1])}]`;

    // Exploratory ratios & reductions
    const c0Mean = a.analysis.conditions.C0.meanBoundFactFraction;
    const bMean = a.analysis.conditions.B.meanBoundFactFraction;
    const c0BRatio = (c0Mean / bMean) * 100;
    dict[`${prefix}_c0_b_ratio`] = c0BRatio.toFixed(1) + '%';

    const cPromptTok = a.analysis.conditions.C.meanPromptTokens;
    const c0PromptTok = a.analysis.conditions.C0.meanPromptTokens;
    const bPromptTok = a.analysis.conditions.B.meanPromptTokens;
    const cPromptRed = ((bPromptTok - cPromptTok) / bPromptTok) * 100;
    const c0PromptRed = ((bPromptTok - c0PromptTok) / bPromptTok) * 100;
    dict[`${prefix}_c_prompt_reduction`] = cPromptRed.toFixed(1) + '%';
    dict[`${prefix}_c0_prompt_reduction`] = c0PromptRed.toFixed(1) + '%';

    const cTotalTok = a.analysis.conditions.C.meanTotalTokens;
    const c0TotalTok = a.analysis.conditions.C0.meanTotalTokens;
    const bTotalTok = a.analysis.conditions.B.meanTotalTokens;
    const cTotalRed = ((bTotalTok - cTotalTok) / bTotalTok) * 100;
    const c0TotalRed = ((bTotalTok - c0TotalTok) / bTotalTok) * 100;
    dict[`${prefix}_c_total_reduction`] = cTotalRed.toFixed(1) + '%';
    dict[`${prefix}_c0_total_reduction`] = c0TotalRed.toFixed(1) + '%';

    // ICC
    if (a.analysis.cellICC) {
      dict[`${prefix}_icc_bound`] = a.analysis.cellICC.boundFactFraction.icc.toFixed(4);
      dict[`${prefix}_icc_all`] = a.analysis.cellICC.allFactPassRate.icc.toFixed(4);
    }
  }

  // Summary ranges computed across the 6 confirmatory models
  const cVsADiffs = VALID_RUN_IDS.map((rId) => analysis[rId].analysis.comparisons.C_vs_A.primary.meanDifference * 100);
  const minCvsA = Math.min(...cVsADiffs);
  const maxCvsA = Math.max(...cVsADiffs);
  dict['summary_c_a_min_diff'] = formatPtsRaw(minCvsA);
  dict['summary_c_a_max_diff'] = formatPtsRaw(maxCvsA);

  const cleanC0VsCDiffs = VALID_RUN_IDS.map((rId) => items2346.item2[rId].pairwiseClean.C0_vs_C.diffPts);
  const minCleanC0VsC = Math.min(...cleanC0VsCDiffs);
  const maxCleanC0VsC = Math.max(...cleanC0VsCDiffs);
  dict['summary_clean_c0_c_min_diff'] = formatPtsRaw(minCleanC0VsC);
  dict['summary_clean_c0_c_max_diff'] = formatPtsRaw(maxCleanC0VsC);

  // Append-only cells (010, 011, 110, 111) C0 - C ranges across all 6 models
  const ao010: number[] = [];
  const ao111: number[] = [];
  const ao110Positive: number[] = [];
  const ao011: number[] = [];
  const ao010_110_111: number[] = [];

  for (const rId of VALID_RUN_IDS) {
    const v010 = items2346.item3[rId]?.['010']?.c0MinusCPts;
    if (typeof v010 === 'number') {
      ao010.push(v010);
      ao010_110_111.push(v010);
    }
    const v111 = items2346.item3[rId]?.['111']?.c0MinusCPts;
    if (typeof v111 === 'number') {
      ao111.push(v111);
      ao010_110_111.push(v111);
    }
    const v110 = items2346.item3[rId]?.['110']?.c0MinusCPts;
    if (typeof v110 === 'number') {
      if (v110 > 0) ao110Positive.push(v110);
      ao010_110_111.push(v110);
    }
    const v011 = items2346.item3[rId]?.['011']?.c0MinusCPts;
    if (typeof v011 === 'number') ao011.push(v011);
  }

  dict['summary_ao_010_min_diff'] = formatPtsRaw(Math.min(...ao010));
  dict['summary_ao_010_max_diff'] = formatPtsRaw(Math.max(...ao010));
  dict['summary_ao_111_min_diff'] = formatPtsRaw(Math.min(...ao111));
  dict['summary_ao_111_max_diff'] = formatPtsRaw(Math.max(...ao111));
  dict['summary_ao_110_5models_min_diff'] = formatPtsRaw(Math.min(...ao110Positive));
  dict['summary_ao_110_5models_max_diff'] = formatPtsRaw(Math.max(...ao110Positive));
  const qwen110 = items2346.item3['qwen27b-2']?.['110']?.c0MinusCPts ?? 0;
  dict['summary_ao_110_qwen_diff'] = formatPtsRaw(qwen110);
  dict['summary_ao_011_min_diff'] = formatPtsRaw(Math.min(...ao011));
  dict['summary_ao_011_max_diff'] = formatPtsRaw(Math.max(...ao011));

  dict['summary_ao_010_110_111_min_diff'] = formatPtsRaw(Math.min(...ao010_110_111));
  dict['summary_ao_010_110_111_max_diff'] = formatPtsRaw(Math.max(...ao010_110_111));
  dict['summary_append_only_c0_c_min_diff'] = formatPtsRaw(Math.min(...ao010_110_111));
  dict['summary_append_only_c0_c_max_diff'] = formatPtsRaw(Math.max(...ao010_110_111));

  const aoAll = [...ao010_110_111, ...ao011];
  dict['summary_ao_all_min_diff'] = formatPtsRaw(Math.min(...aoAll));
  dict['summary_ao_all_max_diff'] = formatPtsRaw(Math.max(...aoAll));

  // Significant C0 - C models (nemotron-2, gemma4-31b-full, gemini-3.1-flash-lite, qwen27b-2)
  const sigC0VsCDiffs = ['nemotron-2', 'gemma4-31b-full', 'gemini-3.1-flash-lite', 'qwen27b-2'].map(
    (rId) => -analysis[rId].analysis.comparisons.C_vs_C0.primary.meanDifference * 100
  );
  dict['summary_sig_c0_c_min_diff'] = formatPtsRaw(Math.min(...sigC0VsCDiffs));
  dict['summary_sig_c0_c_max_diff'] = formatPtsRaw(Math.max(...sigC0VsCDiffs));

  const c0BRatios = VALID_RUN_IDS.map(
    (rId) => (analysis[rId].analysis.conditions.C0.meanBoundFactFraction / analysis[rId].analysis.conditions.B.meanBoundFactFraction) * 100
  );
  dict['summary_c0_b_min_ratio'] = Math.min(...c0BRatios).toFixed(1) + '%';
  dict['summary_c0_b_max_ratio'] = Math.max(...c0BRatios).toFixed(1) + '%';

  const c0PromptReds = VALID_RUN_IDS.map((rId) => {
    const c0P = analysis[rId].analysis.conditions.C0.meanPromptTokens;
    const bP = analysis[rId].analysis.conditions.B.meanPromptTokens;
    return ((bP - c0P) / bP) * 100;
  });
  dict['summary_c0_prompt_min_reduction'] = Math.min(...c0PromptReds).toFixed(1) + '%';
  dict['summary_c0_prompt_max_reduction'] = Math.max(...c0PromptReds).toFixed(1) + '%';

  const c0TotalReds = VALID_RUN_IDS.map((rId) => {
    const c0T = analysis[rId].analysis.conditions.C0.meanTotalTokens;
    const bT = analysis[rId].analysis.conditions.B.meanTotalTokens;
    return ((bT - c0T) / bT) * 100;
  });
  dict['summary_c0_total_min_reduction'] = Math.min(...c0TotalReds).toFixed(1) + '%';
  dict['summary_c0_total_max_reduction'] = Math.max(...c0TotalReds).toFixed(1) + '%';

  return dict;
}

export function compilePaper(templatePath: string, outputPath: string) {
  const dict = buildAllPlaceholders();
  let content = fs.readFileSync(templatePath, 'utf8');

  // Replace all {{key}}
  const missingKeys: string[] = [];

  content = content.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key) => {
    if (key in dict) {
      return dict[key];
    }
    missingKeys.push(key);
    return match;
  });

  if (missingKeys.length > 0) {
    throw new Error(
      `Failed to compile paper: ${missingKeys.length} unresolved placeholder(s):\n  ${missingKeys.join('\n  ')}`
    );
  }

  // Double check that no other unresolved {{...}} exists
  const residualMatches = content.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g);
  if (residualMatches && residualMatches.length > 0) {
    throw new Error(`Residual placeholders found after replacement: ${residualMatches.join(', ')}`);
  }

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`Successfully compiled ${outputPath} with ${Object.keys(dict).length} resolved placeholders.`);
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('make-paper-tables.ts')) {
  const templatePath = path.join(ROOT, 'docs/AXIOM-PAPER.template.md');
  const outputPath = path.join(ROOT, 'docs/AXIOM-PAPER.md');
  compilePaper(templatePath, outputPath);
}
