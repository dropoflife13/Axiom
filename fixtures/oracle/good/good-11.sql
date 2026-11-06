-- META: {"table":"price_logs","tenant":true,"append_only":true,"ingestion":true}
CREATE TABLE public.price_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  price_cents bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_price_logs_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_price_logs_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.price_logs (id) ON DELETE RESTRICT,
  CONSTRAINT uq_price_logs_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_price_logs_price_cents CHECK (price_cents > 0)
);

CREATE INDEX idx_price_logs_tenant_id_created_at ON public.price_logs (tenant_id, created_at DESC);
CREATE INDEX idx_price_logs_supersedes_id ON public.price_logs (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_price_logs_stamp_received_at()
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

CREATE TRIGGER trg_price_logs_stamp_received_at
BEFORE INSERT ON public.price_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_price_logs_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_price_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_price_logs_immutable
BEFORE UPDATE OR DELETE ON public.price_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_price_logs_reject_mutation();

ALTER TABLE public.price_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_price_logs_tenant_select ON public.price_logs
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_price_logs_tenant_insert ON public.price_logs
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_price_logs_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, idempotency_key, source_system, price_cents, received_at, created_at
FROM public.price_logs;

REVOKE ALL ON TABLE public.price_logs FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.price_logs TO application;
GRANT SELECT ON TABLE public.price_logs TO readonly_user;
GRANT SELECT ON TABLE public.v_price_logs_summary TO application, readonly_user;
