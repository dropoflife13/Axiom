# Axiom: Deterministic Verification and Lesson Retrieval for SQL Migration Generation

## Abstract

Axiom is a verification and reflexion harness for generated architecture rules
and PostgreSQL migrations. It separates model generation from deterministic
judgment: the Verifier checks agent and rule Markdown, while a PostgreSQL 16
Oracle checks migration behavior. A lesson-memory subsystem retrieves
feature-relevant guidance for held-out migration tasks. The Ablation v2 protocol evaluates six prompt conditions over 120 frozen test
tasks, producing 720 scored trials from 600 independent generations (E_B reuses
Condition B's generation). This document specifies the implemented system and
evaluation design; it does not report results from the active held-out run.

## Introduction

LLM-generated migrations can be syntactically plausible while violating
application-specific database contracts. Axiom treats generated SQL as
untrusted candidate material and evaluates it against a deterministic
PostgreSQL Oracle. The system also contains a separate reflexion path for
agent and rule Markdown, where failures can produce lessons for later
attempts.

The two paths have distinct authorities. The Verifier checks agent/rule
Markdown grammar, section structure, rule identifiers, and vault references.
The Oracle applies a canonical database seed and probes migration behavior.
Neither authority delegates correctness to an LLM.

## Oracle

The Oracle in [`scripts/oracle.ts`](../scripts/oracle.ts) starts a fresh
`postgres:16` harness, applies the canonical seed, executes a candidate
migration, and evaluates fact-specific behavior. The harness includes the
`deployer`, `application`, and `readonly_user` roles plus the `auth.jwt()`
claims stub used by tenant checks.

The frozen fact registry contains 39 facts in
[`fixtures/task-v2/facts.json`](../fixtures/task-v2/facts.json). These facts
cover schema types and defaults, naming, constraints and indexes, tenant
isolation, RLS, append-only behavior, views, triggers, functions, and grants.
Oracle failures identify canonical fact IDs and statements. They do not expose
corrected SQL. RLS violations and ordinary permission failures are distinguished
by their message text when both use SQLSTATE `42501`.

The Oracle is deterministic and independent of model output. Good and bad
fixtures under [`fixtures/task-v2/`](../fixtures/task-v2/) are validation
assets, not model-generated evidence. The current fixture self-test passes all
30 good fixtures and rejects all 40 bad fixtures, as reported by
[`scripts/oracle.ts`](../scripts/oracle.ts).

## Dataset and Retrieval

The task set is frozen before evaluation:

- 40 training tasks, `T-001` through `T-040`;
- 40 development tasks, `D-001` through `D-040`; and
- 120 held-out test tasks, `H-001` through `H-120`.

Each task includes a migration prompt, table and feature flags, applicable
facts, and a deterministic set of three to five bound facts stored in
`fixtures/task-v2/tasks.json`. Bound facts are selected using Condition A
development-split pass rates by `loadDiscriminatingFacts` and
`selectBoundFactsForTask` in
[`scripts/rescore-condition-a.ts`](../scripts/rescore-condition-a.ts):
`loadDiscriminatingFacts` reads `out/condition-a-dev-rescored.json` and defines
discriminating facts as those with Condition A development `passRate` in
`[0.1, 0.8]`, while `selectBoundFactsForTask` hashes `taskId` (FNV-1a) to set
`targetTotal = (seed % 3) + 3` (`3`, `4`, or `5` bound facts) and deterministically
samples `targetTotal - numNonDisc` facts from the task's discriminating
applicable facts and at most one (`numNonDisc = 1` when `targetTotal > 3`) from
its non-discriminating applicable facts (backfilling from non-discriminating
facts if fewer than three are selected). All applicable facts remain available
as secondary telemetry, but bound facts determine the primary task-level score.

Lessons are stored in `.axiom-state/memory.json`, which is loaded once in
read-only mode at ablation startup and verified by SHA-256 before and after the
run. Before the held-out run, `ensureSqlTrainMemory` in
[`src/eval/ablation.ts`](../src/eval/ablation.ts) prepares lessons from the
training split using the train-split failure counts loaded by
`loadTrainFailureFrequency` from `out/train-calibration.json` (produced by
[`scripts/calibrate-train-failure-frequency.ts`](../scripts/calibrate-train-failure-frequency.ts))
and records observed feature flags from each training task's real flags
(`tenant`, `append_only`, `ingestion`, `status`, `sec_definer`,
`latest_per_key`, and `view`). When a fact has training exposure, the Advisor
distills its canonical fact statement into a short lesson; otherwise the
canonical statement is retained. For Conditions C and C0, retrieval first
restricts candidate lessons to the task's applicable set (within the same
eligible fact set Condition B uses), filters by feature-flag compatibility, and
ranks up to `LESSON_TOP_K = 6` lessons.

The registry contains 39 facts, while the current persisted memory contains 32
lessons: 14 are Advisor-distilled and 18 retain verbatim canonical statements.
The remaining seven registry facts have no persisted lesson. When more than
six compatible lessons match, retrieval orders them by positive utility
(`utilityScore > 0`) first, then by `featureMatchScore * 10 + utilityScore`,
then by feature-match score, utility score, `lastUsedAt` descending, and
`errorCode` ascending. The first six in that deterministic ordering are
injected.

