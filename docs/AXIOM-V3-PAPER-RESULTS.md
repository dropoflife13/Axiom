# Concrete-Vocabulary Erosion in Agentic Memory: Isolating Token-Level Identifier Loss via Deterministic Execution Oracles

> Pre-specified follow-up evaluation on a fresh 120-task held-out split (`V3-H-001..V3-H-120`). Auto-compiled from 9 finalized runs (8,640 trials, 9/9 Validity Gate PASS) via `scripts/v3/make-paper-tables-v3.ts`.
>
> **Decoding & Model-Card Disclosure:** Requested `temperature = 0` uniformly; provider-enforced sampling is disclosed for `Gemini 3.5 Flash-Lite` (API deprecates/ignores `temperature`, `top_p`, `top_k`) and `Kimi K3.1 Pro` (fixed `temperature = 1.0, top_p = 0.95` with always-on reasoning). A 7-model strict-greedy sensitivity pool (excluding `gemini-3.5-flash-lite-v3` and `kimi-v3`) is reported alongside the full 9-model pool. For `MiniMax M3.1 Flash` (`minimaxai/minimax-m3.1-flash`), the NVIDIA NIM card lists `220B / 262K` (reflecting packed tensor storage / default endpoint window) versus the official `428B total / 23B active / 1M context` architecture specification.

## Abstract

In this pre-specified follow-up on a fresh 120-task held-out split (`V3-H-001..V3-H-120`), preserving exact SQL identifiers during LLM memory distillation (`C_ID`) recovers 83.4% to 142.4% of the gap between unconstrained distilled lessons (`C`) and repaired verbatim rules (`C0_clean`), outperforming naive distillation by +13.50 to +26.04 percentage points across all 9 evaluated models (REML + HKSJ pooled +20.00 pp, 95% HKSJ CI [+16.47, +23.53], 95% Prediction Interval [+10.20, +29.79] pp; DerSimonian-Laird +19.99 pp; all individual Holm-Bonferroni `p < 5.00e-5`; Difference-in-Differences +13.37 to +29.26 pp, REML + HKSJ pooled +18.45 pp, 95% PI [+10.16, +26.75] pp; 7-model strict-greedy sensitivity pool +21.22 pp and DiD +19.64 pp). In contrast, repairing cross-rule syntactic contradictions in verbatim rule text alone (`C0_clean` vs `C0`) yields a modest, statistically non-significant pooled effect (REML + HKSJ +1.27 pp, 95% HKSJ CI [-0.48, +3.01], `p = 0.1326`; ranging from -3.96 to +5.19 pp, Holm-significant on 2/9 models). Together, these 8,640 confirmatory trials establish mechanistic sufficiency consistent with token-level identifier erosion—rather than summarization length or prose compression—as the primary driver of the "Distillation Penalty" in agentic memory systems (with reverse-masked necessity `C_ID_masked` and grammar-constrained `C_G` arms scoped for v3.5).

## Section 6: Confirmatory Ablation v3 Empirical Results

### Table 1: Condition Overview, Strict Pass@1, Crash Censorship Decomposition & Prompt/Hint Token Costs

Primary endpoint (`boundFactFraction`), strict `pass@1` over bound facts with Wilson 95% CIs, ITT crash-censorship decomposition (`P(commit)` and `Mean | commit`), and mean prompt / hint token counts across `120` held-out `V3-H-*` tasks per condition:

