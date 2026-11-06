-- META: {"table":"approval_stamps","tenant":true,"append_only":true,"ingestion":false}
CREATE TABLE public.approval_stamps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  approver_user_id uuid NOT NULL,
  supersedes_id uuid NULL,
  decision text NOT NULL,
  signature_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_stamps_pkey PRIMARY KEY (id),
  CONSTRAINT fk_approval_stamps_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_stamps_approver_user_id FOREIGN KEY (approver_user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_stamps_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.approval_stamps (id) ON DELETE RESTRICT,
  CONSTRAINT chk_approval_stamps_decision CHECK (decision IN ('approved', 'rejected', 'escalated'))
);

CREATE INDEX idx_approval_stamps_tenant_id_created_at ON public.approval_stamps (tenant_id, created_at DESC);
CREATE INDEX idx_approval_stamps_approver_user_id ON public.approval_stamps (approver_user_id);
CREATE INDEX idx_approval_stamps_supersedes_id ON public.approval_stamps (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_approval_stamps_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_approval_stamps_immutable
BEFORE UPDATE OR DELETE ON public.approval_stamps
FOR EACH ROW
EXECUTE FUNCTION public.fn_approval_stamps_reject_mutation();

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

CREATE VIEW public.v_approval_stamps_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, approver_user_id, supersedes_id, decision, signature_hash, created_at
FROM public.approval_stamps;

REVOKE ALL ON TABLE public.approval_stamps FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.approval_stamps TO application;
GRANT SELECT ON TABLE public.approval_stamps TO readonly_user;
GRANT SELECT ON TABLE public.v_approval_stamps_summary TO application, readonly_user;
