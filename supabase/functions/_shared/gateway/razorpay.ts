import { hmacSha256Hex, safeEqual } from './crypto.ts';
import type { GatewayEvent, MandateRequest, PaymentGateway, PaymentLinkRequest } from './types.ts';

const API = 'https://api.razorpay.com/v1';
const paise = (inr: number) => Math.round(inr * 100);
const inr = (p: number) => Math.round(p) / 100;

/**
 * Razorpay adapter: Payment Links for one-time payments, Subscriptions
 * (UPI Autopay / e-NACH) for mandates. Configure RAZORPAY_KEY_ID,
 * RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET as function secrets.
 */
export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay';
  constructor(private keyId: string, private keySecret: string, private webhookSecret: string) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Razorpay ${path} failed: ${data?.error?.description ?? res.status}`);
    return data as T;
  }

  async createPaymentLink(req: PaymentLinkRequest) {
    const link = await this.call<{ id: string; short_url: string }>('/payment_links', {
      amount: paise(req.amountInr),
      currency: 'INR',
      reference_id: req.reference,
      description: req.description.slice(0, 2048),
      expire_by: Math.floor(req.expiresAt.getTime() / 1000),
      customer: { name: req.customer.name, contact: req.customer.phone ?? undefined, email: req.customer.email ?? undefined },
      notify: { sms: true, email: !!req.customer.email },
      reminder_enable: true,
      notes: { teamnest_payment_id: req.reference },
    });
    return { gatewayRef: link.id, url: link.short_url };
  }

  async createMandate(req: MandateRequest) {
    const plan = await this.call<{ id: string }>('/plans', {
      period: 'monthly',
      interval: 1,
      item: { name: req.description.slice(0, 100), amount: paise(req.instalmentInr), currency: 'INR' },
      notes: { teamnest_mandate_id: req.reference },
    });
    const sub = await this.call<{ id: string; short_url: string }>('/subscriptions', {
      plan_id: plan.id,
      total_count: req.totalCount,
      quantity: 1,
      customer_notify: 1,
      start_at: Math.floor(req.startAt.getTime() / 1000),
      notes: { teamnest_mandate_id: req.reference },
    });
    return { gatewayRef: sub.id, authUrl: sub.short_url };
  }

  async verifyWebhook(rawBody: string, headers: Headers) {
    const sig = headers.get('x-razorpay-signature') ?? '';
    return safeEqual(await hmacSha256Hex(this.webhookSecret, rawBody), sig);
  }

  parseWebhook(rawBody: string): GatewayEvent[] {
    // deno-lint-ignore no-explicit-any
    const e = JSON.parse(rawBody) as any;
    const id: string = e.id ?? `${e.event}:${e.created_at}`;
    const payment = e.payload?.payment?.entity;
    const link = e.payload?.payment_link?.entity;
    const sub = e.payload?.subscription?.entity;
    const method = payment?.method === 'emandate' || payment?.method === 'nach' ? 'mandate' : payment?.method;

    switch (e.event) {
      case 'payment_link.paid':
        return [{ id, type: 'payment.captured', payload: { reference: link?.reference_id, gateway_ref: link?.id, amount: inr(link?.amount_paid ?? link?.amount), method, paid_at: payment ? new Date(payment.created_at * 1000).toISOString() : undefined } }];
      case 'payment.failed':
        if (sub || payment?.subscription_id) {
          return [{ id, type: 'mandate.debit_failed', payload: { gateway_ref: payment?.subscription_id ?? sub?.id, payment_ref: payment?.id, amount: inr(payment?.amount ?? 0), reason: payment?.error_description } }];
        }
        return [{ id, type: 'payment.failed', payload: { reference: payment?.notes?.teamnest_payment_id, gateway_ref: payment?.payment_link_id, reason: payment?.error_description } }];
      case 'subscription.authenticated':
      case 'subscription.activated':
        return [{ id, type: 'mandate.activated', payload: { reference: sub?.notes?.teamnest_mandate_id, gateway_ref: sub?.id, umrn: payment?.token_id } }];
      case 'subscription.charged':
        return [{ id, type: 'mandate.debit_success', payload: { reference: sub?.notes?.teamnest_mandate_id, gateway_ref: sub?.id, payment_ref: payment?.id, amount: inr(payment?.amount ?? 0), paid_at: payment ? new Date(payment.created_at * 1000).toISOString() : undefined } }];
      case 'subscription.halted':
      case 'subscription.cancelled':
        return [{ id, type: 'mandate.cancelled', payload: { reference: sub?.notes?.teamnest_mandate_id, gateway_ref: sub?.id, reason: e.event === 'subscription.halted' ? 'Halted after repeated failures' : 'Cancelled' } }];
      case 'refund.processed':
        return [{ id, type: 'payment.refunded', payload: { reference: payment?.notes?.teamnest_payment_id, gateway_ref: payment?.payment_link_id } }];
      default:
        return [];
    }
  }
}