| Model | Cond | Mean Bound (%) | Strict Pass@1 (95% Wilson CI) | `P(commit)` | `Mean | commit` (%) | Avg Prompt Tok | Avg Hint Tok |
|---|---|---:|---|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | `A` | 43.1% | 7/120 (5.8%) [2.9%, 11.6%] | 69.2% | 43.8% | 245 | 0 |
| Nemotron-3 Ultra 550B | `D_safe` | 43.8% | 8/120 (6.7%) [3.4%, 12.6%] | 77.5% | 45.4% | 505 | 210 |
| Nemotron-3 Ultra 550B | `C` | 66.0% | 23/120 (19.2%) [13.1%, 27.1%] | 93.3% | 65.4% | 520 | 236 |
| Nemotron-3 Ultra 550B | `C0` | 85.5% | 65/120 (54.2%) [45.3%, 62.8%] | 94.2% | 85.7% | 553 | 247 |
| Nemotron-3 Ultra 550B | `C0_clean` | 83.9% | 66/120 (55.0%) [46.1%, 63.6%] | 98.3% | 84.3% | 617 | 304 |
| Nemotron-3 Ultra 550B | `C_ID` | 85.3% | 67/120 (55.8%) [46.9%, 64.4%] | 95.8% | 86.0% | 529 | 226 |
| Nemotron-3 Ultra 550B | `C0_rand` | 53.2% | 15/120 (12.5%) [7.7%, 19.6%] | 95.8% | 54.1% | 572 | 272 |
| Nemotron-3 Ultra 550B | `B` | 89.9% | 91/120 (75.8%) [67.4%, 82.6%] | 97.5% | 91.3% | 1257 | 886 |
| Gemini 3.5 Flash-Lite | `A` | 33.0% | 6/120 (5.0%) [2.3%, 10.5%] | 90.8% | 35.1% | 242 | 0 |
| Gemini 3.5 Flash-Lite | `D_safe` | 32.0% | 4/120 (3.3%) [1.3%, 8.3%] | 88.3% | 35.4% | 496 | 210 |
| Gemini 3.5 Flash-Lite | `C` | 62.2% | 32/120 (26.7%) [19.6%, 35.2%] | 93.3% | 63.5% | 518 | 236 |
| Gemini 3.5 Flash-Lite | `C0` | 74.6% | 41/120 (34.2%) [26.3%, 43.0%] | 97.5% | 76.5% | 540 | 247 |
| Gemini 3.5 Flash-Lite | `C0_clean` | 74.5% | 38/120 (31.7%) [24.0%, 40.4%] | 94.2% | 77.8% | 599 | 304 |
| Gemini 3.5 Flash-Lite | `C_ID` | 78.0% | 52/120 (43.3%) [34.8%, 52.3%] | 91.7% | 81.9% | 518 | 226 |
| Gemini 3.5 Flash-Lite | `C0_rand` | 55.0% | 17/120 (14.2%) [9.0%, 21.5%] | 92.5% | 57.3% | 568 | 272 |
| Gemini 3.5 Flash-Lite | `B` | 93.8% | 95/120 (79.2%) [71.1%, 85.5%] | 94.2% | 94.9% | 1272 | 886 |
| Gemini 3.1 Flash-Lite | `A` | 46.8% | 9/120 (7.5%) [4.0%, 13.6%] | 80.8% | 43.5% | 242 | 0 |
| Gemini 3.1 Flash-Lite | `D_safe` | 46.6% | 11/120 (9.2%) [5.2%, 15.7%] | 80.8% | 45.7% | 496 | 210 |
| Gemini 3.1 Flash-Lite | `C` | 59.8% | 25/120 (20.8%) [14.5%, 28.9%] | 81.7% | 60.4% | 518 | 236 |
| Gemini 3.1 Flash-Lite | `C0` | 86.0% | 62/120 (51.7%) [42.8%, 60.4%] | 86.7% | 85.8% | 540 | 247 |
| Gemini 3.1 Flash-Lite | `C0_clean` | 89.2% | 74/120 (61.7%) [52.7%, 69.9%] | 85.8% | 88.1% | 599 | 304 |
| Gemini 3.1 Flash-Lite | `C_ID` | 84.3% | 57/120 (47.5%) [38.8%, 56.4%] | 90.0% | 84.0% | 518 | 226 |
| Gemini 3.1 Flash-Lite | `C0_rand` | 60.5% | 22/120 (18.3%) [12.4%, 26.2%] | 83.3% | 59.9% | 568 | 272 |
| Gemini 3.1 Flash-Lite | `B` | 90.3% | 82/120 (68.3%) [59.6%, 76.0%] | 82.5% | 92.9% | 1272 | 886 |
| GLM-5.3 Flash | `A` | 34.9% | 1/120 (0.8%) [0.1%, 4.6%] | 70.0% | 37.6% | 228 | 0 |
| GLM-5.3 Flash | `D_safe` | 37.8% | 3/120 (2.5%) [0.9%, 7.1%] | 70.0% | 38.7% | 465 | 210 |
| GLM-5.3 Flash | `C` | 65.7% | 31/120 (25.8%) [18.8%, 34.3%] | 92.5% | 65.8% | 463 | 236 |
| GLM-5.3 Flash | `C0` | 80.6% | 61/120 (50.8%) [42.0%, 59.6%] | 85.0% | 87.6% | 494 | 247 |
| GLM-5.3 Flash | `C0_clean` | 83.9% | 66/120 (55.0%) [46.1%, 63.6%] | 87.5% | 88.4% | 551 | 304 |
| GLM-5.3 Flash | `C_ID` | 89.3% | 81/120 (67.5%) [58.7%, 75.2%] | 81.7% | 93.8% | 462 | 226 |
| GLM-5.3 Flash | `C0_rand` | 53.7% | 17/120 (14.2%) [9.0%, 21.5%] | 78.3% | 57.9% | 521 | 272 |
| GLM-5.3 Flash | `B` | 89.8% | 87/120 (72.5%) [63.9%, 79.7%] | 85.0% | 94.5% | 1120 | 886 |
| Qwen 3.8 27B | `A` | 42.9% | 9/120 (7.5%) [4.0%, 13.6%] | 86.7% | 47.5% | 243 | 0 |
| Qwen 3.8 27B | `D_safe` | 47.3% | 15/120 (12.5%) [7.7%, 19.6%] | 94.2% | 49.4% | 491 | 210 |
| Qwen 3.8 27B | `C` | 71.0% | 39/120 (32.5%) [24.8%, 41.3%] | 96.7% | 72.0% | 500 | 236 |
| Qwen 3.8 27B | `C0` | 78.9% | 60/120 (50.0%) [41.2%, 58.8%] | 57.5% | 88.9% | 530 | 247 |
| Qwen 3.8 27B | `C0_clean` | 84.1% | 62/120 (51.7%) [42.8%, 60.4%] | 55.0% | 91.3% | 588 | 304 |
| Qwen 3.8 27B | `C_ID` | 89.6% | 80/120 (66.7%) [57.8%, 74.5%] | 95.0% | 92.4% | 498 | 226 |
| Qwen 3.8 27B | `C0_rand` | 60.2% | 25/120 (20.8%) [14.5%, 28.9%] | 80.8% | 64.4% | 557 | 272 |
| Qwen 3.8 27B | `B` | 85.9% | 89/120 (74.2%) [65.7%, 81.2%] | 70.8% | 96.7% | 1202 | 886 |
| Gemma 4 31B | `A` | 38.3% | 6/120 (5.0%) [2.3%, 10.5%] | 91.7% | 41.0% | 242 | 0 |
| Gemma 4 31B | `D_safe` | 39.6% | 7/120 (5.8%) [2.9%, 11.6%] | 89.2% | 41.5% | 496 | 210 |
| Gemma 4 31B | `C` | 59.3% | 31/120 (25.8%) [18.8%, 34.3%] | 88.3% | 67.1% | 518 | 236 |
| Gemma 4 31B | `C0` | 81.4% | 65/120 (54.2%) [45.3%, 62.8%] | 94.2% | 86.5% | 540 | 247 |
| Gemma 4 31B | `C0_clean` | 83.2% | 70/120 (58.3%) [49.4%, 66.8%] | 93.3% | 89.2% | 599 | 304 |
| Gemma 4 31B | `C_ID` | 85.3% | 70/120 (58.3%) [49.4%, 66.8%] | 93.3% | 88.9% | 518 | 226 |
| Gemma 4 31B | `C0_rand` | 59.3% | 22/120 (18.3%) [12.4%, 26.2%] | 95.8% | 61.0% | 568 | 272 |
| Gemma 4 31B | `B` | 93.2% | 105/120 (87.5%) [80.4%, 92.3%] | 95.0% | 98.1% | 1272 | 886 |
| Kimi K3.1 Pro | `A` | 39.7% | 2/120 (1.7%) [0.5%, 5.9%] | 95.8% | 40.9% | 250 | 0 |
| Kimi K3.1 Pro | `D_safe` | 38.6% | 1/120 (0.8%) [0.1%, 4.6%] | 95.0% | 39.5% | 489 | 210 |
| Kimi K3.1 Pro | `C` | 71.1% | 40/120 (33.3%) [25.5%, 42.2%] | 100.0% | 71.1% | 484 | 236 |
| Kimi K3.1 Pro | `C0` | 87.0% | 76/120 (63.3%) [54.4%, 71.4%] | 100.0% | 87.0% | 515 | 247 |
| Kimi K3.1 Pro | `C0_clean` | 87.9% | 81/120 (67.5%) [58.7%, 75.2%] | 100.0% | 87.9% | 573 | 304 |
| Kimi K3.1 Pro | `C_ID` | 87.6% | 79/120 (65.8%) [57.0%, 73.7%] | 100.0% | 87.6% | 483 | 226 |
| Kimi K3.1 Pro | `C0_rand` | 61.5% | 23/120 (19.2%) [13.1%, 27.1%] | 100.0% | 61.5% | 542 | 272 |
| Kimi K3.1 Pro | `B` | 94.6% | 112/120 (93.3%) [87.4%, 96.6%] | 99.2% | 95.4% | 1133 | 886 |
| MiniMax M3.1 Flash | `A` | 30.9% | 0/120 (0.0%) [0.0%, 3.1%] | 64.2% | 41.2% | 403 | 0 |
| MiniMax M3.1 Flash | `D_safe` | 33.6% | 1/120 (0.8%) [0.1%, 4.6%] | 64.2% | 39.6% | 641 | 210 |
| MiniMax M3.1 Flash | `C` | 59.2% | 35/120 (29.2%) [21.8%, 37.8%] | 70.8% | 73.2% | 642 | 236 |
| MiniMax M3.1 Flash | `C0` | 82.0% | 65/120 (54.2%) [45.3%, 62.8%] | 75.8% | 87.4% | 673 | 247 |
| MiniMax M3.1 Flash | `C0_clean` | 78.0% | 68/120 (56.7%) [47.7%, 65.2%] | 76.7% | 89.4% | 728 | 304 |
| MiniMax M3.1 Flash | `C_ID` | 84.5% | 78/120 (65.0%) [56.1%, 72.9%] | 85.0% | 91.8% | 641 | 226 |
| MiniMax M3.1 Flash | `C0_rand` | 57.1% | 22/120 (18.3%) [12.4%, 26.2%] | 78.3% | 60.2% | 696 | 272 |
| MiniMax M3.1 Flash | `B` | 92.0% | 104/120 (86.7%) [79.4%, 91.6%] | 91.7% | 98.0% | 1289 | 886 |
| Nemotron 3.5 Super VL 120B | `A` | 43.8% | 19/120 (15.8%) [10.4%, 23.4%] | 50.8% | 62.3% | 245 | 0 |
| Nemotron 3.5 Super VL 120B | `D_safe` | 42.6% | 19/120 (15.8%) [10.4%, 23.4%] | 54.2% | 59.8% | 505 | 210 |
| Nemotron 3.5 Super VL 120B | `C` | 63.2% | 28/120 (23.3%) [16.7%, 31.7%] | 57.5% | 72.7% | 520 | 236 |
| Nemotron 3.5 Super VL 120B | `C0` | 74.7% | 50/120 (41.7%) [33.2%, 50.6%] | 38.3% | 91.4% | 553 | 247 |
| Nemotron 3.5 Super VL 120B | `C0_clean` | 74.4% | 47/120 (39.2%) [30.9%, 48.1%] | 33.3% | 87.3% | 617 | 304 |
| Nemotron 3.5 Super VL 120B | `C_ID` | 76.7% | 53/120 (44.2%) [35.6%, 53.1%] | 46.7% | 89.5% | 529 | 226 |
| Nemotron 3.5 Super VL 120B | `C0_rand` | 57.1% | 23/120 (19.2%) [13.1%, 27.1%] | 67.5% | 63.0% | 572 | 272 |
| Nemotron 3.5 Super VL 120B | `B` | 61.9% | 43/120 (35.8%) [27.8%, 44.7%] | 48.3% | 88.2% | 1257 | 886 |

