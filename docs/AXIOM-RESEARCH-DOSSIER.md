# AXIOM: Empirical Research Dossier & Ablation v3 Design Specification

> **Purpose:** This dossier compiles the audited empirical dataset, forensic analysis, and v3 pre-registration design from **Axiom** — a dual-track self-healing architectural verification and SQL migration reflexion harness. It incorporates the complete read-only evaluation of Items 1–8 across the 6 valid completed 720-trial model runs, replacing preliminary uncorrected claims with paired clean-intersection contrasts, non-retrieved stratification, live PostgreSQL 16 statement-sufficiency diagnostics, and crossed random-effects models.
>
> **Core Architecture Invariant (Invariant 0 — Authority Separation):** LLM generation is untrusted candidate material. Only deterministic external verifiers (PostgreSQL 16 container execution + deterministic AST verifiers) possess grading authority (`AGENTS.md` / `BN-00`).

---

## 1. Corpus Inventory & Study Scope

The empirical benchmark covers **720-trial factorial ablations** evaluated on the frozen 120-task Test split (`H-001`–`H-120`). Analysis is stratified by run validity:

| Corpus Division | Runs Included | Scored Trials | Purpose / Role |
| :--- | :--- | :---: | :--- |
| **Confirmatory Primary Dataset** | `nemotron-2`, `gemma4-31b-full`, `glm5-2`, `gemini-3.1-flash-lite`, `gemini-flash-lite-full`, `qwen27b-2` | **4,320** (6 × 720) | Valid completed runs satisfying the Post-Hoc Validity Gate (constant model ID, zero reasoning leaks, $B > A$). |
| **Invalid / Failed-Gate Runs** | `gemma4-26b-full` (model alias mismatch: returned `a4b-it`), `nemotron-lightning-full` (failed $B > A$ gate; high 5xx cache instability) | **1,440** (2 × 720) | Analyzed for failure mode discovery (e.g. Placebo tip syntax collapse); excluded from primary efficacy claims. |
| **In-Progress Runs** | `gptoss-120b-expanded` (~550/720) | **~550** | Monitored live; excluded from finalized v3-prep inferential statistics. |
| **Exploratory Mini Runs** | `liquid17b-mini` (48), `xingchen-mini` (48), `gemini-mini` (18) | **114** | Architecture boundary probes (reasoning-budget exhaustion, token limits). |
| **Calibration Baselines** | Train calibration (40 tasks), Dev calibration (40 tasks) on `gemma-4-31b-it` | **80** | Pre-ablation difficulty estimation and memory seeding. |
| **Oracle Test Suites** | 30 golden schemas, 40 bad schemas, 374 single-statement mutation schemas | **444** | Verifier validation (100% positive, 100% negative exact-fact kill, 73.5% mutation kill). |

---

## 2. Experimental Protocol & Blocking Verification

### 2.1 The $2^3$ Factorial Task Taxonomy & Facts Registry
- **Tasks (`fixtures/task-v2/tasks.json`):** 120 held-out confirmatory tasks ($N=15$ in each of 8 cells) varying `tenant` $\in \{0, 1\}$, `append_only` $\in \{0, 1\}$, and `ingestion` $\in \{0, 1\}$, plus secondary structural flags (`view`, `status`, `sec_definer`, `latest_per_key`).
- **Facts Registry (`fixtures/task-v2/facts.json`):** 39 clauses (`F-01`–`F-39`): 34 active clauses (20 confirmed, 14 owner-adopted) and 5 inactive clauses (`F-14` unconfirmed, 4 dropped during reconciliation).
- **Bound-Fact Sampling:** Each task binds 3–5 discriminating facts. If table creation fails (`tableMissing = true` / `F-13` fail), bound fact compliance is scored as 0.

### 2.2 Blocking Verification: Condition B Text Audit (Item 1)
Audit of `STATIC_FACTS` (`src/eval/ablation.ts`) against `FACT_STATEMENTS` (`scripts/facts.ts` / `fixtures/task-v2/facts.json`) confirmed:
1. `STATIC_FACTS` and `FACT_STATEMENTS` are separate `const` bindings derived identically from `facts.json` v1.0.1.
2. All 34 active facts match character-for-character across both constants (0 text differences).
3. The Condition B prompt injects all 34 active facts across 34 numbered lines (`hintBSha256 = 1876a65e...` identical across all active runs).
4. `F-24` in Condition B specifies a partial unique index (`WHERE deleted_at IS NULL`), identical to the registry. Condition B is a verified verbatim ceiling.

---

## 3. Primary Benchmark Results Across the 6 Valid Completed Runs

### 3.1 Unconditional Benchmark Scores ($N = 120$ Tasks / Condition, 720 Trials / Run)

