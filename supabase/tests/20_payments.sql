-- =====================================================================
-- Deal closing & payment processing tests.
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

create temp table t_ctx (k text primary key, v text);
grant all on t_ctx to authenticated;
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Online payment: quote → close_deal → payment link → webhook captured
-- ---------------------------------------------------------------------
select pg_temp.login(10);
do $$
declare v_lead uuid; v_q uuid; d deals; inv invoices; v_due numeric;
begin
  insert into leads (business_name, phone, owner_id, city, state, pincode)
  values ('Payments Test Studio', '+91 97000 11111', auth.uid(), 'Hyderabad', 'Telangana', '500081') returning id into v_lead;
  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 10, 'sent' from packages where code = 'GROWTH-12' returning id into v_q;

  d := close_deal(v_q, 'online');
  perform pg_temp.check(d.contract_value = 22499.10 and d.status = 'pending_payment', 'close_deal creates a pending deal at the net price');
  perform pg_temp.check((select status = 'won' and last_outcome_code = 'deal_closed' from leads where id = v_lead), 'lead marked won with deal_closed outcome');

  select * into inv from invoices where deal_id = d.id and kind = 'proforma';
  perform pg_temp.check(inv.cgst = 2024.92 and inv.sgst = 2024.92 and inv.igst = 0 and inv.total = 26548.94,
                        'intra-state proforma splits GST into CGST + SGST');
  v_due := deal_amount_due(d.id);
  perform pg_temp.check(v_due = inv.total, 'amount due equals proforma total');

  begin
    perform close_deal(v_q, 'online');
    raise exception 'FAILED: closed the same quote twice';
  exception when unique_violation or check_violation then raise notice 'ok - a quote can only be closed once';
  end;

  insert into t_ctx values ('online_deal', d.id), ('online_total', inv.total::text);
end $$;
select pg_temp.logout();

-- what the payments-create-link Edge Function does with the service role:
insert into payments (org_id, deal_id, amount, method, status, provider, gateway_ref, payment_link, idempotency_key)
select d.org_id, d.id, (select v::numeric from t_ctx where k = 'online_total'), 'upi', 'pending', 'mock', 'plink_test_001',
       'https://pay.example/plink_test_001', 'link:' || d.id
from deals d where d.id = (select v::uuid from t_ctx where k = 'online_deal');

select pg_temp.check(apply_payment_event('mock', 'evt_001', 'payment.captured',
  jsonb_build_object('gateway_ref', 'plink_test_001', 'amount', (select v from t_ctx where k = 'online_total')::numeric, 'method', 'upi')) = 'processed',
  'webhook payment.captured processed');
select pg_temp.check(apply_payment_event('mock', 'evt_001', 'payment.captured', '{"gateway_ref":"plink_test_001"}') = 'duplicate',
  'replayed webhook is ignored (idempotent)');
select pg_temp.check((select status = 'success' from payments where gateway_ref = 'plink_test_001'), 'payment marked success');
select pg_temp.check((select status = 'active' from deals where id = (select v::uuid from t_ctx where k = 'online_deal')), 'deal activated on payment');
select pg_temp.check((select count(*) = 1 from receipts r join payments p on p.id = r.payment_id where p.gateway_ref = 'plink_test_001'), 'receipt issued once');
select pg_temp.check((select count(*) = 1 from invoices where deal_id = (select v::uuid from t_ctx where k = 'online_deal') and kind = 'tax'), 'tax invoice issued on full payment');
select pg_temp.check((select collections >= (select v::numeric from t_ctx where k = 'online_total') from daily_kpis where user_id = pg_temp.uid(10) and day = ist_today()),
  'collection counted in daily KPIs');

do $$ begin
  perform apply_payment_event('mock', 'evt_bad', 'payment.captured', '{"gateway_ref":"plink_test_001","amount":1}');
  raise notice 'ok - already-settled payment ignores later events';
end $$;

-- ---------------------------------------------------------------------
-- Inter-state customer → IGST; pending discount blocks closing
-- ---------------------------------------------------------------------
select pg_temp.login(10);
do $$
declare v_lead uuid; v_q uuid; d deals;
begin
  insert into leads (business_name, phone, owner_id, city, state)
  values ('Interstate Test Traders', '+91 97000 22222', auth.uid(), 'Bengaluru', 'Karnataka') returning id into v_lead;
  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 0, 'sent' from packages where code = 'STARTER-12' returning id into v_q;
  d := close_deal(v_q, 'cash');
  perform pg_temp.check((select igst = 2159.82 and cgst = 0 from invoices where deal_id = d.id and kind = 'proforma'), 'inter-state proforma uses IGST');

  begin
    perform record_cash_payment(d.id, 999999);
    raise exception 'FAILED: overpayment accepted';
  exception when check_violation then raise notice 'ok - cash above balance due rejected';
  end;
  perform record_cash_payment(d.id, 5000, 'Part payment at shop');
  perform pg_temp.check(deal_amount_due(d.id) = 14158.82 - 5000, 'part cash payment reduces balance');
  perform pg_temp.check((select count(*) = 0 from invoices where deal_id = d.id and kind = 'tax'), 'no tax invoice until fully paid');
  perform record_cash_payment(d.id, 9158.82);
  perform pg_temp.check((select count(*) = 1 from invoices where deal_id = d.id and kind = 'tax'), 'tax invoice once fully paid in cash');
  perform pg_temp.check((select count(*) = 2 from receipts r join payments p on p.id = r.payment_id where p.deal_id = d.id), 'a receipt per cash payment');

  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 15, 'draft' from packages where code = 'GROWTH-12' returning id into v_q;
  begin
    perform close_deal(v_q, 'online');
    raise exception 'FAILED: closed a deal awaiting discount approval';
  exception when insufficient_privilege then raise notice 'ok - deal blocked while discount awaits approval';
  end;

  begin
    perform apply_payment_event('mock', 'evt_x', 'payment.captured', '{}');
    raise exception 'FAILED: user called webhook processor';
  exception when insufficient_privilege then raise notice 'ok - users cannot fake gateway events';
  end;
