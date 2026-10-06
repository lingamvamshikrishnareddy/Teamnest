-- =====================================================================
-- TeamNest · 0009 · Deal closing & payment processing
--   close_deal()          quote → deal + proforma invoice (GST split)
--   record_cash_payment() field cash collection with receipt
--   apply_payment_event() idempotent gateway webhook processing
--                         (payments, mandates, bounces, refunds)
--   receipts + tax invoices are issued automatically on success.
-- Gateway calls themselves live in Edge Functions (supabase/functions);
-- the database is the source of truth for money state.
-- =====================================================================

alter table public.payments
  add column if not exists provider text not null default 'manual',
  add column if not exists link_expires_at timestamptz,
  add column if not exists upi_qr text,
  add column if not exists idempotency_key text,
  add column if not exists purpose text not null default 'full' check (purpose in ('full','instalment','balance','renewal'));
create unique index if not exists payments_idempotency_uniq on public.payments(idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_gateway_ref_uniq on public.payments(provider, gateway_ref) where gateway_ref is not null;

alter table public.mandates
  add column if not exists gateway_ref text,
  add column if not exists auth_url text,
  add column if not exists next_debit_date date;
create unique index if not exists mandates_gateway_ref_uniq on public.mandates(provider, gateway_ref) where gateway_ref is not null;

-- Every webhook event, stored once (provider + event id) for idempotency and audit.
create table public.payment_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  provider      text not null,
  event_id      text not null,
  event_type    text not null,
  payment_id    uuid references public.payments(id) on delete set null,
  mandate_id    uuid references public.mandates(id) on delete set null,
  payload       jsonb not null,
  status        text not null default 'processed' check (status in ('processed','ignored','failed')),
  error         text,
  received_at   timestamptz not null default now(),
  unique (provider, event_id)
);
create index payment_events_payment_idx on public.payment_events(payment_id);
alter table public.payment_events enable row level security;
create policy payment_events_select on public.payment_events for select to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('finance', 'super_admin')));
-- writes: service role only (webhook Edge Function)