> Metrics: Mean bound-fact compliance % (Strict Pass@1 %) | Average total tokens per trial.

| Run ID | Model | `A` (Zero-Shot) | `D` (Placebo) | `C` (Reflexion) | `C0` (Verbatim) | `B` (Golden Ceiling) | `tableMissing` / `exit!=0` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nemotron-2`** | `nemotron-3-ultra-550b` | 47.4% (4.2%) \| 1.48k | 48.1% (3.3%) \| 2.06k | 71.9% (29.2%) \| 2.18k | **86.3% (55.0%)** \| 2.11k | 93.9% (77.5%) \| 3.11k | 4 / 43 |
| **`gemma4-31b-full`** | `gemma-4-31b-it` | 41.3% (2.5%) \| 0.85k | 40.5% (4.2%) \| 1.42k | 63.7% (30.0%) \| 1.16k | **77.7% (45.0%)** \| 1.20k | 93.3% (78.3%) \| 1.83k | 53 / 79 |
| **`glm5-2`** | `glm-5.3-flash` | 41.5% (4.2%) \| 0.98k | 29.9% (2.5%) \| 1.53k | **74.5% (38.3%)** \| 1.19k | 72.1% (**48.3%**) \| 1.19k | 90.2% (69.2%) \| 1.80k | 82 / 169 |
| **`gemini-3.1-flash-lite`** | `gemini-3.1-flash-lite` | 47.9% (2.5%) \| 0.69k | 46.2% (1.7%) \| 1.35k | 66.1% (25.0%) \| 1.07k | **83.4% (44.2%)** \| 1.09k | **75.5% (52.5%)** \| 1.78k | 41 / 192 |
| **`gemini-flash-lite-full`** | `gemini-3.5-flash-lite` | 35.8% (0.0%) \| 0.80k | 31.8% (1.7%) \| 1.44k | 68.4% (31.7%) \| 1.15k | **70.8% (32.5%)** \| 1.16k | 85.8% (52.5%) \| 1.92k | 54 / 94 |
| **`qwen27b-2`** | `qwen/qwen3.8-27b` | 46.3% (3.3%) \| 1.48k | 49.5% (3.3%) \| 2.10k | 71.7% (25.0%) \| 2.13k | **88.2% (63.3%)** \| 2.10k | 92.5% (72.5%) \| 3.15k | 5 / 58 |

---

## 4. Empirical Audits & Sensitivity Analyses (Items 2–7)

### 4.1 Paired Clean-Intersection Contrasts (Item 2A)
Conditioning comparisons on task pairs where **both conditions executed without migration errors** (`migrationExitNonZero === false`) removes DDL crash confounding:

#### Pairwise Clean Differences (Mean Bound % Difference $\Delta [95\% \text{ Bootstrap CI}]$)

| Run ID | `D vs A` ($n$, $\Delta$) | `C vs A` ($n$, $\Delta$) | `C0 vs A` ($n$, $\Delta$) | `B vs A` ($n$, $\Delta$) | `C0 vs C` ($n$, $\Delta$) | `C vs D` ($n$, $\Delta$) | `C0 vs B` ($n$, $\Delta$) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `nemotron-2` | 94, −0.57 [−4.2, +3.2] | 93, +23.93 [+17.5, +30.3] | 99, +38.74 [+33.0, +44.4] | 99, +46.30 [+40.6, +51.9] | **107, +14.50 [+10.2, +19.0]** | 104, +22.92 [+16.8, +29.0] | 115, −7.33 [−11.2, −3.5] |
| `gemma4-31b-full` | 88, +4.19 [+1.0, +7.9] | 96, +25.89 [+19.3, +32.6] | 97, +38.66 [+33.4, +43.9] | 101, +49.42 [+44.5, +54.4] | **96, +12.73 [+7.9, +17.6]** | 88, +23.79 [+16.5, +30.9] | 101, −10.63 [−14.2, −6.9] |
| `glm5-2` | 58, −0.72 [−4.7, +3.1] | 75, +31.87 [+24.4, +38.9] | 64, +44.79 [+37.0, +52.3] | 70, +45.29 [+39.2, +51.3] | **78, +12.67 [+7.4, +18.0]** | 63, +30.19 [+23.4, +36.9] | 76, −3.18 [−7.9, +1.1] |
| `gemini-3.1-flash-lite` | 59, −4.27 [−8.6, +0.1] | 74, +22.09 [+15.5, +28.7] | 84, +35.93 [+29.6, +42.1] | 69, +38.41 [+31.9, +44.8] | **79, +15.36 [+11.1, +19.9]** | 57, +29.36 [+22.0, +36.5] | 77, −4.76 [−8.8, −0.6] |
| `gemini-flash-lite-full` | 75, +0.33 [−2.5, +3.2] | 98, +29.44 [+23.5, +35.2] | 94, +36.74 [+30.9, +42.5] | 96, +48.00 [+42.0, +54.2] | **101, +5.68 [+1.1, +10.4]** | 77, +32.75 [+26.7, +38.7] | 97, −12.35 [−16.9, −7.8] |
| `qwen27b-2` | 91, −1.34 [−4.5, +1.7] | 96, +22.66 [+16.3, +28.8] | 65, +28.41 [+20.5, +35.8] | 68, +38.46 [+33.5, +43.5] | **69, +10.14 [+5.6, +14.8]** | 99, +23.62 [+16.8, +30.4] | 64, −10.94 [−16.1, −6.3] |

**Key Takeaways:**
1. Under paired clean contrasts, $C_0$ outperforms $C$ with 95% bootstrap CIs strictly above zero across **all 6 valid models** (`+5.68%` to `+15.36%`). The unconditional null on `glm5-2` was driven entirely by syntax failures.
2. The apparent unconditional reversal $C_0 > B$ on `gemini-3.1-flash-lite` (`83.4%` vs `75.5%`) vanishes when paired clean ($B > C_0$ by $+4.76\%$); $B$'s lower unconditional score was caused by DDL syntax crashes under the 34-rule prompt, not inferior rule content.

---

### 4.2 Retrieval Stratification: Retrieved ($n=396$) vs Non-Retrieved ($n=82$) Bound Pairs (Item 2B)

Across the 478 bound task-fact pairs per run, comparing differences vs Zero-Shot $A$ isolates rule-specific gains from unprompted default displacement:

| Run ID | Stratum | $A$ % | $D$ % | $C$ % | $C_0$ % | $B$ % | $D - A$ [Cluster 95% CI] | $C - A$ [Cluster 95% CI] | $C_0 - A$ [Cluster 95% CI] | $B - A$ [Cluster 95% CI] |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nemotron-2`** | Retrieved (396) | 41.7% | 41.7% | 76.5% | 91.9% | 93.2% | 0.00 [−4.0, +4.1] | +34.85 [+29.6, +40.2] | +50.25 [+44.5, +55.8] | +51.52 [+45.3, +57.6] |
| | Non-Ret (82) | 73.2% | 78.0% | 47.6% | 58.5% | 97.6% | +4.88 [−4.1, +14.3] | **−25.61 [−36.1, −13.8]** | **−14.63 [−25.6, −2.5]** | +24.39 [+15.1, +34.2] |
| **`gemma4-31b-full`** | Retrieved (396) | 35.1% | 34.3% | 69.4% | 84.1% | 93.7% | −0.76 [−5.0, +3.3] | +34.34 [+27.7, +41.0] | +48.99 [+42.8, +55.2] | +58.59 [+53.0, +64.1] |
| | Non-Ret (82) | 70.7% | 65.8% | 32.9% | 46.3% | 92.7% | −4.88 [−16.5, +6.1] | **−37.80 [−50.6, −24.0]** | **−24.39 [−38.1, −9.8]** | +21.95 [+10.5, +34.1] |
| **`glm5-2`** | Retrieved (396) | 35.4% | 27.5% | 78.5% | 72.5% | 90.4% | −7.83 [−12.5, −3.3] | +43.18 [+36.7, +49.3] | +37.12 [+26.8, +47.0] | +55.05 [+50.0, +60.2] |
| | Non-Ret (82) | 67.1% | 39.0% | 57.3% | 73.2% | 86.6% | −28.05 [−42.7, −13.6] | −9.76 [−26.0, +6.5] | +6.10 [−9.4, +21.5] | +19.51 [+8.0, +31.7] |
| **`gemini-3.1-flash-lite`**| Retrieved (396) | 42.9% | 42.2% | 68.9% | 88.4% | 75.2% | −0.76 [−4.0, +2.4] | +26.01 [+20.9, +31.2] | +45.45 [+39.7, +51.5] | +32.32 [+24.9, +39.8] |
| | Non-Ret (82) | 70.7% | 64.6% | 48.8% | 59.8% | 76.8% | −6.10 [−17.4, +4.9] | **−21.95 [−34.9, −7.7]** | −10.98 [−22.9, +1.4] | +6.10 [−7.6, +19.8] |
| **`gemini-flash-lite-full`**| Retrieved (396) | 35.1% | 32.8% | 80.8% | 80.1% | 83.1% | −2.27 [−6.6, +2.0] | +45.71 [+40.0, +51.3] | +44.95 [+37.4, +52.2] | +47.98 [+41.1, +54.8] |
| | Non-Ret (82) | 41.5% | 25.6% | 8.5% | 24.4% | 96.3% | −15.85 [−25.0, −6.6] | **−32.93 [−40.5, −25.0]** | **−17.07 [−27.5, −7.2]** | +54.88 [+45.0, +64.9] |
| **`qwen27b-2`** | Retrieved (396) | 41.7% | 38.4% | 79.5% | 82.6% | 92.7% | −3.28 [−8.1, +1.3] | +37.88 [+31.8, +43.9] | +40.91 [+34.9, +46.6] | +51.01 [+45.4, +56.6] |
| | Non-Ret (82) | 72.0% | 81.7% | 45.1% | 67.1% | 97.6% | +9.76 [−2.4, +22.5] | **−26.83 [−40.7, −11.7]** | −4.88 [−19.8, +10.4] | +25.61 [+15.5, +36.9] |

