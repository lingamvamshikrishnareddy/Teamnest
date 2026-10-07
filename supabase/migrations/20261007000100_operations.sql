-- =====================================================================
-- TeamNest · 0010 · Operations
--   Leads:     assign_leads, auto_assign_queue, import_leads, lead_timeline
--   HR:        leave validation, punch-correction & profile-change
--              propagation, refresh_auto_goals, attendance month lock
--   Money:     calculate_incentives → payroll_inputs, publish payslips
--   Reporting: report_* views (RLS applies through security_invoker)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lead assignment
-- ---------------------------------------------------------------------
create or replace function public.assign_leads(p_lead_ids uuid[], p_to_user uuid, p_reason text default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count int;
begin
  if not public.has_role('team_lead', 'area_manager', 'super_admin') then
    raise exception 'Only managers can assign leads' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users u where u.id = p_to_user and u.org_id = public.auth_org_id() and u.status = 'active'
                 and u.role in ('executive', 'team_lead')) then
    raise exception 'Assignee must be an active executive or team lead' using errcode = '23514';
  end if;
  if not public.has_role('super_admin') and p_to_user <> auth.uid() and not public.reports_to_me(p_to_user) then
    raise exception 'You can only assign to your own team' using errcode = '42501';
  end if;

  with moved as (
    update public.leads l set owner_id = p_to_user
    where l.id = any(p_lead_ids) and l.org_id = public.auth_org_id()
      and (public.has_role('super_admin') or l.owner_id is null or public.reports_to_me(l.owner_id) or l.owner_id = auth.uid())
      and l.owner_id is distinct from p_to_user
    returning l.id, l.org_id
  ), hist as (
    insert into public.lead_assignments (org_id, lead_id, from_user_id, to_user_id, method, reason, assigned_by)
    select m.org_id, m.id, null, p_to_user, case when array_length(p_lead_ids, 1) > 1 then 'bulk' else 'manual' end, p_reason, auth.uid()
    from moved m returning 1
  )
  select count(*) into v_count from hist;

  if v_count > 0 then
    insert into public.notifications (org_id, user_id, category, title, body, data)
    values (public.auth_org_id(), p_to_user, 'leads', v_count || ' new lead' || case when v_count > 1 then 's' else '' end || ' assigned to you',
            p_reason, jsonb_build_object('route', '/leads?chip=today'));
  end if;
  return v_count;
end;
$$;

-- Distributes the unassigned leads of a queue. Strategy:
--   round_robin  — even spread across available people
--   territory    — only people in the lead's territory (or its parent city)
--   load_balanced— fewest open leads first
-- People on leave, on a holiday or off-shift are never picked.
create or replace function public.auto_assign_queue(p_queue_id uuid, p_strategy text default null, p_limit int default 500)
returns table (user_id uuid, full_name text, assigned integer)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  q public.lead_queues%rowtype; v_strategy text; l record; pick uuid; v_pool uuid[]; i int := 0;
begin
  if not public.has_role('team_lead', 'area_manager', 'super_admin') then
    raise exception 'Only managers can run auto-assignment' using errcode = '42501';
  end if;
  select * into q from public.lead_queues where id = p_queue_id and org_id = public.auth_org_id();
  if not found then raise exception 'Queue not found' using errcode = 'P0002'; end if;
  v_strategy := coalesce(p_strategy, q.assignment_strategy);

  create temp table if not exists _assign_result (user_id uuid primary key, assigned int) on commit drop;
  truncate _assign_result;

  -- available people visible to the caller (their downline, or everyone for super admin)
  select array_agg(a.user_id order by a.open_leads, a.full_name) into v_pool
  from public.available_assignees() a
  where public.has_role('super_admin') or a.user_id = auth.uid() or public.reports_to_me(a.user_id);
  if v_pool is null then
    return;
  end if;

  for l in
    select ld.* from public.leads ld
    where ld.org_id = q.org_id and ld.owner_id is null and ld.status not in ('won','lost','dnc','invalid')
      and public.lead_matches_rules(ld, q.rules)
    order by ld.priority_score desc, ld.created_at
    limit p_limit
  loop
    pick := null;
    if v_strategy = 'territory' then
      select u.id into pick from public.users u
      where u.id = any(v_pool)
        and (u.territory_id = l.territory_id or u.territory_id = (select parent_id from public.territories where id = l.territory_id))
      order by (select count(*) from public.leads x where x.owner_id = u.id and x.status not in ('won','lost','dnc','invalid'))
      limit 1;
    elsif v_strategy = 'load_balanced' then
      select u into pick from unnest(v_pool) u
      order by (select count(*) from public.leads x where x.owner_id = u and x.status not in ('won','lost','dnc','invalid'))
      limit 1;
    else
      pick := v_pool[1 + (i % array_length(v_pool, 1))];
    end if;
    continue when pick is null;
    i := i + 1;

    update public.leads set owner_id = pick, queue_id = q.id where id = l.id;
    insert into public.lead_assignments (org_id, lead_id, to_user_id, queue_id, method, reason, assigned_by)
    values (q.org_id, l.id, pick, q.id, case when v_strategy = 'territory' then 'territory' else 'round_robin' end,
            'Auto-assigned from ' || q.name, auth.uid());
    insert into _assign_result as r values (pick, 1) on conflict (user_id) do update set assigned = r.assigned + 1;
  end loop;

  update public.lead_queues set round_robin_cursor = v_pool[1 + (i % array_length(v_pool, 1))] where id = q.id;

  insert into public.notifications (org_id, user_id, category, title, data)
  select q.org_id, r.user_id, 'leads', r.assigned || ' new lead(s) from ' || q.name, jsonb_build_object('route', '/leads?chip=today')
  from _assign_result r;

  return query select r.user_id, u.full_name, r.assigned from _assign_result r join public.users u on u.id = r.user_id order by r.assigned desc;
