// scripts/oracle.ts
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { FACT_BY_ID, FACT_STATEMENTS } from './facts.js';

export interface MigrationMeta {
  table: string;
  tenant: boolean;
  append_only: boolean;
  ingestion: boolean;
  targetFact?: string;
  mutationDescription?: string;
  latest_per_key?: boolean;
  status?: boolean;
  sec_definer?: boolean;
  view?: boolean;
  expectedFailedFacts?: string[];
}

export interface OracleReport {
  pass: boolean;
  failedFacts: string[];
  details: string;
  failureDetails?: string[];
  migrationExitNonZero?: boolean;
}

export function parseMigrationMeta(sql: string, filePath: string): MigrationMeta {
  const match = sql.match(/^--\s*META:\s*(\{.*\})/m);
  if (match) {
    const meta = JSON.parse(match[1]) as MigrationMeta;
    if (meta.targetFact && !FACT_BY_ID.has(meta.targetFact)) {
      throw new Error(`Unknown targetFact ${meta.targetFact} in ${filePath}`);
    }
    return meta;
  }
  const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z0-9_]+)/i);
  const table = tableMatch ? tableMatch[1] : path.basename(filePath, '.sql');
  return {
    table,
    tenant: /tenant_id/i.test(sql),
    append_only: /reject_mutation|audit_log/i.test(sql),
    ingestion: /idempotency_key/i.test(sql),
  };
}

