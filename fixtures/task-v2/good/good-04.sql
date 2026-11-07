-- META: {"table":"work_orders","tenant":true,"append_only":false,"ingestion":false,"view":true,"sec_definer":true}
CREATE TABLE public.work_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  assignee_id uuid NOT NULL,
  reference_code text NOT NULL,
  estimated_hours numeric(8,2) NOT NULL DEFAULT 1.00,
  stage text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT work_orders_pkey PRIMARY KEY (id),
  CONSTRAINT fk_work_orders_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_work_orders_assignee_id FOREIGN KEY (assignee_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_work_orders_estimated_hours CHECK (estimated_hours > 0),
  CONSTRAINT chk_work_orders_stage CHECK (stage IN ('queued', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT uq_work_orders_tenant_id_reference_code UNIQUE (tenant_id, reference_code)
);

CREATE INDEX idx_work_orders_tenant_id_created_at ON public.work_orders (tenant_id, created_at DESC);
CREATE INDEX idx_work_orders_assignee_id ON public.work_orders (assignee_id);

CREATE OR REPLACE FUNCTION public.fn_work_orders_set_updated_at()
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

CREATE TRIGGER trg_work_orders_set_updated_at
BEFORE UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_work_orders_set_updated_at();

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_work_orders_tenant_select ON public.work_orders
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_work_orders_tenant_insert ON public.work_orders
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_work_orders_tenant_update ON public.work_orders
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_work_orders
WITH (security_invoker = true)
AS
SELECT id, tenant_id, assignee_id, reference_code, estimated_hours, stage, created_at, updated_at
FROM public.work_orders
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.work_orders FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.work_orders TO application;
GRANT SELECT ON TABLE public.work_orders TO readonly_user;
GRANT SELECT ON TABLE public.v_active_work_orders TO application, readonly_user;
