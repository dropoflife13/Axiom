# Axiom: Deterministic Verification and Failure-Prioritized Rule Retrieval in Relational Schema Migration

## Abstract

Automated software engineering agents frequently generate syntactically plausible database migrations that silently violate critical application invariants, such as multi-tenant isolation boundaries, row-level security (RLS) enforcement, immutable audit logging, and privilege separation. Traditional evaluation approaches rely on large language models (LLMs) to inspect code; however, LLM-based verification suffers from correlated blind spots, non-determinism, and hallucinated compliance.

In this work, we present **Axiom**, a dual-track architectural verification and evaluation system founded on the strict design principle of **Authority Separation (Invariant 0)**: *generative language models are untrusted candidate producers and only external deterministic execution oracles hold grading authority*. Axiom couples two decoupled mechanisms: (1) an *operational reflexion loop* that enforces deterministic grammar, vault consistency, and executable security AST checks on agent architecture rules, and (2) an *empirical SQL migration ablation harness* evaluating candidate DDL against an isolated PostgreSQL 16 container oracle across an 8-cell factorial corpus of {{held_out_tasks_count}} held-out enterprise migration tasks.

We report results from an extensive empirical evaluation across **{{independent_generations}} independent model generations ({{total_trials}} scored trials)** across {{confirmatory_runs_count}} valid completed runs meeting a pre-registered post-hoc validity gate: `nvidia/nemotron-3-ultra-550b`, `google/gemma-4-31b-it`, `zhipu/glm-5.3-flash`, `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`, and `qwen/qwen3.8-27b`. Crucially, the ablation harness evaluates single-turn generation without iterative retry or in-trial reflection, testing whether historical failure lessons harvested offline improve subsequent first-turn compliance.

Retrieval of failure-prioritized rule text improved compliance over zero-shot in all six valid models (+18.19 to +33.04 points). Verbatim rule text beat LLM-distilled paraphrases in four of six models under the pre-registered analysis ({{summary_sig_c0_c_min_diff}} to {{summary_sig_c0_c_max_diff}} points), with no detectable difference in the other two.

Our principal findings demonstrate:

1. **Failure-Prioritized Rule Retrieval Utility (H1):** In-context injection of failure-prioritized rules (Condition C) produces large, statistically significant improvements over zero-shot baselines (Condition A) across all six models, increasing mean bound-fact compliance by {{summary_c_a_min_diff}} to {{summary_c_a_max_diff}} percentage points (paired sign-flip $p < 0.0001$).
2. **The Distillation Penalty (H3):** In the pre-registered primary analysis across all {{held_out_tasks_count}} test tasks, verbatim injection of canonical rule statements ($C_0$) significantly outperforms natural-language lesson summaries ($C$) in **4 of 6 models** (`nemotron-2`, `gemma4-31b-full`, `gemini-3.1-flash-lite`, and `qwen27b-2`, with Holm-adjusted $p \le 0.0001$). In secondary clean-intersection sensitivity analysis conditioning on migrations that execute without DDL syntax errors, $C_0$ exceeds $C$ across **all six models** by **{{summary_clean_c0_c_min_diff}} to {{summary_clean_c0_c_max_diff}} percentage points**. Specifically, in cells `010` and `111`, verbatim rules ($C_0$) outperform distilled summaries ($C$) across all six models ({{summary_ao_010_min_diff}} to {{summary_ao_010_max_diff}} pp in `010`; {{summary_ao_111_min_diff}} to {{summary_ao_111_max_diff}} pp in `111`), and in cell `110` across five of six models ({{summary_ao_110_5models_min_diff}} to {{summary_ao_110_5models_max_diff}} pp, with `qwen27b-2` at {{summary_ao_110_qwen_diff}} pp due to $F\text{-}36$ inline `REFERENCES` collisions), while cell `011` ranges from {{summary_ao_011_min_diff}} to {{summary_ao_011_max_diff}} pp across models, where natural language summaries strip concrete SQL identifiers (`supersedes_id`, `app_metadata.tenant_id`).
3. **Exploratory Efficiency Frontier (H4):** Evaluating Condition C against Condition B, and computing exploratory $C_0 / B$ compliance ratios across models, $C_0$ achieves {{summary_c0_b_min_ratio}} to {{summary_c0_b_max_ratio}} of the performance of the static reference condition ($B$, which injects all {{active_facts_count}} active rules), while reducing prompt token consumption by {{summary_c0_prompt_min_reduction}} to {{summary_c0_prompt_max_reduction}}. Condition B is evaluated as a static in-context reference, not an unreachable ceiling.
4. **Partial-Checklist Displacement:** When supplied with a partial subset of $K=10$ retrieved rules, models regress below zero-shot baseline on non-retrieved bound facts, indicating that incomplete in-context checklists displace unprompted default knowledge.
5. **Forensic Invariant Collisions:** Verbatim rule injection can fail when canonical statements contain latent syntactic ambiguities. Specifically, an inline `REFERENCES` clause in invariant $F\text{-}36$ induces a 100% failure rate on constraint-naming rule $F\text{-}16$, and unretrieved primary key guidance in GLM-5.3 triggers fatal duplicate primary key syntax crashes.

Finally, we report a crossed random-effects linear mixed model ($y \sim \text{condition} + (1|\text{task}) + (1|\text{fact}) + (1|\text{cell}) + (1|\text{fact:condition})$) confirming that invariant and condition-by-fact clustering account for the predominant share of variance, and document protocol deviations and study limitations.

---

## 1. Introduction