end;
$$;

-- Counts per queue for the caller (dashboard + mobile Queues tab).
create or replace function public.queue_counts()
returns table (queue_id uuid, code text, name text, color text, total bigint, unassigned bigint)
language sql stable
as $$
  select q.id, q.code, q.name, q.color,
         count(l.id) filter (where public.lead_matches_rules(l, q.rules)),
         count(l.id) filter (where public.lead_matches_rules(l, q.rules) and l.owner_id is null)
  from public.lead_queues q
  left join public.leads l on l.org_id = q.org_id
  where q.is_active
  group by q.id, q.code, q.name, q.color, q.priority
  order by q.priority
$$;

-- ---------------------------------------------------------------------
-- Lead import (CSV/Excel parsed client-side → rows jsonb)
-- Validates every row, detects duplicates (in-file and existing),
-- optionally assigns, and records the batch report.
-- rows: [{business_name, phone, contact_name?, email?, category?, segment?,
--         locality?, city?, pincode?, lat?, lng?, tag?, owner_email?}]
-- options: {"dry_run":true, "on_duplicate":"skip"|"update", "queue_code":"main",
--           "assign":"none"|"round_robin"|"territory"}
-- ---------------------------------------------------------------------
create or replace function public.import_leads(p_rows jsonb, p_options jsonb default '{}'::jsonb, p_file_id uuid default null)
returns public.import_batches
language plpgsql security definer set search_path = ''
as $$
declare
  b public.import_batches%rowtype; r jsonb; n int := 0; v_phone text; v_errors jsonb := '[]'::jsonb;
  v_valid int := 0; v_dup int := 0; v_err int := 0; v_seen text[] := '{}'; v_owner uuid; v_existing uuid;
  v_dry boolean := coalesce((p_options ->> 'dry_run')::boolean, false);
  v_on_dup text := coalesce(p_options ->> 'on_duplicate', 'skip');
  v_territory uuid; v_queue uuid;
