-- META: {"table":"access_logs","tenant":true,"append_only":true,"ingestion":false,"view":true,"sec_definer":true}
CREATE TABLE public.access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  supersedes_id uuid NULL,
  ip_address inet NOT NULL,
  http_status integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_access_logs_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_logs_user_id FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_logs_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.access_logs (id) ON DELETE RESTRICT,
  CONSTRAINT chk_access_logs_http_status CHECK (http_status BETWEEN 100 AND 599)
);

CREATE INDEX idx_access_logs_tenant_id_created_at ON public.access_logs (tenant_id, created_at DESC);
CREATE INDEX idx_access_logs_user_id ON public.access_logs (user_id);
CREATE INDEX idx_access_logs_supersedes_id ON public.access_logs (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_access_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_access_logs_immutable
BEFORE UPDATE OR DELETE ON public.access_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_access_logs_reject_mutation();

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_access_logs_tenant_select ON public.access_logs
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_access_logs_tenant_insert ON public.access_logs
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_access_logs_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, user_id, supersedes_id, ip_address, http_status, created_at
FROM public.access_logs;

REVOKE ALL ON TABLE public.access_logs FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.access_logs TO application;
GRANT SELECT ON TABLE public.access_logs TO readonly_user;
GRANT SELECT ON TABLE public.v_access_logs_summary TO application, readonly_user;
