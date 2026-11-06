# PostgreSQL Environment Facts Specification (`env-facts`)

## 1. Environment Constants & Classification Flags

### 1.1 Roles
The harness defines exactly three database roles:
- `deployer`: Migration/table owner role used to apply DDL and test owner-level trigger enforcement.
- `application`: Primary read/write application runtime role.
- `readonly_user`: Read-only reporting/analytics role.

*(No `anon`, `authenticated`, or `app_user` roles exist in the environment.)*

### 1.2 Naming Patterns
- Index naming (`F-18`): `idx_<table>_<column>` (composite: `idx_<table>_<col1>_<col2>`)
- Foreign key constraint naming (`F-16`): `fk_<table>_<column>`
- Check constraint naming (`F-17`): `chk_<table>_<column>`
- Primary key naming (`F-14`): Marked `UNCONFIRMED` (excluded from primary experiment unless confirmed by owner).

### 1.3 Append-Only Trigger Exception Message
- Exact required trigger exception message (`F-20`):
  ```text
  Update/Delete operation rejected on audit log
  ```

### 1.4 Table Classification Flags
- `tenant` (`boolean`): `true` when the table stores multi-tenant rows scoped to a tenant.
- `append_only` (`boolean`): `true` when the table is an immutable audit log or event ledger.
- **Precedence (`append_only` override)**: `append_only = true` overrides `F-06` and `F-10` (an `append_only` table has **no** `updated_at` and **no** `deleted_at`, including when `{ tenant: true, append_only: true }`).

---

## 2. Source & Status Policy

