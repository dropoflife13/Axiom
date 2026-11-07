import { describe, expect, it } from 'vitest';
import {
  computeInvalidBoundFacts,
  deriveTaskFlags,
  detectLatestPerKey,
  detectSecDefiner,
  detectStatus,
  detectView,
  goldenContainsLatestPerKey,
  goldenContainsSecDefiner,
  goldenContainsStatus,
  goldenContainsView,
  probedFactsForTask,
  promptRequestsLatestPerKey,
  promptRequestsSecDefiner,
  promptRequestsStatus,
  promptRequestsView,
  type TaskRecord,
} from '../scripts/propose-task-repair.js';

const SYNTHETIC_MINI_TASKS: TaskRecord[] = [
  {
    id: 'SYN-001',
    split: 'train',
    cohortId: 'C1_TTT',
    table: 'payment_callbacks',
    prompt:
      'Create a multi-tenant append-only ingestion table for payment callbacks that tracks delivery status, client IP, idempotency key, and JSON payload.',
    features: { tenant: true, append_only: true, ingestion: true },
    boundFacts: ['F-12', 'F-19', 'F-25', 'F-37'],
    applicableFacts: ['F-01', 'F-12', 'F-19', 'F-25', 'F-37', 'F-39'],
    goldenSql: `
      CREATE TABLE public.payment_callbacks (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        delivery_status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payment_callbacks_pkey PRIMARY KEY (id),
        CONSTRAINT chk_payment_callbacks_delivery_status CHECK (delivery_status IN ('pending', 'delivered', 'failed'))
      );
    `,
  },
  {
    id: 'SYN-002',
    split: 'dev',
    cohortId: 'C1_TTT',
    table: 'access_logs',
    prompt:
      'Create a multi-tenant append-only table for access logs that tracks delivery status and a tenant summary view.',
    features: { tenant: true, append_only: true, ingestion: false },
    boundFacts: ['F-12', 'F-19', 'F-39'],
    applicableFacts: ['F-01', 'F-12', 'F-19', 'F-39'],
    goldenSql: `
      CREATE TABLE public.access_logs (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        item_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT access_logs_pkey PRIMARY KEY (id)
      );
      CREATE VIEW public.v_access_logs_summary WITH (security_invoker = true) AS
        SELECT id, tenant_id, created_at FROM public.access_logs;
    `,
  },
  {
    id: 'SYN-003',
    split: 'test',
    cohortId: 'C4_TFF',
    table: 'invoices',
    prompt:
      'Create a multi-tenant mutable table for invoices with a SECURITY DEFINER helper function and latest_per_key observed_at index.',
    features: { tenant: true, append_only: false, ingestion: false },
    boundFacts: ['F-06', 'F-31', 'F-38', 'F-39'],
    applicableFacts: ['F-01', 'F-06', 'F-31', 'F-38', 'F-39'],
    goldenSql: `
      CREATE TABLE public.invoices (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        item_code text NOT NULL,
        observed_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL
      );
      CREATE INDEX idx_invoices_item_code_observed_at ON public.invoices (item_code, observed_at DESC);
      CREATE OR REPLACE FUNCTION public.fn_invoices_helper()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      BEGIN RETURN NEW; END; $$;
      CREATE VIEW public.v_invoices_summary WITH (security_invoker = true) AS
        SELECT id, tenant_id FROM public.invoices;
    `,
  },
  {
    id: 'SYN-004',
    split: 'test',
    cohortId: 'C8_FFF',
    table: 'http_error_catalogs',
    prompt:
      'Create a global mutable table for http error catalogs that tracks http_status between 400 and 599.',
    features: { tenant: false, append_only: false, ingestion: false },
    boundFacts: ['F-01', 'F-06', 'F-10'],
    applicableFacts: ['F-01', 'F-06', 'F-10'],
    goldenSql: `
      CREATE TABLE public.http_error_catalogs (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        http_status integer NOT NULL,
        status_code integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL
      );
      CREATE OR REPLACE FUNCTION public.fn_http_error_catalogs_set_updated_at()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END; $$;
    `,
  },
];

