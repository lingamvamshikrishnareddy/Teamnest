import { hmacSha256Hex, safeEqual } from './crypto.ts';
import type { GatewayEvent, MandateRequest, PaymentGateway, PaymentLinkRequest } from './types.ts';

/**
 * Development gateway: no network calls. Links point at MOCK_PAY_BASE_URL;
 * webhooks are signed with MOCK_WEBHOOK_SECRET using the same scheme as
 * production (hex HMAC-SHA256 of the raw body in `x-mock-signature`), so
 * the full webhook path is exercised locally.
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  constructor(private secret: string, private baseUrl: string) {}

  async createPaymentLink(req: PaymentLinkRequest) {
    const gatewayRef = `plink_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
    const url = `${this.baseUrl}/pay/${gatewayRef}?amount=${req.amountInr.toFixed(2)}`;
    const upi = `upi://pay?pa=demo@upi&pn=${encodeURIComponent('TeamNest Demo')}&am=${req.amountInr.toFixed(2)}&tr=${req.reference}&cu=INR`;
    return { gatewayRef, url, upiQr: upi };
  }

  async createMandate(_req: MandateRequest) {
    const gatewayRef = `sub_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
    return { gatewayRef, authUrl: `${this.baseUrl}/mandate/${gatewayRef}` };
  }

  async verifyWebhook(rawBody: string, headers: Headers) {
    const sig = headers.get('x-mock-signature') ?? '';
    return safeEqual(await hmacSha256Hex(this.secret, rawBody), sig);
  }

  parseWebhook(rawBody: string): GatewayEvent[] {
    const body = JSON.parse(rawBody);
    return Array.isArray(body) ? body : [body];
  }
}