begin
  if not public.has_role('area_manager', 'super_admin', 'team_lead') then
    raise exception 'Only managers can import leads' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to import' using errcode = '23514';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'Import at most 20,000 rows per file' using errcode = '23514';
  end if;

  select id into v_queue from public.lead_queues where org_id = public.auth_org_id() and code = coalesce(p_options ->> 'queue_code', 'main');

  insert into public.import_batches (org_id, file_id, status, total_rows, options, created_by)
  values (public.auth_org_id(), p_file_id, 'validating', jsonb_array_length(p_rows), p_options, auth.uid())
  returning * into b;

  for r in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    v_phone := public.normalize_phone(r ->> 'phone');

    if coalesce(trim(r ->> 'business_name'), '') = '' then
      v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'business_name', 'message', 'Business name is required');
      continue;
    end if;
    if v_phone is null or length(v_phone) <> 10 or v_phone !~ '^[6-9]' then
      v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'phone', 'message', 'Enter a valid 10-digit Indian mobile number');
      continue;
    end if;
    if r ? 'email' and coalesce(r ->> 'email', '') <> '' and (r ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'email', 'message', 'Email looks invalid');
      continue;
    end if;
    if r ? 'pincode' and coalesce(r ->> 'pincode', '') <> '' and (r ->> 'pincode') !~ '^[1-9][0-9]{5}$' then
      v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'pincode', 'message', 'Pincode must be 6 digits');
      continue;
    end if;
    if r ? 'segment' and coalesce(r ->> 'segment', '') not in ('', 'b2b', 'b2c') then
      v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'segment', 'message', 'Segment must be b2b or b2c');
      continue;
    end if;
    if v_phone = any(v_seen) then
      v_dup := v_dup + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'phone', 'message', 'Duplicate phone within this file');
      continue;
    end if;
    v_seen := v_seen || v_phone;

    select id into v_existing from public.leads where org_id = b.org_id and phone_normalized = v_phone and status <> 'invalid';
    if v_existing is not null and v_on_dup = 'skip' then
      v_dup := v_dup + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'phone', 'message', 'Already exists — skipped', 'lead_id', v_existing);
      continue;
    end if;

    v_owner := null;
    if coalesce(r ->> 'owner_email', '') <> '' then
      select id into v_owner from public.users where org_id = b.org_id and email = lower(r ->> 'owner_email') and status = 'active';
      if v_owner is null then
        v_err := v_err + 1; v_errors := v_errors || jsonb_build_object('row', n, 'field', 'owner_email', 'message', 'No active user with that email');
        continue;
      end if;
    end if;

    select t.id into v_territory from public.territories t
    where t.org_id = b.org_id and t.kind = 'cluster' and coalesce(r ->> 'pincode', '') = any(t.pincodes) limit 1;
    if v_territory is not null then
      select coalesce(parent_id, id) into v_territory from public.territories where id = v_territory;
    else
      select t.id into v_territory from public.territories t where t.org_id = b.org_id and t.kind = 'city' and lower(t.name) = lower(r ->> 'city') limit 1;
    end if;

    v_valid := v_valid + 1;
    continue when v_dry;

    if v_existing is not null then
      update public.leads set
        contact_name = coalesce(nullif(r ->> 'contact_name', ''), contact_name), email = coalesce(nullif(r ->> 'email', '')::extensions.citext, email),
        category = coalesce(nullif(r ->> 'category', ''), category), locality = coalesce(nullif(r ->> 'locality', ''), locality),
        city = coalesce(nullif(r ->> 'city', ''), city), pincode = coalesce(nullif(r ->> 'pincode', ''), pincode),
        import_batch_id = b.id
      where id = v_existing;
    else
      insert into public.leads (org_id, business_name, contact_name, phone, whatsapp, email, category, segment, tag, source,
                                locality, city, state, pincode, lat, lng, territory_id, queue_id, owner_id, import_batch_id, created_by)
      values (b.org_id, trim(r ->> 'business_name'), nullif(r ->> 'contact_name', ''), r ->> 'phone', r ->> 'phone',
              nullif(r ->> 'email', ''), nullif(r ->> 'category', ''), coalesce(nullif(r ->> 'segment', ''), 'b2c')::public.lead_segment,
              nullif(r ->> 'tag', ''), 'import', nullif(r ->> 'locality', ''), nullif(r ->> 'city', ''), nullif(r ->> 'state', ''),
              nullif(r ->> 'pincode', ''), nullif(r ->> 'lat', '')::double precision, nullif(r ->> 'lng', '')::double precision,
              v_territory, v_queue, v_owner, b.id, auth.uid())
      returning id into v_existing;
      if v_owner is not null then
        insert into public.lead_assignments (org_id, lead_id, to_user_id, method, reason, assigned_by)
        values (b.org_id, v_existing, v_owner, 'import', 'Assigned in import file', auth.uid());
      end if;
    end if;
    v_existing := null;
  end loop;

  update public.import_batches set
    status = case when v_dry then 'validated' else 'completed' end,
    valid_rows = v_valid, duplicate_rows = v_dup, error_rows = v_err, errors = v_errors,
    completed_at = case when v_dry then null else now() end
  where id = b.id returning * into b;

  if not v_dry and coalesce(p_options ->> 'assign', 'none') in ('round_robin', 'territory') and v_queue is not null then
    perform public.auto_assign_queue(v_queue, p_options ->> 'assign', v_valid);
  end if;
  return b;
end;
$$;

-- Unified activity timeline for a lead (calls, visits, outcomes, meetings,
-- follow-ups, documents, quotes, deals, payments). RLS applies.
create or replace view public.lead_timeline
with (security_invoker = true) as
select c.lead_id, 'call'::text as kind, c.id, c.started_at as at, c.user_id,
       case when c.connected then 'Call · ' || (c.duration_sec / 60) || 'm ' || (c.duration_sec % 60) || 's' else 'Missed call attempt' end as title,
       null::text as detail, jsonb_build_object('connected', c.connected, 'duration_sec', c.duration_sec, 'recorded', c.recording_file_id is not null) as meta
from public.calls c where c.lead_id is not null
union all
select v.lead_id, 'visit', v.id, v.check_in_at, v.user_id,
       'Visit · ' || initcap(v.purpose), v.notes,
       jsonb_build_object('within_geofence', v.within_geofence, 'distance_m', round(v.distance_from_lead_m), 'checked_out', v.check_out_at is not null)
from public.visits v where v.lead_id is not null
union all
select o.lead_id, 'outcome', o.id, o.created_at, o.user_id, oc.label, o.remarks,
       jsonb_build_object('code', o.outcome_code, 'color', oc.color, 'next_follow_up_at', o.next_follow_up_at)
