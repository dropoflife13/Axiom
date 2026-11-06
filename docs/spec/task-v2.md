# Task v2 Architecture, Harness, Retrieval & Evaluation Specification

## 1. Scoring & Oracle Contract (Updated 2026-11-06)

### 1.1 Task Pass Criterion & Metrics (Pre-Registered 2026-11-06)
- **Primary Metric**: **Mean fraction of bound facts passed** across tasks, evaluated with 95% paired bootstrap confidence intervals (Condition C vs B vs A).
- **Secondary Metric**: **`pass@1`** (strict zero-tolerance: a task passes on Attempt 1 if and only if **100% of its bound facts pass**).
- **Bound Facts per Task (3 to 5 Bound Facts)**:
  - Each task binds **3 to 5 facts** ($\le 5$) selected via a deterministic seeded selection among its applicable facts.
  - The selection draws predominantly from discriminating facts (house conventions and facts in the 10%–80% baseline pass band) plus at most one non-discriminating fact (> 80% baseline pass rate).
  - Every applicable fact is logged as secondary telemetry, but only the 3–5 bound facts determine task scoring.
- **Retrieval Budget Alignment ($k = 6 \ge \max(\text{boundFacts})$)**:
  - With maximum bound facts $\le 5$, the retrieval budget $k = 6$ (`LESSON_TOP_K = 6`) strictly exceeds the maximum bound fact count ($6 \ge 5$). This guarantees that Condition C retrieval never starves a task of applicable memory lessons due to injection capacity limits.
- **Cueing**: Task prompts cue bound facts strictly via domain features (e.g., *"audit table with client IP and JSON payload"*) and never state a house rule or naming convention.
- For tasks binding **`F-34`** (`DB-13`), the task text explicitly supplies the required function name and signature (e.g., `decrement_stock(p_id uuid, p_delta integer) RETURNS boolean`).

### 1.2 Oracle Failure Messages (Zero Leakage)
- Every failing assertion returns strictly canonical fact statements:
  ```text
  <factId>: <canonical one-line statement of the violated fact>
  ```
  for all failed bound facts on that attempt, with **no corrected SQL** and **no raw database compiler / psql stderr**.

---

## 2. Generator, 40/40/120 Split, `postgres:16` Harness & Golden Migrations

### 2.1 Frozen 40 / 40 / 120 Split
- Written to disk before any LLM run:
  - **Train (`40` tasks)**: `T-001` .. `T-040`
  - **Dev (`40` tasks)**: `D-001` .. `D-040`
  - **Test (`120` tasks)**: `H-001` .. `H-120`

### 2.2 `docker-compose` `postgres:16` Harness
- **Roles**: `deployer` (migration owner), `application` (app read/write role), `readonly_user` (read-only role).
- **Default Privileges**:
  ```sql
  ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO application, readonly_user;
  ```
  *(Status: **UNVERIFIED (no Postgres run yet)**)*
- **Search Path & `auth.jwt()` Stub**:
  - `search_path` configured to `public, auth`.
  - Stub `auth.jwt()` reads `current_setting('request.jwt.claims', true)::jsonb` (**UNVERIFIED (no Postgres run yet)**).

### 2.3 Golden Migrations (`30` Good + `40` Bad) & Calibration
- **30 Good + 40 Bad hand-written migrations** (including SQL comment tricks, quoted identifiers, partial bundles, and a compliant `{ tenant: true, append_only: true }` table) verified with a kill-rate report before any LLM run. Never weaken the oracle to pass goldens.
- **Per-Fact Dev Calibration**: Run on the 40 Dev tasks (`D-001` .. `D-040`); flag any fact outside the `10%–80%` pass-rate band.
- **Token Accounting**: Track prompt, completion, and total tokens across Condition A (baseline), Condition B (all eligible facts), Condition C (retrieved memory), and Placebo (true but irrelevant Postgres tips).

---

## 3. Retrieval for Condition C (Feature-Flag Overlap Only, No LLM)