-- ---------------------------------------------------------------------
-- GST: intra-state → CGST + SGST (9% + 9%); inter-state → IGST 18%.
-- Company state comes from app_settings.company_state.
-- ---------------------------------------------------------------------
create or replace function public.gst_split(p_org uuid, p_customer_state text, p_taxable numeric, p_gst_pct numeric default 18)
returns table (cgst numeric, sgst numeric, igst numeric, total numeric)
language sql stable security definer set search_path = ''
as $$
  with s as (
    select lower(coalesce(public.setting(p_org, 'company_state', '"Telangana"') #>> '{}', '')) as company_state
  ), t as (
    select round(p_taxable * p_gst_pct / 100, 2) as tax,
           p_customer_state is null or lower(p_customer_state) = (select company_state from s) as intra
  )
  select case when intra then round(tax / 2, 2) else 0 end,
         case when intra then tax - round(tax / 2, 2) else 0 end,
         case when intra then 0 else tax end,
         p_taxable + tax
  from t
$$;

-- ---------------------------------------------------------------------
-- close_deal: the only way a quote becomes a deal.
-- ---------------------------------------------------------------------
create or replace function public.close_deal(
  p_quote_id uuid,
  p_payment_mode public.payment_mode,
  p_start_date date default null,
  p_remarks text default null
) returns public.deals
language plpgsql security definer set search_path = ''
as $$
declare
  q public.quotes%rowtype; p public.packages%rowtype; l public.leads%rowtype;
  d public.deals%rowtype; g record; v_start date := coalesce(p_start_date, public.ist_today() + 1);
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or q.org_id <> public.auth_org_id() then
    raise exception 'Quote not found' using errcode = 'P0002';
  end if;
  if not (q.created_by = auth.uid() or public.reports_to_me(q.created_by) or public.has_role('super_admin')) then
    raise exception 'You cannot close this deal' using errcode = '42501';
  end if;
  if q.status = 'pending_approval' then
    raise exception 'This discount is still waiting for approval' using errcode = '42501';
  end if;
  if q.status in ('rejected', 'expired') then
    raise exception 'This quote was %; create a new quote', q.status using errcode = '23514';
  end if;
  if q.valid_until is not null and q.valid_until < public.ist_today() then
    raise exception 'This quote expired on %', to_char(q.valid_until, 'DD Mon YYYY') using errcode = '23514';
  end if;
  if exists (select 1 from public.deals where quote_id = q.id and status <> 'cancelled') then
    raise exception 'A deal already exists for this quote' using errcode = '23505';
  end if;

  select * into p from public.packages where id = q.package_id;
  select * into l from public.leads where id = q.lead_id;
  if l.is_dnc then
    raise exception 'This business asked not to be contacted' using errcode = '23514';
  end if;

  insert into public.deals (org_id, lead_id, quote_id, package_id, owner_id, team_id, contract_value, tenure_months,
                            is_renewal, renewal_term, payment_mode, closed_at, start_date, end_date)
  values (q.org_id, q.lead_id, q.id, q.package_id, q.created_by,
          (select team_id from public.users where id = q.created_by),
          q.net_price, p.tenure_months,
          l.current_package_id is not null,
          case when p.tenure_months >= 36 then '3y' else '1y' end,
          p_payment_mode, now(), v_start, (v_start + make_interval(months => p.tenure_months))::date - 1)
  returning * into d;

  update public.quotes set status = 'accepted' where id = q.id;

  select * into g from public.gst_split(q.org_id, l.state, q.net_price, q.gst_pct);
  insert into public.invoices (org_id, kind, deal_id, bill_to, subtotal, discount, cgst, sgst, igst, total, due_date, created_by)
  values (q.org_id, 'proforma', d.id,
          jsonb_build_object('name', l.business_name, 'contact', l.contact_name, 'phone', l.phone, 'email', l.email,
                             'gstin', l.custom_fields ->> 'gstin',
                             'address', concat_ws(', ', l.address_line, l.locality, l.city, l.state, l.pincode)),
          q.list_price, q.discount_amount, g.cgst, g.sgst, g.igst, g.total, v_start, auth.uid());

  insert into public.outcomes (org_id, lead_id, user_id, outcome_code, remarks)
  values (q.org_id, q.lead_id, coalesce(auth.uid(), q.created_by), 'deal_closed',
          coalesce(p_remarks, p.name || ' · ' || initcap(p_payment_mode::text)));
  return d;
end;
$$;

-- Amount still due on a deal: proforma total − successful payments
-- (for auto-pay, the next instalment).
create or replace function public.deal_amount_due(p_deal_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  with d as (select * from public.deals where id = p_deal_id),
       inv as (select total from public.invoices where deal_id = p_deal_id and kind = 'proforma' order by issued_at desc limit 1),
       paid as (select coalesce(sum(amount), 0) as amt from public.payments where deal_id = p_deal_id and status = 'success')
  select greatest(0, case
           when (select payment_mode from d) = 'autopay'
             then least(round((select total from inv) / greatest((select tenure_months from d), 1), 2), (select total from inv) - (select amt from paid))
           else (select total from inv) - (select amt from paid)
         end)
$$;

-- Field cash collection: deal owner (or Finance) records cash; receipt follows.
create or replace function public.record_cash_payment(p_deal_id uuid, p_amount numeric, p_note text default null)
returns public.payments
language plpgsql security definer set search_path = ''
as $$
declare d public.deals%rowtype; pay public.payments%rowtype; v_due numeric;
begin
  select * into d from public.deals where id = p_deal_id for update;
  if not found or d.org_id <> public.auth_org_id() then raise exception 'Deal not found' using errcode = 'P0002'; end if;
  if not (d.owner_id = auth.uid() or public.has_role('finance', 'super_admin')) then
    raise exception 'Only the deal owner or Finance can record cash' using errcode = '42501';
  end if;
  if d.status = 'cancelled' then raise exception 'Deal is cancelled' using errcode = '23514'; end if;
  v_due := (select coalesce(sum(total), 0) from public.invoices where deal_id = d.id and kind = 'proforma')
         - (select coalesce(sum(amount), 0) from public.payments where deal_id = d.id and status = 'success');
  if p_amount <= 0 or p_amount > v_due then
    raise exception 'Amount must be between ₹1 and the balance due (₹%)', v_due using errcode = '23514';
  end if;

  insert into public.payments (org_id, deal_id, amount, method, status, provider, collected_by, paid_at, purpose, failure_reason)
  values (d.org_id, d.id, p_amount, 'cash', 'success', 'manual', auth.uid(), now(),
          case when p_amount < v_due then 'instalment' else 'full' end, null)
  returning * into pay;
  if p_note is not null then
    insert into public.audit_logs (org_id, actor_id, actor_role, action, table_name, record_id, new_data)
    values (d.org_id, auth.uid(), public.auth_role(), 'cash_collected', 'payments', pay.id::text, jsonb_build_object('note', p_note));
  end if;
  return pay;
end;
$$;

-- ---------------------------------------------------------------------
-- On success: receipt for every payment; tax invoice once the deal's
-- first payment clears (auto-pay) or it is fully paid (others).
-- ---------------------------------------------------------------------
create or replace function app.on_payment_settled()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare d public.deals%rowtype; v_paid numeric; v_total numeric;
begin
  if new.status <> 'success' or (tg_op = 'UPDATE' and old.status = 'success') then return new; end if;

  insert into public.receipts (org_id, payment_id, amount, issued_at)
  values (new.org_id, new.id, new.amount, coalesce(new.paid_at, now()))
  on conflict (payment_id) do nothing;

  select * into d from public.deals where id = new.deal_id;
  select coalesce(sum(amount), 0) into v_paid from public.payments where deal_id = d.id and status = 'success';
  select total into v_total from public.invoices where deal_id = d.id and kind = 'proforma' order by issued_at desc limit 1;

  if (d.payment_mode = 'autopay' or v_paid >= coalesce(v_total, 0))
     and not exists (select 1 from public.invoices where deal_id = d.id and kind = 'tax') then
    insert into public.invoices (org_id, kind, deal_id, bill_to, subtotal, discount, cgst, sgst, igst, total, created_by)
    select org_id, 'tax', deal_id, bill_to, subtotal, discount, cgst, sgst, igst, total, created_by
    from public.invoices where deal_id = d.id and kind = 'proforma' order by issued_at desc limit 1;
  end if;

  insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
  values (new.org_id, d.owner_id, 'payments', 'Payment received ₹' || to_char(new.amount, 'FM99,99,99,990'),
          (select business_name from public.leads where id = d.lead_id),
          jsonb_build_object('route', '/deals/' || d.id), 'payment.received');
  return new;
end;
$$;
create trigger payments_settled after insert or update of status on public.payments
  for each row execute function app.on_payment_settled();

-- ---------------------------------------------------------------------
-- Gateway webhook processing (service role only), idempotent.
-- Normalised event types:
--   payment.captured | payment.failed | payment.refunded
--   mandate.activated | mandate.rejected | mandate.cancelled
--   mandate.debit_success | mandate.debit_failed
-- Payload keys: reference (our payments.id / mandates.id), gateway_ref
--   (link/order id, or mandate id for mandate.*), payment_ref (the individual
--   charge id), amount, reason, umrn, method, paid_at
-- ---------------------------------------------------------------------
create or replace function public.apply_payment_event(p_provider text, p_event_id text, p_event_type text, p_payload jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text := p_payload ->> 'reference';
  v_gw  text := p_payload ->> 'gateway_ref';   -- payment link / order id, or the mandate id for mandate.* events
  -- id of the individual charge (each recurring debit has its own)
  v_pref text := coalesce(p_payload ->> 'payment_ref', case when p_event_type like 'payment.%' then p_payload ->> 'gateway_ref' end);
  pay public.payments%rowtype; m public.mandates%rowtype; d public.deals%rowtype;
  v_event uuid; v_result text := 'processed';
begin
  if auth.uid() is not null then
    raise exception 'Gateway events are accepted from the webhook only' using errcode = '42501';
  end if;

  insert into public.payment_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_event_type, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  if p_event_type like 'payment.%' or p_event_type like 'mandate.debit_%' then
    select * into pay from public.payments
    where (p_event_type like 'payment.%' and v_ref ~ '^[0-9a-f-]{36}$' and id = v_ref::uuid)
       or (v_pref is not null and provider = p_provider and gateway_ref = v_pref)
    limit 1 for update;
  end if;
  if p_event_type like 'mandate.%' then
    select * into m from public.mandates
    where (v_ref ~ '^[0-9a-f-]{36}$' and id = v_ref::uuid) or (provider = p_provider and gateway_ref = v_gw)
       or (pay.mandate_id is not null and id = pay.mandate_id)
    limit 1 for update;
  end if;

  case p_event_type
    when 'payment.captured', 'mandate.debit_success' then
      if pay.id is null and m.id is not null then
        -- recurring debit we did not pre-create: book it against the mandate's deal
        insert into public.payments (org_id, deal_id, mandate_id, amount, method, status, provider, gateway_ref, paid_at, purpose)
        values (m.org_id, m.deal_id, m.id, (p_payload ->> 'amount')::numeric, 'mandate', 'success', p_provider, coalesce(v_pref, p_event_id),
                coalesce((p_payload ->> 'paid_at')::timestamptz, now()), 'instalment')
        returning * into pay;
      elsif pay.id is not null and pay.status <> 'success' then
        if p_payload ? 'amount' and (p_payload ->> 'amount')::numeric <> pay.amount then
          raise exception 'Amount mismatch: expected %, got %', pay.amount, p_payload ->> 'amount';
        end if;
        update public.payments set status = 'success', gateway_ref = coalesce(v_pref, gateway_ref),
               paid_at = coalesce((p_payload ->> 'paid_at')::timestamptz, now()),
               method = coalesce((p_payload ->> 'method')::public.payment_method, method), failure_reason = null
        where id = pay.id returning * into pay;
      else
        v_result := 'ignored';
      end if;

    when 'payment.failed', 'mandate.debit_failed' then
      if pay.id is not null and pay.status <> 'success' then
        update public.payments set status = 'failed', failure_reason = coalesce(p_payload ->> 'reason', 'Payment failed')
        where id = pay.id returning * into pay;
      elsif m.id is not null then
        insert into public.payments (org_id, deal_id, mandate_id, amount, method, status, provider, gateway_ref, failure_reason, purpose)
        values (m.org_id, m.deal_id, m.id, coalesce((p_payload ->> 'amount')::numeric, m.max_amount), 'mandate', 'failed',
                p_provider, coalesce(v_pref, p_event_id), coalesce(p_payload ->> 'reason', 'Debit failed'), 'instalment')
        returning * into pay;
      end if;
      if p_event_type = 'mandate.debit_failed' and m.id is not null then
        update public.mandates set bounce_count = bounce_count + 1, last_bounce_at = now() where id = m.id returning * into m;
      end if;
      select * into d from public.deals where id = coalesce(pay.deal_id, m.deal_id);
      if d.id is not null then
        if p_event_type = 'mandate.debit_failed' then
          update public.leads set tag = 'Auto-pay Failed', next_follow_up_at = now() + interval '1 hour' where id = d.lead_id;
        end if;
        insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
        values (d.org_id, d.owner_id, 'payments',
                case when p_event_type = 'mandate.debit_failed' then 'Auto-pay bounced' else 'Payment failed' end,
                (select business_name from public.leads where id = d.lead_id) || ' · ' || coalesce(p_payload ->> 'reason', 'Payment failed'),
                jsonb_build_object('route', '/deals/' || d.id), 'mandate.bounced');
      end if;

    when 'payment.refunded' then
      if pay.id is not null then
        update public.payments set status = 'refunded' where id = pay.id returning * into pay;
      end if;

    when 'mandate.activated' then
      if m.id is not null then
        update public.mandates set status = 'active', umrn = coalesce(p_payload ->> 'umrn', umrn), gateway_ref = coalesce(v_gw, gateway_ref),
               rejection_reason = null
        where id = m.id returning * into m;
      end if;

    when 'mandate.rejected', 'mandate.cancelled' then
      if m.id is not null then
        update public.mandates set status = case when p_event_type = 'mandate.rejected' then 'rejected' else 'cancelled' end::public.mandate_status,
               rejection_reason = p_payload ->> 'reason'
        where id = m.id returning * into m;
        select * into d from public.deals where id = m.deal_id;
        insert into public.notifications (org_id, user_id, category, title, body, data, template_code)
        values (d.org_id, d.owner_id, 'payments', 'Auto-pay mandate ' || replace(p_event_type, 'mandate.', ''),
                coalesce(p_payload ->> 'reason', 'Please collect payment another way'),
                jsonb_build_object('route', '/deals/' || d.id), 'mandate.bounced');
      end if;

    else
      v_result := 'ignored';
  end case;

  if pay.id is null and m.id is null and v_result = 'processed' then
    v_result := 'ignored';
  end if;
  update public.payment_events
     set status = v_result, payment_id = pay.id, mandate_id = m.id, org_id = coalesce(pay.org_id, m.org_id)
   where id = v_event;
  return v_result;
end;
$$;

-- Audit money-moving functions & lock privileges
create trigger payment_events_audit after insert on public.payment_events for each row execute function app.audit_row();

revoke execute on function public.apply_payment_event(text, text, text, jsonb) from public, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.apply_payment_event(text, text, text, jsonb) from anon';
    execute 'revoke execute on function public.close_deal(uuid, public.payment_mode, date, text) from anon';
    execute 'revoke execute on function public.record_cash_payment(uuid, numeric, text) from anon';
    execute 'revoke execute on function public.gst_split(uuid, text, numeric, numeric) from anon';
    execute 'revoke execute on function public.deal_amount_due(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_payment_event(text, text, text, jsonb) to service_role';
    execute 'grant select, insert, update on public.payment_events to service_role';
  end if;
end $$;
grant execute on function public.close_deal(uuid, public.payment_mode, date, text) to authenticated;
grant execute on function public.record_cash_payment(uuid, numeric, text) to authenticated;
grant execute on function public.deal_amount_due(uuid) to authenticated;
grant select on public.payment_events to authenticated;