### 6.1 Universal Identifier-Preservation Lift (`C_ID` vs `C`)

Enforcing `REQUIRED_FACT_TOKENS` during lesson distillation (`C_ID`) provides a mechanistic sufficiency test yielding +13.50 to +26.04 pp over unconstrained distillation (`C`) across all 9 models (all Holm `p < 5.00e-5`; REML + HKSJ pooled +20.00 pp, 95% HKSJ CI [+16.47, +23.53], $I^2 = 72.2\%$), at near-identical prompt length (`D_safe / C_ID` prompt token ratio mean `0.9662`; `C` vs `C_ID` hint token Jaccard `0.5153`, Levenshtein `94.5`). Crucially, the 95% Prediction Interval for an unseen model (`df = 7`) stays strictly positive on both `C_ID - C` ([+10.20, +29.79] pp; 2-decimal table-rounded PI [+9.90, +30.27] pp) and `DiD` ([+10.16, +26.75] pp; table-rounded [+9.85, +27.19] pp), whereas `C - C0_rand` crosses zero ([-3.83, +17.48] pp; table-rounded [-3.91, +17.55] pp), demonstrating that unconstrained distillation can underperform 10 randomly sampled verbatim rules on an unseen model.

#### Table 2: Primary Holm-Bonferroni Family Contrasts (pp, Unadjusted 95% Bootstrap CI, Holm `p`, & REML/CR2 `p`)

