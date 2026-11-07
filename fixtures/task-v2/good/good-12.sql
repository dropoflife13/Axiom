-- META: {"table":"webhook_deliveries","tenant":true,"append_only":true,"ingestion":true,"view":true,"sec_definer":true}
CREATE TABLE public.webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT fk_webhook_deliveries_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_webhook_deliveries_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.webhook_deliveries (id) ON DELETE RESTRICT,
  CONSTRAINT uq_webhook_deliveries_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_webhook_deliveries_event_type CHECK (char_length(event_type) > 0)
);

CREATE INDEX idx_webhook_deliveries_tenant_id_created_at ON public.webhook_deliveries (tenant_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_supersedes_id ON public.webhook_deliveries (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_webhook_deliveries_stamp_received_at()
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

CREATE TRIGGER trg_webhook_deliveries_stamp_received_at
BEFORE INSERT ON public.webhook_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.fn_webhook_deliveries_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_webhook_deliveries_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_webhook_deliveries_immutable
BEFORE UPDATE OR DELETE ON public.webhook_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.fn_webhook_deliveries_reject_mutation();

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_webhook_deliveries_tenant_select ON public.webhook_deliveries
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_webhook_deliveries_tenant_insert ON public.webhook_deliveries
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_webhook_deliveries_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, idempotency_key, source_system, event_type, received_at, created_at
FROM public.webhook_deliveries;

REVOKE ALL ON TABLE public.webhook_deliveries FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.webhook_deliveries TO application;
GRANT SELECT ON TABLE public.webhook_deliveries TO readonly_user;
GRANT SELECT ON TABLE public.v_webhook_deliveries_summary TO application, readonly_user;
