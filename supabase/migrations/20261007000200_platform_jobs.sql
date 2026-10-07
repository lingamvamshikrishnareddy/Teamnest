-- =====================================================================
-- TeamNest · 0011 · Platform jobs
--   • invited users become active on first sign-in
--   • rate limiting for Edge Functions / RPCs
--   • scheduled jobs: follow-up reminders, missed tasks, data retention,
--     goal refresh, leave accrual, notification dispatch queue
--   • pg_cron schedules (only when pg_cron + pg_net are available)
-- =====================================================================

-- Invited → active when the person first signs in.
create or replace function app.on_auth_sign_in()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_sign_in_at is not null and old.last_sign_in_at is distinct from new.last_sign_in_at then
    update public.users set status = 'active', last_seen_at = new.last_sign_in_at
    where id = new.id and status = 'invited';
    update public.users set last_seen_at = new.last_sign_in_at where id = new.id and status <> 'invited';
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_sign_in on auth.users;
create trigger on_auth_user_sign_in after update of last_sign_in_at on auth.users
  for each row execute function app.on_auth_sign_in();

-- ---------------------------------------------------------------------
-- Rate limiting (fixed window). Edge Functions call check_rate_limit()
-- before expensive or abusable actions (payment links, invites, exports).
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);
alter table public.rate_limits enable row level security;  -- no policies: definer functions only

create or replace function public.check_rate_limit(p_action text, p_max integer, p_window_seconds integer default 60)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_key text := p_action || ':' || coalesce(auth.uid()::text, 'anon'); r public.rate_limits%rowtype;
begin
  insert into public.rate_limits as l (key, window_start, hits) values (v_key, now(), 1)
  on conflict (key) do update set
    hits = case when l.window_start < now() - make_interval(secs => p_window_seconds) then 1 else l.hits + 1 end,
    window_start = case when l.window_start < now() - make_interval(secs => p_window_seconds) then now() else l.window_start end
  returning * into r;
  return r.hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------
-- Notification dispatch queue: push / email / WhatsApp copies of in-app
-- notifications are delivered by the notifications-dispatch function.
-- ---------------------------------------------------------------------
alter table public.notifications add column if not exists delivery jsonb not null default '{}'::jsonb;  -- {"push":"sent","email":"skipped"}
create index if not exists notifications_undelivered_idx on public.notifications(created_at) where sent_at is null;

-- Returns and claims a batch of undelivered notifications (service role).
create or replace function public.claim_notifications(p_limit integer default 200)
returns setof public.notifications
language sql security definer set search_path = ''
as $$
  update public.notifications n set sent_at = now()
  where n.id in (
    select id from public.notifications
    where sent_at is null and created_at > now() - interval '2 days'
    order by created_at limit p_limit
    for update skip locked
  )
  returning n.*
$$;

-- ---------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------
-- Every 15 min: remind people about follow-ups/meetings due in the next hour.
create or replace function public.job_follow_up_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
  select f.org_id, f.user_id, 'leads',
         case when f.kind = 'callback' then 'Callback due ' else 'Follow-up due ' end || to_char(f.due_at at time zone 'Asia/Kolkata', 'HH12:MI AM'),
         l.business_name, jsonb_build_object('route', '/lead/' || l.id), 'follow_up.due'
  from public.follow_ups f join public.leads l on l.id = f.lead_id
  where f.status = 'pending' and f.due_at between now() + interval '45 minutes' and now() + interval '60 minutes'
    and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.template_code = 'follow_up.due'
                    and n.data ->> 'route' = '/lead/' || l.id and n.created_at > now() - interval '2 hours');
  get diagnostics v = row_count;

  insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
  select m.org_id, m.user_id, 'leads', 'Meeting at ' || to_char(m.scheduled_at at time zone 'Asia/Kolkata', 'HH12:MI AM'),
         l.business_name || coalesce(' · ' || m.location, ''), jsonb_build_object('route', '/lead/' || l.id), 'meeting.reminder'
  from public.meetings m join public.leads l on l.id = m.lead_id
  where m.status = 'scheduled' and m.scheduled_at between now() + interval '45 minutes' and now() + interval '60 minutes'
    and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.template_code = 'meeting.reminder'
                    and n.data ->> 'route' = '/lead/' || l.id and n.created_at > now() - interval '2 hours');
  return v;
end;
$$;

