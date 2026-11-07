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
`fixtures/task-v2/tasks.json`. Bound facts are selected exclusively from
Condition A training-split (`T-001`..`T-040`) pass rates by
`candidateFactsForRule` and `selectBoundFacts` in
[`scripts/propose-bound-facts.ts`](../scripts/propose-bound-facts.ts) under the
committed `R2` rule (`--rule R2`) and applied via
[`scripts/apply-bound-facts.ts`](../scripts/apply-bound-facts.ts):
`candidateFactsForRule` reads `out/train-calibration.json` and defines bound-fact
candidates as active Oracle-probed facts that are satisfied by validated golden
SQL, have `applicableCount >= 3` on Train, and have Condition A training
`passRate <= 0.80` (`trainFailureRate >= 0.20`, yielding 18 candidate facts: 11
in `[0.10, 0.80]` and 7 house-convention floor facts at `0.00`). For each task,
`selectBoundFacts` derives a deterministic seed from `SHA-256(task.id)` to set
`target = 3 + (seed % 3)` (`3`, `4`, or `5` bound facts) and selects up to
`target` facts from the task's applicable candidate facts (backfilling from
remaining applicable facts only if fewer than three candidates apply; across all
200 tasks, zero tasks require backfill). All applicable facts remain available
as secondary telemetry, while bound facts determine the primary task-level score.

Lessons are stored in `.axiom-state/memory.json`, which is loaded once in
read-only mode at ablation startup and verified by SHA-256 before and after the
run. Before the held-out run, [`scripts/build-sql-memory.ts`](../scripts/build-sql-memory.ts)
builds `.axiom-state/memory.json` exclusively from the training calibration
(`out/train-calibration.json`) and records observed feature-flag coverage
(`seenWhenTenantTrue/False`, `seenWhenAppendOnlyTrue/False`,
`seenWhenIngestionTrue/False`) from each training task's real derived flags.
When a training-applicable fact has at least one Condition A training failure
(`failedCount > 0`), the Advisor distills its canonical statement into a single
rule (`origin: 'distilled'`); when a training-applicable fact has zero training
failures (`failedCount === 0`), its canonical statement is retained verbatim
(`origin: 'verbatim'`). For Conditions C and C0, retrieval in
[`src/eval/ablation.ts`](../src/eval/ablation.ts) and
[`src/memory.ts`](../src/memory.ts) restricts candidate lessons to the task's
applicable set (within the same 34-fact active eligible set Condition B uses),
filters by structural feature-flag compatibility, and selects up to
`SQL_RETRIEVAL_TOP_K = 10` lessons (chosen via the pre-registered Dev K-sweep in
[`scripts/report-dev-k-sweep.ts`](../scripts/report-dev-k-sweep.ts), where
$K = 10$ is the smallest budget in $\{6, 8, 10, 12, 15, 20\}$ achieving $\ge 0.80$
mean retrievable bound-fact coverage on Dev under `R2`, reaching `0.8288`).

The registry contains 39 facts (34 active confirmed/owner-adopted facts and 5
inactive `PROPOSED`/`UNCONFIRMED` facts), while the persisted SQL memory contains
31 training-applicable lessons: 29 are Advisor-distilled (`failedCount > 0` on
Train) and 2 (`F-09` and `F-34`) retain verbatim canonical statements
(`failedCount === 0` on Train). Three active registry facts (`F-12`, `F-31`, and
`F-38`) have zero applicable training tasks and therefore no persisted lesson.
When more than `SQL_RETRIEVAL_TOP_K = 10` compatible applicable lessons match a
task, retrieval orders them by `trainFailureRate` descending, then by positive
utility (`utilityScore > 0`), then by `featureMatchScore * 10 + utilityScore`,
feature-match score, utility score, `lastUsedAt` descending, and `errorCode`
ascending. The first ten in that deterministic ordering are injected.

## Experimental Setup

The experiment is implemented in
[`src/eval/ablation.ts`](../src/eval/ablation.ts). It evaluates six conditions
once per test task:

| Condition | Prompt treatment |
|---|---|
| A | No memory and no hints. |
| B | Static injection of all 34 active eligible canonical fact statements. |
| C | Retrieval and injection of up to ten (`SQL_RETRIEVAL_TOP_K = 10`) feature-compatible applicable memory lessons. |
| C0 | The same retrieval and ordering as C, but each retrieved item is injected as the canonical Oracle fact statement verbatim rather than as an Advisor-distilled lesson. |
| D | A placebo containing true but task-irrelevant PostgreSQL tips outside the task's applicable fact set. |
| E_B | Condition B with the Tier 0 measurement path (`reusedFromCondition: 'B'`). SQL has no safe generic Tier 0 rewrite, so E_B reuses Condition B's cached generation and records its Oracle evaluation explicitly. |

