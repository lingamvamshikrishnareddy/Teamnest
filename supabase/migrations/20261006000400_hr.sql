-- =====================================================================
-- TeamNest · 0004 · Employee HR self-service
-- =====================================================================

create table public.shifts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  start_time        time not null,
  end_time          time not null,
  grace_minutes     smallint not null default 15,
  half_day_minutes  smallint not null default 240,       -- worked < this → half day
  full_day_minutes  smallint not null default 480,
  working_days      smallint[] not null default '{1,2,3,4,5,6}', -- ISO dow, 1 = Monday
  late_marks_per_half_day smallint not null default 3,     -- N late marks = ½ day deduction
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, name)
);
alter table public.employees
  add constraint employees_shift_fk foreign key (shift_id) references public.shifts(id) on delete set null;

create table public.geofences (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  territory_id   uuid references public.territories(id) on delete set null,
  name           text not null,
  kind           text not null default 'office' check (kind in ('office','branch','client_zone')),
  lat            double precision not null,
  lng            double precision not null,
  radius_m       integer not null default 200 check (radius_m between 20 and 50000),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index geofences_org_idx on public.geofences(org_id) where is_active;

create table public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  day                date not null,
  status             public.attendance_status not null default 'present',
  source             public.attendance_source not null default 'punch',
  shift_id           uuid references public.shifts(id) on delete set null,
  punch_in_at        timestamptz,
  punch_in_lat       double precision,
  punch_in_lng       double precision,
  punch_in_geofence_id uuid references public.geofences(id) on delete set null,
  punch_in_selfie_file_id uuid,
  punch_out_at       timestamptz,
  punch_out_lat      double precision,
  punch_out_lng      double precision,
  work_minutes       integer generated always as (
                       case when punch_in_at is not null and punch_out_at is not null
                            then greatest(0, (extract(epoch from (punch_out_at - punch_in_at)) / 60)::int)
                       end) stored,
  is_late            boolean not null default false,
  activity_points    integer not null default 0,           -- from calls + visits (integration)
  first_activity_at  timestamptz,                          -- earliest call/visit of the day
  last_activity_at   timestamptz,
  remarks            text,
  is_locked          boolean not null default false,       -- set by monthly attendance lock
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, day),
  check (punch_out_at is null or punch_in_at is null or punch_out_at >= punch_in_at)
);
create index attendance_org_day_idx on public.attendance(org_id, day);

create table public.attendance_locks (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  locked_by    uuid references public.users(id) on delete set null,
  locked_at    timestamptz not null default now(),
  primary key (org_id, period_month)
);

create table public.leave_types (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  code                 text not null,                    -- CL | SL | EL | CO | LOP | ML | PL
  name                 text not null,
  color                text not null default 'teal',
  is_paid              boolean not null default true,
  annual_quota         numeric(5,1) not null default 0,
  accrual              text not null default 'monthly' check (accrual in ('monthly','quarterly','yearly','none')),
  carry_forward_max    numeric(5,1) not null default 0,
  encashable           boolean not null default false,
  allow_half_day       boolean not null default true,
  min_notice_days      smallint not null default 0,
  max_consecutive_days smallint,
  document_required_after_days smallint,
  applicable_gender    text,                              -- null = all
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, code)
);

create table public.leave_balances (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  leave_type_id    uuid not null references public.leave_types(id) on delete cascade,
  year             smallint not null,
  opening          numeric(5,1) not null default 0,
  accrued          numeric(5,1) not null default 0,
  carried_forward  numeric(5,1) not null default 0,
  used             numeric(5,1) not null default 0,
  adjusted         numeric(5,1) not null default 0,
  balance          numeric(5,1) generated always as (opening + accrued + carried_forward + adjusted - used) stored,
  updated_at       timestamptz not null default now(),
  unique (user_id, leave_type_id, year)
);

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  leave_type_id  uuid not null references public.leave_types(id) on delete restrict,
  from_date      date not null,
  to_date        date not null,
  half_day       text check (half_day in ('first_half','second_half')),
  days           numeric(5,1) not null check (days > 0),
  reason         text,
  attachment_file_id uuid,
  status         public.request_status not null default 'pending',
  approval_id    uuid,
  decided_by     uuid references public.users(id) on delete set null,
  decided_at     timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (to_date >= from_date),
  check (half_day is null or from_date = to_date)
);
create index leave_requests_user_idx on public.leave_requests(user_id, from_date desc);
create index leave_requests_org_status_idx on public.leave_requests(org_id, status);
create index leave_requests_dates_idx on public.leave_requests(user_id, from_date, to_date) where status = 'approved';

create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  day         date not null,
  name        text not null,
  city        text,                                    -- null = all cities
  is_optional boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index holidays_uniq on public.holidays(org_id, day, coalesce(city, '*'));

create table public.payslips (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  period_month    date not null check (extract(day from period_month) = 1),
  paid_days       numeric(4,1) not null,
  lop_days        numeric(4,1) not null default 0,
  earnings        jsonb not null default '[]'::jsonb,   -- [{code,label,amount}]
  deductions      jsonb not null default '[]'::jsonb,
  gross           numeric(14,2) not null,
  total_deductions numeric(14,2) not null default 0,
  net_pay         numeric(14,2) generated always as (gross - total_deductions) stored,
  incentive_amount numeric(14,2) not null default 0,
  reimbursement_amount numeric(14,2) not null default 0,
  status          public.payslip_status not null default 'draft',
  file_id         uuid,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, period_month)
);

create table public.document_categories (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  code           text not null,
  name           text not null,
  context        public.document_context not null default 'employee',
  is_sensitive   boolean not null default false,
  is_mandatory   boolean not null default false,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  unique (org_id, code)
);

