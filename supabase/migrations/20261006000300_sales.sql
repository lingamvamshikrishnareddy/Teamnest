-- =====================================================================
-- TeamNest · 0003 · Field Sales & Lead Management
-- =====================================================================

-- Configurable outcome vocabulary (admins can add/rename; codes are stable keys).
create table public.outcome_codes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  code               text not null,
  label              text not null,
  color              text not null default 'slate',
  sets_lead_status   public.lead_status,                 -- lead status to move to
  requires_follow_up boolean not null default false,
  requires_remarks   boolean not null default false,
  is_terminal        boolean not null default false,     -- stops further dialling
  counts_as_contact  boolean not null default true,
  sort_order         smallint not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, code)
);

-- Rules-based queues. `rules` is a JSON filter evaluated by
-- public.lead_matches_rules(); nothing about a queue is hard-coded.
--   {"all":[{"field":"segment","op":"eq","value":"b2b"},
--           {"field":"priority_score","op":"gte","value":80}]}
create table public.lead_queues (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  code             text not null,
  name             text not null,
  description      text,
  rules            jsonb not null default '{"all":[]}'::jsonb,
  sort             jsonb not null default '[{"field":"priority_score","dir":"desc"}]'::jsonb,
  assignment_strategy text not null default 'manual' check (assignment_strategy in ('manual','round_robin','territory','load_balanced')),
  priority         smallint not null default 100,         -- lower = evaluated first
  color            text not null default 'blue',
  is_active        boolean not null default true,
  round_robin_cursor uuid,                                -- last user assigned (round robin)
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, code)
);

create table public.packages (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  code                 text not null,
  name                 text not null,
  tier                 text not null default 'standard',   -- starter | standard | premium | elite
  description          text,
  tenure_months        smallint not null check (tenure_months > 0),
  list_price           numeric(14,2) not null check (list_price >= 0),
  gst_pct              numeric(5,2) not null default 18.00,
  max_discount_pct     numeric(5,2) not null default 10.00, -- above this → approval
  hard_floor_discount_pct numeric(5,2) not null default 30.00, -- never allowed above
  features             jsonb not null default '[]'::jsonb,
  is_active            boolean not null default true,
  sort_order           smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, code),
  check (max_discount_pct <= hard_floor_discount_pct)
);

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  lead_code         text not null,                         -- human friendly e.g. TN-HYD-000123
  business_name     text not null,
  contact_name      text,
  phone             text not null,
  phone_normalized  text generated always as (public.normalize_phone(phone)) stored,
  alt_phone         text,
  whatsapp          text,
  email             citext,
  category          text,                                  -- e.g. Restaurant, Clinic, Salon
  segment           public.lead_segment not null default 'b2c',
  tag               text,                                  -- Hot | Renewal | New | Top B2B ...
  source            text not null default 'manual',        -- import | web | referral | partner | manual
  rating            numeric(2,1) check (rating between 0 and 5),
  reviews_count     integer not null default 0,
  address_line      text,
  locality          text,
  city              text,
  state             text,
  pincode           text,
  lat               double precision,
  lng               double precision,
  territory_id      uuid references public.territories(id) on delete set null,
  queue_id          uuid references public.lead_queues(id) on delete set null,
  owner_id          uuid references public.users(id) on delete set null,
  status            public.lead_status not null default 'new',
  priority_score    smallint not null default 50 check (priority_score between 0 and 100),
  last_outcome_code text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  is_dnc            boolean not null default false,
  expires_at        timestamptz,                           -- for Expired Paid / Renewals queues
  current_package_id uuid references public.packages(id) on delete set null,
  custom_fields     jsonb not null default '{}'::jsonb,
  import_batch_id   uuid,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, lead_code)
);
-- Duplicate detection: one live lead per phone per org.
create unique index leads_org_phone_uniq on public.leads(org_id, phone_normalized) where status not in ('invalid');
create index leads_owner_status_idx on public.leads(owner_id, status);
create index leads_org_queue_idx on public.leads(org_id, queue_id);
create index leads_org_territory_idx on public.leads(org_id, territory_id);
create index leads_next_follow_up_idx on public.leads(owner_id, next_follow_up_at) where next_follow_up_at is not null;
create index leads_pincode_idx on public.leads(org_id, pincode);
create index leads_business_name_trgm on public.leads using gin (business_name extensions.gin_trgm_ops);
create index leads_missing_location_idx on public.leads(org_id) where lat is null or lng is null;

create table public.lead_assignments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  from_user_id  uuid references public.users(id) on delete set null,
  to_user_id    uuid references public.users(id) on delete set null,
  queue_id      uuid references public.lead_queues(id) on delete set null,
  method        text not null check (method in ('manual','bulk','round_robin','territory','import','self')),
  reason        text,
  assigned_by   uuid references public.users(id) on delete set null,
  assigned_at   timestamptz not null default now()
);
create index lead_assignments_lead_idx on public.lead_assignments(lead_id, assigned_at desc);
create index lead_assignments_to_idx on public.lead_assignments(to_user_id, assigned_at desc);

