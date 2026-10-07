-- Platform jobs: rate limits, reminders, stale tasks, retention, dispatch queue, invite activation.
set client_min_messages = warning;
create or replace function pg_temp.uid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;
set client_min_messages = notice;

-- rate limit: 3 per window for the signed-in user
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(10), 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.check(check_rate_limit('t', 3) and check_rate_limit('t', 3) and check_rate_limit('t', 3), 'first 3 calls allowed');
select pg_temp.check(not check_rate_limit('t', 3), '4th call in the window is rate-limited');
do $$ begin
  perform job_data_retention();
  raise exception 'FAILED: user ran a job';
exception when insufficient_privilege then raise notice 'ok - users cannot run scheduled jobs';
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

-- follow-up reminder 50 minutes ahead → one notification, not duplicated
insert into follow_ups (org_id, lead_id, user_id, kind, due_at)
select org_id, id, owner_id, 'callback', now() + interval '50 minutes' from leads where owner_id = pg_temp.uid(11) limit 1;
select pg_temp.check(job_follow_up_reminders() >= 1, 'reminder created for a follow-up due within the hour');
select pg_temp.check(job_follow_up_reminders() = 0, 'reminders are not duplicated');

-- stale tasks
insert into follow_ups (org_id, lead_id, user_id, due_at)
select org_id, id, owner_id, now() - interval '5 days' from leads where owner_id = pg_temp.uid(11) limit 1;
select pg_temp.check(job_close_stale_tasks() >= 1, 'overdue follow-ups marked missed');
select pg_temp.check(not exists (select 1 from follow_ups where status = 'pending' and due_at < now() - interval '2 days'), 'no stale pending follow-ups remain');

-- retention: an old location ping is removed
insert into location_pings (org_id, user_id, lat, lng, recorded_at)
values ('a0000000-0000-4000-8000-000000000001', pg_temp.uid(10), 17.4, 78.4, now() - interval '45 days');
select pg_temp.check((job_data_retention() ->> 'location_pings')::int >= 1, 'location pings older than 30 days deleted');

-- dispatch queue: claimed once
select pg_temp.check((select count(*) > 0 from claim_notifications(1000)), 'undelivered notifications claimed for dispatch');
select pg_temp.check((select count(*) = 0 from claim_notifications(1000)), 'claimed notifications are not handed out twice');

-- invited user becomes active on first sign-in
update users set status = 'invited' where id = pg_temp.uid(25);
update auth.users set last_sign_in_at = now() where id = pg_temp.uid(25);
select pg_temp.check((select status = 'active' and last_seen_at is not null from users where id = pg_temp.uid(25)), 'invited user activated on first sign-in');
\echo 'All platform job tests passed'