describe('propose-task-repair detectors and probedFactsForTask', () => {
  it('detectStatus requires both prompt request and a non-excluded status/state/decision column in goldenSql', () => {
    // SYN-001: prompt requests delivery status AND goldenSql defines delivery_status -> true
    expect(promptRequestsStatus(SYNTHETIC_MINI_TASKS[0].prompt)).toBe(true);
    expect(goldenContainsStatus(SYNTHETIC_MINI_TASKS[0].goldenSql)).toBe(true);
    expect(detectStatus(SYNTHETIC_MINI_TASKS[0].prompt, SYNTHETIC_MINI_TASKS[0].goldenSql)).toBe(
      true
    );

    // SYN-002: prompt requests delivery status, but goldenSql has no status column -> false
    expect(promptRequestsStatus(SYNTHETIC_MINI_TASKS[1].prompt)).toBe(true);
    expect(goldenContainsStatus(SYNTHETIC_MINI_TASKS[1].goldenSql)).toBe(false);
    expect(detectStatus(SYNTHETIC_MINI_TASKS[1].prompt, SYNTHETIC_MINI_TASKS[1].goldenSql)).toBe(
      false
    );

    // SYN-004: goldenSql only has http_status and status_code (excluded by F-12) -> false
    expect(goldenContainsStatus(SYNTHETIC_MINI_TASKS[3].goldenSql)).toBe(false);
    expect(detectStatus('tracks status', SYNTHETIC_MINI_TASKS[3].goldenSql)).toBe(false);
  });

  it('detectView requires both prompt request and CREATE VIEW in goldenSql', () => {
    // SYN-001: neither prompt nor goldenSql has view -> false
    expect(detectView(SYNTHETIC_MINI_TASKS[0].prompt, SYNTHETIC_MINI_TASKS[0].goldenSql)).toBe(
      false
    );

    // SYN-002: both prompt and goldenSql have view -> true
    expect(promptRequestsView(SYNTHETIC_MINI_TASKS[1].prompt)).toBe(true);
    expect(goldenContainsView(SYNTHETIC_MINI_TASKS[1].goldenSql)).toBe(true);
    expect(detectView(SYNTHETIC_MINI_TASKS[1].prompt, SYNTHETIC_MINI_TASKS[1].goldenSql)).toBe(
      true
    );

    // SYN-003: goldenSql creates a view, but prompt does not request a view -> false
    expect(promptRequestsView(SYNTHETIC_MINI_TASKS[2].prompt)).toBe(false);
    expect(goldenContainsView(SYNTHETIC_MINI_TASKS[2].goldenSql)).toBe(true);
    expect(detectView(SYNTHETIC_MINI_TASKS[2].prompt, SYNTHETIC_MINI_TASKS[2].goldenSql)).toBe(
      false
    );
  });

  it('detectSecDefiner requires both prompt request and SECURITY DEFINER in goldenSql', () => {
    // SYN-003: both prompt and goldenSql have SECURITY DEFINER -> true
    expect(promptRequestsSecDefiner(SYNTHETIC_MINI_TASKS[2].prompt)).toBe(true);
    expect(goldenContainsSecDefiner(SYNTHETIC_MINI_TASKS[2].goldenSql)).toBe(true);
    expect(
      detectSecDefiner(SYNTHETIC_MINI_TASKS[2].prompt, SYNTHETIC_MINI_TASKS[2].goldenSql)
    ).toBe(true);

    // SYN-004: goldenSql has SECURITY DEFINER trigger, but prompt does not mention it -> false
    expect(promptRequestsSecDefiner(SYNTHETIC_MINI_TASKS[3].prompt)).toBe(false);
    expect(goldenContainsSecDefiner(SYNTHETIC_MINI_TASKS[3].goldenSql)).toBe(true);
    expect(
      detectSecDefiner(SYNTHETIC_MINI_TASKS[3].prompt, SYNTHETIC_MINI_TASKS[3].goldenSql)
    ).toBe(false);
  });

  it('detectLatestPerKey requires both prompt request and observed_at in goldenSql', () => {
    // SYN-003: both prompt and goldenSql have observed_at / latest_per_key -> true
    expect(promptRequestsLatestPerKey(SYNTHETIC_MINI_TASKS[2].prompt)).toBe(true);
    expect(goldenContainsLatestPerKey(SYNTHETIC_MINI_TASKS[2].goldenSql)).toBe(true);
    expect(
      detectLatestPerKey(SYNTHETIC_MINI_TASKS[2].prompt, SYNTHETIC_MINI_TASKS[2].goldenSql)
    ).toBe(true);

    // SYN-001: neither has observed_at -> false
    expect(
      detectLatestPerKey(SYNTHETIC_MINI_TASKS[0].prompt, SYNTHETIC_MINI_TASKS[0].goldenSql)
    ).toBe(false);
  });

  it('probedFactsForTask maps core and derived flags to facts.json applicability rules', () => {
    // SYN-001: tenant=T, append_only=T, ingestion=T, status=T, view=F, sec_definer=F, latest_per_key=F
    const syn1Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[0]);
    expect(syn1Facts).toContain('F-12');
    expect(syn1Facts).toContain('F-19');
    expect(syn1Facts).toContain('F-37');
    expect(syn1Facts).not.toContain('F-39');
    expect(syn1Facts).not.toContain('F-31');
    expect(syn1Facts).not.toContain('F-38');

    // SYN-002: tenant=T, append_only=T, ingestion=F, status=F (missing in golden), view=T
    const syn2Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[1]);
    expect(syn2Facts).not.toContain('F-12');
    expect(syn2Facts).toContain('F-39');

    // SYN-003: tenant=T, append_only=F, ingestion=F, status=F, view=F (missing in prompt), sec_definer=T, latest_per_key=T
    const syn3Flags = deriveTaskFlags(SYNTHETIC_MINI_TASKS[2]);
    expect(syn3Flags).toEqual({
      tenant: true,
      append_only: false,
      ingestion: false,
      status: false,
      view: false,
      sec_definer: true,
      latest_per_key: true,
    });
    const syn3Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[2]);
    expect(syn3Facts).toContain('F-31');
    expect(syn3Facts).toContain('F-38');
    expect(syn3Facts).not.toContain('F-39');

    // SYN-004: tenant=F, append_only=F, ingestion=F, all derived flags false
    const syn4Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[3]);
    expect(syn4Facts).toContain('F-06');
    expect(syn4Facts).toContain('F-10');
    expect(syn4Facts).not.toContain('F-12');
    expect(syn4Facts).not.toContain('F-31');
    expect(syn4Facts).not.toContain('F-39');
  });

  it('computeInvalidBoundFacts flags bound facts that are unprobed, failed by goldenSql, or F-39 without view in prompt', () => {
    const syn2Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[1]);
    // SYN-002 binds F-12, F-19, F-39; F-12 is not in proposed applicableFacts
    expect(computeInvalidBoundFacts(SYNTHETIC_MINI_TASKS[1], syn2Facts, [])).toEqual(['F-12']);

    // SYN-003 binds F-06, F-31, F-38, F-39; prompt has no view -> F-39 is invalid
    const syn3Facts = probedFactsForTask(SYNTHETIC_MINI_TASKS[2]);
    expect(computeInvalidBoundFacts(SYNTHETIC_MINI_TASKS[2], syn3Facts, [])).toEqual(['F-39']);

    // If goldenSql fails F-06 directly, both F-06 and F-39 are invalid
    expect(computeInvalidBoundFacts(SYNTHETIC_MINI_TASKS[2], syn3Facts, ['F-06'])).toEqual([
      'F-06',
      'F-39',
    ]);
  });
});
