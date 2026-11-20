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

## 3. Pre-Registered Experimental Conditions ($K = 10$, Requested `temperature = 0`)

> **Decoding Disclosure:** Requested `temperature = 0` uniformly; provider-enforced sampling is disclosed for `Gemini 3.5 Flash-Lite` (API deprecates/ignores `temperature`, `top_p`, `top_k`) and `Kimi K3.1 Pro` (fixed `temperature = 1.0, top_p = 0.95` with always-on reasoning).

Each held-out test task (`V3-H-001`..`V3-H-120`) is evaluated once per condition (960 independent single-shot generations per model; no retry or reflection loop):

1. **`A` (Zero-Shot Baseline):** Task prompt only (`hint = undefined`).
2. **`D_safe` (Neutral PostgreSQL Internals Control):** 8 purely descriptive PostgreSQL storage/MVCC/WAL internals notes (`D_SAFE_TIPS`, zero DDL keywords; redesigned after v2's imperative placebo triggered schema-qualification syntax errors).
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

### §4.1 Primary Superiority Family & Equivalence Testing (TOST)
1. **`C_ID` vs `C`** (`tier: "primary"`) — Isolates the causal effect of preserving exact SQL identifiers during lesson distillation.
2. **`C0_clean` vs `C0`** (`tier: "primary"`) — Isolates the causal effect of repairing statement-level defects in v3 facts (`F-16`, `F-18`, `F-19`, `F-36`, etc.).
3. **`C0_clean` vs `C_ID`** (`tier: "primary"`) — Compares verbatim repaired Oracle rule text against identifier-preserving distilled lessons at identical retrieved fact IDs.
4. **`C0_clean` vs `C0_rand`** (`tier: "primary"`) — Isolates feature-matched Top-10 retrieval precision against a length-matched random 10-fact sample.
5. **`C_ID` vs `D_safe`** (`tier: "primary"`) — Tests identifier-preserving retrieval against neutral PostgreSQL internals context.

- **`D_safe` vs `A` Equivalence (`tier: "equivalence_tost"`):** Tested outside the 5-contrast primary Holm-Bonferroni family using Two One-Sided Tests (TOST) with equivalence margin $\pm 0.03$ ($\pm 3.0\text{ pp}$).
- **Secondary Contrasts (`tier: "secondary"`):** `C` vs `A`, `C0` vs `C`, `B` vs `A`, and the Difference-in-Differences contrast `(C_ID - C) - (C0_clean - C0)`.

### §4.2 Inference, Permutations, Power & Gated DGRR
- **Strict Split Guard:** `analyze-ablation-v3.ts` enforces that all analyzed trials belong strictly to the held-out `V3-H-*` split (`V3-H-001`..`V3-H-120`).
- **Add-One Sign-Flip Permutations:** All paired sign-flip permutation $p$-values use add-one smoothing $(b + 1) / (N + 1)$ over $100{,}000$ iterations (`seed = 20260101`), alongside Holm-Bonferroni step-down adjustment across the 5 primary superiority contrasts ($\alpha = 0.05$).
- **Minimum Detectable Effect (MDE):** Reported at $80\%$ power for both $\alpha = 0.05$ and $\alpha = 0.01$ from observed paired difference standard deviations.
- **Gated Distillation Gap Recovery Ratio (DGRR):** `(meanCId - meanC) / (meanC0Clean - meanC)` is computed only when the denominator's paired 95% bootstrap CI strictly excludes zero (`denominatorExcludesZero === true`); otherwise `recoveryRatio` is `null`.

### §4.3 Intention-to-Treat (ITT), Crash Censorship & Exposure Stratification
- **ITT & Conditional Decomposition:** Every condition reports ITT `meanBoundFactFraction` and `strictPassAt1` over all $n$ tasks, plus `pCommit` (`!tableMissing && !migrationExitNonZero`), `meanBoundFactFractionGivenCommit`, and `strictPassAt1GivenCommit`.
- **Exposure-Stratified `C0_clean` vs `C0`:** Stratified by whether `{F-01, F-18, F-19, F-36}` appeared in the task's deterministic Top-10 `retrievedFactIds` (`exposedAny`, `unexposedAll`, and per-fact).
- **`C0_rand` Bound Coverage:** Reports `c0RandBoundCoverage` (overlap between randomly sampled `C0_rand` facts and `boundFacts`).

### §4.4 Crossed Random-Effects LPMM (`logPromptTokens` & CR2 df Adjustment)
- **Model:**
  $$\text{passed}_{ij} \sim \text{condition} + \log(\text{promptTokens}) + (1 \mid \text{task}_i) + (1 \mid \text{fact}_j) + (1 \mid \text{cell}) + (1 \mid \text{fact}_j:\text{condition})$$
- **Inference:** Reports REML SEs, CR1 task-clustered sandwich SEs, and CR2 small-sample $t$-inference with $\text{df} = n_{\text{tasks}} - 1$.

### §4.5 Failure-Mode Attribution, Forensic Validity & Quarantine Isolation
- **Failure-Mode Attribution:** `src/verifier/sql-forensics.ts` strips SQL comments while preserving dollar-quoted PL/pgSQL bodies (`$$...$$`, `$tag$...$tag$`), scopes `hasDuplicatePrimaryKey` per `CREATE TABLE` block, separates `omittedSupersedesId` from `inventedLineageCol`, and classifies every flag into `execution_fatal`, `invariant_violating`, or `compliance_marker`.
- **Static Flag Validity & Audit:** `scripts/v3/validate-forensic-flags.ts` computes precision/recall/F1 against PostgreSQL 16 Oracle `failedFacts` and `migrationExitNonZero` (`out/v3/forensic-validity.json`) and exports a stratified 100-trial `out/v3/manual-audit-sample.csv`.
- **Authority Separation & Blinding:** `analyze-ablation-v3.ts` never reads `.axiom-state/quarantine/`. Quarantine candidates in `realtime-research-daemon.ts` carry `"scope": "v4-only"`, and `--blind` mode suppresses interim condition means and quarantine staging until a run reaches `960/960`.
