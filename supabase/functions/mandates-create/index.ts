// POST { deal_id } → creates an auto-pay mandate (UPI Autopay / e-NACH) and
// returns the authorisation URL to share with the customer.
import { admin, asUser } from '../_shared/clients.ts';
import { getGateway } from '../_shared/gateway/index.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { client, user } = await asUser(req);
  const { data: allowed } = await client.rpc('check_rate_limit', { p_action: 'mandate_create', p_max: 5, p_window_seconds: 60 });
  if (allowed === false) throw new HttpError(429, 'Too many requests — please wait a minute', 'rate_limited');
  const { deal_id } = await req.json().catch(() => ({}));
  if (typeof deal_id !== 'string') throw new HttpError(400, 'deal_id is required', 'bad_request');

  const { data: deal, error: dealErr } = await client
    .from('deals')
    .select('id, org_id, owner_id, status, payment_mode, tenure_months, start_date, deal_no, lead:leads(business_name, contact_name, phone, email), package:packages!deals_package_id_fkey(name)')
    .eq('id', deal_id)
    .maybeSingle();
  if (dealErr) throw dealErr;
  if (!deal) throw new HttpError(404, 'Deal not found', 'not_found');
  if (deal.payment_mode !== 'autopay') throw new HttpError(422, 'This deal is not on auto-pay', 'rule_violation');
  if (deal.owner_id !== user.id) {
    const { data: me } = await client.from('users').select('role').eq('id', user.id).single();
    if (!['finance', 'super_admin'].includes(me?.role)) throw new HttpError(403, 'Only the deal owner or Finance can set up auto-pay', 'forbidden');
  }

  const { data: active } = await admin.from('mandates').select('id, auth_url, status').eq('deal_id', deal.id).in('status', ['initiated', 'pending_bank', 'active']).maybeSingle();
  if (active) return json({ mandate_id: active.id, auth_url: active.auth_url, status: active.status, reused: true });

  const { data: due } = await client.rpc('deal_amount_due', { p_deal_id: deal.id });
  const instalment = Number(due);
  if (!(instalment > 0)) throw new HttpError(422, 'Nothing is due on this deal', 'rule_violation');

  const gateway = getGateway();
  const startAt = new Date(`${deal.start_date ?? new Date().toISOString().slice(0, 10)}T04:30:00Z`); // 10:00 IST
  const maxAmount = Math.ceil(instalment * 1.5);

  const { data: mandate, error } = await admin
    .from('mandates')
    .insert({ org_id: deal.org_id, deal_id: deal.id, provider: gateway.name, max_amount: maxAmount, frequency: 'monthly', start_date: startAt.toISOString().slice(0, 10), status: 'initiated' })
    .select('id')
    .single();
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  const lead = deal.lead as any;
  // deno-lint-ignore no-explicit-any
  const pkg = deal.package as any;
  try {
    const setup = await gateway.createMandate({
      reference: mandate.id,
      maxAmountInr: maxAmount,
      instalmentInr: instalment,
      totalCount: deal.tenure_months,
      startAt,
      customer: { name: lead?.contact_name ?? lead?.business_name, phone: lead?.phone, email: lead?.email },
      description: `${pkg?.name ?? 'Subscription'} · ${deal.deal_no}`,
    });
    await admin.from('mandates').update({ status: 'pending_bank', gateway_ref: setup.gatewayRef, auth_url: setup.authUrl, next_debit_date: startAt.toISOString().slice(0, 10) }).eq('id', mandate.id);
    return json({ mandate_id: mandate.id, auth_url: setup.authUrl, instalment, max_amount: maxAmount, status: 'pending_bank' });
  } catch (e) {
    await admin.from('mandates').update({ status: 'rejected', rejection_reason: 'Could not start mandate setup' }).eq('id', mandate.id);
    throw e;
  }
});