| Model | `C_ID - C` | `C0_clean - C0` | `C0_clean - C_ID` | `C0_clean - C0_rand` | `C_ID - D_safe` |
|---|---:|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | +19.37 [+14.74, +23.94] (Holm < 5.00e-5, CR2 < 1.00e-4) | -1.58 [-6.33, +2.93] (Holm 0.9739, CR2 0.9135) | -1.42 [-5.51, +2.49] (Holm 0.9739, CR2 0.9498) | +30.75 [+24.36, +36.96] (Holm < 5.00e-5, CR2 < 1.00e-4) | +41.53 [+35.93, +47.01] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Gemini 3.5 Flash-Lite | +15.79 [+10.71, +20.76] (Holm < 5.00e-5, CR2 < 1.00e-4) | -0.04 [-3.97, +3.72] (Holm 0.9879, CR2 0.6024) | -3.47 [-8.26, +1.28] (Holm 0.3374, CR2 0.2905) | +19.50 [+14.13, +24.78] (Holm < 5.00e-5, CR2 < 1.00e-4) | +46.01 [+40.29, +51.61] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Gemini 3.1 Flash-Lite | +24.56 [+20.32, +28.76] (Holm < 5.00e-5, CR2 < 1.00e-4) | +3.21 [+1.26, +5.24] (Holm 0.0013, CR2 0.0072) | +4.87 [+2.79, +7.22] (Holm < 5.00e-5, CR2 0.0002) | +28.68 [+24.04, +33.26] (Holm < 5.00e-5, CR2 < 1.00e-4) | +37.78 [+32.43, +43.00] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| GLM-5.3 Flash | +23.61 [+18.78, +28.54] (Holm < 5.00e-5, CR2 < 1.00e-4) | +3.33 [-3.13, +9.79] (Holm 0.3224, CR2 0.7112) | -5.40 [-10.62, -0.47] (Holm 0.0755, CR2 0.1449) | +30.15 [+22.54, +37.22] (Holm < 5.00e-5, CR2 < 1.00e-4) | +51.49 [+46.63, +56.25] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Qwen 3.8 27B | +18.57 [+13.89, +23.03] (Holm < 5.00e-5, CR2 < 1.00e-4) | +5.19 [+0.67, +9.97] (Holm 0.0274, CR2 0.2614) | -5.53 [-9.76, -1.06] (Holm 0.0241, CR2 0.0005) | +23.85 [+18.58, +28.92] (Holm < 5.00e-5, CR2 < 1.00e-4) | +42.28 [+36.40, +47.83] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Gemma 4 31B | +26.04 [+19.99, +32.14] (Holm < 5.00e-5, CR2 < 1.00e-4) | +1.79 [-3.97, +7.68] (Holm 0.9071, CR2 0.5903) | -2.07 [-7.39, +3.07] (Holm 0.9071, CR2 0.5007) | +23.99 [+17.36, +30.24] (Holm < 5.00e-5, CR2 < 1.00e-4) | +45.71 [+40.08, +51.28] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Kimi K3.1 Pro | +16.47 [+13.18, +19.83] (Holm < 5.00e-5, CR2 < 1.00e-4) | +0.93 [-1.38, +3.50] (Holm 0.9871, CR2 0.5317) | +0.35 [-0.58, +1.40] (Holm 0.9871, CR2 0.7297) | +26.49 [+21.19, +31.68] (Holm < 5.00e-5, CR2 < 1.00e-4) | +48.96 [+44.33, +53.61] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| MiniMax M3.1 Flash | +25.31 [+18.39, +32.28] (Holm < 5.00e-5, CR2 < 1.00e-4) | -3.96 [-11.78, +3.92] (Holm 0.3238, CR2 0.4404) | -6.49 [-13.03, -0.21] (Holm 0.0992, CR2 0.0715) | +20.96 [+12.74, +29.03] (Holm < 5.00e-5, CR2 < 1.00e-4) | +50.89 [+44.31, +57.15] (Holm < 5.00e-5, CR2 < 1.00e-4) |
| Nemotron 3.5 Super VL 120B | +13.50 [+9.64, +17.51] (Holm < 5.00e-5, CR2 < 1.00e-4) | -0.37 [-3.00, +2.31] (Holm 0.7918, CR2 0.9563) | -2.36 [-4.60, -0.17] (Holm 0.0800, CR2 0.0013) | +17.31 [+12.28, +22.39] (Holm < 5.00e-5, CR2 < 1.00e-4) | +34.13 [+27.71, +40.60] (Holm < 5.00e-5, CR2 < 1.00e-4) |

> *Note:* 95% paired bootstrap confidence intervals are unadjusted marginal intervals; `Holm p` values are Holm-Bonferroni adjusted across the 5-contrast primary family (`100,000` add-one sign-flip permutations, resolution floor `< 1.00e-5` raw / `< 5.00e-5` Holm). `CR2 p` denotes task-clustered (`df = 119`) sandwich $p$-values from the fact-generalizing crossed REML mixed model.

#### Table 2B: REML + HKSJ (`df = k - 1`), DerSimonian-Laird, 95% Prediction Intervals (`df = k - 2`), & 7-Model Strict-Greedy Sensitivity Pool

| Pool / Contrast | $k$ | REML Mean (pp) | 95% HKSJ CI (`df=k-1`) | HKSJ $p$ | 95% Prediction Interval (`df=k-2`) | DL Mean [95% Z-CI] | $Q$ | $I^2$ (%) | REML $\tau^2$ | Interpretation / Pooled TOST |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **9-Model** `C_ID_vs_C` | 9 | +20.00 | [+16.47, +23.53] | < 1.00e-4 | [+10.20, +29.79] | +19.99 [+17.01, +22.98] | 28.75 | 72.2% | 14.82 | - |
| **9-Model** `C0_clean_vs_C0` | 9 | +1.27 | [-0.48, +3.01] | 0.1326 | [-2.20, +4.73] | +1.27 [-0.24, +2.77] | 12.00 | 33.3% | 1.57 | Modest / Null (Non-sig) |
| **9-Model** `C0_clean_vs_C_ID` | 9 | -1.86 | [-4.62, +0.91] | 0.1607 | [-9.90, +6.19] | -1.79 [-4.09, +0.52] | 41.35 | 80.7% | 10.13 | Heterogeneous Parity (I² = 80.7%, equiv at ±5.0 pp) |
| **9-Model** `C0_clean_vs_C0_rand` | 9 | +24.53 | [+20.85, +28.21] | < 1.00e-4 | [+14.82, +34.24] | +24.53 [+21.34, +27.72] | 21.65 | 63.0% | 14.32 | - |
| **9-Model** `C_ID_vs_D_safe` | 9 | +44.41 | [+39.90, +48.91] | < 1.00e-4 | [+31.57, +57.24] | +44.41 [+40.63, +48.19] | 32.93 | 75.7% | 25.64 | - |
| **9-Model** `D_safe_vs_A` | 9 | +0.46 | [-1.02, +1.94] | 0.4963 | [-1.68, +2.60] | +0.48 [-0.78, +1.73] | 9.38 | 14.7% | 0.41 | Placebo Equivalence (equiv at ±2.0 pp & ±3.0 pp) |
| **9-Model** `C_vs_C0_rand` | 9 | +6.83 | [+2.88, +10.77] | 0.0040 | [-3.83, +17.48] | +6.82 [+3.44, +10.21] | 23.87 | 66.5% | 17.38 | - |
| **9-Model** `DiD_C_ID_vs_C_minus_C0_clean_vs_C0` | 9 | +18.45 | [+14.87, +22.04] | < 1.00e-4 | [+10.16, +26.75] | +18.46 [+15.56, +21.37] | 17.83 | 55.1% | 9.88 | - |
| **7-Model Strict-Greedy** `C_ID_vs_C` | 7 | +21.22 | [+16.92, +25.52] | < 1.00e-4 | [+10.03, +32.40] | +21.24 [+17.61, +24.87] | 22.66 | 73.5% | 15.84 | Excludes Gemini 3.5 & Kimi K3.1 |
| **7-Model Strict-Greedy** `C0_clean_vs_C0` | 7 | +1.48 | [-1.10, +4.06] | 0.2093 | [-3.80, +6.77] | +1.48 [-0.63, +3.58] | 10.95 | 45.2% | 3.11 | Excludes Gemini 3.5 & Kimi K3.1 |
| **7-Model Strict-Greedy** `C0_clean_vs_C_ID` | 7 | -2.19 | [-5.89, +1.52] | 0.1990 | [-12.29, +7.91] | -2.28 [-5.78, +1.23] | 38.37 | 84.4% | 13.14 | Excludes Gemini 3.5 & Kimi K3.1 |
| **7-Model Strict-Greedy** `DiD_C_ID_vs_C_minus_C0_clean_vs_C0` | 7 | +19.64 | [+14.83, +24.44] | < 1.00e-4 | [+8.63, +30.64] | +19.65 [+15.86, +23.43] | 15.10 | 60.3% | 14.45 | Excludes Gemini 3.5 & Kimi K3.1 |