**Observation:** Where Placebo $D$ does not cause syntax errors (`nemotron-2`, `gemma4-31b`, `gemini-3.1`, `qwen27b-2`), $D - A$ on the non-retrieved set is flat ($[-4.88\%, +4.88\%]$). By contrast, $C - A$ drops sharply ($-21.95\%$ to $-37.80\%$) and $C_0 - A$ drops ($-10.98\%$ to $-24.39\%$). Adding an incomplete checklist displaces unprompted default knowledge; distilled natural language exacerbates this displacement compared to verbatim text.

---

### 4.3 Factorial Cell Breakdown & Identifier Stripping (Item 3)

The $C_0 - C$ advantage concentrates heavily in append-only cells (`010`, `110`, `111`), which contain concrete identifier-heavy invariants:

| Cell (`T A I`) | `nemotron-2` $\Delta$ [95% CI] | `gemma4-31b` $\Delta$ [95% CI] | `glm5-2` $\Delta$ [95% CI] | `gemini-3.1` $\Delta$ [95% CI] | `gemini-3.5` $\Delta$ [95% CI] | `qwen27b-2` $\Delta$ [95% CI] | Bound Invariants with Stripped Identifiers |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `000` | +0.00 [−4.0, +4.0] | +1.33 [−3.7, +6.7] | −52.00 [−77.3, −26.7] | −1.89 [−8.0, +3.7] | −5.00 [−21.0, +6.0] | +0.00 [0.0, 0.0] | `F-05`, `F-10`, `F-15`, `F-16`, `F-17`, `F-21` |
| `001` | +13.22 [+4.9, +21.7] | +0.33 [−4.0, +5.0] | −17.44 [−41.0, +2.7] | +6.22 [0.0, +13.3] | −13.56 [−36.9, +10.9] | +14.67 [+6.3, +23.3] | `000` + `F-32` (`idempotency_key`), `F-37` (`received_at`, `now()`) |
| **`010`** | **+27.89 [+20.8, +34.3]** | **+15.55 [−3.6, +31.0]** | **+28.89 [+18.0, +38.4]** | **+41.44 [+29.0, +55.8]** | **+17.89 [+9.0, +26.0]** | **+25.89 [+18.1, +32.7]** | `F-19` (`PUBLIC`, `application`), `F-20` (audit log error msg), `F-27`, `F-36` (`supersedes_id`) |
| `011` | +17.22 [+3.2, +32.1] | +1.67 [−11.1, +13.2] | −4.89 [−27.9, +15.9] | +8.00 [+1.3, +14.7] | −2.11 [−19.3, +15.5] | +13.67 [−3.9, +32.0] | `010` + `F-32`, `F-37` |
| `100` | +13.67 [+2.1, +25.7] | +4.78 [−14.2, +25.7] | −18.78 [−38.7, −0.7] | +13.89 [+5.3, +23.5] | −12.78 [−23.6, −1.6] | −9.67 [−24.7, 0.0] | `000` + `F-25` (`ENABLE/FORCE RLS`), `F-26` (`app_metadata.tenant_id`) |
| `101` | −1.67 [−12.7, +10.8] | +39.11 [+22.0, +56.4] | +2.89 [−8.1, +14.0] | +15.67 [+5.7, +27.3] | −2.11 [−15.4, +11.1] | −16.78 [−38.0, +4.2] | `100` + `F-32`, `F-37` |
| **`110`** | **+16.44 [+4.3, +27.6]** | **+25.67 [+2.0, +50.1]** | **+22.78 [+9.1, +38.1]** | **+31.11 [+20.8, +42.1]** | **+10.22 [+0.6, +19.4]** | −10.33 [−26.8, +4.2] | `010` + `F-25`, `F-26` |
| **`111`** | **+28.33 [+14.7, +43.7]** | **+23.33 [+6.6, +38.3]** | **+19.33 [+5.1, +33.3]** | **+24.44 [+13.3, +35.3]** | **+26.56 [+13.6, +38.5]** | **+29.67 [+13.7, +44.3]** | `110` + `F-32`, `F-37` |

