-- META: {"table":"consent_records","tenant":true,"append_only":true,"ingestion":false}
CREATE TABLE public.consent_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  supersedes_id uuid NULL,
  policy_version text NOT NULL,
  granted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_records_pkey PRIMARY KEY (id),
  CONSTRAINT fk_consent_records_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_records_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_consent_records_supersedes_id FOREIGN KEY (supersedes_id) REFERENCES public.consent_records (id) ON DELETE RESTRICT,
  CONSTRAINT chk_consent_records_policy_version CHECK (char_length(policy_version) > 0)
);

CREATE INDEX idx_consent_records_tenant_id_created_at ON public.consent_records (tenant_id, created_at DESC);
CREATE INDEX idx_consent_records_customer_id ON public.consent_records (customer_id);
CREATE INDEX idx_consent_records_supersedes_id ON public.consent_records (supersedes_id);

CREATE OR REPLACE FUNCTION public.fn_consent_records_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Update/Delete operation rejected on audit log' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_consent_records_immutable
BEFORE UPDATE OR DELETE ON public.consent_records
FOR EACH ROW
EXECUTE FUNCTION public.fn_consent_records_reject_mutation();

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_consent_records_tenant_select ON public.consent_records
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_consent_records_tenant_insert ON public.consent_records
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_consent_records_summary
WITH (security_invoker = true)
AS
SELECT id, tenant_id, customer_id, supersedes_id, policy_version, granted, created_at
FROM public.consent_records;

REVOKE ALL ON TABLE public.consent_records FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT ON TABLE public.consent_records TO application;
GRANT SELECT ON TABLE public.consent_records TO readonly_user;
GRANT SELECT ON TABLE public.v_consent_records_summary TO application, readonly_user;
