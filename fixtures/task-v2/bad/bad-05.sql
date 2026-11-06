-- META: {"table":"customer_contacts","tenant":true,"append_only":false,"ingestion":false,"expectedFailedFacts":["F-26"],"mutationDescription":"RLS tenant policy reads user_metadata instead of app_metadata"}
CREATE TABLE public.customer_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  email text NOT NULL,
  role_label text NOT NULL DEFAULT 'billing',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT customer_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT fk_customer_contacts_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_customer_contacts_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE RESTRICT,
  CONSTRAINT chk_customer_contacts_role_label CHECK (role_label IN ('billing', 'technical', 'legal', 'executive')),
  CONSTRAINT uq_customer_contacts_tenant_id_email UNIQUE (tenant_id, email)
);

CREATE INDEX idx_customer_contacts_tenant_id_created_at ON public.customer_contacts (tenant_id, created_at DESC);
CREATE INDEX idx_customer_contacts_customer_id ON public.customer_contacts (customer_id);

CREATE OR REPLACE FUNCTION public.fn_customer_contacts_set_updated_at()
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

CREATE TRIGGER trg_customer_contacts_set_updated_at
BEFORE UPDATE ON public.customer_contacts
FOR EACH ROW
EXECUTE FUNCTION public.fn_customer_contacts_set_updated_at();

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_customer_contacts_tenant_select ON public.customer_contacts
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_customer_contacts_tenant_insert ON public.customer_contacts
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_customer_contacts_tenant_update ON public.customer_contacts
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_customer_contacts
WITH (security_invoker = true)
AS
SELECT id, tenant_id, customer_id, email, role_label, is_primary, created_at, updated_at
FROM public.customer_contacts
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.customer_contacts FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_contacts TO application;
GRANT SELECT ON TABLE public.customer_contacts TO readonly_user;
GRANT SELECT ON TABLE public.v_active_customer_contacts TO application, readonly_user;