## Experimental Setup

The experiment is implemented in
[`src/eval/ablation.ts`](../src/eval/ablation.ts). It evaluates six conditions
once per test task:

| Condition | Prompt treatment |
|---|---|
| A | No memory and no hints. |
| B | Static injection of all eligible canonical fact statements. |
| C | Retrieval and injection of up to six feature-matched memory lessons. |
| C0 | The same retrieval as C, but each retrieved item is injected as the canonical Oracle fact statement verbatim rather than as an Advisor-distilled lesson. |
| D | A placebo containing true but task-irrelevant PostgreSQL tips. |
| E_B | Condition B with the Tier 0 measurement path (`reusedFromCondition: 'B'`). SQL has no safe generic Tier 0 rewrite, so E_B reuses Condition B's cached generation and records its Oracle evaluation explicitly. |

For each task-condition tuple in Conditions A, B, C, C0, and D, the NVIDIA NIM
Executor generates one SQL migration at temperature 0, while Condition E_B
reuses Condition B's generation (`reusedFromCondition: 'B'`), yielding 720
scored trials from 600 independent generations (E_B reuses Condition B's
generation). Each trial's migration is evaluated by the PostgreSQL Oracle.
There is no in-trial retry and no Advisor call. The runner checkpoints
completed tuples in `.axiom-state/ablation-v2-checkpoint.json` and waits
between API calls so an interrupted run can resume without repeating completed
tuples.

The ablation Executor model is `google/gemma-4-31b-it`, configured as an
explicit required setting with no silent default and verified by asserting
`returnedModel === requestedModel` on every trial. The Advisor model used
when preparing SQL lessons is `deepseek-ai/deepseek-v4.1-flash`. Both use
NVIDIA NIM. Findings from this protocol apply to this model configuration and
should not be generalized to other models.

## Hypotheses

- **H1:** Condition C exceeds Condition A on the primary metric.
- **H2:** Condition C exceeds Condition D, ruling out prompt length as the
  cause of an improvement.
- **H3:** Condition C differs from Condition C0, measuring the effect of
  Advisor distillation against verbatim canonical statements.
- **H4:** Condition C approaches Condition B at lower mean prompt-token cost.

Condition E_B is expected to match Condition B because SQL has no safe generic
Tier 0 rewrite in the current implementation.

## Metrics and Statistical Analysis

The primary metric is the mean fraction of bound facts passed:

```text
mean over trials of (bound facts passed / bound facts)
```

The secondary metric is strict bound-fact Pass@1: a task passes only when every
bound fact passes. If `F-13` (target table existence and naming) is in the
Oracle's failed set, the trial records `tableMissing = true` and counts all
bound facts as failed (`boundPassed = false`, `boundFactFraction = 0`) while
keeping the Oracle's reported `failedFacts` unchanged. Each trial also records
`migrationExitNonZero` to indicate whether the migration's `psql` execution
returned a non-zero exit status. Raw all-fact Pass@1 is diagnostic telemetry,
not the primary metric.

The runner reports Wilson 95% intervals for raw Pass@1 and bound-fact Pass@1.
It reports paired McNemar statistics for Condition C against
A, B, C0, and D, using both the raw and bound-fact binary outcomes. The current
runner does not implement a continuous paired test for the primary metric or
Holm correction; this document therefore makes no claim that those analyses
are produced.

The report also includes failures by fact ID, average LLM calls per task,
average tokens per task, retrieved fact IDs, and bound-fact fractions.

## Limitations

Each task-condition cell has one repeat at temperature 0, so provider-side
nondeterminism remains possible. The study uses one model configuration.
Bound facts limit per-task scoring to three to five facts. Retrieval is capped
at six lessons, so a bound fact outside the retrieved set cannot be helped by
Condition C or C0.

## Infrastructure and Provenance

The SQL Oracle runs in a fresh Docker `postgres:16` container and rebuilds its
canonical database state from the repository seed. The Executor and Advisor
use NVIDIA NIM at `https://integrate.api.nvidia.com/v1`; credentials are read
from environment variables and are never included in reports or source.

Experiment cache entries and reports are required to record the provider, base
URL, requested model, API-returned model, Oracle commit hash, and SHA-256 of
`facts.json`. These fields prevent stale results from being treated as
evidence for a different provider or repository state.

Earlier Groq/Gemini attempts encountered provider rate limits and are not part
of the NVIDIA experiment. Their outputs are not used for conclusions.

## Status

The task definitions, 39-fact registry, Oracle contract, retrieval design, and
six-condition evaluation protocol are defined in the repository. The active
720-trial checkpoint is maintained separately from this paper. This document
reports the implemented design and method only; it intentionally reports no
held-out experimental results.

## Future Work

Future work includes replication across a model matrix, expansion of Oracle
coverage for additional migration behaviors, and integration into CI/CD
quality gates.
