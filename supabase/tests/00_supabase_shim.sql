-- =====================================================================
-- Minimal Supabase compatibility shim for plain Postgres (CI / local
-- tests without Docker). Creates the roles, the auth schema, auth.users
-- and auth.uid()/auth.jwt() exactly as Supabase exposes them.
-- DO NOT run this against a real Supabase project.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text default 'authenticated',
  role               text default 'authenticated',
  email              text unique,
  phone              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  confirmation_token text default '',
  recovery_token     text default '',
  email_change       text default '',
  email_change_token_new text default '',
  last_sign_in_at    timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     text not null,
  provider        text not null,
  identity_data   jsonb not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (provider_id, provider)
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase's default search_path includes `extensions`.
do $$ begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
set search_path = "$user", public, extensions;

-- Local encryption key (Supabase uses the Vault secret teamnest_encryption_key).
do $$ begin
  execute format('alter database %I set app.encryption_key = %L', current_database(), 'local-dev-only-not-a-secret');
end $$;
set app.encryption_key = 'local-dev-only-not-a-secret';