- **`Source`**: The originating rule ID in [`agents/dbaagent.md`](file:///c:/Users/neil/Axiom/agents/dbaagent.md) (`DB-01`, `DB-04`, `DB-05`, `DB-06`, `DB-07`, `DB-13`, `DB-14`) or `owner-adopted`.
- **`Status`**:
  - `CONFIRMED`: Directly grounded in an explicit `agents/dbaagent.md` rule and eligible for the primary experiment.
  - `OWNER-ADOPTED`: House convention confirmed by the repository owner and eligible for the primary experiment.
  - `UNCONFIRMED`: Not confirmed by the owner; **excluded from the primary experiment**.
  - `PROPOSED CHANGE`: Any proposed testability refinement is logged in [`docs/spec/env-facts-changelog.md`](file:///c:/Users/neil/Axiom/docs/spec/env-facts-changelog.md) while keeping the owner's original wording as the active text.

---

## 3. Final Fact Table

| Fact ID | Applies When (Flags / Feature Cue) | Source | Status | Check Type | Active Fact Statement (Oracle Message Body) | Verification Specification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | All tables | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Primary key column `id` must be `uuid` with default `gen_random_uuid()`. | `pg_attribute` + `pg_attrdef`: `attname = 'id'`, `atttypid = 'uuid'::regtype`, default `gen_random_uuid()`. |
| **F-02** | `tenant = true` | `DB-14` | `CONFIRMED` | Catalog | Multi-tenant tables must include `tenant_id uuid NOT NULL`. | `pg_attribute`: `attname = 'tenant_id'`, `atttypid = 'uuid'::regtype`, `attnotnull = true`. |
| **F-03** | Foreign key columns (`fk` feature) | `DB-04` | `CONFIRMED` | Catalog | Every foreign key constraint must use `ON DELETE RESTRICT`. | `pg_constraint`: every `contype = 'f'` on table has `confdeltype = 'r'`. |
| **F-04** | Monetary / price feature (`money` flag) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Monetary columns must use `numeric(19,4) NOT NULL` (never `float`, `real`, or `money`). | `pg_attribute`: `format_type(atttypid, atttypmod) = 'numeric(19,4)'`, `attnotnull = true`. |
| **F-05** | All tables | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Every table must include `created_at timestamptz NOT NULL DEFAULT now()`. | `pg_attribute` + `pg_attrdef`: `timestamptz`, `attnotnull = true`, default `now()`. |
| **F-06** | `append_only = false` (overridden when `append_only = true`) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Mutable tables must include `updated_at timestamptz NOT NULL DEFAULT now()`; `append_only` tables must not include `updated_at`. | If `append_only = false`: require `updated_at timestamptz NOT NULL DEFAULT now()`. If `append_only = true`: require `updated_at` absent. |
| **F-07** | All timestamp columns | `owner-adopted` | `OWNER-ADOPTED` | Catalog | All timestamp columns must use `timestamptz`, never `timestamp` without time zone. | `pg_attribute`: zero columns on table with `atttypid = 'timestamp'::regtype`. |
| **F-08** | String / text columns | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Text columns must use `text` rather than `varchar(n)` or `char(n)`. | `pg_attribute`: zero columns on table with `atttypid IN ('varchar'::regtype, 'bpchar'::regtype)`. |
| **F-09** | JSON payload feature (`json` flag) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | JSON columns must use `jsonb NOT NULL DEFAULT '{}'::jsonb`, never `json`. | `pg_attribute`: `atttypid = 'jsonb'::regtype`, `attnotnull = true`. |
| **F-10** | `soft_delete` feature & `append_only = false` (overridden when `append_only = true`) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Soft-deletable mutable tables must include nullable `deleted_at timestamptz`; `append_only` tables must not include `deleted_at`. | If `append_only = true`: require `deleted_at` absent. If `soft_delete` on mutable table: require nullable `deleted_at timestamptz`. |
| **F-11** | Client IP feature (`ip` flag) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | IP address columns must use `inet`, never `text` or `varchar`. | `pg_attribute`: IP column `atttypid = 'inet'::regtype`. |
| **F-12** | Status / state feature (`status` flag) | `DB-04` | `CONFIRMED` | Catalog | Status or state columns must be `text NOT NULL` validated by a `CHECK (col IN (...))` constraint. | `pg_attribute` + `pg_constraint` (`contype = 'c'` referencing the status column). |
| **F-13** | All tables | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Table name must be `snake_case` plural matching `^[a-z]+(_[a-z]+)*s$` and belong to the allow-list of task nouns. | Check `relname ~ '^[a-z]+(_[a-z]+)*s$'` AND `relname IN (<task_noun_allow_list>)`. |
| **F-14** | Primary key constraint | `UNCONFIRMED` | `UNCONFIRMED` | Catalog | *(Excluded from primary experiment)* Primary key constraint named `pk_<table>`. | Excluded unless confirmed by owner. |
| **F-15** | Foreign key columns (`fk` feature) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Foreign key columns must be named `<singular_ref_table>_id` (or `supersedes_id` for self-FK on append-only tables). | Check referencing column name in `pg_attribute` against referenced table singular noun + `_id` (or `supersedes_id`). |
| **F-16** | Foreign key constraints (`fk` feature) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Foreign key constraints must be named `fk_<table>_<column>`. | Derive exact expected name `fk_${table}_${column}` from `pg_constraint` (`contype = 'f'`). |
| **F-17** | Check constraints (`check` / `status` / `counter` feature) | `owner-adopted` | `OWNER-ADOPTED` | Catalog | Check constraints must be named `chk_<table>_<column>`. | Derive exact expected name `chk_${table}_${column}` from `pg_constraint` (`contype = 'c'`) target column. |
| **F-18** | Explicit non-constraint indexes | `DB-07` | `CONFIRMED` | Catalog | Non-constraint indexes must be named `idx_<table>_<column>` (or `idx_<table>_<col1>_<col2>` for composite indexes), skipping constraint-backed indexes. | Query `pg_index` where `NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)`; derive exact name `idx_${table}_${cols.join('_')}` from catalog key columns. |
| **F-19** | `append_only = true` | `DB-01` | `CONFIRMED` | Catalog | Append-only tables must revoke `UPDATE`, `DELETE`, and `TRUNCATE` from `PUBLIC`, `application`, and `readonly_user`. | Check `has_table_privilege(r, tbl, priv) = false` for `r IN ('public', 'application', 'readonly_user')` and `priv IN ('UPDATE', 'DELETE', 'TRUNCATE')`, and verify via `pg_class.relacl`. (**UNVERIFIED (no Postgres run yet)** for `'public'` pseudo-role behavior on `postgres:16`). |
| **F-20** | `append_only = true` | `DB-01` | `CONFIRMED` | Behavioral | Append-only tables must have a `BEFORE UPDATE OR DELETE` trigger that raises the exact exception message `Update/Delete operation rejected on audit log`. | Insert 1 seed row, run `UPDATE` and `DELETE` as `deployer`, and assert exception message equals `Update/Delete operation rejected on audit log`. (**UNVERIFIED (no Postgres run yet)**). |
| **F-21** | `append_only = false` | `owner-adopted` | `OWNER-ADOPTED` | Behavioral | Mutable tables must have a `BEFORE UPDATE` trigger that updates `updated_at = now()`. | Insert row with past `updated_at`, run `UPDATE`, assert `updated_at >= now()`. (**UNVERIFIED (no Postgres run yet)**). |
| **F-22** | Foreign key columns (`fk` feature) | `DB-07` | `CONFIRMED` | Catalog | Every foreign key column must be indexed (standalone or as the leading column of a B-tree index). | Check `pg_index.indkey[0]` covers every `conkey` of `contype = 'f'` on the table. |
| **F-23** | `tenant = true` | `DB-06` / `DB-07` | `CONFIRMED` | Catalog | Multi-tenant tables must index `tenant_id` (standalone or as the leading column of a composite index). | Check `pg_index` for an index whose leading column `indkey[0]` is `tenant_id`. |
| **F-24** | `soft_delete` feature & `append_only = false` | `DB-07` | `CONFIRMED` | Catalog | Unique business keys on soft-deletable tables must use a partial unique index with `WHERE deleted_at IS NULL`. | Check `pg_index`: `indisunique = true` and `pg_get_expr(indpred, indrelid) = '(deleted_at IS NULL)'`. |
| **F-25** | All exposed tables | `DB-06` | `CONFIRMED` | Catalog | Row-Level Security must be enabled and forced (`ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`). | `pg_class`: `relrowsecurity = true` AND `relforcerowsecurity = true`. |
| **F-26** | `tenant = true` (replaces `F-26` + `F-28`) | `DB-06` / `DB-14` | `CONFIRMED` | Behavioral | Tenant RLS policies must scope rows by `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` for role `application`, granting zero access when `tenant_id` is placed in `user_metadata`. | Harness creates stub `auth.jwt()` reading `current_setting('request.jwt.claims', true)::jsonb`. Under `ROLE application`, `app_metadata.tenant_id` allows only matching tenant rows, whereas `user_metadata.tenant_id` returns 0 rows and rejects `INSERT`. (**UNVERIFIED (no Postgres run yet)**). |
| **F-27** | `append_only = true` | `DB-01` / `DB-06` | `CONFIRMED` | Catalog | Append-only tables must define zero `FOR UPDATE`, `FOR DELETE`, or `FOR ALL` RLS policies. | `pg_policy`: no policy on the table has `polcmd IN ('w', 'd', '*')`. |
| **F-30** | All RLS write policies | `DB-06` | `CONFIRMED` | Catalog | Write RLS policies (`FOR INSERT` or `FOR UPDATE`) must never use `USING (true)` or `WITH CHECK (true)`. | `pg_policy`: inspect `pg_get_expr(polqual, polrelid)` and `pg_get_expr(polwithcheck, polrelid)` for `polcmd IN ('a', 'w', '*')`. |
| **F-31** | `SECURITY DEFINER` function feature (`sec_definer` flag) | `DB-05` | `CONFIRMED` | Catalog | `SECURITY DEFINER` functions must explicitly set `SET search_path = ''`. | `pg_proc`: for `prosecdef = true`, `proconfig` contains `search_path=""` or `search_path=`. |
| **F-32** | Idempotent ingestion feature (`ingestion` flag) | `DB-05` | `CONFIRMED` | Catalog | Ingestion tables with `idempotency_key` must enforce a unique constraint or unique index on `idempotency_key` (or `(tenant_id, idempotency_key)` when `tenant = true`). | `pg_index`: `indisunique = true` covering `idempotency_key` (and `tenant_id` if `tenant = true`). |
| **F-34** | Counter / stock feature (`counter` flag; replaces `F-35`) | `DB-13` | `CONFIRMED` | Behavioral & Catalog | Counter columns must have `CHECK (<col> >= 0)` and the task-specified function `<fn_name>(p_id uuid, p_delta integer)` must perform an atomic conditional update (`WHERE id = p_id AND <col> >= p_delta`), rejecting decrements that would underflow. | Task text explicitly supplies the function name and signature. Seed row with `<col> = 5`, call `<fn_name>(id, 3)` (succeeds, leaves `2`), then call `<fn_name>(id, 3)` (must fail or affect 0 rows, leaving `2`). (**UNVERIFIED (no Postgres run yet)**). |
| **F-36** | `append_only = true` | `DB-01` | `CONFIRMED` | Catalog | Append-only tables must include a nullable self-referential foreign key `supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT`. | `pg_attribute` + `pg_constraint`: `attname = 'supersedes_id'`, `contype = 'f'`, `conrelid = confrelid`, `confdeltype = 'r'`. |
| **F-37** | Ingestion feature (`ingestion` flag) | `DB-05` | `CONFIRMED` | Behavioral | Ingestion tables must attach a `BEFORE INSERT` trigger forcing `NEW.received_at = now()` regardless of client-supplied input while keeping client `observed_at`. | Insert row with `received_at = '2000-01-01T00:00:00Z'` and `observed_at = '2026-01-01T00:00:00Z'`; assert stored `received_at = now()` and `observed_at = '2026-01-01T00:00:00Z'`. (**UNVERIFIED (no Postgres run yet)**). |
| **F-38** | Time-series / observation feature (`latest_per_key` flag) | `DB-07` | `CONFIRMED` | Catalog | Observation tables must define a composite B-tree index `idx_<table>_<key>_observed_at` on `(<key>, observed_at DESC)`. | `pg_index`: verify key columns `(key, observed_at)` with `DESC` bit `(indoption[1] & 1) = 1`. (**UNVERIFIED (no Postgres run yet)**). |
| **F-39** | View feature (`view` flag) | `DB-06` | `CONFIRMED` | Catalog | Views must be created with `WITH (security_invoker = true)`. | `pg_class`: for `relkind = 'v'`, `reloptions` contains `'security_invoker=true'`. (**UNVERIFIED (no Postgres run yet)**). |

---

## 4. Count of Facts Eligible for Primary Experiment

- **Total rows in table**: `32` (`F-01`..`F-27`, `F-30`..`F-32`, `F-34`, `F-36`..`F-39`; `F-28` merged into `F-26`, `F-29` and `F-33` removed, `F-35` replaced by `F-34`).
- **Excluded (`UNCONFIRMED`)**: `1` (`F-14`: `pk_<table>`).
- **Eligible for Primary Experiment (`CONFIRMED` + `OWNER-ADOPTED`)**: **`31` facts** (`18` `CONFIRMED` from `DB-01`/`DB-04`/`DB-05`/`DB-06`/`DB-07`/`DB-13`/`DB-14` + `13` `OWNER-ADOPTED`).

---

## 5. Unverified PostgreSQL 16 Behavior Statements

All runtime behavior claims below are tagged **`UNVERIFIED (no Postgres run yet)`** until Docker Desktop is running and the `postgres:16` container executes the verification script:
1. **`auth.jwt()` Stub (`F-26`) — `UNVERIFIED (no Postgres run yet)`**:
   - Stub definition: `SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);`
   - Must be executed on `postgres:16` under `SET LOCAL ROLE application` to confirm `app_metadata.tenant_id` vs `user_metadata.tenant_id` row scoping.
2. **`has_table_privilege('public', ...)` vs `pg_class.relacl` (`F-19`) — `UNVERIFIED (no Postgres run yet)`**:
   - Must be executed on `postgres:16` to confirm `has_table_privilege('public', oid, 'UPDATE')` and `aclexplode(relacl)` behavior after `ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO application, readonly_user;`.
3. **Owner Trigger Enforcement (`F-20`), Timestamp Triggers (`F-21`, `F-37`), Atomic Counter (`F-34`), `indoption` `DESC` bit (`F-38`), and `reloptions` `security_invoker=true` (`F-39`) — `UNVERIFIED (no Postgres run yet)`**.
