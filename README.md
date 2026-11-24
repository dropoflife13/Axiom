# Axiom

Axiom is a deterministic verification and reflexion harness for LLM-generated architecture rules and SQL migrations. It measures whether short lessons learned from verified failures improve later generation.

## Axiom-HOPE v4 (Automated Lexical Locks & 3-Clock Governance)

Axiom-HOPE v4 generalizes deterministic architectural memory governance beyond SQL migrations to declarative authorization policies (Cedar-style ABAC) and imperative backend contracts (TypeScript API security), verified across **549 total live trials** (`gemini-3.1-flash-lite`, `gemma-4-31b-it`, `qwen/qwen3.8-27b`):
- **Policy-as-Code ABAC (324 live trials):** 270 5-arm trials (`+66.7 pp` full-task pass, `3.7% → 70.4%`; `95.2%` fact compliance) + 54 reverse-masked necessity trials (`C_ID_masked` vs. `C_ID_auto` vs. `C`: `+63.0 pp` sufficiency, `-64.8 pp` necessity, `-1.9 pp` structure control).
- **TypeScript API Security (225 live trials):** `0.0% → 48.9%` full-task pass (`87.4%` fact compliance), beating naive static prerequisites by `+48.9 pp` task / `+25.7 pp` facts with `0` promoted canary regressions.
- **3-Clock Symbolic Architecture (`src/v4/hope/`):**
  1. *Fast Clock (`EpisodicRingBuffer`):* Fixed FIFO trace ring buffer capturing task executions without mutating rules.
  2. *Intermediate Clock (`QuarantineVault`):* Staged candidate vault with SHA-256 provenance digests.
  3. *Slow Clock (`DeepMetaOptimizer`):* 3 deterministic zero-LLM gates (Gate 1: 100% Lexical Lock, Gate 2: Contradiction & DAG Cycle Linter, Gate 3: Paired Canary Replay with strict zero regressions).
- **Lexical-Locked Context Compaction (`--compact`):** Live v4 runners support an opt-in `--compact` (and `--max-context-tokens <n>`) CLI flag providing rate-limit relief by deterministically compacting prompt rules while guaranteeing 100% lexical token retention.
- **Self-Reflexion Skill (`.agents/skills/axiom-self-reflexion/`):** Zero-API-cost 3-clock loop capturing recurring local build/test fixes into lexical-locked workspace rules (`LEARNED_RULES.md`).
- **Documentation & Research Index:** See [docs/INDEX.md](docs/INDEX.md) for the active documentation map, [docs/AXIOM-EXPLAINED.md](docs/AXIOM-EXPLAINED.md) for the plain-English guide, [docs/AXIOM-V4-HOPE.md](docs/AXIOM-V4-HOPE.md) for the complete v4 technical report, and [docs/AXIOM-PAPER.md](docs/AXIOM-PAPER.md) for the frozen v3 PostgreSQL study.

## Core Principles

- **Deterministic authority:** LLM output is untrusted candidate material. The Verifier (`src/verifier/`) and PostgreSQL Oracle (`scripts/oracle.ts`) contain zero LLM calls and zero network dependencies.
- **Verifier:** Checks rule grammar, section headers, rule ID formats, and vault references for agent and rule files.
- **Executable checks (L3):** `DB-01` (destructive SQL without backups or transactions) and `SEC-03` (hardcoded secrets), verified against positive and negative fixtures.
- **PostgreSQL Oracle:** Applies a canonical seed to a fresh `postgres:16` harness, executes a candidate migration, and probes tenant isolation, grants, RLS, append-only behavior, indexes, triggers, views, and function signatures. Failures report canonical fact IDs and never expose corrected SQL.
- **Candidate staging:** Generated axioms are staged under `.axiom-state/` or `out/` (`status: candidate`, `conf <= 2`) and are never written directly into `brain/` or `agents/`.
- **Constitution gate (BN-00):** The 8 specialist agent files in `agents/` (`PM`, `UX`, `GR`, `SD`, `IR`, `DB`, `SEC`, `RS`) must always be present.

## Execution Paths

1. **Reflexion loop** (`src/loop.ts`): The Executor generates, the Verifier checks, Tier 0 (`src/fixer.ts`) applies safe deterministic fixes, and the Advisor distills a short lesson on failure. Attempt 3 escalates to the configured Tier 3 heavy model through `src/escalation.ts`. The loop allows at most three attempts. Lessons are saved only after a later verification pass; persistent failures are quarantined.
2. **SQL ablation** (`src/eval/ablation.ts`): 120 held-out test tasks across six conditions (A, B, C, C0, D, E_B), for 720 trials. Each trial performs one generation followed by one PostgreSQL Oracle evaluation and is checkpointed to `.axiom-state/ablation-v2-checkpoint.json`.

## Directory Structure

- `agents/`: The 8 core specialist agent definitions.
- `brain/02-domains/`: Canonical domain rule files.
- `brain/07-meta/`: Rule syntax conventions and vault consistency references.
- `docs/`: Project specification (`PROJECT.md`), grammar (`domain-grammar.md`), inbox lifecycle (`inbox-lifecycle.md`), task design and scoring contract (`spec/task-v2.md`), and the [Claude context guide](docs/AXIOM-FOR-CLAUDE.md).
- `src/`: Verifier, Tier 0 auto-fixer, reflexion loop, Advisor, memory, Tier 3 escalation, harvester, L3 checks, and evaluation harness.
- `scripts/`: PostgreSQL Oracle and calibration scripts.
- `fixtures/task-v2/`: Frozen facts, tasks, seed database, and good/bad Oracle fixtures.
- `.axiom-state/`: Runtime lesson memory, checkpoints, `quarantine.jsonl` failure traces, and experiment state.
- `tests/`: Unit and integration test suites.

## License

[MIT](LICENSE)