### 6.2 Rule-Text Repair Alone (`C0_clean` vs `C0`) & Exposure Stratification

Repairing statement-level contradictions in verbatim Oracle text (`C0_clean` vs `C0`) yields a REML + HKSJ pooled estimate of +1.27 pp (95% HKSJ CI [-0.48, +3.01], `p = 0.1326`; DerSimonian-Laird +1.27 pp, `p = 0.0993`; individual models -3.96 to +5.19 pp), reaching Holm-adjusted significance only on Gemini 3.1 Flash-Lite (+3.21 pp, `Holm p = 1.32e-3`) and Qwen 3.8 27B (+5.19 pp, `Holm p = 2.74e-2`).

#### Table 3: Exposure-Stratified `C0_clean` vs `C0` (`{F-01, F-18, F-19, F-36}`)

| Model | Overall `C0_clean - C0` (pp) | Exposed `n` | Exposed Diff (pp) [95% CI] | Unexposed `n` | Unexposed Diff (pp) [95% CI] |
|---|---:|---:|---:|---:|---:|
| Nemotron-3 Ultra 550B | -1.58 (Holm 0.9739) | 120 | -1.58 [-6.33, +2.93] | 0 | 0.00 [0.00, 0.00] |
| Gemini 3.5 Flash-Lite | -0.04 (Holm 0.9879) | 120 | -0.04 [-3.97, +3.72] | 0 | 0.00 [0.00, 0.00] |
| Gemini 3.1 Flash-Lite | +3.21 (Holm 0.0013) | 120 | +3.21 [+1.26, +5.24] | 0 | 0.00 [0.00, 0.00] |
| GLM-5.3 Flash | +3.33 (Holm 0.3224) | 120 | +3.33 [-3.13, +9.79] | 0 | 0.00 [0.00, 0.00] |
| Qwen 3.8 27B | +5.19 (Holm 0.0274) | 120 | +5.19 [+0.67, +9.97] | 0 | 0.00 [0.00, 0.00] |
| Gemma 4 31B | +1.79 (Holm 0.9071) | 120 | +1.79 [-3.97, +7.68] | 0 | 0.00 [0.00, 0.00] |
| Kimi K3.1 Pro | +0.93 (Holm 0.9871) | 120 | +0.93 [-1.38, +3.50] | 0 | 0.00 [0.00, 0.00] |
| MiniMax M3.1 Flash | -3.96 (Holm 0.3238) | 120 | -3.96 [-11.78, +3.92] | 0 | 0.00 [0.00, 0.00] |
| Nemotron 3.5 Super VL 120B | -0.37 (Holm 0.7918) | 120 | -0.37 [-3.00, +2.31] | 0 | 0.00 [0.00, 0.00] |

### 6.3 Feature-Aware Retrieval vs. Random-K (`C0_clean` vs `C0_rand`), Targeting Erasure (`C` vs `C0_rand`), & Placebo TOST (`D_safe` vs `A`)

