# Axiom: Deterministic Verification and Failure-Prioritized Rule Retrieval in Relational Schema Migration

## Abstract

Automated software engineering agents frequently generate syntactically plausible database migrations that silently violate critical application invariants, such as multi-tenant isolation boundaries, row-level security (RLS) enforcement, immutable audit logging, and privilege separation. Traditional evaluation approaches rely on large language models (LLMs) to inspect code; however, LLM-based verification suffers from correlated blind spots, non-determinism, and hallucinated compliance.

In this work, we present **Axiom**, a dual-track architectural verification and evaluation system founded on the strict design principle of **Authority Separation (Invariant 0)**: *generative language models are untrusted candidate producers and only external deterministic execution oracles hold grading authority*. Axiom couples two decoupled mechanisms: (1) an *operational reflexion loop* that enforces deterministic grammar, vault consistency, and executable security AST checks on agent architecture rules, and (2) an *empirical SQL migration ablation harness* evaluating candidate DDL against an isolated PostgreSQL 16 container oracle across an 8-cell factorial corpus of 120 held-out enterprise migration tasks.

We report results from an extensive empirical evaluation across **3,600 independent model generations (4,320 scored trials)** across 6 valid completed runs meeting a pre-registered post-hoc validity gate: `nvidia/nemotron-3-ultra-550b`, `google/gemma-4-31b-it`, `zhipu/glm-5.3-flash`, `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`, and `qwen/qwen3.8-27b`. Crucially, the ablation harness evaluates single-turn generation without iterative retry or in-trial reflection, testing whether historical failure lessons harvested offline improve subsequent first-turn compliance.

Retrieval of failure-prioritized rule text improved compliance over zero-shot in all six valid models (+18.19 to +33.04 points). Verbatim rule text beat LLM-distilled paraphrases in four of six models under the pre-registered analysis (+13.97 to +17.36 points), with no detectable difference in the other two.

Our principal findings demonstrate:

1. **Failure-Prioritized Rule Retrieval Utility (H1):** In-context injection of failure-prioritized rules (Condition C) produces large, statistically significant improvements over zero-shot baselines (Condition A) across all six models, increasing mean bound-fact compliance by +18.19 to +33.04 percentage points (paired sign-flip $p < 0.0001$).
2. **The Distillation Penalty (H3):** In the pre-registered primary analysis across all 120 test tasks, verbatim injection of canonical rule statements ($C_0$) significantly outperforms natural-language lesson summaries ($C$) in **4 of 6 models** (`nemotron-2`, `gemma4-31b-full`, `gemini-3.1-flash-lite`, and `qwen27b-2`, with Holm-adjusted $p \le 0.0001$). In secondary clean-intersection sensitivity analysis conditioning on migrations that execute without DDL syntax errors, $C_0$ exceeds $C$ across **all six models** by **+5.68 to +15.36 percentage points**. Specifically, in cells `010` and `111`, verbatim rules ($C_0$) outperform distilled summaries ($C$) across all six models (+15.55 to +41.44 pp in `010`; +19.33 to +29.67 pp in `111`), and in cell `110` across five of six models (+10.22 to +31.11 pp, with `qwen27b-2` at -10.33 pp due to $F\text{-}36$ inline `REFERENCES` collisions), while cell `011` ranges from -4.89 to +17.22 pp across models, where natural language summaries strip concrete SQL identifiers (`supersedes_id`, `app_metadata.tenant_id`).
3. **Exploratory Efficiency Frontier (H4):** Evaluating Condition C against Condition B, and computing exploratory $C_0 / B$ compliance ratios across models, $C_0$ achieves 79.9% to 110.6% of the performance of the static reference condition ($B$, which injects all 34 active rules), while reducing prompt token consumption by 51.0% to 53.3%. Condition B is evaluated as a static in-context reference, not an unreachable ceiling.
4. **Partial-Checklist Displacement:** When supplied with a partial subset of $K=10$ retrieved rules, models regress below zero-shot baseline on non-retrieved bound facts, indicating that incomplete in-context checklists displace unprompted default knowledge.
5. **Forensic Invariant Collisions:** Verbatim rule injection can fail when canonical statements contain latent syntactic ambiguities. Specifically, an inline `REFERENCES` clause in invariant $F\text{-}36$ induces a 100% failure rate on constraint-naming rule $F\text{-}16$, and unretrieved primary key guidance in GLM-5.3 triggers fatal duplicate primary key syntax crashes.

Finally, we report a crossed random-effects linear mixed model ($y \sim \text{condition} + (1|\text{task}) + (1|\text{fact}) + (1|\text{cell}) + (1|\text{fact:condition})$) confirming that invariant and condition-by-fact clustering account for the predominant share of variance, and document protocol deviations and study limitations.

---

## 1. Introduction

Autonomous software engineering agents powered by large language models (LLMs) are increasingly applied to database schema design, catalog administration, and data migration generation. In relational database engineering, code defects carry catastrophic operational risks: an omitted index degrades query performance across millions of rows, an unrevoked table grant allows unauthorized mutation of financial ledgers, and an absent Row-Level Security (RLS) policy leaks multi-tenant data across customer boundaries.

A common paradigm in agent architectures is self-reflection or "LLM-as-a-judge" (Shinn et al., 2023), wherein a model critiques and refines its own generated code. Recent investigations have demonstrated that self-evaluation in formal software engineering suffers from correlated blind spots and hallucinated compliance: language models frequently misjudge subtle compiler semantics and falsely assume their generated code satisfies formal invariants (Zhao et al., 2026; Zhang et al., 2026).

To resolve this challenge, we introduce **Axiom**, a dual-track architectural verification and evaluation system founded on **Authority Separation (Invariant 0)**: *all LLM output is untrusted candidate material and only external deterministic execution oracles hold grading authority*. Axiom decouples candidate generation from grading authority across two tracks:
* **Track 1 (Operational Architecture Reflexion):** Enforces RFC 2119 keyword syntax, cross-domain citation integrity, and deterministic AST verification over agent rulebooks, staging candidate rules in an isolated quarantine until verified.
* **Track 2 (Empirical SQL Migration Ablation):** Evaluates single-turn migration DDL generation against an isolated PostgreSQL 16 container oracle across an 8-cell factorial corpus of 120 held-out enterprise tasks.

Crucially, the Track 2 ablation harness evaluates single-turn generation with **no retry or reflection loop** during testing. Models receive the task prompt (along with condition-specific in-context rules) and generate a single candidate migration. This isolates whether rules harvested from historical failures improve subsequent zero-shot generation, eliminating confounding from multi-turn conversational repair.

This paper presents the complete empirical findings from the Track 2 program across **3,600 independent generations (4,320 scored trials)** spanning six distinct model families: `nvidia/nemotron-3-ultra-550b`, `google/gemma-4-31b-it`, `zhipu/glm-5.3-flash`, `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`, and `qwen/qwen3.8-27b`.

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
* **Held-Out Test Split (120 tasks, `H-001` to `H-120`):** Reserved strictly for confirmatory evaluation.

Tasks are uniformly balanced across an $2^3 = 8$ factorial design of foundational enterprise feature flags, with exactly 15 tasks per cell:

| Feature Flag | Type | Evaluated Semantics & Schema Requirements | Active Invariants Governed |
| :--- | :---: | :--- | :--- |
| `tenant` | Boolean | **Multi-Tenant Isolation:** Table requires `tenant_id uuid NOT NULL`, foreign key referencing `public.tenants(id) ON DELETE RESTRICT`, row-level security enabled and forced (`ENABLE/FORCE ROW LEVEL SECURITY`), and tenant-isolation RLS policies (`SELECT`, `INSERT`) checking `tenant_id` against `request.jwt.claims -> 'app_metadata' ->> 'tenant_id'`. | `F-02`, `F-05`, `F-23`, `F-24`, `F-25`, `F-26`, `F-30` |
| `append_only` | Boolean | **Audit & Immutability:** When `true`, updates/deletes/truncates are strictly blocked via a `BEFORE UPDATE OR DELETE` trigger raising exception `P0001` (`'Update/Delete operation rejected on audit log'`), all table permissions are revoked from `PUBLIC, application, readonly_user`, and explicit `GRANT SELECT, INSERT` is given to `application` and `GRANT SELECT` to `readonly_user`; requires a self-referential `supersedes_id uuid NULL` column. When `false`, table is mutable with `updated_at timestamptz NOT NULL DEFAULT now()` maintained via a `BEFORE UPDATE` trigger, and `deleted_at timestamptz NULL` for soft deletes with partial unique indexing (`WHERE deleted_at IS NULL`). | `F-06`, `F-10`, `F-19`, `F-20`, `F-21`, `F-24`, `F-27`, `F-36` |
| `ingestion` | Boolean | **Event & Streaming Ingestion:** Table represents a high-throughput event buffer requiring `received_at timestamptz NOT NULL DEFAULT now()` with a `BEFORE INSERT` trigger forcing `NEW.received_at := now()`, an `idempotency_key text NOT NULL` with a composite unique constraint/index, and payload storage (`payload jsonb NOT NULL DEFAULT '{}'::jsonb`). | `F-09`, `F-32`, `F-34`, `F-37` |
| `status` | Secondary | State-machine entities requiring column check constraint `CHECK (status IN (...))`. | `F-12` |
| `view` | Secondary | Tenant-scoped projection view created `WITH (security_invoker = true)` and explicit role `SELECT` grants. | `F-39` |
| `sec_definer` | Secondary | Stored PL/pgSQL functions marked `SECURITY DEFINER` with explicit `SET search_path = ''`. | `F-31` |
| `latest_per_key`| Secondary | Latest-record-per-key partial/window view or index partitioned by tenant and key. | `F-38` |

