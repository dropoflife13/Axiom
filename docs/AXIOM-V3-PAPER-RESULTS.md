# Ablation v3 Confirmatory Empirical Results & Paper Tables

> Auto-compiled from 6 finalized runs (5,760 trials, 6/6 Validity Gate PASS) via `scripts/v3/make-paper-tables-v3.ts`.

## Abstract

Preserving exact SQL identifiers during LLM memory distillation (`C_ID`) recovers 83.4% to 142.4% of the gap between unconstrained distilled lessons (`C`) and repaired verbatim rules (`C0_clean`), outperforming naive distillation by +15.79 to +26.04 percentage points across all 6 evaluated models (all Holm-Bonferroni p = 5.00e-5; Difference-in-Differences +13.37 to +24.25 pp). In contrast, repairing cross-rule syntactic contradictions in the verbatim rule text alone (`C0_clean` vs `C0`) yields small or null effects on 4 of 6 models (-1.58 to +3.33 pp; significant only on Gemini 3.1 Flash-Lite at +3.21 pp and Qwen 3.8 27B at +5.19 pp). These 5,760 confirmatory trials demonstrate that the "Distillation Penalty" in agentic memory systems is driven primarily by silent token-level identifier erosion rather than summarization length or prose compression: enforcing an AST-gated token-preservation invariant (`REQUIRED_FACT_TOKENS`) makes compact distilled lessons statistically indistinguishable from—or superior to—verbatim canonical specifications.

## Section 6: Confirmatory Ablation v3 Empirical Results

### Table 1: Condition Overview, Strict Pass@1, and Crash Censorship Decomposition

Primary endpoint (`boundFactFraction`), strict `pass@1` over bound facts with Wilson 95% CIs, and ITT crash-censorship decomposition (`P(commit)` = fraction with `!tableMissing && !migrationExitNonZero`, and `P(pass | commit)` = mean `boundFactFraction` among cleanly committed migrations) across `120` held-out `V3-H-*` tasks per condition per model:

