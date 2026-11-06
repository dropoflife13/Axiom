-- fixtures/task-v2/seed.sql
-- Base fixture schema and roles for Task v2 Oracle evaluation on postgres:16

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deployer') THEN
    CREATE ROLE deployer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application') THEN
    CREATE ROLE application NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_user') THEN
    CREATE ROLE readonly_user NOLOGIN;
  END IF;
END
$$;

GRANT ALL ON SCHEMA public TO deployer;
GRANT USAGE ON SCHEMA public TO application, readonly_user;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

GRANT USAGE ON SCHEMA auth TO PUBLIC, deployer, application, readonly_user;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC, deployer, application, readonly_user;

-- Default privileges so missing REVOKE statements are deterministically caught by F-19
ALTER DEFAULT PRIVILEGES FOR ROLE deployer IN SCHEMA public
  GRANT ALL ON TABLES TO PUBLIC, application, readonly_user;

SET ROLE deployer;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT
);

GRANT SELECT, REFERENCES ON TABLE public.tenants, public.users, public.customers TO deployer, application, readonly_user;

RESET ROLE;

-- Seed baseline tenant, user, and customer rows for behavioral probes
INSERT INTO public.tenants (id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, tenant_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, tenant_id) VALUES
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;