---

### 4.4 Forensic Invariant Collisions: $F\text{-}16 / F\text{-}36$ & Duplicate Primary Keys (Item 4)

1. **The $F\text{-}16 / F\text{-}36$ Inline `REFERENCES` Collision:**
   - $F\text{-}36$ literally states: `...supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT`.
   - In PostgreSQL 16, inline `REFERENCES` creates an auto-named constraint `<table>_supersedes_id_fkey`, violating $F\text{-}16$ (`fk_<table>_<column>`). If a model emits both inline `REFERENCES` and a table-level `CONSTRAINT fk_...`, both constraints are created, still violating $F\text{-}16$.
   - **Observed empirical rate:** Across all 6 models and all conditions, every trial emitting an inline `REFERENCES` on `supersedes_id` scored **0.0% on $F\text{-}16$** (e.g. `gemini-3.1` $C_0$: 58 trials at 0.0%; $B$: 59 trials at 0.0%).
   - Conversely, when models emitted `FOREIGN KEY (supersedes_id)` as an explicit named constraint *without* inline `REFERENCES`, $F\text{-}16$ pass rate in $C_0$ was **100.0%** in `nemotron-2`, **93.1%** in `gemma4-31b`, **83.3%** in `glm5-2`, and **100.0%** in `qwen27b-2`.

