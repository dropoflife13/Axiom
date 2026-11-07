-- META: {"table":"approval_stamps","tenant":true,"append_only":false,"ingestion":false,"expectedFailedFacts":["F-10"],"mutationDescription":"Mutable table declares deleted_at NOT NULL instead of nullable"}
CREATE TABLE public.approval_stamps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  approver_user_id uuid NOT NULL,
  decision text NOT NULL,
  signature_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_stamps_pkey PRIMARY KEY (id),
  CONSTRAINT fk_approval_stamps_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_stamps_approver_user_id FOREIGN KEY (approver_user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_approval_stamps_decision CHECK (decision IN ('approved', 'rejected', 'escalated'))
);

CREATE INDEX idx_approval_stamps_tenant_id_created_at ON public.approval_stamps (tenant_id, created_at DESC);
CREATE INDEX idx_approval_stamps_approver_user_id ON public.approval_stamps (approver_user_id);

CREATE OR REPLACE FUNCTION public.fn_approval_stamps_set_updated_at()
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

CREATE TRIGGER trg_approval_stamps_set_updated_at
BEFORE UPDATE ON public.approval_stamps
FOR EACH ROW
EXECUTE FUNCTION public.fn_approval_stamps_set_updated_at();

ALTER TABLE public.approval_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_stamps FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_approval_stamps_tenant_select ON public.approval_stamps
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_approval_stamps_tenant_insert ON public.approval_stamps
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_approval_stamps_tenant_update ON public.approval_stamps
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_approval_stamps_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, approver_user_id, decision, signature_hash, created_at, updated_at
FROM public.approval_stamps;

REVOKE ALL ON TABLE public.approval_stamps FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.approval_stamps TO application;
GRANT SELECT ON TABLE public.approval_stamps TO readonly_user;
GRANT SELECT ON TABLE public.v_approval_stamps_summary TO application, readonly_user;