### 3.2 The 39-Fact Enterprise Contract Registry
The contract registry (`fixtures/task-v2/facts.json`) defines 39 enterprise database invariants. Table 1 lists all facts, canonical statements, applicability rules, and verification statuses:

| Fact ID | Canonical Invariant Statement | Applicability Condition | Status |
| :--- | :--- | :--- | :--- |
| **F-01** | Primary key column id must be uuid NOT NULL with default gen_random_uuid(). | `Universal` | OWNER-ADOPTED |
| **F-02** | Multi-tenant tables must include tenant_id uuid NOT NULL. | `tenant = true` | CONFIRMED |
| **F-03** | Every foreign key constraint must use ON DELETE RESTRICT. | `Universal` | CONFIRMED |
| **F-04** | Monetary and decimal columns must use numeric (never float, real, double precision, or money). | `Universal` | OWNER-ADOPTED |
| **F-05** | Every table must include created_at timestamptz NOT NULL DEFAULT now(). | `Universal` | OWNER-ADOPTED |
| **F-06** | Mutable tables must include updated_at timestamptz NOT NULL DEFAULT now(); append-only tables must omit updated_at. | `append_only = false` | OWNER-ADOPTED |
| **F-07** | All timestamp columns must use timestamptz, never timestamp without time zone. | `Universal` | OWNER-ADOPTED |
| **F-08** | Text columns must use text rather than varchar(n) or char(n). | `Universal` | OWNER-ADOPTED |
| **F-09** | JSON columns must use jsonb NOT NULL, never json. | `ingestion = true` | OWNER-ADOPTED |
| **F-10** | Mutable tables must include nullable deleted_at timestamptz; append-only tables must omit deleted_at. | `append_only = false` | OWNER-ADOPTED |
| **F-11** | IP address columns must use inet, never text or varchar. | `Universal` | OWNER-ADOPTED |
| **F-12** | Status or state columns must be text NOT NULL validated by a CHECK (col IN (...)) constraint. | `status = true` | CONFIRMED |
| **F-13** | Table name must be snake_case plural in public schema and belong to the allow-list of task nouns. | `Universal` | OWNER-ADOPTED |
| **F-14** | Primary key constraint named pk_<table>. | `Never (`never: true`)` | UNCONFIRMED |
| **F-15** | Foreign key columns must be named <singular_ref_table>_id (or supersedes_id for self-FK on append-only tables). | `Universal` | OWNER-ADOPTED |
| **F-16** | Foreign key constraints must be named fk_<table>_<column>. | `Universal` | OWNER-ADOPTED |
| **F-17** | Check constraints must be named chk_<table>_<column>. | `Universal` | OWNER-ADOPTED |
| **F-18** | Explicit non-constraint indexes must be named idx_<table>_<column> (skipping constraint-backed indexes). | `Universal` | CONFIRMED |
| **F-19** | Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user. | `append_only = true` | CONFIRMED |
| **F-20** | Append-only tables must have a BEFORE UPDATE OR DELETE trigger that raises 'Update/Delete operation rejected on audit log'. | `append_only = true` | CONFIRMED |
| **F-21** | Mutable tables must have a BEFORE UPDATE trigger that advances updated_at. | `append_only = false` | OWNER-ADOPTED |
| **F-22** | Every foreign key column must be covered as the leading column of an index. | `Universal` | CONFIRMED |
| **F-23** | Multi-tenant tables must index tenant_id as the leading column of an index. | `tenant = true` | CONFIRMED |
| **F-24** | Unique business keys on soft-deletable mutable tables must use a partial unique index with WHERE deleted_at IS NULL. | `tenant = true, append_only = false` | CONFIRMED |
| **F-25** | Multi-tenant tables must have ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY. | `tenant = true` | CONFIRMED |
| **F-26** | Tenant RLS policies must scope rows by app_metadata.tenant_id for application and grant zero access to user_metadata.tenant_id. | `tenant = true` | CONFIRMED |
| **F-27** | Append-only tables must define zero FOR UPDATE, FOR DELETE, or FOR ALL RLS policies. | `append_only = true` | CONFIRMED |
| **F-28** | Merged into F-26 during reconciliation. | `Never (`never: true`)` | DROPPED |
| **F-29** | Removed during reconciliation. | `Never (`never: true`)` | DROPPED |
| **F-30** | Write RLS policies must never use tautological USING (true) or WITH CHECK (true). | `tenant = true` | CONFIRMED |
| **F-31** | SECURITY DEFINER functions must explicitly set SET search_path = ''. | `sec_definer = true` | CONFIRMED |
| **F-32** | Ingestion tables must enforce a UNIQUE constraint on idempotency_key (scoped by tenant_id when tenant = true). | `ingestion = true` | CONFIRMED |
| **F-33** | Removed during reconciliation. | `Never (`never: true`)` | DROPPED |
| **F-34** | Counter and quota columns must enforce a non-negative CHECK (<col> >= 0) constraint against underflow. | `ingestion = true` | CONFIRMED |
| **F-35** | Replaced by F-34 during reconciliation. | `Never (`never: true`)` | DROPPED |
| **F-36** | Append-only tables must include a nullable self-referential foreign key supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT. | `append_only = true` | CONFIRMED |
| **F-37** | Ingestion tables must attach a BEFORE INSERT trigger forcing NEW.received_at = now() regardless of client input. | `ingestion = true` | CONFIRMED |
| **F-38** | Observation tables must define a composite B-tree index on (<key>, observed_at DESC). | `latest_per_key = true` | CONFIRMED |
| **F-39** | Exposed views must be created with WITH (security_invoker = true). | `view = true` | CONFIRMED |

Of the 39 registry facts, 34 are active confirmed facts eligible for evaluation; 5 remain inactive (`PROPOSED`, `UNCONFIRMED`, or `DROPPED` during schema reconciliation).

### 3.3 The R2 Bound-Fact Selection Protocol
Evaluating every task against all 34 facts dilutes scores with ubiquitous conventions (such as basic table creation). Axiom binds 3 to 5 discriminating facts per task using the pre-registered `R2` protocol (`scripts/propose-bound-facts.ts`):
1. Candidate facts must apply to $\ge 3$ training tasks and exhibit a Training Condition A pass rate $\le 0.80$ (yielding 18 discriminating candidate facts).
2. For each task $t$, a deterministic target count is derived: $\text{target} = 3 + (\text{seed} \pmod 3) \in \{3, 4, 5\}$.
3. Facts are bound deterministically from the task's applicable candidate facts. Across all 120 test tasks, 478 task-fact pairs are bound.

### 3.4 Condition B Text Audit
To ensure that the static reference condition ($B$) provides an authentic benchmark, we audited `STATIC_FACTS` (`src/eval/ablation.ts`) against `FACT_STATEMENTS` (`scripts/facts.ts` / `fixtures/task-v2/facts.json`):
1. `STATIC_FACTS` and `FACT_STATEMENTS` are derived identically from `facts.json` v1.0.1.
2. All 34 active facts match character-for-character across both constants (**0 text differences**).
3. The Condition B prompt injects all 34 active facts across 34 numbered lines (`hintBSha256 = 1876a65e...` identical across all active runs).
4. `F-24` in Condition B specifies a partial unique index (`WHERE deleted_at IS NULL`), identical to the registry. Condition B represents a verified verbatim static reference.

---

## 4. Experimental Setup & Pre-Registered Conditions

Ablation v2 evaluates six conditions across the 120 held-out test tasks ($6 \times 120 = 720$ trials per run):