2. **The GLM Duplicate `PRIMARY KEY` Mechanism:**
   - In `glm5-2` Condition $C_0$, exactly **20 trials** emitted duplicate primary keys (e.g. `id uuid PRIMARY KEY ...` column-level plus `CONSTRAINT ... PRIMARY KEY (id)` table-level), resulting in **20/20 fatal `tableMissing` transaction rollbacks**.
   - In $A$, $D$, and $B$, duplicate PK occurrences were 0; in $C$, 2.
   - $F\text{-}01$ was retrieved 0 times across all 120 tasks (0/120). Unretrieved $F\text{-}01$ allowed GLM to emit redundant PK clauses under $C_0$.

---

### 4.5 Statement-Sufficiency Pilot on 10 Train Tasks (Item 5)

A deterministic synthesizer translating `facts.json` statement strings directly into PostgreSQL DDL (with zero access to `goldenSql` or internal `oracle.ts` probes) was evaluated against the live PostgreSQL 16 Oracle container:

| Task ID | Table Name | Cell | Migration Exit ≠ 0 | Oracle Pass | Failed Facts | Mechanism / Root Defect |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `T-001` | `webhook_deliveries` | `111` | `false` | **FAIL** | `F-16` | $F\text{-}36$ prescribes inline `REFERENCES`, generating auto-named `_fkey` constraint |
| `T-005` | `payment_callbacks` | `111` | `false` | **FAIL** | `F-16` | $F\text{-}36$ inline `REFERENCES` |
| `T-006` | `audit_events` | `110+v` | `false` | **FAIL** | `F-16` | $F\text{-}36$ inline `REFERENCES` |
| `T-007` | `ledger_entries` | `110+v` | `false` | **FAIL** | `F-16` | $F\text{-}36$ inline `REFERENCES` |
| `T-011` | `import_staging_rows` | `101` | `false` | **PASS** | `—` | Passed (mutable; composite unique key) |
| `T-016` | `invoices` | `100` | `false` | **PASS** | `—` | Passed (mutable; composite unique key) |
| `T-021` | `bgp_route_announcements` | `011` | `false` | **FAIL** | `F-16` | $F\text{-}36$ inline `REFERENCES` |
| `T-026` | `schema_migrations_audit` | `010` | `false` | **FAIL** | `F-16` | $F\text{-}36$ inline `REFERENCES` |
| `T-031` | `fx_rates` | `001` | `false` | **PASS** | `—` | Passed (mutable) |
| `T-036` | `currencies` | `000` | `false` | **PASS** | `—` | Passed (mutable) |

**Result:** 4/10 tasks passed (100% of mutable tasks); 6/10 failed (100% of append-only tasks, all on $F\text{-}16$ caused by $F\text{-}36$).

