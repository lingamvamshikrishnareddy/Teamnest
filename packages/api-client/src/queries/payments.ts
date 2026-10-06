import type { Enums } from '@teamnest/types';
import type { TeamNestClient } from '../client';
import { toAppError, unwrap } from '../errors';

export type PaymentMode = Enums<'payment_mode'>;

/** Turns an accepted/approved quote into a deal + proforma invoice (server-validated). */
export async function closeDeal(client: TeamNestClient, quoteId: string, mode: PaymentMode, opts: { startDate?: string; remarks?: string } = {}) {
  return unwrap(
    await client.rpc('close_deal', {
      p_quote_id: quoteId,
      p_payment_mode: mode,
      p_start_date: opts.startDate,
      p_remarks: opts.remarks,
    }),
  );
}

export async function getAmountDue(client: TeamNestClient, dealId: string): Promise<number> {
  return Number(unwrap(await client.rpc('deal_amount_due', { p_deal_id: dealId })));
}

export async function recordCashPayment(client: TeamNestClient, dealId: string, amount: number, note?: string) {
  return unwrap(await client.rpc('record_cash_payment', { p_deal_id: dealId, p_amount: amount, p_note: note }));
}

export interface PaymentLinkResult {
  payment_id: string;
  url: string;
  upi_qr: string | null;
  amount: number;
  whatsapp_text?: string;
  reused?: boolean;
}

async function invoke<T>(client: TeamNestClient, fn: string, body: object): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(fn, { body });
  if (error) {
    // FunctionsHttpError carries our JSON { error, message }
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    throw toAppError({ code: detail?.error === 'forbidden' ? '42501' : detail?.error, message: detail?.message ?? error.message });
  }
  return data as T;
}

/** Creates (or reuses) a payment link + UPI QR for the amount due. */
export function createPaymentLink(client: TeamNestClient, dealId: string) {
  return invoke<PaymentLinkResult>(client, 'payments-create-link', { deal_id: dealId });
}

/** Starts an auto-pay mandate; share `auth_url` with the customer. */
export function createMandate(client: TeamNestClient, dealId: string) {
  return invoke<{ mandate_id: string; auth_url: string; status: string; instalment?: number; reused?: boolean }>(client, 'mandates-create', { deal_id: dealId });
}

/** Payments, mandate, invoices and receipts for one deal (RLS-scoped). */
export async function getDealMoney(client: TeamNestClient, dealId: string) {
  const [payments, mandates, invoices] = await Promise.all([
    client.from('payments').select('*, receipt:receipts(receipt_no, issued_at)').eq('deal_id', dealId).order('created_at', { ascending: false }),
    client.from('mandates').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
    client.from('invoices').select('*').eq('deal_id', dealId).order('issued_at'),
  ]);
  return { payments: unwrap(payments), mandates: unwrap(mandates), invoices: unwrap(invoices) };
}

/** WhatsApp share link for a payment link (opens chat with the customer). */
export function whatsappShareUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}
