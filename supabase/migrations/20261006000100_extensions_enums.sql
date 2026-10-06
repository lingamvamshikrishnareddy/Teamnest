-- =====================================================================
-- TeamNest · 0001 · Extensions, enums and generic helpers
-- =====================================================================
-- Conventions used across every migration:
--   * Every business table carries org_id (multi-tenant isolation) and
--     created_at / updated_at timestamps (timestamptz, stored in UTC;
--     the apps render them in Asia/Kolkata).
--   * Money is numeric(14,2) in INR. Percentages are numeric(5,2).
--   * Geo points are plain lat/lng (double precision) + a haversine helper,
--     so the schema runs on vanilla Postgres as well as Supabase.
--   * RLS is enabled on every table in 20261006000700_rls.sql.
-- =====================================================================

-- Supabase keeps extensions in the `extensions` schema (already on the
-- default search_path). Mirror that so local/CI Postgres behaves the same.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

create schema if not exists app;          -- private helpers, not exposed via PostgREST
comment on schema app is 'TeamNest private helper functions (not exposed through the API).';

-- ---------------------------------------------------------------------
-- Enums (stable vocabularies only — anything an admin should be able to
-- change lives in a config table instead, e.g. outcome_codes, lead_queues)
-- ---------------------------------------------------------------------
create type public.app_role as enum (
  'executive', 'team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'
);

create type public.user_status        as enum ('invited', 'active', 'on_notice', 'inactive');
create type public.territory_kind     as enum ('zone', 'region', 'city', 'cluster');
create type public.lead_status        as enum ('new', 'contacted', 'interested', 'meeting_set', 'negotiation', 'won', 'lost', 'dnc', 'invalid');
create type public.lead_segment       as enum ('b2b', 'b2c');
create type public.call_direction     as enum ('outbound', 'inbound');
create type public.follow_up_kind     as enum ('follow_up', 'callback');
create type public.task_status        as enum ('pending', 'done', 'missed', 'cancelled');
create type public.meeting_status     as enum ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled');
create type public.quote_status       as enum ('draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'expired');
create type public.deal_status        as enum ('pending_payment', 'active', 'cancelled', 'downgraded', 'expired');
create type public.payment_mode       as enum ('autopay', 'online', 'cash', 'cheque');
create type public.payment_method     as enum ('upi', 'card', 'netbanking', 'mandate', 'cash', 'cheque');
create type public.payment_status     as enum ('initiated', 'pending', 'success', 'failed', 'refunded');
create type public.mandate_status     as enum ('initiated', 'pending_bank', 'active', 'rejected', 'paused', 'cancelled', 'expired');
create type public.invoice_kind       as enum ('proforma', 'tax');
create type public.attendance_status  as enum ('present', 'absent', 'half_day', 'on_leave', 'holiday', 'week_off');
create type public.attendance_source  as enum ('punch', 'field_visit', 'call_activity', 'regularized', 'system');
create type public.request_status     as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type public.request_type       as enum (
  'punch_correction', 'leave', 'access', 'travel', 'reimbursement', 'business_card',
  'retention_bonus', 'exit', 'grievance', 'profile_change'
);
create type public.document_status    as enum ('pending', 'verified', 'rejected', 'expired');
create type public.document_context   as enum ('employee', 'kyc');
create type public.appraisal_status   as enum ('not_started', 'self_review', 'manager_review', 'calibration', 'closed');
create type public.incentive_status   as enum ('calculated', 'pending_approval', 'approved', 'rejected', 'paid');
create type public.payslip_status     as enum ('draft', 'published');
create type public.approval_type      as enum (
  'leave', 'discount', 'reimbursement', 'request', 'incentive', 'regularization', 'profile_change', 'payroll'
);
create type public.notification_channel as enum ('in_app', 'push', 'email', 'whatsapp', 'sms');
create type public.consent_type       as enum ('call_recording', 'location_tracking', 'privacy_notice');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------

-- Keeps updated_at fresh on every UPDATE.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Great-circle distance in metres between two lat/lng points.
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;
comment on function public.distance_m is 'Haversine distance in metres; null if any coordinate is null.';

-- Normalises an Indian phone number to its last 10 digits (for dedupe).
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

-- The business "today" is always India Standard Time.
create or replace function public.ist_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