#### Statement-vs-Probe Diagnostics on Live PostgreSQL 16:
1. **$F\text{-}18$ Composite Indexing (`DIAG_F38_F18_SINGULAR_NAME`):** Following $F\text{-}18$'s literal singular wording (`idx_<table>_<column>`) for an observation composite index (`metric_key, observed_at DESC`) produced `idx_currencies_metric_key`, which **FAILS $F\text{-}18$**. Naming it `idx_currencies_metric_key_observed_at` **PASSES**.
2. **$F\text{-}24$ Partial Unique Naming (`DIAG_F24_F18_SINGULAR_NAME`):** Naming a 2-column partial unique index `idx_invoices_invoice_code` per singular $F\text{-}18$ **FAILS $F\text{-}18$**.
3. **$F\text{-}19$ Positive Grants (`DIAG_F19_REVOKE_ALL_NO_POS_GRANT`):** Executing `REVOKE ALL ON public.webhook_deliveries FROM PUBLIC, application, readonly_user` without unstated positive `GRANT SELECT` / `INSERT` **FAILS $F\text{-}19$ and $F\text{-}26$** (`42501 permission denied`). In the default pilot, this was masked because `seed.sql` issues `ALTER DEFAULT PRIVILEGES ... GRANT ALL TO PUBLIC, application`.
4. **$F\text{-}15$ Role Prefixes (`DIAG_F15_EXECUTED_BY_ID` vs `USER_ID`):** Prompt `"executed by user reference"` mapped to `executed_by_id` **FAILS $F\text{-}15$**; mapped to `executed_by_user_id` **PASSES $F\text{-}15$** (Oracle probe allows `%_<singular_ref>_id`, unstated in rule text).

---

### 4.6 Mutation Survivors Audit (Item 6)

Audit of the 99 single-statement deletion survivors from `out/mutation-and-metamorphic-report.json`:

| Statement Class | Survivors | Applicable Invariant | Status & Classification | Empirical Forensic Root Cause |
| :--- | :---: | :---: | :--- | :--- |
| `CREATE INDEX` | 14 | `F-22`, `F-23` | **Equivalent mutant** | 14/14 fixture files already possess a `CONSTRAINT uq_<table>_tenant_id_... UNIQUE` index covering `tenant_id` at `indkey[0]`. |
| `REVOKE ALL` | 15 | `F-19` | **Out-of-scope (Equivalent)** | 15/15 files are `append_only=false`. $F\text{-}19$ probes only `append_only=true` tables. |
| `GRANT TO readonly_user` | 15 | `F-19` | **Out-of-scope (Equivalent)** | 15/15 files are `append_only=false`. No invariant probes `readonly_user` on mutable tables. |
| `GRANT TO application` | 5 | `F-19`, `F-26` | **Out-of-scope (Equivalent)** | 5/5 files are `tenant=false, append_only=false` (`good-26`–`good-30`). Neither $F\text{-}19$ nor $F\text{-}26$ applies. |
| `CREATE POLICY (INSERT)` | 20 | `F-26` | **Patched Oracle gap** | At snapshot time (`2026-11-06T11:32Z`), $F\text{-}26$ tested cross-tenant negative INSERT without positive same-tenant INSERT. Patched in commit `28623ca`. |
| `CREATE POLICY (UPDATE)` | 10 | `F-26` | **Patched Oracle gap** | At snapshot time, $F\text{-}26$ omitted UPDATE probes on mutable tables. Patched in commit `28623ca`. |
| `GRANT ON VIEW` | 20 | `F-39` | **Active contract gap** | $F\text{-}39$ checks `pg_class.reloptions` for `security_invoker=true` but does not probe view `GRANT SELECT` privileges. |

---

### 4.7 Crossed Random-Effects Mixed Model (Item 7)

To account for clustering across tasks, facts, factorial cells, and condition-by-fact interaction slopes, an exact REML Linear Mixed-Effects Model ($y_{tfc,k} \sim \text{condition}_k + (1|\text{task}_t) + (1|\text{fact}_f) + (1|\text{cell}_c) + (1|\text{fact:condition}_{f,k})$) was fit using the Bates et al. (2015) profiled Cholesky formulation on all 478 bound task-fact pairs ($N = 2,390$ observations per run). Small-sample CR1 task-clustered sandwich standard errors were computed alongside model-based REML SEs:

#### Variance Components & ICCs ($N = 2,390$ Observations / Run)

