# Axiom: Deterministic Verification and Lesson Retrieval for Self-Healing Architecture and SQL Migration Generation

## Abstract

Automated software engineering agents frequently generate syntactically plausible database migrations that silently violate critical application invariants, such as tenant isolation boundaries, row-level security (RLS) enforcement, immutable audit logging, and privilege separation. Traditional evaluation approaches rely on large language models (LLMs) to inspect code; however, LLM-based verification suffers from correlated blind spots, non-determinism, and hallucinated compliance. 

In this work, we present **Axiom**, a dual-track architectural verification and reflexion system founded on the strict design principle that *all LLM output is untrusted candidate material and only external deterministic oracles hold authority*. Axiom couples two decoupled mechanisms: (1) an *operational reflexion loop* that enforces deterministic grammar, vault consistency, and executable security AST checks on agent architecture rules, and (2) an *empirical SQL migration ablation harness* that evaluates candidate migrations against an isolated PostgreSQL 16 containerized Oracle probing 39 enterprise database contracts.

We report the complete empirical results of the pre-registered Ablation v2 protocol on NVIDIA's flagship `nvidia/nemotron-3-ultra-550b-a55b` across 120 frozen held-out test tasks (720 scored trials from 600 independent generations at temperature 0). Condition C (Axiom Reflexion memory retrieval, top $K=10$) achieves a **+25.35%** improvement in bound-fact compliance over zero-shot baseline Condition A ($71.65\%$ vs. $46.31\%$, paired sign-flip $p = 1.00 \times 10^{-5}$, Holm-Bonferroni primary $p = 4.00 \times 10^{-5}$, exact McNemar $p = 6.16 \times 10^{-6}$) and a **+22.15%** improvement over task-irrelevant distractor Condition D ($49.50\%$, $p = 1.00 \times 10^{-5}$), proving that performance gains stem from targeted invariant memory rather than prompt expansion.

Crucially, we uncover a profound architectural finding: injecting verbatim canonical contract statements (Condition C0, **88.18%** compliance, **63.33%** strict Pass@1) substantially outperforms Advisor-distilled natural language lessons (Condition C, **71.65%** compliance, **25.00%** strict Pass@1; paired difference **-16.53%**, $p = 1.00 \times 10^{-5}$, McNemar $p = 1.17 \times 10^{-10}$). Selective retrieval of verbatim canonical facts recovers over $95\%$ of full golden-prompt performance (Condition B, $92.49\%$) while reducing prompt token consumption by **51.3%** ($554.3$ vs. $1,138.2$ tokens). We detail the nine core assemblies of Axiom, provide an interactive 3D anatomy visualization, validate clean-migration sensitivity and 8-cell feature stratification ($ICC(1) = 0.2603$), and release the complete dataset, verification harness, and provenance logs for open replication.

---

## 1. Introduction

Relational database migrations represent high-stakes operations in software engineering. A flaw in an application-layer function may trigger an isolated runtime exception, but a flaw in a data definition language (DDL) migration—such as an unindexed foreign key in a high-throughput table, a permissive row-level security policy that leaks tenant data, an omitted append-only trigger, or a regression in role grants—can irreversibly compromise data integrity, degrade availability, or violate regulatory compliance.

While modern Large Language Models (LLMs) can generate complex SQL DDL statements, they exhibit systemic blind spots when tasked with satisfying implicit enterprise architectural invariants. An LLM may generate syntactically valid `CREATE TABLE` and `ALTER TABLE` statements while omitting tenant isolation policies, using deprecated column types, failing to configure security-definer function search paths, or creating unprivileged access pathways. 

Addressing this failure mode via standard prompt engineering or self-reflection faces three fundamental roadblocks:

1. **The LLM Grader Fallacy:** Relying on an LLM to evaluate its own or another model's SQL output results in correlated errors. Models routinely hallucinate that code meets an invariant when it does not.
2. **Context Window Inefficiency & Prompt Clutter:** Ingesting an entire organization's architectural rulebook into every prompt inflates token consumption, increases API latency, and induces model distraction, leading to degraded instruction-following on nuanced tasks.
3. **Semantic Compression Noise ("The Distillation Penalty"):** Reflexion architectures typically employ secondary LLMs to summarize failure traces into natural language "lessons". However, natural language distillation often compresses away the exact contractual phrasing, leading to ambiguous guidance in subsequent generations.

To overcome these challenges, we designed and built **Axiom**. Axiom operates under an uncompromising invariant:

$$\text{\bf Invariant 0 (Authority Separation):} \quad \text{LLM generation is untrusted candidate material. Only external, deterministic verifiers possess authority.}$$

Axiom implements two distinct, decoupled execution pathways:

* **Operational Reflexion Loop (`src/loop.ts`):** An operational self-healing harness for architecture rule and agent definition Markdown files. It combines three levels of deterministic verification (L1 structural grammar, L2 vault consistency, and L3 executable static AST checks) with Tier 0 automated mechanical fixes, single-rule Advisor distillation, confidence score clamping, and an automated quarantine gate.
* **Empirical SQL Migration Ablation Harness (`src/eval/ablation.ts`):** A controlled, frozen scientific experiment evaluating SQL DDL generation against a PostgreSQL 16 containerized Oracle across 200 tasks (40 Train, 40 Dev, 120 Held-out Test) under six distinct prompt treatments.

