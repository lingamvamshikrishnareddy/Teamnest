-- =====================================================================
-- TeamNest · 0006 · Functions & triggers
--   1. Auth/role helpers used by RLS
--   2. Defaults (org_id, actor) and human-friendly numbering
--   3. Encryption of sensitive HR fields + masked access
--   4. Audit logging
--   5. Auth hooks (new user, custom JWT claims)
--   6. Sales → HR integration (activity → KPIs, attendance, lead state)
--   7. Lead queues & assignment helpers
--   8. Unified approvals engine
-- All SECURITY DEFINER functions pin search_path = '' and fully qualify
-- every identifier.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auth / role helpers
-- ---------------------------------------------------------------------
create or replace function public.auth_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select u.org_id from public.users u where u.id = auth.uid() $$;

create or replace function public.auth_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$ select u.role from public.users u where u.id = auth.uid() and u.status <> 'inactive' $$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.auth_role() = any(roles), false) $$;

-- True when `target` sits anywhere below the current user in the
-- manager hierarchy (Executive → Team Lead → Area Manager ...).
create or replace function public.reports_to_me(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive chain as (
    select u.id, u.manager_id, 1 as depth from public.users u where u.id = target
    union all
    select u.id, u.manager_id, c.depth + 1
    from public.users u join chain c on u.id = c.manager_id
    where c.depth < 12
  )
  select auth.uid() is not null
     and target is not null
     and exists (select 1 from chain where manager_id = auth.uid())
$$;

-- Every user id in the caller's downline (excluding the caller).
create or replace function public.my_team_user_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with recursive down as (
    select u.id, 1 as depth from public.users u where u.manager_id = auth.uid()
    union all
    select u.id, d.depth + 1 from public.users u join down d on u.manager_id = d.id where d.depth < 12
  )
  select id from down
$$;

-- Sales data visibility: self, downline, or org-wide sales roles.
create or replace function public.can_view_sales_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target = auth.uid()
      or public.has_role('super_admin', 'finance')
      or public.reports_to_me(target)
$$;

-- HR data visibility (attendance, leave, goals): self, downline, HR.
create or replace function public.can_view_hr_of(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target = auth.uid()
      or public.has_role('hr_admin', 'super_admin')
      or public.reports_to_me(target)
$$;

-- Same org check for a user id (used in insert policies).
create or replace function public.same_org_user(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.users u where u.id = target and u.org_id = public.auth_org_id()) $$;

create or replace function public.is_on_leave(p_user uuid, p_day date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leave_requests lr
    where lr.user_id = p_user and lr.status = 'approved'
      and p_day between lr.from_date and lr.to_date
  )
$$;

create or replace function public.setting(p_org uuid, p_key text, p_default jsonb default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce((select s.value from public.app_settings s where s.org_id = p_org and s.key = p_key), p_default) $$;

-- ---------------------------------------------------------------------
-- 2. Defaults & numbering
-- ---------------------------------------------------------------------
-- Every org_id column defaults to the caller's org, so clients never need
-- to send it (RLS still verifies it).
do $$
declare r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I alter column org_id set default public.auth_org_id()', r.table_name);
  end loop;
end $$;

-- Actor columns default to the caller.
alter table public.calls            alter column user_id set default auth.uid();
alter table public.visits           alter column user_id set default auth.uid();
alter table public.outcomes         alter column user_id set default auth.uid();
alter table public.follow_ups       alter column user_id set default auth.uid();
alter table public.meetings         alter column user_id set default auth.uid();
alter table public.attendance       alter column user_id set default auth.uid();
alter table public.leave_requests   alter column user_id set default auth.uid();
alter table public.reimbursements   alter column user_id set default auth.uid();
alter table public.consents         alter column user_id set default auth.uid();
alter table public.location_pings   alter column user_id set default auth.uid();
alter table public.notifications    alter column user_id set default auth.uid();
alter table public.saved_views      alter column user_id set default auth.uid();
alter table public.quotes           alter column created_by set default auth.uid();
alter table public.leads            alter column created_by set default auth.uid();
alter table public.documents        alter column uploaded_by set default auth.uid();

create table public.number_sequences (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null,
  prefix     text not null,
  next_value bigint not null default 1,
  pad        smallint not null default 6,
  primary key (org_id, kind)
);

create or replace function app.next_number(p_org uuid, p_kind text, p_prefix text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v bigint; v_prefix text; v_pad smallint;
begin
  insert into public.number_sequences as s (org_id, kind, prefix)
  values (p_org, p_kind, p_prefix)
  on conflict (org_id, kind) do update set next_value = s.next_value + 1
  returning s.next_value, s.prefix, s.pad into v, v_prefix, v_pad;
  return v_prefix || lpad(v::text, v_pad, '0');
end;
$$;

create or replace function app.assign_number()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare col text := tg_argv[0]; kind text := tg_argv[1]; prefix text := tg_argv[2];
begin
  if (to_jsonb(new) ->> col) is null then
    new := jsonb_populate_record(new, jsonb_build_object(col, app.next_number(new.org_id, kind, prefix)));
  end if;
  return new;
end;
$$;

create trigger leads_number    before insert on public.leads    for each row execute function app.assign_number('lead_code',  'lead',     'TN-L-');
create trigger quotes_number   before insert on public.quotes   for each row execute function app.assign_number('quote_no',   'quote',    'QT-');
create trigger deals_number    before insert on public.deals    for each row execute function app.assign_number('deal_no',    'deal',     'DL-');
create trigger invoices_number before insert on public.invoices for each row execute function app.assign_number('invoice_no', 'invoice',  'INV-');
create trigger receipts_number before insert on public.receipts for each row execute function app.assign_number('receipt_no', 'receipt',  'RCT-');
create trigger requests_number before insert on public.requests for each row execute function app.assign_number('request_no', 'request',  'REQ-');

-- Non-admins may only edit a few of their own profile fields; everything
-- else (role, manager, team, status, email) goes through HR.
create or replace function app.guard_user_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_role('hr_admin', 'super_admin') then
    return new;
  end if;
  if new.id <> auth.uid() then
    raise exception 'You can only update your own profile' using errcode = '42501';
  end if;
  if (new.role, new.org_id, new.team_id, new.manager_id, new.territory_id, new.status, new.email, new.full_name)
     is distinct from
     (old.role, old.org_id, old.team_id, old.manager_id, old.territory_id, old.status, old.email, old.full_name) then
    raise exception 'Profile changes to these fields need an HR-approved edit request' using errcode = '42501';
  end if;
  -- only super admins may grant super_admin, enforced above
  return new;
end;
$$;
create trigger users_guard before update on public.users for each row execute function app.guard_user_update();

-- ---------------------------------------------------------------------
-- 3. Sensitive HR fields (encrypted at rest)
-- ---------------------------------------------------------------------
create or replace function app.encryption_key()
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into k using 'teamnest_encryption_key';
  end if;
  k := coalesce(k, nullif(current_setting('app.encryption_key', true), ''));
  if k is null then
    raise exception 'Encryption key not configured (Vault secret teamnest_encryption_key or app.encryption_key)';
  end if;
  return k;
end;
$$;

create or replace function app.encrypt(p text)
returns bytea
language sql stable security definer set search_path = ''
as $$ select case when p is null or p = '' then null else extensions.pgp_sym_encrypt(p, app.encryption_key()) end $$;

create or replace function app.decrypt(p bytea)
returns text
language sql stable security definer set search_path = ''
as $$ select case when p is null then null else extensions.pgp_sym_decrypt(p, app.encryption_key()) end $$;

create or replace function public.mask_tail(p text, keep int default 4)
returns text
language sql immutable
as $$ select case when p is null or p = '' then null else repeat('•', 4) || ' ' || right(p, keep) end $$;

-- Writes (HR / Super Admin only). Pass null to leave a field unchanged.
create or replace function public.set_employee_sensitive(
  p_employee_id uuid,
  p_bank_name text default null, p_bank_ifsc text default null, p_bank_account text default null,
  p_pan text default null, p_aadhaar text default null, p_uan text default null,
  p_annual_ctc numeric default null, p_monthly_gross numeric default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select e.org_id into v_org from public.employees e where e.id = p_employee_id;
  if v_org is null then raise exception 'Employee not found'; end if;
  if auth.uid() is not null and not (public.has_role('hr_admin', 'super_admin') and v_org = public.auth_org_id()) then
    raise exception 'Only HR can change sensitive employee fields' using errcode = '42501';
  end if;

  insert into public.employee_sensitive as s (employee_id, org_id) values (p_employee_id, v_org)
  on conflict (employee_id) do nothing;

  update public.employee_sensitive s set
    bank_name          = coalesce(p_bank_name, s.bank_name),
    bank_ifsc          = coalesce(upper(p_bank_ifsc), s.bank_ifsc),
    bank_account_enc   = coalesce(app.encrypt(p_bank_account), s.bank_account_enc),
    bank_account_last4 = coalesce(right(p_bank_account, 4), s.bank_account_last4),
    pan_enc            = coalesce(app.encrypt(upper(p_pan)), s.pan_enc),
    pan_last4          = coalesce(right(upper(p_pan), 4), s.pan_last4),
    aadhaar_enc        = coalesce(app.encrypt(regexp_replace(p_aadhaar, '\D', '', 'g')), s.aadhaar_enc),
    aadhaar_last4      = coalesce(right(regexp_replace(p_aadhaar, '\D', '', 'g'), 4), s.aadhaar_last4),
    uan_enc            = coalesce(app.encrypt(p_uan), s.uan_enc),
    annual_ctc_enc     = coalesce(app.encrypt(p_annual_ctc::text), s.annual_ctc_enc),
    monthly_gross_enc  = coalesce(app.encrypt(p_monthly_gross::text), s.monthly_gross_enc),
    updated_by         = auth.uid()
  where s.employee_id = p_employee_id;
end;
$$;

-- Reads. Owner, HR Admin and Finance get clear values; anyone else in the
-- org who can see the employee gets masked values; viewing someone else's
-- clear values is audited.
create or replace function public.get_employee_sensitive(p_employee_id uuid)
returns table (
  employee_id uuid, is_masked boolean,
  bank_name text, bank_ifsc text, bank_account text, pan text, aadhaar text, uan text,
  annual_ctc numeric, monthly_gross numeric
)
language plpgsql volatile security definer set search_path = ''   -- volatile: writes an audit row
as $$
declare v_owner uuid; v_org uuid; v_clear boolean;
begin
  select e.user_id, e.org_id into v_owner, v_org from public.employees e where e.id = p_employee_id;
  if v_org is null or v_org is distinct from public.auth_org_id() then
    return;
  end if;
  if not (v_owner = auth.uid() or public.can_view_hr_of(v_owner) or public.has_role('finance')) then
    return;
  end if;
  v_clear := v_owner = auth.uid() or public.has_role('hr_admin', 'finance');

  if v_clear and v_owner <> auth.uid() then
    insert into public.audit_logs (org_id, actor_id, actor_role, action, table_name, record_id)
    values (v_org, auth.uid(), public.auth_role(), 'view_sensitive', 'employee_sensitive', p_employee_id::text);
  end if;

  return query
  select s.employee_id, not v_clear, s.bank_name, s.bank_ifsc,
    case when v_clear then app.decrypt(s.bank_account_enc) else public.mask_tail(s.bank_account_last4) end,
    case when v_clear then app.decrypt(s.pan_enc)          else public.mask_tail(s.pan_last4) end,
    case when v_clear then app.decrypt(s.aadhaar_enc)      else public.mask_tail(s.aadhaar_last4) end,
    case when v_clear then app.decrypt(s.uan_enc)          else null end,
    case when v_clear then app.decrypt(s.annual_ctc_enc)::numeric    else null end,
    case when v_clear then app.decrypt(s.monthly_gross_enc)::numeric else null end
  from public.employee_sensitive s where s.employee_id = p_employee_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Audit logging
-- ---------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_changed text[];
  v_org uuid;
  k text;
begin
  -- never copy ciphertext into the audit trail
  for k in select jsonb_object_keys(coalesce(v_new, v_old)) loop
    if k like '%\_enc' then
      v_old := v_old - k; v_new := v_new - k;
      if tg_op = 'UPDATE' and (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
        v_changed := array_append(v_changed, k);
      end if;
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    select array_cat(v_changed, array_agg(n.key)) into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('updated_at') and (v_old -> n.key) is distinct from n.value;
    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return new;
    end if;
  end if;

  v_org := coalesce((v_new ->> 'org_id')::uuid, (v_old ->> 'org_id')::uuid);
  -- when a whole tenant is being deleted (cascade), keep the trail but detach it
  if v_org is not null and not exists (select 1 from public.organizations o where o.id = v_org) then
    v_org := null;
  end if;
  insert into public.audit_logs (org_id, actor_id, actor_role, action, table_name, record_id, old_data, new_data, changed_fields)
  values (
    v_org, auth.uid(), public.auth_role(), lower(tg_op), tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'employee_id', v_old ->> 'employee_id', v_new ->> 'key'),
    v_old, v_new, v_changed
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','roles','employees','employee_sensitive','deals','payments','mandates','invoices','quotes',
    'packages','lead_queues','incentives','payslips','approvals','approval_chains','app_settings',
    'attendance_locks','targets','leave_types','outcome_codes','geofences','shifts'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t, t);
  end loop;
end $$;

-- Explicit audit entries from the apps (exports, logins, sensitive views).
create or replace function public.log_audit_event(p_action text, p_table text default null, p_record text default null, p_details jsonb default null)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_logs (org_id, actor_id, actor_role, action, table_name, record_id, new_data)
  select public.auth_org_id(), auth.uid(), public.auth_role(), p_action, p_table, p_record, p_details
  where auth.uid() is not null
$$;

-- ---------------------------------------------------------------------
-- 5. Auth hooks
-- ---------------------------------------------------------------------
-- Creates the public.users profile when an admin invites/creates a user.
-- org_id and role come from app_metadata (server-controlled), never from
-- user_metadata (which the end user can edit).
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := (new.raw_app_meta_data ->> 'org_id')::uuid;
begin
  if v_org is null then
    return new;  -- self sign-ups without an org are not provisioned
  end if;
  insert into public.users (id, org_id, role, full_name, email, phone, manager_id, team_id)
  values (
    new.id, v_org,
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'executive'),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email, new.phone,
    (new.raw_app_meta_data ->> 'manager_id')::uuid,
    (new.raw_app_meta_data ->> 'team_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- Supabase "Custom Access Token" hook: adds role + org to the JWT so the
-- apps can route/hide modules without an extra round-trip. Enable it in
-- Dashboard → Authentication → Hooks (or config.toml) .
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb); v_user record;
begin
  select u.role, u.org_id, u.status, r.requires_mfa
    into v_user
  from public.users u join public.roles r on r.code = u.role
  where u.id = (event ->> 'user_id')::uuid;

  if found then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_user.role::text));
    v_claims := jsonb_set(v_claims, '{org_id}', to_jsonb(v_user.org_id::text));
    v_claims := jsonb_set(v_claims, '{requires_mfa}', to_jsonb(v_user.requires_mfa));
    v_claims := jsonb_set(v_claims, '{user_status}', to_jsonb(v_user.status::text));
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant select on public.users, public.roles to supabase_auth_admin;
  end if;
end $$;
revoke execute on function public.custom_access_token_hook(jsonb) from public;

-- ---------------------------------------------------------------------
-- 6. Sales → HR integration
-- ---------------------------------------------------------------------
-- Upserts one user's daily KPI row by adding deltas.
create or replace function app.bump_kpis(p_org uuid, p_user uuid, p_day date, p_delta jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.daily_kpis as k (org_id, user_id, day, calls, connected_calls, talk_time_sec, visits, distance_km,
                                      meetings, outcomes, deals, revenue, collections, autopay_deals, online_payments, activity_points)
  values (p_org, p_user, p_day,
    coalesce((p_delta->>'calls')::int, 0), coalesce((p_delta->>'connected_calls')::int, 0),
    coalesce((p_delta->>'talk_time_sec')::int, 0), coalesce((p_delta->>'visits')::int, 0),
    coalesce((p_delta->>'distance_km')::numeric, 0), coalesce((p_delta->>'meetings')::int, 0),
    coalesce((p_delta->>'outcomes')::int, 0), coalesce((p_delta->>'deals')::int, 0),
    coalesce((p_delta->>'revenue')::numeric, 0), coalesce((p_delta->>'collections')::numeric, 0),
    coalesce((p_delta->>'autopay_deals')::int, 0), coalesce((p_delta->>'online_payments')::int, 0),
    coalesce((p_delta->>'activity_points')::int, 0))
  on conflict (user_id, day) do update set
    calls           = k.calls + excluded.calls,
    connected_calls = k.connected_calls + excluded.connected_calls,
    talk_time_sec   = k.talk_time_sec + excluded.talk_time_sec,
    visits          = k.visits + excluded.visits,
    distance_km     = k.distance_km + excluded.distance_km,
    meetings        = k.meetings + excluded.meetings,
    outcomes        = k.outcomes + excluded.outcomes,
    deals           = k.deals + excluded.deals,
    revenue         = k.revenue + excluded.revenue,
    collections     = k.collections + excluded.collections,
    autopay_deals   = k.autopay_deals + excluded.autopay_deals,
    online_payments = k.online_payments + excluded.online_payments,
    activity_points = k.activity_points + excluded.activity_points,
    updated_at      = now();
end;
$$;

-- Field activity (calls, visits) counts toward attendance: the first
-- activity of the day creates a "present" row (source field_visit /
-- call_activity) unless the day is locked; points always accumulate.
create or replace function app.register_activity(p_org uuid, p_user uuid, p_at timestamptz, p_points int, p_source public.attendance_source)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_day date := (p_at at time zone 'Asia/Kolkata')::date;
begin
  insert into public.attendance as a (org_id, user_id, day, status, source, activity_points, first_activity_at, last_activity_at)
  values (p_org, p_user, v_day, 'present', p_source, p_points, p_at, p_at)
  on conflict (user_id, day) do update set
    activity_points   = a.activity_points + excluded.activity_points,
    first_activity_at = least(a.first_activity_at, excluded.first_activity_at),
    last_activity_at  = greatest(a.last_activity_at, excluded.last_activity_at),
    status = case when a.status = 'absent' and not a.is_locked
                  and (select count(*) from public.visits v where v.user_id = p_user
                         and (v.check_in_at at time zone 'Asia/Kolkata')::date = v_day) > 0
                  then 'present'::public.attendance_status else a.status end;
end;
$$;

create or replace function app.on_call_logged()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_pts jsonb := public.setting(new.org_id, 'activity_points', '{"call":1,"connected_call":2,"talk_minute_per_point":5,"visit":5}');
        v_points int;
begin
  v_points := case when new.connected then (v_pts->>'connected_call')::int else (v_pts->>'call')::int end
              + (new.duration_sec / 60) / greatest((v_pts->>'talk_minute_per_point')::int, 1);
  perform app.bump_kpis(new.org_id, new.user_id, (new.started_at at time zone 'Asia/Kolkata')::date,
    jsonb_build_object('calls', 1, 'connected_calls', case when new.connected then 1 else 0 end,
                       'talk_time_sec', new.duration_sec, 'activity_points', v_points));
  perform app.register_activity(new.org_id, new.user_id, new.started_at, v_points, 'call_activity');
  if new.lead_id is not null then
    update public.leads l set last_contacted_at = greatest(coalesce(l.last_contacted_at, new.started_at), new.started_at),
                              status = case when l.status = 'new' and new.connected then 'contacted'::public.lead_status else l.status end
    where l.id = new.lead_id;
  end if;
  return new;
end;
$$;
create trigger calls_after_insert after insert on public.calls for each row execute function app.on_call_logged();

-- Visits: compute distance to the lead and whether the check-in is inside
-- the geofence (radius from app_settings.visit_geofence_radius_m).
create or replace function app.before_visit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_lat double precision; v_lng double precision; v_radius int;
begin
  if new.lead_id is not null then
    select l.lat, l.lng into v_lat, v_lng from public.leads l where l.id = new.lead_id;
    new.distance_from_lead_m := public.distance_m(new.check_in_lat, new.check_in_lng, v_lat, v_lng);
    v_radius := coalesce((public.setting(new.org_id, 'visit_geofence_radius_m', '300'))::text::int, 300);
    new.within_geofence := case when new.distance_from_lead_m is null then null else new.distance_from_lead_m <= v_radius end;
  end if;
  return new;
end;
$$;
create trigger visits_before_insert before insert or update of check_in_lat, check_in_lng, lead_id on public.visits
  for each row execute function app.before_visit();

create or replace function app.on_visit_logged()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_points int := coalesce((public.setting(new.org_id, 'activity_points', '{"visit":5}') ->> 'visit')::int, 5);
begin
  perform app.bump_kpis(new.org_id, new.user_id, (new.check_in_at at time zone 'Asia/Kolkata')::date,
    jsonb_build_object('visits', 1, 'distance_km', new.travel_distance_km, 'activity_points', v_points));
  perform app.register_activity(new.org_id, new.user_id, new.check_in_at, v_points, 'field_visit');
  return new;
end;
$$;
create trigger visits_after_insert after insert on public.visits for each row execute function app.on_visit_logged();

-- Outcomes drive lead state + follow-up tasks.
create or replace function app.on_outcome_logged()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare oc public.outcome_codes%rowtype;
begin
  select * into oc from public.outcome_codes where org_id = new.org_id and code = new.outcome_code;

  update public.leads l set
    last_outcome_code = new.outcome_code,
    last_contacted_at = greatest(coalesce(l.last_contacted_at, new.created_at), new.created_at),
    status            = coalesce(oc.sets_lead_status, l.status),
    is_dnc            = l.is_dnc or new.outcome_code = 'do_not_contact',
    next_follow_up_at = case when oc.is_terminal then null else coalesce(new.next_follow_up_at, l.next_follow_up_at) end
  where l.id = new.lead_id;

  -- close open tasks for this lead by this user
  update public.follow_ups f set status = 'done', completed_at = now(), outcome_id = new.id
  where f.lead_id = new.lead_id and f.user_id = new.user_id and f.status = 'pending' and f.due_at <= now() + interval '12 hours';

  if new.next_follow_up_at is not null and not coalesce(oc.is_terminal, false) then
    insert into public.follow_ups (org_id, lead_id, user_id, kind, due_at, note)
    values (new.org_id, new.lead_id, new.user_id,
            case when new.outcome_code = 'call_back' then 'callback'::public.follow_up_kind else 'follow_up'::public.follow_up_kind end,
            new.next_follow_up_at, new.remarks);
  end if;

  perform app.bump_kpis(new.org_id, new.user_id, (new.created_at at time zone 'Asia/Kolkata')::date, '{"outcomes":1}');
  return new;
end;
$$;
create trigger outcomes_after_insert after insert on public.outcomes for each row execute function app.on_outcome_logged();

create or replace function app.on_meeting_logged()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.bump_kpis(new.org_id, new.user_id, (new.scheduled_at at time zone 'Asia/Kolkata')::date, '{"meetings":1}');
    update public.leads set status = 'meeting_set' where id = new.lead_id and status in ('new','contacted','interested');
  end if;
  return new;
end;
$$;
create trigger meetings_after_insert after insert on public.meetings for each row execute function app.on_meeting_logged();

create or replace function app.on_deal_closed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.bump_kpis(new.org_id, new.owner_id, (new.closed_at at time zone 'Asia/Kolkata')::date,
    jsonb_build_object('deals', 1, 'revenue', new.contract_value,
                       'autopay_deals', case when new.payment_mode = 'autopay' then 1 else 0 end));
  update public.leads set status = 'won', current_package_id = new.package_id, next_follow_up_at = null
  where id = new.lead_id;
  return new;
end;
$$;
create trigger deals_after_insert after insert on public.deals for each row execute function app.on_deal_closed();

-- Collections count on the day a payment succeeds, for the deal owner.
create or replace function app.on_payment_success()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  if new.status = 'success' and (tg_op = 'INSERT' or old.status is distinct from 'success') then
    select d.owner_id into v_owner from public.deals d where d.id = new.deal_id;
    perform app.bump_kpis(new.org_id, v_owner, (coalesce(new.paid_at, now()) at time zone 'Asia/Kolkata')::date,
      jsonb_build_object('collections', new.amount,
                         'online_payments', case when new.method in ('upi','card','netbanking') then 1 else 0 end));
    update public.deals set status = 'active' where id = new.deal_id and status = 'pending_payment';
  end if;
  return new;
end;
$$;
create trigger payments_after_write after insert or update of status on public.payments
  for each row execute function app.on_payment_success();

-- ---------------------------------------------------------------------
-- 7. Lead queues & assignment helpers
-- ---------------------------------------------------------------------
-- Evaluates a queue rule tree against a lead. Supported:
--   {"all":[...]} / {"any":[...]} nesting, and leaf conditions
--   {"field":f,"op":op,"value":v} where op ∈ eq neq in not_in gt gte lt lte
--   is_null not_null within_next_days older_than_days today contains
create or replace function public.lead_matches_rules(p_lead public.leads, p_rules jsonb)
returns boolean
language plpgsql stable
as $$
declare
  j jsonb := to_jsonb(p_lead);
  c jsonb; v text; op text; val jsonb; res boolean;
begin
  if p_rules is null or p_rules = '{}'::jsonb then return true; end if;
  if p_rules ? 'all' then
    for c in select * from jsonb_array_elements(p_rules -> 'all') loop
      if not public.lead_matches_rules(p_lead, c) then return false; end if;
    end loop;
    return true;
  elsif p_rules ? 'any' then
    for c in select * from jsonb_array_elements(p_rules -> 'any') loop
      if public.lead_matches_rules(p_lead, c) then return true; end if;
    end loop;
    return jsonb_array_length(p_rules -> 'any') = 0;
  end if;

  v := j ->> (p_rules ->> 'field');
  op := p_rules ->> 'op';
  val := p_rules -> 'value';
  res := case op
    when 'eq'       then v = (val #>> '{}')
    when 'neq'      then v is distinct from (val #>> '{}')
    when 'in'       then v in (select jsonb_array_elements_text(val))
    when 'not_in'   then v is null or v not in (select jsonb_array_elements_text(val))
    when 'gt'       then v::numeric >  (val #>> '{}')::numeric
    when 'gte'      then v::numeric >= (val #>> '{}')::numeric
    when 'lt'       then v::numeric <  (val #>> '{}')::numeric
    when 'lte'      then v::numeric <= (val #>> '{}')::numeric
    when 'is_null'  then v is null
    when 'not_null' then v is not null
    when 'contains' then v ilike '%' || (val #>> '{}') || '%'
    when 'within_next_days' then v::timestamptz between now() and now() + make_interval(days => (val #>> '{}')::int)
    when 'older_than_days'  then v::timestamptz < now() - make_interval(days => (val #>> '{}')::int)
    when 'within_last_days' then v::timestamptz >= now() - make_interval(days => (val #>> '{}')::int)
    when 'today'    then (v::timestamptz at time zone 'Asia/Kolkata')::date = public.ist_today()
    else false
  end;
  return coalesce(res, false);
end;
$$;

-- Leads visible to the caller that match a queue (paginated by the caller).
create or replace function public.queue_leads(p_queue_id uuid)
returns setof public.leads
language sql stable
as $$
  select l.* from public.leads l
  join public.lead_queues q on q.id = p_queue_id and q.org_id = l.org_id
  where public.lead_matches_rules(l, q.rules)
$$;

-- Active sales users who can take leads right now: not on leave today,
-- today is a working day for their shift, and optionally within a territory.
create or replace function public.available_assignees(p_territory uuid default null, p_day date default public.ist_today())
returns table (user_id uuid, full_name text, open_leads bigint)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.full_name,
         (select count(*) from public.leads l where l.owner_id = u.id and l.status not in ('won','lost','dnc','invalid')) as open_leads
  from public.users u
  left join public.employees e on e.user_id = u.id
  left join public.shifts s on s.id = e.shift_id
  where u.org_id = public.auth_org_id()
    and u.role in ('executive', 'team_lead')
    and u.status = 'active'
    and not public.is_on_leave(u.id, p_day)
    and not exists (select 1 from public.holidays h where h.org_id = u.org_id and h.day = p_day
                    and not h.is_optional and (h.city is null or h.city = e.work_city))
    and (s.id is null or extract(isodow from p_day)::smallint = any(s.working_days))
    and (p_territory is null or u.territory_id = p_territory
         or u.territory_id in (select t.id from public.territories t where t.parent_id = p_territory))
  order by open_leads, u.full_name
$$;

-- ---------------------------------------------------------------------
-- 8. Unified approvals engine
-- ---------------------------------------------------------------------
-- Resolves who approves a given step of a chain for a requester.
create or replace function app.resolve_approver(p_requester uuid, p_step jsonb, out approver uuid, out approver_role public.app_role)
language plpgsql stable security definer set search_path = ''
as $$
begin
  approver_role := (p_step ->> 'role')::public.app_role;
  if p_step ->> 'relation' = 'manager' then
    select u.manager_id into approver from public.users u where u.id = p_requester;
  elsif p_step ->> 'relation' = 'skip_manager' then
    select m.manager_id into approver from public.users u join public.users m on m.id = u.manager_id where u.id = p_requester;
  end if;
  if approver is not null then
    approver_role := null;  -- a named person takes precedence over a role pool
  end if;
end;
$$;

create or replace function public.request_approval(
  p_type public.approval_type, p_entity_table text, p_entity_id uuid,
  p_title text, p_summary text default null, p_amount numeric default null,
  p_requester uuid default auth.uid(), p_org uuid default public.auth_org_id(), p_metric numeric default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_chain public.approval_chains%rowtype; v_step jsonb; v_res record; v_id uuid;
begin
  select * into v_chain from public.approval_chains c
  where c.org_id = p_org and c.type = p_type and c.is_active
    and (not (c.conditions ? 'min_amount') or coalesce(p_amount, 0) >= (c.conditions ->> 'min_amount')::numeric)
    and (not (c.conditions ? 'min_value')  or coalesce(p_metric, 0) >= (c.conditions ->> 'min_value')::numeric)
  order by c.priority limit 1;

  v_step := coalesce(v_chain.steps -> 0, '{"relation":"manager","role":"hr_admin"}'::jsonb);
  select * into v_res from app.resolve_approver(p_requester, v_step);

  insert into public.approvals (org_id, type, chain_id, entity_table, entity_id, title, summary, amount,
                                requested_by, approver_id, approver_role, total_steps, due_at)
  values (p_org, p_type, v_chain.id, p_entity_table, p_entity_id, p_title, p_summary, p_amount,
          p_requester, v_res.approver, coalesce(v_res.approver_role, case when v_res.approver is null then 'hr_admin'::public.app_role end),
          greatest(coalesce(jsonb_array_length(v_chain.steps), 1), 1),
          now() + make_interval(hours => coalesce(v_chain.sla_hours, 48)))
  returning id into v_id;

  if v_res.approver is not null then
    insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
    values (p_org, v_res.approver, 'approvals', 'Approval needed: ' || p_title, p_summary,
            jsonb_build_object('route', '/approvals/' || v_id), 'approval.requested');
  end if;
  return v_id;
end;
$$;

create or replace function app.can_decide(a public.approvals)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select a.org_id = public.auth_org_id()
     and a.status = 'pending'
     and a.requested_by is distinct from auth.uid()
     and (a.approver_id = auth.uid()
          or (a.approver_role is not null and public.auth_role() = a.approver_role)
          or public.has_role('super_admin'))
$$;

-- Approve / reject from the unified inbox. Multi-step chains advance to the
-- next step; the final decision is propagated to the underlying record.
create or replace function public.decide_approval(p_approval_id uuid, p_approve boolean, p_comment text default null)
returns public.approvals
language plpgsql security definer set search_path = ''
as $$
declare a public.approvals%rowtype; v_chain public.approval_chains%rowtype; v_next jsonb; v_res record; v_final public.request_status;
begin
  perform set_config('app.approval_context', 'on', true);  -- lets the status guard accept the propagation below
  select * into a from public.approvals where id = p_approval_id for update;
  if not found or not app.can_decide(a) then
    raise exception 'You cannot decide this approval' using errcode = '42501';
  end if;

  a.history := a.history || jsonb_build_array(jsonb_build_object(
    'step', a.current_step, 'by', auth.uid(), 'decision', case when p_approve then 'approved' else 'rejected' end,
    'comment', p_comment, 'at', now()));

  if p_approve and a.current_step < a.total_steps then
    select * into v_chain from public.approval_chains where id = a.chain_id;
    v_next := v_chain.steps -> a.current_step;     -- 0-based → next step
    select * into v_res from app.resolve_approver(a.requested_by, v_next);
    update public.approvals set history = a.history, current_step = a.current_step + 1,
           approver_id = v_res.approver, approver_role = v_res.approver_role
    where id = a.id returning * into a;
    return a;
  end if;

  v_final := case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end;
  update public.approvals set history = a.history, status = v_final, decided_at = now()
  where id = a.id returning * into a;

  -- propagate to the source record
  case a.entity_table
    when 'leave_requests' then
      update public.leave_requests set status = v_final, decided_by = auth.uid(), decided_at = now() where id = a.entity_id;
    when 'reimbursements' then
      update public.reimbursements set status = v_final where id = a.entity_id;
    when 'requests' then
      update public.requests set status = v_final, resolution = coalesce(p_comment, resolution) where id = a.entity_id;
    when 'quotes' then
      update public.quotes set status = case when p_approve then 'approved'::public.quote_status else 'rejected'::public.quote_status end where id = a.entity_id;
    when 'incentives' then
      update public.incentives set status = case when p_approve then 'approved'::public.incentive_status else 'rejected'::public.incentive_status end,
             approved_by = auth.uid(), approved_at = now() where id = a.entity_id;
    else null;
  end case;

  if a.requested_by is not null then
    insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
    values (a.org_id, a.requested_by, 'approvals',
            a.title || case when p_approve then ' — approved' else ' — rejected' end, p_comment,
            jsonb_build_object('route', '/approvals/' || a.id), 'approval.decided');
  end if;
  return a;
end;
$$;

-- Auto-route new submissions into the approvals inbox.
create or replace function app.route_for_approval()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_title text; v_type public.approval_type; v_amount numeric; v_requester uuid; v_metric numeric;
begin
  if new.approval_id is not null then return new; end if;

  if tg_table_name = 'leave_requests' then
    if new.status <> 'pending' then return new; end if;
    v_type := 'leave'; v_requester := new.user_id; v_metric := new.days;
    v_title := (select lt.name from public.leave_types lt where lt.id = new.leave_type_id) || ' · ' || new.days || ' day(s)';
  elsif tg_table_name = 'reimbursements' then
    if new.status <> 'pending' then return new; end if;
    v_type := 'reimbursement'; v_requester := new.user_id; v_amount := new.amount;
    v_title := 'Reimbursement · ' || initcap(replace(new.category, '_', ' '));
  elsif tg_table_name = 'requests' then
    if new.status <> 'pending' then return new; end if;
    v_type := case when new.type = 'profile_change' then 'profile_change'::public.approval_type
                   when new.type = 'punch_correction' then 'regularization'::public.approval_type
                   else 'request'::public.approval_type end;
    v_requester := new.user_id; v_title := initcap(replace(new.type::text, '_', ' ')) || ' · ' || new.subject;
  elsif tg_table_name = 'quotes' then
    if new.status <> 'pending_approval' then return new; end if;
    v_type := 'discount'; v_requester := new.created_by; v_amount := new.list_price * new.discount_pct / 100; v_metric := new.discount_pct;
    v_title := 'Discount ' || new.discount_pct || '% on ' || coalesce(new.quote_no, 'quote');
  elsif tg_table_name = 'incentives' then
    if new.status <> 'pending_approval' then return new; end if;
    v_type := 'incentive'; v_requester := new.user_id; v_amount := new.amount;
    v_title := 'Incentive · ' || to_char(new.period_month, 'Mon YYYY');
  end if;

  v_id := public.request_approval(v_type, tg_table_name, new.id, v_title, null, v_amount, v_requester, new.org_id, v_metric);
  new.approval_id := v_id;
  return new;
end;
$$;

-- Discount above the package limit needs approval; above the hard floor is blocked.
create or replace function app.check_quote_discount()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare p public.packages%rowtype;
begin
  select * into p from public.packages where id = new.package_id;
  if new.discount_pct > p.hard_floor_discount_pct then
    raise exception '%', format('Discount %s%% exceeds the maximum allowed (%s%%) for %s', new.discount_pct, p.hard_floor_discount_pct, p.name)
      using errcode = '23514';
  end if;
  if new.discount_pct > p.max_discount_pct and new.status in ('draft', 'sent') then
    new.status := 'pending_approval';
  end if;
  return new;
end;
$$;
create trigger quotes_check_discount before insert or update of discount_pct, package_id on public.quotes
  for each row execute function app.check_quote_discount();

create trigger leave_requests_route before insert on public.leave_requests for each row execute function app.route_for_approval();
create trigger reimbursements_route before insert on public.reimbursements for each row execute function app.route_for_approval();
create trigger requests_route       before insert on public.requests       for each row execute function app.route_for_approval();
create trigger quotes_route         before insert or update of status on public.quotes for each row execute function app.route_for_approval();
create trigger incentives_route     before insert or update of status on public.incentives for each row execute function app.route_for_approval();

-- Approved leave → consume balance + mark attendance days as on_leave.
create or replace function app.on_leave_decided()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare d date;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.leave_balances b set used = b.used + new.days
    where b.user_id = new.user_id and b.leave_type_id = new.leave_type_id and b.year = extract(year from new.from_date);
    for d in select generate_series(new.from_date, new.to_date, interval '1 day')::date loop
      insert into public.attendance (org_id, user_id, day, status, source)
      values (new.org_id, new.user_id, d, (case when new.half_day is not null then 'half_day' else 'on_leave' end)::public.attendance_status, 'system')
      on conflict (user_id, day) do update set status = excluded.status
        where public.attendance.is_locked = false and public.attendance.punch_in_at is null;
    end loop;
  elsif new.status = 'cancelled' and old.status = 'approved' then
    update public.leave_balances b set used = greatest(b.used - new.days, 0)
    where b.user_id = new.user_id and b.leave_type_id = new.leave_type_id and b.year = extract(year from new.from_date);
    delete from public.attendance a where a.user_id = new.user_id and a.day between new.from_date and new.to_date
      and a.status in ('on_leave', 'half_day') and a.source = 'system' and not a.is_locked;
  end if;
  return new;
end;
$$;
create trigger leave_requests_decided after update of status on public.leave_requests
  for each row execute function app.on_leave_decided();

-- Locked months are read-only for attendance.
create or replace function app.guard_attendance_lock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.attendance_locks l
             where l.org_id = coalesce(new.org_id, old.org_id)
               and l.period_month = date_trunc('month', coalesce(new.day, old.day))::date)
     and auth.uid() is not null then
    raise exception 'Attendance for % is locked', to_char(coalesce(new.day, old.day), 'Mon YYYY') using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger attendance_lock_guard before insert or update or delete on public.attendance
  for each row execute function app.guard_attendance_lock();

-- Location tracking only with consent, during shift hours, not on leave.
create or replace function public.can_track_location(p_user uuid default auth.uid(), p_at timestamptz default now())
returns boolean
language sql stable security definer set search_path = ''
as $$
  with s as (
    select coalesce(sh.start_time, time '09:30') as st, coalesce(sh.end_time, time '18:30') as et,
           coalesce(sh.working_days, '{1,2,3,4,5,6}') as wd
    from public.users u
    left join public.employees e on e.user_id = u.id
    left join public.shifts sh on sh.id = e.shift_id
    where u.id = p_user
  )
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = p_user and c.type = 'location_tracking' order by c.created_at desc limit 1), false)
    and not public.is_on_leave(p_user, (p_at at time zone 'Asia/Kolkata')::date)
    and exists (
      select 1 from s
      where extract(isodow from (p_at at time zone 'Asia/Kolkata'))::smallint = any(s.wd)
        and (p_at at time zone 'Asia/Kolkata')::time between s.st - interval '30 minutes' and s.et + interval '60 minutes'
    )
$$;

-- Unified approvals inbox for the caller.
create or replace view public.my_approvals_inbox
with (security_invoker = true) as
select a.*, u.full_name as requester_name, u.avatar_url as requester_avatar
from public.approvals a
left join public.users u on u.id = a.requested_by
where a.status = 'pending'
  and a.requested_by is distinct from auth.uid()
  and (a.approver_id = auth.uid() or (a.approver_role is not null and a.approver_role = public.auth_role()));