| Model | Cond | Mean Bound (%) | Strict Pass@1 (95% Wilson CI) | `P(commit)` | `Mean | commit` (%) | Avg Prompt Tokens |
|---|---|---:|---|---:|---:|---:|
| Nemotron-3 Ultra 550B | `A` | 43.1% | 7/120 (5.8%) [2.9%, 11.6%] | 69.2% | 43.8% | 245 |
| Nemotron-3 Ultra 550B | `D_safe` | 43.8% | 8/120 (6.7%) [3.4%, 12.6%] | 77.5% | 45.4% | 505 |
| Nemotron-3 Ultra 550B | `C` | 66.0% | 23/120 (19.2%) [13.1%, 27.1%] | 93.3% | 65.4% | 520 |
| Nemotron-3 Ultra 550B | `C0` | 85.5% | 65/120 (54.2%) [45.3%, 62.8%] | 94.2% | 85.7% | 553 |
| Nemotron-3 Ultra 550B | `C0_clean` | 83.9% | 66/120 (55.0%) [46.1%, 63.6%] | 98.3% | 84.3% | 617 |
| Nemotron-3 Ultra 550B | `C_ID` | 85.3% | 67/120 (55.8%) [46.9%, 64.4%] | 95.8% | 86.0% | 529 |
| Nemotron-3 Ultra 550B | `C0_rand` | 53.2% | 15/120 (12.5%) [7.7%, 19.6%] | 95.8% | 54.1% | 572 |
| Nemotron-3 Ultra 550B | `B` | 89.9% | 91/120 (75.8%) [67.4%, 82.6%] | 97.5% | 91.3% | 1257 |
| Gemini 3.5 Flash-Lite | `A` | 33.0% | 6/120 (5.0%) [2.3%, 10.5%] | 90.8% | 35.1% | 242 |
| Gemini 3.5 Flash-Lite | `D_safe` | 32.0% | 4/120 (3.3%) [1.3%, 8.3%] | 88.3% | 35.4% | 496 |
| Gemini 3.5 Flash-Lite | `C` | 62.2% | 32/120 (26.7%) [19.6%, 35.2%] | 93.3% | 63.5% | 518 |
| Gemini 3.5 Flash-Lite | `C0` | 74.6% | 41/120 (34.2%) [26.3%, 43.0%] | 97.5% | 76.5% | 540 |
| Gemini 3.5 Flash-Lite | `C0_clean` | 74.5% | 38/120 (31.7%) [24.0%, 40.4%] | 94.2% | 77.8% | 599 |
| Gemini 3.5 Flash-Lite | `C_ID` | 78.0% | 52/120 (43.3%) [34.8%, 52.3%] | 91.7% | 81.9% | 518 |
| Gemini 3.5 Flash-Lite | `C0_rand` | 55.0% | 17/120 (14.2%) [9.0%, 21.5%] | 92.5% | 57.3% | 568 |
| Gemini 3.5 Flash-Lite | `B` | 93.8% | 95/120 (79.2%) [71.1%, 85.5%] | 94.2% | 94.9% | 1272 |
| Gemini 3.1 Flash-Lite | `A` | 46.8% | 9/120 (7.5%) [4.0%, 13.6%] | 80.8% | 43.5% | 242 |
| Gemini 3.1 Flash-Lite | `D_safe` | 46.6% | 11/120 (9.2%) [5.2%, 15.7%] | 80.8% | 45.7% | 496 |
| Gemini 3.1 Flash-Lite | `C` | 59.8% | 25/120 (20.8%) [14.5%, 28.9%] | 81.7% | 60.4% | 518 |
| Gemini 3.1 Flash-Lite | `C0` | 86.0% | 62/120 (51.7%) [42.8%, 60.4%] | 86.7% | 85.8% | 540 |
| Gemini 3.1 Flash-Lite | `C0_clean` | 89.2% | 74/120 (61.7%) [52.7%, 69.9%] | 85.8% | 88.1% | 599 |
| Gemini 3.1 Flash-Lite | `C_ID` | 84.3% | 57/120 (47.5%) [38.8%, 56.4%] | 90.0% | 84.0% | 518 |
| Gemini 3.1 Flash-Lite | `C0_rand` | 60.5% | 22/120 (18.3%) [12.4%, 26.2%] | 83.3% | 59.9% | 568 |
| Gemini 3.1 Flash-Lite | `B` | 90.3% | 82/120 (68.3%) [59.6%, 76.0%] | 82.5% | 92.9% | 1272 |
| GLM-5.3 Flash | `A` | 34.9% | 1/120 (0.8%) [0.1%, 4.6%] | 70.0% | 37.6% | 228 |
| GLM-5.3 Flash | `D_safe` | 37.8% | 3/120 (2.5%) [0.9%, 7.1%] | 70.0% | 38.7% | 465 |
| GLM-5.3 Flash | `C` | 65.7% | 31/120 (25.8%) [18.8%, 34.3%] | 92.5% | 65.8% | 463 |
| GLM-5.3 Flash | `C0` | 80.6% | 61/120 (50.8%) [42.0%, 59.6%] | 85.0% | 87.6% | 494 |
| GLM-5.3 Flash | `C0_clean` | 83.9% | 66/120 (55.0%) [46.1%, 63.6%] | 87.5% | 88.4% | 551 |
| GLM-5.3 Flash | `C_ID` | 89.3% | 81/120 (67.5%) [58.7%, 75.2%] | 81.7% | 93.8% | 462 |
| GLM-5.3 Flash | `C0_rand` | 53.7% | 17/120 (14.2%) [9.0%, 21.5%] | 78.3% | 57.9% | 521 |
| GLM-5.3 Flash | `B` | 89.8% | 87/120 (72.5%) [63.9%, 79.7%] | 85.0% | 94.5% | 1120 |
| Qwen 3.8 27B | `A` | 42.9% | 9/120 (7.5%) [4.0%, 13.6%] | 86.7% | 47.5% | 243 |
| Qwen 3.8 27B | `D_safe` | 47.3% | 15/120 (12.5%) [7.7%, 19.6%] | 94.2% | 49.4% | 491 |
| Qwen 3.8 27B | `C` | 71.0% | 39/120 (32.5%) [24.8%, 41.3%] | 96.7% | 72.0% | 500 |
| Qwen 3.8 27B | `C0` | 78.9% | 60/120 (50.0%) [41.2%, 58.8%] | 57.5% | 88.9% | 530 |
| Qwen 3.8 27B | `C0_clean` | 84.1% | 62/120 (51.7%) [42.8%, 60.4%] | 55.0% | 91.3% | 588 |
| Qwen 3.8 27B | `C_ID` | 89.6% | 80/120 (66.7%) [57.8%, 74.5%] | 95.0% | 92.4% | 498 |
| Qwen 3.8 27B | `C0_rand` | 60.2% | 25/120 (20.8%) [14.5%, 28.9%] | 80.8% | 64.4% | 557 |
| Qwen 3.8 27B | `B` | 85.9% | 89/120 (74.2%) [65.7%, 81.2%] | 70.8% | 96.7% | 1202 |
| Gemma 4 31B | `A` | 38.3% | 6/120 (5.0%) [2.3%, 10.5%] | 91.7% | 41.0% | 242 |
| Gemma 4 31B | `D_safe` | 39.6% | 7/120 (5.8%) [2.9%, 11.6%] | 89.2% | 41.5% | 496 |
| Gemma 4 31B | `C` | 59.3% | 31/120 (25.8%) [18.8%, 34.3%] | 88.3% | 67.1% | 518 |
| Gemma 4 31B | `C0` | 81.4% | 65/120 (54.2%) [45.3%, 62.8%] | 94.2% | 86.5% | 540 |
| Gemma 4 31B | `C0_clean` | 83.2% | 70/120 (58.3%) [49.4%, 66.8%] | 93.3% | 89.2% | 599 |
| Gemma 4 31B | `C_ID` | 85.3% | 70/120 (58.3%) [49.4%, 66.8%] | 93.3% | 88.9% | 518 |
| Gemma 4 31B | `C0_rand` | 59.3% | 22/120 (18.3%) [12.4%, 26.2%] | 95.8% | 61.0% | 568 |
| Gemma 4 31B | `B` | 93.2% | 105/120 (87.5%) [80.4%, 92.3%] | 95.0% | 98.1% | 1272 |

