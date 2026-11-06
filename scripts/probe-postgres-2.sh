#!/usr/bin/env bash
# Axiom oracle probe 2: fixes the auth-schema grant bug from probe 1 and runs a full
# reference migration (tenant + append-only + ingestion) to prove the facts are jointly satisfiable.
# Usage (Git Bash, from the Axiom folder):  bash scripts/probe-postgres-2.sh 2>&1 | tee probe2-output.txt
set -u

NAME="axiom-probe2-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=probe postgres:16 >/dev/null || { echo "docker run failed"; exit 1; }

for i in $(seq 1 60); do
  n=$(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections')
  [ "$n" -ge 2 ] && break
  sleep 1
done
sleep 1

docker exec -i "$NAME" psql -U postgres -X -q <<'SQL'
\set ON_ERROR_STOP off
\echo '=== setup (harness)'
create role application;
create role readonly_user;
create role deployer;
grant all on schema public to deployer;
grant usage on schema public to application, readonly_user;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to deployer, application, readonly_user;
alter default privileges for role deployer in schema public grant all on tables to application, public;

\echo '=== reference migration, run as deployer (this is what a GOOD generated migration looks like)'
set role deployer;
create table public.price_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  price numeric(19,4) not null,
  client_ip inet,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  idempotency_key text not null,
  supersedes_id uuid,
  created_at timestamptz not null default now(),
  constraint fk_price_logs_supersedes_id foreign key (supersedes_id) references public.price_logs(id) on delete restrict,
  constraint uq_price_logs_tenant_id_idempotency_key unique (tenant_id, idempotency_key)
);
create index idx_price_logs_tenant_id on public.price_logs (tenant_id);
create index idx_price_logs_supersedes_id on public.price_logs (supersedes_id);
create index idx_price_logs_tenant_id_observed_at on public.price_logs (tenant_id, observed_at desc);

create function public.fn_price_logs_block_mutation() returns trigger language plpgsql as $$
begin raise exception 'Update/Delete operation rejected on audit log'; end $$;
create trigger trg_price_logs_block_mutation before update or delete on public.price_logs
  for each row execute function public.fn_price_logs_block_mutation();

create function public.fn_price_logs_stamp_received() returns trigger language plpgsql as $$
begin new.received_at := now(); return new; end $$;
create trigger trg_price_logs_stamp_received before insert on public.price_logs
  for each row execute function public.fn_price_logs_stamp_received();

revoke all on public.price_logs from public, application, readonly_user;
grant select, insert on public.price_logs to application;
grant select on public.price_logs to readonly_user;

alter table public.price_logs enable row level security;
alter table public.price_logs force row level security;
create policy p_price_logs_select on public.price_logs for select to application
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
create policy p_price_logs_insert on public.price_logs for insert to application
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
reset role;

\echo '=== privilege facts'
select has_table_privilege('application','public.price_logs','INSERT') as app_insert,
       has_table_privilege('application','public.price_logs','UPDATE') as app_update,
       has_table_privilege('application','public.price_logs','DELETE') as app_delete,
       has_table_privilege('application','public.price_logs','TRUNCATE') as app_truncate,
       has_table_privilege('public','public.price_logs','SELECT') as public_select,
       has_table_privilege('readonly_user','public.price_logs','SELECT') as readonly_select;

\echo '=== behavioural tests as application (tenant A in app_metadata)'
set role application;
select set_config('request.jwt.claims', '{"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', false) is not null as claims_set;
\echo '-- 8a insert for A with backdated received_at: received_at_was_stamped must be t'
insert into public.price_logs (tenant_id, price, observed_at, received_at, idempotency_key)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10.5, now(), '2000-01-01', 'k1')
  returning received_at > '2020-01-01' as received_at_was_stamped;
\echo '-- 8b insert for tenant B while acting as A: expect RLS violation'
insert into public.price_logs (tenant_id, price, observed_at, idempotency_key)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, now(), 'k2');
\echo '-- 8c duplicate idempotency key: expect unique violation'
insert into public.price_logs (tenant_id, price, observed_at, idempotency_key)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, now(), 'k1');
\echo '-- 8d correction row superseding k1: expect supersedes_id not null = t'
insert into public.price_logs (tenant_id, price, observed_at, idempotency_key, supersedes_id)
  select tenant_id, 11, now(), 'k3', id from public.price_logs where idempotency_key = 'k1'
  returning supersedes_id is not null as has_supersedes;
\echo '-- 8e rows visible to tenant A: expect 2'
select count(*) from public.price_logs;
\echo '-- 8f UPDATE as application: expect permission denied'
update public.price_logs set price = 1;
select set_config('request.jwt.claims', '{"user_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}', false) is not null as claims_switched;
\echo '-- 8g tenant only in user_metadata: expect count 0'
select count(*) from public.price_logs;
reset role;

\echo '=== owner and superuser behaviour (F-20 design)'
\echo '-- 8h deployer UPDATE under FORCE RLS: expect (0 rows), no error'
set role deployer;
update public.price_logs set price = 1 returning id;
\echo '-- 8i deployer DELETE under FORCE RLS: expect (0 rows), no error'
delete from public.price_logs returning id;
reset role;
\echo '-- 8j SUPERUSER UPDATE: expect the exact trigger message'
update public.price_logs set price = 1;
\echo '-- 8k SUPERUSER DELETE: expect the exact trigger message'
delete from public.price_logs;
SQL

docker stop "$NAME" >/dev/null 2>&1
echo "=== probe 2 finished"

