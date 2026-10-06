import { MockGateway } from './mock.ts';
import { RazorpayGateway } from './razorpay.ts';
import type { PaymentGateway } from './types.ts';

export type { GatewayEvent, PaymentGateway } from './types.ts';

/** PAYMENT_PROVIDER=mock (default, dev) | razorpay */
export function getGateway(): PaymentGateway {
  const provider = Deno.env.get('PAYMENT_PROVIDER') ?? 'mock';
  if (provider === 'razorpay') {
    const id = Deno.env.get('RAZORPAY_KEY_ID');
    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const hook = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!id || !secret || !hook) throw new Error('Razorpay secrets are not configured');
    return new RazorpayGateway(id, secret, hook);
  }
  if (Deno.env.get('APP_ENV') === 'production') throw new Error('Mock payment gateway is disabled in production');
  return new MockGateway(Deno.env.get('MOCK_WEBHOOK_SECRET') ?? 'mock-webhook-secret', Deno.env.get('MOCK_PAY_BASE_URL') ?? 'http://127.0.0.1:54321/mock-pay');
}