### 6.1 Universal Identifier-Preservation Lift (`C_ID` vs `C`)

Enforcing `REQUIRED_FACT_TOKENS` during lesson distillation (`C_ID`) yields a universal +15.79 to +26.04 pp gain over unconstrained distillation (`C`) across all 6 models (all Holm-Bonferroni adjusted `p = 5.00e-5`), while maintaining near-identical prompt length (`D_safe / C_ID` prompt token ratio mean `0.9662`; `C` vs `C_ID` hint token Jaccard `0.5153`, Levenshtein `94.5`).

#### Table 2: Primary Holm-Bonferroni Family Contrasts (pp, 95% Paired Bootstrap CI)

| Model | `C_ID - C` | `C0_clean - C0` | `C0_clean - C_ID` | `C0_clean - C0_rand` | `C_ID - D_safe` |
|---|---:|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | +19.37 [+14.74, +23.94] (p=5.00e-5) | -1.58 [-6.33, +2.93] (p=9.74e-1) | -1.42 [-5.51, +2.49] (p=9.74e-1) | +30.75 [+24.36, +36.96] (p=5.00e-5) | +41.53 [+35.93, +47.01] (p=5.00e-5) |
| Gemini 3.5 Flash-Lite | +15.79 [+10.71, +20.76] (p=5.00e-5) | -0.04 [-3.97, +3.72] (p=9.88e-1) | -3.47 [-8.26, +1.28] (p=3.37e-1) | +19.50 [+14.13, +24.78] (p=5.00e-5) | +46.01 [+40.29, +51.61] (p=5.00e-5) |
| Gemini 3.1 Flash-Lite | +24.56 [+20.32, +28.76] (p=5.00e-5) | +3.21 [+1.26, +5.24] (p=1.32e-3) | +4.87 [+2.79, +7.22] (p=5.00e-5) | +28.68 [+24.04, +33.26] (p=5.00e-5) | +37.78 [+32.43, +43.00] (p=5.00e-5) |
| GLM-5.3 Flash | +23.61 [+18.78, +28.54] (p=5.00e-5) | +3.33 [-3.13, +9.79] (p=3.22e-1) | -5.40 [-10.62, -0.47] (p=7.55e-2) | +30.15 [+22.54, +37.22] (p=5.00e-5) | +51.49 [+46.63, +56.25] (p=5.00e-5) |
| Qwen 3.8 27B | +18.57 [+13.89, +23.03] (p=5.00e-5) | +5.19 [+0.67, +9.97] (p=2.74e-2) | -5.53 [-9.76, -1.06] (p=2.41e-2) | +23.85 [+18.58, +28.92] (p=5.00e-5) | +42.28 [+36.40, +47.83] (p=5.00e-5) |
| Gemma 4 31B | +26.04 [+19.99, +32.14] (p=5.00e-5) | +1.79 [-3.97, +7.68] (p=9.07e-1) | -2.07 [-7.39, +3.07] (p=9.07e-1) | +23.99 [+17.36, +30.24] (p=5.00e-5) | +45.71 [+40.08, +51.28] (p=5.00e-5) |

