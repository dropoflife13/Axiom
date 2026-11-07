-- META: {"table":"payment_callbacks","tenant":true,"append_only":true,"ingestion":true,"view":true,"sec_definer":true}
CREATE TABLE public.payment_callbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  settled_cents bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_callbacks_pkey PRIMARY KEY (id),
  CONSTRAINT fk_payment_callbacks_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_callbacks_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.payment_callbacks (id) ON DELETE RESTRICT,
  CONSTRAINT uq_payment_callbacks_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_payment_callbacks_settled_cents CHECK (settled_cents >= 0)
);

CREATE INDEX idx_payment_callbacks_tenant_id_created_at ON public.payment_callbacks (tenant_id, created_at DESC);
CREATE INDEX idx_payment_callbacks_supersedes_id ON public.payment_callbacks (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_payment_callbacks_stamp_received_at()
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

CREATE TRIGGER trg_payment_callbacks_stamp_received_at
BEFORE INSERT ON public.payment_callbacks
FOR EACH ROW
EXECUTE FUNCTION public.fn_payment_callbacks_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_payment_callbacks_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_payment_callbacks_immutable
BEFORE UPDATE OR DELETE ON public.payment_callbacks
FOR EACH ROW
EXECUTE FUNCTION public.fn_payment_callbacks_reject_mutation();

ALTER TABLE public.payment_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_callbacks FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_payment_callbacks_tenant_select ON public.payment_callbacks
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_payment_callbacks_tenant_insert ON public.payment_callbacks
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_payment_callbacks_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, idempotency_key, source_system, settled_cents, received_at, created_at
FROM public.payment_callbacks;

REVOKE ALL ON TABLE public.payment_callbacks FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.payment_callbacks TO application;
GRANT SELECT ON TABLE public.payment_callbacks TO readonly_user;
GRANT SELECT ON TABLE public.v_payment_callbacks_summary TO application, readonly_user;
