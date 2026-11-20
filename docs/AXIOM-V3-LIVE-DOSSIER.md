# Axiom Ablation v3 — Live Research Dossier

**Generated At:** 2026-11-20T16:32:43.663Z  
**Protocol:** Ablation v3 (`K=10`, Temperature `0`, 120 held-out `V3-H-001`..`V3-H-120` × 8 conditions = 960 trials/model)  
**Finalized Models (960/960):** 9 / 9  
**Quarantined Self-Healing Candidates:** 6 (`6` ready for next-generation promotion)

---

## 1. Live Fleet Telemetry

| Run ID | Progress | Latest Trial | A % | D_safe % | C % | C0 % | C0_clean % | C_ID % | C0_rand % | B % |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| nemotron-v3 | 960/960 | V3-H-120 B | 43.1% | 43.8% | 66.0% | 85.5% | 83.9% | 85.3% | 53.2% | 89.9% |
| gemma4-31b-v3 | 960/960 | V3-H-120 B | 38.3% | 39.6% | 59.3% | 81.4% | 83.2% | 85.3% | 59.3% | 93.2% |
| qwen27b-v3 | 960/960 | V3-H-120 B | 42.9% | 47.3% | 71.0% | 78.9% | 84.1% | 89.6% | 60.2% | 85.9% |
| glm5-v3 | 960/960 | V3-H-120 B | 34.9% | 37.8% | 65.7% | 80.6% | 83.9% | 89.3% | 53.7% | 89.8% |
| gemini-3.1-flash-lite-v3 | 960/960 | V3-H-120 B | 46.8% | 46.6% | 59.8% | 86.0% | 89.2% | 84.3% | 60.5% | 90.3% |
| gemini-3.5-flash-lite-v3 | 960/960 | V3-H-120 B | 33.0% | 32.0% | 62.2% | 74.6% | 74.5% | 78.0% | 55.0% | 93.8% |
| kimi-v3 | 960/960 | V3-H-120 B | 39.7% | 38.6% | 71.1% | 87.0% | 87.9% | 87.6% | 61.5% | 94.6% |
| minimax-v3 | 960/960 | V3-H-120 B | 30.9% | 33.6% | 59.2% | 82.0% | 78.0% | 84.5% | 57.1% | 92.0% |
| super-vl-v3 | 960/960 | V3-H-120 B | 43.8% | 42.6% | 63.2% | 74.7% | 74.4% | 76.7% | 57.1% | 61.9% |

---

## 2. Pre-Registered Validity Gate & Run Ledger (`960/960` Finalized Runs)

| Run ID | Trials | Model Match (960/960) | Provenance (7 SHA-256) | B - A [95% CI] (pp) | Gate |
|---|---:|:---:|:---:|---:|:---:|
| nemotron-v3 | 960 | PASS | PASS | 46.82 [40.60, 52.94] | **PASS** |
| gemini-3.5-flash-lite-v3 | 960 | PASS | PASS | 60.71 [54.83, 66.28] | **PASS** |
| gemini-3.1-flash-lite-v3 | 960 | PASS | PASS | 43.51 [38.65, 48.32] | **PASS** |
| glm5-v3 | 960 | PASS | PASS | 54.88 [48.90, 60.76] | **PASS** |
| qwen27b-v3 | 960 | PASS | PASS | 42.97 [36.71, 49.03] | **PASS** |
| gemma4-31b-v3 | 960 | PASS | PASS | 54.96 [49.18, 60.61] | **PASS** |
| super-vl-v3 | 960 | PASS | PASS | 18.10 [9.17, 26.99] | **PASS** |
| kimi-v3 | 960 | PASS | PASS | 54.90 [49.97, 59.81] | **PASS** |
| minimax-v3 | 960 | PASS | PASS | 61.10 [54.28, 67.44] | **PASS** |

---

## 3. Confirmatory Primary Contrasts (`C_ID`, `C0_clean`, `C0`, `C`, `C0_rand`, `D_safe`, `A`, `B`)