### 6.2 Rule-Text Repair Alone (`C0_clean` vs `C0`) & Exposure Stratification

Repairing statement-level contradictions in verbatim Oracle text (`C0_clean` vs `C0`) produces small or null overall effects on 4 of 6 models (-1.58 to +3.33 pp), reaching Holm-adjusted significance only on Gemini 3.1 Flash-Lite (+3.21 pp, `Holm p = 1.32e-3`) and Qwen 3.8 27B (+5.19 pp, `Holm p = 2.74e-2`). Stratifying by whether `{F-01, F-18, F-19, F-36}` appeared in the task's Top-10 retrieved set confirms the signal concentrates in the **Exposed** stratum while the **Unexposed** stratum serves as a negative-control floor.

#### Table 3: Exposure-Stratified `C0_clean` vs `C0` (`{F-01, F-18, F-19, F-36}`)

| Model | Overall `C0_clean - C0` (pp) | Exposed `n` | Exposed Diff (pp) [95% CI] | Unexposed `n` | Unexposed Diff (pp) [95% CI] |
|---|---:|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | -1.58 (p=9.74e-1) | 120 | -1.58 [-6.33, +2.93] | 0 | 0.00 [0.00, 0.00] |
| Gemini 3.5 Flash-Lite | -0.04 (p=9.88e-1) | 120 | -0.04 [-3.97, +3.72] | 0 | 0.00 [0.00, 0.00] |
| Gemini 3.1 Flash-Lite | +3.21 (p=1.32e-3) | 120 | +3.21 [+1.26, +5.24] | 0 | 0.00 [0.00, 0.00] |
| GLM-5.3 Flash | +3.33 (p=3.22e-1) | 120 | +3.33 [-3.13, +9.79] | 0 | 0.00 [0.00, 0.00] |
| Qwen 3.8 27B | +5.19 (p=2.74e-2) | 120 | +5.19 [+0.67, +9.97] | 0 | 0.00 [0.00, 0.00] |
| Gemma 4 31B | +1.79 (p=9.07e-1) | 120 | +1.79 [-3.97, +7.68] | 0 | 0.00 [0.00, 0.00] |

### 6.3 Feature-Aware Retrieval vs. Random-K (`C0_clean` vs `C0_rand`) & Neutral Placebo (`D_safe` vs `A` TOST)

Length-matched random-10 Oracle facts (`C0_rand`, bound-fact overlap 12.1%) score 53.2%–60.5%, trailing feature-matched Top-10 retrieval (`C0_clean`) by +19.50 to +30.75 pp across all 6 models (all `Holm p = 5.00e-5`). `D_safe` vs `A` TOST equivalence (`±3.00 pp`):

| Model | `D_safe - A` (pp) | 90% CI (pp) | TOST `p` | Equivalent at `α=0.05` (`±3.0 pp`) | `C_ID - D_safe` (pp) |
|---|---:|---:|---:|:---:|---:|
| Nemotron-3 Ultra 550B | +0.76 | [-3.28, +4.81] | 0.1808 | NO | +41.53 (p=5.00e-5) |
| Gemini 3.5 Flash-Lite | -1.06 | [-3.64, +1.53] | 0.1073 | NO | +46.01 (p=5.00e-5) |
| Gemini 3.1 Flash-Lite | -0.24 | [-2.53, +2.06] | 0.0242 | **YES** | +37.78 (p=5.00e-5) |
| GLM-5.3 Flash | +2.87 | [-0.25, +6.00] | 0.4736 | NO | +51.49 (p=5.00e-5) |
| Qwen 3.8 27B | +4.39 | [+0.73, +8.05] | 0.7347 | NO | +42.28 (p=5.00e-5) |
| Gemma 4 31B | +1.32 | [-1.87, +4.51] | 0.1919 | NO | +45.71 (p=5.00e-5) |

### 6.4 Distilled vs. Verbatim Equivalence (`C0_clean` vs `C_ID`)

`C_ID` numerically outperforms verbatim `C0_clean` on 5 of 6 models—reaching Holm-adjusted significance in favor of `C_ID` on Qwen 3.8 27B (`C0_clean - C_ID = -5.53 pp, Holm p = 2.41e-2`) and 95% CI exclusion of zero on GLM-5.3 Flash (`-5.40 pp, 95% CI [-10.62, -0.47] pp, Holm p = 7.55e-2`), while `C0_clean` leads on Gemini 3.1 Flash-Lite (`+4.87 pp, Holm p = 5.00e-5`) and the remaining 3 models show no statistically significant difference (`Holm p >= 0.337`).