Autonomous software engineering agents powered by large language models (LLMs) are increasingly applied to database schema design, catalog administration, and data migration generation. In relational database engineering, code defects carry catastrophic operational risks: an omitted index degrades query performance across millions of rows, an unrevoked table grant allows unauthorized mutation of financial ledgers, and an absent Row-Level Security (RLS) policy leaks multi-tenant data across customer boundaries.

A common paradigm in agent architectures is self-reflection or "LLM-as-a-judge" (Shinn et al., 2023), wherein a model critiques and refines its own generated code. Recent investigations have demonstrated that self-evaluation in formal software engineering suffers from correlated blind spots and hallucinated compliance: language models frequently misjudge subtle compiler semantics and falsely assume their generated code satisfies formal invariants (Zhao et al., 2026; Zhang et al., 2026).

To resolve this challenge, we introduce **Axiom**, a dual-track architectural verification and evaluation system founded on **Authority Separation (Invariant 0)**: *all LLM output is untrusted candidate material and only external deterministic execution oracles hold grading authority*. Axiom decouples candidate generation from grading authority across two tracks:
* **Track 1 (Operational Architecture Reflexion):** Enforces RFC 2119 keyword syntax, cross-domain citation integrity, and deterministic AST verification over agent rulebooks, staging candidate rules in an isolated quarantine until verified.
* **Track 2 (Empirical SQL Migration Ablation):** Evaluates single-turn migration DDL generation against an isolated PostgreSQL 16 container oracle across an 8-cell factorial corpus of {{held_out_tasks_count}} held-out enterprise tasks.

Crucially, the Track 2 ablation harness evaluates single-turn generation with **no retry or reflection loop** during testing. Models receive the task prompt (along with condition-specific in-context rules) and generate a single candidate migration. This isolates whether rules harvested from historical failures improve subsequent zero-shot generation, eliminating confounding from multi-turn conversational repair.

This paper presents the complete empirical findings from the Track 2 program across **{{independent_generations}} independent generations ({{total_trials}} scored trials)** spanning six distinct model families: `nvidia/nemotron-3-ultra-550b`, `google/gemma-4-31b-it`, `zhipu/glm-5.3-flash`, `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`, and `qwen/qwen3.8-27b`.

---

## 2. Evaluation Architecture & Execution Harness

The Track 2 evaluation harness decouples generation, retrieval, execution, and analysis into independent stages:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TRACK 2 EVALUATION HARNESS                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   ┌────────────────────┐          ┌───────────────────┐         ┌──────────────────┐   │
│   │   Task Generator   │ ───────> │ Model Executor    │ ──────> │ Candidate DDL    │   │
│   │   (Factorial 2³)   │          │ (Greedy, T=0)     │         │ (Untrusted)      │   │
│   └────────────────────┘          └───────────────────┘         └─────────┬────────┘   │
│                                                                           │            │
│   ┌────────────────────┐          ┌───────────────────┐                   │            │
│   │ Canonical Contract │          │ Failure-Prioritized│                  │            │
│   │ Registry (39 Facts)│ ───────> │ Rule Retrieval    │                   │            │
│   └────────────────────┘          │ Engine (K=10)     │                   ▼            │
│                                   └─────────┬─────────┘          ┌─────────────────┐   │
│                                             │                    │ PostgreSQL 16   │   │
│                                             └──────────────────> │ Docker Oracle   │   │
│                                                                  │ (Deterministic) │   │
│                                                                  └────────┬────────┘   │
│                                                                           │            │
│                                                                           ▼            │
│                                                                  ┌─────────────────┐   │
│                                                                  │ Offline Multi-  │   │
│                                                                  │ Model Analysis  │   │
│                                                                  └─────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Model Generation Executor
The Executor (`src/executor.ts`) interfaces with model endpoints via OpenAI-compatible APIs (NVIDIA NIM and Google AI Studio) using greedy decoding (`temperature = 0`). It enforces strict model verification (`assert returnedModel === requestedModel`) on every API completion. Transient network errors (HTTP 429, 5xx) trigger exponential backoff retries (capped at 3 attempts); deterministic provider failures (`length` truncation, `content-filter`, or empty responses) are recorded losslessly without terminating the harness.

### 2.2 Failure-Prioritized Rule Retrieval Engine
The Retrieval Engine (`src/memory.ts`) matches historical failure rules to active task prompts based on structured feature flags (`tenant`, `append_only`, `ingestion`). Lessons were harvested from offline training failures where an Advisor (`deepseek-ai/deepseek-v4.1-flash`) summarized failure traces into concise natural language rules ($\le 24$ words). Crucially, retrieval does not execute an LLM: it ranks candidate rules deterministically by:
1. Training failure frequency descending (`trainFailureRate`), prioritizing invariants the model historically failed most often;
2. Feature compatibility score ($10 \times \text{featureMatch} + \text{utilityScore}$);
3. Least-recently-used recency tracking (`lastUsedAt` descending);
4. Canonical error code ascending (`errorCode`).

Up to $K=10$ lessons are injected into the prompt. In Condition C, the Advisor's distilled summary is injected. In Condition C0, the canonical Oracle invariant statement from the contract registry is injected verbatim using identical ranking.

### 2.3 PostgreSQL 16 Docker Migration Oracle
The Oracle (`scripts/oracle.ts`) executes each candidate migration against a fresh, isolated PostgreSQL 16 container database. It applies canonical seed schemas (`public.tenants`, `public.users`, `public.customers`, `auth.jwt()`), runs the candidate DDL, and probes catalog state and runtime behavior using deterministic SQL assertions. The Oracle measures both continuous bound-fact compliance and strict zero-fault Pass@1.