| Condition | Prompt Treatment | Independent LLM Calls | Prompt Token Cost |
| :--- | :--- | :---: | :--- |
| **`A` (Zero-Shot)** | Task prompt only. No hints, memory, or rule context. | 120 | Baseline (~250 tokens) |
| **`D` (Placebo Control)** | Task prompt plus PostgreSQL best-practice tips outside the task's applicable fact set. | 120 | Length-matched (~850 tokens) |
| **`C` (Distilled Rule Retrieval)** | Task prompt plus failure-prioritized retrieval (Top $K=10$) of feature-compatible Advisor-distilled lessons. | 120 | Moderate (~520 tokens) |
| **`C0` (Verbatim Rule Retrieval)** | Identical retrieval ranking as Condition C, but injecting canonical Oracle statements verbatim. | 120 | Moderate (~550 tokens) |
| **`B` (Static Reference)** | Task prompt plus static injection of all 34 active canonical fact statements. | 120 | Full context (~1,140 tokens) |
| **`E_B` (Ablation Reference)** | Condition B evaluated through the Tier 0 measurement path (reusing Condition B's cached output). | 0 (Reused) | Identical to B |

### Confirmatory Validity Gate
To ensure statistical comparability, runs must satisfy a pre-registered validity gate:
1. **Constant Model ID:** The model identifier returned by the provider must match the requested model on 100% of trials.
2. **Verified Output Sanitization:** Completions must contain pure SQL without conversational preambles or raw `<think>` tokens.
3. **Monotonic Reference Check ($B > A$):** The static reference prompt ($B$) must exceed zero-shot baseline ($A$) with a 95% bootstrap confidence interval strictly excluding zero.

Six completed runs satisfy all validity criteria: `nemotron-2`, `gemma4-31b-full`, `glm5-2`, `gemini-3.1-flash-lite`, `gemini-flash-lite-full`, and `qwen27b-2` ($N = 4,320$ scored trials, 3,600 independent generations).

---

## 5. Metrics & Statistical Inference Framework

### 5.1 Endpoints
* **Primary Endpoint (Continuous Compliance):** Mean bound-fact fraction across test tasks:
  $$\text{Mean Bound Fraction} = \frac{1}{N} \sum_{i=1}^{N} \frac{\sum_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed})}{|\text{Bound}_i|}, \quad N = 120$$
  *Table Missing Penalty:* If `F-13` (target table created with specified name) fails, `tableMissing` is recorded, and the trial is assigned $\text{Bound Fraction} = 0$.
* **Secondary Endpoint (Strict Pass@1):** Binary task success requiring 100% of bound facts to pass ($\prod_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed}) = 1$). Reported with Wilson 95% score confidence intervals.

### 5.2 Multiplicity Control
Statistical significance for the primary metric across confirmatory contrasts is computed using two-sided paired sign-flip randomization tests (100,000 iterations, xorshift32 seed `20260101`) and paired percentile bootstrap 95% confidence intervals (10,000 resamples). For binary strict Pass@1, exact two-sided McNemar tests are computed over discordant pairs.

To maintain strict Family-Wise Error Rate ($\alpha = 0.05$), **Holm-Bonferroni step-down adjustments** are applied separately across the family of four primary C contrasts (`C vs A`, `C vs D`, `C vs C0`, `C vs B`). $B \text{ vs } A$ is pre-registered as an external reference contrast outside the primary Holm family.

---

## 6. Multi-Model Benchmark Results

### 6.1 Master Benchmark Performance
Table 2 details aggregate bound compliance, strict Pass@1, token consumption, and execution stability across all six valid completed runs:

| Run ID | Model Family | Cond | Prompt Treatment | Mean Bound % | Strict Pass@1 [Wilson 95% CI] | Prompt Tok | Total Tok | Crashes (Exit≠0) | Table Missing |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `nemotron-2` | Nemotron-3-Ultra-550B | **A** | Zero-Shot Baseline | 47.4% | 4.2% [1.8%, 9.4%] | 247.2 | 1476.5 | 20 | 2 |
| `nemotron-2` | Nemotron-3-Ultra-550B | **D** | Placebo Distractor | 48.1% | 3.3% [1.3%, 8.3%] | 849.2 | 2060.2 | 8 | 1 |
| `nemotron-2` | Nemotron-3-Ultra-550B | **C** | Failure-Prioritized Distilled (Top 10) | 71.9% | 29.2% [21.8%, 37.8%] | 521.9 | 2175.5 | 9 | 1 |
| `nemotron-2` | Nemotron-3-Ultra-550B | **C0** | Failure-Prioritized Verbatim (Top 10) | 86.3% | 55.0% [46.1%, 63.6%] | 554.8 | 2113.5 | 4 | 0 |
| `nemotron-2` | Nemotron-3-Ultra-550B | **B** | Static Reference (34 Active Rules) | 93.9% | 77.5% [69.2%, 84.1%] | 1139.2 | 3110.5 | 1 | 0 |
| `nemotron-2` | Nemotron-3-Ultra-550B | **E_B** | Ablation Reference (Reused B) | 93.9% | 77.5% [69.2%, 84.1%] | 1139.2 | 3110.5 | 1 | 0 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **A** | Zero-Shot Baseline | 41.3% | 2.5% [0.9%, 7.1%] | 244.7 | 846.7 | 13 | 8 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **D** | Placebo Distractor | 40.5% | 4.2% [1.8%, 9.4%] | 876.7 | 1420.0 | 24 | 21 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **C** | Failure-Prioritized Distilled (Top 10) | 63.7% | 30.0% [22.5%, 38.7%] | 520.4 | 1160.7 | 13 | 12 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **C0** | Failure-Prioritized Verbatim (Top 10) | 77.7% | 45.0% [36.4%, 53.9%] | 543.1 | 1198.3 | 13 | 8 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **B** | Static Reference (34 Active Rules) | 93.3% | 78.3% [70.1%, 84.8%] | 1162.7 | 1829.1 | 8 | 2 |
| `gemma4-31b-full` | Gemma-4-31B-IT | **E_B** | Ablation Reference (Reused B) | 93.3% | 78.3% [70.1%, 84.8%] | 1162.7 | 1829.1 | 8 | 2 |
| `glm5-2` | GLM-5.3-Flash | **A** | Zero-Shot Baseline | 41.5% | 4.2% [1.8%, 9.4%] | 230.3 | 976.6 | 34 | 10 |
| `glm5-2` | GLM-5.3-Flash | **D** | Placebo Distractor | 29.9% | 2.5% [0.9%, 7.1%] | 806.4 | 1526.7 | 45 | 43 |
| `glm5-2` | GLM-5.3-Flash | **C** | Failure-Prioritized Distilled (Top 10) | 74.5% | 38.3% [30.1%, 47.3%] | 465.5 | 1184.9 | 15 | 3 |
| `glm5-2` | GLM-5.3-Flash | **C0** | Failure-Prioritized Verbatim (Top 10) | 72.1% | 48.3% [39.6%, 57.2%] | 496.4 | 1187.0 | 31 | 20 |
| `glm5-2` | GLM-5.3-Flash | **B** | Static Reference (34 Active Rules) | 90.2% | 69.2% [60.4%, 76.7%] | 1013.4 | 1799.3 | 22 | 3 |
| `glm5-2` | GLM-5.3-Flash | **E_B** | Ablation Reference (Reused B) | 90.2% | 69.2% [60.4%, 76.7%] | 1013.4 | 1799.3 | 22 | 3 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **A** | Zero-Shot Baseline | 47.9% | 2.5% [0.9%, 7.1%] | 244.7 | 688.9 | 31 | 0 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **D** | Placebo Distractor | 46.2% | 1.7% [0.5%, 5.9%] | 876.7 | 1353.6 | 56 | 2 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **C** | Failure-Prioritized Distilled (Top 10) | 66.1% | 25.0% [18.1%, 33.4%] | 520.4 | 1066.8 | 25 | 3 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **C0** | Failure-Prioritized Verbatim (Top 10) | 83.4% | 44.2% [35.6%, 53.1%] | 543.1 | 1091.6 | 20 | 0 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **B** | Static Reference (34 Active Rules) | 75.5% | 52.5% [43.6%, 61.2%] | 1162.7 | 1775.0 | 30 | 18 |
| `gemini-3.1-flash-lite` | Gemini-3.1-Flash-Lite | **E_B** | Ablation Reference (Reused B) | 75.5% | 52.5% [43.6%, 61.2%] | 1162.7 | 1775.0 | 30 | 18 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **A** | Zero-Shot Baseline | 35.8% | 0.0% [0.0%, 3.1%] | 244.7 | 798.9 | 16 | 11 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **D** | Placebo Distractor | 31.8% | 1.7% [0.5%, 5.9%] | 876.7 | 1440.3 | 36 | 30 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **C** | Failure-Prioritized Distilled (Top 10) | 68.4% | 31.7% [24.0%, 40.4%] | 520.4 | 1147.9 | 8 | 3 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **C0** | Failure-Prioritized Verbatim (Top 10) | 70.8% | 32.5% [24.8%, 41.3%] | 543.1 | 1158.1 | 12 | 8 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **B** | Static Reference (34 Active Rules) | 85.8% | 52.5% [43.6%, 61.2%] | 1162.7 | 1917.5 | 11 | 1 |
| `gemini-flash-lite-full` | Gemini-3.5-Flash-Lite | **E_B** | Ablation Reference (Reused B) | 85.8% | 52.5% [43.6%, 61.2%] | 1162.7 | 1917.5 | 11 | 1 |
| `qwen27b-2` | Qwen-3.8-27B | **A** | Zero-Shot Baseline | 46.3% | 3.3% [1.3%, 8.3%] | 247.2 | 1480.5 | 34 | 3 |
| `qwen27b-2` | Qwen-3.8-27B | **D** | Placebo Distractor | 49.5% | 3.3% [1.3%, 8.3%] | 849.2 | 2103.6 | 11 | 2 |
| `qwen27b-2` | Qwen-3.8-27B | **C** | Failure-Prioritized Distilled (Top 10) | 71.7% | 25.0% [18.1%, 33.4%] | 521.9 | 2133.3 | 8 | 0 |
| `qwen27b-2` | Qwen-3.8-27B | **C0** | Failure-Prioritized Verbatim (Top 10) | 88.2% | 63.3% [54.4%, 71.4%] | 554.3 | 2097.4 | 5 | 0 |
| `qwen27b-2` | Qwen-3.8-27B | **B** | Static Reference (34 Active Rules) | 92.5% | 72.5% [63.9%, 79.7%] | 1138.2 | 3145.9 | 0 | 0 |
| `qwen27b-2` | Qwen-3.8-27B | **E_B** | Ablation Reference (Reused B) | 92.5% | 72.5% [63.9%, 79.7%] | 1138.2 | 3145.9 | 0 | 0 |

