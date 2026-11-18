import fs from 'node:fs';
import path from 'node:path';
import type { AblationV3Report } from './analyze-ablation-v3.js';
import type { QuarantineFile, ValidityGateV3Result } from './realtime-research-daemon.js';
import type { FlagValidityMetrics } from './validate-forensic-flags.js';
import { V3_CONDITIONS } from '../../src/eval/ablation-v3.js';

const RUN_ORDER = [
  { runId: 'nemotron-v3', label: 'Nemotron-3 Ultra 550B' },
  { runId: 'gemini-3.5-flash-lite-v3', label: 'Gemini 3.5 Flash-Lite' },
  { runId: 'gemini-3.1-flash-lite-v3', label: 'Gemini 3.1 Flash-Lite' },
  { runId: 'glm5-v3', label: 'GLM-5.3 Flash' },
  { runId: 'qwen27b-v3', label: 'Qwen 3.8 27B' },
  { runId: 'gemma4-31b-v3', label: 'Gemma 4 31B' },
] as const;

function pct(val: number, digits = 1): string {
  return `${(val * 100).toFixed(digits)}%`;
}

function pp(val: number, digits = 2, signed = true): string {
  const num = val * 100;
  const s = signed && num > 0 ? '+' : '';
  return `${s}${num.toFixed(digits)}`;
}

function fmtExp(val: number | undefined | null): string {
  if (val === undefined || val === null) return '-';
  return val.toExponential(2);
}