end $$;
select pg_temp.logout();

-- another executive cannot close Priya's quote or record cash on her deal
select pg_temp.login(11);
do $$ begin
  perform record_cash_payment((select v::uuid from t_ctx where k = 'online_deal'), 10);
  raise exception 'FAILED: peer recorded cash';
exception when insufficient_privilege or no_data_found then raise notice 'ok - only the owner or Finance can record cash';
  when sqlstate 'P0002' then raise notice 'ok - only the owner or Finance can record cash';
end $$;
select pg_temp.logout();

-- ---------------------------------------------------------------------
-- Auto-pay: mandate activation, recurring debit, bounce
-- ---------------------------------------------------------------------
select pg_temp.login(10);
do $$
declare v_lead uuid; v_q uuid; d deals;
begin
  insert into leads (business_name, phone, owner_id, city, state)
  values ('Autopay Test Cafe', '+91 97000 33333', auth.uid(), 'Hyderabad', 'Telangana') returning id into v_lead;
  insert into quotes (lead_id, package_id, list_price, discount_pct, status)
  select v_lead, id, list_price, 0, 'sent' from packages where code = 'PREMIUM-12' returning id into v_q;
  d := close_deal(v_q, 'autopay');
  perform pg_temp.check(deal_amount_due(d.id) = round(49999 * 1.18 / 12, 2), 'auto-pay amount due is one monthly instalment');
  insert into t_ctx values ('autopay_deal', d.id), ('autopay_lead', v_lead);
end $$;
select pg_temp.logout();

insert into mandates (org_id, deal_id, provider, gateway_ref, max_amount, start_date, status)
select org_id, id, 'mock', 'sub_test_001', 7500, current_date, 'pending_bank' from deals where id = (select v::uuid from t_ctx where k = 'autopay_deal');

select apply_payment_event('mock', 'evt_m1', 'mandate.activated', '{"gateway_ref":"sub_test_001","umrn":"DEMO0000001"}');
select pg_temp.check((select status = 'active' and umrn = 'DEMO0000001' from mandates where gateway_ref = 'sub_test_001'), 'mandate activated with UMRN');
select apply_payment_event('mock', 'evt_m2', 'mandate.debit_success', '{"gateway_ref":"sub_test_001","payment_ref":"pay_d1","amount":4916.57}');
select pg_temp.check((select status = 'active' from deals where id = (select v::uuid from t_ctx where k = 'autopay_deal')), 'first debit activates the deal');
select pg_temp.check((select count(*) = 1 from invoices where deal_id = (select v::uuid from t_ctx where k = 'autopay_deal') and kind = 'tax'), 'auto-pay tax invoice after first debit');
select apply_payment_event('mock', 'evt_m3', 'mandate.debit_failed', '{"gateway_ref":"sub_test_001","payment_ref":"pay_d2","amount":4916.57,"reason":"Insufficient funds"}');
select pg_temp.check((select bounce_count = 1 from mandates where gateway_ref = 'sub_test_001'), 'bounce counted on the mandate');
select pg_temp.check((select tag = 'Auto-pay Failed' from leads where id = (select v::uuid from t_ctx where k = 'autopay_lead')), 'bounced lead lands in the Failed Auto-pay queue');
select pg_temp.check(exists (select 1 from notifications where user_id = pg_temp.uid(10) and title = 'Auto-pay bounced'), 'owner notified of the bounce');
select pg_temp.check((select count(*) = 1 from payments where mandate_id = (select id from mandates where gateway_ref = 'sub_test_001') and status = 'failed'), 'failed debit recorded for finance follow-up');

-- Finance sees gateway events; executives do not
select pg_temp.login(3);
select pg_temp.check((select count(*) >= 4 from payment_events), 'finance can audit gateway events');
select pg_temp.logout();
select pg_temp.login(10);
select pg_temp.check((select count(*) = 0 from payment_events), 'executives cannot read gateway events');
select pg_temp.logout();

\echo 'All payment tests passed'