### 2.4 Offline Analysis Pipeline
The analysis pipeline (`scripts/analyze-ablation-v2.ts`) processes trial checkpoints offline. It computes paired sign-flip randomization tests (100,000 iterations), paired percentile bootstrap confidence intervals (10,000 resamples), exact McNemar tests on discordant pairs, Holm-Bonferroni step-down multiplicity adjustments across confirmatory contrast families, and crossed random-effects linear mixed models.

---

## 3. Dataset, Task Design, and Invariant Formulation

### 3.1 Task Corpus & Factorial Taxonomy
The evaluation dataset (`fixtures/task-v2/tasks.json`) contains 200 frozen database migration prompts, stratified into three distinct splits:
* **Training Split (40 tasks, `T-001` to `T-040`):** Used to calibrate baseline failure rates and construct the initial training failure memory.
* **Development Split (40 tasks, `D-001` to `D-040`):** Used for pre-registration parameter sweeps (e.g., tuning retrieval budget $K$).
* **Held-Out Test Split ({{held_out_tasks_count}} tasks, `H-001` to `H-120`):** Reserved strictly for confirmatory evaluation.

Tasks are uniformly balanced across an $2^3 = 8$ factorial design of foundational enterprise feature flags, with exactly {{tasks_per_cell}} tasks per cell:

{{table_feature_definitions}}

### 3.2 The 39-Fact Enterprise Contract Registry
The contract registry (`fixtures/task-v2/facts.json`) defines {{total_registry_facts_count}} enterprise database invariants. Table 1 lists all facts, canonical statements, applicability rules, and verification statuses:

{{table_facts}}

Of the {{total_registry_facts_count}} registry facts, {{active_facts_count}} are active confirmed facts eligible for evaluation; 5 remain inactive (`PROPOSED`, `UNCONFIRMED`, or `DROPPED` during schema reconciliation).

### 3.3 The R2 Bound-Fact Selection Protocol
Evaluating every task against all {{active_facts_count}} facts dilutes scores with ubiquitous conventions (such as basic table creation). Axiom binds 3 to 5 discriminating facts per task using the pre-registered `R2` protocol (`scripts/propose-bound-facts.ts`):
1. Candidate facts must apply to $\ge 3$ training tasks and exhibit a Training Condition A pass rate $\le 0.80$ (yielding 18 discriminating candidate facts).
2. For each task $t$, a deterministic target count is derived: $\text{target} = 3 + (\text{seed} \pmod 3) \in \{3, 4, 5\}$.
3. Facts are bound deterministically from the task's applicable candidate facts. Across all {{held_out_tasks_count}} test tasks, 478 task-fact pairs are bound.

### 3.4 Condition B Text Audit
To ensure that the static reference condition ($B$) provides an authentic benchmark, we audited `STATIC_FACTS` (`src/eval/ablation.ts`) against `FACT_STATEMENTS` (`scripts/facts.ts` / `fixtures/task-v2/facts.json`):
1. `STATIC_FACTS` and `FACT_STATEMENTS` are derived identically from `facts.json` v1.0.1.
2. All {{active_facts_count}} active facts match character-for-character across both constants (**0 text differences**).
3. The Condition B prompt injects all {{active_facts_count}} active facts across {{active_facts_count}} numbered lines (`hintBSha256 = 1876a65e...` identical across all active runs).
4. `F-24` in Condition B specifies a partial unique index (`WHERE deleted_at IS NULL`), identical to the registry. Condition B represents a verified verbatim static reference.

---

## 4. Experimental Setup & Pre-Registered Conditions

Ablation v2 evaluates six conditions across the {{held_out_tasks_count}} held-out test tasks ($6 \times 120 = 720$ trials per run):

| Condition | Prompt Treatment | Independent LLM Calls | Prompt Token Cost |
| :--- | :--- | :---: | :--- |
| **`A` (Zero-Shot)** | Task prompt only. No hints, memory, or rule context. | 120 | Baseline (~250 tokens) |
| **`D` (Placebo Control)** | Task prompt plus PostgreSQL best-practice tips outside the task's applicable fact set. | 120 | Length-matched (~850 tokens) |
| **`C` (Distilled Rule Retrieval)** | Task prompt plus failure-prioritized retrieval (Top $K=10$) of feature-compatible Advisor-distilled lessons. | 120 | Moderate (~520 tokens) |
| **`C0` (Verbatim Rule Retrieval)** | Identical retrieval ranking as Condition C, but injecting canonical Oracle statements verbatim. | 120 | Moderate (~550 tokens) |
| **`B` (Static Reference)** | Task prompt plus static injection of all {{active_facts_count}} active canonical fact statements. | 120 | Full context (~1,140 tokens) |
| **`E_B` (Ablation Reference)** | Condition B evaluated through the Tier 0 measurement path (reusing Condition B's cached output). | 0 (Reused) | Identical to B |

### Confirmatory Validity Gate
To ensure statistical comparability, runs must satisfy a pre-registered validity gate:
1. **Constant Model ID:** The model identifier returned by the provider must match the requested model on 100% of trials.
2. **Verified Output Sanitization:** Completions must contain pure SQL without conversational preambles or raw `<think>` tokens.
3. **Monotonic Reference Check ($B > A$):** The static reference prompt ($B$) must exceed zero-shot baseline ($A$) with a 95% bootstrap confidence interval strictly excluding zero.

Six completed runs satisfy all validity criteria: `nemotron-2`, `gemma4-31b-full`, `glm5-2`, `gemini-3.1-flash-lite`, `gemini-flash-lite-full`, and `qwen27b-2` ($N = {{total_trials}}$ scored trials, {{independent_generations}} independent generations).

---

## 5. Metrics & Statistical Inference Framework

### 5.1 Endpoints
* **Primary Endpoint (Continuous Compliance):** Mean bound-fact fraction across test tasks:
  $$\text{Mean Bound Fraction} = \frac{1}{N} \sum_{i=1}^{N} \frac{\sum_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed})}{|\text{Bound}_i|}, \quad N = {{held_out_tasks_count}}$$
  *Table Missing Penalty:* If `F-13` (target table created with specified name) fails, `tableMissing` is recorded, and the trial is assigned $\text{Bound Fraction} = 0$.
