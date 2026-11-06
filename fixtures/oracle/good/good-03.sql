-- META: {"table":"subscriptions","tenant":true,"append_only":false,"ingestion":false}
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_code text NOT NULL,
  seat_count integer NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL,
  billing_state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT fk_subscriptions_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT chk_subscriptions_seat_count CHECK (seat_count > 0),
  CONSTRAINT chk_subscriptions_unit_price_cents CHECK (unit_price_cents >= 0),
  CONSTRAINT chk_subscriptions_billing_state CHECK (billing_state IN ('trialing', 'active', 'past_due', 'canceled'))
);

CREATE INDEX idx_subscriptions_tenant_id_created_at ON public.subscriptions (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_subscriptions_set_updated_at()
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

CREATE TRIGGER trg_subscriptions_set_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.fn_subscriptions_set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_subscriptions_tenant_select ON public.subscriptions
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_subscriptions_tenant_insert ON public.subscriptions
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_subscriptions_tenant_update ON public.subscriptions
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_subscriptions
WITH (security_invoker = true)
AS
SELECT id, tenant_id, plan_code, seat_count, unit_price_cents, billing_state, created_at, updated_at
FROM public.subscriptions
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.subscriptions TO application;
GRANT SELECT ON TABLE public.subscriptions TO readonly_user;
GRANT SELECT ON TABLE public.v_active_subscriptions TO application, readonly_user;