### 6.2 Confirmatory Statistical Hypothesis Testing
Table 3 details paired differences, bootstrap confidence intervals, exact permutation p-values, Holm-Bonferroni adjustments, and cell-level sign-flip p-values across all confirmatory contrasts:

| Model Family | Contrast | Mean Diff (pp) | 95% Bootstrap CI | Sign-Flip p (raw) | Holm Primary p | Cell-Level Exact p |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| Nemotron-3-Ultra-550B | **C vs A** | +24.47 | [+18.89, +29.96] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| Nemotron-3-Ultra-550B | **C vs D** | +23.81 | [+18.08, +29.40] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0625 |
| Nemotron-3-Ultra-550B | **C vs C0** | -14.39 | [-18.78, -10.12] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0625 |
| Nemotron-3-Ultra-550B | **C vs B** | -21.96 | [-26.89, -17.12] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0469 |
| Nemotron-3-Ultra-550B | **B vs A** | +46.43 | [+41.11, +51.65] | 1.00 × 10^-5 | — | — |
| Gemma-4-31B-IT | **C vs A** | +22.39 | [+15.33, +29.25] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0703 |
| Gemma-4-31B-IT | **C vs D** | +23.25 | [+16.47, +29.97] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0703 |
| Gemma-4-31B-IT | **C vs C0** | -13.97 | [-20.21, -7.75] | 4.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| Gemma-4-31B-IT | **C vs B** | -29.56 | [-35.89, -23.26] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0703 |
| Gemma-4-31B-IT | **B vs A** | +51.94 | [+46.75, +56.99] | 1.00 × 10^-5 | — | — |
| GLM-5.3-Flash | **C vs A** | +33.04 | [+26.17, +39.47] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| GLM-5.3-Flash | **C vs D** | +44.64 | [+38.04, +51.01] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| GLM-5.3-Flash | **C vs C0** | +2.40 | [-5.18, +10.28] | 0.5454 | 0.5454 | 0.8281 |
| GLM-5.3-Flash | **C vs B** | -15.72 | [-21.21, -10.37] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0625 |
| GLM-5.3-Flash | **B vs A** | +48.76 | [+43.64, +53.87] | 1.00 × 10^-5 | — | — |
| Gemini-3.1-Flash-Lite | **C vs A** | +18.19 | [+12.89, +23.42] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.1172 |
| Gemini-3.1-Flash-Lite | **C vs D** | +19.88 | [+14.62, +24.97] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.1172 |
| Gemini-3.1-Flash-Lite | **C vs C0** | -17.36 | [-21.68, -13.31] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0625 |
| Gemini-3.1-Flash-Lite | **C vs B** | -9.39 | [-16.57, -2.25] | 0.0126 | 0.0126 | 0.3047 |
| Gemini-3.1-Flash-Lite | **B vs A** | +27.58 | [+20.67, +34.40] | 1.00 × 10^-5 | — | — |
| Gemini-3.5-Flash-Lite | **C vs A** | +32.58 | [+26.24, +38.71] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0469 |
| Gemini-3.5-Flash-Lite | **C vs D** | +36.60 | [+30.94, +42.36] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| Gemini-3.5-Flash-Lite | **C vs C0** | -2.39 | [-8.07, +3.44] | 0.4129 | 0.4129 | 0.6641 |
| Gemini-3.5-Flash-Lite | **C vs B** | -17.46 | [-24.04, -10.75] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0938 |
| Gemini-3.5-Flash-Lite | **B vs A** | +50.04 | [+43.88, +56.11] | 1.00 × 10^-5 | — | — |
| Qwen-3.8-27B | **C vs A** | +25.35 | [+19.57, +30.99] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0469 |
| Qwen-3.8-27B | **C vs D** | +22.15 | [+16.53, +27.74] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0469 |
| Qwen-3.8-27B | **C vs C0** | -16.53 | [-20.46, -12.56] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0313 |
| Qwen-3.8-27B | **C vs B** | -20.83 | [-25.65, -15.99] | 1.00 × 10^-5 | 4.00 × 10^-5 | 0.0469 |
| Qwen-3.8-27B | **B vs A** | +46.18 | [+41.22, +51.08] | 1.00 × 10^-5 | — | — |

### 6.3 Evaluation of Pre-Registered Hypotheses

