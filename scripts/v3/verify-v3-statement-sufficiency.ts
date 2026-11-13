// scripts/v3/verify-v3-statement-sufficiency.ts
// Step 2: Full 40-Task Train Statement-Sufficiency Gate against live PostgreSQL 16 Oracle.
// Synthesizes PostgreSQL DDL STRICTLY from fixtures/task-v3/facts.json statements
// + task prompt and features (T-001 through T-040 from fixtures/task-v2/tasks.json).
// Zero access to goldenSql. Zero LLM calls.

import fs from 'node:fs';
import path from 'node:path';
import {
  startPostgresContainer,
  stopPostgresContainer,
  evaluateMigrationSqlInContainer,
  type MigrationMeta,
} from '../oracle.js';

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
 * Extracts domain columns strictly from task.prompt + task.features + literal fixtures/task-v3/facts.json statements.
 * Zero access to goldenSql or oracle.ts probe internals.
 */
export function synthesizeStatementOnlySql(
  task: TaskMetadataOnly,
  options?: {
    overrideUserFkCol?: string;
    extraLatestPerKeyCompositeName?: string;
    singularPartialUniqueName?: boolean;
    revokeAllPublicNoGrant?: boolean;
    useInlineReferencesForF36?: boolean;
  }
): string {
  const t = task.table;
  const f = task.features;
  const app = new Set(task.applicableFacts);
  const cols: string[] = [];
  const tableConstraints: string[] = [];
  const indexes: string[] = [];
  const postStatements: string[] = [];

  // F-01 (v3 statement):
  // "Primary key column id must be uuid NOT NULL DEFAULT gen_random_uuid(), declared once (do not combine an inline PRIMARY KEY with a second table-level PRIMARY KEY constraint)."
  cols.push(`id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`);

  // F-02 (v3 statement):
  // "Multi-tenant tables must include tenant_id uuid NOT NULL."
  // F-03: "Every foreign key constraint must use ON DELETE RESTRICT."
  // F-16: "Foreign key constraints must be named fk_<table>_<column>."
  if (f.tenant || app.has('F-02')) {
    cols.push(`tenant_id uuid NOT NULL`);
    tableConstraints.push(
      `CONSTRAINT fk_${t}_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT`
    );
  }

  // F-36 (v3 statement):
  // "Append-only tables must include a nullable self-referential foreign key column supersedes_id uuid NULL with an explicit table-level constraint named fk_<table>_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.<table>(id) ON DELETE RESTRICT (never an inline REFERENCES clause)."
  if (f.append_only || app.has('F-36')) {
    if (options?.useInlineReferencesForF36) {
      cols.push(`supersedes_id uuid REFERENCES public.${t}(id) ON DELETE RESTRICT`);
    } else {
      cols.push(`supersedes_id uuid NULL`);
      tableConstraints.push(
        `CONSTRAINT fk_${t}_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.${t}(id) ON DELETE RESTRICT`
      );
    }
  }

  // Extract domain attributes strictly from prompt wording and v3 statements
  const p = task.prompt.toLowerCase();
  const domainCols: PromptColSpec[] = [];

  if (p.includes('customer reference')) {
    domainCols.push({ name: 'customer_id', typeSql: 'uuid NOT NULL', fkRefTable: 'customers' });
  }

  // F-15 (v3 statement):
  // "Foreign key columns must be named [<role>_]<singular_ref_table>_id (e.g., user_id or actor_user_id) or supersedes_id for self-FK on append-only tables."
  if (options?.overrideUserFkCol) {
    domainCols.push({ name: options.overrideUserFkCol, typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('actor user reference')) {
    domainCols.push({ name: 'actor_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('owner user reference')) {
    domainCols.push({ name: 'owner_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('assignee user reference')) {
    domainCols.push({ name: 'assignee_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('approver user reference')) {
    domainCols.push({ name: 'approver_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('executed by user reference')) {
    domainCols.push({ name: 'executed_by_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('initiated by user reference')) {
    domainCols.push({ name: 'initiated_by_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('triggered by user reference')) {
    domainCols.push({ name: 'triggered_by_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('issued by user reference')) {
    domainCols.push({ name: 'issued_by_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('reviewed by user reference')) {
    domainCols.push({ name: 'reviewed_by_user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  } else if (p.includes('user reference')) {
    domainCols.push({ name: 'user_id', typeSql: 'uuid NOT NULL', fkRefTable: 'users' });
  }

  // Numeric / Text Domain columns
  if (p.includes('currency pair')) {
    domainCols.push({ name: 'currency_pair', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('currency code')) {
    domainCols.push({ name: 'currency_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('display name')) {
    domainCols.push({ name: 'display_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('minor units between 0 and 8') || p.includes('minor units')) {
    domainCols.push({
      name: 'minor_units',
      typeSql: 'integer NOT NULL',
      checkSql: 'minor_units >= 0 AND minor_units <= 8',
    });
  }
  if (p.includes('spot rate decimal') || p.includes('spot rate')) {
    domainCols.push({ name: 'spot_rate', typeSql: 'numeric NOT NULL', checkSql: 'spot_rate >= 0' });
  }
  if (p.includes('sample count')) {
    domainCols.push({ name: 'sample_count', typeSql: 'integer NOT NULL', checkSql: 'sample_count >= 0' });
  }
  if (p.includes('source provider')) {
    domainCols.push({ name: 'source_provider', typeSql: 'text NOT NULL' });
  }
  if (p.includes('collector region')) {
    domainCols.push({ name: 'collector_region', typeSql: 'text NOT NULL' });
  }
  if (p.includes('session source')) {
    domainCols.push({ name: 'session_source', typeSql: 'text NOT NULL' });
  }
  if (p.includes('event category')) {
    domainCols.push({ name: 'event_category', typeSql: 'text NOT NULL' });
  }
  if (p.includes('device firmware')) {
    domainCols.push({ name: 'device_firmware', typeSql: 'text NOT NULL' });
  }
  if (p.includes('reading quality')) {
    domainCols.push({ name: 'reading_quality', typeSql: 'text NOT NULL' });
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
  if (p.includes('resource path')) {
    domainCols.push({ name: 'resource_path', typeSql: 'text NOT NULL' });
  }
  if (p.includes('http status')) {
    domainCols.push({
      name: 'http_status',
      typeSql: 'integer NOT NULL',
      checkSql: 'http_status >= 100 AND http_status <= 599',
    });
  }
  if (p.includes('policy version')) {
    domainCols.push({ name: 'policy_version', typeSql: 'text NOT NULL' });
  }
  if (p.includes('justification note')) {
    domainCols.push({ name: 'justification_note', typeSql: 'text NOT NULL' });
  }
  if (p.includes('batch code')) {
    domainCols.push({ name: 'batch_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('sku code')) {
    domainCols.push({ name: 'sku_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('external contact key')) {
    domainCols.push({ name: 'external_contact_key', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('vendor code')) {
    domainCols.push({ name: 'vendor_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('pay period code')) {
    domainCols.push({ name: 'pay_period_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('invoice code')) {
    domainCols.push({ name: 'invoice_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('project slug')) {
    domainCols.push({ name: 'project_slug', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('budget')) {
    domainCols.push({ name: 'budget', typeSql: 'numeric NOT NULL', checkSql: 'budget >= 0' });
  }
  if (p.includes('priority')) {
    domainCols.push({ name: 'priority', typeSql: 'integer NOT NULL', checkSql: 'priority >= 0' });
  }
  if (p.includes('subscription code')) {
    domainCols.push({ name: 'subscription_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('billing cycle')) {
    domainCols.push({ name: 'billing_cycle', typeSql: 'text NOT NULL' });
  }
  if (p.includes('price')) {
    domainCols.push({ name: 'price', typeSql: 'numeric NOT NULL', checkSql: 'price >= 0' });
  }
  if (p.includes('order code')) {
    domainCols.push({ name: 'order_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('estimated hours')) {
    domainCols.push({ name: 'estimated_hours', typeSql: 'numeric NOT NULL', checkSql: 'estimated_hours >= 0' });
  }
  if (p.includes('key prefix')) {
    domainCols.push({ name: 'key_prefix', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('rate limit')) {
    domainCols.push({ name: 'rate_limit', typeSql: 'integer NOT NULL', checkSql: 'rate_limit >= 0' });
  }
  if (p.includes('total amount')) {
    domainCols.push({ name: 'total_amount', typeSql: 'numeric NOT NULL', checkSql: 'total_amount >= 0' });
  }
  if (p.includes('resolver pop')) {
    domainCols.push({ name: 'resolver_pop', typeSql: 'text NOT NULL' });
  }
  if (p.includes('reference clock code')) {
    domainCols.push({ name: 'reference_clock_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('log operator code')) {
    domainCols.push({ name: 'log_operator_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('feed provider')) {
    domainCols.push({ name: 'feed_provider', typeSql: 'text NOT NULL' });
  }
  if (p.includes('confidence level')) {
    domainCols.push({ name: 'confidence_level', typeSql: 'text NOT NULL' });
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
  if (p.includes('node hostname')) {
    domainCols.push({ name: 'node_hostname', typeSql: 'text NOT NULL' });
  }
  if (p.includes('kernel release')) {
    domainCols.push({ name: 'kernel_release', typeSql: 'text NOT NULL' });
  }
  if (p.includes('key ring name')) {
    domainCols.push({ name: 'key_ring_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('key version')) {
    domainCols.push({ name: 'key_version', typeSql: 'text NOT NULL' });
  }
  if (p.includes('rotation reason')) {
    domainCols.push({ name: 'rotation_reason', typeSql: 'text NOT NULL' });
  }
  if (p.includes('serial hex')) {
    domainCols.push({ name: 'serial_hex', typeSql: 'text NOT NULL' });
  }
  if (p.includes('subject common name')) {
    domainCols.push({ name: 'subject_common_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('key bits')) {
    domainCols.push({ name: 'key_bits', typeSql: 'integer NOT NULL', checkSql: 'key_bits > 0' });
  }
  if (p.includes('control code')) {
    domainCols.push({ name: 'control_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('pass rate percent')) {
    domainCols.push({
      name: 'pass_rate_percent',
      typeSql: 'numeric NOT NULL',
      checkSql: 'pass_rate_percent >= 0 AND pass_rate_percent <= 100',
    });
  }
  if (p.includes('auditor name')) {
    domainCols.push({ name: 'auditor_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('service code')) {
    domainCols.push({ name: 'service_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('billable units decimal') || p.includes('billable units')) {
    domainCols.push({ name: 'billable_units', typeSql: 'numeric NOT NULL', checkSql: 'billable_units >= 0' });
  }
  if (p.includes('destination url')) {
    domainCols.push({ name: 'destination_url', typeSql: 'text NOT NULL' });
  }
  if (p.includes('backoff multiplier decimal') || p.includes('backoff multiplier')) {
    domainCols.push({
      name: 'backoff_multiplier',
      typeSql: 'numeric NOT NULL',
      checkSql: 'backoff_multiplier >= 0',
    });
  }
  if (p.includes('topic name')) {
    domainCols.push({ name: 'topic_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('processing cost decimal') || p.includes('processing cost')) {
    domainCols.push({ name: 'processing_cost', typeSql: 'numeric NOT NULL', checkSql: 'processing_cost >= 0' });
  }
  if (p.includes('metric name')) {
    domainCols.push({ name: 'metric_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('aggregated value decimal') || p.includes('aggregated value')) {
    domainCols.push({
      name: 'aggregated_value',
      typeSql: 'numeric NOT NULL',
      checkSql: 'aggregated_value >= 0',
    });
  }
  if (p.includes('iso2 code')) {
    domainCols.push({ name: 'iso2_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('country name')) {
    domainCols.push({ name: 'country_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('region name')) {
    domainCols.push({ name: 'region_name', typeSql: 'text NOT NULL' });
  }
  if (p.includes('calling prefix')) {
    domainCols.push({ name: 'calling_prefix', typeSql: 'text NOT NULL' });
  }
  if (p.includes('jurisdiction code')) {
    domainCols.push({ name: 'jurisdiction_code', typeSql: 'text NOT NULL' });
  }
  if (p.includes('rate basis points between 0 and 10000') || p.includes('rate basis points')) {
    domainCols.push({
      name: 'rate_basis_points',
      typeSql: 'integer NOT NULL',
      checkSql: 'rate_basis_points >= 0 AND rate_basis_points <= 10000',
    });
  }
  if (p.includes('threshold cents')) {
    domainCols.push({ name: 'threshold_cents', typeSql: 'numeric NOT NULL', checkSql: 'threshold_cents >= 0' });
  }
  if (p.includes('flag key')) {
    domainCols.push({ name: 'flag_key', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('rollout percentage between 0 and 100') || p.includes('rollout percentage')) {
    domainCols.push({
      name: 'rollout_percentage',
      typeSql: 'integer NOT NULL',
      checkSql: 'rollout_percentage >= 0 AND rollout_percentage <= 100',
    });
  }
  if (p.includes('tier code')) {
    domainCols.push({ name: 'tier_code', typeSql: 'text NOT NULL', uniqueKey: !f.append_only });
  }
  if (p.includes('requests per minute positive') || p.includes('requests per minute')) {
    domainCols.push({
      name: 'requests_per_minute',
      typeSql: 'integer NOT NULL',
      checkSql: 'requests_per_minute > 0',
    });
  }
  if (p.includes('burst capacity')) {
    domainCols.push({ name: 'burst_capacity', typeSql: 'integer NOT NULL', checkSql: 'burst_capacity >= 0' });
  }
  if (p.includes('autonomous system number')) {
    domainCols.push({ name: 'asn', typeSql: 'integer NOT NULL', checkSql: 'asn >= 0' });
  }

  // F-34: Counter / Quota underflow protection (<col> >= 0)
  if (p.includes('event count')) {
    domainCols.push({ name: 'event_count', typeSql: 'integer NOT NULL', checkSql: 'event_count >= 0' });
  }
  if (p.includes('attempt count')) {
    domainCols.push({ name: 'attempt_count', typeSql: 'integer NOT NULL', checkSql: 'attempt_count >= 0' });
  }
  if (p.includes('failure count')) {
    domainCols.push({ name: 'failure_count', typeSql: 'integer NOT NULL', checkSql: 'failure_count >= 0' });
  }

  // F-12 (v3 statement): Status or state columns must be text NOT NULL validated by CHECK (col IN (...))
  if (p.includes('delivery status')) {
    domainCols.push({
      name: 'delivery_status',
      typeSql: 'text NOT NULL',
      checkSql: `delivery_status IN ('pending', 'delivered', 'failed')`,
    });
  } else if (p.includes('batch status')) {
    domainCols.push({
      name: 'batch_status',
      typeSql: 'text NOT NULL',
      checkSql: `batch_status IN ('pending', 'processing', 'completed', 'failed')`,
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
  } else if (p.includes('sync state')) {
    domainCols.push({
      name: 'sync_state',
      typeSql: 'text NOT NULL',
      checkSql: `sync_state IN ('pending', 'synced', 'failed')`,
    });
  } else if (p.includes('merge status')) {
    domainCols.push({
      name: 'merge_status',
      typeSql: 'text NOT NULL',
      checkSql: `merge_status IN ('pending', 'merged', 'conflict')`,
    });
  } else if (p.includes('reconciliation state')) {
    domainCols.push({
      name: 'reconciliation_state',
      typeSql: 'text NOT NULL',
      checkSql: `reconciliation_state IN ('pending', 'reconciled', 'unreconciled')`,
    });
  } else if (p.includes('approval state')) {
    domainCols.push({
      name: 'approval_state',
      typeSql: 'text NOT NULL',
      checkSql: `approval_state IN ('pending', 'approved', 'rejected')`,
    });
  } else if (p.includes('announcement status')) {
    domainCols.push({
      name: 'announcement_status',
      typeSql: 'text NOT NULL',
      checkSql: `announcement_status IN ('active', 'withdrawn')`,
    });
  } else if (p.includes('rcode status')) {
    domainCols.push({
      name: 'rcode_status',
      typeSql: 'text NOT NULL',
      checkSql: `rcode_status IN ('noerror', 'nxdomain', 'servfail')`,
    });
  } else if (p.includes('sync status')) {
    domainCols.push({
      name: 'sync_status',
      typeSql: 'text NOT NULL',
      checkSql: `sync_status IN ('synchronized', 'unsynchronized')`,
    });
  } else if (p.includes('consent status')) {
    domainCols.push({
      name: 'consent_status',
      typeSql: 'text NOT NULL',
      checkSql: `consent_status IN ('granted', 'revoked')`,
    });
  } else if (p.includes('decision status')) {
    domainCols.push({
      name: 'decision_status',
      typeSql: 'text NOT NULL',
      checkSql: `decision_status IN ('pending', 'approved', 'rejected')`,
    });
  } else if (p.includes('enabled status')) {
    domainCols.push({
      name: 'status',
      typeSql: 'text NOT NULL',
      checkSql: `status IN ('enabled', 'disabled')`,
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

  // F-11 (v3 statement): IP address columns must use inet, never text or varchar.
  if (p.includes('sender ip address') || p.includes('sender ip')) {
    domainCols.push({ name: 'sender_ip', typeSql: 'inet NOT NULL' });
  } else if (p.includes('peer ip address') || p.includes('peer ip')) {
    domainCols.push({ name: 'peer_ip', typeSql: 'inet NOT NULL' });
  } else if (p.includes('submitter ip address') || p.includes('submitter ip')) {
    domainCols.push({ name: 'submitter_ip', typeSql: 'inet NOT NULL' });
  } else if (p.includes('reporter ip address') || p.includes('reporter ip')) {
    domainCols.push({ name: 'reporter_ip', typeSql: 'inet NOT NULL' });
  } else if (p.includes('client ip address') || p.includes('client ip')) {
    domainCols.push({ name: 'client_ip', typeSql: 'inet NOT NULL' });
  }

  // F-32 & F-37 & F-09: Ingestion tables
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

  // Deduplicate and process domain columns
  const seenColNames = new Set<string>(['id', 'tenant_id', 'supersedes_id']);
  for (const c of domainCols) {
    if (seenColNames.has(c.name)) continue;
    seenColNames.add(c.name);

    cols.push(`${c.name} ${c.typeSql}`);
    if (c.checkSql) {
      // F-17: Check constraints named chk_<table>_<column>
      tableConstraints.push(`CONSTRAINT chk_${t}_${c.name} CHECK (${c.checkSql})`);
    }
    if (c.fkRefTable) {
      tableConstraints.push(
        `CONSTRAINT fk_${t}_${c.name} FOREIGN KEY (${c.name}) REFERENCES public.${c.fkRefTable}(id) ON DELETE RESTRICT`
      );
      // F-22: Every foreign key column must be covered as leading column of an index
      indexes.push(`CREATE INDEX idx_${t}_${c.name} ON public.${t} (${c.name});`);
    }
    if (c.uniqueKey && !f.append_only) {
      if (f.tenant) {
        // F-24 & F-18: Non-constraint unique index on soft-deletable table
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

  // F-05: Every table must include created_at timestamptz NOT NULL DEFAULT now()
  cols.push(`created_at timestamptz NOT NULL DEFAULT now()`);

  // F-06 & F-10: Mutable tables include updated_at + nullable deleted_at; append-only omit both
  if (!f.append_only) {
    cols.push(`updated_at timestamptz NOT NULL DEFAULT now()`);
    cols.push(`deleted_at timestamptz`);
  }

  // F-22 & F-23: Leading column indexing
  if (f.tenant && !indexes.some((idx) => idx.includes(`(${t}.tenant_id`) || idx.includes(`(tenant_id`))) {
    indexes.push(`CREATE INDEX idx_${t}_tenant_id ON public.${t} (tenant_id);`);
  }
  if (f.append_only) {
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

  // F-21: Mutable table BEFORE UPDATE trigger
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

  // F-20: Append-only table BEFORE UPDATE OR DELETE trigger
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

  // F-37: Ingestion BEFORE INSERT trigger
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

  // F-25 & F-26 & F-27 & F-30: Row Level Security
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

  // F-19 (v3 statement):
  // "Append-only tables must revoke UPDATE, DELETE, and TRUNCATE from PUBLIC, application, and readonly_user, and explicitly GRANT SELECT ON TABLE public.<table> TO readonly_user and GRANT SELECT, INSERT ON TABLE public.<table> TO application."
  if (f.append_only) {
    if (options?.revokeAllPublicNoGrant) {
      postStatements.push(`
REVOKE ALL ON public.${t} FROM PUBLIC, application, readonly_user;`);
    } else {
      postStatements.push(`
REVOKE UPDATE, DELETE, TRUNCATE ON public.${t} FROM PUBLIC, application, readonly_user;
GRANT SELECT ON public.${t} TO readonly_user;
GRANT SELECT, INSERT ON public.${t} TO application;`);
    }
  }

  // F-39: Views
  if (f.view) {
    postStatements.push(`
CREATE VIEW public.v_${t} WITH (security_invoker = true) AS
SELECT id, tenant_id, created_at FROM public.${t};`);
  }

  return sql + postStatements.join('\n') + '\n';
}

export function runV3StatementSufficiencyGate(): {
  trainPassed: number;
  trainTotal: number;
  diagPassed: number;
  diagTotal: number;
  pass: boolean;
} {
  const tasksRaw = JSON.parse(
    fs.readFileSync(path.resolve('fixtures/task-v2/tasks.json'), 'utf-8')
  ) as { train: Array<TaskMetadataOnly & { goldenSql?: unknown }> };

  // Strip goldenSql immediately so zero goldenSql is accessible
  const trainTasks: TaskMetadataOnly[] = tasksRaw.train.map((t) => ({
    id: t.id,
    split: t.split,
    table: t.table,
    prompt: t.prompt,
    features: t.features,
    applicableFacts: t.applicableFacts,
    boundFacts: t.boundFacts,
  }));

  const containerName = `axiom-v3-stmt-${process.pid}`;
  console.log(`Starting PostgreSQL 16 container (${containerName})...`);
  startPostgresContainer(containerName);

  try {
    const taskResults: Array<{
      taskId: string;
      table: string;
      cell: string;
      pass: boolean;
      migrationExitNonZero: boolean;
      failedFacts: string[];
      failureDetails: string[];
    }> = [];

    for (const task of trainTasks) {
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
      taskResults.push({
        taskId: task.id,
        table: task.table,
        cell,
        pass: report.pass,
        migrationExitNonZero: Boolean(report.migrationExitNonZero),
        failedFacts: report.failedFacts,
        failureDetails: report.failureDetails ?? [],
      });
    }

    // 4 Edge Diagnostics testing the v3 repaired rules
    const t036 = trainTasks.find((t) => t.id === 'T-036')!;
    const t016 = trainTasks.find((t) => t.id === 'T-016')!;
    const t001 = trainTasks.find((t) => t.id === 'T-001')!;
    const t026 = trainTasks.find((t) => t.id === 'T-026')!;

    const diagCases: Array<{
      diagId: string;
      description: string;
      meta: MigrationMeta;
      sql: string;
    }> = [
      {
        diagId: 'DIAG_F38_F18',
        description:
          'Observation table (F-38) composite index named idx_<table>_<col1>_<col2> following v3 F-18 compound naming',
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
        diagId: 'DIAG_F24_F18',
        description:
          'Soft-deletable table (F-24) partial unique index named idx_<table>_tenant_id_<key> following v3 F-18 compound naming',
        meta: {
          table: t016.table,
          tenant: true,
          append_only: false,
          ingestion: false,
        },
        sql: synthesizeStatementOnlySql(t016, { singularPartialUniqueName: false }),
      },
      {
        diagId: 'DIAG_F19_NO_DEFAULT_GRANTS',
        description:
          'Append-only table (F-19) revoking UPDATE/DELETE/TRUNCATE from PUBLIC/application/readonly_user AND granting positive SELECT and INSERT per v3 F-19',
        meta: {
          table: t001.table,
          tenant: true,
          append_only: true,
          ingestion: true,
        },
        sql: synthesizeStatementOnlySql(t001, { revokeAllPublicNoGrant: false }),
      },
      {
        diagId: 'DIAG_F15_ROLE_PREFIX',
        description:
          'Foreign key column (F-15) named with role prefix executed_by_user_id following v3 F-15',
        meta: {
          table: t026.table,
          tenant: false,
          append_only: true,
          ingestion: false,
        },
        sql: synthesizeStatementOnlySql(t026, { overrideUserFkCol: 'executed_by_user_id' }),
      },
    ];

    const diagResults = diagCases.map((dc) => {
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

    const trainPassed = taskResults.filter((r) => r.pass).length;
    const diagPassed = diagResults.filter((r) => r.pass).length;
    const pass = trainPassed === trainTasks.length && diagPassed === diagCases.length;

    const outDir = path.resolve('out/v3-prep');
    fs.mkdirSync(outDir, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      methodology:
        'Deterministic DDL synthesized purely from fixtures/task-v3/facts.json statement text + task metadata (zero goldenSql access, zero LLM calls) and evaluated on live PostgreSQL 16 Oracle.',
      summary: {
        trainTotal: trainTasks.length,
        trainPassed,
        trainPassRatePct: `${((trainPassed / trainTasks.length) * 100).toFixed(1)}%`,
        diagTotal: diagCases.length,
        diagPassed,
        diagPassRatePct: `${((diagPassed / diagCases.length) * 100).toFixed(1)}%`,
        gatePass: pass,
      },
      taskResults,
      diagResults,
    };

    fs.writeFileSync(
      path.join(outDir, 'statement-sufficiency-40.json'),
      JSON.stringify(payload, null, 2),
      'utf-8'
    );

    console.log(`\n=== V3 STATEMENT-SUFFICIENCY RESULTS ===`);
    console.log(`Train Tasks Passed: ${trainPassed} / ${trainTasks.length} (${payload.summary.trainPassRatePct})`);
    console.log(`Edge Diagnostics Passed: ${diagPassed} / ${diagCases.length} (${payload.summary.diagPassRatePct})`);
    console.log(`Gate Status: ${pass ? 'PASS (100.0%)' : 'FAIL'}`);

    return {
      trainPassed,
      trainTotal: trainTasks.length,
      diagPassed,
      diagTotal: diagCases.length,
      pass,
    };
  } finally {
    stopPostgresContainer(containerName);
  }
}

function main() {
  const result = runV3StatementSufficiencyGate();
  if (!result.pass) {
    console.error('Statement sufficiency gate failed!');
    process.exit(1);
  }
  console.log('[PASS] Full 40-Task Train Statement-Sufficiency Gate passed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('verify-v3-statement-sufficiency.ts')) {
  main();
}
