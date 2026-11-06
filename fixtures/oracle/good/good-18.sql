-- META: {"table":"catalog_feeds","tenant":true,"append_only":false,"ingestion":true}
CREATE TABLE public.catalog_feeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  source_system text NOT NULL,
  payload jsonb NOT NULL,
  item_count integer NOT NULL DEFAULT 1,
  feed_status text NOT NULL DEFAULT 'staged',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT catalog_feeds_pkey PRIMARY KEY (id),
  CONSTRAINT fk_catalog_feeds_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT uq_catalog_feeds_tenant_id_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT chk_catalog_feeds_item_count CHECK (item_count > 0),
  CONSTRAINT chk_catalog_feeds_feed_status CHECK (feed_status IN ('staged', 'indexed', 'rejected'))
);

CREATE INDEX idx_catalog_feeds_tenant_id_created_at ON public.catalog_feeds (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_catalog_feeds_stamp_received_at()
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

CREATE TRIGGER trg_catalog_feeds_stamp_received_at
BEFORE INSERT ON public.catalog_feeds
FOR EACH ROW
EXECUTE FUNCTION public.fn_catalog_feeds_stamp_received_at();

CREATE OR REPLACE FUNCTION public.fn_catalog_feeds_set_updated_at()
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

CREATE TRIGGER trg_catalog_feeds_set_updated_at
BEFORE UPDATE ON public.catalog_feeds
FOR EACH ROW
EXECUTE FUNCTION public.fn_catalog_feeds_set_updated_at();

ALTER TABLE public.catalog_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_feeds FORCE ROW LEVEL SECURITY;

CREATE POLICY pol_catalog_feeds_tenant_select ON public.catalog_feeds
  FOR SELECT TO application, readonly_user
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_catalog_feeds_tenant_insert ON public.catalog_feeds
  FOR INSERT TO application
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY pol_catalog_feeds_tenant_update ON public.catalog_feeds
  FOR UPDATE TO application
  USING (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE VIEW public.v_active_catalog_feeds
WITH (security_invoker = true)
AS
SELECT id, tenant_id, idempotency_key, source_system, item_count, feed_status, received_at, created_at, updated_at
FROM public.catalog_feeds
WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.catalog_feeds FROM PUBLIC, application, readonly_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.catalog_feeds TO application;
GRANT SELECT ON TABLE public.catalog_feeds TO readonly_user;
GRANT SELECT ON TABLE public.v_active_catalog_feeds TO application, readonly_user;