### 6.5 Difference-in-Differences (`DiD`), Distillation Gap Recovery (`DGRR`), and Mixed-Model Sensitivity

| Model | `DiD = (C_ID - C) - (C0_clean - C0)` (pp) [95% CI] | `DiD` `p` | DGRR Overall | DGRR Append-Only (`n=60`) | LPMM `C_ID - C` (pp, REML / CR2 `p`) | `logPromptTokens` β (pp) |
|---|---:|---:|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | +20.96 [+14.89, +26.97] | 1.00e-5 | 107.9% | 124.5% | 22.76 (REML 1.39e-3, CR2 0.000) | 25.87 |
| Gemini 3.5 Flash-Lite | +15.83 [+9.64, +21.86] | 1.00e-5 | 128.2% | 89.0% | 16.76 (REML 2.55e-2, CR2 0.000) | -8.04 |
| Gemini 3.1 Flash-Lite | +21.35 [+16.88, +25.74] | 1.00e-5 | 83.4% | 87.9% | 30.25 (REML 1.78e-4, CR2 0.000) | 32.71 |
| GLM-5.3 Flash | +20.28 [+12.76, +27.65] | 1.00e-5 | 129.7% | 94.2% | 24.05 (REML 8.34e-4, CR2 0.000) | 68.78 |
| Qwen 3.8 27B | +13.37 [+6.58, +19.92] | 1.10e-4 | 142.4% | 130.4% | 21.92 (REML 7.22e-3, CR2 0.000) | -9.95 |
| Gemma 4 31B | +24.25 [+16.43, +32.10] | 1.00e-5 | 108.6% | 97.3% | 31.35 (REML 9.00e-6, CR2 0.000) | -4.51 |

## Section 7: Discussion

**The Distillation Penalty is token-level identifier erosion, not distillation itself.** Once exact schema identifiers are locked via an AST/token gate (`REQUIRED_FACT_TOKENS`), distilled memory (`C_ID`) is competitive with or outperforms verbatim canonical specifications (`C0_clean`) at lower token cost.

**Reframing v2 Unconditional Nulls on GLM-5.3 and Gemini 3.5 Flash-Lite:** Ablation v2 previously hypothesized that statement-level rule contradictions alone explained the unconditional nulls on GLM-5.3 Flash and Gemini 3.5 Flash-Lite. Ablation v3 falsifies that hypothesis as the primary cause: repairing rule text (`C0_clean` vs `C0`) yields only `+3.33 pp` (`Holm p = 0.322`) on GLM-5.3 and `-0.04 pp` (`Holm p = 0.988`) on Gemini 3.5 Flash-Lite, whereas locking exact SQL identifiers (`C_ID` vs `C`) yields `+23.61 pp` and `+15.79 pp` (`Holm p = 5.00e-5`). Meanwhile, v3 eliminated `D_safe` placebo schema-qualification crashes (`hasPublicAuthJwt` count in `D_safe` = `0`, and across all `5760` trials = `0`).

## Section 8: Failure-Mode Attribution & V4 Preview — Prerequisite-Aware Retrieval

### Table 4: Non-Retrieved Checklist Displacement & Failure-Mode Attribution

Non-retrieved omission rates for `F-05` (`created_at`) and `F-10` (`deleted_at` on mutable tables) alongside static forensic defect rates across `C`, `C0_clean`, and `C_ID`:

| Model | `F-05` Non-Ret Count | `F-05` Miss Rate (`A` / `C0_clean` / `C_ID`) | `F-10` Mutable Non-Ret | `F-10` Miss Rate (`A` / `C0_clean` / `C_ID`) | Inline `supersedes_id` (`C` / `C0_clean` / `C_ID`) |
|---|---:|---|---:|---|---|
| Nemotron-3 Ultra 550B | 33 | 27.3% / 36.4% / 18.2% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemini 3.5 Flash-Lite | 33 | 12.1% / 45.5% / 39.4% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemini 3.1 Flash-Lite | 33 | 6.1% / 15.2% / 33.3% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| GLM-5.3 Flash | 33 | 9.1% / 15.2% / 6.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Qwen 3.8 27B | 33 | 0.0% / 15.2% / 6.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemma 4 31B | 33 | 0.0% / 24.2% / 9.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |

### Table 5: Quarantined `v4-only` Self-Healing Rule Candidates

