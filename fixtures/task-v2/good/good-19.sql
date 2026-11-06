-- META: {"table":"shipment_manifests","tenant":true,"append_only":false,"ingestion":true}
CREATE TABLE public.shipment_manifests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  total_weight_grams integer NOT NULL,
  clearance_state text NOT NULL DEFAULT 'pending',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT shipment_manifests_pkey PRIMARY KEY (id),
  CONSTRAINT fk_shipment_manifests_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT uq_shipment_manifests_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_shipment_manifests_total_weight_grams CHECK (total_weight_grams > 0),
  CONSTRAINT chk_shipment_manifests_clearance_state CHECK (clearance_state IN ('pending', 'cleared', 'held'))
);

CREATE INDEX idx_shipment_manifests_tenant_id_created_at ON public.shipment_manifests (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_shipment_manifests_stamp_received_at()
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

CREATE TRIGGER trg_shipment_manifests_stamp_received_at
BEFORE INSERT ON public.shipment_manifests
FOR EACH ROW
EXECUTE FUNCTION public.fn_shipment_manifests_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_shipment_manifests_set_updated_at()
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

CREATE TRIGGER trg_shipment_manifests_set_updated_at
BEFORE UPDATE ON public.shipment_manifests
FOR EACH ROW
EXECUTE FUNCTION public.fn_shipment_manifests_set_updated_at();

ALTER TABLE public.shipment_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_manifests FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_shipment_manifests_tenant_select ON public.shipment_manifests
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_shipment_manifests_tenant_insert ON public.shipment_manifests
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_shipment_manifests_tenant_update ON public.shipment_manifests
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_shipment_manifests
WITH (security_invoker = true)
AS
SELECT id, tenant_id, idempotency_key, source_system, total_weight_grams, clearance_state, received_at, created_at, updated_at
FROM public.shipment_manifests
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.shipment_manifests FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shipment_manifests TO application;
GRANT SELECT ON TABLE public.shipment_manifests TO readonly_user;
GRANT SELECT ON TABLE public.v_active_shipment_manifests TO application, readonly_user;