* **Secondary Endpoint (Strict Pass@1):** Binary task success requiring 100% of bound facts to pass ($\prod_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed}) = 1$). Reported with Wilson 95% score confidence intervals.

### 5.2 Multiplicity Control
Statistical significance for the primary metric across confirmatory contrasts is computed using two-sided paired sign-flip randomization tests (100,000 iterations, xorshift32 seed `20260101`) and paired percentile bootstrap 95% confidence intervals (10,000 resamples). For binary strict Pass@1, exact two-sided McNemar tests are computed over discordant pairs.

To maintain strict Family-Wise Error Rate ($\alpha = 0.05$), **Holm-Bonferroni step-down adjustments** are applied separately across the family of four primary C contrasts (`C vs A`, `C vs D`, `C vs C0`, `C vs B`). $B \text{ vs } A$ is pre-registered as an external reference contrast outside the primary Holm family.

---

## 6. Multi-Model Benchmark Results

### 6.1 Master Benchmark Performance
Table 2 details aggregate bound compliance, strict Pass@1, token consumption, and execution stability across all six valid completed runs:

{{table_primary_benchmark}}

### 6.2 Confirmatory Statistical Hypothesis Testing
Table 3 details paired differences, bootstrap confidence intervals, exact permutation p-values, Holm-Bonferroni adjustments, and cell-level sign-flip p-values across all confirmatory contrasts:

{{table_primary_contrasts}}

### 6.3 Evaluation of Pre-Registered Hypotheses

#### H1: Failure-Prioritized Rule Retrieval Utility ($C > A$) — Strongly Confirmed Across All Models
Across all six models, selective retrieval of failure-prioritized rules produces massive, statistically significant improvements over zero-shot prompting:
* `nemotron-2`: {{nemotron_2_c_a_diff}} pp ($95\%$ CI {{nemotron_2_c_a_ci}}, Holm $p = {{nemotron_2_c_a_holm_p}}$); strict Pass@1 increases from {{nemotron_2_a_pass1}} to {{nemotron_2_c_pass1}}.
* `gemma4-31b-full`: {{gemma4_31b_full_c_a_diff}} pp ($95\%$ CI {{gemma4_31b_full_c_a_ci}}, Holm $p = {{gemma4_31b_full_c_a_holm_p}}$); strict Pass@1 increases from {{gemma4_31b_full_a_pass1}} to {{gemma4_31b_full_c_pass1}}.
* `glm5-2`: {{glm5_2_c_a_diff}} pp ($95\%$ CI {{glm5_2_c_a_ci}}, Holm $p = {{glm5_2_c_a_holm_p}}$); strict Pass@1 increases from {{glm5_2_a_pass1}} to {{glm5_2_c_pass1}}.
* `gemini-3.1-flash-lite`: {{gemini_3_1_flash_lite_c_a_diff}} pp ($95\%$ CI {{gemini_3_1_flash_lite_c_a_ci}}, Holm $p = {{gemini_3_1_flash_lite_c_a_holm_p}}$); strict Pass@1 increases from {{gemini_3_1_flash_lite_a_pass1}} to {{gemini_3_1_flash_lite_c_pass1}}.
* `gemini-flash-lite-full`: {{gemini_flash_lite_full_c_a_diff}} pp ($95\%$ CI {{gemini_flash_lite_full_c_a_ci}}, Holm $p = {{gemini_flash_lite_full_c_a_holm_p}}$); strict Pass@1 increases from {{gemini_flash_lite_full_a_pass1}} to {{gemini_flash_lite_full_c_pass1}}.
* `qwen27b-2`: {{qwen27b_2_c_a_diff}} pp ($95\%$ CI {{qwen27b_2_c_a_ci}}, Holm $p = {{qwen27b_2_c_a_holm_p}}$); strict Pass@1 increases from {{qwen27b_2_a_pass1}} to {{qwen27b_2_c_pass1}}.

#### H2: Content Validity vs. Placebo Distractors ($C > D$) — Confirmed Under Non-Pathological Execution
Where Placebo condition $D$ does not trigger syntax crashes (`nemotron-2`, `gemma4-31b-full`, `gemini-3.1-flash-lite`, `qwen27b-2`), Condition $D$ performs similarly to zero-shot baseline ($40.5\%$ to $49.5\%$). In these models, Condition $C$ exceeds $D$ by {{nemotron_2_c_d_diff}} pp, {{gemma4_31b_full_c_d_diff}} pp, {{gemini_3_1_flash_lite_c_d_diff}} pp, and {{qwen27b_2_c_d_diff}} pp (all Holm $p \le 0.0001$). This confirms that observed gains stem from relevant rule content rather than prompt token volume.

