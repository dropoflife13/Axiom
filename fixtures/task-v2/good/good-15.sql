-- META: {"table":"meter_readings","tenant":true,"append_only":true,"ingestion":true,"view":true,"sec_definer":true}
CREATE TABLE public.meter_readings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  usage_units numeric(12,4) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meter_readings_pkey PRIMARY KEY (id),
  CONSTRAINT fk_meter_readings_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_meter_readings_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.meter_readings (id) ON DELETE RESTRICT,
  CONSTRAINT uq_meter_readings_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_meter_readings_usage_units CHECK (usage_units >= 0)
);

CREATE INDEX idx_meter_readings_tenant_id_created_at ON public.meter_readings (tenant_id, created_at DESC);
CREATE INDEX idx_meter_readings_supersedes_id ON public.meter_readings (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_meter_readings_stamp_received_at()
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

CREATE TRIGGER trg_meter_readings_stamp_received_at
BEFORE INSERT ON public.meter_readings
FOR EACH ROW
EXECUTE FUNCTION public.fn_meter_readings_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_meter_readings_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_meter_readings_immutable
BEFORE UPDATE OR DELETE ON public.meter_readings
FOR EACH ROW
EXECUTE FUNCTION public.fn_meter_readings_reject_mutation();

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_meter_readings_tenant_select ON public.meter_readings
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_meter_readings_tenant_insert ON public.meter_readings
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_meter_readings_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, idempotency_key, source_system, usage_units, received_at, created_at
FROM public.meter_readings;

REVOKE ALL ON TABLE public.meter_readings FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.meter_readings TO application;
GRANT SELECT ON TABLE public.meter_readings TO readonly_user;
GRANT SELECT ON TABLE public.v_meter_readings_summary TO application, readonly_user;
