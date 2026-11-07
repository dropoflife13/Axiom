# Axiom

Axiom is a deterministic verification and reflexion harness for LLM-generated architecture rules and SQL migrations. It measures whether short lessons learned from verified failures improve later generation.

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