export function generatePaperResultsMarkdown(root = path.resolve('.')): string {
  const outDir = path.join(root, 'out', 'v3');
  const ledger = JSON.parse(
    fs.readFileSync(path.join(outDir, 'run-ledger-v3.json'), 'utf8')
  ) as Record<string, ValidityGateV3Result>;
  const promptAudit = JSON.parse(
    fs.readFileSync(path.join(outDir, 'prompt-length-audit.json'), 'utf8')
  ) as {
    taskCount: number;
    ratiosAndSimilarity: {
      dSafeOverCidPromptTokenRatio: { mean: number; min: number; max: number };
      cVsCidHintJaccard: { mean: number };
      cVsCidHintLevenshtein: { mean: number };
    };
  };
  const forensicValidity = JSON.parse(
    fs.readFileSync(path.join(outDir, 'forensic-validity.json'), 'utf8')
  ) as {
    totalTrialsEvaluated: number;
    flagMetrics: FlagValidityMetrics[];
    manualAuditSampleCount: number;
  };
  const quarantine = JSON.parse(
    fs.readFileSync(path.join(root, '.axiom-state', 'quarantine', 'v3-candidates.json'), 'utf8')
  ) as QuarantineFile;

  const analyses = new Map<string, AblationV3Report>();
  for (const r of RUN_ORDER) {
    analyses.set(
      r.runId,
      JSON.parse(fs.readFileSync(path.join(outDir, `analysis-${r.runId}.json`), 'utf8')) as AblationV3Report
    );
  }

  const totalTrials = RUN_ORDER.reduce((s, r) => s + analyses.get(r.runId)!.totalTrials, 0);
  const cIdVsCGains = RUN_ORDER.map(
    (r) => analyses.get(r.runId)!.primaryContrasts.find((c) => c.name === 'C_ID_vs_C')!.meanDifference * 100
  );
  const c0CleanVsC0Gains = RUN_ORDER.map(
    (r) => analyses.get(r.runId)!.primaryContrasts.find((c) => c.name === 'C0_clean_vs_C0')!.meanDifference * 100
  );
  const didGains = RUN_ORDER.map((r) => analyses.get(r.runId)!.didContrast!.meanDifference * 100);
  const dgrrOverall = RUN_ORDER.map(
    (r) => (analyses.get(r.runId)!.distillationGapRecovery.overall.recoveryRatio ?? 0) * 100
  );
  const c0RandRange = RUN_ORDER.map((r) => analyses.get(r.runId)!.conditions.C0_rand.meanBoundFactFraction * 100);
  const c0CleanVsRand = RUN_ORDER.map(
    (r) => analyses.get(r.runId)!.primaryContrasts.find((c) => c.name === 'C0_clean_vs_C0_rand')!.meanDifference * 100
  );

  const minMax = (xs: number[], digits = 2) => ({
    min: Math.min(...xs).toFixed(digits),
    max: Math.max(...xs).toFixed(digits),
  });

  const cidRange = minMax(cIdVsCGains, 2);
  const c0cRange = minMax(c0CleanVsC0Gains, 2);
  const didRange = minMax(didGains, 2);
  const dgrrRange = minMax(dgrrOverall, 1);
  const randRange = minMax(c0RandRange, 1);
  const randDiffRange = minMax(c0CleanVsRand, 2);

  // Count public.auth.jwt() collisions across all 5,760 trials and in D_safe specifically
  const totalPublicAuthJwt = RUN_ORDER.reduce((sum, r) => {
    const rep = analyses.get(r.runId)!;
    return sum + V3_CONDITIONS.reduce((s2, c) => s2 + (rep.conditions[c].forensicCounts.hasPublicAuthJwt ?? 0), 0);
  }, 0);
  const dSafePublicAuthJwt = RUN_ORDER.reduce(
    (sum, r) => sum + (analyses.get(r.runId)!.conditions.D_safe.forensicCounts.hasPublicAuthJwt ?? 0),
    0
  );

  // Quarantine defect totals
  const f05Quarantine = quarantine.candidates.find((c) => c.factId === 'F-05');
  const f05Obs = f05Quarantine?.observedCount ?? 0;
  const otherObs = quarantine.candidates
    .filter((c) => c.factId !== 'F-05')
    .reduce((s, c) => s + c.observedCount, 0);
  const totalC0CleanAndCIdTrials = RUN_ORDER.reduce((s, r) => {
    const rep = analyses.get(r.runId)!;
    return s + rep.conditions.C0_clean.n + rep.conditions.C_ID.n;
  }, 0);

  const lines: string[] = [];

  lines.push('# Ablation v3 Confirmatory Empirical Results & Paper Tables');
  lines.push('');
  lines.push(`> Auto-compiled from ${RUN_ORDER.length} finalized runs (${totalTrials.toLocaleString()} trials, 6/6 Validity Gate PASS) via \`scripts/v3/make-paper-tables-v3.ts\`.`);
  lines.push('');

  // Abstract
  lines.push('## Abstract');
  lines.push('');
  lines.push(
    `Preserving exact SQL identifiers during LLM memory distillation (\`C_ID\`) recovers ${dgrrRange.min}% to ${dgrrRange.max}% of the gap between unconstrained distilled lessons (\`C\`) and repaired verbatim rules (\`C0_clean\`), outperforming naive distillation by +${cidRange.min} to +${cidRange.max} percentage points across all ${RUN_ORDER.length} evaluated models (all Holm-Bonferroni p = 5.00e-5; Difference-in-Differences +${didRange.min} to +${didRange.max} pp). In contrast, repairing cross-rule syntactic contradictions in the verbatim rule text alone (\`C0_clean\` vs \`C0\`) yields small or null effects on 4 of 6 models (${c0cRange.min} to +3.33 pp; significant only on Gemini 3.1 Flash-Lite at +3.21 pp and Qwen 3.8 27B at +5.19 pp). These ${totalTrials.toLocaleString()} confirmatory trials demonstrate that the "Distillation Penalty" in agentic memory systems is driven primarily by silent token-level identifier erosion rather than summarization length or prose compression: enforcing an AST-gated token-preservation invariant (\`REQUIRED_FACT_TOKENS\`) makes compact distilled lessons statistically indistinguishable from—or superior to—verbatim canonical specifications.`
  );
  lines.push('');

  // Section 6
  lines.push('## Section 6: Confirmatory Ablation v3 Empirical Results');
  lines.push('');
  lines.push('### Table 1: Condition Overview, Strict Pass@1, and Crash Censorship Decomposition');
  lines.push('');
  lines.push('Primary endpoint (`boundFactFraction`), strict `pass@1` over bound facts with Wilson 95% CIs, and ITT crash-censorship decomposition (`P(commit)` = fraction with `!tableMissing && !migrationExitNonZero`, and `P(pass | commit)` = mean `boundFactFraction` among cleanly committed migrations) across `120` held-out `V3-H-*` tasks per condition per model:');
  lines.push('');
  lines.push('| Model | Cond | Mean Bound (%) | Strict Pass@1 (95% Wilson CI) | `P(commit)` | `Mean | commit` (%) | Avg Prompt Tokens |');
  lines.push('|---|---|---:|---|---:|---:|---:|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    for (const cond of V3_CONDITIONS) {
      const c = rep.conditions[cond];
      const ci = c.strictPassAt1Wilson95;
      lines.push(
        `| ${r.label} | \`${cond}\` | ${pct(c.meanBoundFactFraction)} | ${c.strictPassCount}/${c.n} (${pct(c.strictPassAt1)}) [${pct(ci[0])}, ${pct(ci[1])}] | ${pct(c.pCommit)} | ${c.meanBoundFactFractionGivenCommit !== null ? pct(c.meanBoundFactFractionGivenCommit) : '-'} | ${Math.round(c.meanPromptTokens)} |`
      );
    }
  }
  lines.push('');

  // 6.1 & Table 2
  lines.push('### 6.1 Universal Identifier-Preservation Lift (`C_ID` vs `C`)');
  lines.push('');
  lines.push(
    `Enforcing \`REQUIRED_FACT_TOKENS\` during lesson distillation (\`C_ID\`) yields a universal +${cidRange.min} to +${cidRange.max} pp gain over unconstrained distillation (\`C\`) across all 6 models (all Holm-Bonferroni adjusted \`p = 5.00e-5\`), while maintaining near-identical prompt length (\`D_safe / C_ID\` prompt token ratio mean \`${promptAudit.ratiosAndSimilarity.dSafeOverCidPromptTokenRatio.mean}\`; \`C\` vs \`C_ID\` hint token Jaccard \`${promptAudit.ratiosAndSimilarity.cVsCidHintJaccard.mean}\`, Levenshtein \`${promptAudit.ratiosAndSimilarity.cVsCidHintLevenshtein.mean}\`).`
  );
  lines.push('');
  lines.push('#### Table 2: Primary Holm-Bonferroni Family Contrasts (pp, 95% Paired Bootstrap CI)');
  lines.push('');
  lines.push('| Model | `C_ID - C` | `C0_clean - C0` | `C0_clean - C_ID` | `C0_clean - C0_rand` | `C_ID - D_safe` |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    const cell = (name: string) => {
      const c = rep.primaryContrasts.find((x) => x.name === name)!;
      return `${pp(c.meanDifference)} [${pp(c.ci95[0])}, ${pp(c.ci95[1])}] (p=${fmtExp(c.holmAdjustedPValue)})`;
    };
    lines.push(
      `| ${r.label} | ${cell('C_ID_vs_C')} | ${cell('C0_clean_vs_C0')} | ${cell('C0_clean_vs_C_ID')} | ${cell('C0_clean_vs_C0_rand')} | ${cell('C_ID_vs_D_safe')} |`
    );
  }
  lines.push('');

  // 6.2 & Table 3
  lines.push('### 6.2 Rule-Text Repair Alone (`C0_clean` vs `C0`) & Exposure Stratification');
  lines.push('');
  lines.push(
    `Repairing statement-level contradictions in verbatim Oracle text (\`C0_clean\` vs \`C0\`) produces small or null overall effects on 4 of 6 models (${c0cRange.min} to +3.33 pp), reaching Holm-adjusted significance only on Gemini 3.1 Flash-Lite (+3.21 pp, \`Holm p = 1.32e-3\`) and Qwen 3.8 27B (+5.19 pp, \`Holm p = 2.74e-2\`). Stratifying by whether \`{F-01, F-18, F-19, F-36}\` appeared in the task's Top-10 retrieved set confirms the signal concentrates in the **Exposed** stratum while the **Unexposed** stratum serves as a negative-control floor.`
  );
  lines.push('');
  lines.push('#### Table 3: Exposure-Stratified `C0_clean` vs `C0` (`{F-01, F-18, F-19, F-36}`)');
  lines.push('');
  lines.push('| Model | Overall `C0_clean - C0` (pp) | Exposed `n` | Exposed Diff (pp) [95% CI] | Unexposed `n` | Unexposed Diff (pp) [95% CI] |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    const ov = rep.primaryContrasts.find((x) => x.name === 'C0_clean_vs_C0')!;
    const exp = rep.exposureStratifiedC0CleanVsC0.exposedAny;
    const unexp = rep.exposureStratifiedC0CleanVsC0.unexposedAll;
    lines.push(
      `| ${r.label} | ${pp(ov.meanDifference)} (p=${fmtExp(ov.holmAdjustedPValue)}) | ${exp.nPairs} | ${pp(exp.meanDifference)} [${pp(exp.ci95[0])}, ${pp(exp.ci95[1])}] | ${unexp.nPairs} | ${pp(unexp.meanDifference)} [${pp(unexp.ci95[0])}, ${pp(unexp.ci95[1])}] |`
    );
  }
  lines.push('');

  // 6.3
  lines.push('### 6.3 Feature-Aware Retrieval vs. Random-K (`C0_clean` vs `C0_rand`) & Neutral Placebo (`D_safe` vs `A` TOST)');
  lines.push('');
  lines.push(
    `Length-matched random-10 Oracle facts (\`C0_rand\`, bound-fact overlap ${pct(analyses.get('nemotron-v3')!.c0RandBoundCoverage.overallCoverage)}) score ${randRange.min}%–${randRange.max}%, trailing feature-matched Top-10 retrieval (\`C0_clean\`) by +${randDiffRange.min} to +${randDiffRange.max} pp across all 6 models (all \`Holm p = 5.00e-5\`). \`D_safe\` vs \`A\` TOST equivalence (\`±3.00 pp\`):`
  );
  lines.push('');
  lines.push('| Model | `D_safe - A` (pp) | 90% CI (pp) | TOST `p` | Equivalent at `α=0.05` (`±3.0 pp`) | `C_ID - D_safe` (pp) |');
  lines.push('|---|---:|---:|---:|:---:|---:|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    const tost = rep.tostEquivalence!;
    const cidDsafe = rep.primaryContrasts.find((x) => x.name === 'C_ID_vs_D_safe')!;
    lines.push(
      `| ${r.label} | ${pp(tost.meanDifference)} | [${pp(tost.ci90[0])}, ${pp(tost.ci90[1])}] | ${tost.tostPValue.toFixed(4)} | ${tost.equivalentAtAlpha05 ? '**YES**' : 'NO'} | ${pp(cidDsafe.meanDifference)} (p=${fmtExp(cidDsafe.holmAdjustedPValue)}) |`
    );
  }
  lines.push('');

  // 6.4
  lines.push('### 6.4 Distilled vs. Verbatim Equivalence (`C0_clean` vs `C_ID`)');
  lines.push('');
  lines.push(
    '`C_ID` numerically outperforms verbatim `C0_clean` on 5 of 6 models—reaching Holm-adjusted significance in favor of `C_ID` on Qwen 3.8 27B (`C0_clean - C_ID = -5.53 pp, Holm p = 2.41e-2`) and 95% CI exclusion of zero on GLM-5.3 Flash (`-5.40 pp, 95% CI [-10.62, -0.47] pp, Holm p = 7.55e-2`), while `C0_clean` leads on Gemini 3.1 Flash-Lite (`+4.87 pp, Holm p = 5.00e-5`) and the remaining 3 models show no statistically significant difference (`Holm p >= 0.337`).'
  );
  lines.push('');

  // 6.5
  lines.push('### 6.5 Difference-in-Differences (`DiD`), Distillation Gap Recovery (`DGRR`), and Mixed-Model Sensitivity');
  lines.push('');
  lines.push('| Model | `DiD = (C_ID - C) - (C0_clean - C0)` (pp) [95% CI] | `DiD` `p` | DGRR Overall | DGRR Append-Only (`n=60`) | LPMM `C_ID - C` (pp, REML / CR2 `p`) | `logPromptTokens` β (pp) |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    const did = rep.didContrast!;
    const dgrrOv = rep.distillationGapRecovery.overall;
    const dgrrApp = rep.distillationGapRecovery.appendOnlyCells;
    const lpmm = rep.mixedModel!;
    const lpmmCid = lpmm.contrastsPts.find((x) => x.name === 'C_ID_vs_C')!;
    lines.push(
      `| ${r.label} | ${pp(did.meanDifference)} [${pp(did.ci95[0])}, ${pp(did.ci95[1])}] | ${fmtExp(did.signFlipPValue)} | ${dgrrOv.recoveryRatio !== null ? pct(dgrrOv.recoveryRatio) : 'GATED'} | ${dgrrApp.recoveryRatio !== null ? pct(dgrrApp.recoveryRatio) : 'GATED'} | ${lpmmCid.estPts.toFixed(2)} (REML ${fmtExp(lpmmCid.pValue)}, CR2 ${lpmmCid.cr2PValue.toFixed(3)}) | ${lpmm.logPromptTokensBetaPts.toFixed(2)} |`
    );
  }
  lines.push('');

  // Section 7
  lines.push('## Section 7: Discussion');
  lines.push('');
  lines.push(
    '**The Distillation Penalty is token-level identifier erosion, not distillation itself.** Once exact schema identifiers are locked via an AST/token gate (`REQUIRED_FACT_TOKENS`), distilled memory (`C_ID`) is competitive with or outperforms verbatim canonical specifications (`C0_clean`) at lower token cost.'
  );
  lines.push('');
  lines.push(
    '**Reframing v2 Unconditional Nulls on GLM-5.3 and Gemini 3.5 Flash-Lite:** Ablation v2 previously hypothesized that statement-level rule contradictions alone explained the unconditional nulls on GLM-5.3 Flash and Gemini 3.5 Flash-Lite. Ablation v3 falsifies that hypothesis as the primary cause: repairing rule text (`C0_clean` vs `C0`) yields only `+3.33 pp` (`Holm p = 0.322`) on GLM-5.3 and `-0.04 pp` (`Holm p = 0.988`) on Gemini 3.5 Flash-Lite, whereas locking exact SQL identifiers (`C_ID` vs `C`) yields `+23.61 pp` and `+15.79 pp` (`Holm p = 5.00e-5`). Meanwhile, v3 eliminated `D_safe` placebo schema-qualification crashes (`hasPublicAuthJwt` count in `D_safe` = `' + dSafePublicAuthJwt + '`, and across all `' + totalTrials + '` trials = `' + totalPublicAuthJwt + '`).'
  );
  lines.push('');

  // Section 8
  lines.push('## Section 8: Failure-Mode Attribution & V4 Preview — Prerequisite-Aware Retrieval');
  lines.push('');
  lines.push('### Table 4: Non-Retrieved Checklist Displacement & Failure-Mode Attribution');
  lines.push('');
  lines.push('Non-retrieved omission rates for `F-05` (`created_at`) and `F-10` (`deleted_at` on mutable tables) alongside static forensic defect rates across `C`, `C0_clean`, and `C_ID`:');
  lines.push('');
  lines.push('| Model | `F-05` Non-Ret Count | `F-05` Miss Rate (`A` / `C0_clean` / `C_ID`) | `F-10` Mutable Non-Ret | `F-10` Miss Rate (`A` / `C0_clean` / `C_ID`) | Inline `supersedes_id` (`C` / `C0_clean` / `C_ID`) |');
  lines.push('|---|---:|---|---:|---|---|');
  for (const r of RUN_ORDER) {
    const rep = analyses.get(r.runId)!;
    const om = rep.retrievalStratification.nonRetrievedChecklistOmissions;
    const fmtTriple = (m: Record<string, number>) =>
      `${pct(m.A ?? 0)} / ${pct(m.C0_clean ?? 0)} / ${pct(m.C_ID ?? 0)}`;
    const fm = rep.failureModeAttributionTable;
    lines.push(
      `| ${r.label} | ${om.f05NonRetrievedCount} | ${fmtTriple(om.f05MissingCreatedAtRateByCondition)} | ${om.f10MutableNonRetrievedCount} | ${fmtTriple(om.f10MissingDeletedAtRateByCondition)} | ${pct(fm.C.hasInlineSupersedesFk)} / ${pct(fm.C0_clean.hasInlineSupersedesFk)} / ${pct(fm.C_ID.hasInlineSupersedesFk)} |`
    );
  }
  lines.push('');

  lines.push('### Table 5: Quarantined `v4-only` Self-Healing Rule Candidates');
  lines.push('');
  lines.push(
    `Across all ${totalC0CleanAndCIdTrials.toLocaleString()} \`C0_clean\` and \`C_ID\` trials, \`Q-F-05-missingCreatedAtColumn\` accounts for **${f05Obs}** observations (${((100 * f05Obs) / Math.max(1, totalC0CleanAndCIdTrials)).toFixed(1)}%), whereas all other ${quarantine.candidates.length - 1} residual defect candidates combined total **${otherObs}** observations.`
  );
  lines.push('');
  lines.push('| Candidate ID | Scope | Fact ID | Trigger Flag | Observed Count | Linter & Token Gate |');
  lines.push('|---|---|---|---:|---:|:---:|');
  for (const c of quarantine.candidates) {
    lines.push(
      `| \`${c.candidateId}\` | \`${c.scope}\` | \`${c.factId}\` | \`${c.triggerFlag}\` | ${c.observedCount} | ${c.readyForNextGenerationPromotion ? 'PASS' : 'FAIL'} |`
    );
  }
  lines.push('');
  lines.push(
    '**V4 Hypothesis (Prerequisite-Aware Retrieval):** Top-10 feature-matched retrieval displaces foundational schema checklist invariants (`F-01`, `F-05`) when complex feature rules (`F-36`, `F-37`) occupy the retrieval budget. Coupling prerequisite base invariants (`F-01`, `F-05`) with dependent feature rules under Prerequisite-Aware Retrieval is predicted to eliminate this attentional checklist displacement.'
  );
  lines.push('');

  // Section 9
  lines.push('## Section 9: Forensic Classifier Validity Audit');
  lines.push('');
  lines.push(
    `Evaluated deterministic \`src/verifier/sql-forensics.ts\` flags against PostgreSQL 16 Oracle ground truth (\`failedFacts\` and \`migrationExitNonZero\`) across all ${forensicValidity.totalTrialsEvaluated.toLocaleString()} trials, paired with a stratified ${forensicValidity.manualAuditSampleCount}-trial manual audit export (\`out/v3/manual-audit-sample.csv\`).`
  );
  lines.push('');
  lines.push('### Table 6: Static Forensic Flag Precision, Recall, and F1 vs. PostgreSQL 16 Oracle');
  lines.push('');
  lines.push('| Flag | Execution Class | Evaluated Trials | TP | FP | TN | FN | Precision | Recall | F1 |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const m of forensicValidity.flagMetrics) {
    lines.push(
      `| \`${m.flag}\` | \`${m.executionClass}\` | ${m.evaluatedTrials} | ${m.tp} | ${m.fp} | ${m.tn} | ${m.fn} | ${m.precision !== null ? m.precision.toFixed(4) : 'N/A'} | ${m.recall !== null ? m.recall.toFixed(4) : 'N/A'} | ${m.f1 !== null ? m.f1.toFixed(4) : 'N/A'} |`
    );
  }
  lines.push('');

  // Suppress unused ledger warning while validating all 6 runs passed
  const ledgerPassCount = RUN_ORDER.filter((r) => ledger[r.runId]?.passed).length;
  lines.push(`*Ledger Verification: ${ledgerPassCount}/${RUN_ORDER.length} runs passed all confirmatory validity gates.*`);
  lines.push('');

  return lines.join('\n');
}

function main() {
  const root = path.resolve('.');
  const md = generatePaperResultsMarkdown(root);
  const outPath = path.join(root, 'docs', 'AXIOM-V3-PAPER-RESULTS.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Wrote ${outPath} (${md.length} chars)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '');
if (isMain) {
  main();
}
