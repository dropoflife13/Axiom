# PostgreSQL Environment Facts Specification (generated)

This file is generated from [fixtures/task-v2/facts.json](../../fixtures/task-v2/facts.json). Do not edit it directly.

| Fact ID | Applies when | Status | Check key | Statement |
| :--- | :--- | :--- | :--- | :--- |
| F-01 | All tables | OWNER-ADOPTED | `primary-key` | Primary key column id must be uuid NOT NULL with default gen_random_uuid(). |
| F-02 | `tenant = true` | CONFIRMED | `tenant-column` | Multi-tenant tables must include tenant_id uuid NOT NULL. |
| F-03 | All tables | CONFIRMED | `foreign-key-delete-action` | Every foreign key constraint must use ON DELETE RESTRICT. |
| F-04 | All tables | OWNER-ADOPTED | `numeric-columns` | Monetary and decimal columns must use numeric (never float, real, double precision, or money). |
| F-05 | All tables | OWNER-ADOPTED | `created-at` | Every table must include created_at timestamptz NOT NULL DEFAULT now(). |
| F-06 | `append_only = false` | OWNER-ADOPTED | `updated-at-column` | Mutable tables must include updated_at timestamptz NOT NULL DEFAULT now(); append-only tables must omit updated_at. |
| F-07 | All tables | OWNER-ADOPTED | `timestamp-time-zone` | All timestamp columns must use timestamptz, never timestamp without time zone. |
| F-08 | All tables | OWNER-ADOPTED | `text-columns` | Text columns must use text rather than varchar(n) or char(n). |
| F-09 | `ingestion = true` | OWNER-ADOPTED | `jsonb-payload` | JSON columns must use jsonb NOT NULL, never json. |
| F-10 | `append_only = false` | OWNER-ADOPTED | `deleted-at-column` | Mutable tables must include nullable deleted_at timestamptz; append-only tables must omit deleted_at. |
| F-11 | All tables | OWNER-ADOPTED | `inet-columns` | IP address columns must use inet, never text or varchar. |
| F-12 | `status = true` | CONFIRMED | `status-check` | Status or state columns must be text NOT NULL validated by a CHECK (col IN (...)) constraint. |
| F-13 | All tables | OWNER-ADOPTED | `table-name` | Table name must be snake_case plural in public schema and belong to the allow-list of task nouns. |
| F-14 | Never (excluded) | UNCONFIRMED | `primary-key-name` | Primary key constraint named pk_<table>. |
| F-15 | All tables | OWNER-ADOPTED | `foreign-key-column-name` | Foreign key columns must be named <singular_ref_table>_id (or supersedes_id for self-FK on append-only tables). |
| F-16 | All tables | OWNER-ADOPTED | `foreign-key-name` | Foreign key constraints must be named fk_<table>_<column>. |
| F-17 | All tables | OWNER-ADOPTED | `check-name` | Check constraints must be named chk_<table>_<column>. |
| F-18 | All tables | CONFIRMED | `index-name` | Explicit non-constraint indexes must be named idx_<table>_<column> (skipping constraint-backed indexes). |
| F-19 | `append_only = true` | CONFIRMED | `append-only-privileges` | Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user. |
| F-20 | `append_only = true` | CONFIRMED | `append-only-trigger` | Append-only tables must have a BEFORE UPDATE OR DELETE trigger that raises Update/Delete operation rejected on audit log. |
| F-21 | `append_only = false` | OWNER-ADOPTED | `updated-at-trigger` | Mutable tables must have a BEFORE UPDATE trigger that advances updated_at. |
| F-22 | All tables | CONFIRMED | `foreign-key-index` | Every foreign key column must be covered as the leading column of an index. |
| F-23 | `tenant = true` | CONFIRMED | `tenant-index` | Multi-tenant tables must index tenant_id as the leading column of an index. |
| F-24 | `tenant = true` and `append_only = false` | CONFIRMED | `soft-delete-unique-index` | Unique business keys on soft-deletable mutable tables must use a partial unique index with WHERE deleted_at IS NULL. |
| F-25 | `tenant = true` | CONFIRMED | `force-rls` | Multi-tenant tables must have ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY. |
| F-26 | `tenant = true` | CONFIRMED | `tenant-rls-behavior` | Tenant RLS policies must scope rows by app_metadata.tenant_id for application and grant zero access to user_metadata.tenant_id. |
| F-27 | `append_only = true` | CONFIRMED | `append-only-rls-policies` | Append-only tables must define zero FOR UPDATE, FOR DELETE, or FOR ALL RLS policies. |
| F-28 | Never (excluded) | DROPPED | `merged-tenant-rls` | Merged into F-26 during reconciliation. |
| F-29 | Never (excluded) | DROPPED | `removed-f29` | Removed during reconciliation. |
| F-30 | `tenant = true` | CONFIRMED | `rls-write-policy` | Write RLS policies must never use tautological USING (true) or WITH CHECK (true). |
| F-31 | `sec_definer = true` | CONFIRMED | `security-definer-search-path` | SECURITY DEFINER functions must explicitly set SET search_path = ''. |
| F-32 | `ingestion = true` | CONFIRMED | `idempotency-unique` | Ingestion tables must enforce a UNIQUE constraint on idempotency_key (scoped by tenant_id when tenant = true). |
| F-33 | Never (excluded) | DROPPED | `removed-f33` | Removed during reconciliation. |
| F-34 | `ingestion = true` | CONFIRMED | `counter-underflow` | Counter and quota columns must enforce a non-negative CHECK (<col> >= 0) constraint against underflow. |
| F-35 | Never (excluded) | DROPPED | `replaced-counter-underflow` | Replaced by F-34 during reconciliation. |
| F-36 | `append_only = true` | CONFIRMED | `append-only-supersedes` | Append-only tables must include a nullable self-referential foreign key supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT. |
| F-37 | `ingestion = true` | CONFIRMED | `received-at-trigger` | Ingestion tables must attach a BEFORE INSERT trigger forcing NEW.received_at = now() regardless of client input. |
| F-38 | `latest_per_key = true` | CONFIRMED | `latest-per-key-index` | Observation tables must define a composite B-tree index on (<key>, observed_at DESC). |
| F-39 | `view = true` | CONFIRMED | `view-security-invoker` | Exposed views must be created with WITH (security_invoker = true). |

## Experiment eligibility

- Facts in the primary experiment: 34
- Unconfirmed facts: F-14
- Proposed facts: none
- Dropped facts retained only for historical ID validation: F-28, F-29, F-33, F-35
