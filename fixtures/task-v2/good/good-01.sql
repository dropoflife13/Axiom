-- META: {"table":"invoices","tenant":true,"append_only":false,"ingestion":false,"view":true,"sec_definer":true,"status":true}
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_number text NOT NULL,
  amount_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT fk_invoices_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoices_amount_cents CHECK (amount_cents >= 0),
  CONSTRAINT chk_invoices_status CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  CONSTRAINT uq_invoices_tenant_id_invoice_number UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant_id_created_at ON public.invoices (tenant_id, created_at DESC);
CREATE INDEX idx_invoices_customer_id ON public.invoices (customer_id);

CREATE OR REPLACE FUNCTION public.fn_invoices_set_updated_at()
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

CREATE TRIGGER trg_invoices_set_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_invoices_set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_invoices_tenant_select ON public.invoices
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_invoices_tenant_insert ON public.invoices
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_invoices_tenant_update ON public.invoices
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_invoices
WITH (security_invoker = true)
AS
SELECT id, tenant_id, customer_id, invoice_number, amount_cents, status, created_at, updated_at
FROM public.invoices
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.invoices FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoices TO application;
GRANT SELECT ON TABLE public.invoices TO readonly_user;
GRANT SELECT ON TABLE public.v_active_invoices TO application, readonly_user;