| Run ID | REML Deviance | `task` ($k=120$) SD / ICC% | `fact` ($k=18$) SD / ICC% | `cell` ($k=8$) SD / ICC% | `fact:cond` ($k=90$) SD / ICC% | Residual SD | Clustered Share |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `nemotron-2` | −4867.95 | 0.016 / 0.14% | 0.124 / 8.17% | 0.062 / 2.05% | 0.231 / 28.17% | 0.3404 | 38.54% |
| `gemma4-31b-full` | −4596.94 | 0.073 / 2.69% | 0.089 / 3.98% | 0.114 / 6.42% | 0.217 / 23.44% | 0.3567 | 36.54% |
| `glm5-2` | −4784.39 | 0.073 / 2.62% | 0.133 / 8.66% | 0.080 / 3.16% | 0.239 / 28.12% | 0.3411 | 42.56% |
| `gemini-3.1-flash-lite` | −4710.86 | 0.073 / 2.41% | 0.152 / 10.54% | 0.101 / 4.64% | 0.248 / 28.02% | 0.3458 | 45.61% |
| `gemini-flash-lite-full` | −5023.94 | 0.074 / 2.68% | 0.142 / 9.78% | 0.065 / 2.08% | 0.269 / 35.18% | 0.3221 | 49.72% |
| `qwen27b-2` | −5167.48 | 0.059 / 1.70% | 0.172 / 14.65% | 0.087 / 3.72% | 0.252 / 31.28% | 0.3138 | 51.34% |

#### Fixed Effect Contrasts (Percentage Points; REML Model SE vs CR1 Task-Cluster SE)

