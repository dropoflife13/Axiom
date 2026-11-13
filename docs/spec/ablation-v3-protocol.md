# Ablation v3 Pre-Registration Protocol Specification

**Status:** Frozen Pre-Registration (Part 3 Complete)  
**Date:** 2026-11-13  
**Harness:** `src/eval/ablation-v3.ts`  
**Output Directory:** `.axiom-state/runs-v3/<runId>/` (`checkpoint.json`, `results.json`)

---

## 1. Frozen Artifact Provenance (SHA-256)

All Ablation v3 runs enforce strict startup and resume hash verification against these exact artifact digests:

| Artifact | Path | SHA-256 Digest |
|---|---|---|
| PostgreSQL 16 Oracle | `scripts/oracle.ts` | `fc0d2168680d4f91daaa6cf0cead5eb90fec19f5e3a89ea737a271f276d7da28` |
| v3 Task Corpus (40 Train / 40 Dev / 120 Test) | `fixtures/task-v3/tasks.json` | `c64b3e8a718044b70c28bc5feaf86ad7132f7bd7cd695817dc7a41bc5331c680` |
| v2 Canonical Facts (uncorrected baseline) | `fixtures/task-v2/facts.json` | `c5a959088318715ac3367908c69c7c21bbd0ec64c8679849fcbd2ddf65688c72` |
| v3 Repaired Facts (34 active / 39 total) | `fixtures/task-v3/facts.json` | `35284d39899212e51fd267438f06b209ca1c3d9693b74f800d455b71bcded1e4` |
| v2 Distilled Memory | `.axiom-state/memory.json` | `e52059a7aa9957ea143b210284282ad2522ab2914370187fb9a95b5beb3a5a39` |
| v3 Identifier-Preserving Memory (`C_ID`) | `.axiom-state/memory-v3-cid.json` | `8c50a3a94df4c5699f6d7de2e64208a4fd96bd6ddd5e333b030a5e3bbadbcb1b` |
| Neutral PostgreSQL Internals Control (`D_safe`) | `scripts/v3/d-safe-tips.ts` | `60ec063b7be4645aac7f833b25a84002cceaacacd8f424a58c17c157f199f585` |
| Static Reference Hint (`B`) | Computed from `fixtures/task-v3/facts.json` | `66a79eacadfc7c08d946cbb4b9f34eb340b143871dace01f97a7db856b4b1962` |
| Neutral Control Hint (`D_safe`) | Computed from `formatDSafeHint()` | `589ce70b73f66996c4ca17aa4b4c624629a4bd280fef9a13251c9687b0d6685f` |
| Executor | `src/executor.ts` | `0a09f104b0fca526742c80d2868993d7cfb79b18ba49aada73eb67af47933e5b` |

---

## 2. Dataset & Oracle Gate

- **Train (`T-001`..`T-040`, $n=40$) & Dev (`D-001`..`D-040`, $n=40$):** Preserved verbatim from `fixtures/task-v2/tasks.json` so training calibration and retrieval priors remain unchanged.
- **Held-Out Test (`V3-H-001`..`V3-H-120`, $n=120$):**
  - Strictly balanced at 15 tasks per cell across the 8 cohorts (`C1_TTT`..`C8_FFF`) formed by `{tenant, append_only, ingestion}`.
  - Secondary flags (`status`, `view`, `sec_definer`, `latest_per_key`) and R2 `boundFacts` selection match the v2 protocol.
  - All 120 domain table nouns match `^[a-z]+(_[a-z]+)*s$` and have **zero overlap** with all 200 v2 table nouns (`T-*`, `D-*`, `H-*`).
  - **Golden SQL Verification:** 120 / 120 `V3-H-*` reference migrations verified **PASS (100.0%)** with 0 failed facts against live PostgreSQL 16 (`scripts/oracle.ts`).

---

## 3. Pre-Registered Experimental Conditions ($K = 10$, Temperature $= 0$)

Each held-out test task (`V3-H-001`..`V3-H-120`) is evaluated once per condition (960 independent single-shot generations per model; no retry or reflection loop):

1. **`A` (Zero-Shot Baseline):** Task prompt only (`hint = undefined`).
2. **`D_safe` (Neutral PostgreSQL Internals Control):** 8 purely descriptive PostgreSQL storage/MVCC/WAL internals notes (`D_SAFE_TIPS`, zero DDL keywords).
3. **`C` (Distilled Retrieval, v2):** Top $K=10$ applicable distilled lessons retrieved from `.axiom-state/memory.json`.
4. **`C0` (Verbatim Retrieval, Uncorrected v2 Statements):** Exact same Top $K=10$ fact IDs retrieved for `C`, mapped to original v2 statements in `fixtures/task-v2/facts.json`.
5. **`C0_clean` (Verbatim Retrieval, Repaired v3 Statements):** Exact same Top $K=10$ fact IDs retrieved for `C`, mapped to repaired v3 statements in `fixtures/task-v3/facts.json`.
6. **`C_ID` (Identifier-Preserving Distilled Retrieval):** Exact same Top $K=10$ fact IDs retrieved for `C`, mapped to identifier-preserving distilled lessons in `.axiom-state/memory-v3-cid.json`.
7. **`C0_rand` (Random Verbatim Fact Control):** $K=10$ distinct active facts sampled deterministically without replacement from `fixtures/task-v3/facts.json` using an LCG seeded by `FNV1a(taskId + ':C0_rand')`, injected verbatim.
8. **`B` (Static Reference):** All 34 active repaired canonical statements from `fixtures/task-v3/facts.json` injected statically.

---

## 4. Outcomes, Primary Contrasts & Inference Plan

### Outcomes
- **Primary Outcome:** `boundFactFraction` — proportion of task-bound facts satisfied per trial (0 if `F-13` table missing).
- **Secondary Outcomes:** `boundPassed` (all bound facts satisfied), `passRaw` (Oracle `passRaw`), prompt tokens, and total tokens.

### Pre-Registered Primary Contrasts (Tested in Fixed Order)
1. **`C_ID` vs `C`** — Isolates the causal effect of preserving exact SQL identifiers during lesson distillation.
2. **`C0_clean` vs `C0`** — Isolates the causal effect of repairing statement-level defects in v3 facts (`F-16`, `F-18`, `F-19`, `F-36`, etc.).
3. **`C0_clean` vs `C_ID`** — Compares verbatim repaired Oracle rule text against identifier-preserving distilled lessons at identical retrieved fact IDs.
4. **`C0_clean` vs `C0_rand`** — Isolates feature-matched Top-10 retrieval precision against a length-matched random 10-fact sample.
5. **`C_ID` vs `D_safe`** — Tests identifier-preserving retrieval against neutral PostgreSQL internals context.
6. **`D_safe` vs `A`** — Measures pure context/placebo effect of neutral internals text over zero-shot.

### Multiple Comparison & Modeling
- **Per-Model Inference:** Paired task-level mean difference across $n=120$ tasks with 95% confidence intervals and two-sided paired sign-flip permutation $p$-values ($10{,}000$ resamples).
- **Family-Wise Error Control:** Holm-Bonferroni step-down adjusted $p$-values across the 6 pre-registered primary contrasts ($\alpha = 0.05$) in the fixed index order above.
- **Crossed Random-Effects Sensitivity Model (REML):**
  $$\text{boundFactFraction}_{ij} \sim \text{condition} + (1 \mid \text{model}_i) + (1 \mid \text{task}_j) + (1 \mid \text{model}_i:\text{condition})$$
  with CR1 task-cluster-robust standard errors.