#### H1: Failure-Prioritized Rule Retrieval Utility ($C > A$) — Strongly Confirmed Across All Models
Across all six models, selective retrieval of failure-prioritized rules produces massive, statistically significant improvements over zero-shot prompting:
* `nemotron-2`: +24.47 pp ($95\%$ CI [+18.89, +29.96], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 4.2% to 29.2%.
* `gemma4-31b-full`: +22.39 pp ($95\%$ CI [+15.33, +29.25], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 2.5% to 30.0%.
* `glm5-2`: +33.04 pp ($95\%$ CI [+26.17, +39.47], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 4.2% to 38.3%.
* `gemini-3.1-flash-lite`: +18.19 pp ($95\%$ CI [+12.89, +23.42], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 2.5% to 25.0%.
* `gemini-flash-lite-full`: +32.58 pp ($95\%$ CI [+26.24, +38.71], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 0.0% to 31.7%.
* `qwen27b-2`: +25.35 pp ($95\%$ CI [+19.57, +30.99], Holm $p = 4.00 × 10^-5$); strict Pass@1 increases from 3.3% to 25.0%.

#### H2: Content Validity vs. Placebo Distractors ($C > D$) — Confirmed Under Non-Pathological Execution
Where Placebo condition $D$ does not trigger syntax crashes (`nemotron-2`, `gemma4-31b-full`, `gemini-3.1-flash-lite`, `qwen27b-2`), Condition $D$ performs similarly to zero-shot baseline ($40.5\%$ to $49.5\%$). In these models, Condition $C$ exceeds $D$ by +23.81 pp, +23.25 pp, +19.88 pp, and +22.15 pp (all Holm $p \le 0.0001$). This confirms that observed gains stem from relevant rule content rather than prompt token volume.

#### H3: The Distillation Penalty ($C \text{ vs } C_0$) — Significant in 4 of 6 Models
In the unconditional pre-registered primary analysis, verbatim rule injection ($C_0$) differs significantly from distilled advice ($C$) in **4 of 6 models**:
* `nemotron-2`: $C_0$ exceeds $C$ by +14.39 pp ($C \text{ vs } C_0 = -14.39$, Holm $p = 4.00 × 10^-5$).
* `gemma4-31b-full`: $C_0$ exceeds $C$ by +13.97 pp ($C \text{ vs } C_0 = -13.97$, Holm $p = 4.00 × 10^-5$).
* `gemini-3.1-flash-lite`: $C_0$ exceeds $C$ by +17.36 pp ($C \text{ vs } C_0 = -17.36$, Holm $p = 4.00 × 10^-5$).
* `qwen27b-2`: $C_0$ exceeds $C$ by +16.53 pp ($C \text{ vs } C_0 = -16.53$, Holm $p = 4.00 × 10^-5$).

In `glm5-2` ($C \text{ vs } C_0 = +2.40$, Holm $p = 0.5454$) and `gemini-flash-lite-full` ($C \text{ vs } C_0 = -2.39$, Holm $p = 0.4129$), the unconditional difference is not statistically significant. As detailed in Section 7.1, this lack of unconditional significance was caused by DDL syntax crashes; when conditioned on clean execution, $C_0$ strictly outperforms $C$ across all six models.

#### H4: Token-Performance Trade-Off (Exploratory Evaluation)
Evaluating Condition C against static reference Condition B: Condition C consumes 521.9 prompt tokens compared to Condition B's 1139.2 tokens on Nemotron (a 54.2% prompt token reduction), while achieving 71.9% bound compliance compared to B's 93.9%.

Computing exploratory $C_0 / B$ compliance ratios across models:
* `nemotron-2`: 91.9% of B's score with 51.3% prompt token reduction (32.1% total token reduction).
* `gemma4-31b-full`: 83.3% of B's score with 53.3% prompt token reduction (34.5% total token reduction).
* `glm5-2`: 79.9% of B's score with 51.0% prompt token reduction (34.0% total token reduction).
* `gemini-3.1-flash-lite`: 110.6% of B's score with 53.3% prompt token reduction (38.5% total token reduction).
* `gemini-flash-lite-full`: 82.4% of B's score with 53.3% prompt token reduction (39.6% total token reduction).
* `qwen27b-2`: 95.3% of B's score with 51.3% prompt token reduction (33.3% total token reduction).

Condition B is treated as a static reference point, not an absolute ceiling.

### 6.4 Factorial Cell Analysis Across All Eight Cells
Table 4 displays the per-cell performance of Condition C vs. Condition A across all eight factorial feature cells:

| Cell (T A I) | Feature Description | Nemotron-550B C−A | Gemma-31B C−A | GLM-5.3 C−A | Gemini-3.1 C−A | Gemini-3.5 C−A | Qwen-27B C−A |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`000`** | `tenant=false,append_only=false,ingestion=false` | +24.22 | +33.11 | +24.00 | +26.89 | +52.89 | +33.33 |
| **`001`** | `tenant=false,append_only=false,ingestion=true` | +19.22 | +39.78 | +36.33 | +21.78 | +34.22 | +18.33 |
| **`010`** | `tenant=false,append_only=true,ingestion=false` | +33.78 | +37.22 | +25.33 | +24.00 | +45.67 | +22.22 |
| **`011`** | `tenant=false,append_only=true,ingestion=true` | +2.00 | -12.00 | +0.67 | -5.00 | -0.89 | +4.00 |
| **`100`** | `tenant=true,append_only=false,ingestion=false` | +44.22 | +53.44 | +57.67 | +42.44 | +49.89 | +54.00 |
| **`101`** | `tenant=true,append_only=false,ingestion=true` | +38.22 | +11.11 | +45.00 | +31.89 | +28.78 | +37.22 |
| **`110`** | `tenant=true,append_only=true,ingestion=false` | +31.89 | +19.56 | +50.33 | +7.67 | +32.78 | +36.00 |
| **`111`** | `tenant=true,append_only=true,ingestion=true` | +2.22 | -3.11 | +25.00 | -4.11 | +17.33 | -2.33 |

Table 5 breaks down the $C_0 - C$ difference across all eight factorial cells:

| Cell (T A I) | Flag Semantics | Nemotron-550B C0−C [95% CI] | Gemma-31B C0−C [95% CI] | GLM-5.3 C0−C [95% CI] | Gemini-3.1 C0−C [95% CI] | Gemini-3.5 C0−C [95% CI] | Qwen-27B C0−C [95% CI] |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`000`** | Cell `000` | 0.00 [-4.00, +4.00] | +1.33 [-3.67, +6.67] | -52.00 [-77.33, -26.67] | -1.89 [-8.00, +3.67] | -5.00 [-21.00, +6.00] | 0.00 [0.00, 0.00] |
| **`001`** | Cell `001` | +13.22 [+4.89, +21.67] | +0.33 [-4.00, +5.00] | -17.44 [-41.00, +2.67] | +6.22 [0.00, +13.33] | -13.56 [-36.89, +10.89] | +14.67 [+6.33, +23.33] |
| **`010`** | Cell `010` | +27.89 [+20.78, +34.33] | +15.55 [-3.56, +31.00] | +28.89 [+18.00, +38.44] | +41.44 [+29.00, +55.78] | +17.89 [+9.00, +26.00] | +25.89 [+18.11, +32.67] |
| **`011`** | Cell `011` | +17.22 [+3.22, +32.11] | +1.67 [-11.11, +13.22] | -4.89 [-27.89, +15.89] | +8.00 [+1.33, +14.67] | -2.11 [-19.33, +15.45] | +13.67 [-3.89, +32.00] |
| **`100`** | Cell `100` | +13.67 [+2.11, +25.67] | +4.78 [-14.22, +25.67] | -18.78 [-38.67, -0.67] | +13.89 [+5.33, +23.45] | -12.78 [-23.55, -1.56] | -9.67 [-24.67, 0.00] |
| **`101`** | Cell `101` | -1.67 [-12.67, +10.78] | +39.11 [+22.00, +56.44] | +2.89 [-8.11, +14.00] | +15.67 [+5.67, +27.33] | -2.11 [-15.44, +11.11] | -16.78 [-38.00, +4.22] |
| **`110`** | Cell `110` | +16.44 [+4.33, +27.55] | +25.67 [+2.00, +50.11] | +22.78 [+9.11, +38.11] | +31.11 [+20.78, +42.11] | +10.22 [+0.56, +19.44] | -10.33 [-26.78, +4.22] |
| **`111`** | Cell `111` | +28.33 [+14.67, +43.67] | +23.33 [+6.56, +38.33] | +19.33 [+5.11, +33.33] | +24.44 [+13.33, +35.33] | +26.56 [+13.56, +38.45] | +29.67 [+13.67, +44.33] |

In cells `010` and `111`, verbatim rules ($C_0$) outperform distilled summaries ($C$) across all six models (+15.55 to +41.44 pp in `010`; +19.33 to +29.67 pp in `111`), and in cell `110` across five of six models (+10.22 to +31.11 pp, with `qwen27b-2` at -10.33 pp due to $F\text{-}36$ inline `REFERENCES` collisions), while cell `011` ranges from -4.89 to +17.22 pp across models. Natural language summaries in append-only tasks omit explicit column and trigger identifiers (e.g., `supersedes_id`, `P0001`), driving substantial compliance drops under distilled advice in non-streaming cells, while ingestion triggers introduce syntax interactions that moderate the gap in cell `011`.

---

## 7. Sensitivity Analyses & Forensic Audits

> **Note on Methodological Framing:** The analyses in this section evaluate post-treatment subsets and secondary regression models. They are labeled as descriptive sensitivity analyses and observational diagnostics, not formal causal estimates.

### 7.1 Paired Clean-Intersection Sensitivity Analysis
*(Conditioned on a post-treatment outcome; not a causal estimate)*

In Condition A and Condition D, models frequently generate invalid SQL syntax that fails to execute in PostgreSQL. To test whether differences between conditions persist when migrations execute cleanly, we evaluate paired clean intersections where **both conditions executed with PostgreSQL exit code 0** (`migrationExitNonZero === false`):

| Model Family | Contrast | Clean Pairs (n) | Clean Diff (pp) | 95% Bootstrap CI |
| :--- | :--- | :---: | :---: | :---: |
| Nemotron-3-Ultra-550B | **D vs A** | 94 | -0.57 | [-4.24, +3.21] |
| Nemotron-3-Ultra-550B | **C vs A** | 93 | +23.93 | [+17.49, +30.25] |
| Nemotron-3-Ultra-550B | **C0 vs A** | 99 | +38.74 | [+32.95, +44.44] |
| Nemotron-3-Ultra-550B | **B vs A** | 99 | +46.30 | [+40.64, +51.94] |
| Nemotron-3-Ultra-550B | **C0 vs C** | 107 | +14.50 | [+10.17, +18.97] |
| Nemotron-3-Ultra-550B | **C vs D** | 104 | +22.92 | [+16.84, +29.01] |
| Nemotron-3-Ultra-550B | **C0 vs B** | 115 | -7.33 | [-11.19, -3.49] |
| Gemma-4-31B-IT | **D vs A** | 88 | +4.19 | [+1.02, +7.88] |
| Gemma-4-31B-IT | **C vs A** | 96 | +25.89 | [+19.27, +32.57] |
| Gemma-4-31B-IT | **C0 vs A** | 97 | +38.66 | [+33.42, +43.90] |
| Gemma-4-31B-IT | **B vs A** | 101 | +49.42 | [+44.52, +54.36] |
| Gemma-4-31B-IT | **C0 vs C** | 96 | +12.73 | [+7.92, +17.62] |
| Gemma-4-31B-IT | **C vs D** | 88 | +23.79 | [+16.48, +30.85] |
| Gemma-4-31B-IT | **C0 vs B** | 101 | -10.63 | [-14.24, -6.86] |
| GLM-5.3-Flash | **D vs A** | 58 | -0.72 | [-4.71, +3.10] |
| GLM-5.3-Flash | **C vs A** | 75 | +31.87 | [+24.42, +38.89] |
| GLM-5.3-Flash | **C0 vs A** | 64 | +44.79 | [+37.01, +52.29] |
| GLM-5.3-Flash | **B vs A** | 70 | +45.29 | [+39.17, +51.31] |
| GLM-5.3-Flash | **C0 vs C** | 78 | +12.67 | [+7.39, +18.01] |
| GLM-5.3-Flash | **C vs D** | 63 | +30.19 | [+23.41, +36.88] |
| GLM-5.3-Flash | **C0 vs B** | 76 | -3.18 | [-7.87, +1.12] |
| Gemini-3.1-Flash-Lite | **D vs A** | 59 | -4.27 | [-8.62, +0.09] |
| Gemini-3.1-Flash-Lite | **C vs A** | 74 | +22.09 | [+15.45, +28.74] |
| Gemini-3.1-Flash-Lite | **C0 vs A** | 84 | +35.93 | [+29.58, +42.06] |
| Gemini-3.1-Flash-Lite | **B vs A** | 69 | +38.41 | [+31.88, +44.78] |
| Gemini-3.1-Flash-Lite | **C0 vs C** | 79 | +15.36 | [+11.12, +19.92] |
| Gemini-3.1-Flash-Lite | **C vs D** | 57 | +29.36 | [+21.99, +36.52] |
| Gemini-3.1-Flash-Lite | **C0 vs B** | 77 | -4.76 | [-8.81, -0.65] |
| Gemini-3.5-Flash-Lite | **D vs A** | 75 | +0.33 | [-2.53, +3.16] |
| Gemini-3.5-Flash-Lite | **C vs A** | 98 | +29.44 | [+23.50, +35.17] |
| Gemini-3.5-Flash-Lite | **C0 vs A** | 94 | +36.74 | [+30.92, +42.52] |
| Gemini-3.5-Flash-Lite | **B vs A** | 96 | +48.00 | [+41.96, +54.15] |
| Gemini-3.5-Flash-Lite | **C0 vs C** | 101 | +5.68 | [+1.09, +10.36] |
| Gemini-3.5-Flash-Lite | **C vs D** | 77 | +32.75 | [+26.65, +38.66] |
| Gemini-3.5-Flash-Lite | **C0 vs B** | 97 | -12.35 | [-16.92, -7.78] |
| Qwen-3.8-27B | **D vs A** | 91 | -1.34 | [-4.51, +1.74] |
| Qwen-3.8-27B | **C vs A** | 96 | +22.66 | [+16.32, +28.82] |
| Qwen-3.8-27B | **C0 vs A** | 65 | +28.41 | [+20.46, +35.80] |
| Qwen-3.8-27B | **B vs A** | 68 | +38.46 | [+33.46, +43.46] |
| Qwen-3.8-27B | **C0 vs C** | 69 | +10.14 | [+5.60, +14.76] |
| Qwen-3.8-27B | **C vs D** | 99 | +23.62 | [+16.85, +30.44] |
| Qwen-3.8-27B | **C0 vs B** | 64 | -10.94 | [-16.09, -6.33] |

**Key Findings:**
1. When conditioned on clean execution, $C_0$ outperforms $C$ with 95% bootstrap confidence intervals strictly excluding zero across **all six models** (+5.68 to +15.36 percentage points).
2. On `gemini-3.1-flash-lite`, the unconditional reversal $C_0 > B$ ($83.4\%$ vs $75.5\%$) vanishes when paired clean ($B > C_0$ by $+4.76\%$, $95\%$ CI $[-8.81, -0.65]$). Condition B's lower unconditional score was driven by DDL syntax crashes under the 34-rule prompt on that model, not inferior rule content when clean.

### 7.2 Crossed Random-Effects Linear Mixed Model
*(Conditioned on model specification; secondary sensitivity analysis)*

To account for clustering across tasks ($k=120$), facts ($k=18$), factorial cells ($k=8$), and fact-by-condition interaction random slopes ($k=90$), we fit an exact REML Linear Mixed-Effects Model ($y_{tfc,k} \sim \text{condition}_k + (1|\text{task}_t) + (1|\text{fact}_f) + (1|\text{cell}_c) + (1|\text{fact:condition}_{f,k})$) across all 478 bound task-fact pairs ($N = 2,390$ observations per run):

Table 6A: Mixed Model Variance Components & Intraclass Correlation Coefficients

| Model Family | Observations (N) | REML Deviance | `task` (k=120) SD / ICC% | `fact` (k=18) SD / ICC% | `cell` (k=8) SD / ICC% | `fact:cond` (k=90) SD / ICC% | Residual SD | Clustered Share |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Nemotron-3-Ultra-550B | 2390 | -4867.95 | 0.016 / 0.14% | 0.124 / 8.17% | 0.062 / 2.05% | 0.231 / 28.17% | 0.3404 | 38.54% |
| Gemma-4-31B-IT | 2390 | -4596.94 | 0.073 / 2.69% | 0.089 / 3.98% | 0.114 / 6.42% | 0.217 / 23.44% | 0.3567 | 36.54% |
| GLM-5.3-Flash | 2390 | -4784.39 | 0.073 / 2.62% | 0.133 / 8.66% | 0.080 / 3.16% | 0.239 / 28.12% | 0.3411 | 42.56% |
| Gemini-3.1-Flash-Lite | 2390 | -4710.86 | 0.073 / 2.41% | 0.152 / 10.54% | 0.101 / 4.64% | 0.248 / 28.02% | 0.3458 | 45.61% |
| Gemini-3.5-Flash-Lite | 2390 | -5023.94 | 0.074 / 2.68% | 0.142 / 9.78% | 0.065 / 2.08% | 0.269 / 35.18% | 0.3221 | 49.72% |
| Qwen-3.8-27B | 2390 | -5167.48 | 0.059 / 1.70% | 0.172 / 14.65% | 0.087 / 3.72% | 0.252 / 31.28% | 0.3138 | 51.34% |

Table 6B: Fixed Effect Contrasts (REML Model SE vs CR1 Task-Cluster SE)

| Model Family | Contrast | Est (pp) | REML SE | REML 95% CI | REML p | CR1 Task SE | CR1 95% CI | CR1 p |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Nemotron-3-Ultra-550B | **D - A** | -0.29 | 8.12 | [-16.21, +15.62] | 0.9711 | 2.10 | [-4.41, +3.82] | 0.8886 |
| Nemotron-3-Ultra-550B | **C - A** | +27.32 | 8.12 | [+11.40, +43.23] | 0.0008 | 2.73 | [+21.96, +32.68] | 1.66 × 10^-23 |
| Nemotron-3-Ultra-550B | **C0 - A** | +45.58 | 8.12 | [+29.67, +61.50] | 1.98 × 10^-8 | 2.74 | [+40.21, +50.96] | 5.33 × 10^-62 |
| Nemotron-3-Ultra-550B | **B - A** | +54.38 | 8.12 | [+38.47, +70.29] | 2.12 × 10^-11 | 2.21 | [+50.05, +58.71] | 1.13 × 10^-133 |
| Nemotron-3-Ultra-550B | **C0 - C** | +18.26 | 8.12 | [+2.35, +34.18] | 0.0245 | 2.30 | [+13.75, +22.78] | 2.12 × 10^-15 |
| Nemotron-3-Ultra-550B | **C - D** | +27.61 | 8.12 | [+11.70, +43.53] | 0.0007 | 2.70 | [+22.31, +32.91] | 1.73 × 10^-24 |
| Nemotron-3-Ultra-550B | **B - C0** | +8.80 | 8.12 | [-7.12, +24.71] | 0.2786 | 2.16 | [+4.57, +13.03] | 4.56 × 10^-5 |
| Gemma-4-31B-IT | **D - A** | -2.07 | 7.73 | [-17.21, +13.07] | 0.7887 | 1.87 | [-5.73, +1.59] | 0.2672 |
| Gemma-4-31B-IT | **C - A** | +21.12 | 7.73 | [+5.97, +36.26] | 0.0063 | 2.75 | [+15.73, +26.51] | 1.61 × 10^-14 |
| Gemma-4-31B-IT | **C0 - A** | +43.05 | 7.73 | [+27.91, +58.20] | 2.52 × 10^-8 | 3.07 | [+37.03, +49.08] | 1.50 × 10^-44 |
| Gemma-4-31B-IT | **B - A** | +59.02 | 7.73 | [+43.88, +74.16] | 2.19 × 10^-14 | 2.04 | [+55.02, +63.02] | 9.85 × 10^-184 |
| Gemma-4-31B-IT | **C0 - C** | +21.93 | 7.73 | [+6.79, +37.08] | 0.0045 | 3.35 | [+15.36, +28.51] | 6.07 × 10^-11 |
| Gemma-4-31B-IT | **C - D** | +23.19 | 7.73 | [+8.04, +38.33] | 0.0027 | 2.83 | [+17.65, +28.73] | 2.40 × 10^-16 |
| Gemma-4-31B-IT | **B - C0** | +15.97 | 7.73 | [+0.82, +31.11] | 0.0388 | 3.17 | [+9.75, +22.19] | 4.83 × 10^-7 |
| GLM-5.3-Flash | **D - A** | -13.40 | 8.38 | [-29.82, +3.03] | 0.1099 | 2.63 | [-18.55, -8.24] | 3.46 × 10^-7 |
| GLM-5.3-Flash | **C - A** | +31.14 | 8.38 | [+14.71, +47.56] | 0.0002 | 2.56 | [+26.13, +36.15] | 3.99 × 10^-34 |
| GLM-5.3-Flash | **C0 - A** | +34.79 | 8.38 | [+18.36, +51.21] | 3.30 × 10^-5 | 4.07 | [+26.81, +42.77] | 1.31 × 10^-17 |
| GLM-5.3-Flash | **B - A** | +49.51 | 8.38 | [+33.09, +65.93] | 3.45 × 10^-9 | 2.32 | [+44.96, +54.06] | 5.24 × 10^-101 |
| GLM-5.3-Flash | **C0 - C** | +3.65 | 8.38 | [-12.77, +20.07] | 0.6630 | 3.35 | [-2.92, +10.22] | 0.2759 |
| GLM-5.3-Flash | **C - D** | +44.53 | 8.38 | [+28.11, +60.95] | 1.07 × 10^-7 | 2.60 | [+39.43, +49.64] | 1.53 × 10^-65 |
| GLM-5.3-Flash | **B - C0** | +14.72 | 8.38 | [-1.70, +31.15] | 0.0789 | 3.45 | [+7.95, +21.49] | 2.02 × 10^-5 |
| Gemini-3.1-Flash-Lite | **D - A** | -1.75 | 8.70 | [-18.79, +15.30] | 0.8406 | 1.34 | [-4.38, +0.88] | 0.1922 |
| Gemini-3.1-Flash-Lite | **C - A** | +15.84 | 8.70 | [-1.21, +32.88] | 0.0685 | 2.59 | [+10.76, +20.92] | 9.74 × 10^-10 |
| Gemini-3.1-Flash-Lite | **C0 - A** | +44.85 | 8.70 | [+27.81, +61.89] | 2.51 × 10^-7 | 2.05 | [+40.83, +48.87] | 8.43 × 10^-106 |
| Gemini-3.1-Flash-Lite | **B - A** | +36.95 | 8.70 | [+19.91, +53.99] | 2.15 × 10^-5 | 3.65 | [+29.80, +44.10] | 4.14 × 10^-24 |
| Gemini-3.1-Flash-Lite | **C0 - C** | +29.01 | 8.70 | [+11.97, +46.06] | 0.0009 | 2.22 | [+24.66, +33.36] | 5.65 × 10^-39 |
| Gemini-3.1-Flash-Lite | **C - D** | +17.59 | 8.70 | [+0.54, +34.63] | 0.0431 | 2.73 | [+12.24, +22.94] | 1.14 × 10^-10 |
| Gemini-3.1-Flash-Lite | **B - C0** | -7.90 | 8.70 | [-24.94, +9.14] | 0.3636 | 3.89 | [-15.52, -0.28] | 0.0421 |
| Gemini-3.5-Flash-Lite | **D - A** | -4.30 | 9.33 | [-22.57, +13.98] | 0.6450 | 1.91 | [-8.04, -0.56] | 0.0243 |
| Gemini-3.5-Flash-Lite | **C - A** | +33.67 | 9.33 | [+15.39, +51.95] | 0.0003 | 2.34 | [+29.08, +38.26] | 5.84 × 10^-47 |
| Gemini-3.5-Flash-Lite | **C0 - A** | +40.85 | 9.33 | [+22.57, +59.12] | 1.18 × 10^-5 | 2.91 | [+35.15, +46.54] | 6.82 × 10^-45 |
| Gemini-3.5-Flash-Lite | **B - A** | +58.14 | 9.33 | [+39.86, +76.42] | 4.53 × 10^-10 | 2.21 | [+53.80, +62.48] | 4.96 × 10^-152 |
| Gemini-3.5-Flash-Lite | **C0 - C** | +7.18 | 9.33 | [-11.10, +25.45] | 0.4415 | 2.27 | [+2.73, +11.62] | 0.0016 |
| Gemini-3.5-Flash-Lite | **C - D** | +37.97 | 9.33 | [+19.69, +56.24] | 4.67 × 10^-5 | 1.94 | [+34.15, +41.78] | 7.37 × 10^-85 |
| Gemini-3.5-Flash-Lite | **B - C0** | +17.29 | 9.33 | [-0.99, +35.57] | 0.0637 | 2.73 | [+11.93, +22.65] | 2.50 × 10^-10 |
| Qwen-3.8-27B | **D - A** | -1.32 | 8.73 | [-18.44, +15.79] | 0.8796 | 2.32 | [-5.87, +3.22] | 0.5683 |
| Qwen-3.8-27B | **C - A** | +27.73 | 8.73 | [+10.61, +44.84] | 0.0015 | 2.35 | [+23.11, +32.34] | 5.23 × 10^-32 |
| Qwen-3.8-27B | **C0 - A** | +37.54 | 8.73 | [+20.42, +54.66] | 1.72 × 10^-5 | 3.15 | [+31.36, +43.72] | 1.07 × 10^-32 |
| Qwen-3.8-27B | **B - A** | +50.06 | 8.73 | [+32.94, +67.18] | 9.94 × 10^-9 | 2.11 | [+45.93, +54.19] | 5.42 × 10^-125 |
| Qwen-3.8-27B | **C0 - C** | +9.81 | 8.73 | [-7.30, +26.93] | 0.2612 | 2.93 | [+4.06, +15.56] | 0.0008 |
| Qwen-3.8-27B | **C - D** | +29.05 | 8.73 | [+11.93, +46.17] | 0.0009 | 2.86 | [+23.45, +34.65] | 2.73 × 10^-24 |
| Qwen-3.8-27B | **B - C0** | +12.52 | 8.73 | [-4.60, +29.64] | 0.1517 | 2.75 | [+7.13, +17.91] | 5.34 × 10^-6 |

**Key Findings:**
1. Fact-level random intercepts ($4.0\%$ to $14.7\%$) and condition-by-fact random slopes ($23.4\%$ to $35.2\%$) capture the predominant share of clustered variance (total clustered share $36.5\%$ to $51.3\%$), confirming substantial intrinsic difficulty variation across relational invariants and heterogeneous rule sensitivity across experimental conditions.
2. Cell-level clustering accounts for $2.1\%$ to $6.4\%$ of variance, reflecting the added complexity of multi-tenancy and immutability, while task-level clustering accounts for $0.1\%$ to $2.7\%$.
3. Fixed-effect condition estimates under small-sample CR1 task-clustered sandwich standard errors remain statistically significant ($p < 0.0001$ for $C - A$, $C_0 - A$, and $B - A$), confirming that primary contrast conclusions are robust to arbitrary task-level covariance and condition-by-fact random variation.

### 7.3 Retrieval Stratification: Retrieved vs. Non-Retrieved Bound Facts
*(Descriptive sensitivity analysis on bound task-fact pairs)*

Table 7 breaks down pass rates on bound task-fact pairs stratified by whether the fact was retrieved ($n=396$) or non-retrieved ($n=82$):

| Model Family | Stratum | A % | D % | C % | C0 % | B % | D−A [95% CI] | C−A [95% CI] | C0−A [95% CI] | B−A [95% CI] |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Nemotron-3-Ultra-550B | **Retrieved (n=396)** | 41.7% | 41.7% | 76.5% | 91.9% | 93.2% | 0.00 [-4.04, +4.07] | +34.85 [+29.55, +40.21] | +50.25 [+44.53, +55.77] | +51.52 [+45.34, +57.64] |
| | **Non-Retrieved (n=82)** | 73.2% | 78.0% | 47.6% | 58.5% | 97.6% | +4.88 [-4.05, +14.29] | -25.61 [-36.14, -13.75] | -14.63 [-25.61, -2.53] | +24.39 [+15.07, +34.18] |
| Gemma-4-31B-IT | **Retrieved (n=396)** | 35.1% | 34.3% | 69.4% | 84.1% | 93.7% | -0.76 [-4.96, +3.28] | +34.34 [+27.66, +41.01] | +48.99 [+42.82, +55.24] | +58.59 [+52.98, +64.12] |
| | **Non-Retrieved (n=82)** | 70.7% | 65.8% | 32.9% | 46.3% | 92.7% | -4.88 [-16.46, +6.10] | -37.80 [-50.60, -24.00] | -24.39 [-38.10, -9.76] | +21.95 [+10.53, +34.09] |
| GLM-5.3-Flash | **Retrieved (n=396)** | 35.4% | 27.5% | 78.5% | 72.5% | 90.4% | -7.83 [-12.53, -3.33] | +43.18 [+36.73, +49.25] | +37.12 [+26.82, +47.03] | +55.05 [+50.00, +60.21] |
| | **Non-Retrieved (n=82)** | 67.1% | 39.0% | 57.3% | 73.2% | 86.6% | -28.05 [-42.68, -13.58] | -9.76 [-25.97, +6.45] | +6.10 [-9.41, +21.52] | +19.51 [+8.00, +31.65] |
| Gemini-3.1-Flash-Lite | **Retrieved (n=396)** | 42.9% | 42.2% | 68.9% | 88.4% | 75.3% | -0.76 [-3.95, +2.41] | +26.01 [+20.93, +31.17] | +45.45 [+39.70, +51.46] | +32.32 [+24.94, +39.75] |
| | **Non-Retrieved (n=82)** | 70.7% | 64.6% | 48.8% | 59.8% | 76.8% | -6.10 [-17.44, +4.94] | -21.95 [-34.94, -7.69] | -10.98 [-22.89, +1.35] | +6.10 [-7.59, +19.75] |
| Gemini-3.5-Flash-Lite | **Retrieved (n=396)** | 35.1% | 32.8% | 80.8% | 80.0% | 83.1% | -2.27 [-6.62, +1.99] | +45.71 [+40.00, +51.26] | +44.95 [+37.38, +52.24] | +47.98 [+41.10, +54.78] |
| | **Non-Retrieved (n=82)** | 41.5% | 25.6% | 8.5% | 24.4% | 96.3% | -15.85 [-25.00, -6.58] | -32.93 [-40.48, -25.00] | -17.07 [-27.50, -7.23] | +54.88 [+45.00, +64.94] |
| Qwen-3.8-27B | **Retrieved (n=396)** | 41.7% | 38.4% | 79.5% | 82.6% | 92.7% | -3.28 [-8.05, +1.31] | +37.88 [+31.77, +43.89] | +40.91 [+34.91, +46.62] | +51.01 [+45.43, +56.62] |
| | **Non-Retrieved (n=82)** | 72.0% | 81.7% | 45.1% | 67.1% | 97.6% | +9.76 [-2.38, +22.47] | -26.83 [-40.74, -11.69] | -4.88 [-19.75, +10.39] | +25.61 [+15.48, +36.90] |

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
3. **Condition B Text Reconciliation:** An audit was performed to verify that `STATIC_FACTS` in `ablation.ts` matched `facts.json` character-for-character, confirming 0 text differences across all 34 active rules.
4. **Post-Hoc Validity Gate Formalization:** The validity gate criteria ($B > A$, constant settings, pinned version) were formalized after early runs were observed to experience cache instability and model alias drift.

---

## 10. Limitations

1. **Templated Tasks and Intraclass Correlation:** Tasks in the evaluation corpus were generated across an $2^3$ factorial template structure. This leads to substantial clustering across feature cells, as reflected by high intraclass correlation ($ICC(1) = 0.2346$ on bound facts and $0.6478$ on all facts in Nemotron).
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

Across **3,600 independent generations (4,320 scored trials)** on six model families, our findings demonstrate that:
1. **Failure-Prioritized Rule Retrieval is Highly Effective:** Injecting targeted failure rules improves bound-fact compliance by +18.19 to +33.04 percentage points over zero-shot baselines ($p < 0.0001$).
2. **Verbatim Specifications Beat Distilled Summaries:** In rigid software engineering contracts, natural language summaries strip critical identifiers. Verbatim canonical statements significantly outperform distilled advice in 4 of 6 models unconditionally, and in all 6 models under clean execution (by +5.68 to +15.36 percentage points).
3. **Exploratory Token Efficiency:** Selective verbatim rule retrieval achieves 79.9% to 110.6% of the performance of the full static reference condition while reducing prompt token consumption by 51.0% to 53.3%.
4. **Verbatim Invariants Require Precise Syntactic Specification:** Syntactic ambiguities in rule text (such as inline foreign keys) produce deterministic failure cascades that can only be diagnosed through rigorous statement-sufficiency validation.

---

## Appendix: Run Ledger & Campaign Telemetry

Table A1 documents the complete campaign execution ledger across all completed, exploratory, and in-progress runs recorded in `out/run-ledger.json`:

| Run ID | Requested Model | Provider | Trials | Matrix Scope | Inclusion Status | Exclusion Criteria & Governance Note |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `dev-calibration` | `dev-calibration` | nvidia | 40 | — | **excluded** | `archived_historical`:  |
| `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | gemini | 720 | main | **included** | Completed all 720 trials with constant settings on standard Google AI Studio endpoint with pinned model version; output sanitization verified; passed B > A validity gate (75.46% vs 34.68%, 95% CI strictly excluding zero). |
| `gemini-flash-lite-full` | `gemini-3.5-flash-lite` | gemini | 720 | main | **included** | Completed all 720 trials with constant settings on standard Google AI Studio endpoint with pinned model version; output sanitization verified; passed B > A validity gate (85.82% vs 26.94%, 95% CI strictly excluding zero). |
| `gemini-mini` | `gemini-3.6-flash` | gemini | 18 | excluded_pilot | **excluded** | `completion_720`: Excluded under criterion completion_720: aborted at 18 trials (3 tasks) during mini-subset probe. |
| `gemma4-26b-full` | `gemma-4-26b-it` | gemini | 720 | excluded_model_set_and_alias_mismatch | **excluded** | `pinned_model_version`: Excluded under criterion pinned_model_version: completed 720 trials, but returnedModel alias shifted mid-campaign (requested gemma-4-26b-it, returned gemma-4-26b-a4b-it). |
| `gemma4-26b-full-archived-tag-leak` | `gemma4-26b-full-archived-tag-leak` | gemini | 446 | excluded_invalid_sanitization | **excluded** | `archived_historical`: Halted at 446 trials (out of 720) and archived to out/archive/gemma-tag-leak-2026-11-08 after discovering pre-fix executor did not strip unescaped <thought>...</thought> blocks (156 trials leaked raw tags into SQL) and 141 trials truncated at length limit (8192 max_tokens). Infrastructure/sanitization defect, not result peeking. |
| `gemma4-31b-full` | `gemma-4-31b-it` | gemini | 720 | main | **included** | Completed all 720 trials on Google AI Studio with constant settings (thinking_level=minimal, verified sanitization); passed B > A validity gate (93.33% vs 41.25%, 95% CI strictly excluding zero). |
| `gemma4-31b-full-archived-tag-leak` | `gemma4-31b-full-archived-tag-leak` | gemini | 22 | excluded_invalid_sanitization | **excluded** | `archived_historical`: Halted at 22 trials (H-001..H-004 partial) and archived to out/archive/gemma-tag-leak-2026-11-08 due to the same pre-fix <thought> tag leak (15 trials) plus B/E_B hitting length truncation (7 trials). Infrastructure/sanitization defect. |
| `glm5-2` | `z-ai/glm-5.3-flash` | nvidia | 720 | main | **included** | Completed all 720 trials with constant settings on standard NVIDIA API endpoint with pinned model version; output sanitization verified; passed B > A validity gate (90.22% vs 41.46%, 95% CI strictly excluding zero). |
| `gptoss-120b-expanded` | `openai/gpt-oss-120b` | groq | 550 | eligible_until_deadline | **eligible_until_deadline** | In-progress run against Groq standard endpoint (model pinned to openai/gpt-oss-120b); eligible until deadline upon completion. |
| `liquid17b-mini` | `liquid/lfm-3-1.7b` | openrouter | 48 | excluded_mini_subset | **excluded** | `completion_720, verified_sanitization, validity_gate_b_gt_a`: Excluded under criteria completion_720 (48 trials), verified_sanitization (37/48 length truncation), and validity_gate_b_gt_a (B < A). |
| `nemotron-1` | `nemotron-1` | nvidia | 720 | — | **excluded** | `archived_historical`:  |
| `nemotron-2` | `nvidia/nemotron-3-ultra-550b-a55b` | nvidia | 720 | main | **included** | Completed all 720 trials with constant settings on standard NVIDIA API endpoint with pinned model version; output sanitization verified; passed B > A validity gate (93.88% vs 47.44%, 95% CI strictly excluding zero). |
| `nemotron-lightning-full` | `nvidia/nemotron-3.5-lightning:free` | kilo | 720 | exploratory_excluded | **excluded** | `constant_settings, standard_endpoint, validity_gate_b_gt_a`: Excluded under rule criteria: non-constant settings (Trial 1 max_tokens=8192 with default reasoning vs Trials 2-720 max_tokens=16384 with reasoning disabled), served via unstable third-party gateway (kilo.ai), and failed post-hoc validity gate (B 42.71% vs A 42.00%, CI includes zero). |
| `qwen27b-2` | `qwen/qwen3.8-27b` | groq | 720 | main | **included** | Completed all 720 trials with constant settings on standard Groq API endpoint with pinned model version; output sanitization verified; passed B > A validity gate (92.49% vs 46.31%, 95% CI strictly excluding zero). |
| `train-calibration` | `train-calibration` | nvidia | 40 | — | **excluded** | `archived_historical`:  |
| `xingchen-mini` | `xingchen-agi/xing4.0-29b-a4b:free` | openrouter | 48 | excluded_mini_subset | **excluded** | `completion_720, verified_sanitization`: Excluded under criteria completion_720 (48 trials) and verified_sanitization (13/48 length truncation, 9/48 empty). |

---

## References

1. Mishra, S., & Mishra, S. (2026). *When Does Memory Help? A Cost-Aware Evaluation of Long-Term Memory in Tool-Using LLM Agents*. arXiv preprint arXiv:2609.05441.
2. Prokopiou, I., Aidinis, A., Kyrmpatsos, P.-C., & Vikatos, P. (2026). *What Drives Recovery in Agentic Text-to-Cypher? LAST-CQ: An LLM Agent Self-Refinement Framework*. Workshop on Reasoning and Learning with External Knowledge for LLMs (REALM @ EMNLP 2026). arXiv:2609.12746.
3. Shen, M., Zha, K.-W., He, Z., & Wornell, G. W. (2026). *Decocted Experience Improves Test-Time Inference in LLM Agents*. Conference on Language Modeling (COLM 2026). arXiv:2604.04373.
4. Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*. Advances in Neural Information Processing Systems (NeurIPS 2023), 36. arXiv:2303.11366.
5. Vo, K. N. H., Chu, T. M., Dinh, A. T. D., Bui, T. V. H., & Quan, T. (2026). *Causal Episodic Memory for Feedback-Driven Agent Repair (MERIT)*. Workshop on Reasoning and Learning with External Knowledge for LLMs (REALM @ EMNLP 2026). arXiv:2608.05906.
6. Zhang, D., Lin, Y., Wu, Z., Sun, Y., Li, B., Li, D., & Peng, H. (2026). *Useful Memories Become Faulty When Continuously Updated by LLMs*. NeurIPS 2026 Workshop. arXiv:2605.12978.
7. Zhao, W., Wang, Y., Zhang, Y., Deng, Y., Zhao, Y., Che, W., Qin, B., & Liu, T. (2026). *Large Language Model Agents Are Not Always Faithful Self-Evolvers*. International Conference on Machine Learning (ICML 2026). arXiv:2601.22436.