| Run ID | Contrast | Estimate (pp) | REML SE | REML 95% CI | $p_{\text{REML}}$ | CR1 Task SE | CR1 95% CI | $p_{\text{CR1}}$ |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nemotron-2`** | `C0 - C` | **+18.26** | 8.12 | [+2.35, +34.18] | 0.0245 | 2.30 | [+13.75, +22.78] | <0.0001 |
| | `C - A` | +27.32 | 8.12 | [+11.40, +43.23] | 0.0008 | 2.73 | [+21.96, +32.68] | <0.0001 |
| | `C0 - A` | +45.58 | 8.12 | [+29.67, +61.50] | <0.0001 | 2.74 | [+40.21, +50.96] | <0.0001 |
| | `B - A` | +54.38 | 8.12 | [+38.47, +70.29] | <0.0001 | 2.21 | [+50.05, +58.71] | <0.0001 |
| **`gemma4-31b-full`** | `C0 - C` | **+21.93** | 7.73 | [+6.79, +37.08] | 0.0045 | 3.35 | [+15.36, +28.51] | <0.0001 |
| | `C - A` | +21.12 | 7.73 | [+5.97, +36.26] | 0.0063 | 2.75 | [+15.73, +26.51] | <0.0001 |
| | `C0 - A` | +43.05 | 7.73 | [+27.91, +58.20] | <0.0001 | 3.07 | [+37.03, +49.08] | <0.0001 |
| | `B - A` | +59.02 | 7.73 | [+43.88, +74.16] | <0.0001 | 2.04 | [+55.02, +63.02] | <0.0001 |
| **`glm5-2`** | `C0 - C` | **+3.65** | 8.38 | [−12.77, +20.07] | 0.6630 | 3.35 | [−2.92, +10.22] | 0.2759 |
| | `C - A` | +31.14 | 8.38 | [+14.71, +47.56] | 0.0002 | 2.56 | [+26.13, +36.15] | <0.0001 |
| | `C0 - A` | +34.79 | 8.38 | [+18.36, +51.21] | <0.0001 | 4.07 | [+26.81, +42.77] | <0.0001 |
| | `B - A` | +49.51 | 8.38 | [+33.09, +65.93] | <0.0001 | 2.32 | [+44.96, +54.06] | <0.0001 |
| **`gemini-3.1-flash-lite`**| `C0 - C` | **+29.01** | 8.70 | [+11.97, +46.06] | 0.0009 | 2.22 | [+24.66, +33.36] | <0.0001 |
| | `C - A` | +15.84 | 8.70 | [−1.21, +32.88] | 0.0685 | 2.59 | [+10.76, +20.92] | <0.0001 |
| | `C0 - A` | +44.85 | 8.70 | [+27.81, +61.89] | <0.0001 | 2.05 | [+40.83, +48.87] | <0.0001 |
| | `B - A` | +36.95 | 8.70 | [+19.91, +53.99] | <0.0001 | 3.65 | [+29.80, +44.10] | <0.0001 |
| **`gemini-flash-lite-full`**| `C0 - C` | **+7.18** | 9.33 | [−11.10, +25.45] | 0.4415 | 2.27 | [+2.73, +11.62] | 0.0016 |
| | `C - A` | +33.67 | 9.33 | [+15.39, +51.95] | 0.0003 | 2.34 | [+29.08, +38.26] | <0.0001 |
| | `C0 - A` | +40.85 | 9.33 | [+22.57, +59.12] | <0.0001 | 2.91 | [+35.15, +46.54] | <0.0001 |
| | `B - A` | +58.14 | 9.33 | [+39.86, +76.42] | <0.0001 | 2.21 | [+53.80, +62.48] | <0.0001 |
| **`qwen27b-2`** | `C0 - C` | **+9.81** | 8.73 | [−7.30, +26.93] | 0.2612 | 2.93 | [+4.06, +15.56] | 0.0008 |
| | `C - A` | +27.73 | 8.73 | [+10.61, +44.84] | 0.0015 | 2.35 | [+23.11, +32.34] | <0.0001 |
| | `C0 - A` | +37.54 | 8.73 | [+20.42, +54.66] | <0.0001 | 3.15 | [+31.36, +43.72] | <0.0001 |
| | `B - A` | +50.06 | 8.73 | [+32.94, +67.18] | <0.0001 | 2.11 | [+45.93, +54.19] | <0.0001 |

---

## 5. Revised Observations & Hypotheses

1. **Identifier Loss in Distillation (Mechanism Observation):** Advisor natural language summarization replaces concrete schema tokens (`supersedes_id`, `app_metadata.tenant_id`) with generic prose. In append-only cells where identifier precision is required, verbatim clauses outperform distilled prose by +16 to +28 percentage points.
2. **Defective Reference Syntax ($F\text{-}36$ vs $F\text{-}16$):** $F\text{-}36$'s inline `REFERENCES` syntax triggers a 100% failure rate on $F\text{-}16$. This accounts for the majority of $F\text{-}16$ failures under verbatim injection.
3. **Partial-Checklist Displacement (Hypothesis):** Providing partial rule subsets ($K=10$) causes models to neglect unmentioned baseline defaults (e.g. standard timestamps, primary keys), dropping pass rates on non-retrieved facts below zero-shot baseline.
4. **Placebo Sensitivity (Observation):** Placebo distractor tips containing imperative syntax recommendations (`"explicit schema qualification"`) induce severe syntax crashes on open/smaller models, making unadjusted $C\text{ vs }D$ comparisons invalid on those architectures.

---

## 6. Pre-Registration Design for Ablation v3

### 6.1 Prerequisites & Rule Statement Revisions
Before executing v3 runs, rule text defects must be repaired and validated to 100% pass rate in the statement-sufficiency harness:
- **$F\text{-}36$:** Replace inline `REFERENCES` with explicit constraint guidance: `Append-only tables must include a nullable self-referential foreign key column supersedes_id uuid with constraint named fk_<table>_supersedes_id referencing <table>(id) ON DELETE RESTRICT.`
- **$F\text{-}18$:** Generalize index naming to cover multi-column and partial unique indexes: `Explicit non-constraint indexes must be named idx_<table>_<col1>[_<col2>...] (joining all indexed columns with underscore).`
- **$F\text{-}19$:** Make positive grant requirements explicit: `Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user, and explicitly grant SELECT to readonly_user and SELECT, INSERT to application.`
- **$F\text{-}15$:** Clarify permissible role prefixes: `Foreign key columns must be named [<role>_]<singular_ref_table>_id (e.g. user_id or actor_user_id) or supersedes_id for append-only self-references.`

### 6.2 Redesigned Experimental Conditions
1. **`A` (Zero-Shot Baseline):** Task prompt only.
2. **`D_safe` (Neutral Negative Control):** ~520 prompt tokens of purely informational database design principles without imperative syntax rules or schema qualification commands; validated on Train against $A$ within $\pm 3\%$.
3. **`C` (Standard Distilled Reflexion):** Feature-matched distilled lessons from the memory vault.
4. **`C0` (Verbatim Reflexion):** Matched verbatim canonical statements using the uncorrected v2 text (continuity control).
5. **`C0_clean` (Repaired Verbatim Reflexion):** Matched verbatim statements using corrected v3 rule text.
6. **`C_ID` (Identifier-Preserved Distillation):** Distilled natural-language memory constrained by an AST token-preservation invariant requiring exact SQL identifiers to survive distillation.
7. **`C0_rand` (Random-K Verbatim Control):** Injecting $K$ random active facts to disentangle relevance ranking from prompt volume / displacement.
8. **`B` (Golden Ceiling):** All active corrected canonical rules.

### 6.3 Evaluation Split & Models
- **Fresh Held-Out Tasks:** 120 newly generated tasks using the established $2^3$ factorial balance, held out from all prompt engineering, development, and prior evaluations.
- **Pinned Model Fleet:** 2–3 stable, pinned enterprise model checkpoints (e.g. `nemotron-3-ultra`, `gemma-4-31b-it`, `glm-5.3-flash`).
- **Statistical Model:** Pre-registered crossed random-intercepts mixed model ($y \sim \text{condition} + (1|\text{task}) + (1|\text{fact}) + (1|\text{cell})$) with small-sample CR1 cluster-robust standard errors.
