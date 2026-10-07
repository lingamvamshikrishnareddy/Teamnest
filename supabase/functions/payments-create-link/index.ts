// POST { deal_id } → creates (or reuses) a payment link for the amount due.
// Caller must be able to see the deal (RLS) and own it or be Finance.
import { admin, asUser } from '../_shared/clients.ts';
import { getGateway } from '../_shared/gateway/index.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

const LINK_TTL_HOURS = 72;

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { client, user } = await asUser(req);
  const { data: allowed } = await client.rpc('check_rate_limit', { p_action: 'payment_link', p_max: 10, p_window_seconds: 60 });
  if (allowed === false) throw new HttpError(429, 'Too many requests — please wait a minute', 'rate_limited');
  const { deal_id } = await req.json().catch(() => ({}));
  if (typeof deal_id !== 'string') throw new HttpError(400, 'deal_id is required', 'bad_request');

  // RLS: returns nothing if the caller can't see this deal
  const { data: deal, error: dealErr } = await client
    .from('deals')
    .select('id, org_id, owner_id, status, payment_mode, deal_no, lead:leads(business_name, contact_name, phone, email), package:packages!deals_package_id_fkey(name)')
    .eq('id', deal_id)
    .maybeSingle();
  if (dealErr) throw dealErr;
  if (!deal) throw new HttpError(404, 'Deal not found', 'not_found');
  if (deal.status === 'cancelled') throw new HttpError(422, 'Deal is cancelled', 'rule_violation');

  const { data: me } = await client.from('users').select('role').eq('id', user.id).single();
  if (deal.owner_id !== user.id && !['finance', 'super_admin'].includes(me?.role)) {
    throw new HttpError(403, 'Only the deal owner or Finance can send payment links', 'forbidden');
  }

  const { data: due, error: dueErr } = await client.rpc('deal_amount_due', { p_deal_id: deal.id });
  if (dueErr) throw dueErr;
  const amount = Number(due);
  if (!(amount > 0)) throw new HttpError(422, 'Nothing is due on this deal', 'rule_violation');

  // Reuse a live link for the same amount instead of creating duplicates
  const { data: existing } = await admin
    .from('payments')
    .select('id, payment_link, upi_qr, amount, link_expires_at')
    .eq('deal_id', deal.id)
    .eq('status', 'pending')
    .eq('amount', amount)
    .gt('link_expires_at', new Date().toISOString())
    .maybeSingle();
  if (existing) return json({ payment_id: existing.id, url: existing.payment_link, upi_qr: existing.upi_qr, amount, reused: true });

  const gateway = getGateway();
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 3600_000);
  // deno-lint-ignore no-explicit-any
  const lead = deal.lead as any;
  // deno-lint-ignore no-explicit-any
  const pkg = deal.package as any;

  const { data: payment, error } = await admin
    .from('payments')
    .insert({
      org_id: deal.org_id,
      deal_id: deal.id,
      amount,
      method: 'upi',
      status: 'initiated',
      provider: gateway.name,
      collected_by: user.id,
      due_date: expiresAt.toISOString().slice(0, 10),
      link_expires_at: expiresAt.toISOString(),
      purpose: deal.payment_mode === 'autopay' ? 'instalment' : 'full',
      idempotency_key: `link:${deal.id}:${amount}:${Math.floor(Date.now() / 60_000)}`,
    })
    .select('id')
    .single();
  if (error) throw error;

  try {
    const link = await gateway.createPaymentLink({
      reference: payment.id,
      amountInr: amount,
      description: `${pkg?.name ?? 'Subscription'} · ${deal.deal_no}`,
      customer: { name: lead?.contact_name ?? lead?.business_name, phone: lead?.phone, email: lead?.email },
      expiresAt,
    });
    await admin.from('payments').update({ status: 'pending', gateway_ref: link.gatewayRef, payment_link: link.url, upi_qr: link.upiQr ?? null }).eq('id', payment.id);

    const share = `Hello ${lead?.contact_name ?? lead?.business_name ?? ''}, here is your secure payment link for ${pkg?.name}: ${link.url} (₹${amount.toLocaleString('en-IN')}, valid ${LINK_TTL_HOURS} h).`;
    return json({ payment_id: payment.id, url: link.url, upi_qr: link.upiQr ?? null, amount, whatsapp_text: share });
  } catch (e) {
    await admin.from('payments').update({ status: 'failed', failure_reason: 'Could not create payment link' }).eq('id', payment.id);
    throw e;
  }
});
