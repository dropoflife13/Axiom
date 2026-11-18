# Axiom Ablation v3 — Live Research Dossier

**Generated At:** 2026-11-18T04:33:59.859Z  
**Protocol:** Ablation v3 (`K=10`, Temperature `0`, 120 held-out `V3-H-001`..`V3-H-120` × 8 conditions = 960 trials/model)  
**Finalized Models (960/960):** 6 / 6  
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

### Quarantined Candidate Rules (`.axiom-state/quarantine/v3-candidates.json`)
| Candidate ID | Fact | Trigger Flag | Observed | Linter | Tokens | Ready |
|---|---|---|---:|:---:|:---:|:---:|
| Q-F-05-missingCreatedAtColumn | F-05 | missingCreatedAtColumn | 315 | PASS | PASS | YES |
| Q-F-26-hasUserMetadataLeak | F-26 | hasUserMetadataLeak | 36 | PASS | PASS | YES |
| Q-F-18-hasSingularCompositeIndexName | F-18 | hasSingularCompositeIndexName | 10 | PASS | PASS | YES |
| Q-F-01-hasDuplicatePrimaryKey | F-01 | hasDuplicatePrimaryKey | 6 | PASS | PASS | YES |
| Q-F-19-hasRevokeWithoutPositiveGrant | F-19 | hasRevokeWithoutPositiveGrant | 3 | PASS | PASS | YES |
| Q-F-10-missingDeletedAtOnMutable | F-10 | missingDeletedAtOnMutable | 3 | PASS | PASS | YES |
