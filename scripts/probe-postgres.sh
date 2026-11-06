#!/usr/bin/env bash
# Axiom oracle probe: runs a throwaway postgres:16 and prints how it actually behaves
# for the facts marked UNVERIFIED. Read-only with respect to your repo; the container is removed at the end.
# Usage (Git Bash, from the Axiom folder):  bash scripts/probe-postgres.sh 2>&1 | tee probe-output.txt
set -u

NAME="axiom-probe-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=probe postgres:16 >/dev/null || { echo "docker run failed"; exit 1; }

# The official image restarts postgres once after init, so wait for TWO ready lines.
for i in $(seq 1 60); do
  n=$(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections')
  [ "$n" -ge 2 ] && break
  sleep 1
done
sleep 1

docker exec -i "$NAME" psql -U postgres -X -q <<'SQL'
\set ON_ERROR_STOP off
\echo '=== 0. version'
select version();

\echo '=== 1. setup (roles, schemas, default privileges)'
create role application;
create role readonly_user;
create role deployer;
grant all on schema public to deployer;
grant usage on schema public to application, readonly_user;
create schema app_schema authorization deployer;
grant usage on schema app_schema to application, readonly_user;
alter default privileges for role deployer in schema public grant all on tables to application, public;

\echo '=== 2. default privileges, has_table_privilege(public), explicit REVOKE'
set role deployer;
create table public.t_priv (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
reset role;
select has_table_privilege('public','public.t_priv','UPDATE') as public_update_before_revoke;
select has_table_privilege('application','public.t_priv','UPDATE') as app_update_before_revoke;
set role deployer;
revoke all on public.t_priv from public, application;
grant insert on public.t_priv to application;
reset role;
select has_table_privilege('public','public.t_priv','UPDATE') as public_update_after;
select has_table_privilege('application','public.t_priv','UPDATE') as app_update_after,
       has_table_privilege('application','public.t_priv','INSERT') as app_insert_after;
select relacl from pg_class where oid = 'public.t_priv'::regclass;
\echo '-- application INSERT should work, UPDATE should be permission denied'
set role application;
insert into public.t_priv default values;
update public.t_priv set created_at = now();
reset role;

\echo '=== 3. search_path: unqualified create lands in app_schema'
set role deployer;
set search_path = app_schema;
create table t_unq (id int);
reset search_path;
reset role;
select schemaname from pg_tables where tablename = 't_unq';

\echo '=== 4. F-20 vs FORCE RLS: does the append-only trigger fire?'
set role deployer;
create table public.audit_logs (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, note text);
create function public.fn_audit_logs_block() returns trigger language plpgsql as $$
begin raise exception 'Update/Delete operation rejected on audit log'; end $$;
create trigger trg_audit_logs_block before update or delete on public.audit_logs
  for each row execute function public.fn_audit_logs_block();
alter table public.audit_logs enable row level security;
reset role;
insert into public.audit_logs(tenant_id, note) values (gen_random_uuid(), 'seed');
\echo '-- 4a RLS enabled (not forced), no policies: UPDATE as owner (expect trigger error)'
set role deployer; update public.audit_logs set note = 'x'; reset role;
\echo '-- 4b FORCE RLS, no policies: UPDATE and DELETE as owner (trigger error = fired; UPDATE 0 / DELETE 0 = did NOT fire)'
alter table public.audit_logs force row level security;
set role deployer; update public.audit_logs set note = 'x'; delete from public.audit_logs; reset role;
\echo '-- 4c FORCE RLS, no policies: can the owner even INSERT a seed row?'
set role deployer; insert into public.audit_logs(tenant_id, note) values (gen_random_uuid(), 's2'); reset role;
\echo '-- 4d superuser UPDATE (bypasses RLS)'
update public.audit_logs set note = 'x';

\echo '=== 5. request.jwt.claims behaviour (one session)'
select current_setting('request.jwt.claims', true) is null as null_before_any_set;
begin; set local request.jwt.claims = '{"a":1}'; commit;
select current_setting('request.jwt.claims', true) as value_after_commit,
       current_setting('request.jwt.claims', true) = '' as is_empty_string;
select ''::jsonb as raw_empty_cast;
select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) as safe_cast;

\echo '=== 6. behavioural tenant isolation with a stub auth.jwt()'
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to application;
set role deployer;
create table public.tenant_items (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, label text);
alter table public.tenant_items enable row level security;
create policy p_tenant on public.tenant_items for all to application
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
reset role;
insert into public.tenant_items(tenant_id, label) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A1'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B1');
set role application;
select set_config('request.jwt.claims', '{"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', false);
\echo '-- 6a tenant A in app_metadata: expect only A1'
select label from public.tenant_items;
\echo '-- 6b insert for tenant B as A: expect RLS violation'
insert into public.tenant_items(tenant_id, label) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B2');
select set_config('request.jwt.claims', '{"user_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', false);
\echo '-- 6c tenant only in user_metadata: expect zero rows'
select count(*) from public.tenant_items;
reset role;

\echo '=== 7. catalog checks used by the oracle'
set role deployer;
create table public.obs (k uuid, observed_at timestamptz);
create index idx_obs_k_observed_at on public.obs (k, observed_at desc);
create view public.v_obs with (security_invoker = true) as select * from public.obs;
create function public.fn_def() returns int language sql security definer set search_path = '' as 'select 1';
reset role;
select indexrelid::regclass as idx, indoption from pg_index where indrelid = 'public.obs'::regclass;
select reloptions from pg_class where oid = 'public.v_obs'::regclass;
select proconfig from pg_proc where proname = 'fn_def';
SQL

docker stop "$NAME" >/dev/null 2>&1
echo "=== probe finished"