Length-matched random-10 Oracle facts (`C0_rand`, bound-fact overlap 12.1%) score 53.2%–61.5%, trailing feature-matched Top-10 retrieval (`C0_clean`) by +17.31 to +30.75 pp across all 9 models (all `Holm p < 5.00e-5`). Comparing unconstrained distillation (`C`) against `C0_rand` shows that identifier erosion completely erases the benefit of failure-prioritized retrieval on Gemini 3.1 Flash-Lite (59.8% vs 60.5%) and Gemma 4 31B (59.3% vs 59.3%), with a 95% Prediction Interval of [-3.83, +17.48] pp across unseen models. Meanwhile, `D_safe` (redesigned after v2's imperative placebo triggered schema-qualification syntax errors) passes pooled HKSJ TOST equivalence (`df = 8`) at both `±3.0 pp` (90% CI [-0.74, +1.65] pp, `p = 0.0021`) and `±2.0 pp` (`p = 0.0214`).

| Model | `D_safe - A` TOST (90% CI, `p`, Eq `±3.0 pp`) | `C - C0_rand` Targeting Erasure (pp) [95% CI] | `C_ID - D_safe` (pp) |
|---|---|---:|---:|
| Nemotron-3 Ultra 550B | +0.76 [-3.28, +4.81], p=0.1808, NO | +12.79 [+7.49, +18.22] (p=2.00e-5) | +41.53 (Holm < 5.00e-5) |
| Gemini 3.5 Flash-Lite | -1.06 [-3.64, +1.53], p=0.1073, NO | +7.18 [+1.37, +13.07] (p=0.0205) | +46.01 (Holm < 5.00e-5) |
| Gemini 3.1 Flash-Lite | -0.24 [-2.53, +2.06], p=0.0242, **YES** | -0.75 [-6.00, +4.47] (p=0.7835) | +37.78 (Holm < 5.00e-5) |
| GLM-5.3 Flash | +2.87 [-0.25, +6.00], p=0.4736, NO | +11.94 [+5.31, +18.54] (p=0.0006) | +51.49 (Holm < 5.00e-5) |
| Qwen 3.8 27B | +4.39 [+0.73, +8.05], p=0.7347, NO | +10.81 [+5.75, +15.71] (p=6.00e-5) | +42.28 (Holm < 5.00e-5) |
| Gemma 4 31B | +1.32 [-1.87, +4.51], p=0.1919, NO | +0.01 [-6.90, +6.79] (p=0.9964) | +45.71 (Holm < 5.00e-5) |
| Kimi K3.1 Pro | -1.08 [-3.29, +1.12], p=0.0758, NO | +9.67 [+4.42, +14.92] (p=0.0003) | +48.96 (Holm < 5.00e-5) |
| MiniMax M3.1 Flash | +2.71 [-1.11, +6.53], p=0.4497, NO | +2.14 [-5.40, +9.47] (p=0.5769) | +50.89 (Holm < 5.00e-5) |
| Nemotron 3.5 Super VL 120B | -1.21 [-4.16, +1.75], p=0.1584, NO | +6.17 [+0.11, +12.01] (p=0.0425) | +34.13 (Holm < 5.00e-5) |

### 6.4 Distilled vs. Verbatim Heterogeneous Parity (`C0_clean` vs `C_ID`, Per-Model & Pooled TOST)

`C_ID` numerically outperforms verbatim `C0_clean` on 7 of 9 models—reaching Holm-adjusted significance in favor of `C_ID` on Qwen 3.8 27B (`C0_clean - C_ID = -5.53 pp, Holm p = 0.0241`) and unadjusted 95% CI exclusion of zero on GLM-5.3 Flash (`-5.40 pp`), Nemotron 3.5 Super VL 120B (`-2.36 pp`), and MiniMax M3.1 Flash (`-6.49 pp`), while `C0_clean` leads on Gemini 3.1 Flash-Lite (`+4.87 pp, Holm p < 5.00e-5`) and Kimi K3.1 Pro is strictly equivalent at `±3.0 pp` (`+0.35 pp`, 90% CI `[-0.49, +1.18] pp`, TOST `p = 3.22e-7`). Because cross-model heterogeneity is high ($I^2 = 80.7\%$), pooled `C0_clean - C_ID` (`-1.86 pp`, 90% HKSJ CI `[-4.09, +0.38] pp`) does not pass pooled TOST at `±3.0 pp` (`p = 0.1842`) and is equivalent at `±5.0 pp` (`p = 0.0153`), which we characterize as **Heterogeneous Parity (I² = 80.7%, equiv at ±5.0 pp)**:

| Model / Pool | `C0_clean - C_ID` (pp) | 90% CI (pp) | TOST `p` (`±3.0 pp`) | Equivalent at `±3.0 pp` | Pooled `±5.0 pp` TOST `p` |
|---|---:|---:|---:|:---:|---:|
| Nemotron-3 Ultra 550B | -1.42 | [-4.78, +1.95] | 0.2186 | NO | - |
| Gemini 3.5 Flash-Lite | -3.47 | [-7.59, +0.65] | 0.5751 | NO | - |
| Gemini 3.1 Flash-Lite | +4.87 | [+3.01, +6.74] | 0.9513 | NO | - |
| GLM-5.3 Flash | -5.40 | [-9.67, -1.13] | 0.8236 | NO | - |
| Qwen 3.8 27B | -5.53 | [-9.19, -1.87] | 0.8729 | NO | - |
| Gemma 4 31B | -2.07 | [-6.54, +2.41] | 0.3655 | NO | - |
| Kimi K3.1 Pro | +0.35 | [-0.49, +1.18] | < 1.00e-4 | **YES** | - |
| MiniMax M3.1 Flash | -6.49 | [-11.92, -1.06] | 0.8553 | NO | - |
| Nemotron 3.5 Super VL 120B | -2.36 | [-4.22, -0.50] | 0.2854 | NO | - |
| **9-Model REML+HKSJ Pool (df=8)** | -1.86 | [-4.09, +0.38] | 0.1842 | **NO** | 0.0153 (**YES**) |

### 6.5 Difference-in-Differences (`DiD`), Logit-Scale `DiD` Sensitivity, Distillation Gap Recovery (`DGRR`), and Mixed-Model Sensitivity

To rule out `[0, 1]` ceiling compression on high-baseline models, Table 3B reports both linear percentage-point `DiD` and log-odds `DiD` ($\Delta_{\text{logit-DiD}} = [\text{logit}(\bar{Y}_{C_{\text{ID}}}) - \text{logit}(\bar{Y}_C)] - [\text{logit}(\bar{Y}_{C0_{\text{clean}}}) - \text{logit}(\bar{Y}_{C0})]$) with corresponding Odds Ratios ($\text{OR} = \exp(\Delta_{\text{logit-DiD}})$). Across all 9 models, log-odds `DiD` is strictly positive (REML + HKSJ pooled $\Delta_{\text{logit-DiD}} = +0.981$, 95% HKSJ CI $[+0.781, +1.181]$, pooled $\text{OR} = 2.67\times$ $[2.18\times, 3.26\times]$, `p = < 1.00e-4`).

#### Table 3B: Linear `DiD`, Log-Odds `DiD` (Odds Ratio), `DGRR` (95% CI), and Crossed REML/CR2 LPMM

| Model | Linear `DiD` (pp) [95% CI] | `DiD` `p` | Log-Odds `DiD` (`OR` [95% CI]) | DGRR Overall [95% CI] | DGRR Append-Only (`n=60`) [95% CI] | LPMM `C_ID - C` (pp, REML / CR2 `p`) | `logPromptTokens` β (pp) |
|---|---:|---:|---:|---|---|---|---:|
| Nemotron-3 Ultra 550B | +20.96 [+14.89, +26.97] | < 1.00e-5 | +1.22 (3.40× [2.14×, 5.39×]) | 107.9% [87.4%, 136.6%] | 124.5% [97.9%, 171.9%] | 22.76 (REML 0.0014, CR2 < 1.00e-4) | 25.87 |
| Gemini 3.5 Flash-Lite | +15.83 [+9.64, +21.86] | < 1.00e-5 | +0.77 (2.16× [1.55×, 3.00×]) | 128.2% [91.0%, 200.3%] | 89.0% [66.2%, 110.9%] | 16.76 (REML 0.0255, CR2 < 1.00e-4) | -8.04 |
| Gemini 3.1 Flash-Lite | +21.35 [+16.88, +25.74] | < 1.00e-5 | +0.99 (2.69× [1.97×, 3.68×]) | 83.4% [75.7%, 90.4%] | 87.9% [79.4%, 95.5%] | 30.25 (REML 0.0002, CR2 < 1.00e-4) | 32.71 |
| GLM-5.3 Flash | +20.28 [+12.76, +27.65] | < 1.00e-5 | +1.24 (3.47× [1.93×, 6.22×]) | 129.7% [102.2%, 185.2%] | 94.2% [77.5%, 110.1%] | 24.05 (REML 0.0008, CR2 < 1.00e-4) | 68.78 |
| Qwen 3.8 27B | +13.37 [+6.58, +19.92] | 0.0001 | +0.91 (2.49× [1.55×, 3.99×]) | 142.4% [107.1%, 200.0%] | 130.4% [96.5%, 185.3%] | 21.92 (REML 0.0072, CR2 < 1.00e-4) | -9.95 |
| Gemma 4 31B | +24.25 [+16.43, +32.10] | < 1.00e-5 | +1.26 (3.53× [2.05×, 6.08×]) | 108.6% [88.3%, 137.6%] | 97.3% [78.7%, 118.8%] | 31.35 (REML < 1.00e-4, CR2 < 1.00e-4) | -4.51 |
| Kimi K3.1 Pro | +15.54 [+11.90, +19.03] | < 1.00e-5 | +0.97 (2.63× [1.91×, 3.63×]) | 97.9% [91.3%, 103.5%] | 101.6% [97.2%, 107.2%] | 18.44 (REML 0.0126, CR2 < 1.00e-4) | 100.11 |
| MiniMax M3.1 Flash | +29.26 [+18.74, +39.99] | < 1.00e-5 | +1.57 (4.82× [2.53×, 9.19×]) | 134.5% [101.0%, 204.6%] | 120.7% [96.1%, 162.0%] | 29.05 (REML < 1.00e-4, CR2 < 1.00e-4) | 101.43 |
| Nemotron 3.5 Super VL 120B | +13.87 [+9.57, +18.33] | < 1.00e-5 | +0.67 (1.96× [1.54×, 2.49×]) | 121.2% [101.3%, 150.8%] | 105.1% [80.7%, 141.4%] | 15.82 (REML 0.0142, CR2 < 1.00e-4) | 40.90 |
| **9-Model REML+HKSJ Pool** | **+18.45** [+14.87, +22.04] | < 1.00e-4 | **+0.98** (**2.67×** [2.18×, 3.26×]) | - | - | - | - |

## Section 7: Discussion

**Mechanistic Sufficiency Consistent with Token-Level Identifier Erosion:** Enforcing an AST/token gate (`REQUIRED_FACT_TOKENS`) during distillation serves as a mechanistic sufficiency test on a fresh 120-task held-out split (`V3-H-001..V3-H-120`): distilled memory (`C_ID`) matches or exceeds verbatim canonical specifications (`C0_clean`) at lower token cost. Because `C_ID` tests positive sufficiency (restoring exact identifiers to distilled prose), a reverse-masked necessity arm (`C_ID_masked`, stripping exact identifiers from verbatim `C0_clean`) and a grammar-constrained decoding arm (`C_G`) are pre-specified for v3.5 to complete the bidirectional necessity-and-sufficiency decomposition. This directly extends Zhang et al. (2026, arXiv:2605.12978), who document iterative memory erosion and Concrete-Vocabulary Erosion in continuously updated LLM memory stores, as well as experiential abstraction boundaries studied by Shen et al. (2026, arXiv:2604.04373), Vo et al. (2026, arXiv:2608.05906), Zhao et al. (2026, ICML 2026), and Behrouz et al. (2025, NeurIPS 2025).

**Reframing v2 Unconditional Nulls & Placebo Redesign (`D_safe`):** Ablation v2 previously hypothesized that statement-level rule contradictions alone explained the unconditional nulls on GLM-5.3 Flash and Gemini 3.5 Flash-Lite. This pre-specified follow-up on a fresh 120-task held-out split falsifies that hypothesis as the primary cause: repairing rule text (`C0_clean` vs `C0`) yields only +3.33 pp (`Holm p = 0.322`) on GLM-5.3 and -0.04 pp (`Holm p = 0.988`) on Gemini 3.5 Flash-Lite (9-model REML + HKSJ pooled +1.27 pp, `p = 0.1326`), whereas locking exact SQL identifiers (`C_ID` vs `C`) yields +23.61 pp and +15.79 pp (`Holm p < 5.00e-5`). Furthermore, after v2's imperative placebo (`Condition D`) inadvertently triggered schema-qualification syntax errors, v3 redesigned the placebo into purely descriptive PostgreSQL storage/MVCC/WAL internals notes (`D_safe`), eliminating placebo-induced schema-qualification crashes (`hasPublicAuthJwt` count in `D_safe` = `0`, and across all `8640` trials = `0`) and achieving pooled HKSJ TOST equivalence with `A` at `±2.0 pp` (`p = 0.0214`).

## Section 8: Failure-Mode Attribution & V4 Preview — Prerequisite-Aware Retrieval

### Table 4: Non-Retrieved Checklist Displacement & Failure-Mode Attribution

| Model | `F-05` Non-Ret Count | `F-05` Miss Rate (`A` / `C0_clean` / `C_ID`) | `F-10` Mutable Non-Ret | `F-10` Miss Rate (`A` / `C0_clean` / `C_ID`) | Inline `supersedes_id` (`C` / `C0_clean` / `C_ID`) |
|---|---:|---|---:|---|---|
| Nemotron-3 Ultra 550B | 33 | 27.3% / 36.4% / 18.2% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemini 3.5 Flash-Lite | 33 | 12.1% / 45.5% / 39.4% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemini 3.1 Flash-Lite | 33 | 6.1% / 15.2% / 33.3% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| GLM-5.3 Flash | 33 | 9.1% / 15.2% / 6.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Qwen 3.8 27B | 33 | 0.0% / 15.2% / 6.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Gemma 4 31B | 33 | 0.0% / 24.2% / 9.1% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Kimi K3.1 Pro | 33 | 21.2% / 24.2% / 24.2% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| MiniMax M3.1 Flash | 33 | 6.1% / 27.3% / 21.2% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |
| Nemotron 3.5 Super VL 120B | 33 | 0.0% / 27.3% / 27.3% | 0 | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% |

### Table 5: Quarantined `v4-only` Self-Healing Rule Candidates

Across all 2,160 `C0_clean` and `C_ID` trials, `Q-F-05-missingCreatedAtColumn` accounts for **499** observations (23.1%), whereas all other 5 residual defect candidates combined total **63** observations.

| Candidate ID | Scope | Fact ID | Trigger Flag | Observed Count | Linter & Token Gate |
|---|---|---|---:|---:|:---:|
| `Q-F-05-missingCreatedAtColumn` | `v4-only` | `F-05` | `missingCreatedAtColumn` | 499 | PASS |
| `Q-F-26-hasUserMetadataLeak` | `v4-only` | `F-26` | `hasUserMetadataLeak` | 39 | PASS |
| `Q-F-18-hasSingularCompositeIndexName` | `v4-only` | `F-18` | `hasSingularCompositeIndexName` | 11 | PASS |
| `Q-F-01-hasDuplicatePrimaryKey` | `v4-only` | `F-01` | `hasDuplicatePrimaryKey` | 6 | PASS |
| `Q-F-19-hasRevokeWithoutPositiveGrant` | `v4-only` | `F-19` | `hasRevokeWithoutPositiveGrant` | 4 | PASS |
| `Q-F-10-missingDeletedAtOnMutable` | `v4-only` | `F-10` | `missingDeletedAtOnMutable` | 3 | PASS |

**V4 Hypothesis (Prerequisite-Aware Retrieval):** Top-10 feature-matched retrieval displaces foundational schema checklist invariants (`F-01`, `F-05`) when complex feature rules (`F-36`, `F-37`) occupy the retrieval budget. Coupling prerequisite base invariants (`F-01`, `F-05`) with dependent feature rules under Prerequisite-Aware Retrieval is predicted to eliminate this attentional checklist displacement.

## Section 9: Forensic Classifier Validity & Authority Separation Audit

Evaluated deterministic `src/verifier/sql-forensics.ts` flags against PostgreSQL 16 Oracle ground truth (`failedFacts` and `migrationExitNonZero`) across 5,760 trials, paired with a stratified 100-trial manual audit export (`out/v3/manual-audit-sample.csv`).

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

### Table 7: Gemini Decision 1 LLM-as-Judge vs. PostgreSQL 16 Oracle Calibration (Invariant 0)

To empirically substantiate **Authority Separation (Invariant 0)**—consistent with the LLM-as-Judge failure bounds documented by Lù et al. (2025) and Prokopiou et al. (2026, REALM @ EMNLP 2026)—we audited `gemini-decision-1` (`noul >= 0.5` probability threshold) against the deterministic PostgreSQL 16 Oracle across 60 sampled trials (240 fact-level judgments):

| Metric | Value |
|---|---:|
| Judge Model | `gemini-decision-1` |
| Sampled Trials / Fact Judgments | 60 / 240 |
| Precision / Recall / F1 | 0.9576 / 0.6890 / 0.8014 |
| Hallucinated Compliance Rate (Oracle FAIL -> Judge PASS) | 6.6% (5/76) |
| F-36 / F-16 Collision FP Rate | 4.3% (1/23) |
| Expected Calibration Error (ECE) | 0.0548 |
| Memory Audit: Identifier Preservation (`C_ID` vs `C`) | 27/31 (87.1%) vs 21/31 (67.7%) |
| Memory Audit: Mean Actionability Score (0–2 scale, `C_ID` vs `C`) | 1.58 vs 1.30 |

## References

1. Behrouz, A., Razaviyayn, M., & Mirrokni, V. (2025). *Titans: Learning to Memorize at Test Time*. Advances in Neural Information Processing Systems (NeurIPS 2025).
2. Lù, X. H., et al. (2025). *Statistically Rigorous Evaluation of LLM-as-a-Judge and Agent Benchmarks*. arXiv preprint.
3. Mishra, S., & Mishra, S. (2026). *When Does Memory Help? A Cost-Aware Evaluation of Long-Term Memory in Tool-Using LLM Agents*. arXiv preprint arXiv:2609.05441.
4. Prokopiou, I., Aidinis, A., Kyrmpatsos, P.-C., & Vikatos, P. (2026). *What Drives Recovery in Agentic Text-to-Cypher? LAST-CQ: An LLM Agent Self-Refinement Framework*. Workshop on Reasoning and Learning with External Knowledge for LLMs (REALM @ EMNLP 2026). arXiv:2609.12746.
5. Shen, M., Zha, K.-W., He, Z., & Wornell, G. W. (2026). *Decocted Experience Improves Test-Time Inference in LLM Agents*. arXiv preprint arXiv:2604.04373.
6. Vo, K. N. H., Chu, T. M., Dinh, A. T. D., Bui, T. V. H., & Quan, T. (2026). *Causal Episodic Memory for Feedback-Driven Agent Repair (MERIT)*. arXiv preprint arXiv:2608.05906.
7. Zhang, D., Lin, Y., Wu, Z., Sun, Y., Li, B., Li, D., & Peng, H. (2026). *Useful Memories Become Faulty When Continuously Updated by LLMs*. arXiv preprint arXiv:2605.12978.
8. Zhao, W., Wang, Y., Zhang, Y., Deng, Y., Zhao, Y., Che, W., Qin, B., & Liu, T. (2026). *Large Language Model Agents Are Not Always Faithful Self-Evolvers*. International Conference on Machine Learning (ICML 2026). arXiv:2601.22436.

*Ledger Verification: 9/9 finalized runs passed all confirmatory validity gates.*
