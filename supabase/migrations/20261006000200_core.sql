-- =====================================================================
-- TeamNest · 0002 · Core: organizations, roles, territories, teams,
--                  users, employees (+ encrypted sensitive fields)
-- =====================================================================

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext not null unique,
  legal_name    text,
  gstin         text,
  timezone      text not null default 'Asia/Kolkata',
  currency      char(3) not null default 'INR',
  default_locale text not null default 'en-IN',
  logo_file_id  uuid,                                  -- fk added in platform migration
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Role catalogue. The role *codes* are the app_role enum; this table holds
-- display metadata and the permission matrix the UI uses to show/hide modules.
-- (Data access itself is enforced by RLS, never by this table alone.)
create table public.roles (
  code          public.app_role primary key,
  name          text not null,
  description   text,
  rank          smallint not null,                     -- higher = broader scope
  permissions   jsonb not null default '{}'::jsonb,    -- {"leads.read.team":true, ...}
  requires_mfa  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.territories (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  parent_id     uuid references public.territories(id) on delete set null,
  kind          public.territory_kind not null,
  name          text not null,
  code          text not null,
  state         text,
  pincodes      text[] not null default '{}',
  center_lat    double precision,
  center_lng    double precision,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, code)
);
create index territories_parent_idx on public.territories(parent_id);
create index territories_pincodes_gin on public.territories using gin (pincodes);

create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  parent_team_id uuid references public.teams(id) on delete set null,
  territory_id  uuid references public.territories(id) on delete set null,
  name          text not null,
  lead_user_id  uuid,                                  -- fk added after users
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, name)
);
create index teams_territory_idx on public.teams(territory_id);

-- One row per login. id = auth.users.id (Supabase Auth).
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete restrict,
  role          public.app_role not null default 'executive' references public.roles(code) on update cascade,
  team_id       uuid references public.teams(id) on delete set null,
  manager_id    uuid references public.users(id) on delete set null,
  territory_id  uuid references public.territories(id) on delete set null,
  full_name     text not null,
  email         citext not null,
  phone         text,
  avatar_url    text,
  locale        text not null default 'en-IN',          -- en-IN | hi-IN | te-IN
  status        public.user_status not null default 'active',
  mfa_enrolled  boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, email),
  constraint users_not_own_manager check (manager_id is distinct from id)
);
create index users_org_role_idx on public.users(org_id, role);
create index users_team_idx on public.users(team_id);
create index users_manager_idx on public.users(manager_id);
create index users_territory_idx on public.users(territory_id);

alter table public.teams
  add constraint teams_lead_user_fk foreign key (lead_user_id) references public.users(id) on delete set null;
create index teams_lead_user_idx on public.teams(lead_user_id);

-- Employment record (HR view of a user). Non-sensitive fields only.
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null unique references public.users(id) on delete cascade,
  employee_code     text not null,
  designation       text not null,
  department        text not null default 'Sales',
  employment_type   text not null default 'full_time' check (employment_type in ('full_time','contract','intern')),
  date_of_joining   date not null,
  date_of_birth     date,
  gender            text check (gender in ('female','male','non_binary','prefer_not_to_say')),
  work_city         text,
  shift_id          uuid,                               -- fk added in HR migration
  personal_email    citext,
  emergency_contact jsonb not null default '{}'::jsonb, -- {name, relation, phone}
  address           jsonb not null default '{}'::jsonb, -- {line1, city, state, pincode}
  blood_group       text,
  probation_end_date date,
  exit_date         date,
  onboarding        jsonb not null default '[]'::jsonb, -- checklist [{key,label,done,done_at}]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, employee_code)
);
create index employees_org_idx on public.employees(org_id);

-- Sensitive HR fields: encrypted at rest with pgcrypto (key from Supabase
-- Vault, or the app.encryption_key GUC for local dev). Only the last 4 digits
-- are stored in clear for masked display. Read decrypted values through
-- public.get_employee_sensitive(), which enforces owner / HR / Finance.
create table public.employee_sensitive (
  employee_id       uuid primary key references public.employees(id) on delete cascade,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  bank_name         text,
  bank_ifsc         text,
  bank_account_enc  bytea,
  bank_account_last4 text,
  pan_enc           bytea,
  pan_last4         text,
  aadhaar_enc       bytea,
  aadhaar_last4     text,
  uan_enc           bytea,
  annual_ctc_enc    bytea,
  monthly_gross_enc bytea,
  updated_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at triggers for this migration's tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','roles','territories','teams','users','employees','employee_sensitive'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;