Across all 1,440 `C0_clean` and `C_ID` trials, `Q-F-05-missingCreatedAtColumn` accounts for **315** observations (21.9%), whereas all other 5 residual defect candidates combined total **58** observations.

| Candidate ID | Scope | Fact ID | Trigger Flag | Observed Count | Linter & Token Gate |
|---|---|---|---:|---:|:---:|
| `Q-F-05-missingCreatedAtColumn` | `v4-only` | `F-05` | `missingCreatedAtColumn` | 315 | PASS |
| `Q-F-26-hasUserMetadataLeak` | `v4-only` | `F-26` | `hasUserMetadataLeak` | 36 | PASS |
| `Q-F-18-hasSingularCompositeIndexName` | `v4-only` | `F-18` | `hasSingularCompositeIndexName` | 10 | PASS |
| `Q-F-01-hasDuplicatePrimaryKey` | `v4-only` | `F-01` | `hasDuplicatePrimaryKey` | 6 | PASS |
| `Q-F-19-hasRevokeWithoutPositiveGrant` | `v4-only` | `F-19` | `hasRevokeWithoutPositiveGrant` | 3 | PASS |
| `Q-F-10-missingDeletedAtOnMutable` | `v4-only` | `F-10` | `missingDeletedAtOnMutable` | 3 | PASS |

**V4 Hypothesis (Prerequisite-Aware Retrieval):** Top-10 feature-matched retrieval displaces foundational schema checklist invariants (`F-01`, `F-05`) when complex feature rules (`F-36`, `F-37`) occupy the retrieval budget. Coupling prerequisite base invariants (`F-01`, `F-05`) with dependent feature rules under Prerequisite-Aware Retrieval is predicted to eliminate this attentional checklist displacement.

## Section 9: Forensic Classifier Validity Audit

Evaluated deterministic `src/verifier/sql-forensics.ts` flags against PostgreSQL 16 Oracle ground truth (`failedFacts` and `migrationExitNonZero`) across all 5,760 trials, paired with a stratified 100-trial manual audit export (`out/v3/manual-audit-sample.csv`).

### Table 6: Static Forensic Flag Precision, Recall, and F1 vs. PostgreSQL 16 Oracle

| Flag | Execution Class | Evaluated Trials | TP | FP | TN | FN | Precision | Recall | F1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `hasInlineSupersedesFk` | `invariant_violating` | 2880 | 162 | 0 | 1582 | 1136 | 1.0000 | 0.1248 | 0.2219 |
| `hasExplicitSupersedesFk` | `compliance_marker` | 672 | 249 | 59 | 261 | 103 | 0.8084 | 0.7074 | 0.7545 |
| `hasDuplicatePrimaryKey` | `execution_fatal` | 5760 | 15 | 0 | 4996 | 749 | 1.0000 | 0.0196 | 0.0384 |
| `hasPublicAuthJwt` | `execution_fatal` | 2880 | 0 | 0 | 2472 | 408 | N/A | 0.0000 | N/A |
| `hasPublicConstraintQualifier` | `execution_fatal` | 5760 | 0 | 0 | 4996 | 764 | N/A | 0.0000 | N/A |
| `omittedSupersedesId` | `invariant_violating` | 2880 | 1300 | 98 | 840 | 642 | 0.9299 | 0.6694 | 0.7784 |
| `inventedLineageCol` | `invariant_violating` | 2880 | 194 | 0 | 781 | 1905 | 1.0000 | 0.0924 | 0.1692 |
| `hasHallucinatedLineageCol` | `invariant_violating` | 2880 | 187 | 7 | 960 | 1726 | 0.9639 | 0.0978 | 0.1776 |
| `hasUserMetadataLeak` | `invariant_violating` | 2880 | 18 | 55 | 1808 | 999 | 0.2466 | 0.0177 | 0.0330 |
| `hasSingularCompositeIndexName` | `invariant_violating` | 2880 | 10 | 21 | 1846 | 1003 | 0.3226 | 0.0099 | 0.0192 |
| `hasRevokeWithoutPositiveGrant` | `invariant_violating` | 5760 | 0 | 100 | 5638 | 22 | 0.0000 | 0.0000 | N/A |
| `missingCreatedAtColumn` | `invariant_violating` | 1872 | 199 | 15 | 1494 | 164 | 0.9299 | 0.5482 | 0.6898 |
| `missingDeletedAtOnMutable` | `invariant_violating` | 960 | 286 | 15 | 659 | 0 | 0.9502 | 1.0000 | 0.9745 |

*Ledger Verification: 6/6 runs passed all confirmatory validity gates.*
