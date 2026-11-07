-- META: {"table":"projects","tenant":true,"append_only":false,"ingestion":false,"view":true,"sec_definer":true}
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  slug text NOT NULL,
  budget_cents bigint NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT fk_projects_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_projects_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_projects_budget_cents CHECK (budget_cents >= 0),
  CONSTRAINT chk_projects_priority CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT uq_projects_tenant_id_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_projects_tenant_id_created_at ON public.projects (tenant_id, created_at DESC);
CREATE INDEX idx_projects_owner_user_id ON public.projects (owner_user_id);

CREATE OR REPLACE FUNCTION public.fn_projects_set_updated_at()
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

CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.fn_projects_set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_projects_tenant_select ON public.projects
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_projects_tenant_insert ON public.projects
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_projects_tenant_update ON public.projects
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_projects
WITH (security_invoker = true)
AS
SELECT id, tenant_id, owner_user_id, slug, budget_cents, priority, created_at, updated_at
FROM public.projects
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.projects FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.projects TO application;
GRANT SELECT ON TABLE public.projects TO readonly_user;
GRANT SELECT ON TABLE public.v_active_projects TO application, readonly_user;
