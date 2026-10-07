-- =====================================================================
-- Operations tests: assignment, import, leave rules, regularization,
-- incentives → payroll, reports.
-- =====================================================================
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
-- Assignment (Team Lead Sanjana #6 → her executives #10–#13)
-- ---------------------------------------------------------------------
select pg_temp.login(6);
do $$
declare v_ids uuid[]; n int;
begin
  select array_agg(id) into v_ids from (select id from leads where owner_id is null and city = 'Hyderabad' limit 3) x;
  n := assign_leads(v_ids, '00000000-0000-4000-8000-000000000011', 'Bulk test');
  perform pg_temp.check(n = 3, 'team lead bulk-assigns 3 unassigned leads');
  perform pg_temp.check((select count(*) = 3 from lead_assignments where lead_id = any(v_ids) and method = 'bulk'), 'assignment history recorded');
  begin
    perform assign_leads(v_ids, '00000000-0000-4000-8000-000000000018');
    raise exception 'FAILED: assigned to another team';
  exception when insufficient_privilege then raise notice 'ok - cannot assign to another team''s executive';
  end;
  begin
    perform assign_leads(v_ids, '00000000-0000-4000-8000-000000000002');
    raise exception 'FAILED: assigned to HR';
  exception when check_violation then raise notice 'ok - only executives / team leads can receive leads';
  end;
end $$;
select pg_temp.logout();

select pg_temp.login(10);
do $$ begin
  perform assign_leads(array[(select id from leads limit 1)], '00000000-0000-4000-8000-000000000010');
  raise exception 'FAILED: executive assigned leads';
exception when insufficient_privilege then raise notice 'ok - executives cannot assign leads';
end $$;
select pg_temp.logout();

-- Area manager auto-assigns the Unassigned queue: nobody on leave gets leads
select pg_temp.login(4);
do $$
declare r record; v_total int := 0; v_before int;
begin
  select count(*) into v_before from leads where owner_id is null and city = 'Hyderabad';
  for r in select * from auto_assign_queue((select id from lead_queues where code = 'unassigned'), 'round_robin') loop
    v_total := v_total + r.assigned;
    if r.user_id = '00000000-0000-4000-8000-000000000017' then raise exception 'FAILED: assigned to executive on leave'; end if;
  end loop;
  perform pg_temp.check(v_total > 0, 'round-robin auto-assign distributed ' || v_total || ' leads');
  perform pg_temp.check(not exists (select 1 from leads where owner_id = '00000000-0000-4000-8000-000000000017'
                                     and id in (select lead_id from lead_assignments where method = 'round_robin')), 'executive on leave received no leads');
  perform pg_temp.check((select count(distinct to_user_id) > 1 from lead_assignments where method = 'round_robin'), 'leads spread across several people');
  perform pg_temp.check((select count(*) > 0 from queue_counts()), 'queue counts available');
end $$;

-- ---------------------------------------------------------------------
-- Import with validation + duplicate detection
-- ---------------------------------------------------------------------
do $$
declare b import_batches; v_rows jsonb := '[
  {"business_name":"Import One Opticals","phone":"9811111111","city":"Hyderabad","pincode":"500081","segment":"b2c"},
  {"business_name":"Import Two Traders","phone":"+91 98222 22222","city":"Pune","segment":"b2b","email":"two@example.in"},
  {"business_name":"","phone":"9833333333"},
  {"business_name":"Bad Phone Cafe","phone":"12345"},
  {"business_name":"Dup In File","phone":"9811111111"},
  {"business_name":"Already Exists","phone":"+91 9800000001"},
  {"business_name":"Bad Pin","phone":"9844444444","pincode":"0123"},
  {"business_name":"Owned Import","phone":"9855555555","owner_email":"priya@teamnest.demo"}
]';
begin
  b := import_leads(v_rows, '{"dry_run":true}');
  perform pg_temp.check(b.status = 'validated' and b.valid_rows = 3 and b.duplicate_rows = 2 and b.error_rows = 3,
                        format('dry run: %s valid, %s duplicates, %s errors', b.valid_rows, b.duplicate_rows, b.error_rows));
  perform pg_temp.check(not exists (select 1 from leads where business_name = 'Import One Opticals'), 'dry run writes no leads');
  b := import_leads(v_rows, '{"queue_code":"main"}');
  perform pg_temp.check(b.status = 'completed' and (select count(*) = 3 from leads where import_batch_id = b.id), 'import created 3 leads');
  perform pg_temp.check((select territory_id is not null from leads where business_name = 'Import One Opticals'), 'pincode mapped to territory');
  perform pg_temp.check((select owner_id = '00000000-0000-4000-8000-000000000010' from leads where business_name = 'Owned Import'), 'owner_email assigns the lead');
  perform pg_temp.check(jsonb_array_length(b.errors) = 5, 'row-level error report kept');