#### H3: The Distillation Penalty ($C \text{ vs } C_0$) — Significant in 4 of 6 Models
In the unconditional pre-registered primary analysis, verbatim rule injection ($C_0$) differs significantly from distilled advice ($C$) in **4 of 6 models**:
* `nemotron-2`: $C_0$ exceeds $C$ by {{nemotron_2_c0_c_diff}} pp ($C \text{ vs } C_0 = {{nemotron_2_c_c0_diff}}$, Holm $p = {{nemotron_2_c_c0_holm_p}}$).
* `gemma4-31b-full`: $C_0$ exceeds $C$ by {{gemma4_31b_full_c0_c_diff}} pp ($C \text{ vs } C_0 = {{gemma4_31b_full_c_c0_diff}}$, Holm $p = {{gemma4_31b_full_c_c0_holm_p}}$).
* `gemini-3.1-flash-lite`: $C_0$ exceeds $C$ by {{gemini_3_1_flash_lite_c0_c_diff}} pp ($C \text{ vs } C_0 = {{gemini_3_1_flash_lite_c_c0_diff}}$, Holm $p = {{gemini_3_1_flash_lite_c_c0_holm_p}}$).
* `qwen27b-2`: $C_0$ exceeds $C$ by {{qwen27b_2_c0_c_diff}} pp ($C \text{ vs } C_0 = {{qwen27b_2_c_c0_diff}}$, Holm $p = {{qwen27b_2_c_c0_holm_p}}$).

In `glm5-2` ($C \text{ vs } C_0 = {{glm5_2_c_c0_diff}}$, Holm $p = {{glm5_2_c_c0_holm_p}}$) and `gemini-flash-lite-full` ($C \text{ vs } C_0 = {{gemini_flash_lite_full_c_c0_diff}}$, Holm $p = {{gemini_flash_lite_full_c_c0_holm_p}}$), the unconditional difference is not statistically significant. As detailed in Section 7.1, this lack of unconditional significance was caused by DDL syntax crashes; when conditioned on clean execution, $C_0$ strictly outperforms $C$ across all six models.

#### H4: Token-Performance Trade-Off (Exploratory Evaluation)
Evaluating Condition C against static reference Condition B: Condition C consumes {{nemotron_2_c_prompt_tok}} prompt tokens compared to Condition B's {{nemotron_2_b_prompt_tok}} tokens on Nemotron (a {{nemotron_2_c_prompt_reduction}} prompt token reduction), while achieving {{nemotron_2_c_mean}} bound compliance compared to B's {{nemotron_2_b_mean}}.

Computing exploratory $C_0 / B$ compliance ratios across models:
* `nemotron-2`: {{nemotron_2_c0_b_ratio}} of B's score with {{nemotron_2_c0_prompt_reduction}} prompt token reduction ({{nemotron_2_c0_total_reduction}} total token reduction).
* `gemma4-31b-full`: {{gemma4_31b_full_c0_b_ratio}} of B's score with {{gemma4_31b_full_c0_prompt_reduction}} prompt token reduction ({{gemma4_31b_full_c0_total_reduction}} total token reduction).
* `glm5-2`: {{glm5_2_c0_b_ratio}} of B's score with {{glm5_2_c0_prompt_reduction}} prompt token reduction ({{glm5_2_c0_total_reduction}} total token reduction).
* `gemini-3.1-flash-lite`: {{gemini_3_1_flash_lite_c0_b_ratio}} of B's score with {{gemini_3_1_flash_lite_c0_prompt_reduction}} prompt token reduction ({{gemini_3_1_flash_lite_c0_total_reduction}} total token reduction).
* `gemini-flash-lite-full`: {{gemini_flash_lite_full_c0_b_ratio}} of B's score with {{gemini_flash_lite_full_c0_prompt_reduction}} prompt token reduction ({{gemini_flash_lite_full_c0_total_reduction}} total token reduction).
* `qwen27b-2`: {{qwen27b_2_c0_b_ratio}} of B's score with {{qwen27b_2_c0_prompt_reduction}} prompt token reduction ({{qwen27b_2_c0_total_reduction}} total token reduction).

Condition B is treated as a static reference point, not an absolute ceiling.

### 6.4 Factorial Cell Analysis Across All Eight Cells
Table 4 displays the per-cell performance of Condition C vs. Condition A across all eight factorial feature cells:

{{table_eight_cells}}

Table 5 breaks down the $C_0 - C$ difference across all eight factorial cells:

{{table_eight_cells_c0_c}}

In cells `010` and `111`, verbatim rules ($C_0$) outperform distilled summaries ($C$) across all six models ({{summary_ao_010_min_diff}} to {{summary_ao_010_max_diff}} pp in `010`; {{summary_ao_111_min_diff}} to {{summary_ao_111_max_diff}} pp in `111`), and in cell `110` across five of six models ({{summary_ao_110_5models_min_diff}} to {{summary_ao_110_5models_max_diff}} pp, with `qwen27b-2` at {{summary_ao_110_qwen_diff}} pp due to $F\text{-}36$ inline `REFERENCES` collisions), while cell `011` ranges from {{summary_ao_011_min_diff}} to {{summary_ao_011_max_diff}} pp across models. Natural language summaries in append-only tasks omit explicit column and trigger identifiers (e.g., `supersedes_id`, `P0001`), driving substantial compliance drops under distilled advice in non-streaming cells, while ingestion triggers introduce syntax interactions that moderate the gap in cell `011`.