This manuscript details the completed implementation of Axiom, presents the empirical results of the 720-trial held-out experiment on `nvidia/nemotron-3-ultra-550b-a55b`, analyzes the four pre-registered confirmatory contrasts with full multiplicity control, evaluates prompt token economics, dissects the interactive 3D system anatomy, and examines the implications of external deterministic oracles for automated code synthesis.

---

## 2. Axiom Architecture & The Nine Core Assemblies

Axiom is engineered as a set of decoupled, specialized assemblies. The complete system architecture is depicted in the interactive 3D anatomy visualization implemented in the Axiom dashboard ([`dashboard/src/components/anatomy/AxiomAnatomy.tsx`](file:///c:/Users/neil/Axiom/dashboard/src/components/anatomy/AxiomAnatomy.tsx)). 

```
                                ┌──────────────────────────────────────────────┐
                                │                 Task Prompt                  │
                                │   (Table, Derived Flags, Canonical Schema)   │
                                └──────────────────────┬───────────────────────┘
                                                       │
                                                       ▼
 ┌──────────────────────────┐           ┌──────────────────────────────┐
 │   Memory Vault (.json)   │──────────▶│   Retrieval Engine (K=10)    │
 │ (Cryptographic SHA-256)  │           │   (Feature Match & Frequency)│
 └──────────────────────────┘           └──────────────┬───────────────┘
                                                       │ Injected Invariant Hints
                                                       ▼
 ┌──────────────────────────┐           ┌──────────────────────────────┐
 │   Tier 0 Fixer (AST)     │◀──────────│      Executor (LLM NIM)      │
 │ (Mechanical Repair/Prov) │           │ (nvidia/nemotron-3-ultra)    │
 └──────────────────────────┘           └──────────────┬───────────────┘
                                                       │ Candidate SQL Migration
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │   PostgreSQL 16 Docker       │
                                        │   Oracle Test Container      │
                                        └──────────────┬───────────────┘
                                                       │
                                ┌──────────────────────┴──────────────────────┐
                                │                                             │
                       [Violations Found]                              [Clean Pass]
                                │                                             │
                                ▼                                             ▼
                 ┌──────────────────────────────┐              ┌──────────────────────────────┐
                 │       Advisor Engine         │              │    Candidate Promotion       │
                 │   (Concise Rule Distill)     │              │    & Multiplicity Gate       │
                 └──────────────┬───────────────┘              └──────────────────────────────┘
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │    Quarantine & Audit Log    │
                 │    (.axiom-state/quarantine) │
                 └──────────────────────────────┘
```

The system comprises nine primary architectural assemblies:

### Assembly 1: Deterministic Verifier (L1, L2, L3)
The Verifier ([`src/verifier/`](file:///c:/Users/neil/Axiom/src/verifier/)) is strictly deterministic by construction: it contains zero LLM calls, zero network access, and zero stochastic routines. It enforces correctness across three tiers:
* **Level 1 (Structural Grammar):** Verifies AST syntax rules. For agent files, it validates checks `A1`–`A10` (requiring exactly six specific H2 sections in order, proper prefix isolation, and gate declarations). For domain rule files, it validates checks `L1-01`–`L1-10` (requiring RFC 2119 condition-action syntax: `- **ID** Name: WHEN condition → DO action | conf: N`).
* **Level 2 (Vault Consistency):** Verifies cross-reference integrity against the global rule index, ensuring prefix uniqueness, valid wikilink targets (`D10`), and preventing collision with canonical files.
* **Level 3 (Executable Security Scanners):** Deterministic static analysis engines enforcing database migration rules (`DB-01`, banning raw primary keys in tenant-isolated tables without compound keys) and security policies (`SEC-03`, enforcing explicit schema search paths on `SECURITY DEFINER` functions). In programmatic mutation testing ([`tests/verifier.test.ts`](file:///c:/Users/neil/Axiom/tests/verifier.test.ts)), the Verifier achieves a **100.0% mutation kill rate** (56/56 killed programmatic mutations).

### Assembly 2: PostgreSQL 16 Oracle Engine
The migration Oracle ([`scripts/oracle.ts`](file:///c:/Users/neil/Axiom/scripts/oracle.ts)) executes candidate SQL in an isolated Docker container running official `postgres:16`. For every trial:
1. A fresh test database is provisioned and initialized with the canonical baseline seed schema.
2. The candidate migration script is executed under the administrative `deployer` role via `psql`. If execution returns a non-zero exit code, `migrationExitNonZero: true` is recorded alongside raw `stderr`.
3. Behavioral and static probes are executed using three distinct enterprise roles: `deployer`, `application` (restricted application user), and `readonly_user` (unprivileged reporting role).
4. Tenant isolation is probed by stubbing `auth.jwt()` session claims to assert that cross-tenant queries fail with SQLSTATE `42501` (distinguishing RLS table policy violations from general permission errors via error message inspection).
5. The Oracle returns a deterministic list of failed fact IDs with canonical statements. It **never** leaks golden SQL or code patches to the generation harness.

### Assembly 3: Cryptographic Rule Vault
The lesson memory subsystem stores verified rules in `.axiom-state/memory.json`. The vault is cryptographically sealed:
* At evaluation startup, its SHA-256 hash is computed and locked.
* At evaluation completion, the hash is re-computed. Any modification during an evaluation trial immediately invalidates the run checkpoint.
* Storage writes utilize atomic temporary file replacement (`temp + rename`) and enforce a strict FIFO ring-buffer cap of 25 lessons on disk with LRU recency tracking on `lastUsedAt`.

### Assembly 4: Reflexion Loop & Distillation Advisor
In the operational agent loop ([`src/loop.ts`](file:///c:/Users/neil/Axiom/src/loop.ts)), when candidate generation fails verification, the Advisor ([`src/advisor.ts`](file:///c:/Users/neil/Axiom/src/advisor.ts), using `deepseek-ai/deepseek-v4.1-flash`) is provided only the failed trace and canonical error code. It distills a single, actionable formatting rule constrained to **under 24 words**. Crucially, the Advisor is not an authority: its distilled lesson remains in a pending state and is saved to the vault *only if a subsequent retry attempt successfully passes deterministic verification*.

### Assembly 5: Selective Retrieval Engine
The Retrieval Engine ([`src/memory.ts`](file:///c:/Users/neil/Axiom/src/memory.ts)) matches historical lessons to active task prompts based on structured feature flags (`tenant`, `append_only`, `ingestion`, `status`, `sec_definer`, `latest_per_key`, `view`). Rather than ingesting the full vault, retrieval selects up to $K=10$ lessons (the budget identified in pre-registered sweep [`scripts/report-dev-k-sweep.ts`](file:///c:/Users/neil/Axiom/scripts/report-dev-k-sweep.ts) as achieving $\ge 80\%$ retrievable bound-fact coverage on Dev). Candidate lessons are ranked deterministically:
1. Training failure frequency descending (`trainFailureRate`), prioritizing invariants the model historically failed most often;
2. Historical utility score (`utilityScore > 0`);
3. Feature compatibility score ($10 \times \text{featureMatch} + \text{utilityScore}$);
4. LRU recency (`lastUsedAt` descending);
5. Canonical error code ascending (`errorCode`).

### Assembly 6: Tier 0 Deterministic Fixer
The Fixer ([`src/fixer.ts`](file:///c:/Users/neil/Axiom/src/fixer.ts)) executes mechanical, deterministic transformations for known syntactic defects (e.g., repairing malformed RFC 2119 headers, inserting missing pipe delimiters, normalizing confidence tags). To maintain provenance integrity, every line modified by Tier 0 records an explicit provenance tag, and any harvested rule modified mechanically has its `llmConfidence` clamped to `null` to prevent artificial confidence inflation.

### Assembly 7: Model Generation Executor
The Executor ([`src/executor.ts`](file:///c:/Users/neil/Axiom/src/executor.ts)) interfaces with LLM endpoints via an OpenAI-compatible API over NVIDIA NIM (`https://integrate.api.nvidia.com/v1`). All calls use greedy decoding (`temperature = 0`). The Executor enforces strict model fidelity: `assert returnedModel === requestedModel` on every API response. Transient network or provider errors (HTTP 429, 5xx, network drops) trigger exponential backoff retries; deterministic generation failures (token truncation `length`, content filter `other`, empty completions `empty`) are recorded losslessly without terminating the harness.

### Assembly 8: Candidate Quarantine & Promotion Gate
Generated architecture rules are treated as candidates. Failed traces are quarantined into `.axiom-state/quarantine.jsonl`. Candidate rules are staged exclusively in `.axiom-state/candidate-registry.json` and are **never** written directly into canonical domain directories (`brain/02-domains/` or `agents/`). Automated confidence is strictly bounded: candidates are clamped to `conf <= 2`, automated checks can raise confidence to `conf: 3`, and human approval is mandatory for `conf > 3`.

### Assembly 9: Offline Analysis & Multiplicity Control Pipeline
The analysis pipeline ([`scripts/analyze-ablation-v2.ts`](file:///c:/Users/neil/Axiom/scripts/analyze-ablation-v2.ts)) executes offline once all trials complete. It calculates paired sign-flip randomization tests, paired bootstrap confidence intervals, exact McNemar tests, and enforces Holm-Bonferroni step-down correction across confirmatory contrast families to prevent false discovery.

---

## 3. Dataset, Task Design, and Bound-Fact Formulation

### 3.1 Task Corpus Stratification
The evaluation dataset ([`fixtures/task-v2/tasks.json`](file:///c:/Users/neil/Axiom/fixtures/task-v2/tasks.json)) contains 200 frozen database migration prompts, stratified into three distinct splits:
* **Training Split (40 tasks, `T-001` to `T-040`):** Used to calibrate model failure baselines and build the initial lesson memory.
* **Development Split (40 tasks, `D-001` to `D-040`):** Used for pre-registration parameter sweeps (e.g., tuning the retrieval budget $K$).
* **Held-Out Test Split (120 tasks, `H-001` to `H-120`):** Reserved strictly for confirmatory evaluation. Never exposed during prompt tuning, memory distillation, or retrieval calibration.

Tasks are uniformly distributed across an $2^3 = 8$ factorial design of foundational enterprise feature flags:
* `tenant \in {true, false}`: Mandates multi-tenant isolation, composite foreign keys, and RLS policies.
* `append_only \in {true, false}`: Mandates immutable audit logging, update/delete revocation, and append-only trigger enforcement.
* `ingestion \in {true, false}`: Mandates high-throughput batch staging, unlogged or partition-aligned architectures, and deferred indexing.

Each cell in the held-out test split contains exactly 15 tasks ($8 \times 15 = 120$).

### 3.2 The 39-Fact Enterprise Contract Registry
The contract registry ([`fixtures/task-v2/facts.json`](file:///c:/Users/neil/Axiom/fixtures/task-v2/facts.json)) defines 39 enterprise database invariants covering 10 functional categories:
1. **Naming & Identity:** Table names, primary key conventions (`F-01`, `F-13`).
2. **Schema & Defaults:** Timestamps (`F-02`), UUID generation (`F-03`), soft deletion (`F-04`).
3. **Multi-Tenancy & Isolation:** Tenant ID presence (`F-05`), composite indexing (`F-06`), composite foreign keys (`F-07`).
4. **Row-Level Security (RLS):** RLS enablement (`F-08`), tenant boundary policies (`F-09`), insert check policies (`F-10`).
5. **Append-Only & Immutability:** Revocation of UPDATE/DELETE (`F-11`), immutability triggers (`F-12`).
6. **Views & Projections:** Tenant-scoped security-barrier views (`F-14`–`F-17`).
7. **Triggers & Automation:** Updated-at automated triggers (`F-18`–`F-21`).
8. **Security Definer Functions:** Explicit search path configuration (`F-22`–`F-24`).
9. **Role-Based Privilege Grants:** Table and sequence grants to `application` and `readonly_user` (`F-25`–`F-30`).
10. **Storage & Performance:** JSONB validation checks (`F-31`), partial indexing (`F-32`–`F-39`).

Of the 39 registry facts, 34 are active confirmed facts eligible for evaluation; 5 remain inactive (`PROPOSED` or `UNCONFIRMED`).

### 3.3 The R2 Bound-Fact Selection Protocol
Evaluating a model against all 34 facts on every task creates a severe methodological flaw: ubiquitous, trivial facts (such as basic table creation) dilute the score, while irrelevant facts penalize the model inappropriately.

To address this, Axiom defines a subset of **bound facts** for each task. The bound facts are selected exclusively via the pre-registered `R2` protocol ([`scripts/propose-bound-facts.ts`](file:///c:/Users/neil/Axiom/scripts/propose-bound-facts.ts)):
1. **Train-Only Calibration:** Failure rates for all facts were computed under Condition A on the Training split (`out/train-calibration.json`).
2. **Discriminating Candidate Filter:** A fact is designated as a bound-fact candidate if it applies to $\ge 3$ training tasks, is satisfied by golden reference SQL, and has a Training Condition A pass rate $\le 0.80$ (failure rate $\ge 0.20$). This yielded 18 discriminating candidate facts (11 non-trivial facts in $[0.10, 0.80]$ and 7 enterprise floor conventions at $0.00$).
3. **Deterministic Seeding:** For each task $t$, a deterministic pseudo-random seed is derived from $\text{SHA-256}(t.\text{id})$. The target number of bound facts is set to:
   $$\text{target} = 3 + (\text{seed} \pmod 3) \in \{3, 4, 5\}$$
4. **Assignment:** Up to `target` facts are drawn from the task's applicable candidate facts. Across all 200 tasks in the corpus, **zero tasks required backfilling** from non-discriminating facts.

Bound facts determine the primary task score, while all applicable facts remain logged as secondary diagnostic telemetry.

---

## 4. Experimental Setup & Pre-Registered Protocol

The Ablation v2 experiment evaluates six conditions across the 120 held-out test tasks ($6 \times 120 = 720$ total scored trials):

| Condition | Description & Prompt Treatment | Independent LLM Calls | Prompt Token Cost |
|:---|:---|:---:|:---|
| **Condition A** | **Zero-Shot Baseline:** Task prompt only. No hints, no memory, no rules. | 120 | Minimal ($247.2$ tokens) |
| **Condition B** | **Golden Full Invariant Injection:** Task prompt plus static injection of all 34 active eligible canonical fact statements. | 120 | High ($1,138.2$ tokens) |
| **Condition C** | **Axiom Reflexion Retrieval (Top $K=10$):** Task prompt plus selective retrieval of up to 10 feature-compatible Advisor-distilled lessons from training memory. | 120 | Moderate ($521.9$ tokens) |
| **Condition C0** | **Axiom Reflexion Verbatim (Top $K=10$):** Identical retrieval ranking and items as Condition C, but injecting the canonical Oracle fact statement verbatim instead of distilled text. | 120 | Moderate ($554.3$ tokens) |
| **Condition D** | **Placebo Distractor:** Task prompt plus true, well-formatted PostgreSQL best practice tips outside the task's applicable fact set (controlling for prompt token length). | 120 | High ($849.2$ tokens) |
| **Condition E_B** | **Ablation Control:** Condition B evaluated through the Tier 0 measurement path. Because SQL has no generic safe Tier 0 rewrite, Condition E_B explicitly reuses Condition B's cached generation (`reusedFromCondition: 'B'`). | 0 (Reused) | Identical to B ($1,138.2$ tokens) |

### Execution Protocol
* **Executor Model:** `nvidia/nemotron-3-ultra-550b-a55b` executed via NVIDIA NIM at greedy temperature `0`.
* **Advisor Model:** `deepseek-ai/deepseek-v4.1-flash` used exclusively during offline training memory construction; **never called during held-out evaluation**.
* **Zero Self-Healing During Test:** No multi-attempt retries and no in-trial feedback occur during the held-out ablation. Each trial is strictly single-turn Pass@1.
* **Lossless Resumption:** Every completed trial is checkpointed atomically in `.axiom-state/ablation-v2-checkpoint.json` with full per-trial cryptographic provenance.

---

## 5. Metrics & Statistical Inference Framework

### 5.1 Endpoints
* **Primary Endpoint (Continuous Compliance):** Mean bound-fact fraction across test tasks:
  $$\text{Mean Bound Fraction} = \frac{1}{N} \sum_{i=1}^{N} \frac{\sum_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed})}{|\text{Bound}_i|}, \quad N = 120$$
  *Catastrophic Table Penalty:* If `F-13` (target table created with specified name) fails, `tableMissing` is recorded, and the trial is assigned $\text{Bound Fraction} = 0$ and $\text{Bound Passed} = \text{false}$ (while preserving raw Oracle failure telemetry).
* **Secondary Endpoint (Strict Pass@1):** Binary task success: a task passes if and only if 100% of its bound facts pass ($\prod_{f \in \text{Bound}_i} \mathbb{I}(f \text{ passed}) = 1$). Reported with Wilson 95% score confidence intervals.

### 5.2 Confirmatory Hypotheses
The evaluation pre-registered four confirmatory contrasts:
* **H1 (Reflexion Memory Utility):** Condition C exceeds Condition A on the primary metric ($C > A$).
* **H2 (Content Validity over Prompt Length):** Condition C exceeds Condition D ($C > D$).
* **H3 (Distillation vs. Verbatim Canonical Representation):** Condition C differs significantly from Condition C0 ($C \neq C0$).
* **H4 (Pareto Token Efficiency):** Condition C (and C0) approaches Condition B while consuming substantially fewer prompt tokens.

### 5.3 Multiplicity Control
Statistical significance for the primary metric across all four contrasts is computed using two-sided paired sign-flip randomization tests ($100,000$ iterations, xorshift32 seed `20260101`) and paired percentile bootstrap 95% confidence intervals ($10,000$ resamples). For the secondary binary metric, exact two-sided McNemar tests are computed over discordant pairs $(b, c)$.

To maintain strict Family-Wise Error Rate ($\alpha = 0.05$), **Holm-Bonferroni step-down adjustments** are applied separately across the family of four primary sign-flip p-values and the family of four secondary McNemar p-values.

---

## 6. Empirical Results

The held-out evaluation executed **720 out of 720 trials** with zero aborts, zero truncations, and complete PostgreSQL 16 container isolation. Full per-trial provenance confirms 100% execution validity (`generationStatus: 720/720 'ok'`).

### 6.1 Overall Condition Performance

Table 1 reports aggregate compliance, strict Pass@1, token consumption, and execution stability across all six conditions.

```
========================================================================================================================
Table 1: Ablation v2 Overall Performance on Held-Out Test Tasks (N = 120 tasks, 720 total trials)
========================================================================================================================
Condition   Prompt Treatment             Mean Bound Fraction   Strict Pass@1 [Wilson 95% CI]   Prompt Tokens   PSQL Crashes
------------------------------------------------------------------------------------------------------------------------
A           Zero-Shot Baseline                 0.4631 (46.3%)       0.0333 [0.0130, 0.0826]        247.2            34
B           Golden Rules (34 Facts)            0.9249 (92.5%)       0.7250 [0.6391, 0.7970]       1138.2             0
C           Axiom Reflexion (Top 10)           0.7165 (71.7%)       0.2500 [0.1811, 0.3344]        521.9             8
C0          Axiom Verbatim (Top 10)            0.8818 (88.2%)       0.6333 [0.5442, 0.7142]        554.3             5
D           Placebo Distractor                 0.4950 (49.5%)       0.0333 [0.0130, 0.0826]        849.2            11
E_B         Ablation Reference                 0.9249 (92.5%)       0.7250 [0.6391, 0.7970]       1138.2             0
========================================================================================================================
Note: Condition E_B trials reuse Condition B's cached generations (reusedFromCondition: 'B') to measure Tier 0 baseline.
PSQL Crashes indicates migrationExitNonZero: true (syntax errors, invalid types, or invalid DDL execution).
```

### 6.2 Confirmatory Statistical Hypothesis Testing

Table 2 details the pre-registered confirmatory contrasts, paired differences, bootstrap confidence intervals, exact permutation p-values, and Holm-Bonferroni adjustments.

```
========================================================================================================================
Table 2: Confirmatory Contrasts, Effect Sizes, and Multiplicity-Controlled Significance (N = 120 paired tasks)
========================================================================================================================
Contrast   Primary Mean Diff [95% CI]   Sign-Flip p (raw)   Holm Primary p   McNemar (b/c)   McNemar p (raw)  Holm Secondary p
------------------------------------------------------------------------------------------------------------------------
C vs. A     +0.2535 [+0.1957, +0.3099]     1.00 × 10⁻⁵        4.00 × 10⁻⁵        4 / 30        6.16 × 10⁻⁶      6.16 × 10⁻⁶
C vs. D     +0.2215 [+0.1653, +0.2774]     1.00 × 10⁻⁵        4.00 × 10⁻⁵        3 / 29        2.56 × 10⁻⁶      5.11 × 10⁻⁶
C vs. C0    -0.1653 [-0.2046, -0.1256]     1.00 × 10⁻⁵        4.00 × 10⁻⁵       51 / 5         1.17 × 10⁻¹⁰     3.51 × 10⁻¹⁰
C vs. B     -0.2083 [-0.2565, -0.1599]     1.00 × 10⁻⁵        4.00 × 10⁻⁵       66 / 9         7.66 × 10⁻¹²     3.06 × 10⁻¹¹
========================================================================================================================
Sign-flip p-values computed via 100,000 paired randomization iterations. CI95 via 10,000 percentile bootstrap resamples.
McNemar b/c indicates discordant pairs: b = (Baseline passed, Condition C failed), c = (Baseline failed, Condition C passed).
```

### 6.3 Evaluation of Pre-Registered Hypotheses

#### H1: Memory Utility ($C > A$) — Strongly Confirmed
Axiom Reflexion memory retrieval produces a massive, statistically indisputable performance improvement over zero-shot prompting. Mean bound-fact fraction increases by **+25.35 percentage points** ($71.65\%$ vs. $46.31\%$, $95\%$ CI $[+19.57\%, +30.99\%]$, paired sign-flip $p = 1.00 \times 10^{-5}$, Holm primary $p = 4.00 \times 10^{-5}$). Strict Pass@1 increases more than sevenfold from $3.33\%$ to $25.00\%$ ($p = 6.16 \times 10^{-6}$). Furthermore, memory injection eliminates catastrophic syntax failure: non-zero `psql` exits drop from 34 in Condition A to just 8 in Condition C.

#### H2: Content Validity vs. Prompt Length Placebo ($C > D$) — Strongly Confirmed
Condition D injected task-irrelevant, generic PostgreSQL best practices, increasing prompt length from $247.2$ to $849.2$ tokens. Condition D yielded virtually no improvement over baseline ($49.50\%$ vs. $46.31\%$, strict Pass@1 unchanged at $3.33\%$). Contrast $C$ vs. $D$ confirms a **+22.15 percentage point** superiority for targeted retrieval ($95\%$ CI $[+16.53\%, +27.74\%]$, sign-flip $p = 1.00 \times 10^{-5}$, Holm primary $p = 4.00 \times 10^{-5}$, McNemar $p = 2.56 \times 10^{-6}$). This conclusively disproves the hypothesis that prompt token volume or generalized domain context drives the observed gains.

#### H3: The Distillation Penalty ($C \neq C0$) — Breakthrough Finding
A standard assumption in AI agent research is that failure traces should be synthesized by an LLM Advisor into high-level, human-readable natural language "lessons". Condition C evaluated this paradigm. In Condition C0, we evaluated the exact same retrieval pipeline, but injected the canonical Oracle invariant statement verbatim (e.g., *"Foreign keys must explicitly match target primary key column types"* instead of *"Remember to verify that foreign key data types align with parent table declarations"*).

The empirical results reveal that **Condition C0 significantly outperforms Condition C by +16.53 percentage points** ($88.18\%$ vs. $71.65\%$, $95\%$ CI $[+12.56\%, +20.46\%]$, paired sign-flip $p = 1.00 \times 10^{-5}$, Holm primary $p = 4.00 \times 10^{-5}$). On strict Pass@1, Condition C0 achieves **63.33%** compared to Condition C's **25.00%** (an absolute difference of $38.33\%$, McNemar discordant pairs $51/5$, $p = 1.17 \times 10^{-10}$).

This demonstrates what we term the **Distillation Penalty**: natural language abstraction introduces semantic blurring, ambiguity, and conversational fluff. When dealing with rigid relational database specifications, foundation models adhere far more reliably to exact, formal contractual statements than to conversational summaries.

#### H4: Pareto Token Efficiency ($C0$ vs. $B$) — Pareto Superiority Confirmed
Condition B injected all 34 active canonical statements statically into every prompt, achieving $92.49\%$ bound compliance and $72.50\%$ Pass@1 at a cost of $1,138.2$ prompt tokens. 

Condition C0 achieves **88.18%** bound compliance and **63.33%** strict Pass@1 using only **554.3 prompt tokens**—a **51.3% reduction in prompt token consumption**. By selectively retrieving only the 10 most relevant, high-failure-frequency invariants, Condition C0 recovers **95.3%** of the full-context bound performance and **87.4%** of strict Pass@1, creating an optimal Pareto frontier for real-world deployments where context budget, cost, and latency are constrained.

```
       1.00 ┌──────────────────────────────────────────────────────────── (B: 1138 tok, 92.5%)
            │                                                      (C0: 554 tok, 88.2%)
       0.80 │                                                 ▲
            │                                                 │
  Mean 0.60 │                                (C: 522 tok, 71.7%)
  Pass      │
  Rate 0.40 │               (D: 849 tok, 49.5%)
            │  (A: 247 tok, 46.3%)
       0.20 │
            │
       0.00 └──────┬──────────────────────┬──────────────────────┬──────────────────────┬──────
                   0                     300                    600                    900   Tokens
```

---

## 7. Exploratory & Sensitivity Analyses

### 7.1 Clean Migration Sensitivity Analysis
In Condition A, 34 out of 120 migrations failed to execute cleanly in PostgreSQL (syntax errors, malformed triggers, non-existent data types). To ensure our conclusions do not merely reflect syntax crashes, we conducted a sensitivity analysis restricted strictly to migrations with `migrationExitNonZero: false`.

```
========================================================================================================================
Table 3: Clean Migration Analysis (Restricted strictly to trials with clean PSQL exit code 0)
========================================================================================================================
Condition   Clean Trials (n)   Mean Bound Fraction   Strict Pass@1 [Wilson 95% CI]   Prompt Tokens   Total Tokens
------------------------------------------------------------------------------------------------------------------------
A                  86                0.4868             0.0465 [0.0182, 0.1136]          249.5          1508.7
B                 120                0.9249             0.7250 [0.6391, 0.7970]         1138.2          3145.9
C                 112                0.7171             0.2589 [0.1868, 0.3471]          522.0          2129.5
C0                115                0.8796             0.6261 [0.5349, 0.7091]          554.9          2097.2
D                 109                0.5060             0.0367 [0.0144, 0.0906]          849.4          2109.8
========================================================================================================================
```

Even when restricting evaluation strictly to syntactically valid migrations, the paired difference between Condition C and Condition A remains **+20.27 percentage points** ($95\%$ CI $[+12.73\%, +27.65\%]$, $p = 1.00 \times 10^{-5}$). This confirms that Axiom's benefit is fundamentally semantic and architectural, not merely syntactic.

### 7.2 Factorial Cell Analysis & Intraclass Correlation
We analyzed performance across the 8 factorial feature cells combining `(tenant, append_only, ingestion)`:

```
========================================================================================================================
Table 4: Per-Cell Primary Contrast Breakdown (N = 15 tasks per cell, combined cell permutation p = 0.0156)
========================================================================================================================
Feature Cell (tenant, append_only, ingestion)          n    C vs. A Diff    C vs. B Diff    C vs. C0 Diff   C vs. D Diff
------------------------------------------------------------------------------------------------------------------------
tenant=false, append_only=false, ingestion=false      15       +0.3333         +0.0656         -0.0133         +0.2622
tenant=false, append_only=false, ingestion=true       15       +0.1833         -0.0211         -0.1789         +0.1622
tenant=false, append_only=true,  ingestion=false      15       +0.2222         -0.3767         -0.3633         +0.1878
tenant=false, append_only=true,  ingestion=true       15       +0.0400         -0.2933         -0.1167         +0.0167
tenant=true,  append_only=false, ingestion=false      15       +0.5400         -0.0878         -0.1122         +0.5067
tenant=true,  append_only=false, ingestion=true       15       +0.3722         -0.1622         -0.0911         +0.3645
tenant=true,  append_only=true,  ingestion=false      15       +0.3600         -0.3111         -0.1967         +0.3300
tenant=true,  append_only=true,  ingestion=true       15       -0.0233         -0.4800         -0.2500         -0.0578
------------------------------------------------------------------------------------------------------------------------
Combined Cell-Stratified Mean Difference:                      +0.2535         -0.2083         -0.1653         +0.2215
Within-Cell 95% Confidence Interval:                     [+0.2065, +0.3004]  [-0.2435, -0.1715][-0.2000, -0.1289][+0.1761, +0.2679]
Exact Cell Sign-Flip Permutation p-value:                     1.56 × 10⁻²     2.34 × 10⁻²     7.81 × 10⁻³     2.34 × 10⁻²
========================================================================================================================
```

Two critical insights emerge:
1. **Multi-Tenancy Drives Maximum Memory Utility:** The single largest performance gain occurs in `tenant=true, append_only=false, ingestion=false`, where Condition C outperforms Condition A by **+54.00 percentage points** ($+0.5400$). Multi-tenancy introduces strict compound key and RLS constraints that zero-shot models fail nearly 100% of the time, making targeted memory retrieval maximally impactful.
2. **Structural Difficulty Intraclass Correlation:** Condition A baseline displays an Intraclass Correlation of **$ICC(1) = 0.2603$** ($F = 6.278, p < 0.001$) on bound-fact compliance and **$ICC(1) = 0.6964$** ($F = 35.405, p < 10^{-15}$) on all-fact pass rates. This proves that task difficulty is strongly clustered by architectural domain features, validating our stratified benchmark design.

---

## 8. Interactive Telemetry & 3D System Anatomy

To ensure transparency and rapid inspection of self-healing dynamics, Axiom provides a web-based interactive visualizer ([`dashboard/`](file:///c:/Users/neil/Axiom/dashboard/)) built with Next.js 15, Three.js, React Three Fiber, and Tailwind CSS.

### 8.1 3D Anatomy Visualizer (`AxiomAnatomy.tsx`)
The visualizer models the physical assemblies of the Axiom engine in real-time 3D space:
* **Assembly Geometry:** Each of the 9 assemblies is rendered with parametric metallic frames, procedural glass materials, and dynamic emissive status conduits.
* **Camera Orbit & Inspection:** Users can orbit, pan, and zoom to inspect individual components (e.g., zooming into the PostgreSQL Docker Oracle core or the Cryptographic Memory Vault).
* **Kinematic Stage Transitions:** The visualizer transitions across five functional states:
  1. *Rest State (Stage 1):* Default idle inspection posture with slow orbital rotation.
  2. *Mid-Trial Active (Stage 2):* Conduits pulse with synthetic data flow from the Executor to the Verifier.
  3. *Exploded Orthogonal (Stage 3):* Assemblies separate along orthogonal axes, exposing internal subsystems, data buses, and verification sensors.
  4. *Oracle Failure (Stage 4):* Failed assemblies illuminate in warning amber, isolating failed contract IDs.
  5. *Healed Convergence (Stage 5):* The closed reflexion loop fires, transmitting a verified lesson to the vault and restoring structural alignment.

### 8.2 Vercel-Safe Snapshot Portability & Cross-Model Comparison
To eliminate dependencies on persistent backend servers during public dissemination:
* An offline snapshot exporter ([`scripts/export-run-snapshot.ts`](file:///c:/Users/neil/Axiom/scripts/export-run-snapshot.ts)) compiles complete trial checkpoints, telemetry logs, and analysis tables into sanitized, static JSON files under `dashboard/public/data/`.
* All API keys, environment credentials, and system paths are strictly sanitized (`tests/dashboard-secret-leak.test.ts`).
* The dashboard includes a dynamic Model/Run Selector supporting comparative visualization between runs (e.g., contrasting the 720 trials of `nvidia/nemotron-3-ultra-550b-a55b` with exploratory runs on `google/gemma-4-31b-it`).
* A unified portfolio endpoint (`/api/portfolio`) exposes machine-readable metrics for automated continuous integration.

---

## 9. Threats to Validity & Limitations

1. **Model Generalization:** The primary confirmatory evaluation was conducted on `nvidia/nemotron-3-ultra-550b-a55b`. While the Axiom harness is model-agnostic and includes comparative scaffolding for other models (e.g., `google/gemma-4-31b-it`), specific numerical pass rates may vary across model families and parameter scales.
2. **Single Repeat at Temperature 0:** In accordance with standard benchmark protocols, trials were conducted at greedy temperature `0` with one repeat per task-condition cell. While greedy decoding minimizes sampling variance, slight non-determinism across distributed cloud inference clusters remains possible.
3. **Bound Fact Scope:** The primary metric scores each task against $3$ to $5$ bound facts derived from training calibration. While this guarantees discrimination against non-trivial failure modes, it does not reward models for passing non-bound applicable facts (which are captured separately in secondary diagnostic telemetry).
4. **Retrieval Budget Ceiling:** The retrieval budget was fixed at $K=10$ based on Dev sweep calibration. In rare instances where a task has $>10$ applicable invariants, facts ranked beyond the top 10 cannot benefit from Condition C or C0 injection.

---

## 10. Conclusion & Future Work

Axiom establishes a rigorous, verifiable methodology for integrating large language models into mission-critical database engineering workflows. Our findings demonstrate that:
1. **Deterministic Oracles are Essential:** Foundation models cannot reliably evaluate their own relational database contracts. True self-healing and reliable code generation require external, deterministic execution harnesses.
2. **Selective Memory Retrieval Outperforms Zero-Shot and Placebos:** Retrieving feature-compatible historical failure lessons elevates bound-fact compliance by **+25.35%** over baseline and **+22.15%** over length-matched controls ($p < 10^{-4}$).
3. **The Distillation Penalty is Real:** For formal, rigid software contracts like SQL migrations, **verbatim canonical invariant statements (Condition C0, 88.18%) substantially outperform LLM-distilled conversational lessons (Condition C, 71.65%)**.
4. **Pareto Token Superiority:** Selective retrieval of verbatim canonical facts recovers over **95%** of full golden-prompt performance at **less than half the prompt token cost** (554 vs. 1,138 tokens).

Future work will explore expanding the Oracle to multi-database dialects (PostgreSQL, CockroachDB, MySQL 8, Spanner), implementing real-time streaming CI/CD quality gates for enterprise pull requests, and investigating hybrid retrieval mechanisms that dynamically adjust $K$ based on database schema complexity.

All evaluation tasks, Docker harnesses, statistical analysis scripts, test suites, and anonymized trial logs are frozen and available in the Axiom repository.