end $$;
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- Leave rules (Priya #10)
-- ---------------------------------------------------------------------
select pg_temp.login(10);
do $$
declare v_mon date := current_date + (8 - extract(isodow from current_date)::int) + 7; lr leave_requests;
begin
  -- Monday .. next Monday spans a Sunday → 7 working days (Mon–Sat + Mon)
  insert into leave_requests (leave_type_id, from_date, to_date, days, reason)
  select id, v_mon, v_mon + 7, 1, 'Trip' from leave_types where code = 'EL' returning * into lr;
  perform pg_temp.check(lr.days = (select count(*) from generate_series(v_mon, v_mon + 7, interval '1 day') d
                                    where extract(isodow from d) <> 7
                                      and not exists (select 1 from holidays h where h.day = d::date and not h.is_optional
                                                      and (h.city is null or h.city = 'Hyderabad'))),
                        'leave days exclude week-offs and holidays (got ' || lr.days || ')');
  begin
    insert into leave_requests (leave_type_id, from_date, to_date, days) select id, v_mon + 2, v_mon + 2, 1 from leave_types where code = 'CL';
    raise exception 'FAILED: overlapping leave accepted';
  exception when unique_violation then raise notice 'ok - overlapping leave rejected';
  end;
  begin
    insert into leave_requests (leave_type_id, from_date, to_date, days) select id, v_mon + 30, v_mon + 60, 1 from leave_types where code = 'CL';
    raise exception 'FAILED: over-balance leave accepted';
  exception when check_violation then raise notice 'ok - leave beyond balance rejected';
  end;
  begin
    insert into leave_requests (leave_type_id, from_date, to_date, days) select id, v_mon + 70, v_mon + 70, 1 from leave_types where code = 'ML';
    raise exception 'FAILED: wrong-gender leave accepted';
  exception when check_violation then raise notice 'ok - gender-specific leave enforced';
  end;
  update leave_requests set status = 'cancelled' where id = lr.id;
end $$;

-- punch correction request → manager approves → attendance regularized
do $$
declare v_day date := current_date - 9;
begin
  insert into requests (type, user_id, subject, payload)
  values ('punch_correction', auth.uid(), 'Missed punch', jsonb_build_object('day', v_day, 'punch_in', '09:40', 'punch_out', '18:50'));
end $$;
select pg_temp.logout();

select pg_temp.login(6);
do $$
declare v_appr uuid;
begin
  select id into v_appr from my_approvals_inbox where type = 'regularization' and requested_by = '00000000-0000-4000-8000-000000000010' order by created_at desc limit 1;
  perform decide_approval(v_appr, true, 'OK');
end $$;
select pg_temp.logout();
select pg_temp.check((select source = 'regularized' and status in ('present','on_leave','holiday','week_off')
                        and to_char(punch_out_at at time zone 'Asia/Kolkata', 'HH24:MI') = '18:50'
                      from attendance where user_id = pg_temp.uid(10) and day = current_date - 9), 'approved punch correction regularizes attendance');

-- ---------------------------------------------------------------------
-- Goals, incentives → payroll
-- ---------------------------------------------------------------------
select pg_temp.check(refresh_auto_goals() > 0, 'auto goals refreshed from live sales data');
select pg_temp.check((select goal_score(pg_temp.uid(10), 'e0000000-0000-4000-8000-000000000001') between 0 and 6), 'weighted goal score computed');

select pg_temp.login(3);
do $$
declare v_month date := date_trunc('month', current_date)::date; n int;
begin
  perform pg_temp.check((select count(*) > 0 from calculate_incentives(v_month)), 'finance calculates this month''s incentives');
  perform pg_temp.check(not exists (select 1 from incentives where period_month = v_month and basis = 'deal_slab'
                                     group by deal_id having count(*) > 1), 'one slab incentive per deal (re-runnable)');
  n := submit_incentives(v_month);
  perform pg_temp.check(n >= 0, 'calculated incentives submitted for approval (' || n || ')');
end $$;
select pg_temp.logout();

select pg_temp.login(10);
do $$ begin
  perform calculate_incentives(current_date);
  raise exception 'FAILED: executive calculated incentives';
exception when insufficient_privilege then raise notice 'ok - only Finance calculates incentives';
end $$;
select pg_temp.check((select count(*) = 1 from (select distinct user_id from report_sales_by_user) x), 'executive sees only own sales report');
select pg_temp.check((select count(*) = 0 from payroll_inputs where user_id <> pg_temp.uid(10)), 'executive sees only own payroll inputs');
select pg_temp.check((select count(*) > 0 from lead_timeline), 'lead timeline visible for own leads');
select pg_temp.logout();

select pg_temp.login(2);
do $$
declare v_month date := (date_trunc('month', current_date) - interval '1 month')::date; n int;
begin
  perform pg_temp.check((select count(*) = 25 from payroll_inputs where period_month = v_month), 'HR sees payroll inputs for all 25 employees');
  n := generate_payslips(v_month);
  perform pg_temp.check(n = 0, 'published payslips are never overwritten');
  n := generate_payslips(date_trunc('month', current_date)::date);
  perform pg_temp.check(n = 25, 'draft payslips generated for the current month');
  perform pg_temp.check((select count(*) = 0 from payslips where period_month = date_trunc('month', current_date) and status = 'published'), 'drafts stay unpublished');
end $$;
select pg_temp.logout();

select pg_temp.login(10);
select pg_temp.check((select count(*) = 0 from payslips where period_month = date_trunc('month', current_date)), 'employees cannot see draft payslips');
select pg_temp.logout();

select pg_temp.login(6);
select pg_temp.check((select count(distinct user_id) between 1 and 5 from report_attendance), 'team lead attendance report scoped to team');
select pg_temp.check((select count(*) >= 0 from team_live_locations), 'live map view available');
select pg_temp.logout();

\echo 'All operations tests passed'