from public.outcomes o join public.outcome_codes oc on oc.org_id = o.org_id and oc.code = o.outcome_code
union all
select m.lead_id, 'meeting', m.id, m.scheduled_at, m.user_id, 'Meeting · ' || initcap(m.status::text), m.agenda,
       jsonb_build_object('status', m.status, 'location', m.location)
from public.meetings m
union all
select d.lead_id, 'document', d.id, d.created_at, d.uploaded_by, d.title, d.rejection_reason,
       jsonb_build_object('status', d.status)
from public.documents d where d.lead_id is not null
union all
select q.lead_id, 'quote', q.id, q.created_at, q.created_by, 'Quote ' || q.quote_no, null,
       jsonb_build_object('status', q.status, 'total', q.total_amount, 'discount_pct', q.discount_pct)
from public.quotes q
union all
select d.lead_id, 'deal', d.id, d.closed_at, d.owner_id, 'Deal ' || d.deal_no, null,
       jsonb_build_object('status', d.status, 'value', d.contract_value, 'mode', d.payment_mode)
from public.deals d;

-- ---------------------------------------------------------------------
-- HR: leave validation, regularization, profile change, goals
-- ---------------------------------------------------------------------
-- Working days between two dates for a user (excludes week-offs and holidays).
create or replace function public.leave_days(p_user uuid, p_from date, p_to date, p_half_day text default null)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when p_half_day is not null then 0.5 else (
    select count(*)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.employees e on e.user_id = p_user
    left join public.shifts s on s.id = e.shift_id
    where extract(isodow from d)::smallint = any(coalesce(s.working_days, '{1,2,3,4,5,6}'))
      and not exists (select 1 from public.holidays h join public.users u on u.id = p_user
                      where h.org_id = u.org_id and h.day = d::date and not h.is_optional
                        and (h.city is null or h.city = e.work_city))
  ) end
$$;

create or replace function app.validate_leave_request()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare lt public.leave_types%rowtype; v_bal numeric; v_gender text;
begin
  select * into lt from public.leave_types where id = new.leave_type_id;
  if not lt.is_active then raise exception '% is not available', lt.name using errcode = '23514'; end if;
  if new.half_day is not null and not lt.allow_half_day then
    raise exception 'Half day is not allowed for %', lt.name using errcode = '23514';
  end if;
  if auth.uid() is not null and new.from_date < public.ist_today() - 7 then
    raise exception 'Leave older than 7 days needs HR — raise a request instead' using errcode = '23514';
  end if;
  if auth.uid() is not null and lt.min_notice_days > 0 and new.from_date - public.ist_today() < lt.min_notice_days and lt.code not in ('SL') then
    raise exception '% needs % day(s) notice', lt.name, lt.min_notice_days using errcode = '23514';
  end if;
  select gender into v_gender from public.employees where user_id = new.user_id;
  if lt.applicable_gender is not null and v_gender is distinct from lt.applicable_gender then
    raise exception '% is not applicable', lt.name using errcode = '23514';
  end if;

  new.days := public.leave_days(new.user_id, new.from_date, new.to_date, new.half_day);
  if new.days <= 0 then raise exception 'Those dates are all holidays or week-offs' using errcode = '23514'; end if;
  if lt.max_consecutive_days is not null and new.days > lt.max_consecutive_days then
    raise exception '% allows at most % days at a time', lt.name, lt.max_consecutive_days using errcode = '23514';
  end if;

  if exists (select 1 from public.leave_requests r where r.user_id = new.user_id and r.id <> new.id
             and r.status in ('pending', 'approved') and daterange(r.from_date, r.to_date, '[]') && daterange(new.from_date, new.to_date, '[]')) then
    raise exception 'You already have leave on these dates' using errcode = '23505';
  end if;

  if lt.is_paid and lt.code not in ('LOP') then
    select coalesce(sum(b.balance), 0) - coalesce((select sum(r.days) from public.leave_requests r
             where r.user_id = new.user_id and r.leave_type_id = lt.id and r.status = 'pending' and r.id <> new.id
               and extract(year from r.from_date) = extract(year from new.from_date)), 0)
      into v_bal
    from public.leave_balances b where b.user_id = new.user_id and b.leave_type_id = lt.id and b.year = extract(year from new.from_date);
    if v_bal < new.days and lt.annual_quota > 0 then
      raise exception 'Not enough % balance (% day(s) available)', lt.name, greatest(v_bal, 0) using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
-- runs before the approval routing trigger (alphabetical: leave_requests_a_validate < leave_requests_route)
create trigger leave_requests_a_validate before insert on public.leave_requests
  for each row execute function app.validate_leave_request();