---

## 7. Sensitivity Analyses & Forensic Audits

> **Note on Methodological Framing:** The analyses in this section evaluate post-treatment subsets and secondary regression models. They are labeled as descriptive sensitivity analyses and observational diagnostics, not formal causal estimates.

### 7.1 Paired Clean-Intersection Sensitivity Analysis
*(Conditioned on a post-treatment outcome; not a causal estimate)*

In Condition A and Condition D, models frequently generate invalid SQL syntax that fails to execute in PostgreSQL. To test whether differences between conditions persist when migrations execute cleanly, we evaluate paired clean intersections where **both conditions executed with PostgreSQL exit code 0** (`migrationExitNonZero === false`):

{{table_clean_pairs}}

**Key Findings:**
1. When conditioned on clean execution, $C_0$ outperforms $C$ with 95% bootstrap confidence intervals strictly excluding zero across **all six models** ({{summary_clean_c0_c_min_diff}} to {{summary_clean_c0_c_max_diff}} percentage points).
2. On `gemini-3.1-flash-lite`, the unconditional reversal $C_0 > B$ ($83.4\%$ vs $75.5\%$) vanishes when paired clean ($B > C_0$ by $+4.76\%$, $95\%$ CI $[-8.81, -0.65]$). Condition B's lower unconditional score was driven by DDL syntax crashes under the 34-rule prompt on that model, not inferior rule content when clean.

### 7.2 Crossed Random-Effects Linear Mixed Model
*(Conditioned on model specification; secondary sensitivity analysis)*

To account for clustering across tasks ($k=120$), facts ($k=18$), factorial cells ($k=8$), and fact-by-condition interaction random slopes ($k=90$), we fit an exact REML Linear Mixed-Effects Model ($y_{tfc,k} \sim \text{condition}_k + (1|\text{task}_t) + (1|\text{fact}_f) + (1|\text{cell}_c) + (1|\text{fact:condition}_{f,k})$) across all 478 bound task-fact pairs ($N = 2,390$ observations per run):

Table 6A: Mixed Model Variance Components & Intraclass Correlation Coefficients

{{table_mixed_model_variance}}

Table 6B: Fixed Effect Contrasts (REML Model SE vs CR1 Task-Cluster SE)

{{table_mixed_model_contrasts}}

**Key Findings:**
1. Fact-level random intercepts ($4.0\%$ to $14.7\%$) and condition-by-fact random slopes ($23.4\%$ to $35.2\%$) capture the predominant share of clustered variance (total clustered share $36.5\%$ to $51.3\%$), confirming substantial intrinsic difficulty variation across relational invariants and heterogeneous rule sensitivity across experimental conditions.
2. Cell-level clustering accounts for $2.1\%$ to $6.4\%$ of variance, reflecting the added complexity of multi-tenancy and immutability, while task-level clustering accounts for $0.1\%$ to $2.7\%$.
3. Fixed-effect condition estimates under small-sample CR1 task-clustered sandwich standard errors remain statistically significant ($p < 0.0001$ for $C - A$, $C_0 - A$, and $B - A$), confirming that primary contrast conclusions are robust to arbitrary task-level covariance and condition-by-fact random variation.

### 7.3 Retrieval Stratification: Retrieved vs. Non-Retrieved Bound Facts
*(Descriptive sensitivity analysis on bound task-fact pairs)*

Table 7 breaks down pass rates on bound task-fact pairs stratified by whether the fact was retrieved ($n=396$) or non-retrieved ($n=82$):

{{table_retrieval_stratification}}

**Observation (Checklist Displacement):** Where Placebo $D$ does not trigger syntax crashes, $D - A$ on the non-retrieved set is flat ($[-4.88\%, +4.88\%]$). By contrast, $C - A$ drops sharply ($-21.95\%$ to $-37.80\%$) and $C_0 - A$ drops ($-10.98\%$ to $-24.39\%$). Providing an incomplete checklist of retrieved rules causes models to displace unprompted baseline knowledge; natural language summaries exacerbate this displacement relative to verbatim text.

### 7.4 Forensic Invariant Collisions: F-16/F-36 & Duplicate Primary Keys
*(Observational post-hoc diagnostics)*

1. **The $F\text{-}16 / F\text{-}36$ Inline `REFERENCES` Collision:**
   - Invariant $F\text{-}36$ states: `...supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT`.
   - In PostgreSQL 16, inline `REFERENCES` automatically creates an auto-named constraint `<table>_supersedes_id_fkey`, violating invariant $F\text{-}16$ (`fk_<table>_<column>`).
   - Across all six models, every trial emitting an inline `REFERENCES` on `supersedes_id` scored **0.0% on $F\text{-}16$**.
   - Conversely, when models emitted `FOREIGN KEY (supersedes_id)` as an explicit named constraint *without* inline `REFERENCES`, $F\text{-}16$ pass rates in $C0$ were **100.0%** in `nemotron-2`, **93.1%** in `gemma4-31b-full`, **83.3%** in `glm5-2`, and **100.0%** in `qwen27b-2`.
2. **GLM Duplicate Primary Key Defect:**
   - In `glm5-2` Condition $C0$, exactly 20 trials emitted duplicate primary keys (column-level plus table-level), resulting in 20 fatal `tableMissing` transaction rollbacks.
   - $F\text{-}01$ was retrieved 0 times across all 120 tasks in Condition C0 (0/120). Unretrieved $F\text{-}01$ allowed GLM-5.3 to emit redundant primary key clauses under $C0$, suppressing its unconditional score.

