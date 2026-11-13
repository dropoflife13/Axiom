# Axiom: Claude Context Guide

## What Axiom is

Axiom is a self-healing architecture-rules system and experiment harness. It
generates candidate agent/domain rules, verifies them deterministically, learns
short lessons from failures, and measures whether those lessons improve future
SQL migration generation.

The central rule is:

> LLM output is untrusted candidate material. The deterministic Verifier or
> PostgreSQL Oracle is the authority.

Generated axioms are never written directly into canonical domain files.
Candidates remain in `.axiom-state/` or `out/` until they pass the relevant
verification and promotion gates.

## Repository map

- [`agents/`](../agents/) - the required eight specialist agent definitions.
- [`brain/02-domains/`](../brain/02-domains/) - canonical domain rules.
- [`brain/07-meta/`](../brain/07-meta/) - rule syntax and consistency references.
- [`src/verifier/`](../src/verifier/) - deterministic rule and reference checks.
- [`src/checks/l3/`](../src/checks/l3/) - executable DB-01 and SEC-03 checks.
- [`src/executor.ts`](../src/executor.ts) - LLM generation client.
- [`src/advisor.ts`](../src/advisor.ts) - short failure-to-lesson distillation.
- [`src/memory.ts`](../src/memory.ts) - persistent lesson storage and retrieval.
- [`src/loop.ts`](../src/loop.ts) - multi-attempt reflexion loop.
- [`src/fixer.ts`](../src/fixer.ts) - deterministic Tier 0 repairs.
- [`src/escalation.ts`](../src/escalation.ts) - Tier 3 heavy-model escalation.
- [`scripts/oracle.ts`](../scripts/oracle.ts) - deterministic PostgreSQL migration Oracle.
- [`src/eval/ablation.ts`](../src/eval/ablation.ts) - v2 SQL ablation experiment.
- [`fixtures/task-v2/`](../fixtures/task-v2/) - frozen facts, tasks, seed database,
  and good/bad Oracle fixtures.
- [`docs/AXIOM-RESEARCH-DOSSIER.md`](./AXIOM-RESEARCH-DOSSIER.md) - complete audited empirical research dossier, paired clean contrasts, forensic collision analysis, statement-sufficiency pilot, and v3 pre-registration design.
- [`docs/AXIOM-PAPER.md`](./AXIOM-PAPER.md) - complete academic manuscript covering the 6-model evaluation fleet across 4,320 confirmatory trials.
- [`docs/spec/task-v2.md`](./spec/task-v2.md) - task design and scoring contract.

## Non-negotiable invariants

1. The Verifier and Oracle must not call an LLM or depend on network responses.
2. The eight files in [`agents/`](../agents/) must always exist (BN-00).
3. Never edit fixtures, `facts.json`, or expected target facts to make a model
   pass.
4. A generated axiom is a candidate until deterministic checks pass.
5. Oracle failures must identify canonical fact IDs and must not expose corrected
   SQL as a hint.
6. Secrets belong in environment variables. Never print or commit `.env`.

## Two execution paths

### 1. Agent reflexion loop

[`src/loop.ts`](../src/loop.ts) handles Cortex agent/rule generation:

1. Load relevant historical lessons for the first attempt.
2. Ask the Executor for Markdown.
3. Run the deterministic Verifier.
4. Apply a safe Tier 0 deterministic fix when available.
5. If still failing, ask the Advisor for a short lesson or reuse memory.
6. Retry, with a hard maximum of three attempts.
7. Save a lesson only after a later verification pass proves it useful.
8. Quarantine persistent failures rather than promoting them.

Attempt 3 always uses `callHeavyModel` from [`src/escalation.ts`](../src/escalation.ts)
after the two fast attempts. Depending on environment configuration, Tier 3
uses Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) or Anthropic
(`ANTHROPIC_MODEL`, default `claude-3-7-sonnet-20250219`). This is a separate
generation path from the NVIDIA Executor and Advisor and must be identified
separately if its output is included in a report.