create table public.calls (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  lead_id            uuid references public.leads(id) on delete set null,
  user_id            uuid not null references public.users(id) on delete cascade,
  direction          public.call_direction not null default 'outbound',
  channel            text not null default 'phone' check (channel in ('phone','whatsapp')),
  phone              text,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  duration_sec       integer not null default 0 check (duration_sec >= 0),
  connected          boolean not null default false,
  recording_consent  boolean not null default false,
  recording_file_id  uuid,                                 -- fk in platform migration
  client_ref         text,                                 -- idempotency key from offline mobile queue
  created_at         timestamptz not null default now(),
  constraint calls_recording_requires_consent check (recording_file_id is null or recording_consent),
  unique (user_id, client_ref)
);
create index calls_user_started_idx on public.calls(user_id, started_at desc);
create index calls_lead_idx on public.calls(lead_id, started_at desc);
create index calls_org_started_idx on public.calls(org_id, started_at desc);

create table public.visits (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  lead_id            uuid references public.leads(id) on delete set null,
  user_id            uuid not null references public.users(id) on delete cascade,
  purpose            text not null default 'pitch' check (purpose in ('pitch','demo','documents','collection','follow_up','other')),
  check_in_at        timestamptz not null default now(),
  check_in_lat       double precision not null,
  check_in_lng       double precision not null,
  check_in_accuracy_m real,
  check_in_photo_file_id uuid,
  check_out_at       timestamptz,
  check_out_lat      double precision,
  check_out_lng      double precision,
  distance_from_lead_m real,                              -- computed on check-in
  within_geofence    boolean,                             -- distance <= org geofence radius
  travel_distance_km numeric(8,2) not null default 0,     -- since previous visit / punch-in
  notes              text,
  client_ref         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at),
  unique (user_id, client_ref)
);
create index visits_user_checkin_idx on public.visits(user_id, check_in_at desc);
create index visits_lead_idx on public.visits(lead_id);
create index visits_org_checkin_idx on public.visits(org_id, check_in_at desc);

create table public.outcomes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  outcome_code      text not null,
  remarks           text,
  call_id           uuid references public.calls(id) on delete set null,
  visit_id          uuid references public.visits(id) on delete set null,
  next_follow_up_at timestamptz,
  client_ref        text,
  created_at        timestamptz not null default now(),
  foreign key (org_id, outcome_code) references public.outcome_codes(org_id, code) on update cascade,
  unique (user_id, client_ref)
);
create index outcomes_lead_idx on public.outcomes(lead_id, created_at desc);
create index outcomes_user_idx on public.outcomes(user_id, created_at desc);
create index outcomes_org_code_idx on public.outcomes(org_id, outcome_code, created_at desc);

create table public.follow_ups (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  kind          public.follow_up_kind not null default 'follow_up',
  due_at        timestamptz not null,
  status        public.task_status not null default 'pending',
  note          text,
  outcome_id    uuid references public.outcomes(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index follow_ups_user_due_idx on public.follow_ups(user_id, due_at) where status = 'pending';
create index follow_ups_lead_idx on public.follow_ups(lead_id);

create table public.meetings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  scheduled_at   timestamptz not null,
  duration_min   smallint not null default 30,
  mode           text not null default 'in_person' check (mode in ('in_person','video','phone')),
  location       text,
  agenda         text,
  status         public.meeting_status not null default 'scheduled',
  visit_id       uuid references public.visits(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index meetings_user_time_idx on public.meetings(user_id, scheduled_at);
create index meetings_lead_idx on public.meetings(lead_id);

create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  quote_no        text not null,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  package_id      uuid not null references public.packages(id) on delete restrict,
  created_by      uuid not null references public.users(id) on delete restrict,
  list_price      numeric(14,2) not null,
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount numeric(14,2) generated always as (round(list_price * discount_pct / 100, 2)) stored,
  net_price       numeric(14,2) generated always as (list_price - round(list_price * discount_pct / 100, 2)) stored,
  gst_pct         numeric(5,2) not null default 18.00,
  total_amount    numeric(14,2) generated always as (round((list_price - round(list_price * discount_pct / 100, 2)) * (1 + gst_pct / 100), 2)) stored,
  status          public.quote_status not null default 'draft',
  approval_id     uuid,                                    -- fk in platform migration
  valid_until     date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, quote_no)
);
create index quotes_lead_idx on public.quotes(lead_id);

create table public.deals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  deal_no          text not null,
  lead_id          uuid not null references public.leads(id) on delete restrict,
  quote_id         uuid references public.quotes(id) on delete set null,
  package_id       uuid not null references public.packages(id) on delete restrict,
  owner_id         uuid not null references public.users(id) on delete restrict,
  team_id          uuid references public.teams(id) on delete set null,
  contract_value   numeric(14,2) not null check (contract_value >= 0),   -- net of discount, ex-GST
  tenure_months    smallint not null,
  is_renewal       boolean not null default false,
  renewal_term     text check (renewal_term in ('1y','3y')),
  payment_mode     public.payment_mode not null,
  status           public.deal_status not null default 'pending_payment',
  closed_at        timestamptz not null default now(),
  start_date       date,
  end_date         date,
  cancelled_at     timestamptz,
  cancel_reason    text,
  downgraded_from_package_id uuid references public.packages(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, deal_no)
);
create index deals_owner_closed_idx on public.deals(owner_id, closed_at desc);
create index deals_org_closed_idx on public.deals(org_id, closed_at desc);
create index deals_lead_idx on public.deals(lead_id);