function runPsqlInContainer(
  containerName: string,
  database: string,
  sqlInput: string
): { status: number | null; stdout: string; stderr: string } {
  const proc = spawnSync(
    'docker',
    ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', database, '-X', '-q'],
    {
      input: sqlInput,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  return {
    status: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
  };
}

export function startPostgresContainer(
  containerName: string,
  seedFilePath = path.resolve('fixtures/task-v2/seed.sql')
): void {
  try {
    execFileSync('docker', ['rm', '-f', containerName], { stdio: 'pipe' });
  } catch {
    // ignore if not present
  }

  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-e',
      'POSTGRES_PASSWORD=oracle',
      'postgres:16',
    ],
    { stdio: 'pipe' }
  );

  for (let i = 0; i < 60; i++) {
    try {
      const logs = execFileSync('docker', ['logs', containerName], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const readyCount = (logs.match(/ready to accept connections/g) || []).length;
      if (readyCount >= 2) {
        break;
      }
    } catch {
      // wait
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);

  // Fast-path isolation setup: create template_axiom and apply seed.sql once
  const seedSql = fs.readFileSync(seedFilePath, 'utf-8');
  const createTemplateRes = runPsqlInContainer(
    containerName,
    'postgres',
    '\\set ON_ERROR_STOP on\nDROP DATABASE IF EXISTS template_axiom WITH (FORCE);\nCREATE DATABASE template_axiom;\n'
  );
  if (createTemplateRes.status !== 0) {
    throw new Error(`Failed to create template_axiom: ${createTemplateRes.stderr}`);
  }

  const seedTemplateRes = runPsqlInContainer(
    containerName,
    'template_axiom',
    `\\set ON_ERROR_STOP on\n${seedSql}\n`
  );
  if (seedTemplateRes.status !== 0) {
    throw new Error(`Failed to seed template_axiom: ${seedTemplateRes.stderr}`);
  }
}

export function stopPostgresContainer(containerName: string): void {
  try {
    execFileSync('docker', ['stop', containerName], { stdio: 'pipe' });
  } catch {
    // ignore if already stopped
  }
}

function buildOracleProbeSql(meta: MigrationMeta): string {
  const t = meta.table;
  const isTenant = meta.tenant ? 'true' : 'false';
  const isAppendOnly = meta.append_only ? 'true' : 'false';
  const isIngestion = meta.ingestion ? 'true' : 'false';
  const isLatestPerKey = meta.latest_per_key ? 'true' : 'false';
  const isStatus = meta.status ? 'true' : 'false';
  const isSecDefiner = meta.sec_definer ? 'true' : 'false';
  const isView = meta.view ? 'true' : 'false';

  return `
-- 1. Run deterministic structural catalog probes + seed rows + F-37 & F-21 probes
DO $ORACLE$
DECLARE
  v_table text := '${t}';
  v_tenant boolean := ${isTenant};
  v_append_only boolean := ${isAppendOnly};
  v_ingestion boolean := ${isIngestion};
  v_latest_per_key boolean := ${isLatestPerKey};
  v_status boolean := ${isStatus};
  v_sec_definer boolean := ${isSecDefiner};
  v_view boolean := ${isView};
  v_relid oid;
  v_cnt int;
  v_rec record;
  v_cols text[];
  v_vals_a text[];
  v_vals_b text[];
  v_col_val_a text;
  v_col_val_b text;
  v_enum_lit text;
  v_id_a uuid;
  v_id_b uuid;
  v_received timestamptz;
  v_updated timestamptz;
BEGIN
  -- F-13: Table must exist in public schema, match snake_case plural (or allowed _audit noun)
  SELECT c.oid INTO v_relid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = v_table;

  IF v_relid IS NULL OR NOT (v_table ~ '^[a-z]+(_[a-z]+)*s$' OR v_table = 'schema_migrations_audit') THEN
    RAISE NOTICE 'FACT_FAIL|F-13';
    RETURN;
  END IF;

  -- F-01 (Universal): id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  JOIN pg_constraint c ON c.conrelid = a.attrelid AND c.contype = 'p' AND a.attnum = ANY(c.conkey)
  WHERE a.attrelid = v_relid
    AND a.attname = 'id'
    AND a.atttypid = 'uuid'::regtype
    AND a.attnotnull = true
    AND pg_get_expr(d.adbin, d.adrelid) LIKE '%gen_random_uuid()%';
  IF v_cnt = 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-01';
  END IF;

  -- F-02 (tenant = true): tenant_id uuid NOT NULL
  IF v_tenant THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    WHERE a.attrelid = v_relid
      AND a.attname = 'tenant_id'
      AND a.atttypid = 'uuid'::regtype
      AND a.attnotnull = true;
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-02';
    END IF;
  END IF;

  -- F-03 (Universal): All foreign keys must use ON DELETE RESTRICT (confdeltype = 'r')
  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  WHERE c.conrelid = v_relid AND c.contype = 'f' AND c.confdeltype <> 'r';
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-03';
  END IF;

  -- F-04 (Universal): No float4, float8, or money columns
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
    AND a.atttypid IN ('float4'::regtype, 'float8'::regtype, 'money'::regtype);
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-04';
  END IF;

  -- F-05 (Universal): created_at timestamptz NOT NULL DEFAULT now()
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = v_relid
    AND a.attname = 'created_at'
    AND a.atttypid = 'timestamptz'::regtype
    AND a.attnotnull = true
    AND (pg_get_expr(d.adbin, d.adrelid) ILIKE '%now()%' OR pg_get_expr(d.adbin, d.adrelid) ILIKE '%current_timestamp%');
  IF v_cnt = 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-05';
  END IF;

  -- F-06 (append_only = false): updated_at timestamptz NOT NULL DEFAULT now()
  IF NOT v_append_only THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = v_relid
      AND a.attname = 'updated_at'
      AND a.atttypid = 'timestamptz'::regtype
      AND a.attnotnull = true
      AND (pg_get_expr(d.adbin, d.adrelid) ILIKE '%now()%' OR pg_get_expr(d.adbin, d.adrelid) ILIKE '%current_timestamp%');
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-06';
    END IF;
  END IF;

  -- F-07 (Universal): No timestamp without time zone columns
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
    AND a.atttypid = 'timestamp'::regtype;
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-07';
  END IF;

  -- F-08 (Universal): No varchar or char(n) columns
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
    AND a.atttypid IN ('varchar'::regtype, 'bpchar'::regtype);
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-08';
  END IF;

  -- F-09 (ingestion = true): No json columns; ingestion tables require payload jsonb NOT NULL
  IF v_ingestion THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid = 'json'::regtype;
    IF v_cnt > 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-09';
    ELSE
      SELECT count(*) INTO v_cnt
      FROM pg_attribute a
      WHERE a.attrelid = v_relid AND a.attname = 'payload' AND a.atttypid = 'jsonb'::regtype AND a.attnotnull = true;
      IF v_cnt = 0 THEN
        RAISE NOTICE 'FACT_FAIL|F-09';
      END IF;
    END IF;
  END IF;

  -- F-10 (append_only = false): deleted_at nullable timestamptz on mutable tables
  IF NOT v_append_only THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    WHERE a.attrelid = v_relid
      AND a.attname = 'deleted_at'
      AND a.atttypid = 'timestamptz'::regtype
      AND a.attnotnull = false;
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-10';
    END IF;
  END IF;

  -- F-11 (Universal): IP columns must use inet
  SELECT count(*) INTO v_cnt
  FROM pg_attribute a
  WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
    AND (a.attname IN ('ip_address', 'client_ip') OR a.attname LIKE '%\\_ip')
    AND a.atttypid <> 'inet'::regtype;
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-11';
  END IF;

  -- F-12 (status = true): Status or state columns must be text NOT NULL validated by a CHECK (col IN (...)) constraint
  IF v_status THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
      AND (
        a.attname IN ('status', 'state', 'billing_state', 'delivery_status', 'batch_status', 'sync_status', 'decision', 'verification_status')
        OR a.attname LIKE '%_status'
        OR a.attname LIKE '%_state'
      )
      AND a.attname NOT IN ('http_status', 'status_code');
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-12';
    ELSE
      FOR v_rec IN
        SELECT a.attname, a.atttypid, a.attnotnull
        FROM pg_attribute a
        WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
          AND (
            a.attname IN ('status', 'state', 'billing_state', 'delivery_status', 'batch_status', 'sync_status', 'decision', 'verification_status')
            OR a.attname LIKE '%_status'
            OR a.attname LIKE '%_state'
          )
          AND a.attname NOT IN ('http_status', 'status_code')
      LOOP
        IF v_rec.atttypid <> 'text'::regtype OR NOT v_rec.attnotnull THEN
          RAISE NOTICE 'FACT_FAIL|F-12';
          EXIT;
        END IF;

        SELECT count(*) INTO v_cnt
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = v_relid AND c.contype = 'c' AND a.attname = v_rec.attname;

        IF v_cnt = 0 THEN
          RAISE NOTICE 'FACT_FAIL|F-12';
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- F-15 (Universal): FK columns named <singular_ref_table>_id (or role-qualified _<singular_ref_table>_id / supersedes_id)
  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class rc ON rc.oid = c.confrelid
  WHERE c.conrelid = v_relid AND c.contype = 'f'
    AND NOT (
      (c.confrelid = v_relid AND a.attname = 'supersedes_id')
      OR a.attname = (regexp_replace(rc.relname, 's$', '') || '_id')
      OR a.attname LIKE ('%_' || regexp_replace(rc.relname, 's$', '') || '_id')
      OR (rc.relname = 'users' AND a.attname = 'assignee_id')
    );
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-15';
  END IF;

  -- F-16 (Universal): FK constraints named fk_<table>_<column>
  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.conrelid = v_relid AND c.contype = 'f'
    AND c.conname <> ('fk_' || v_table || '_' || a.attname);
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-16';
  END IF;

  -- F-17 (Universal): CHECK constraints named chk_<table>_<column>
  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.conrelid = v_relid AND c.contype = 'c'
    AND c.conname <> ('chk_' || v_table || '_' || a.attname);
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-17';
  END IF;

  -- F-18 (Universal): Non-constraint indexes named idx_<table>_<col1>[_<col2>...]
  FOR v_rec IN
    SELECT i.indexrelid, ic.relname AS idx_name,
           (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
            WHERE k.attnum > 0) AS col_suffix
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE i.indrelid = v_relid
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
  LOOP
    IF v_rec.idx_name <> ('idx_' || v_table || '_' || v_rec.col_suffix) THEN
      RAISE NOTICE 'FACT_FAIL|F-18';
      EXIT;
    END IF;
  END LOOP;

  -- F-19 (append_only = true): Privileges check across PUBLIC, readonly_user, application
  IF v_append_only THEN
    IF has_table_privilege('public', v_relid, 'UPDATE')
       OR has_table_privilege('public', v_relid, 'DELETE')
       OR has_table_privilege('public', v_relid, 'TRUNCATE')
       OR has_table_privilege('readonly_user', v_relid, 'UPDATE')
       OR has_table_privilege('readonly_user', v_relid, 'DELETE')
       OR has_table_privilege('readonly_user', v_relid, 'TRUNCATE')
       OR has_table_privilege('application', v_relid, 'UPDATE')
       OR has_table_privilege('application', v_relid, 'DELETE')
       OR has_table_privilege('application', v_relid, 'TRUNCATE')
       OR NOT has_table_privilege('readonly_user', v_relid, 'SELECT')
       OR NOT has_table_privilege('application', v_relid, 'SELECT')
       OR NOT has_table_privilege('application', v_relid, 'INSERT')
    THEN
      RAISE NOTICE 'FACT_FAIL|F-19';
    END IF;
  END IF;

  -- F-22 (Universal): Every FK column is the leading column (indkey[0]) of an index
  SELECT count(*) INTO v_cnt
  FROM pg_constraint c
  WHERE c.conrelid = v_relid AND c.contype = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = v_relid AND i.indkey[0] = c.conkey[1]
    );
  IF v_cnt > 0 THEN
    RAISE NOTICE 'FACT_FAIL|F-22';
  END IF;

  -- F-23 (tenant = true): tenant_id is the leading column of an index
  IF v_tenant THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    JOIN pg_index i ON i.indrelid = a.attrelid AND i.indkey[0] = a.attnum
    WHERE a.attrelid = v_relid AND a.attname = 'tenant_id';
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-23';
    END IF;
  END IF;

  -- F-24 (tenant = true AND append_only = false): Any standalone non-constraint unique index on a soft-deletable table must filter WHERE deleted_at IS NULL
  IF v_tenant AND NOT v_append_only THEN
    SELECT count(*) INTO v_cnt
    FROM pg_index i
    WHERE i.indrelid = v_relid
      AND i.indisunique = true
      AND NOT i.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (i.indpred IS NULL OR pg_get_expr(i.indpred, i.indrelid) NOT ILIKE '%deleted_at IS NULL%');
    IF v_cnt > 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-24';
    END IF;
  END IF;

  -- F-25 (tenant = true): ENABLE and FORCE ROW LEVEL SECURITY
  IF v_tenant THEN
    SELECT count(*) INTO v_cnt
    FROM pg_class c
    WHERE c.oid = v_relid AND c.relrowsecurity = true AND c.relforcerowsecurity = true;
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-25';
    END IF;
  END IF;

  -- F-27 (append_only = true): No FOR UPDATE / FOR DELETE / FOR ALL policies on append-only tables
  IF v_append_only THEN
    SELECT count(*) INTO v_cnt
    FROM pg_policy p
    WHERE p.polrelid = v_relid AND p.polcmd IN ('w', 'd', '*');
    IF v_cnt > 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-27';
    END IF;
  END IF;

  -- F-30 (tenant = true): No tautological USING (true) or WITH CHECK (true) on write policies
  IF v_tenant THEN
    SELECT count(*) INTO v_cnt
    FROM pg_policy p
    WHERE p.polrelid = v_relid AND p.polcmd IN ('a', 'w', '*')
      AND (btrim(pg_get_expr(p.polqual, p.polrelid)) = 'true'
           OR btrim(pg_get_expr(p.polwithcheck, p.polrelid)) = 'true');
    IF v_cnt > 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-30';
    END IF;
  END IF;

  -- F-31 (sec_definer = true): Functions declared SECURITY DEFINER must set search_path = ''
  IF v_sec_definer THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND (p.proconfig IS NULL
             OR NOT ('search_path=""' = ANY(p.proconfig)))
    ) THEN
      RAISE NOTICE 'FACT_FAIL|F-31';
    END IF;
  END IF;

  -- F-32 (ingestion = true): UNIQUE constraint on idempotency_key (and tenant_id if tenant)
  IF v_ingestion THEN
    SELECT count(*) INTO v_cnt
    FROM pg_constraint c
    WHERE c.conrelid = v_relid AND c.contype = 'u'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = v_relid AND a.attname = 'idempotency_key' AND a.attnum = ANY(c.conkey)
      )
      AND (NOT v_tenant OR EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = v_relid AND a.attname = 'tenant_id' AND a.attnum = ANY(c.conkey)
      ));
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-32';
    END IF;
  END IF;

  -- F-34 (ingestion = true / counter columns): Any *_count or *_quota column must have a CHECK (<col> >= 0) constraint
  IF v_ingestion THEN
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
        AND (a.attname LIKE '%\\_count' OR a.attname LIKE '%\\_quota')
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = v_relid AND c.contype = 'c'
            AND a.attnum = ANY(c.conkey)
            AND (pg_get_constraintdef(c.oid) LIKE '%>= 0%' OR pg_get_constraintdef(c.oid) LIKE '%> 0%')
        )
    ) THEN
      RAISE NOTICE 'FACT_FAIL|F-34';
    END IF;
  END IF;

  -- F-36 (append_only = true): Append-only tables require nullable supersedes_id uuid self-FK ON DELETE RESTRICT
  IF v_append_only THEN
    SELECT count(*) INTO v_cnt
    FROM pg_attribute a
    JOIN pg_constraint c ON c.conrelid = a.attrelid AND c.contype = 'f' AND a.attnum = c.conkey[1]
    WHERE a.attrelid = v_relid
      AND a.attname = 'supersedes_id'
      AND a.atttypid = 'uuid'::regtype
      AND a.attnotnull = false
      AND c.confrelid = v_relid
      AND c.confdeltype = 'r';
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-36';
    END IF;
  END IF;

  -- F-38: Observation tables flagged latest_per_key must define a composite B-tree index on (<key>, observed_at DESC)
  IF v_latest_per_key THEN
    SELECT count(*) INTO v_cnt
    FROM pg_index i
    JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = i.indkey[1] AND a2.attname = 'observed_at'
    WHERE i.indrelid = v_relid
      AND (i.indoption[1] & 1) = 1;
    IF v_cnt = 0 THEN
      RAISE NOTICE 'FACT_FAIL|F-38';
    END IF;
  END IF;

  -- F-39 (view = true): Dynamically check pg_depend / pg_rewrite for any view depending on v_relid with security_invoker = true
  IF v_view THEN
    SELECT count(*) INTO v_cnt
    FROM pg_class vc
    JOIN pg_namespace vn ON vn.oid = vc.relnamespace
    WHERE vn.nspname = 'public'
      AND vc.relkind = 'v'
      AND EXISTS (
        SELECT 1
        FROM pg_rewrite rw
        JOIN pg_depend d ON d.objid = rw.oid
        WHERE rw.ev_class = vc.oid
          AND d.refobjid = v_relid
      )
      AND vc.reloptions IS NOT NULL
      AND (
        'security_invoker=true' = ANY(vc.reloptions)
        OR 'security_invoker=on' = ANY(vc.reloptions)
        OR 'security_invoker=1' = ANY(vc.reloptions)
      );
    IF v_cnt = 0 OR EXISTS (
      SELECT 1
      FROM pg_class vc
      JOIN pg_namespace vn ON vn.oid = vc.relnamespace
      WHERE vn.nspname = 'public'
        AND vc.relkind = 'v'
        AND EXISTS (
          SELECT 1
          FROM pg_rewrite rw
          JOIN pg_depend d ON d.objid = rw.oid
          WHERE rw.ev_class = vc.oid
            AND d.refobjid = v_relid
        )
        AND (
          vc.reloptions IS NULL
          OR NOT (
            'security_invoker=true' = ANY(vc.reloptions)
            OR 'security_invoker=on' = ANY(vc.reloptions)
            OR 'security_invoker=1' = ANY(vc.reloptions)
          )
        )
    ) THEN
      RAISE NOTICE 'FACT_FAIL|F-39';
    END IF;
  END IF;

  -- =========================================================================
  -- Behavioral Probes Setup: Seed Row A and Row B
  -- =========================================================================
  v_cols := ARRAY['id'];
  v_id_a := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
  v_id_b := 'bbbbbbbb-0000-0000-0000-000000000002'::uuid;
  v_vals_a := ARRAY[quote_literal(v_id_a) || '::uuid'];
  v_vals_b := ARRAY[quote_literal(v_id_b) || '::uuid'];

  FOR v_rec IN
    SELECT a.attname, a.atttypid, format_type(a.atttypid, a.atttypmod) AS typname, a.attnotnull,
           (SELECT pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            WHERE c.conrelid = a.attrelid AND c.contype = 'c' AND a.attnum = ANY(c.conkey)
            LIMIT 1) AS chk_def
    FROM pg_attribute a
    WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> 'id'
    ORDER BY a.attnum
  LOOP
    IF v_rec.attname IN ('deleted_at', 'supersedes_id') THEN
      CONTINUE;
    END IF;

    v_cols := array_append(v_cols, quote_ident(v_rec.attname));

    IF v_rec.attname = 'tenant_id' THEN
      v_col_val_a := quote_literal('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') || '::uuid';
      v_col_val_b := quote_literal('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') || '::uuid';
    ELSIF v_rec.attname = 'customer_id' THEN
      v_col_val_a := quote_literal('33333333-3333-3333-3333-333333333333') || '::uuid';
      v_col_val_b := quote_literal('44444444-4444-4444-4444-444444444444') || '::uuid';
    ELSIF v_rec.attname IN ('user_id', 'owner_user_id', 'assignee_id', 'actor_user_id', 'approver_user_id') THEN
      v_col_val_a := quote_literal('11111111-1111-1111-1111-111111111111') || '::uuid';
      v_col_val_b := quote_literal('22222222-2222-2222-2222-222222222222') || '::uuid';
    ELSIF v_rec.attname = 'received_at' THEN
      v_col_val_a := quote_literal('2000-01-01T00:00:00Z') || '::timestamptz';
      v_col_val_b := quote_literal('2000-01-01T00:00:00Z') || '::timestamptz';
    ELSIF v_rec.attname = 'updated_at' THEN
      v_col_val_a := quote_literal('2020-01-01T00:00:00Z') || '::timestamptz';
      v_col_val_b := quote_literal('2020-01-01T00:00:00Z') || '::timestamptz';
    ELSIF v_rec.attname = 'created_at' THEN
      v_col_val_a := 'now()';
      v_col_val_b := 'now()';
    ELSIF v_rec.atttypid = 'uuid'::regtype THEN
      v_col_val_a := 'gen_random_uuid()';
      v_col_val_b := 'gen_random_uuid()';
    ELSIF v_rec.atttypid = 'inet'::regtype THEN
      v_col_val_a := quote_literal('192.0.2.10') || '::inet';
      v_col_val_b := quote_literal('192.0.2.20') || '::inet';
    ELSIF v_rec.atttypid = 'jsonb'::regtype THEN
      v_col_val_a := quote_literal('{"k":"a"}') || '::jsonb';
      v_col_val_b := quote_literal('{"k":"b"}') || '::jsonb';
    ELSIF v_rec.atttypid = 'json'::regtype THEN
      v_col_val_a := quote_literal('{"k":"a"}') || '::json';
      v_col_val_b := quote_literal('{"k":"b"}') || '::json';
    ELSIF v_rec.atttypid = 'boolean'::regtype THEN
      v_col_val_a := 'true';
      v_col_val_b := 'false';
    ELSIF v_rec.atttypid IN ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype, 'float4'::regtype, 'float8'::regtype) THEN
      IF v_rec.attname = 'key_bits' THEN
        v_col_val_a := '2048';
        v_col_val_b := '4096';
      ELSIF v_rec.attname = 'http_status' THEN
        v_col_val_a := '200';
        v_col_val_b := '201';
      ELSIF v_rec.attname IN ('priority', 'minor_units') THEN
        v_col_val_a := '2';
        v_col_val_b := '3';
      ELSE
        v_col_val_a := '1';
        v_col_val_b := '2';
      END IF;
    ELSE
      v_enum_lit := NULL;
      IF v_rec.chk_def IS NOT NULL THEN
        v_enum_lit := substring(v_rec.chk_def FROM '''([a-zA-Z0-9_-]+)''');
      END IF;
      IF v_enum_lit IS NOT NULL THEN
        v_col_val_a := quote_literal(v_enum_lit);
        v_col_val_b := quote_literal(v_enum_lit);
      ELSIF v_rec.attname LIKE '%iso2%' OR v_rec.attname = 'country_code' THEN
        v_col_val_a := quote_literal('US');
        v_col_val_b := quote_literal('CA');
      ELSIF v_rec.attname LIKE '%currency%' OR v_rec.attname LIKE '%iso3%' THEN
        v_col_val_a := quote_literal('USD');
        v_col_val_b := quote_literal('EUR');
      ELSIF v_rec.attname LIKE '%calling_prefix%' THEN
        v_col_val_a := quote_literal('+1');
        v_col_val_b := quote_literal('+44');
      ELSE
        v_col_val_a := quote_literal('val_a_' || v_rec.attname);
        v_col_val_b := quote_literal('val_b_' || v_rec.attname);
      END IF;
    END IF;

    v_vals_a := array_append(v_vals_a, v_col_val_a);
    v_vals_b := array_append(v_vals_b, v_col_val_b);
  END LOOP;

  -- Seed row A (and row B if tenant) as superuser
  BEGIN
    EXECUTE format('INSERT INTO public.%I (%s) VALUES (%s)',
      v_table, array_to_string(v_cols, ', '), array_to_string(v_vals_a, ', '));
    IF v_tenant THEN
      EXECUTE format('INSERT INTO public.%I (%s) VALUES (%s)',
        v_table, array_to_string(v_cols, ', '), array_to_string(v_vals_b, ', '));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback catalog checks if synthetic row insertion failed due to custom column constraints
    IF v_ingestion THEN
      SELECT count(*) INTO v_cnt
      FROM pg_trigger tg
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE tg.tgrelid = v_relid AND NOT tg.tgisinternal
        AND (tg.tgtype & 2) <> 0 AND (tg.tgtype & 4) <> 0
        AND p.prosrc ILIKE '%received_at%';
      IF v_cnt = 0 THEN
        RAISE NOTICE 'FACT_FAIL|F-37';
      END IF;
    END IF;
    RETURN;
  END;

  -- F-37 Behavioral: verify received_at was overwritten from '2000-01-01' to now()
  IF v_ingestion THEN
    EXECUTE format('SELECT received_at FROM public.%I WHERE id = $1', v_table)
      INTO v_received USING v_id_a;
    IF v_received IS NULL OR v_received < '2025-01-01T00:00:00Z'::timestamptz THEN
      RAISE NOTICE 'FACT_FAIL|F-37';
    END IF;
  END IF;

  -- F-21 Behavioral: verify BEFORE UPDATE trigger advances updated_at on mutable tables
  IF NOT v_append_only THEN
    BEGIN
      EXECUTE format('UPDATE public.%I SET created_at = created_at WHERE id = $1', v_table)
        USING v_id_a;
      EXECUTE format('SELECT updated_at FROM public.%I WHERE id = $1', v_table)
        INTO v_updated USING v_id_a;
      IF v_updated IS NULL OR v_updated < '2025-01-01T00:00:00Z'::timestamptz THEN
        RAISE NOTICE 'FACT_FAIL|F-21';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FACT_FAIL|F-21';
    END;
  END IF;
END
$ORACLE$;

-- 2. F-20 Behavioral Probe wrapped inside SAVEPOINT f20_probe; ... ROLLBACK TO SAVEPOINT f20_probe;
BEGIN;
SAVEPOINT f20_probe;
DO $F20_PROBE$
DECLARE
  v_table text := '${t}';
  v_append_only boolean := ${isAppendOnly};
  v_id_a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
  v_relid oid;
  v_cnt int;
  v_err_msg text;
BEGIN
  IF v_append_only THEN
    SELECT c.oid INTO v_relid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = v_table;

    IF v_relid IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1', v_table) INTO v_cnt USING v_id_a;
      IF v_cnt > 0 THEN
        v_err_msg := '';
        BEGIN
          EXECUTE format('UPDATE public.%I SET created_at = now() WHERE id = $1', v_table) USING v_id_a;
        EXCEPTION WHEN OTHERS THEN
          v_err_msg := SQLERRM;
        END;
        IF v_err_msg <> 'Update/Delete operation rejected on audit log' THEN
          RAISE NOTICE 'FACT_FAIL|F-20';
        ELSE
          v_err_msg := '';
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING v_id_a;
          EXCEPTION WHEN OTHERS THEN
            v_err_msg := SQLERRM;
          END;
          IF v_err_msg <> 'Update/Delete operation rejected on audit log' THEN
            RAISE NOTICE 'FACT_FAIL|F-20';
          END IF;
        END IF;
      ELSE
        SELECT count(*) INTO v_cnt
        FROM pg_trigger tg
        JOIN pg_proc p ON p.oid = tg.tgfoid
        WHERE tg.tgrelid = v_relid AND NOT tg.tgisinternal
          AND (tg.tgtype & 2) <> 0
          AND (tg.tgtype & 16) <> 0
          AND (tg.tgtype & 8) <> 0
          AND p.prosrc LIKE '%Update/Delete operation rejected on audit log%';
        IF v_cnt = 0 THEN
          RAISE NOTICE 'FACT_FAIL|F-20';
        END IF;
      END IF;
    END IF;
  END IF;
END
$F20_PROBE$;
ROLLBACK TO SAVEPOINT f20_probe;
COMMIT;

-- 3. F-26 Behavioral Probe (runs after ROLLBACK TO SAVEPOINT f20_probe so test rows are guaranteed intact)
BEGIN;
SAVEPOINT f26_probe;
DO $F26_PROBE$
DECLARE
  v_table text := '${t}';
  v_tenant boolean := ${isTenant};
  v_id_a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
  v_id_b uuid := 'bbbbbbbb-0000-0000-0000-000000000002'::uuid;
  v_append_only boolean := ${isAppendOnly};
  v_relid oid;
  v_cnt int;
  v_err_state text;
  v_err_msg text;
  v_row_count int;
  v_rec record;
  v_cols text[];
  v_vals_b text[];
  v_col_val_b text;
  v_enum_lit text;
BEGIN
  IF v_tenant THEN
    SELECT c.oid INTO v_relid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = v_table;

    IF v_relid IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1', v_table) INTO v_cnt USING v_id_a;
      IF v_cnt > 0 THEN
        v_cols := ARRAY['id'];
        v_vals_b := ARRAY[quote_literal('cccccccc-0000-0000-0000-000000000003') || '::uuid'];

        FOR v_rec IN
          SELECT a.attname, a.atttypid,
                 (SELECT pg_get_constraintdef(c.oid)
                  FROM pg_constraint c
                  WHERE c.conrelid = a.attrelid AND c.contype = 'c' AND a.attnum = ANY(c.conkey)
                  LIMIT 1) AS chk_def
          FROM pg_attribute a
          WHERE a.attrelid = v_relid AND a.attnum > 0 AND NOT a.attisdropped
            AND a.attname <> 'id'
          ORDER BY a.attnum
        LOOP
          IF v_rec.attname IN ('deleted_at', 'supersedes_id') THEN
            CONTINUE;
          END IF;
          v_cols := array_append(v_cols, quote_ident(v_rec.attname));
          IF v_rec.attname = 'tenant_id' THEN
            v_col_val_b := quote_literal('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') || '::uuid';
          ELSIF v_rec.attname = 'customer_id' THEN
            v_col_val_b := quote_literal('44444444-4444-4444-4444-444444444444') || '::uuid';
          ELSIF v_rec.attname IN ('user_id', 'owner_user_id', 'assignee_id', 'actor_user_id', 'approver_user_id') THEN
            v_col_val_b := quote_literal('22222222-2222-2222-2222-222222222222') || '::uuid';
          ELSIF v_rec.attname IN ('received_at', 'updated_at', 'created_at') THEN
            v_col_val_b := 'now()';
          ELSIF v_rec.atttypid = 'uuid'::regtype THEN
            v_col_val_b := 'gen_random_uuid()';
          ELSIF v_rec.atttypid = 'inet'::regtype THEN
            v_col_val_b := quote_literal('192.0.2.20') || '::inet';
          ELSIF v_rec.atttypid = 'jsonb'::regtype THEN
            v_col_val_b := quote_literal('{"k":"b"}') || '::jsonb';
          ELSIF v_rec.atttypid = 'json'::regtype THEN
            v_col_val_b := quote_literal('{"k":"b"}') || '::json';
          ELSIF v_rec.atttypid = 'boolean'::regtype THEN
            v_col_val_b := 'false';
          ELSIF v_rec.atttypid IN ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype, 'float4'::regtype, 'float8'::regtype) THEN
            IF v_rec.attname = 'key_bits' THEN
              v_col_val_b := '4096';
            ELSIF v_rec.attname = 'http_status' THEN
              v_col_val_b := '201';
            ELSIF v_rec.attname IN ('priority', 'minor_units') THEN
              v_col_val_b := '3';
            ELSE
              v_col_val_b := '2';
            END IF;
          ELSE
            v_enum_lit := NULL;
            IF v_rec.chk_def IS NOT NULL THEN
              v_enum_lit := substring(v_rec.chk_def FROM '''([a-zA-Z0-9_-]+)''');
            END IF;
            IF v_enum_lit IS NOT NULL THEN
              v_col_val_b := quote_literal(v_enum_lit);
            ELSIF v_rec.attname LIKE '%iso2%' OR v_rec.attname = 'country_code' THEN
              v_col_val_b := quote_literal('CA');
            ELSIF v_rec.attname LIKE '%currency%' OR v_rec.attname LIKE '%iso3%' THEN
              v_col_val_b := quote_literal('EUR');
            ELSIF v_rec.attname LIKE '%calling_prefix%' THEN
              v_col_val_b := quote_literal('+44');
            ELSE
              v_col_val_b := quote_literal('val_c_' || v_rec.attname);
            END IF;
          END IF;
          v_vals_b := array_append(v_vals_b, v_col_val_b);
        END LOOP;

        BEGIN
          EXECUTE 'SET LOCAL ROLE application';
          PERFORM set_config('request.jwt.claims', '{"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', true);
          EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_cnt;
          IF v_cnt <> 1 THEN
            RESET ROLE;
            RAISE NOTICE 'FACT_FAIL|F-26|COUNT|ROW_COUNT|expected one tenant row';
          ELSE
            v_err_state := '';
            v_vals_b[array_position(v_cols, 'tenant_id')] :=
              quote_literal('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') || '::uuid';
            BEGIN
              EXECUTE format(
                'INSERT INTO public.%I (%s) VALUES (%s)',
                v_table,
                array_to_string(v_cols, ', '),
                array_to_string(v_vals_b, ', ')
              );
            EXCEPTION WHEN OTHERS THEN
              v_err_state := SQLSTATE;
              v_err_msg := SQLERRM;
            END;

            IF v_err_state = '42501' THEN
              RESET ROLE;
              RAISE NOTICE 'FACT_FAIL|F-26|POS_INSERT|%|%', v_err_state, v_err_msg;
            ELSE
              v_vals_b[array_position(v_cols, 'tenant_id')] :=
                quote_literal('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') || '::uuid';
              v_err_state := '';
              BEGIN
                EXECUTE format(
                  'INSERT INTO public.%I (%s) VALUES (%s)',
                  v_table,
                  array_to_string(v_cols, ', '),
                  array_to_string(v_vals_b, ', ')
                );
              EXCEPTION WHEN OTHERS THEN
                v_err_state := SQLSTATE;
                v_err_msg := SQLERRM;
              END;
              IF v_err_state <> '42501' OR v_err_msg NOT ILIKE '%row-level security%' THEN
                RESET ROLE;
                RAISE NOTICE 'FACT_FAIL|F-26|NEG_INSERT|%|%', v_err_state, v_err_msg;
              ELSE
                v_vals_b[array_position(v_cols, 'tenant_id')] :=
                  quote_literal('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') || '::uuid';
                v_err_state := '';
                v_err_msg := '';
                IF NOT v_append_only THEN
                  BEGIN
                    EXECUTE format(
                      'UPDATE public.%I SET created_at = created_at WHERE id = $1',
                      v_table
                    ) USING 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
                    GET DIAGNOSTICS v_row_count = ROW_COUNT;
                    IF v_row_count = 0 THEN
                      v_err_state := 'NO_POSITIVE_UPDATE';
                      v_err_msg := 'positive update matched no row';
                    END IF;
                    IF v_err_state = '' THEN
                      EXECUTE format(
                        'UPDATE public.%I SET created_at = created_at WHERE id = $1',
                        v_table
                      ) USING v_id_b;
                      GET DIAGNOSTICS v_row_count = ROW_COUNT;
                      IF v_row_count > 0 THEN
                        v_err_state := 'NEGATIVE_UPDATE_ALLOWED';
                        v_err_msg := 'negative update changed a row';
                      END IF;
                    END IF;
                  EXCEPTION WHEN OTHERS THEN
                    v_err_state := SQLSTATE;
                    v_err_msg := SQLERRM;
                  END;
                END IF;
                IF v_err_state <> '' THEN
                  RESET ROLE;
                  RAISE NOTICE 'FACT_FAIL|F-26|UPDATE|%|%', v_err_state, v_err_msg;
                END IF;
              END IF;
              PERFORM set_config('request.jwt.claims', '{"user_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', true);
              EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_cnt;
              RESET ROLE;
              IF v_cnt <> 0 THEN
                RAISE NOTICE 'FACT_FAIL|F-26|COUNT|ROW_LEAK|count=%', v_cnt;
              END IF;
            END IF;
          END IF;
          RESET ROLE;
        EXCEPTION WHEN OTHERS THEN
          RESET ROLE;
          RAISE NOTICE 'FACT_FAIL|F-26|OUTER|%|%', SQLSTATE, SQLERRM;
        END;
      ELSE
        SELECT count(*) INTO v_cnt
        FROM pg_policy pol
        WHERE pol.polrelid = v_relid
          AND (
            pg_get_expr(pol.polqual, pol.polrelid) ILIKE '%app_metadata%'
            OR pg_get_expr(pol.polwithcheck, pol.polrelid) ILIKE '%app_metadata%'
          )
          AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') NOT ILIKE '%user_metadata%'
          AND COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') NOT ILIKE '%user_metadata%';
        IF v_cnt = 0 THEN
          RAISE NOTICE 'FACT_FAIL|F-26|POLICY_CATALOG||missing app_metadata policy';
        END IF;
      END IF;
    END IF;
  END IF;
END
$F26_PROBE$;
ROLLBACK TO SAVEPOINT f26_probe;
COMMIT;
`;
}

let testDbCounter = 0;

export function evaluateMigrationSqlInContainer(
  containerName: string,
  migrationSql: string,
  meta: MigrationMeta,
  testIdSuffix?: string
): OracleReport {
  testDbCounter++;
  const sanitizedSuffix = (testIdSuffix || `${testDbCounter}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40);
  const dbName = `test_${sanitizedSuffix}_${testDbCounter}`;

  // Create isolated test_<id> database from template_axiom
  const createRes = runPsqlInContainer(
    containerName,
    'postgres',
    `\\set ON_ERROR_STOP on\nDROP DATABASE IF EXISTS ${dbName} WITH (FORCE);\nCREATE DATABASE ${dbName} TEMPLATE template_axiom;\n`
  );
  if (createRes.status !== 0) {
    throw new Error(`Failed to create isolated test DB ${dbName}: ${createRes.stderr}`);
  }

  try {
    // 1. Apply migration as deployer
    const migRes = runPsqlInContainer(
      containerName,
      dbName,
      `\\set ON_ERROR_STOP on\nSET ROLE deployer;\n${migrationSql}\nRESET ROLE;\n`
    );
    const migrationExitNonZero = migRes.status !== 0;

    // 2. Run ALL applicable Oracle structural & behavioral probes (zero cohort slicing)
    const probeSql = buildOracleProbeSql(meta);
    const probeRes = runPsqlInContainer(containerName, dbName, probeSql);
    const combined = `${probeRes.stdout}\n${probeRes.stderr}`;

    const failedSet = new Set<string>();
    const failureDetails: string[] = [];
    for (const line of combined.split(/\r?\n/)) {
      const m = line.match(/FACT_FAIL\|(F-\d{2})(?:\|([^|]*)\|([^|]*)\|(.*))?/);
      if (m && FACT_STATEMENTS[m[1]]) {
        failedSet.add(m[1]);
        if (m[2] !== undefined) {
          failureDetails.push(`${m[1]}: ${m[2]}|${m[3]}|${m[4]}`);
        }
      }
    }

    if (failedSet.size === 0 && probeRes.status !== 0) {
      failedSet.add('F-13');
    }

    const failedFacts = Array.from(failedSet).sort();
    const pass = failedFacts.length === 0;
    // Zero-leakage: details ONLY emits canonical "<factId>: <canonical statement>" lines, never raw psql stderr or SQL
    const details = pass
      ? 'All bound facts passed.'
      : failedFacts.map((f) => `${f}: ${FACT_STATEMENTS[f]}`).join('\n');

    return {
      pass,
      failedFacts,
      details,
      failureDetails,
      migrationExitNonZero,
    };
  } finally {
    // Fast-path cleanup: always drop test_<id> with FORCE
    runPsqlInContainer(
      containerName,
      'postgres',
      `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);\n`
    );
  }
}

export function evaluateMigrationInContainer(
  containerName: string,
  sqlFilePath: string
): OracleReport {
  const migrationSql = fs.readFileSync(sqlFilePath, 'utf-8');
  const meta = parseMigrationMeta(migrationSql, sqlFilePath);
  const baseId = path.basename(sqlFilePath, '.sql');
  return evaluateMigrationSqlInContainer(containerName, migrationSql, meta, baseId);
}

export function evaluateMigrationStandalone(sqlFilePath: string): OracleReport {
  const containerName = `axiom-oracle-${process.pid}-${Date.now()}`;
  startPostgresContainer(containerName);
  try {
    return evaluateMigrationInContainer(containerName, sqlFilePath);
  } finally {
    stopPostgresContainer(containerName);
  }
}

function runValidationSuite() {
  const containerName = `axiom-oracle-suite-${process.pid}`;
  console.log(`Starting persistent postgres:16 container with template_axiom (${containerName})...`);
  startPostgresContainer(containerName);

  try {
    const goodDir = path.resolve('fixtures/task-v2/good');
    const badDir = path.resolve('fixtures/task-v2/bad');

    const goodFiles = fs.readdirSync(goodDir).filter((f) => f.endsWith('.sql')).sort();
    const badFiles = fs.readdirSync(badDir).filter((f) => f.endsWith('.sql')).sort();

    let goodPassed = 0;
    const goodResults: Array<{ file: string; report: OracleReport }> = [];

    for (const file of goodFiles) {
      const fullPath = path.join(goodDir, file);
      const report = evaluateMigrationInContainer(containerName, fullPath);
      if (report.pass) {
        goodPassed++;
      } else {
        console.error(`[GOOD FAIL] ${file}:`, report);
      }
      goodResults.push({ file, report });
    }

    let badKilled = 0;
    let badExactMatch = 0;
    const badResults: Array<{
      file: string;
      expected: string[];
      actual: string[];
      killed: boolean;
      matchedExpected: boolean;
      description?: string;
    }> = [];

    for (const file of badFiles) {
      const fullPath = path.join(badDir, file);
      const sql = fs.readFileSync(fullPath, 'utf-8');
      const meta = parseMigrationMeta(sql, fullPath);
      const expected = meta.expectedFailedFacts || [];
      const report = evaluateMigrationInContainer(containerName, fullPath);

      const killed = !report.pass && report.failedFacts.length > 0;
      const matchedExpected =
        killed && expected.every((ef) => report.failedFacts.includes(ef));

      if (killed) badKilled++;
      if (matchedExpected) {
        badExactMatch++;
      } else {
        console.error(
          `[BAD MISMATCH] ${file}: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(report.failedFacts)}`
        );
      }

      badResults.push({
        file,
        expected,
        actual: report.failedFacts,
        killed,
        matchedExpected,
        description: meta.mutationDescription,
      });
    }

    const summary = {
      timestamp: new Date().toISOString(),
      goodTotal: goodFiles.length,
      goodPassed,
      goodPassRate: `${((goodPassed / goodFiles.length) * 100).toFixed(1)}%`,
      badTotal: badFiles.length,
      badKilled,
      badExactFactMatch: badExactMatch,
      mutationKillRate: `${((badKilled / badFiles.length) * 100).toFixed(1)}%`,
      exactFactMatchRate: `${((badExactMatch / badFiles.length) * 100).toFixed(1)}%`,
      goodResults,
      badResults,
    };

    fs.mkdirSync(path.resolve('out'), { recursive: true });
    fs.writeFileSync(
      path.resolve('out/oracle-validation-report.json'),
      JSON.stringify(summary, null, 2),
      'utf-8'
    );

    console.log(
      JSON.stringify(
        {
          goodTotal: summary.goodTotal,
          goodPassed: summary.goodPassed,
          goodPassRate: summary.goodPassRate,
          badTotal: summary.badTotal,
          badKilled: summary.badKilled,
          badExactFactMatch: summary.badExactFactMatch,
          mutationKillRate: summary.mutationKillRate,
          exactFactMatchRate: summary.exactFactMatchRate,
        },
        null,
        2
      )
    );

    if (goodPassed !== goodFiles.length || badExactMatch !== badFiles.length) {
      process.exitCode = 1;
    }
  } finally {
    stopPostgresContainer(containerName);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('oracle.ts')) {
  const arg = process.argv[2];
  if (!arg || arg === '--validate-all') {
    runValidationSuite();
  } else {
    const report = evaluateMigrationStandalone(path.resolve(arg));
    console.log(JSON.stringify(report, null, 2));
    if (!report.pass) {
      process.exitCode = 1;
    }
  }
}
