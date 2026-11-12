// scripts/analysis-v3-prep/statement-sufficiency-pilot.ts
// Item 5: Statement-sufficiency pilot on 10 Train tasks (read-only analysis).
// Synthesizes PostgreSQL DDL STRICTLY from fixtures/task-v2/facts.json statements
// + non-solution task metadata (id, table, prompt, features, applicableFacts).
// NEVER reads or accesses task.goldenSql. Zero LLM calls.

import fs from 'node:fs';
import path from 'node:path';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
  type MigrationMeta,
} from '../oracle.js';
import { FACT_STATEMENTS } from '../facts.js';

interface TaskMetadataOnly {
  id: string;
  split: string;
  table: string;
  prompt: string;
  features: {
    tenant: boolean;
    append_only: boolean;
    ingestion: boolean;
    status?: boolean;
    view?: boolean;
    sec_definer?: boolean;
    latest_per_key?: boolean;
  };
  applicableFacts: string[];
  boundFacts: string[];
}

interface PromptColSpec {
  name: string;
  typeSql: string;
  checkSql?: string;
  fkRefTable?: 'tenants' | 'users' | 'customers';
  uniqueKey?: boolean;
}

/**
 * Extracts domain columns strictly from task.prompt + task.features + literal facts.json statements.
 * Zero access to goldenSql or oracle.ts probe internals.
 */
