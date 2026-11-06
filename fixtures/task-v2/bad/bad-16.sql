-- META: {"table":"import_batches","tenant":true,"append_only":false,"ingestion":true,"expectedFailedFacts":["F-06"],"mutationDescription":"Mutable table omits updated_at column"}
CREATE TABLE public.import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  batch_status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT import_batches_pkey PRIMARY KEY (id),
  CONSTRAINT fk_import_batches_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT uq_import_batches_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_import_batches_row_count CHECK (row_count >= 0),
  CONSTRAINT chk_import_batches_batch_status CHECK (batch_status IN ('received', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_import_batches_tenant_id_created_at ON public.import_batches (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_import_batches_stamp_received_at()
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

CREATE TRIGGER trg_import_batches_stamp_received_at
BEFORE INSERT ON public.import_batches
FOR EACH ROW
EXECUTE FUNCTION public.fn_import_batches_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_import_batches_set_updated_at()
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

CREATE TRIGGER trg_import_batches_set_updated_at
BEFORE UPDATE ON public.import_batches
FOR EACH ROW
EXECUTE FUNCTION public.fn_import_batches_set_updated_at();

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_import_batches_tenant_select ON public.import_batches
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_import_batches_tenant_insert ON public.import_batches
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_import_batches_tenant_update ON public.import_batches
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_import_batches
WITH (security_invoker = true)
AS
SELECT id, tenant_id, idempotency_key, source_system, row_count, batch_status, received_at, created_at
FROM public.import_batches
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.import_batches FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.import_batches TO application;
GRANT SELECT ON TABLE public.import_batches TO readonly_user;
GRANT SELECT ON TABLE public.v_active_import_batches TO application, readonly_user;
