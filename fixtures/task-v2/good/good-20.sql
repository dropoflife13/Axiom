-- META: {"table":"kyc_submissions","tenant":true,"append_only":false,"ingestion":true}
CREATE TABLE public.kyc_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'pending',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT kyc_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT fk_kyc_submissions_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_kyc_submissions_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE RESTRICT,
  CONSTRAINT uq_kyc_submissions_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_kyc_submissions_risk_score CHECK (risk_score BETWEEN 0 AND 100),
  CONSTRAINT chk_kyc_submissions_review_status CHECK (review_status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX idx_kyc_submissions_tenant_id_created_at ON public.kyc_submissions (tenant_id, created_at DESC);
CREATE INDEX idx_kyc_submissions_customer_id ON public.kyc_submissions (customer_id);

CREATE OR REPLACE FUNCTION public.fn_kyc_submissions_stamp_received_at()
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

CREATE TRIGGER trg_kyc_submissions_stamp_received_at
BEFORE INSERT ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_kyc_submissions_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_kyc_submissions_set_updated_at()
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

CREATE TRIGGER trg_kyc_submissions_set_updated_at
BEFORE UPDATE ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_kyc_submissions_set_updated_at();

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_kyc_submissions_tenant_select ON public.kyc_submissions
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_kyc_submissions_tenant_insert ON public.kyc_submissions
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_kyc_submissions_tenant_update ON public.kyc_submissions
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_kyc_submissions
WITH (security_invoker = true)
AS
SELECT id, tenant_id, customer_id, idempotency_key, source_system, risk_score, review_status, received_at, created_at, updated_at
FROM public.kyc_submissions
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.kyc_submissions FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kyc_submissions TO application;
GRANT SELECT ON TABLE public.kyc_submissions TO readonly_user;
GRANT SELECT ON TABLE public.v_active_kyc_submissions TO application, readonly_user;
