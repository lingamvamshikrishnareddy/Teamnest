-- =====================================================================
-- TeamNest · 0005 · Platform: files, approvals, notifications, audit,
--                  settings, consents, location pings, imports
-- =====================================================================

-- Metadata for objects in Supabase Storage (buckets: avatars, documents,
-- kyc, payslips, invoices, recordings, visit-photos, selfies, imports).
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  bucket        text not null,
  path          text not null,
  mime_type     text,
  size_bytes    bigint,
  checksum      text,
  owner_user_id uuid references public.users(id) on delete set null,
  entity_table  text,
  entity_id     uuid,
  is_sensitive  boolean not null default false,
  retention_until date,
  created_at    timestamptz not null default now(),
  unique (bucket, path)
);
create index files_entity_idx on public.files(entity_table, entity_id);
create index files_owner_idx on public.files(owner_user_id);

-- Late foreign keys to files
alter table public.organizations add constraint organizations_logo_fk foreign key (logo_file_id) references public.files(id) on delete set null;
alter table public.calls        add constraint calls_recording_fk foreign key (recording_file_id) references public.files(id) on delete set null;
alter table public.visits       add constraint visits_photo_fk foreign key (check_in_photo_file_id) references public.files(id) on delete set null;
alter table public.invoices     add constraint invoices_file_fk foreign key (file_id) references public.files(id) on delete set null;
alter table public.receipts     add constraint receipts_file_fk foreign key (file_id) references public.files(id) on delete set null;
alter table public.attendance   add constraint attendance_selfie_fk foreign key (punch_in_selfie_file_id) references public.files(id) on delete set null;
alter table public.leave_requests add constraint leave_requests_file_fk foreign key (attachment_file_id) references public.files(id) on delete set null;
alter table public.payslips     add constraint payslips_file_fk foreign key (file_id) references public.files(id) on delete set null;
alter table public.documents    add constraint documents_file_fk foreign key (file_id) references public.files(id) on delete set null;
alter table public.reimbursements add constraint reimbursements_file_fk foreign key (receipt_file_id) references public.files(id) on delete set null;

-- Approval chains: configurable multi-step workflows per approval type.
--   steps: [{"role":"team_lead","relation":"manager"},{"role":"hr_admin"}]
--   conditions: {"min_amount":5000} or {"min_discount_pct":10}
create table public.approval_chains (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  type        public.approval_type not null,
  name        text not null,
  conditions  jsonb not null default '{}'::jsonb,
  steps       jsonb not null,
  priority    smallint not null default 100,
  sla_hours   smallint not null default 48,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index approval_chains_org_type_idx on public.approval_chains(org_id, type) where is_active;

-- Unified approvals inbox (leave, discounts, reimbursements, requests,
-- incentives, regularization, profile changes) for web and mobile.
create table public.approvals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  type           public.approval_type not null,
  chain_id       uuid references public.approval_chains(id) on delete set null,
  entity_table   text not null,
  entity_id      uuid not null,
  title          text not null,
  summary        text,
  amount         numeric(14,2),
  requested_by   uuid references public.users(id) on delete set null,  -- null for anonymous grievance
  approver_id    uuid references public.users(id) on delete set null,  -- current step's approver
  approver_role  public.app_role,                                     -- or anyone with this role
  current_step   smallint not null default 1,
  total_steps    smallint not null default 1,
  history        jsonb not null default '[]'::jsonb,                   -- [{step,by,decision,comment,at}]
  status         public.request_status not null default 'pending',
  due_at         timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index approvals_approver_idx on public.approvals(approver_id, status);
create index approvals_role_idx on public.approvals(org_id, approver_role, status);
create index approvals_entity_idx on public.approvals(entity_table, entity_id);
create index approvals_requested_by_idx on public.approvals(requested_by, created_at desc);

alter table public.quotes          add constraint quotes_approval_fk foreign key (approval_id) references public.approvals(id) on delete set null;
alter table public.leave_requests  add constraint leave_requests_approval_fk foreign key (approval_id) references public.approvals(id) on delete set null;
alter table public.requests        add constraint requests_approval_fk foreign key (approval_id) references public.approvals(id) on delete set null;
alter table public.reimbursements  add constraint reimbursements_approval_fk foreign key (approval_id) references public.approvals(id) on delete set null;
alter table public.incentives      add constraint incentives_approval_fk foreign key (approval_id) references public.approvals(id) on delete set null;

create table public.notification_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  code        text not null,                     -- e.g. approval.requested, follow_up.due
  channel     public.notification_channel not null,
  locale      text not null default 'en-IN',
  subject     text,
  body        text not null,                     -- {{placeholders}}
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, code, channel, locale)
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  channel      public.notification_channel not null default 'in_app',
  category     text not null default 'general',  -- approvals | leads | hr | payments | system
  title        text not null,
  body         text,
  data         jsonb not null default '{}'::jsonb, -- deep link: {"route":"/leads/<id>"}
  template_code text,
  read_at      timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios','android','web')),
  device_name text,
  last_used_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);

-- Append-only audit trail for sensitive actions. Written only by
-- security-definer triggers/functions; never updated or deleted by clients.
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  actor_id     uuid,
  actor_role   public.app_role,
  action       text not null,                 -- insert | update | delete | view_sensitive | login | export ...
  table_name   text,
  record_id    text,
  old_data     jsonb,
  new_data     jsonb,
  changed_fields text[],
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs(org_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs(table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

create table public.app_settings (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, key)
);

-- Privacy: explicit, versioned consent for call recording / location tracking.
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  type        public.consent_type not null,
  granted     boolean not null,
  notice_version text not null,
  device_info jsonb,
  created_at  timestamptz not null default now()
);
create index consents_user_type_idx on public.consents(user_id, type, created_at desc);

-- Live location (only accepted during working hours and with consent — see
-- the insert policy + app.can_track_location()).
create table public.location_pings (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  real,
  battery_pct smallint,
  recorded_at timestamptz not null default now()
);
create index location_pings_user_time_idx on public.location_pings(user_id, recorded_at desc);
create index location_pings_org_time_idx on public.location_pings(org_id, recorded_at desc);

-- Lead import batches (CSV/Excel) with validation + duplicate report.
create table public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  file_id        uuid references public.files(id) on delete set null,
  kind           text not null default 'leads',
  status         text not null default 'uploaded' check (status in ('uploaded','validating','validated','importing','completed','failed')),
  total_rows     integer not null default 0,
  valid_rows     integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows     integer not null default 0,
  errors         jsonb not null default '[]'::jsonb,   -- [{row, field, message}]
  options        jsonb not null default '{}'::jsonb,   -- {queue_code, assign:"round_robin", on_duplicate:"skip"}
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
alter table public.leads add constraint leads_import_batch_fk foreign key (import_batch_id) references public.import_batches(id) on delete set null;

-- Saved report/analytics views + scheduled email reports.
create table public.saved_views (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  module       text not null,                 -- reports.sales | analytics.leads ...
  name         text not null,
  config       jsonb not null,                -- filters, columns, grouping
  is_shared    boolean not null default false,
  schedule_cron text,                         -- e.g. '0 9 * * 1' (IST)
  schedule_recipients text[],
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index saved_views_user_idx on public.saved_views(user_id, module);

do $$
declare t text;
begin
  foreach t in array array['approval_chains','approvals','notification_templates','saved_views'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;