function synthesizeStatementOnlySql(
  task: TaskMetadataOnly,
  options?: {
    overrideUserFkCol?: string;
    extraLatestPerKeyCompositeName?: string;
    singularPartialUniqueName?: boolean;
    revokeAllPublicNoGrant?: boolean;
  }
): string {
  const t = task.table;
  const f = task.features;
  const app = new Set(task.applicableFacts);
  const cols: string[] = [];
  const tableConstraints: string[] = [];
  const indexes: string[] = [];
  const postStatements: string[] = [];

  // F-01: Primary key column id must be uuid NOT NULL with default gen_random_uuid().
  cols.push(`id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`);

  // F-02: Multi-tenant tables must include tenant_id uuid NOT NULL.
  // F-03: Every foreign key constraint must use ON DELETE RESTRICT.
  // F-16: Foreign key constraints must be named fk_<table>_<column>.
  if (f.tenant || app.has('F-02')) {
    cols.push(`tenant_id uuid NOT NULL`);
    tableConstraints.push(
      `CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT`
    );
  }

  // F-36 LITERAL statement:
  // "Append-only tables must include a nullable self-referential foreign key supersedes_id uuid REFERENCES <table>(id) ON DELETE RESTRICT."
  // Because F-36 literally specifies inline REFERENCES syntax, a generator following statement text emits it inline here:
  if (f.append_only || app.has('F-36')) {
    cols.push(`supersedes_id uuid REFERENCES public.${t}(id) ON DELETE RESTRICT`);
  }

  // Extract domain attributes strictly from prompt wording
  const p = task.prompt.toLowerCase();
  const domainCols: PromptColSpec[] = [];

  if (p.includes('customer reference')) {
    domainCols.push({ name: 'customer_id', typeSql: 'uuid NOT NULL', fkRefTable: 'customers' });
  }
  if (p.includes('user reference')) {
    const userCol = options?.overrideUserFkCol ?? 'user_id';
    domainCols.push({ name: userCol, typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  }
  if (p.includes('currency pair')) {
    domainCols.push({ name: 'currency_pair', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('currency code')) {
    domainCols.push({ name: 'currency_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('display name')) {
    domainCols.push({ name: 'display_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('minor units')) {
    domainCols.push({
      name: 'minor_units',
      typeSql: 'integer NOT NULL',
      checkSql: 'minor_units >= 0 AND minor_units <= 8',
    });
  }
  if (p.includes('spot rate')) {
    domainCols.push({ name: 'spot_rate', typeSql: 'numeric NOT NULL', checkSql: 'spot_rate >= 0' });
  }
  if (p.includes('sample count')) {
    domainCols.push({ name: 'sample_count', typeSql: 'integer NOT NULL', checkSql: 'sample_count >= 0' });
  }
  if (p.includes('source provider')) {
    domainCols.push({ name: 'source_provider', typeSql: 'text NOT NULL' });
  }
  if (p.includes('gateway name')) {
    domainCols.push({ name: 'gateway_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('action category')) {
    domainCols.push({ name: 'action_category', typeSql: 'text NOT NULL' });
  }
  if (p.includes('account code')) {
    domainCols.push({ name: 'account_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('entry direction')) {
    domainCols.push({
      name: 'entry_direction',
      typeSql: 'text NOT NULL',
      checkSql: `entry_direction IN ('debit', 'credit')`,
    });
  }
  if (p.includes('amount in cents')) {
    domainCols.push({ name: 'amount_cents', typeSql: 'numeric NOT NULL', checkSql: 'amount_cents >= 0' });
  }
  if (p.includes('total amount')) {
    domainCols.push({ name: 'total_amount', typeSql: 'numeric NOT NULL', checkSql: 'total_amount >= 0' });
  }
  if (p.includes('batch code')) {
    domainCols.push({ name: 'batch_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('invoice code')) {
    domainCols.push({ name: 'invoice_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('version code')) {
    domainCols.push({ name: 'version_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('checksum')) {
    domainCols.push({ name: 'checksum', typeSql: 'text NOT NULL' });
  }
  if (p.includes('duration ms')) {
    domainCols.push({
      name: 'execution_duration_ms',
      typeSql: 'integer NOT NULL',
      checkSql: 'execution_duration_ms >= 0',
    });
  }
  if (p.includes('autonomous system number')) {
    domainCols.push({ name: 'asn', typeSql: 'integer NOT NULL', checkSql: 'asn >= 0' });
  }

  // F-12: Status or state columns must be text NOT NULL validated by CHECK (col IN (...))
  if (p.includes('delivery status')) {
    domainCols.push({
      name: 'delivery_status',
      typeSql: 'text NOT NULL',
      checkSql: `delivery_status IN ('pending', 'delivered', 'failed')`,
    });
  } else if (p.includes('verification status')) {
    domainCols.push({
      name: 'verification_status',
      typeSql: 'text NOT NULL',
      checkSql: `verification_status IN ('pending', 'verified', 'rejected')`,
    });
  } else if (p.includes('validation state')) {
    domainCols.push({
      name: 'validation_state',
      typeSql: 'text NOT NULL',
      checkSql: `validation_state IN ('pending', 'valid', 'invalid')`,
    });
  } else if (p.includes('announcement status')) {
    domainCols.push({
      name: 'announcement_status',
      typeSql: 'text NOT NULL',
      checkSql: `announcement_status IN ('active', 'withdrawn')`,
    });
  } else if (p.includes('active status')) {
    domainCols.push({
      name: 'status',
      typeSql: 'text NOT NULL',
      checkSql: `status IN ('active', 'inactive')`,
    });
  } else if (/\bstatus\b/.test(p)) {
    domainCols.push({
      name: 'status',
      typeSql: 'text NOT NULL',
      checkSql: `status IN ('draft', 'issued', 'paid', 'void')`,
    });
  }

  // F-11: IP address columns must use inet, never text or varchar.
  if (p.includes('client ip') || p.includes('sender ip')) {
    domainCols.push({
      name: p.includes('sender ip') ? 'sender_ip' : 'client_ip',
      typeSql: 'inet NOT NULL',
    });
  }

  // F-32: Ingestion tables must enforce UNIQUE on idempotency_key (scoped by tenant_id when tenant = true)
  // F-37: Ingestion tables must attach a BEFORE INSERT trigger forcing NEW.received_at = now()
  // F-09: JSON columns must use jsonb NOT NULL, never json.
  if (f.ingestion || app.has('F-32')) {
    domainCols.push({ name: 'idempotency_key', typeSql: 'text NOT NULL' });
    domainCols.push({ name: 'received_at', typeSql: 'timestamptz NOT NULL DEFAULT now()' });
    if (f.tenant) {
      tableConstraints.push(
        `CONSTRAINT uq_${t}_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key)`
      );
    } else {
      tableConstraints.push(`CONSTRAINT uq_${t}_idempotency_key UNIQUE (idempotency_key)`);
    }
  }
  if (p.includes('json payload') || app.has('F-09')) {
    domainCols.push({ name: 'payload', typeSql: `jsonb NOT NULL DEFAULT '{}'::jsonb` });
  }

  if (options?.extraLatestPerKeyCompositeName) {
    domainCols.push({ name: 'metric_key', typeSql: 'text NOT NULL' });
    domainCols.push({ name: 'observed_at', typeSql: 'timestamptz NOT NULL DEFAULT now()' });
  }

  for (const c of domainCols) {
    cols.push(`${c.name} ${c.typeSql}`);
    if (c.checkSql) {
      // F-17: Check constraints must be named chk_<table>_<column>.
      tableConstraints.push(`CONSTRAINT chk_${t}_${c.name} CHECK (${c.checkSql})`);
    }
    if (c.fkRefTable) {
      tableConstraints.push(
        `CONSTRAINT fk_${t}_${c.name} FOREIGN KEY (${c.name}) REFERENCES public.${c.fkRefTable}(id) ON DELETE RESTRICT`
      );
      // F-22: Every foreign key column must be covered as the leading column of an index.
      indexes.push(`CREATE INDEX idx_${t}_${c.name} ON public.${t} (${c.name});`);
    }
    if (c.uniqueKey && !f.append_only) {
      if (f.tenant) {
        // F-24: Unique business keys on soft-deletable mutable tables must use a partial unique index with WHERE deleted_at IS NULL.
        // Note: F-18 statement only says idx_<table>_<column> (singular); a literal reader may use singular col or composite col1_col2.
        const idxName = options?.singularPartialUniqueName
          ? `idx_${t}_${c.name}`
          : `idx_${t}_tenant_id_${c.name}`;
        indexes.push(
          `CREATE UNIQUE INDEX ${idxName} ON public.${t} (tenant_id, ${c.name}) WHERE deleted_at IS NULL;`
        );
      } else {
        indexes.push(
          `CREATE UNIQUE INDEX idx_${t}_${c.name} ON public.${t} (${c.name}) WHERE deleted_at IS NULL;`
        );
      }
    }
  }

  // F-05: Every table must include created_at timestamptz NOT NULL DEFAULT now().
  cols.push(`created_at timestamptz NOT NULL DEFAULT now()`);

  // F-06 & F-10: Mutable tables include updated_at + nullable deleted_at; append-only omit both.
  if (!f.append_only) {
    cols.push(`updated_at timestamptz NOT NULL DEFAULT now()`);
    cols.push(`deleted_at timestamptz`);
  }

  // F-22 & F-23: index leading columns (when tenant_id wasn't already lead in a partial unique index? Create explicit index per F-18/F-23)
  if (f.tenant && !domainCols.some((c) => c.uniqueKey && !f.append_only)) {
    indexes.push(`CREATE INDEX idx_${t}_tenant_id ON public.${t} (tenant_id);`);
  }
  if (f.append_only) {
    // F-22 requires every FK column to be covered as leading column of an index -> supersedes_id
    indexes.push(`CREATE INDEX idx_${t}_supersedes_id ON public.${t} (supersedes_id);`);
  }

  if (options?.extraLatestPerKeyCompositeName) {
    indexes.push(
      `CREATE INDEX ${options.extraLatestPerKeyCompositeName} ON public.${t} (metric_key, observed_at DESC);`
    );
  }

  const allDefs = [...cols, ...tableConstraints];
  let sql = `CREATE TABLE public.${t} (\n  ${allDefs.join(',\n  ')}\n);\n\n`;
  if (indexes.length > 0) {
    sql += indexes.join('\n') + '\n\n';
  }

  // F-21: Mutable tables must have a BEFORE UPDATE trigger that advances updated_at.
  if (!f.append_only) {
    postStatements.push(`
CREATE OR REPLACE FUNCTION public.fn_${t}_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_${t}_updated_at
  BEFORE UPDATE ON public.${t}
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_${t}_set_updated_at();`);
  }

  // F-20: Append-only tables must have a BEFORE UPDATE OR DELETE trigger that raises 'Update/Delete operation rejected on audit log'.
  if (f.append_only) {
    postStatements.push(`
CREATE OR REPLACE FUNCTION public.fn_${t}_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log';
END;
$$;
CREATE TRIGGER trg_${t}_reject_mutation
  BEFORE UPDATE OR DELETE ON public.${t}
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_${t}_reject_mutation();`);
  }

  // F-37: Ingestion tables must attach a BEFORE INSERT trigger forcing NEW.received_at = now() regardless of client input.
  if (f.ingestion) {
    postStatements.push(`
CREATE OR REPLACE FUNCTION public.fn_${t}_force_received_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.received_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_${t}_force_received_at
  BEFORE INSERT ON public.${t}
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_${t}_force_received_at();`);
  }

  // F-25 & F-26 & F-27 & F-30 (literal from statements alone):
  // F-25: "Multi-tenant tables must have ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY."
  // F-26: "Tenant RLS policies must scope rows by app_metadata.tenant_id for application and grant zero access to user_metadata.tenant_id."
  // F-27: "Append-only tables must define zero FOR UPDATE, FOR DELETE, or FOR ALL RLS policies."
  if (f.tenant) {
    postStatements.push(`
ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_${t}_select_app
  ON public.${t}
  FOR SELECT
  TO application
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY pol_${t}_insert_app
  ON public.${t}
  FOR INSERT
  TO application
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);`);

    if (!f.append_only) {
      postStatements.push(`
CREATE POLICY pol_${t}_update_app
  ON public.${t}
  FOR UPDATE
  TO application
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY pol_${t}_delete_app
  ON public.${t}
  FOR DELETE
  TO application
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);`);
    }
  }

  // F-19 LITERAL statement:
  // "Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user."
  // Note: seed.sql grants ALL to PUBLIC & application by default; if an engineer also revokes ALL from PUBLIC
  // and follows only F-19's text (no GRANT SELECT/INSERT mentioned), readonly_user & application lose required privileges.
  if (f.append_only) {
    if (options?.revokeAllPublicNoGrant) {
      postStatements.push(`
REVOKE ALL ON public.${t} FROM PUBLIC, application, readonly_user;`);
    } else {
      postStatements.push(`
REVOKE UPDATE, DELETE, TRUNCATE ON public.${t} FROM PUBLIC, application, readonly_user;`);
    }
  }

  // F-39 LITERAL statement:
  // "Exposed views must be created with WITH (security_invoker = true)."
  if (f.view) {
    postStatements.push(`
CREATE VIEW public.v_${t} WITH (security_invoker = true) AS
SELECT id, tenant_id, created_at FROM public.${t};`);
  }

  return sql + postStatements.join('\n') + '\n';
}

function main() {
  const tasksRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures/task-v2/tasks.json'), 'utf-8')
  ) as { train: Array<TaskMetadataOnly & { goldenSql?: unknown }> };

  // Strip goldenSql immediately so it cannot be touched
  const trainTasks: TaskMetadataOnly[] = tasksRaw.train.map((t) => ({
    id: t.id,
    split: t.split,
    table: t.table,
    prompt: t.prompt,
    features: t.features,
    applicableFacts: t.applicableFacts,
    boundFacts: t.boundFacts,
  }));

  // 10 Train tasks spanning all 8 cells (with 2 extra from 111 and 110 view tasks)
  const selectedIds = [
    'T-001',
    'T-005',
    'T-006',
    'T-007',
    'T-011',
    'T-016',
    'T-021',
    'T-026',
    'T-031',
    'T-036',
  ];
  const selectedTasks = selectedIds.map((id) => {
    const found = trainTasks.find((t) => t.id === id);
    if (!found) throw new Error(`Missing train task ${id}`);
    return found;
  });

  const containerName = `axiom-stmt-pilot-${process.pid}`;
  console.log(`Starting PostgreSQL 16 Oracle container (${containerName})...`);
  startPostgresContainer(containerName);

  try {
    const pilotResults: Array<{
      taskId: string;
      table: string;
      cell: string;
      extraFlags: string[];
      pass: boolean;
      migrationExitNonZero: boolean;
      failedFacts: string[];
      failureDetails: string[];
      failedFactStatements: Record<string, string>;
      sqlLength: number;
    }> = [];

    for (const task of selectedTasks) {
      const sql = synthesizeStatementOnlySql(task);
      const cell =
        (task.features.tenant ? '1' : '0') +
        (task.features.append_only ? '1' : '0') +
        (task.features.ingestion ? '1' : '0');
      const meta: MigrationMeta = {
        table: task.table,
        tenant: task.features.tenant,
        append_only: task.features.append_only,
        ingestion: task.features.ingestion,
        latest_per_key: Boolean(task.features.latest_per_key),
        status: Boolean(task.features.status),
        sec_definer: Boolean(task.features.sec_definer),
        view: Boolean(task.features.view),
      };

      const report = evaluateMigrationSqlInContainer(containerName, sql, meta, task.id);
      const failedFactStatements: Record<string, string> = {};
      for (const fid of report.failedFacts) {
        failedFactStatements[fid] = FACT_STATEMENTS[fid] ?? '(inactive/unknown)';
      }

      pilotResults.push({
        taskId: task.id,
        table: task.table,
        cell,
        extraFlags: (['view', 'status', 'sec_definer', 'latest_per_key'] as const).filter(
          (k) => Boolean(task.features[k])
        ),
        pass: report.pass,
        migrationExitNonZero: Boolean(report.migrationExitNonZero),
        failedFacts: report.failedFacts,
        failureDetails: report.failureDetails ?? [],
        failedFactStatements,
        sqlLength: sql.length,
      });
    }

    // Targeted Statement-vs-Probe Edge Diagnostics (explicitly separated from the 10 Train tasks)
    // D1: F-18 composite index naming triggered by F-38 (Observation table with singular F-18 wording vs col1_col2)
    // D2: F-15 role-prefixed FK column name triggered by T-026 prompt ("executed by user reference")
    const t036 = selectedTasks.find((t) => t.id === 'T-036')!;
    const t026 = selectedTasks.find((t) => t.id === 'T-026')!;
    const t006 = selectedTasks.find((t) => t.id === 'T-006')!;
    const t016 = selectedTasks.find((t) => t.id === 'T-016')!;
    const t001 = selectedTasks.find((t) => t.id === 'T-001')!;

    const diagCases: Array<{
      diagId: string;
      description: string;
      task: TaskMetadataOnly;
      meta: MigrationMeta;
      sql: string;
    }> = [
      {
        diagId: 'DIAG_F38_F18_SINGULAR_NAME',
        description:
          'Observation table (F-38) with composite (metric_key, observed_at DESC) named idx_<table>_metric_key following F-18 singular <column> wording',
        task: t036,
        meta: {
          table: t036.table,
          tenant: false,
          append_only: false,
          ingestion: false,
          latest_per_key: true,
        },
        sql: synthesizeStatementOnlySql(t036, {
          extraLatestPerKeyCompositeName: `idx_${t036.table}_metric_key`,
        }),
      },
      {
        diagId: 'DIAG_F38_F18_COL1_COL2_NAME',
        description:
          'Same F-38 composite index named idx_<table>_metric_key_observed_at (compound naming not stated in F-18)',
        task: t036,
        meta: {
          table: t036.table,
          tenant: false,
          append_only: false,
          ingestion: false,
          latest_per_key: true,
        },
        sql: synthesizeStatementOnlySql(t036, {
          extraLatestPerKeyCompositeName: `idx_${t036.table}_metric_key_observed_at`,
        }),
      },
      {
        diagId: 'DIAG_F24_F18_SINGULAR_NAME',
        description:
          'T-016 (invoices) partial unique index on (tenant_id, invoice_code) named idx_invoices_invoice_code following F-18 singular <column> wording',
        task: t016,
        meta: {
          table: t016.table,
          tenant: true,
          append_only: false,
          ingestion: false,
        },
        sql: synthesizeStatementOnlySql(t016, { singularPartialUniqueName: true }),
      },
      {
        diagId: 'DIAG_F19_REVOKE_ALL_NO_POS_GRANT',
        description:
          'T-001 (webhook_deliveries) revoking ALL from PUBLIC/application/readonly_user without adding undocumented positive GRANT SELECT/INSERT',
        task: t001,
        meta: {
          table: t001.table,
          tenant: true,
          append_only: true,
          ingestion: true,
        },
        sql: synthesizeStatementOnlySql(t001, { revokeAllPublicNoGrant: true }),
      },
      {
        diagId: 'DIAG_F15_EXECUTED_BY_ID',
        description:
          'T-026 prompt "executed by user reference" mapped to executed_by_id (omitting _user_)',
        task: t026,
        meta: {
          table: t026.table,
          tenant: false,
          append_only: true,
          ingestion: false,
        },
        sql: synthesizeStatementOnlySql(t026, { overrideUserFkCol: 'executed_by_id' }),
      },
      {
        diagId: 'DIAG_F15_EXECUTED_BY_USER_ID',
        description:
          'T-026 prompt "executed by user reference" mapped to role-prefixed executed_by_user_id',
        task: t026,
        meta: {
          table: t026.table,
          tenant: false,
          append_only: true,
          ingestion: false,
        },
        sql: synthesizeStatementOnlySql(t026, { overrideUserFkCol: 'executed_by_user_id' }),
      },
      {
        diagId: 'DIAG_F15_ACTOR_ID',
        description:
          'T-006 prompt "actor user reference" mapped to actor_id (role-only without _user_)',
        task: t006,
        meta: {
          table: t006.table,
          tenant: true,
          append_only: true,
          ingestion: false,
          view: true,
        },
        sql: synthesizeStatementOnlySql(t006, { overrideUserFkCol: 'actor_id' }),
      },
    ];

    const diagnostics = diagCases.map((dc) => {
      const report = evaluateMigrationSqlInContainer(containerName, dc.sql, dc.meta, dc.diagId);
      return {
        diagId: dc.diagId,
        description: dc.description,
        pass: report.pass,
        migrationExitNonZero: Boolean(report.migrationExitNonZero),
        failedFacts: report.failedFacts,
        failureDetails: report.failureDetails ?? [],
      };
    });

    const passedCount = pilotResults.filter((r) => r.pass).length;
    const factFailCounts: Record<string, number> = {};
    for (const r of pilotResults) {
      for (const f of r.failedFacts) {
        factFailCounts[f] = (factFailCounts[f] ?? 0) + 1;
      }
    }

    const outDir = path.resolve('out/analysis-v3-prep');
    fs.mkdirSync(outDir, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      methodology:
        'Deterministic DDL synthesized purely from prompt + features + fixtures/task-v2/facts.json statement text (zero goldenSql access, zero LLM calls) and evaluated on live PostgreSQL 16 Oracle.',
      pilotSummary: {
        totalTasks: pilotResults.length,
        passedTasks: passedCount,
        failedTasks: pilotResults.length - passedCount,
        factFailCounts,
      },
      pilotResults,
      diagnostics,
    };

    fs.writeFileSync(
      path.join(outDir, 'item-5-statement-sufficiency.json'),
      JSON.stringify(payload, null, 2),
      'utf-8'
    );

    console.log('\n=== ITEM 5: 10-TASK STATEMENT-SUFFICIENCY PILOT ===');
    console.log(`Passed: ${passedCount}/${pilotResults.length}`);
    console.log('Failed fact counts:', factFailCounts);
    for (const r of pilotResults) {
      console.log(
        `${r.taskId} (${r.cell}${r.extraFlags.length ? '+' + r.extraFlags.join(',') : ''}) ${r.table}: pass=${r.pass} exitNZ=${r.migrationExitNonZero} failed=[${r.failedFacts.join(',')}] details=${JSON.stringify(r.failureDetails)}`
      );
    }
    console.log('\n=== ITEM 5: STATEMENT-VS-PROBE DIAGNOSTICS ===');
    for (const d of diagnostics) {
      console.log(`${d.diagId}: pass=${d.pass} failed=[${d.failedFacts.join(',')}]`);
    }
  } finally {
    stopPostgresContainer(containerName);
  }
}

main();
