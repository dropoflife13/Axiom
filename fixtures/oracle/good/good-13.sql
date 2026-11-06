-- META: {"table":"telemetry_frames","tenant":true,"append_only":true,"ingestion":true}
CREATE TABLE public.telemetry_frames (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supersedes_id uuid NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  sequence_no bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telemetry_frames_pkey PRIMARY KEY (id),
  CONSTRAINT fk_telemetry_frames_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_telemetry_frames_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.telemetry_frames (id) ON DELETE RESTRICT,
  CONSTRAINT uq_telemetry_frames_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_telemetry_frames_sequence_no CHECK (sequence_no >= 0)
);

CREATE INDEX idx_telemetry_frames_tenant_id_created_at ON public.telemetry_frames (tenant_id, created_at DESC);
CREATE INDEX idx_telemetry_frames_supersedes_id ON public.telemetry_frames (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_telemetry_frames_stamp_received_at()
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

CREATE TRIGGER trg_telemetry_frames_stamp_received_at
BEFORE INSERT ON public.telemetry_frames
FOR EACH ROW
EXECUTE FUNCTION public.fn_telemetry_frames_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_telemetry_frames_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_telemetry_frames_immutable
BEFORE UPDATE OR DELETE ON public.telemetry_frames
FOR EACH ROW
EXECUTE FUNCTION public.fn_telemetry_frames_reject_mutation();

ALTER TABLE public.telemetry_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_frames FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_telemetry_frames_tenant_select ON public.telemetry_frames
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_telemetry_frames_tenant_insert ON public.telemetry_frames
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_telemetry_frames_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, supersedes_id, idempotency_key, source_system, sequence_no, received_at, created_at
FROM public.telemetry_frames;

REVOKE ALL ON TABLE public.telemetry_frames FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.telemetry_frames TO application;
GRANT SELECT ON TABLE public.telemetry_frames TO readonly_user;
GRANT SELECT ON TABLE public.v_telemetry_frames_summary TO application, readonly_user;