### 7.5 Statement-Sufficiency Live Oracle Findings
*(Diagnostic pilot on 10 Training tasks)*

A deterministic synthesizer translating `facts.json` statement strings directly into PostgreSQL DDL (with zero access to reference SQL) was evaluated against the live PostgreSQL 16 Oracle container across 10 Training tasks:
* **Mutable tasks (4/4):** 100% passed (`T-011`, `T-016`, `T-031`, `T-036`).
* **Append-only tasks (6/6):** 100% failed (`T-001`, `T-005`, `T-006`, `T-007`, `T-021`, `T-026`), all on $F\text{-}16$ caused by $F\text{-}36$'s inline `REFERENCES` phrasing.
* **Additional Rule Text Ambiguities Identified:**
  - $F\text{-}18$ singular index naming fails on composite indexes (`idx_currencies_metric_key` fails; `idx_currencies_metric_key_observed_at` passes).
  - $F\text{-}19$ revokes all permissions without explicitly stating positive grants to `readonly_user` and `application`.
  - $F\text{-}15$ permits role-prefixed foreign key columns (`executed_by_user_id`) in Oracle checks that are unstated in the rule text.

---

## 8. Related Work

### 8.1 Verbal Reinforcement Learning and Reflexion
The Reflexion framework (Shinn et al., 2023) demonstrated that language agents can learn from environmental feedback by verbalizing mistakes and storing natural language summaries in working memory. While effective in conversational and game environments, our findings indicate that in rigid software engineering domains like relational DDL, natural language summaries introduce semantic ambiguity and token stripping, causing verbatim canonical statements to outperform distilled lessons.

### 8.2 Memory-Augmented Code Generation
Recent studies in code and query generation, such as LAST-CQ (Prokopiou et al., 2026) and MERIT (Vo et al., 2026; Mishra & Mishra, 2026), have explored retrieving past execution traces and error feedback to guide query formulation and agentic self-repair. While these approaches demonstrate the utility of episodic memory retrieval, they do not isolate the difference between natural-language distillation and verbatim rule representation, nor do they examine the partial-checklist displacement observed in our retrieval stratification.

### 8.3 Memory Degradation and Negative Transfer
Zhang et al. (2026), in *"Useful Memories Become Faulty When Continuously Updated by LLMs"*, demonstrated that accumulated memory in language agents can induce negative transfer, where updated lessons degrade performance across tasks. Our observation of partial-checklist displacement (Section 7.3) provides direct empirical confirmation in relational schema engineering: injecting $K=10$ rules suppresses compliance on non-retrieved baseline invariants. Furthermore, Zhang et al. document **Concrete-Vocabulary Erosion** (Section D.2), showing how iterative LLM consolidation rewrites concrete domain properties (such as `"max size"`) into un-actionable generalizations (`"a derived per-object numeric attribute"`). Their empirical benchmark demonstrates an immediate **Initial Compression Error** (Table 5), where even single-batch distillation without prior-store conditioning trails raw trajectories (70.0% vs. 76.6%). This directly grounds our primary mechanism: when the Advisor summarizes historical SQL failures into conversational guidance, it strips exact relational identifiers (`supersedes_id`, `app_metadata.tenant_id`, `P0001`), producing a severe distillation penalty ($C_0 > C$) in syntax-rigid contracts.

### 8.4 Self-Evolving Agents and Experience Abstraction
Zhao et al. (2026) investigated whether language agents can faithfully improve via self-reflection (*"Large Language Model Agents Are Not Always Faithful Self-Evolvers"*), finding that agent updates frequently suffer from ungrounded hallucination unless verified by external execution feedback. Shen et al. (2026), in *"Decocted Experience Improves Test-Time Inference in LLM Agents"*, investigated the distillation of experiential memory, demonstrating that structured abstractions can improve test-time inference across multi-step workflows. Our results in relational schema generation establish a crucial boundary condition: for syntax-rigid structural contracts, distilled abstractions omit decisive schema identifiers, causing verbatim canonical specifications to strictly outperform distilled advice.

---

## 9. Protocol Deviations

We document four deviations from the initial experimental plan:
1. **Placebo Prompt Phrasing:** The distractor tips in Condition D unintentionally included imperative advice on schema qualification (`"always explicitly qualify tables with public."`). On open-weight and smaller models, this induced syntax errors (e.g., malformed foreign key targets), causing Condition D to perform worse than baseline in some cells rather than acting as a neutral token-length control.
2. **Model Alias Shift in `gemma4-26b-full`:** A completed 720-trial run on `google/gemma-4-26b-it` was excluded under the pre-registered `pinned_model_version` criterion because the provider shifted its internal alias mid-run (`returnedModel` changed from `gemma-4-26b-it` to `gemma-4-26b-a4b-it`).
3. **Condition B Text Reconciliation:** An audit was performed to verify that `STATIC_FACTS` in `ablation.ts` matched `facts.json` character-for-character, confirming 0 text differences across all {{active_facts_count}} active rules.
4. **Post-Hoc Validity Gate Formalization:** The validity gate criteria ($B > A$, constant settings, pinned version) were formalized after early runs were observed to experience cache instability and model alias drift.

---

## 10. Limitations