create table public.mandates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  deal_id          uuid not null references public.deals(id) on delete cascade,
  provider         text not null default 'demo-gateway',
  umrn             text,                                   -- unique mandate reference (from bank)
  max_amount       numeric(14,2) not null,
  frequency        text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly','as_presented')),
  start_date       date not null,
  end_date         date,
  status           public.mandate_status not null default 'initiated',
  bounce_count     smallint not null default 0,
  last_bounce_at   timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index mandates_deal_idx on public.mandates(deal_id);
create index mandates_org_status_idx on public.mandates(org_id, status);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  deal_id          uuid not null references public.deals(id) on delete cascade,
  mandate_id       uuid references public.mandates(id) on delete set null,
  amount           numeric(14,2) not null check (amount > 0),
  method           public.payment_method not null,
  status           public.payment_status not null default 'initiated',
  gateway_ref      text,
  payment_link     text,
  collected_by     uuid references public.users(id) on delete set null,
  due_date         date,
  paid_at          timestamptz,
  failure_reason   text,
  attempt_no       smallint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index payments_deal_idx on public.payments(deal_id);
create index payments_org_status_idx on public.payments(org_id, status, created_at desc);
create index payments_collected_by_idx on public.payments(collected_by, paid_at desc);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  invoice_no      text not null,
  kind            public.invoice_kind not null,
  deal_id         uuid not null references public.deals(id) on delete cascade,
  bill_to         jsonb not null default '{}'::jsonb,       -- {name, gstin, address}
  subtotal        numeric(14,2) not null,
  discount        numeric(14,2) not null default 0,
  cgst            numeric(14,2) not null default 0,
  sgst            numeric(14,2) not null default 0,
  igst            numeric(14,2) not null default 0,
  total           numeric(14,2) not null,
  issued_at       timestamptz not null default now(),
  due_date        date,
  file_id         uuid,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (org_id, invoice_no)
);
create index invoices_deal_idx on public.invoices(deal_id);

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  receipt_no      text not null,
  payment_id      uuid not null unique references public.payments(id) on delete cascade,
  amount          numeric(14,2) not null,
  issued_at       timestamptz not null default now(),
  file_id         uuid,
  created_at      timestamptz not null default now(),
  unique (org_id, receipt_no)
);

-- Monthly targets per user (or per team when user_id is null).
create table public.targets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid references public.users(id) on delete cascade,
  team_id        uuid references public.teams(id) on delete cascade,
  period_month   date not null check (extract(day from period_month) = 1),
  metric         text not null,                         -- revenue | deals | collections | calls | talk_time_min | visits | meetings | autopay_pct
  target_value   numeric(14,2) not null,
  weightage_pct  numeric(5,2) not null default 0,
  set_by         uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (user_id is not null or team_id is not null)
);
create unique index targets_user_uniq on public.targets(user_id, period_month, metric) where user_id is not null;
create unique index targets_team_uniq on public.targets(team_id, period_month, metric) where user_id is null;

-- Daily activity rollup per user. Maintained by triggers (calls, visits,
-- outcomes, deals, payments) so dashboards never scan raw activity tables.
create table public.daily_kpis (
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  day             date not null,
  calls           integer not null default 0,
  connected_calls integer not null default 0,
  talk_time_sec   integer not null default 0,
  visits          integer not null default 0,
  distance_km     numeric(8,2) not null default 0,
  meetings        integer not null default 0,
  outcomes        integer not null default 0,
  deals           integer not null default 0,
  revenue         numeric(14,2) not null default 0,
  collections     numeric(14,2) not null default 0,
  autopay_deals   integer not null default 0,
  online_payments integer not null default 0,
  activity_points integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (user_id, day)
);
create index daily_kpis_org_day_idx on public.daily_kpis(org_id, day);

-- Ratings: an employee's performance rating (subject_user_id) or a
-- customer review of a business lead (lead_id).
create table public.ratings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_user_id uuid references public.users(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  score           numeric(2,1) not null check (score between 0 and 5),
  comment         text,
  source          text not null default 'manager' check (source in ('manager','customer','system')),
  period_month    date,
  given_by        uuid references public.users(id) on delete set null,
  reviewer_name   text,
  created_at      timestamptz not null default now(),
  check (num_nonnulls(subject_user_id, lead_id) = 1)
);
create index ratings_subject_idx on public.ratings(subject_user_id, created_at desc);
create index ratings_lead_idx on public.ratings(lead_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['outcome_codes','lead_queues','packages','leads','visits','follow_ups','meetings','quotes','deals','mandates','payments','targets'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;