The Advisor is not the authority. Its output is a pending lesson and is
discarded unless a later verification pass proves it useful. This reflexion
loop is operational self-healing behavior, not causal evidence that a lesson
caused an improvement; the controlled SQL ablation is the causal experiment.

### 2. SQL ablation experiment

[`src/eval/ablation.ts`](../src/eval/ablation.ts) evaluates SQL migrations
against PostgreSQL 16. The experiment currently has:

- 40 train tasks: `T-001` through `T-040`.
- 40 dev tasks: `D-001` through `D-040`.
- 120 held-out test tasks: `H-001` through `H-120`.
- Six conditions, one repeat each: `A`, `B`, `C`, `C0`, `D`, `E_B`.
- Therefore the complete test run has 720 scored trials from 600 independent generations (E_B reuses Condition B's generation).

Each trial in Conditions A, B, C, C0, and D performs one model generation
followed by one Oracle evaluation, while Condition E_B reuses Condition B's
cached generation (`reusedFromCondition: 'B'`) and runs its own Oracle
evaluation. No trial performs an in-trial retry or Advisor call.

## Ablation conditions

| Condition | Prompt treatment |
|---|---|
| A | No memory and no hints. Baseline. |
| B | Inject the eligible canonical fact statements as static hints. |
| C | Retrieve up to `LESSON_TOP_K` lessons from memory using structured feature overlap, then inject them. |
| C0 | Retrieve memory, but inject the canonical Oracle fact statement verbatim instead of a distilled Advisor lesson. |
| D | Inject true but task-irrelevant PostgreSQL tips as a placebo. |
| E_B | Condition B plus the Tier 0 measurement path. SQL currently has no generic safe Tier 0 rewrite, so this is recorded explicitly rather than fabricated. |

Condition C and C0 retrieval restricts candidate lessons to the task's
applicable set (within the same eligible fact set Condition B uses) before
ranking by structured feature overlap. The retrieval budget is
`LESSON_TOP_K = 6`; lessons are stored in `.axiom-state/memory.json`, which is
loaded once in read-only mode at ablation startup and verified by SHA-256 at the
start and end of the run (aborting and flagging the checkpoint if modified).

Each task's `boundFacts` are stored as data in `fixtures/task-v2/tasks.json` and
selected using Condition A development-split pass rates by
`loadDiscriminatingFacts` and `selectBoundFactsForTask` in
[`scripts/rescore-condition-a.ts`](../scripts/rescore-condition-a.ts):
`loadDiscriminatingFacts` reads `out/condition-a-dev-rescored.json` and selects
facts with Condition A dev `passRate >= 0.1 && passRate <= 0.8` as
discriminating, and `selectBoundFactsForTask` hashes `taskId` (FNV-1a) to pick
`targetTotal = (seed % 3) + 3` (`3`, `4`, or `5` bound facts) from the task's
discriminating applicable facts (plus at most one non-discriminating applicable
fact when `targetTotal > 3`, backfilling if needed to reach at least three).

SQL ablation memory is prepared before the held-out run by
`ensureSqlTrainMemory` in [`src/eval/ablation.ts`](../src/eval/ablation.ts).
It loads the train-split failure counts via `loadTrainFailureFrequency` from
`out/train-calibration.json` (generated by
[`scripts/calibrate-train-failure-frequency.ts`](../scripts/calibrate-train-failure-frequency.ts)),
computes observed feature flags from the train tasks' real flags (`tenant`,
`append_only`, `ingestion`, `status`, `sec_definer`, `latest_per_key`, `view`),
and stores one lesson per eligible fact. The ablation itself does not call the
Advisor or retry within a trial.

## What one ablation trial does

For one `(task, condition)` tuple:

1. Read the task's prompt, table name, feature flags, and bound fact IDs.
2. Build the condition-specific hint text.
3. Call the Executor at temperature `0`.
4. Submit the generated SQL to the PostgreSQL 16 Oracle in
   [`scripts/oracle.ts`](../scripts/oracle.ts).
5. Collect failed fact IDs, failure details, and whether the migration's `psql`
   run exited with a non-zero status (`migrationExitNonZero`).
6. Score both all-fact behavior and the task's bound facts. If `F-13` (target
   table existence and naming) is in the failed set, record `tableMissing: true`
   and count all bound facts as failed (`boundPassed: false`,
   `boundFactFraction: 0`) while keeping the Oracle's reported `failedFacts`
   unchanged.
7. Store token counts, retrieved fact IDs, pass flags, fact fractions,
   `tableMissing`, `migrationExitNonZero`, per-trial provenance (`provider`,
   `baseUrl`, `requestedModel`, `returnedModel`, `finishReason`, `oracleCommit`,
   `factsSha256`), and `reusedFromCondition: 'B'` on `E_B` trials.
8. Write the checkpoint before moving to the next tuple.
9. Wait two seconds before the next non-cached API call.

The checkpoint is `.axiom-state/ablation-v2-checkpoint.json`. A completed tuple
is skipped when the run resumes.

## Metrics

The pre-registered primary metric is the mean fraction of bound facts passed:

```text
sum(bound facts passed / bound facts) / number of trials
```

The secondary metric is strict bound-fact Pass@1: a task passes only when every
bound fact passes (and `F-13` does not fail; if `F-13` fails, `tableMissing` is
`true`, `boundPassed` is `false`, and `boundFactFraction` is `0`). Raw all-fact
Pass@1 is diagnostic telemetry, not the primary baseline. Reports also include
Wilson 95% intervals, failures by fact ID, average LLM calls per task, average
tokens per task, and paired McNemar tests for C against A, B, C0, and D.

## Oracle contract

The Oracle starts a fresh `postgres:16` harness, applies the canonical seed,
executes the candidate migration, and probes the required behavior. It checks
tenant isolation, grants, RLS, append-only behavior, indexes, triggers, views,
function signatures, and other fact-specific behavior.

Important details:

- RLS violations and table permission errors can both use SQLSTATE `42501`;
  message text distinguishes them.
- Positive insert probes may reach ordinary `NOT NULL`, `CHECK`, foreign-key,
  or unique constraints after passing RLS.
- Oracle output uses canonical fact IDs and statements.
- The Oracle is deterministic and must remain independent of model output.

## Provider and provenance

The current LLM provider is NVIDIA NIM:

- Base URL: `https://integrate.api.nvidia.com/v1`
- SQL/Executor model: `google/gemma-4-31b-it` (explicit required setting via `NVIDIA_EXECUTOR_MODEL` or `options.model`, with no silent default; `returnedModel === requestedModel` is asserted)
- Advisor model: `deepseek-ai/deepseek-v4.1-flash`
- Secret environment variable: `NVIDIA_API_KEY`

Cache entries and reports must identify the provider, base URL, requested model,
API-returned model, Oracle commit, and SHA-256 of `fixtures/task-v2/facts.json`.
Never treat a report without that provenance as evidence for a new run.

## Safe operating procedure for Claude

1. Read this file and [`docs/spec/task-v2.md`](./spec/task-v2.md).
2. Inspect the relevant source before editing.
3. Do not modify fixtures or fact expectations to repair a failure.
4. Run the smallest relevant typecheck or test.
5. For experiments, verify Docker and the PostgreSQL harness first.
6. Stop at the first unexpected result and report the task, condition, fact,
   SQLSTATE, and message.
7. Keep generated reports and caches out of commits unless explicitly requested.

## Useful commands

```powershell
npx tsc --noEmit
npx tsx scripts/oracle.ts
npx tsx scripts/calibrate-condition-a.ts --smoke
npx tsx src/eval/ablation.ts
```