-- Approved requests change the underlying record.
create or replace function app.on_request_decided()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_day date; v_in time; v_out time;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;

  if new.type = 'punch_correction' then
    v_day := (new.payload ->> 'day')::date;
    v_in := nullif(new.payload ->> 'punch_in', '')::time;
    v_out := nullif(new.payload ->> 'punch_out', '')::time;
    insert into public.attendance (org_id, user_id, day, status, source, punch_in_at, punch_out_at, remarks)
    values (new.org_id, new.user_id, v_day, 'present', 'regularized',
            case when v_in is not null then (v_day + v_in) at time zone 'Asia/Kolkata' end,
            case when v_out is not null then (v_day + v_out) at time zone 'Asia/Kolkata' end,
            'Regularized: ' || new.subject)
    on conflict (user_id, day) do update set
      status = case when public.attendance.status in ('absent', 'half_day') then 'present' else public.attendance.status end,
      source = 'regularized',
      punch_in_at = coalesce(excluded.punch_in_at, public.attendance.punch_in_at),
      punch_out_at = coalesce(excluded.punch_out_at, public.attendance.punch_out_at),
      remarks = excluded.remarks;
  elsif new.type = 'profile_change' then
    -- whitelisted, non-sensitive fields only; bank/ID changes are applied by HR via set_employee_sensitive()
    update public.users set phone = coalesce(new.payload -> 'changes' ->> 'phone', phone) where id = new.user_id;
    update public.employees set
      personal_email = coalesce((new.payload -> 'changes' ->> 'personal_email')::extensions.citext, personal_email),
      emergency_contact = coalesce(new.payload -> 'changes' -> 'emergency_contact', emergency_contact),
      address = coalesce(new.payload -> 'changes' -> 'address', address),
      blood_group = coalesce(new.payload -> 'changes' ->> 'blood_group', blood_group)
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger requests_decided after update of status on public.requests
  for each row execute function app.on_request_decided();

