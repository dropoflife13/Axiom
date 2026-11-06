# Axiom Project Specification

## 1. Purpose

Axiom is a deterministic verifier and reflexion test harness for Cortex agent and rule files, with two executable checks (DB-01, SEC-03) and an evaluation harness for LLM-generated rules.

## 2. Core Architecture

The system consists of decoupled components:

```
                  ┌──────────────────┐
                  │     Executor     │  (OpenAI-compatible LLM client with SHA-256 disk cache)
                  └────────┬─────────┘
                           │ candidate agent/rule markdown
                           ▼
                  ┌──────────────────┐
                  │     Verifier     │  (Deterministic: L1, L2, L3)
                  └────────┬─────────┘
                           │ failed traces & diagnostics
                           ▼
                  ┌──────────────────┐
                  │     Advisor      │  (Lesson generation & verification)
                  └──────────────────┘
```

### 2.1 Executor
- Generates candidate agent Markdown files from task prompts.
- Caches responses on disk under `.axiom-cache/` keyed by `sha256(model + system + user + temperature)`.

### 2.2 Verifier
- **Deterministic by construction:** zero LLM calls, zero network calls, and zero randomness anywhere in `src/verifier/`.
- Evaluates files across three levels:
  - **L1 (Grammar):** Structural and syntactic checks (`A1`–`A10` for agent files, `L1-01`–`L1-10` for domain rule files).
  - **L2 (Vault Consistency):** Prefix registration, rule ID uniqueness, and cross-reference checks against the canonical vault index.
  - **L3 (Executable Checks):** Two deterministic scanners (`DB-01` and `SEC-03`) tested against compliant and violating fixtures in `fixtures/l3/`.

### 2.3 Advisor & Memory
- Generates a single concise formatting rule under 24 words when an Executor attempt fails verification.
- Candidate lessons are saved to `.axiom-state/memory.json` (one lesson per error code, atomic writes via temp file + rename, LRU eviction by `lastUsedAt`) only if the subsequent retry passes verification.

## 3. Staging & Candidate Quarantine Policy

- **Quarantine & Staging Locations:** Failed reflexion traces are appended as JSONL records to `.axiom-state/quarantine.jsonl`. Harvested candidate rules are written only under `.axiom-state/` or `out/` and are **never** written under `brain/` or `agents/`.
- **Tier 0 Provenance:** Every deterministic fix applied by `src/fixer.ts` records per-line provenance. Any rule line modified by Tier 0 has `llmConf` (`llmConfidence`) set to `null` in `candidate-registry.json`.

## 4. Confidence Policy

- **`conf <= 2`:** Harvested candidates are clamped to `enforcedConf <= 2` while in candidate status.
- **`conf: 3`:** Maximum automated confidence for rules backed by executable checks.
- **`conf > 3` (4 or 5):** Reserved for human review and promotion.

## 5. Evaluation Harness

- Evaluates Executor outputs across controlled conditions (baseline, static hints, advisor memory, placebo memory, and Tier 0 auto-fix) on held-out task prompts.