### 3.1 Lesson Schema & Memory Keys
- **Memory Key**: `errorCode = factId` (strictly one stored lesson per `factId`).
- **Lesson Record**:
  ```ts
  export interface FactLesson {
    errorCode: string;      // Equal to factId (e.g., "F-20")
    factId: string;         // e.g., "F-20"
    lesson: string;         // One concrete rule under 24 words
    tags: string[];         // Structured task feature flags ONLY (e.g., ["tenant", "append_only", "ip", "json"])
    createdAt: string;
    lastUsedAt: string;
  }
  ```

### 3.2 Feature-Flag Overlap Retrieval & Single Config Constant `k = 6`
- **Feature-Flag Overlap Only (No Task Text)**:
  - Retrieval compares **only** the task's structured boolean/feature flags (`tenant`, `append_only`, `mutable`, `fk`, `money`, `json`, `soft_delete`, `ip`, `status`, `sec_definer`, `ingestion`, `counter`, `latest_per_key`, `view`) against `lesson.tags`.
  - Raw task prompt prose is **not** tokenized or used for retrieval scoring.
  - Score for lesson $L$ on task $T$:
    $$\text{score}(T, L) = |\text{featureFlags}(T) \cap L.\text{tags}|$$
    with ties broken deterministically by `lastUsedAt` descending.
- **Single Config Constant `LESSON_TOP_K = 6`**:
  - `k = 6` is defined in one configuration constant (`LESSON_TOP_K = 6`) that simultaneously governs:
    1. The top-$k$ retrieval cut-off before Attempt 1, and
    2. The prompt lesson injection cap (`MAX_INJECTED_LESSONS = LESSON_TOP_K = 6`).
  - Each generated task binds at most $k = 6$ target facts beyond universal baseline columns, ensuring $k = 6$ can cover the task's bound lessons.

### 3.3 Recall Gate (`>= 0.8` on Dev) & Coverage Report
- **Per-Task Retrieval Logging**:
  - For every task under Condition C, record `retrievedFactIds`, `boundFactIds` (intersected with facts present in memory), and per-task retrieval recall.
- **Dev Recall Gate (`>= 0.80`)**:
  - Before running Condition C on the 120 held-out test tasks, evaluate retrieval recall on the 40 Dev tasks (`D-001` .. `D-040`).
  - **Hard Gate**: Mean retrieval recall on Dev must be **$\ge 0.80$**. If recall is $< 0.80$, halt and fix feature-flag tagging/retrieval before judging the Advisor.
- **Fact Coverage Report**:
  - Every evaluation run outputs a 3-way fact coverage table across all eligible facts:
    1. **Exposed on Train**: Facts that failed at least once during the 40 Train tasks (`T-001` .. `T-040`), triggering an Advisor call.
    2. **Learned on Train**: Facts whose Advisor lesson passed verification on retry during Train and was persisted to `.axiom-state/memory.json`.
    3. **Absent at Test Time**: Bound facts on Test (`H-001` .. `H-120`) that had no lesson in `.axiom-state/memory.json` (either never failed on Train or never passed retry validation on Train).

---

## 4. Code Changes Needed (Listed Only — Not Yet Implemented)

1. **`src/loop.ts`**:
   - Learn from **every** failed fact in `verdict.errors` per attempt (not only `lastErrors[0]`), validating and saving each `factId` lesson that resolves on the subsequent retry alongside the failing task's feature-flag `tags`.
2. **`src/memory.ts`**:
   - Key lessons by `errorCode = factId`, store `tags: string[]` (structured feature flags only), unify `MAX_INJECTED_LESSONS` and retrieval $k$ into one config constant `LESSON_TOP_K = 6`, and retrieve top-$k$ lessons by feature-flag overlap before Attempt 1.
3. **Evaluation & Coverage Reporting (`src/eval/`)**:
   - Record per-task retrieved `factId`s and retrieval recall, enforce the Dev recall gate ($\ge 0.80$), and emit the 3-column coverage report (`exposedOnTrain`, `learnedOnTrain`, `absentAtTestTime`).