1. **Templated Tasks and Intraclass Correlation:** Tasks in the evaluation corpus were generated across an $2^3$ factorial template structure. This leads to substantial clustering across feature cells, as reflected by high intraclass correlation ($ICC(1) = {{nemotron_2_icc_bound}}$ on bound facts and ${{nemotron_2_icc_all}}$ on all facts in Nemotron).
2. **Author-Written Oracle Assertions:** Oracle assertions were authored by the benchmark designers. While validated against 30 golden reference schemas and 40 negative test fixtures, latent catalog assumptions remain possible.
3. **Probe-Stricter-Than-Statement Defects:** As revealed in Section 7.5, several invariants contain phrasing ambiguities where Oracle catalog probes enforce requirements stricter than the written rule text ($F\text{-}36$ inline references, $F\text{-}18$ composite index naming, $F\text{-}19$ unstated positive grants, and $F\text{-}15$ role prefix conventions).
4. **`F-13` Table-Missing Overload:** When a model fails to create the requested table (`F-13` failure), all bound facts on that task receive a score of zero. While this reflects practical engineering reality (a non-existent table cannot satisfy relational constraints), it conflates basic DDL syntax errors with higher-order relational invariant failures.
5. **Reasoning-Mode Differences:** Models across the fleet utilized varying internal reasoning configurations (e.g., Gemini minimal thinking mode vs. non-reasoning open-weight models), introducing differing verbosity and instruction-following dynamics.
6. **Provider Infrastructure Variations:** Evaluations spanned multiple API providers (NVIDIA NIM and Google AI Studio), with varying rate limits, prompt caching behaviors, and token counting conventions.
7. **Post-Hoc Validity Gate Adoption:** The validity gate was adopted after initial runs were inspected, which introduces potential selection bias regarding which completed runs are classified as primary confirmatory evidence.
8. **Public Test Set Vulnerability:** All task prompts and facts are stored in the repository, making them vulnerable to web crawl contamination in future model pre-training corpora.
9. **Single Advisor Distillation Prompt:** Training failure memory was generated using a single distillation prompt on `deepseek-v4.1-flash`. Alternative summarization prompts or teacher models were not ablated.

---

## 11. Conclusion

Axiom establishes that reliable automated database engineering requires **Authority Separation (Invariant 0)**: language models must be treated as untrusted candidate generators graded exclusively by deterministic execution oracles.

Across **{{independent_generations}} independent generations ({{total_trials}} scored trials)** on six model families, our findings demonstrate that:
1. **Failure-Prioritized Rule Retrieval is Highly Effective:** Injecting targeted failure rules improves bound-fact compliance by {{summary_c_a_min_diff}} to {{summary_c_a_max_diff}} percentage points over zero-shot baselines ($p < 0.0001$).
2. **Verbatim Specifications Beat Distilled Summaries:** In rigid software engineering contracts, natural language summaries strip critical identifiers. Verbatim canonical statements significantly outperform distilled advice in 4 of 6 models unconditionally, and in all 6 models under clean execution (by {{summary_clean_c0_c_min_diff}} to {{summary_clean_c0_c_max_diff}} percentage points).
3. **Exploratory Token Efficiency:** Selective verbatim rule retrieval achieves {{summary_c0_b_min_ratio}} to {{summary_c0_b_max_ratio}} of the performance of the full static reference condition while reducing prompt token consumption by {{summary_c0_prompt_min_reduction}} to {{summary_c0_prompt_max_reduction}}.
4. **Verbatim Invariants Require Precise Syntactic Specification:** Syntactic ambiguities in rule text (such as inline foreign keys) produce deterministic failure cascades that can only be diagnosed through rigorous statement-sufficiency validation.

---

## Appendix: Run Ledger & Campaign Telemetry

Table A1 documents the complete campaign execution ledger across all completed, exploratory, and in-progress runs recorded in `out/run-ledger.json`:

{{table_run_ledger}}

---

## References

1. Mishra, S., & Mishra, S. (2026). *When Does Memory Help? A Cost-Aware Evaluation of Long-Term Memory in Tool-Using LLM Agents*. arXiv preprint arXiv:2609.05441.
2. Prokopiou, I., Aidinis, A., Kyrmpatsos, P.-C., & Vikatos, P. (2026). *What Drives Recovery in Agentic Text-to-Cypher? LAST-CQ: An LLM Agent Self-Refinement Framework*. Workshop on Reasoning and Learning with External Knowledge for LLMs (REALM @ EMNLP 2026). arXiv:2609.12746.
3. Shen, M., Zha, K.-W., He, Z., & Wornell, G. W. (2026). *Decocted Experience Improves Test-Time Inference in LLM Agents*. Conference on Language Modeling (COLM 2026). arXiv:2604.04373.
4. Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*. Advances in Neural Information Processing Systems (NeurIPS 2023), 36. arXiv:2303.11366.
5. Vo, K. N. H., Chu, T. M., Dinh, A. T. D., Bui, T. V. H., & Quan, T. (2026). *Causal Episodic Memory for Feedback-Driven Agent Repair (MERIT)*. Workshop on Reasoning and Learning with External Knowledge for LLMs (REALM @ EMNLP 2026). arXiv:2608.05906.
6. Zhang, D., Lin, Y., Wu, Z., Sun, Y., Li, B., Li, D., & Peng, H. (2026). *Useful Memories Become Faulty When Continuously Updated by LLMs*. NeurIPS 2026 Workshop. arXiv:2605.12978.
7. Zhao, W., Wang, Y., Zhang, Y., Deng, Y., Zhao, Y., Che, W., Qin, B., & Liu, T. (2026). *Large Language Model Agents Are Not Always Faithful Self-Evolvers*. International Conference on Machine Learning (ICML 2026). arXiv:2601.22436.