| Run ID | Contrast | Diff (pp) | 95% Bootstrap CI (pp) | Sign-Flip p | Holm p |
|---|---|---:|---:|---:|---:|
| nemotron-v3 | C_ID_vs_C | 19.37 | [14.74, 23.94] | 1.00e-5 | 5.00e-5 |
| nemotron-v3 | C0_clean_vs_C0 | -1.58 | [-6.33, 2.93] | 5.10e-1 | 9.74e-1 |
| nemotron-v3 | C0_clean_vs_C_ID | -1.42 | [-5.51, 2.49] | 4.87e-1 | 9.74e-1 |
| nemotron-v3 | C0_clean_vs_C0_rand | 30.75 | [24.36, 36.96] | 1.00e-5 | 5.00e-5 |
| nemotron-v3 | C_ID_vs_D_safe | 41.53 | [35.93, 47.01] | 1.00e-5 | 5.00e-5 |
| gemini-3.5-flash-lite-v3 | C_ID_vs_C | 15.79 | [10.71, 20.76] | 1.00e-5 | 5.00e-5 |
| gemini-3.5-flash-lite-v3 | C0_clean_vs_C0 | -0.04 | [-3.97, 3.72] | 9.88e-1 | 9.88e-1 |
| gemini-3.5-flash-lite-v3 | C0_clean_vs_C_ID | -3.47 | [-8.26, 1.28] | 1.69e-1 | 3.37e-1 |
| gemini-3.5-flash-lite-v3 | C0_clean_vs_C0_rand | 19.50 | [14.13, 24.78] | 1.00e-5 | 5.00e-5 |
| gemini-3.5-flash-lite-v3 | C_ID_vs_D_safe | 46.01 | [40.29, 51.61] | 1.00e-5 | 5.00e-5 |
| gemini-3.1-flash-lite-v3 | C_ID_vs_C | 24.56 | [20.32, 28.76] | 1.00e-5 | 5.00e-5 |
| gemini-3.1-flash-lite-v3 | C0_clean_vs_C0 | 3.21 | [1.26, 5.24] | 1.32e-3 | 1.32e-3 |
| gemini-3.1-flash-lite-v3 | C0_clean_vs_C_ID | 4.87 | [2.79, 7.22] | 2.00e-5 | 5.00e-5 |
| gemini-3.1-flash-lite-v3 | C0_clean_vs_C0_rand | 28.68 | [24.04, 33.26] | 1.00e-5 | 5.00e-5 |
| gemini-3.1-flash-lite-v3 | C_ID_vs_D_safe | 37.78 | [32.43, 43.00] | 1.00e-5 | 5.00e-5 |
| glm5-v3 | C_ID_vs_C | 23.61 | [18.78, 28.54] | 1.00e-5 | 5.00e-5 |
| glm5-v3 | C0_clean_vs_C0 | 3.33 | [-3.13, 9.79] | 3.22e-1 | 3.22e-1 |
| glm5-v3 | C0_clean_vs_C_ID | -5.40 | [-10.62, -0.47] | 3.78e-2 | 7.55e-2 |
| glm5-v3 | C0_clean_vs_C0_rand | 30.15 | [22.54, 37.22] | 1.00e-5 | 5.00e-5 |
| glm5-v3 | C_ID_vs_D_safe | 51.49 | [46.63, 56.25] | 1.00e-5 | 5.00e-5 |
| qwen27b-v3 | C_ID_vs_C | 18.57 | [13.89, 23.03] | 1.00e-5 | 5.00e-5 |
| qwen27b-v3 | C0_clean_vs_C0 | 5.19 | [0.67, 9.97] | 2.74e-2 | 2.74e-2 |
| qwen27b-v3 | C0_clean_vs_C_ID | -5.53 | [-9.76, -1.06] | 1.20e-2 | 2.41e-2 |
| qwen27b-v3 | C0_clean_vs_C0_rand | 23.85 | [18.58, 28.92] | 1.00e-5 | 5.00e-5 |
| qwen27b-v3 | C_ID_vs_D_safe | 42.28 | [36.40, 47.83] | 1.00e-5 | 5.00e-5 |
| gemma4-31b-v3 | C_ID_vs_C | 26.04 | [19.99, 32.14] | 1.00e-5 | 5.00e-5 |
| gemma4-31b-v3 | C0_clean_vs_C0 | 1.79 | [-3.97, 7.68] | 5.48e-1 | 9.07e-1 |
| gemma4-31b-v3 | C0_clean_vs_C_ID | -2.07 | [-7.39, 3.07] | 4.54e-1 | 9.07e-1 |
| gemma4-31b-v3 | C0_clean_vs_C0_rand | 23.99 | [17.36, 30.24] | 1.00e-5 | 5.00e-5 |
| gemma4-31b-v3 | C_ID_vs_D_safe | 45.71 | [40.08, 51.28] | 1.00e-5 | 5.00e-5 |
| super-vl-v3 | C_ID_vs_C | 13.50 | [9.64, 17.51] | 1.00e-5 | 5.00e-5 |
| super-vl-v3 | C0_clean_vs_C0 | -0.37 | [-3.00, 2.31] | 7.92e-1 | 7.92e-1 |
| super-vl-v3 | C0_clean_vs_C_ID | -2.36 | [-4.60, -0.17] | 4.00e-2 | 8.00e-2 |
| super-vl-v3 | C0_clean_vs_C0_rand | 17.31 | [12.28, 22.39] | 1.00e-5 | 5.00e-5 |
| super-vl-v3 | C_ID_vs_D_safe | 34.13 | [27.71, 40.60] | 1.00e-5 | 5.00e-5 |
| kimi-v3 | C_ID_vs_C | 16.47 | [13.18, 19.83] | 1.00e-5 | 5.00e-5 |
| kimi-v3 | C0_clean_vs_C0 | 0.93 | [-1.38, 3.50] | 4.94e-1 | 9.87e-1 |
| kimi-v3 | C0_clean_vs_C_ID | 0.35 | [-0.58, 1.40] | 5.64e-1 | 9.87e-1 |
| kimi-v3 | C0_clean_vs_C0_rand | 26.49 | [21.19, 31.68] | 1.00e-5 | 5.00e-5 |
| kimi-v3 | C_ID_vs_D_safe | 48.96 | [44.33, 53.61] | 1.00e-5 | 5.00e-5 |
| minimax-v3 | C_ID_vs_C | 25.31 | [18.39, 32.28] | 1.00e-5 | 5.00e-5 |
| minimax-v3 | C0_clean_vs_C0 | -3.96 | [-11.78, 3.92] | 3.24e-1 | 3.24e-1 |
| minimax-v3 | C0_clean_vs_C_ID | -6.49 | [-13.03, -0.21] | 4.96e-2 | 9.92e-2 |
| minimax-v3 | C0_clean_vs_C0_rand | 20.96 | [12.74, 29.03] | 1.00e-5 | 5.00e-5 |
| minimax-v3 | C_ID_vs_D_safe | 50.89 | [44.31, 57.15] | 1.00e-5 | 5.00e-5 |

