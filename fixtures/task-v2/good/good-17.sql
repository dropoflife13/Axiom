-- META: {"table":"sync_jobs","tenant":true,"append_only":false,"ingestion":true,"view":true,"sec_definer":true,"status":true}
CREATE TABLE public.sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  sync_state text NOT NULL DEFAULT 'pending',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT sync_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_sync_jobs_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT uq_sync_jobs_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_sync_jobs_attempt_count CHECK (attempt_count >= 0),
  CONSTRAINT chk_sync_jobs_sync_state CHECK (sync_state IN ('pending', 'running', 'succeeded', 'dead_letter'))
);

CREATE INDEX idx_sync_jobs_tenant_id_created_at ON public.sync_jobs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_sync_jobs_stamp_received_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.received_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_jobs_stamp_received_at
BEFORE INSERT ON public.sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_jobs_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_sync_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_jobs_set_updated_at
BEFORE UPDATE ON public.sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_jobs_set_updated_at();

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_sync_jobs_tenant_select ON public.sync_jobs
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_sync_jobs_tenant_insert ON public.sync_jobs
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_sync_jobs_tenant_update ON public.sync_jobs
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_sync_jobs
WITH (security_invoker = true)
AS
SELECT id, tenant_id, idempotency_key, source_system, attempt_count, sync_state, received_at, created_at, updated_at
FROM public.sync_jobs
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.sync_jobs FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_jobs TO application;
GRANT SELECT ON TABLE public.sync_jobs TO readonly_user;
GRANT SELECT ON TABLE public.v_active_sync_jobs TO application, readonly_user;
