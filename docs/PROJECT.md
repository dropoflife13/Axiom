# Axiom Project Specification

## 1. Purpose

Axiom is a deterministic verifier and reflexion test harness for Cortex agent and rule files, with two executable checks (DB-01, SEC-03) and an evaluation harness for LLM-generated rules. It enforces architectural axioms across Markdown agent/domain definitions (via L1, L2, L3 grammar and AST scanners) and PostgreSQL 16 database DDL migrations (via an external Docker container Oracle).

## 2. Core Architecture

The system operates across nine decoupled assemblies divided into two distinct operational pathways:

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

### 2.1 The Nine Assemblies
1. **Deterministic Verifier (`src/verifier/`):** Evaluates L1 grammar (A1–A10 for agents, L1-01–L1-10 for domain rules), L2 vault cross-references, and L3 executable AST checks (`DB-01`, `SEC-03`). 100% mutation kill rate (56/56 programmatic mutations). Zero LLM, zero network calls.
2. **PostgreSQL 16 Oracle Engine (`scripts/oracle.ts`):** Spins up fresh Docker containers (`postgres:16`), initializes baseline seed schema, executes DDL migrations as `deployer`, and validates runtime behavior as `application` and `readonly_user` with `auth.jwt()` tenant claims.
3. **Cryptographic Rule Vault (`.axiom-state/memory.json`):** Verified before and after evaluation via SHA-256. Ring buffer cap of 25 lessons with atomic temp-file writes and LRU eviction.
4. **Reflexion Loop & Advisor (`src/loop.ts`, `src/advisor.ts`):** Failure-to-lesson distillation generating concise rules (<24 words). Lessons are saved only after a subsequent retry passes verification.
5. **Selective Retrieval Engine (`src/memory.ts`):** Matches lessons to task prompts by structured feature flags (`tenant`, `append_only`, `ingestion`, etc.) and training failure frequency. Pre-registered budget $K=10$.
6. **Tier 0 Deterministic Fixer (`src/fixer.ts`):** Mechanical regex/AST repairs with per-line provenance and confidence clamping (`llmConfidence: null`).
7. **Model Generation Executor (`src/executor.ts`):** Interfaces with NVIDIA NIM with greedy decoding (temperature 0), exponential retry backoff, and strict model assertion (`assert returnedModel === requestedModel`).
8. **Candidate Quarantine & Promotion Gate (`src/promote.ts`):** Failed traces quarantined in `.axiom-state/quarantine.jsonl`. Harvested candidates clamped to `conf <= 2`; human promotion required for `conf > 3`.
9. **Offline Statistical Analysis Pipeline (`scripts/analyze-ablation-v2.ts`):** Computes paired sign-flip tests (100k iterations), bootstrap 95% CIs (10k resamples), exact McNemar tests, and Holm-Bonferroni family-wise error adjustments.

## 3. Two Execution Pathways

### 3.1 Operational Agent Reflexion Loop
Manages Markdown rule and specialist agent generation across up to 3 attempts. Attempt 1 uses historical memory. Attempt 2 uses Advisor feedback. Attempt 3 escalates to heavy models (`gemini-2.5-flash` or `claude-3-7-sonnet`). Lessons are persisted conditionally upon verified retry success.

### 3.2 SQL Migration Ablation Harness
Evaluates SQL migrations against the PostgreSQL 16 Oracle across 200 tasks (40 Train, 40 Dev, 120 Held-Out Test). Evaluates six controlled conditions:
* **Condition A:** Zero-shot baseline (no memory, no hints).
* **Condition B:** Static injection of all 34 active eligible canonical fact statements.
* **Condition C:** Retrieval of up to 10 feature-compatible distilled lessons.
* **Condition C0:** Retrieval of up to 10 canonical fact statements verbatim.
* **Condition D:** Placebo distractor (task-irrelevant PostgreSQL tips).
* **Condition E_B:** Condition B with Tier 0 measurement path (reused generation).

## 4. Empirical Evaluation Results (Ablation v2)

Evaluated on `nvidia/nemotron-3-ultra-550b-a55b` over 720 total trials (120 held-out tasks $\times$ 6 conditions):
* **Condition A (Baseline):** 46.31% bound compliance, 3.33% strict Pass@1 (247.2 prompt tokens).
* **Condition B (Golden Reference):** 92.49% bound compliance, 72.50% strict Pass@1 (1,138.2 prompt tokens).
* **Condition C (Axiom Reflexion):** 71.65% bound compliance, 25.00% strict Pass@1 (+25.35% over A, $p = 1.00 \times 10^{-5}$, Holm primary $p = 4.00 \times 10^{-5}$; +22.15% over D, $p = 1.00 \times 10^{-5}$).
* **Condition C0 (Axiom Verbatim):** 88.18% bound compliance, 63.33% strict Pass@1 (+16.53% over C, $p = 1.00 \times 10^{-5}$). Recovers >95% of Condition B's compliance at 48.7% of the prompt token cost (554.3 tokens).
* **Condition D (Placebo):** 49.50% bound compliance, 3.33% strict Pass@1 (849.2 prompt tokens).

## 5. Interactive 3D Anatomy Visualizer & Telemetry

Axiom includes an interactive Next.js 15+ 3D dashboard (`dashboard/`):
* **Procedural 3D Stage:** Orthogonal exploded, mid-trial, and healed state machines built with Three.js / React Three Fiber.
* **Vercel-Safe Snapshot Portability:** Sanitized static JSON snapshots (`export-run-snapshot.ts`) under `dashboard/public/data/` for zero-backend serverless hosting.
* **Cross-Model Comparability:** Run comparator framework (`scripts/compare-runs.ts`) supporting side-by-side analysis between models (e.g. Nemotron-550B and Gemma-4-31B).
