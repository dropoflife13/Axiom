# Environment Facts Changelog (`env-facts-changelog`)

This changelog records all revisions applied to [`docs/spec/env-facts.md`](file:///c:/Users/neil/Axiom/docs/spec/env-facts.md).

---

## 1. Restored Owner's Original Environment Constants & Wording
- **Roles**: Restored to `application`, `readonly_user`, and `deployer` (removed `anon`, `authenticated`, and `app_user`).
- **Constraint & Index Naming**:
  - `F-16` (FK constraint): Restored to `fk_<table>_<column>`.
  - `F-17` (Check constraint): Restored to `chk_<table>_<column>`.
  - `F-18` (Index): Restored to `idx_<table>_<column>` (or `idx_<table>_<col1>_<col2>` for composite indexes), skipping constraint-backed indexes.
- **Primary Key Naming (`F-14`)**: Marked `UNCONFIRMED` (`pk_<table>`) and excluded from the primary experiment unless confirmed by the owner.
- **Exact Trigger Exception Message (`F-20`)**: Restored to exact string `Update/Delete operation rejected on audit log`.

## 2. Proposed Changes for Testability (`PROPOSED CHANGE` Log)
The active text in [`docs/spec/env-facts.md`](file:///c:/Users/neil/Axiom/docs/spec/env-facts.md) preserves the owner's exact naming formulas above. The following edge cases are recorded as **`PROPOSED CHANGE`** items for owner review:
- **`PROPOSED CHANGE (F-17 Multi-Check Disambiguation)`**: When a single column has only one `CHECK` constraint (e.g., `status` or `quantity >= 0`), `chk_<table>_<column>` is unique and exact. If a task ever requires two separate `CHECK` constraints on the same column, they cannot share `chk_<table>_<column>`; to avoid ambiguity without changing `chk_<table>_<column>`, tasks in the 40/40/120 split bind at most one `CHECK` constraint per column.
- **`PROPOSED CHANGE (F-18 Composite Index Column Order)`**: For single-column indexes (`tenant_id`, FK columns), `idx_<table>_<column>` is exact. For composite indexes (`F-38` latest-per-key on `(<key>, observed_at DESC)`), `idx_<table>_<key>_observed_at` concatenates the catalog key columns in index order.

## 3. Rewrote `F-34` (`DB-13`) with Task-Supplied Function Name & Signature
- Replaced `F-35` with **`F-34`** (`Source: DB-13`, `Status: CONFIRMED`):
  - The task prompt explicitly supplies the RPC function name and signature (e.g., `decrement_stock(p_id uuid, p_delta integer)`).
  - The oracle verifies both the catalog `CHECK (<col> >= 0)` constraint (`chk_<table>_<column>`) and the behavioral race-safe atomic update (`WHERE id = p_id AND <col> >= p_delta`) by seeding `<col> = 5`, decrementing by `3` (succeeds -> `2`), and decrementing by `3` again (rejected/0 rows updated -> remains `2`).

## 4. Tagged Unexecuted Postgres Claims as `UNVERIFIED (no Postgres run yet)`
- Tagged all PostgreSQL 16 runtime claims (`auth.jwt()` stub behavior, `has_table_privilege('public', ...)` vs `pg_class.relacl`, `F-20` trigger execution as `deployer`, `F-21`, `F-34`, `F-37`, `F-38`, `F-39`) as **`UNVERIFIED (no Postgres run yet)`** pending Docker daemon startup.

## 5. Added `DB-01`, `DB-05`, `DB-06`, `DB-07` Facts & Removed `F-29`, `F-33`
- Merged `F-26` and `F-28` into behavioral **`F-26`** using role `application` and `auth.jwt()`.
- Removed **`F-29`** and **`F-33`**.
- Added **`F-36`** (`supersedes_id` self-FK, `DB-01`), **`F-37`** (`BEFORE INSERT` trigger forcing `received_at = now()`, `DB-05`), **`F-38`** (`(<key>, observed_at DESC)` index, `DB-07`), and **`F-39`** (`security_invoker = true` on views, `DB-06`).