-- Nightly: overdue tasks become missed, past meetings without update → no_show.
create or replace function public.job_close_stale_tasks()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  update public.follow_ups set status = 'missed' where status = 'pending' and due_at < now() - interval '2 days';
  get diagnostics v = row_count;
  update public.meetings set status = 'no_show' where status = 'scheduled' and scheduled_at < now() - interval '1 day';
  -- absent rows for yesterday's working days with no activity, no leave, no holiday
  insert into public.attendance (org_id, user_id, day, status, source)
  select u.org_id, u.id, public.ist_today() - 1, 'absent', 'system'
  from public.users u
  left join public.employees e on e.user_id = u.id
  left join public.shifts s on s.id = e.shift_id
  where u.status = 'active'
    and extract(isodow from public.ist_today() - 1)::smallint = any(coalesce(s.working_days, '{1,2,3,4,5,6}'))
    and not public.is_on_leave(u.id, public.ist_today() - 1)
    and not exists (select 1 from public.holidays h where h.org_id = u.org_id and h.day = public.ist_today() - 1 and not h.is_optional and (h.city is null or h.city = e.work_city))
  on conflict (user_id, day) do nothing;
  return v;
end;
$$;

-- Nightly: enforce app_settings.data_retention_days per org.
create or replace function public.job_data_retention()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare o record; r jsonb; v_pings int := 0; v_recordings int := 0; v_audit int := 0; v_rate int; n int;
begin
  for o in select id from public.organizations loop
    r := public.setting(o.id, 'data_retention_days', '{"call_recordings":90,"location_pings":30,"audit_logs":2555}');
    delete from public.location_pings where org_id = o.id and recorded_at < now() - make_interval(days => (r ->> 'location_pings')::int);
    get diagnostics n = row_count; v_pings := v_pings + n;
    -- detach expired recordings (objects are removed from Storage by the jobs function using the returned paths)
    update public.calls c set recording_file_id = null
    where c.org_id = o.id and c.recording_file_id is not null and c.started_at < now() - make_interval(days => (r ->> 'call_recordings')::int);
    get diagnostics n = row_count; v_recordings := v_recordings + n;
    update public.files set retention_until = public.ist_today()
    where org_id = o.id and bucket = 'recordings' and retention_until is null and created_at < now() - make_interval(days => (r ->> 'call_recordings')::int);
    delete from public.audit_logs where org_id = o.id and created_at < now() - make_interval(days => (r ->> 'audit_logs')::int);
    get diagnostics n = row_count; v_audit := v_audit + n;
  end loop;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rate = row_count;
  return jsonb_build_object('location_pings', v_pings, 'recordings_detached', v_recordings, 'audit_logs', v_audit, 'rate_limit_keys', v_rate);
end;
$$;

-- Files whose retention has passed (the jobs function deletes them from Storage, then the row).
create or replace function public.expired_files(p_limit integer default 500)
returns table (id uuid, bucket text, path text)
language sql stable security definer set search_path = ''
as $$ select f.id, f.bucket, f.path from public.files f where f.retention_until is not null and f.retention_until <= public.ist_today() limit p_limit $$;

revoke execute on function public.claim_notifications(integer), public.job_follow_up_reminders(), public.job_close_stale_tasks(),
  public.job_data_retention(), public.expired_files(integer) from public, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.claim_notifications(integer), public.job_follow_up_reminders(), public.job_close_stale_tasks(), public.job_data_retention(), public.expired_files(integer), public.check_rate_limit(text, integer, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.claim_notifications(integer), public.job_follow_up_reminders(), public.job_close_stale_tasks(), public.job_data_retention(), public.expired_files(integer), public.check_rate_limit(text, integer, integer) to service_role';
    execute 'grant all on public.rate_limits to service_role';
  end if;
end $$;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Schedules (Supabase: enable pg_cron + pg_net, and store the project URL
-- and service key in Vault as teamnest_project_url / teamnest_service_key).
-- On plain Postgres this block is a no-op.
-- ---------------------------------------------------------------------
do $outer$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — schedule jobs externally (see docs/OPERATIONS.md)';
    return;
  end if;
  perform cron.schedule('tn-follow-up-reminders', '*/15 * * * *', 'select public.job_follow_up_reminders()');
  -- 00:30 IST = 19:00 UTC
  perform cron.schedule('tn-close-stale-tasks', '0 19 * * *', 'select public.job_close_stale_tasks()');
  perform cron.schedule('tn-data-retention', '30 19 * * *', 'select public.job_data_retention()');
  perform cron.schedule('tn-refresh-goals', '0 20 * * *', 'select public.refresh_auto_goals()');
  perform cron.schedule('tn-accrue-leave', '0 19 1 * *', 'select public.accrue_leave()');
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('tn-dispatch-notifications', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'teamnest_project_url') || '/functions/v1/notifications-dispatch',
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'teamnest_service_key'), 'Content-Type', 'application/json'),
        body := '{}'::jsonb)
    $job$);
    perform cron.schedule('tn-storage-cleanup', '0 21 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'teamnest_project_url') || '/functions/v1/storage-cleanup',
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'teamnest_service_key'), 'Content-Type', 'application/json'),
        body := '{}'::jsonb)
    $job$);
  end if;
end
$outer$;
