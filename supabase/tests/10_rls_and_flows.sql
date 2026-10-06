-- =====================================================================
-- RLS + critical-flow tests. Runs after migrations + seed.
-- Each block impersonates a demo user exactly like PostgREST does
-- (role `authenticated` + request.jwt.claims.sub) and raises on failure.
-- =====================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function pg_temp.uid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create or replace function pg_temp.login(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Executive (Priya, #10)
-- ---------------------------------------------------------------------
select pg_temp.login(10);
select pg_temp.check((select count(*) from leads) > 0, 'executive sees own leads');
select pg_temp.check((select count(*) from leads where owner_id is distinct from pg_temp.uid(10)) = 0, 'executive sees ONLY own leads');
select pg_temp.check((select count(*) from calls where user_id <> pg_temp.uid(10)) = 0, 'executive sees only own calls');
select pg_temp.check((select count(*) from daily_kpis where user_id <> pg_temp.uid(10)) = 0, 'executive sees only own KPIs');
select pg_temp.check((select count(*) from payslips) = 3 and (select bool_and(user_id = pg_temp.uid(10)) from payslips), 'executive sees own 3 published payslips only');
select pg_temp.check((select count(*) from attendance where user_id <> pg_temp.uid(10)) = 0, 'executive sees only own attendance');
select pg_temp.check((select count(*) from audit_logs) = 0, 'executive cannot read audit log');
select pg_temp.check((select count(*) from users) = 25, 'directory: everyone in org visible');
select pg_temp.check((select count(*) from employee_sensitive) = 1, 'executive sees only own sensitive row');
select pg_temp.check((select not is_masked and bank_account like '0000%' from get_employee_sensitive(
  (select id from employees where user_id = pg_temp.uid(10)))), 'owner reads own bank details in clear');
select pg_temp.check((select count(*) from get_employee_sensitive((select id from employees where user_id = pg_temp.uid(11)))) = 0,
  'executive cannot read a peer''s sensitive data');
select pg_temp.check((select count(*) from requests where type = 'grievance') = 0, 'executive cannot see grievances');
select pg_temp.check((select count(*) from notifications where user_id <> pg_temp.uid(10)) = 0, 'notifications are private');

do $$ begin
  update users set role = 'super_admin' where id = auth.uid();
  raise exception 'FAILED: executive escalated own role';
exception when insufficient_privilege then raise notice 'ok - executive cannot change own role';
end $$;

do $$ begin
  update users set locale = 'te-IN' where id = auth.uid();
  perform pg_temp.check(found, 'executive can change own language');
end $$;

do $$ begin
  insert into leads (business_name, phone, owner_id) values ('Test Biz', '+91 97000 00001', '00000000-0000-4000-8000-000000000011');
  raise exception 'FAILED: executive created a lead for someone else';
exception when insufficient_privilege then raise notice 'ok - executive cannot create leads for others';
end $$;

do $$
declare v_id uuid; v_code text;
begin
  insert into leads (business_name, phone, owner_id, city) values ('Fresh Fictional Cafe', '+91 97000 00002', auth.uid(), 'Hyderabad')
  returning id, lead_code into v_id, v_code;
  perform pg_temp.check(v_code like 'TN-L-%', 'Add Business: lead created with auto code ' || v_code);
  begin
    insert into leads (business_name, phone, owner_id) values ('Duplicate Cafe', '097000 00002', auth.uid());
    raise exception 'FAILED: duplicate phone accepted';
  exception when unique_violation then raise notice 'ok - duplicate phone rejected (normalized)';
  end;
end $$;

-- call → outcome → follow-up → KPI + attendance integration
do $$
declare v_lead uuid; v_call uuid; v_before int; v_fu int; v_pts_before int; v_pts_after int;
begin
  select id into v_lead from leads where business_name = 'Fresh Fictional Cafe';
  select coalesce(sum(calls), 0) into v_before from daily_kpis where user_id = auth.uid() and day = ist_today();
  select coalesce(max(activity_points), 0) into v_pts_before from attendance where user_id = auth.uid() and day = ist_today();
  insert into calls (lead_id, phone, duration_sec, connected) values (v_lead, '+91 97000 00002', 245, true) returning id into v_call;
  insert into outcomes (lead_id, outcome_code, remarks, call_id, next_follow_up_at)
  values (v_lead, 'call_back', 'Call after lunch', v_call, now() + interval '3 hours');
  perform pg_temp.check((select calls from daily_kpis where user_id = auth.uid() and day = ist_today()) = v_before + 1, 'call increments daily KPIs');
  select activity_points into v_pts_after from attendance where user_id = auth.uid() and day = ist_today();
  perform pg_temp.check(v_pts_after > v_pts_before, 'call adds activity points to attendance');
  perform pg_temp.check((select status = 'contacted' and last_outcome_code = 'call_back' and next_follow_up_at is not null
                         from leads where id = v_lead), 'outcome updates lead status + next follow-up');
  select count(*) into v_fu from follow_ups where lead_id = v_lead and status = 'pending' and kind = 'callback';
  perform pg_temp.check(v_fu = 1, 'call back outcome creates a callback task');
end $$;

-- discount rules
do $$
declare v_lead uuid; v_q record;
begin
  select id into v_lead from leads where business_name = 'Fresh Fictional Cafe';
  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 8, 'draft' from packages where code = 'GROWTH-12' returning * into v_q;
  perform pg_temp.check(v_q.status = 'draft' and v_q.approval_id is null, 'discount within limit needs no approval');
  perform pg_temp.check(v_q.total_amount = round(24999 * 0.92 * 1.18, 2), 'quote totals computed (net + 18% GST)');

  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 15, 'draft' from packages where code = 'GROWTH-12' returning * into v_q;
  perform pg_temp.check(v_q.status = 'pending_approval' and v_q.approval_id is not null, 'discount above limit routed for approval');
  perform pg_temp.check((select approver_id from approvals where id = v_q.approval_id) = '00000000-0000-4000-8000-000000000006',
                        'discount approval goes to the team lead');
  begin
    update quotes set status = 'approved' where id = v_q.id;
    raise exception 'FAILED: executive self-approved a discount';
  exception when insufficient_privilege then raise notice 'ok - executive cannot self-approve a discount';
  end;
  begin
    insert into quotes (lead_id, package_id, list_price, discount_pct)
    select v_lead, id, list_price, 40 from packages where code = 'GROWTH-12';
    raise exception 'FAILED: discount above hard floor accepted';
  exception when check_violation then raise notice 'ok - discount above hard floor blocked';
  end;
end $$;

-- leave request routing
do $$
declare v_lr record;
begin
  insert into leave_requests (leave_type_id, from_date, to_date, days, reason)
  select id, current_date + 20, current_date + 20, 1, 'Test leave' from leave_types where code = 'CL' returning * into v_lr;
  perform pg_temp.check(v_lr.approval_id is not null, 'leave request lands in the approvals inbox');
  begin
    update leave_requests set status = 'approved' where id = v_lr.id;
    raise exception 'FAILED: self-approved leave';
  exception when insufficient_privilege then raise notice 'ok - executive cannot self-approve leave';
  end;
  update leave_requests set status = 'cancelled' where id = v_lr.id;
  perform pg_temp.check(found, 'executive can cancel own pending leave');
end $$;

-- attendance is written via RPC only
do $$ begin
  insert into attendance (day, status) values (current_date + 1, 'present');
  raise exception 'FAILED: executive wrote attendance directly';
exception when insufficient_privilege then raise notice 'ok - executive cannot write attendance rows directly';
end $$;

-- location privacy: outside shift hours rejected
do $$ begin
  insert into location_pings (lat, lng, recorded_at)
  values (17.44, 78.38, (date_trunc('week', now() at time zone 'Asia/Kolkata') + interval '3 hours') at time zone 'Asia/Kolkata');
  raise exception 'FAILED: location accepted outside working hours';
exception when insufficient_privilege then raise notice 'ok - location ping outside shift window rejected';
end $$;
do $$ begin
  insert into location_pings (lat, lng, recorded_at)
  values (17.44, 78.38, (date_trunc('week', now() at time zone 'Asia/Kolkata') + interval '7 days 11 hours') at time zone 'Asia/Kolkata');
  perform pg_temp.check(true, 'location ping inside shift window accepted (with consent)');
end $$;
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- Executive without a punch today (Imran, #13): punch in/out RPC
-- ---------------------------------------------------------------------
select pg_temp.login(13);
do $$
declare a attendance; b attendance;
begin
  a := punch_in(17.4475, 78.3763);
  perform pg_temp.check(a.punch_in_at is not null and a.punch_in_geofence_id is not null, 'punch in records time + matches office geofence');
  b := punch_in(17.5, 78.5);
  perform pg_temp.check(b.punch_in_at = a.punch_in_at and b.punch_in_lat = a.punch_in_lat, 'punch in is idempotent for the day');
  b := punch_out(17.4475, 78.3763);
  perform pg_temp.check(b.punch_out_at is not null, 'punch out recorded');
end $$;
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- Team Lead (Sanjana, #6) — Hyderabad Alpha
-- ---------------------------------------------------------------------
select pg_temp.login(6);
select pg_temp.check((select count(distinct owner_id) from leads where owner_id is not null) = 4, 'team lead sees leads of exactly 4 team members');
select pg_temp.check((select count(*) from leads l join users u on u.id = l.owner_id where u.team_id <> (select team_id from users where id = auth.uid())) = 0,
  'team lead sees no other team''s leads');
select pg_temp.check((select count(*) from leads where owner_id is null) > 0, 'team lead sees unassigned leads');
select pg_temp.check((select count(*) from payslips where user_id <> auth.uid()) = 0, 'team lead cannot see team payslips');
select pg_temp.check((select is_masked and bank_account like '••••%' from get_employee_sensitive(
  (select id from employees where user_id = pg_temp.uid(10)))), 'team lead sees MASKED bank details of a report');
select pg_temp.check((select count(*) from requests where type = 'grievance') = 0, 'team lead cannot see grievances');
select pg_temp.check(exists (select 1 from my_approvals_inbox where type = 'discount'), 'discount request is in the team lead inbox');
select pg_temp.check(exists (select 1 from my_approvals_inbox where type = 'leave' and requested_by = pg_temp.uid(11)), 'Karthik''s leave is in the team lead inbox');
select pg_temp.check(not exists (select 1 from available_assignees() where user_id = pg_temp.uid(17)), 'executive on leave today is not assignable');
select pg_temp.check(exists (select 1 from available_assignees() where user_id = pg_temp.uid(10)), 'available executive is assignable');

do $$
declare v_appr uuid; v_lr uuid; v_used_before numeric; v_used_after numeric;
begin
  select a.id, a.entity_id into v_appr, v_lr from my_approvals_inbox a where a.type = 'leave' and a.requested_by = '00000000-0000-4000-8000-000000000011';
  select b.used into v_used_before from leave_balances b join leave_requests lr on lr.leave_type_id = b.leave_type_id and lr.user_id = b.user_id
    where lr.id = v_lr and b.year = extract(year from lr.from_date);
  perform decide_approval(v_appr, true, 'Approved');
  perform pg_temp.check((select status = 'approved' from leave_requests where id = v_lr), 'approving in inbox approves the leave');
  select b.used into v_used_after from leave_balances b join leave_requests lr on lr.leave_type_id = b.leave_type_id and lr.user_id = b.user_id
    where lr.id = v_lr and b.year = extract(year from lr.from_date);
  perform pg_temp.check(v_used_after = v_used_before + 1, 'approved leave consumes the balance');
  perform pg_temp.check((select a.status = 'on_leave' from attendance a join leave_requests lr on lr.user_id = a.user_id and a.day = lr.from_date where lr.id = v_lr),
                        'approved leave marks attendance as on leave');
  begin
    perform decide_approval(v_appr, true, 'again');
    raise exception 'FAILED: decided twice';
  exception when insufficient_privilege then raise notice 'ok - an approval cannot be decided twice';
  end;
end $$;
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- Area Manager (Meera, #4) — both Hyderabad teams, not Bengaluru/Pune
-- ---------------------------------------------------------------------
select pg_temp.login(4);
select pg_temp.check((select count(distinct owner_id) from leads where owner_id is not null) = 8, 'area manager sees 8 Hyderabad executives');
select pg_temp.check((select count(*) from leads where city <> 'Hyderabad' and owner_id is not null) = 0, 'area manager sees no other city''s owned leads');
select pg_temp.check((select count(distinct user_id) from location_pings) between 1 and 8, 'area manager sees live map of own downline only');
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- HR Admin (Kavya, #2)
-- ---------------------------------------------------------------------
select pg_temp.login(2);
select pg_temp.check((select count(*) from employees) = 25, 'HR sees all employees');
select pg_temp.check((select count(*) from leads) = 0, 'HR does not see sales leads');
select pg_temp.check((select count(*) from requests where type = 'grievance') = 1, 'HR sees anonymous grievance');
select pg_temp.check((select user_id is null from requests where type = 'grievance'), 'grievance stays anonymous');
do $$
declare n_before int; n_after int;
begin
  perform pg_temp.check((select not is_masked and pan like 'ABCDE%' from get_employee_sensitive(
    (select id from employees where user_id = '00000000-0000-4000-8000-000000000010'))), 'HR reads PAN in clear');
end $$;
select pg_temp.logout();
select pg_temp.check((select count(*) from audit_logs where action = 'view_sensitive' and actor_id = pg_temp.uid(2) and created_at > now() - interval '1 minute') = 1,
  'HR viewing sensitive data is audited');

-- ---------------------------------------------------------------------
-- Finance (Rohan, #3) and Super Admin (Aarav, #1)
-- ---------------------------------------------------------------------
select pg_temp.login(3);
select pg_temp.check((select count(*) from payments) = (select count(*) from deals), 'finance sees every payment');
select pg_temp.check((select not is_masked from get_employee_sensitive((select id from employees where user_id = pg_temp.uid(12)))), 'finance reads bank details in clear');
select pg_temp.check(exists (select 1 from my_approvals_inbox where type = 'incentive'), 'incentive approvals reach Finance');
select pg_temp.logout();

select pg_temp.login(1);
select pg_temp.check((select count(*) from audit_logs) > 0, 'super admin reads audit log');
select pg_temp.check((select is_masked from get_employee_sensitive((select id from employees where user_id = pg_temp.uid(12)))), 'super admin sees MASKED salary/bank data');
select pg_temp.check((select count(*) from requests where type = 'grievance') = 0, 'super admin cannot see grievances');
do $$ begin
  update packages set max_discount_pct = 11 where code = 'GROWTH-12';
  perform pg_temp.check(found, 'super admin edits packages');
end $$;
select pg_temp.logout();
select pg_temp.check(exists (select 1 from audit_logs where table_name = 'packages' and 'max_discount_pct' = any(changed_fields)), 'package change is audited with changed fields');

-- ---------------------------------------------------------------------
-- Cross-org isolation and anonymous access
-- ---------------------------------------------------------------------
insert into organizations (id, name, slug) values ('a0000000-0000-4000-8000-000000000099', 'Other Demo Org', 'other-demo');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (pg_temp.uid(99), 'outsider@other.demo', '{"org_id":"a0000000-0000-4000-8000-000000000099","role":"super_admin"}', '{"full_name":"Out Sider"}');
select pg_temp.login(99);
select pg_temp.check((select count(*) from users) = 1, 'other org sees only its own user');
select pg_temp.check((select count(*) from leads) + (select count(*) from employees) + (select count(*) from deals) + (select count(*) from packages) = 0,
  'other org super admin sees zero rows of this org');
do $$ begin
  insert into leads (org_id, business_name, phone, owner_id)
  values ('a0000000-0000-4000-8000-000000000001', 'Sneaky', '+91 90000 99999', auth.uid());
  raise exception 'FAILED: cross-org insert';
exception when insufficient_privilege then raise notice 'ok - cannot write into another org';
end $$;
select pg_temp.logout();

do $$ begin
  set local role anon;
  perform count(*) from leads;
  raise exception 'FAILED: anon read leads';
exception when insufficient_privilege then raise notice 'ok - anonymous role has no table access';
end $$;

-- every public table has RLS enabled
select pg_temp.check(not exists (
  select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'RLS enabled on every public table');

-- JWT hook adds claims
select pg_temp.check((select (public.custom_access_token_hook(jsonb_build_object('user_id', pg_temp.uid(10), 'claims', '{}'::jsonb)) -> 'claims' ->> 'user_role') = 'executive'),
  'custom access token hook adds user_role claim');

\echo 'All RLS & flow tests passed'
