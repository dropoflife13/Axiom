# Ablation v2 Pre-Registered Analysis Plan

## Purpose

This document specifies the pre-registered experimental design, hypotheses, endpoints, statistical inference procedures, exploratory analyses, retrieval budget rule, data-handling policies, provenance requirements, and execution procedure for the Axiom Ablation v2 evaluation on PostgreSQL 16 schema migration generation.

## Design

### Splits and Bound-Fact Selection

The task benchmark comprises 200 PostgreSQL 16 migration tasks partitioned into three disjoint splits across eight structural feature cohorts (`C1`–`C8`):

- **Train (`T-001`..`T-040`, 40 tasks):** Used exclusively for Condition A baseline failure-rate calibration, bound-fact candidate identification, and memory lesson construction.
- **Dev (`D-001`..`D-040`, 40 tasks):** Used exclusively to select the retrieval budget $K$ and verify pipeline readiness prior to held-out evaluation.
- **Test (`H-001`..`H-120`, 120 tasks):** Held-out evaluation split on which all primary and secondary comparisons are conducted.

Bound-fact selection uses Train calibration only (`out/train-calibration.json`) under the committed `R2` rule (`scripts/propose-bound-facts.ts --rule R2`). Candidate bound facts are restricted to active Oracle-probed facts that are applicable to the task, satisfied by the task's validated golden SQL (200/200 golden migrations pass), have `applicableCount >= 3` on Train, and have Condition A Train `passRate <= 0.80` (`trainFailureRate >= 0.20`, comprising 18 candidate facts: 11 facts in $[0.10, 0.80]$ and 7 house-convention floor facts at $0.00$, aligning the bound-fact candidate pool directly with the retrieval ranking). Between three and five bound facts per task are assigned deterministically using a SHA-256 seed derived from the task identifier.

### Conditions

Each held-out Test task (`H-001`..`H-120`) is evaluated under six conditions at temperature `0` with one generation per `(task, condition)` pair (`720` total trials):

- **Condition A (Zero-Shot Baseline):** Task prompt, target table name, and task feature flags without house-convention hints or retrieved lessons.
- **Condition B (Full Static Spec Dump):** Task prompt augmented with all 34 active eligible confirmed/owner-adopted house-convention facts injected verbatim into the system prompt.
- **Condition C (Feature-Indexed Memory Retrieval — Distilled):** Task prompt augmented with up to $K = 10$ (`SQL_RETRIEVAL_TOP_K = 10`) applicable lessons retrieved from `.axiom-state/memory.json` by structural feature compatibility, Train failure-rate ranking, and historical utility score, using Advisor-distilled rules for facts that failed during Train calibration (29 lessons) and verbatim statements for facts with zero Train failures (2 lessons: `F-09`, `F-34`).
- **Condition C0 (Feature-Indexed Memory Retrieval — Verbatim Control):** Identical retrieval ranking and top-$K$ ($K = 10$) selection as Condition C, but substituting canonical verbatim fact statements for every retrieved lesson to isolate the effect of Advisor distillation from feature-indexed retrieval.
- **Condition D (Length-Matched Placebo Hints):** Task prompt augmented with generic PostgreSQL style tips outside the task's applicable fact set containing no house-convention parameters.
- **Condition E_B (Post-Check Reference on Condition B):** Deterministic post-check evaluation reusing Condition B's cached generation (`reusedFromCondition = 'B'`).

### Trial Definition

A single trial is defined as one Executor SQL generation followed by one deterministic PostgreSQL 16 Oracle container evaluation against an isolated database cloned from `template_axiom`. Because Condition `E_B` reuses Condition `B`'s generation rather than performing an independent model call, `E_B` is reported descriptively and is excluded from the inferential hypothesis-testing family.

## Hypotheses

Four pre-specified hypotheses compare Condition C against Conditions A, D, C0, and B on the 120 held-out Test tasks:

- **H1 (Memory Retrieval vs. Zero-Shot Baseline):** Condition C exceeds Condition A on held-out bound-fact compliance.
- **H2 (Memory Retrieval vs. Placebo Hints):** Condition C exceeds Condition D on held-out bound-fact compliance, demonstrating that gains arise from specific architectural conventions rather than generic SQL prompting.
- **H3 (Distilled vs. Verbatim Retrieved Lessons):** Condition C differs from Condition C0 on held-out bound-fact compliance, testing whether Advisor distillation alters compliance relative to verbatim fact text under identical retrieval.
- **H4 (Targeted Retrieval vs. Full Static Specification):** Condition C approaches Condition B on held-out bound-fact compliance while requiring lower mean prompt-token cost; the prompt-token cost ratio ($\text{meanPromptTokens}_C / \text{meanPromptTokens}_B$) is reported whatever the outcome.

## Metrics

- **Primary Endpoint — Mean Bound-Fact Fraction (`boundFactFraction`):** For each trial, the fraction of the task's pre-bound discriminating facts (`boundFacts`) that pass Oracle verification, averaged across the 120 held-out Test tasks per condition.
- **Secondary Endpoint — Strict Bound-Fact Pass@1 (`boundPassed`):** Binary indicator equal to `1` if and only if all bound facts for the task pass Oracle verification (and the target table exists), summarized as a proportion with Wilson 95% score confidence intervals.
- **Diagnostic Endpoint — Raw All-Fact Pass@1 (`passRaw`):** Binary indicator equal to `1` if and only if zero probed applicable facts fail on the trial, reported descriptively with Wilson 95% confidence intervals.

## Inference

All confirmatory comparisons pair trials by `taskId` across the $n = 120$ held-out Test tasks for the four contrasts `C_vs_A`, `C_vs_B`, `C_vs_C0`, and `C_vs_D`:

1. **Primary Endpoint Inference:**
   - **Paired Sign-Flip Randomization Test:** Two-sided p-value (`signFlipPValue`) computed using a deterministic xorshift32 pseudo-random number generator initialized with seed `20260101` over $N = 100{,}000$ iterations. In each iteration, the sign of each task's paired difference $d_i = y_{i,C} - y_{i,\text{baseline}}$ is flipped independently with probability `0.5`, and
     $$\text{signFlipPValue} = \frac{\#\{r : |\bar{d}^{(r)}| \ge |\bar{d}_{\text{obs}}|\} + 1}{N + 1}$$
     If all paired differences are identically zero, `signFlipPValue = 1`.
   - **Percentile Bootstrap 95% Confidence Interval (`ci95`):** Computed over `10000` paired bootstrap resamples of the task-level differences using the same seeded generator (`20260101`), taking the `2.5%` and `97.5%` empirical quantiles.
2. **Secondary Endpoint Inference:**
   - **Exact Two-Sided McNemar Test:** Computed on paired binary `boundPassed` outcomes from discordant counts $b$ (baseline pass, C fail) and $c$ (baseline fail, C pass) via the exact binomial tail $\min(1, 2 \sum_{i=0}^{\min(b,c)} \binom{b+c}{i} 2^{-(b+c)})$, with $p = 1$ when $b + c = 0$.
3. **Multiplicity Control:**
   - **Holm-Bonferroni Step-Down Procedure:** Applied across the four comparisons (`C_vs_A`, `C_vs_B`, `C_vs_C0`, `C_vs_D`) separately for the four primary sign-flip p-values (`holmPrimaryPValues`) and the four secondary exact McNemar p-values (`holmSecondaryPValues`).

## Exploratory Analyses

Exploratory analyses are reported without multiplicity adjustment and are kept strictly outside the Holm-Bonferroni confirmatory family:

- **Per-Cell Analysis (`perCellAnalysis`):** For each of the 8 `(tenant, append_only, ingestion)` structural feature cells, reports the paired mean difference (`C` vs. `A`, `B`, `C0`, `D`) on `boundFactFraction`, an equal-weight cell-stratified combined estimate (mean of the 8 cell means) with a within-cell bootstrap 95% confidence interval (`10,000` resamples, seed `20260101`), and an exact cell-level sign-flip randomization test ($2^m$ sign configurations across the $m \le 8$ populated cells) treating the 8 cell means as the exchangeability units.
- **Lesson Origin Split (`lessonOriginAnalysis`):** Partitions tasks in the `C` vs. `C0` comparison into (a) tasks where at least one retrieved lesson has `distilled` origin and (b) tasks where all retrieved lessons have `verbatim` origin. The all-verbatim subset serves as an internal negative control because Conditions C and C0 inject identical lesson text on those tasks.
- **Retrieval Overlap (`retrievalOverlap`):** Reports for Conditions C and C0 the distribution and mean fraction of a task's bound facts covered by the retrieved top-$K$ lesson set, alongside mean bound-fact compliance on full-overlap versus partial-overlap task subsets.
- **Per-Fact Retrieval Analysis (`perFactRetrievalAnalysis`):** Stratifies `(task, boundFact)` pairs in Conditions C and C0 against Condition A into retrieved bound facts versus non-retrieved bound facts, where non-retrieved bound-fact pairs serve as a negative control.

## Retrieval Budget

The retrieval budget $K$ is selected on the Dev split (`D-001`..`D-040`) prior to held-out Test execution as the smallest value in $\{6, 8, 10, 12, 15, 20\}$ for which the Dev mean retrievable bound-fact fraction, ranked by Train failure rate, reaches `0.80`. Under `R2`, the Dev K-sweep (`scripts/report-dev-k-sweep.ts`) yields mean retrievable bound-fact fractions of `0.5067` ($K = 6$), `0.6975` ($K = 8$), `0.8288` ($K = 10$, `18/40 = 45.0%` full coverage, vs. `0.4810` random-draw baseline), `0.9467` ($K = 12$), `0.9900` ($K = 15$), and `1.0000` ($K = 20$). Accordingly, $K = 10$ (`SQL_RETRIEVAL_TOP_K = 10`) is locked as the primary retrieval budget, and $K = 6$ is documented as the budget-matched secondary configuration.

## Data and Exclusions

- **Generation Failures (`generationStatus`):** Transient provider failures (HTTP `429`, `5xx`, network/request timeouts) are retried with backoff; if retries are exhausted, execution halts without recording the incomplete trial so that checkpoint resumption remains lossless. Deterministic generation failures—empty output (`generationStatus = 'empty'`), token-limit truncation (`finish_reason = 'length'`, `generationStatus = 'length'`), or content filtering / other non-stop completions (`generationStatus = 'other'`)—do not abort the run: the trial is recorded with `generatedSql = ""`, the Oracle evaluation skipped, `boundFactFraction = 0`, `boundPassed = false`, `failedFacts = []`, and the returned `finishReason`. Per-condition counts of `generationStatus` (`ok`, `empty`, `length`, `other`) are reported in the analysis output.
- **Missing Target Table (`tableMissing` / `F-13`):** If the target table `public.<table>` does not exist after executing the generated migration (`F-13` in `failedFacts`), `tableMissing` is set to `true`, `boundPassed` is set to `false`, and `boundFactFraction` is set to `0` so that vacuously unprobed column/index/trigger checks cannot be credited as passes.
- **Migration Execution Exit Status (`migrationExitNonZero`) and Sensitivity Analysis:** The Oracle executes every candidate migration with `\set ON_ERROR_STOP on` and records `migrationExitNonZero` on each trial as an operational covariate. An exploratory sensitivity analysis (`sensitivityAnalysis`, outside the Holm family) repeats the `C_vs_A`, `C_vs_B`, `C_vs_C0`, and `C_vs_D` primary and secondary comparisons excluding any task where either compared condition has `generationStatus !== 'ok'` or `migrationExitNonZero === true`.

## Provenance

Every recorded trial stores the following provenance fields:

- `provider`, `baseUrl`, `requestedModel`, `returnedModel`, `finishReason`, `generationStatus`
- `oracleCommit`, `factsSha256`, `oracleSha256`, `tasksSha256`, `memorySha256`, `gitCommit`
- `reusedFromCondition` (present and equal to `'B'` for cached `E_B` trials)

The offline analyzer verifies that `provider`, `baseUrl`, `requestedModel`, `returnedModel`, `oracleCommit`, `factsSha256`, and `finishReason` each take a single non-empty value across all trials and that `returnedModel === requestedModel` on every trial, setting `provenanced = false` and emitting explicit warnings if any discrepancy occurs.

## Procedure

The offline analysis script (`scripts/analyze-ablation-v2.ts`) is executed once after all `720` held-out trials (`120` tasks $\times$ `6` conditions) are complete and memory immutability (`memorySha256AtStart === memorySha256AtEnd`) is verified. No inferential comparisons between conditions are computed on partial checkpoint data.