-- Monthly accrual (scheduled job): adds the monthly share of each accruing leave type.
create or replace function public.accrue_leave(p_month date default date_trunc('month', public.ist_today())::date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  if auth.uid() is not null and not public.has_role('hr_admin') then
    raise exception 'HR only' using errcode = '42501';
  end if;
  insert into public.leave_balances as b (org_id, user_id, leave_type_id, year, accrued)
  select u.org_id, u.id, lt.id, extract(year from p_month)::smallint, round(lt.annual_quota / 12.0, 1)
  from public.users u join public.leave_types lt on lt.org_id = u.org_id
  where lt.accrual = 'monthly' and lt.annual_quota > 0 and lt.is_active and u.status = 'active'
    and (auth.uid() is null or u.org_id = public.auth_org_id())
  on conflict (user_id, leave_type_id, year) do update set accrued = b.accrued + excluded.accrued;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Auto-sourced goals pull achievement from daily_kpis for the cycle period.
create or replace function public.refresh_auto_goals(p_cycle_id uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  update public.goals g set achieved_value = coalesce((
    select case g.metric_key
      when 'revenue'       then sum(dk.revenue)
      when 'deals'         then sum(dk.deals)
      when 'collections'   then sum(dk.collections)
      when 'talk_time_min' then round(sum(dk.talk_time_sec) / 60.0)
      when 'visits'        then sum(dk.visits)
      when 'calls'         then sum(dk.calls)
      when 'meetings'      then sum(dk.meetings)
      when 'autopay_pct'   then case when sum(dk.deals) > 0 then round(100.0 * sum(dk.autopay_deals) / sum(dk.deals), 1) else 0 end
    end
    from public.daily_kpis dk join public.appraisal_cycles c on c.id = g.cycle_id
    where dk.user_id = g.user_id and dk.day between c.period_start and least(c.period_end, public.ist_today())), 0),
    updated_at = now()
  where g.auto_source and (p_cycle_id is null or g.cycle_id = p_cycle_id)
    and (auth.uid() is null or g.org_id = public.auth_org_id());
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Weighted score (0–5) of a user's goals in a cycle.
create or replace function public.goal_score(p_user uuid, p_cycle uuid)
returns numeric
language sql stable
as $$
  select round(sum(least(g.achieved_value / nullif(g.target_value, 0), 1.2) * g.weightage_pct) / nullif(sum(g.weightage_pct), 0) * 5 / 1.2 * 1.2, 2)
  from public.goals g where g.user_id = p_user and g.cycle_id = p_cycle
$$;

create or replace function public.lock_attendance_month(p_month date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_role('hr_admin') then raise exception 'HR only' using errcode = '42501'; end if;
  insert into public.attendance_locks (org_id, period_month, locked_by)
  values (public.auth_org_id(), date_trunc('month', p_month)::date, auth.uid()) on conflict do nothing;
  update public.attendance set is_locked = true
  where org_id = public.auth_org_id() and day >= date_trunc('month', p_month) and day < date_trunc('month', p_month) + interval '1 month';
end;
$$;

-- ---------------------------------------------------------------------
-- Incentives → payroll
-- ---------------------------------------------------------------------
-- Calculates deal incentives for a month from app_settings.incentive_slabs
-- (marginal slabs on the person's monthly revenue) + auto-pay bonus.
-- Re-runnable: replaces 'calculated' rows, never touches approved/paid.
create or replace function public.calculate_incentives(p_month date)
returns table (user_id uuid, full_name text, revenue numeric, amount numeric)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_month date := date_trunc('month', p_month)::date; v_org uuid := public.auth_org_id(); s jsonb; v_bonus numeric;
begin
  if not public.has_role('finance', 'super_admin') then raise exception 'Finance only' using errcode = '42501'; end if;
  s := public.setting(v_org, 'incentive_slabs', '[{"from":0,"to":null,"pct":5}]');
  v_bonus := coalesce((public.setting(v_org, 'autopay_bonus_per_deal', '0') #>> '{}')::numeric, 0);

  delete from public.incentives i where i.org_id = v_org and i.period_month = v_month and i.status = 'calculated';

  -- per-deal share of the person's slab payout (so each deal carries its incentive)
  insert into public.incentives (org_id, user_id, period_month, deal_id, basis, base_amount, rate_pct, amount, status)
  select v_org, d.owner_id, v_month, d.id, 'deal_slab', d.contract_value,
         round(t.payout / nullif(t.revenue, 0) * 100, 2),
         round(d.contract_value * t.payout / nullif(t.revenue, 0), 2), 'calculated'
  from public.deals d
  join lateral (
    select sum(x.contract_value) as revenue from public.deals x
    where x.owner_id = d.owner_id and x.status <> 'cancelled' and date_trunc('month', x.closed_at at time zone 'Asia/Kolkata') = v_month
  ) r on true
  join lateral (
    select r.revenue, sum(greatest(0, least(r.revenue, coalesce((sl ->> 'to')::numeric, r.revenue)) - (sl ->> 'from')::numeric) * (sl ->> 'pct')::numeric / 100) as payout
    from jsonb_array_elements(s) sl
  ) t on true
  where d.org_id = v_org and d.status <> 'cancelled' and date_trunc('month', d.closed_at at time zone 'Asia/Kolkata') = v_month
    and not exists (select 1 from public.incentives i where i.deal_id = d.id and i.basis = 'deal_slab');

  if v_bonus > 0 then
    insert into public.incentives (org_id, user_id, period_month, deal_id, basis, base_amount, amount, status, notes)
    select v_org, d.owner_id, v_month, d.id, 'autopay_bonus', 0, v_bonus, 'calculated', 'Auto-pay bonus'
    from public.deals d
    where d.org_id = v_org and d.payment_mode = 'autopay' and d.status <> 'cancelled'
      and date_trunc('month', d.closed_at at time zone 'Asia/Kolkata') = v_month
      and exists (select 1 from public.mandates m where m.deal_id = d.id and m.status = 'active')
      and not exists (select 1 from public.incentives i where i.deal_id = d.id and i.basis = 'autopay_bonus');
  end if;

  return query
  select i.user_id, u.full_name, sum(i.base_amount), sum(i.amount)
  from public.incentives i join public.users u on u.id = i.user_id
  where i.org_id = v_org and i.period_month = v_month
  group by i.user_id, u.full_name order by sum(i.amount) desc;
end;
$$;

-- Finance submits a month's calculated incentives for approval in one go.
create or replace function public.submit_incentives(p_month date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  if not public.has_role('finance', 'super_admin') then raise exception 'Finance only' using errcode = '42501'; end if;
  update public.incentives set status = 'pending_approval'
  where org_id = public.auth_org_id() and period_month = date_trunc('month', p_month)::date and status = 'calculated';
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Payroll inputs per employee per month: the export HR/Finance send to payroll.
create or replace view public.payroll_inputs
with (security_invoker = true) as
with months as (
  select distinct date_trunc('month', a.day)::date as period_month, a.org_id from public.attendance a
)
select m.period_month, u.id as user_id, u.org_id, e.employee_code, u.full_name, e.department, e.work_city,
       count(a.*) filter (where a.status in ('present', 'on_leave', 'holiday', 'week_off')) +
         0.5 * count(a.*) filter (where a.status = 'half_day') as paid_days,
       count(a.*) filter (where a.status = 'absent') as absent_days,
       count(a.*) filter (where a.status = 'on_leave') as leave_days,
       count(a.*) filter (where a.is_late) as late_marks,
       coalesce((select sum(i.amount) from public.incentives i where i.user_id = u.id and i.status in ('approved', 'paid')
                 and coalesce(i.payroll_month, i.period_month) = m.period_month), 0) as incentives,
       coalesce((select sum(r.amount) from public.reimbursements r where r.user_id = u.id and r.status = 'approved'
                 and date_trunc('month', r.expense_date) = m.period_month), 0) as reimbursements,
       bool_or(a.is_locked) as locked
from months m
join public.users u on u.org_id = m.org_id
join public.employees e on e.user_id = u.id
left join public.attendance a on a.user_id = u.id and date_trunc('month', a.day) = m.period_month
group by m.period_month, u.id, u.org_id, e.employee_code, u.full_name, e.department, e.work_city;

-- Generates draft payslips for a month from payroll inputs + encrypted salary.
create or replace function public.generate_payslips(p_month date, p_publish boolean default false)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', p_month)::date; v int; v_days int;
begin
  if not public.has_role('hr_admin') then raise exception 'HR only' using errcode = '42501'; end if;
  v_days := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;

  insert into public.payslips as p (org_id, user_id, period_month, paid_days, lop_days, earnings, deductions, gross, total_deductions,
                                    incentive_amount, reimbursement_amount, status, published_at)
  select pi.org_id, pi.user_id, v_month,
         least(v_days, pi.paid_days), greatest(0, v_days - pi.paid_days),
         jsonb_build_array(
           jsonb_build_object('code','BASIC','label','Basic','amount', round(g.prorated * 0.40)),
           jsonb_build_object('code','HRA','label','House Rent Allowance','amount', round(g.prorated * 0.20)),
           jsonb_build_object('code','SPL','label','Special Allowance','amount', g.prorated - round(g.prorated * 0.40) - round(g.prorated * 0.20)),
           jsonb_build_object('code','INC','label','Sales Incentive','amount', pi.incentives),
           jsonb_build_object('code','REIMB','label','Reimbursements','amount', pi.reimbursements)),
         jsonb_build_array(
           jsonb_build_object('code','PF','label','Provident Fund','amount', round(g.prorated * 0.40 * 0.12)),
           jsonb_build_object('code','PT','label','Professional Tax','amount', 200),
           jsonb_build_object('code','TDS','label','Income Tax (TDS)','amount', round((g.prorated + pi.incentives) * 0.04))),
         g.prorated + pi.incentives + pi.reimbursements,
         round(g.prorated * 0.40 * 0.12) + 200 + round((g.prorated + pi.incentives) * 0.04),
         pi.incentives, pi.reimbursements,
         case when p_publish then 'published' else 'draft' end::public.payslip_status,
         case when p_publish then now() end
  from public.payroll_inputs pi
  join public.employees e on e.user_id = pi.user_id
  join public.employee_sensitive s on s.employee_id = e.id
  cross join lateral (select round(coalesce(app.decrypt(s.monthly_gross_enc)::numeric, 0) * least(v_days, pi.paid_days) / v_days) as prorated) g
  where pi.org_id = public.auth_org_id() and pi.period_month = v_month
  on conflict (user_id, period_month) do update set
    paid_days = excluded.paid_days, lop_days = excluded.lop_days, earnings = excluded.earnings, deductions = excluded.deductions,
    gross = excluded.gross, total_deductions = excluded.total_deductions, incentive_amount = excluded.incentive_amount,
    reimbursement_amount = excluded.reimbursement_amount, status = excluded.status, published_at = excluded.published_at
  where p.status = 'draft';
  get diagnostics v = row_count;

  update public.incentives i set status = 'paid', payroll_month = v_month,
         payslip_id = (select id from public.payslips p where p.user_id = i.user_id and p.period_month = v_month)
  where p_publish and i.org_id = public.auth_org_id() and i.status = 'approved' and coalesce(i.payroll_month, i.period_month) = v_month;

  if p_publish then
    insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
    select org_id, user_id, 'hr', 'Payslip published', 'Your payslip for ' || to_char(v_month, 'Mon YYYY') || ' is ready',
           jsonb_build_object('route', '/work/payslips'), 'payslip.published'
    from public.payslips where org_id = public.auth_org_id() and period_month = v_month and status = 'published';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- Reporting views (security_invoker → each viewer sees their RLS scope)
-- ---------------------------------------------------------------------
create or replace view public.report_sales_by_user
with (security_invoker = true) as
select dk.org_id, dk.user_id, u.full_name, u.team_id, t.name as team_name, u.territory_id,
       date_trunc('month', dk.day)::date as period_month,
       sum(dk.calls) as calls, sum(dk.connected_calls) as connected_calls, sum(dk.talk_time_sec) as talk_time_sec,
       sum(dk.visits) as visits, sum(dk.distance_km) as distance_km, sum(dk.meetings) as meetings, sum(dk.outcomes) as outcomes,
       sum(dk.deals) as deals, sum(dk.revenue) as revenue, sum(dk.collections) as collections,
       sum(dk.autopay_deals) as autopay_deals, sum(dk.online_payments) as online_payments, sum(dk.activity_points) as activity_points
from public.daily_kpis dk join public.users u on u.id = dk.user_id left join public.teams t on t.id = u.team_id
group by dk.org_id, dk.user_id, u.full_name, u.team_id, t.name, u.territory_id, date_trunc('month', dk.day);

create or replace view public.report_outcomes
with (security_invoker = true) as
select o.org_id, o.user_id, u.full_name, (o.created_at at time zone 'Asia/Kolkata')::date as day, o.outcome_code, oc.label, count(*) as total
from public.outcomes o join public.users u on u.id = o.user_id
join public.outcome_codes oc on oc.org_id = o.org_id and oc.code = o.outcome_code
group by o.org_id, o.user_id, u.full_name, (o.created_at at time zone 'Asia/Kolkata')::date, o.outcome_code, oc.label;

create or replace view public.report_payments
with (security_invoker = true) as
select p.id, p.org_id, p.deal_id, d.deal_no, d.owner_id, u.full_name as owner_name, l.business_name, l.city,
       p.amount, p.method, p.status, p.provider, p.failure_reason, p.attempt_no, p.created_at, p.paid_at,
       d.payment_mode, (select r.receipt_no from public.receipts r where r.payment_id = p.id) as receipt_no
from public.payments p join public.deals d on d.id = p.deal_id join public.users u on u.id = d.owner_id join public.leads l on l.id = d.lead_id;

create or replace view public.report_mandates
with (security_invoker = true) as
select m.id, m.org_id, m.deal_id, d.deal_no, l.business_name, u.full_name as owner_name, m.provider, m.umrn, m.max_amount,
       m.frequency, m.status, m.bounce_count, m.last_bounce_at, m.rejection_reason, m.start_date, m.created_at
from public.mandates m join public.deals d on d.id = m.deal_id join public.leads l on l.id = d.lead_id join public.users u on u.id = d.owner_id;

create or replace view public.report_attendance
with (security_invoker = true) as
select a.org_id, a.user_id, u.full_name, e.employee_code, u.team_id, date_trunc('month', a.day)::date as period_month,
       count(*) filter (where a.status = 'present') as present,
       count(*) filter (where a.status = 'half_day') as half_day,
       count(*) filter (where a.status = 'absent') as absent,
       count(*) filter (where a.status = 'on_leave') as on_leave,
       count(*) filter (where a.is_late) as late,
       round(avg(a.work_minutes) filter (where a.work_minutes is not null)) as avg_work_minutes,
       sum(a.activity_points) as activity_points
from public.attendance a join public.users u on u.id = a.user_id join public.employees e on e.user_id = a.user_id
group by a.org_id, a.user_id, u.full_name, e.employee_code, u.team_id, date_trunc('month', a.day);

create or replace view public.report_field_visits
with (security_invoker = true) as
select v.id, v.org_id, v.user_id, u.full_name, (v.check_in_at at time zone 'Asia/Kolkata')::date as day, v.check_in_at, v.check_out_at,
       l.business_name, l.locality, v.purpose, round(v.distance_from_lead_m) as distance_from_lead_m, v.within_geofence, v.travel_distance_km
from public.visits v join public.users u on u.id = v.user_id left join public.leads l on l.id = v.lead_id;

create or replace view public.report_headcount
with (security_invoker = true) as
select u.org_id, e.department, e.work_city, u.role, u.status, count(*) as headcount,
       count(*) filter (where e.date_of_joining >= date_trunc('month', public.ist_today())) as joined_this_month,
       count(*) filter (where e.exit_date is not null) as exits
from public.users u join public.employees e on e.user_id = u.id
group by u.org_id, e.department, e.work_city, u.role, u.status;

-- Live team map: last known position per person today.
create or replace view public.team_live_locations
with (security_invoker = true) as
select distinct on (lp.user_id) lp.user_id, u.full_name, u.team_id, lp.lat, lp.lng, lp.recorded_at, lp.battery_pct,
       (select count(*) from public.visits v where v.user_id = lp.user_id and (v.check_in_at at time zone 'Asia/Kolkata')::date = public.ist_today()) as visits_today
from public.location_pings lp join public.users u on u.id = lp.user_id
where lp.recorded_at >= (public.ist_today()::timestamp at time zone 'Asia/Kolkata')
order by lp.user_id, lp.recorded_at desc;

-- ---------------------------------------------------------------------
-- Privileges for everything above
-- ---------------------------------------------------------------------
grant select on public.lead_timeline, public.payroll_inputs, public.report_sales_by_user, public.report_outcomes, public.report_payments,
  public.report_mandates, public.report_attendance, public.report_field_visits, public.report_headcount, public.team_live_locations to authenticated;
revoke execute on all functions in schema app from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
  execute 'grant execute on all functions in schema public to authenticated';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on all functions in schema public to service_role';
    execute 'grant select on all tables in schema public to service_role';
  end if;
end $$;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated;
revoke execute on function public.apply_payment_event(text, text, text, jsonb) from authenticated;