---

## 4. Failure-Mode Attribution & Self-Healing Quarantine

### Observed Defect Rates in `C0_clean` / `C_ID` (Live Across All Runs)
| Run ID | Inline `supersedes_id` | Explicit `fk_supersedes` | Hallucinated Lineage | Duplicate PK | `public.auth.jwt()` | Singular Composite Idx |
|---|---:|---:|---:|---:|---:|---:|
| nemotron-v3 | 13 | 227 | 26 | 0 | 0 | 5 |
| gemma4-31b-v3 | 37 | 217 | 36 | 0 | 0 | 4 |
| qwen27b-v3 | 20 | 230 | 44 | 0 | 0 | 6 |
| glm5-v3 | 38 | 218 | 31 | 15 | 0 | 19 |
| gemini-3.1-flash-lite-v3 | 30 | 198 | 33 | 0 | 0 | 0 |
| gemini-3.5-flash-lite-v3 | 24 | 214 | 24 | 0 | 0 | 17 |
| kimi-v3 | 2 | 230 | 13 | 0 | 0 | 14 |
| minimax-v3 | 0 | 255 | 18 | 0 | 0 | 2 |
| super-vl-v3 | 4 | 237 | 59 | 0 | 0 | 2 |

### Quarantined Candidate Rules (`.axiom-state/quarantine/v3-candidates.json`)
| Candidate ID | Fact | Trigger Flag | Observed | Linter | Tokens | Ready |
|---|---|---|---:|:---:|:---:|:---:|
| Q-F-05-missingCreatedAtColumn | F-05 | missingCreatedAtColumn | 499 | PASS | PASS | YES |
| Q-F-26-hasUserMetadataLeak | F-26 | hasUserMetadataLeak | 39 | PASS | PASS | YES |
| Q-F-18-hasSingularCompositeIndexName | F-18 | hasSingularCompositeIndexName | 11 | PASS | PASS | YES |
| Q-F-01-hasDuplicatePrimaryKey | F-01 | hasDuplicatePrimaryKey | 6 | PASS | PASS | YES |
| Q-F-19-hasRevokeWithoutPositiveGrant | F-19 | hasRevokeWithoutPositiveGrant | 4 | PASS | PASS | YES |
| Q-F-10-missingDeletedAtOnMutable | F-10 | missingDeletedAtOnMutable | 3 | PASS | PASS | YES |