-- Both the employee vault and customer KYC documents.
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  category_id      uuid not null references public.document_categories(id) on delete restrict,
  owner_user_id    uuid references public.users(id) on delete cascade,  -- employee docs
  lead_id          uuid references public.leads(id) on delete cascade,  -- KYC docs
  deal_id          uuid references public.deals(id) on delete set null,
  title            text not null,
  file_id          uuid,
  status           public.document_status not null default 'pending',
  rejection_reason text,
  verified_by      uuid references public.users(id) on delete set null,
  verified_at      timestamptz,
  valid_until      date,
  uploaded_by      uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(owner_user_id, lead_id) >= 1)
);
create index documents_owner_idx on public.documents(owner_user_id);
create index documents_lead_idx on public.documents(lead_id);
create index documents_org_status_idx on public.documents(org_id, status);

create table public.requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  request_no     text not null,
  type           public.request_type not null,
  user_id        uuid references public.users(id) on delete cascade,   -- null when anonymous
  is_anonymous   boolean not null default false,
  subject        text not null,
  details        text,
  payload        jsonb not null default '{}'::jsonb,   -- type-specific (dates, amounts, field diffs ...)
  status         public.request_status not null default 'pending',
  approval_id    uuid,
  resolution     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, request_no),
  check (is_anonymous = (user_id is null)),
  check (not is_anonymous or type = 'grievance')
);
create index requests_user_idx on public.requests(user_id, created_at desc);
create index requests_org_type_status_idx on public.requests(org_id, type, status);

create table public.policies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  category        text not null default 'policy' check (category in ('policy','announcement','update','event','job_posting')),
  body_md         text not null,
  version         smallint not null default 1,
  requires_ack    boolean not null default false,
  audience_roles  public.app_role[],                     -- null = everyone
  audience_cities text[],
  published_at    timestamptz,
  expires_at      timestamptz,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index policies_org_published_idx on public.policies(org_id, published_at desc);

create table public.policy_acknowledgements (
  policy_id        uuid not null references public.policies(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  policy_version   smallint not null,
  acknowledged_at  timestamptz not null default now(),
  primary key (policy_id, user_id, policy_version)
);

create table public.appraisal_cycles (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  period_start   date not null,
  period_end     date not null,
  self_review_due date,
  manager_review_due date,
  status         text not null default 'planned' check (status in ('planned','active','review','closed')),
  rating_scale   jsonb not null default '[{"min":0,"max":2,"label":"Needs improvement"},{"min":2,"max":3.5,"label":"Meets expectations"},{"min":3.5,"max":4.5,"label":"Exceeds"},{"min":4.5,"max":5,"label":"Outstanding"}]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end > period_start)
);

-- KRA/KPI goals. metric_key links a goal to live sales data
-- (revenue | deals | collections | talk_time_min | visits | autopay_pct ...);
-- when auto_source is true, achieved_value is refreshed from daily_kpis.
create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  cycle_id       uuid references public.appraisal_cycles(id) on delete cascade,
  kra            text not null,
  title          text not null,
  metric_key     text,
  auto_source    boolean not null default false,
  target_value   numeric(14,2) not null,
  achieved_value numeric(14,2) not null default 0,
  weightage_pct  numeric(5,2) not null check (weightage_pct between 0 and 100),
  strengths      text,
  improvements   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index goals_user_cycle_idx on public.goals(user_id, cycle_id);

create table public.appraisals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  cycle_id        uuid not null references public.appraisal_cycles(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  reviewer_id     uuid references public.users(id) on delete set null,
  status          public.appraisal_status not null default 'not_started',
  self_score      numeric(3,2),
  manager_score   numeric(3,2),
  final_score     numeric(3,2),
  strengths       text,
  improvements    text,
  manager_comments text,
  submitted_at    timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create table public.reimbursements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  category        text not null check (category in ('travel','fuel','food','phone','client_meeting','stationery','other')),
  expense_date    date not null,
  amount          numeric(14,2) not null check (amount > 0),
  distance_km     numeric(8,2),                            -- for fuel claims (from visits)
  description     text,
  receipt_file_id uuid,
  status          public.request_status not null default 'pending',
  approval_id     uuid,
  payroll_month   date,                                    -- set when pushed to payroll
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index reimbursements_user_idx on public.reimbursements(user_id, expense_date desc);
create index reimbursements_org_status_idx on public.reimbursements(org_id, status);

-- Incentives: calculated from deals/collections, approved, then flow to payroll.
create table public.incentives (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  period_month    date not null check (extract(day from period_month) = 1),
  deal_id         uuid references public.deals(id) on delete set null,
  basis           text not null,                           -- deal_slab | collection | autopay_bonus | target_kicker | adjustment
  base_amount     numeric(14,2) not null default 0,        -- amount the % was applied to
  rate_pct        numeric(5,2),
  amount          numeric(14,2) not null,
  status          public.incentive_status not null default 'calculated',
  approval_id     uuid,
  approved_by     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  payroll_month   date,
  payslip_id      uuid references public.payslips(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index incentives_user_period_idx on public.incentives(user_id, period_month);
create index incentives_org_status_idx on public.incentives(org_id, status);
create unique index incentives_deal_basis_uniq on public.incentives(deal_id, basis) where deal_id is not null;

do $$
declare t text;
begin
  foreach t in array array['shifts','geofences','attendance','leave_types','leave_requests','payslips','documents','requests','policies','appraisal_cycles','goals','appraisals','reimbursements','incentives'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function app.touch_updated_at()', t, t);
  end loop;
  execute 'create trigger leave_balances_touch before update on public.leave_balances for each row execute function app.touch_updated_at()';
end $$;