For each task-condition tuple in Conditions A, B, C, C0, and D, the NVIDIA NIM
Executor generates one SQL migration at temperature 0, while Condition E_B
reuses Condition B's generation (`reusedFromCondition: 'B'`), yielding 720
scored trials from 600 independent generations (E_B reuses Condition B's
generation). Transient provider errors (HTTP 429, 5xx, network/request timeouts)
are retried with backoff and halt the process without recording an incomplete
trial if retries are exhausted (preserving lossless checkpoint resumption).
Deterministic generation failures—empty output (`generationStatus: 'empty'`),
token-limit truncation (`finish_reason === 'length'`, `generationStatus: 'length'`),
or content filtering / other non-stop completions (`generationStatus: 'other'`)—do
not abort the run: the runner records the trial with `generatedSql: ""`, skips
Oracle evaluation, and sets `boundFactFraction = 0`, `boundPassed = false`, and
`failedFacts = []`. Each `generationStatus: 'ok'` trial's migration is evaluated
by the PostgreSQL Oracle. There is no in-trial self-healing retry and no Advisor
call during evaluation. The runner checkpoints completed tuples in
`.axiom-state/ablation-v2-checkpoint.json` and waits between API calls so an
interrupted run can resume without repeating completed tuples.

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
returned a non-zero exit status, as well as `generationStatus` (`'ok' | 'empty' | 'length' | 'other'`).
Raw all-fact Pass@1 is diagnostic telemetry, not the primary metric.

The offline analysis pipeline in [`scripts/analyze-ablation-v2.ts`](../scripts/analyze-ablation-v2.ts)
computes all confirmatory and exploratory statistics once the 720 held-out
trials are complete:

1. **Primary Endpoint Inference:** For each of the four confirmatory contrasts
   (`C_vs_A`, `C_vs_B`, `C_vs_C0`, and `C_vs_D`), the analyzer computes a
   two-sided paired sign-flip randomization p-value (`signFlipPValue`, `100,000`
   iterations, xorshift32 seed `20260101`) and a paired percentile bootstrap
   95% confidence interval (`ci95`, `10,000` resamples) on task-paired
   `boundFactFraction` differences across the 120 test tasks.
2. **Secondary Endpoint Inference:** For each of the four confirmatory contrasts,
   the analyzer computes the exact two-sided McNemar test on paired binary
   `boundPassed` outcomes alongside Wilson 95% score intervals per condition.
3. **Multiplicity Control:** Holm-Bonferroni step-down adjustment is applied
   separately across the four primary sign-flip p-values (`holmPrimaryPValues`)
   and the four secondary exact McNemar p-values (`holmSecondaryPValues`).
4. **Exploratory Analyses (Outside the Holm Family):** The analyzer also reports
   an exploratory sensitivity analysis (`sensitivityAnalysis`) excluding tasks
   where either compared condition has `generationStatus !== 'ok'` or
   `migrationExitNonZero === true`, an exploratory per-cell analysis
   (`perCellAnalysis`) across the 8 `(tenant, append_only, ingestion)` feature
   cells with equal-weight cell-stratified bootstrap 95% confidence intervals
   and an exact cell-level sign-flip test over the 8 cell means, lesson-origin
   splits (`lessonOriginAnalysis`), retrieval coverage (`retrievalOverlap`), and
   per-fact retrieval stratification (`perFactRetrievalAnalysis`).

The report also includes `generationStatus` counts per condition, failures by
fact ID, average LLM calls per task, average tokens per task and prompt-token
cost ratio (`meanPromptTokens_C / meanPromptTokens_B`), retrieved fact IDs, and
bound-fact fractions.

## Limitations

Each task-condition cell has one repeat at temperature 0, so provider-side
nondeterminism remains possible. The study uses one model configuration.
Bound facts limit per-task scoring to three to five facts. Retrieval is capped
at ten lessons (`SQL_RETRIEVAL_TOP_K = 10`, with $K = 6$ documented as a
budget-matched secondary configuration), so a bound fact outside the retrieved
top-ten set cannot be helped by Condition C or C0.

## Infrastructure and Provenance

The SQL Oracle runs in a fresh Docker `postgres:16` container and rebuilds its
canonical database state from the repository seed. The Executor and Advisor
use NVIDIA NIM at `https://integrate.api.nvidia.com/v1`; credentials are read
from environment variables and are never included in reports or source.

Experiment cache entries, calibration artifacts, and trial reports record the
provider, base URL, requested model, API-returned model, finish reason,
generation status, Oracle commit hash, SHA-256 of `facts.json`, full-file
`tasksSha256`, and bound-fact-invariant `taskContentSha256`. These fields
prevent stale results from being treated as evidence for a different provider or
repository state while allowing bound-fact proposals derived from Train
calibration to be applied without invalidating calibration task-content hashes.

Earlier Groq/Gemini attempts encountered provider rate limits and are not part
of the NVIDIA experiment. Their outputs are not used for conclusions.

## Status

The task definitions, 39-fact registry, Oracle contract, `R2` bound-fact
assignments, $K = 10$ retrieval budget, and six-condition evaluation and
analysis protocol are committed in the repository. The active 720-trial
checkpoint is maintained separately from this paper. This document reports the
implemented design and method only; it intentionally reports no held-out
experimental results.

## Future Work

Future work includes replication across a model matrix, expansion of Oracle
coverage for additional migration behaviors, and integration into CI/CD
quality gates.
