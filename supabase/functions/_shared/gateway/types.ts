/** Provider-agnostic payment gateway contract. */
export interface Customer {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface PaymentLinkRequest {
  /** Our payments.id — echoed back in webhooks as `reference`. */
  reference: string;
  amountInr: number;
  description: string;
  customer: Customer;
  expiresAt: Date;
}

export interface PaymentLink {
  gatewayRef: string;
  url: string;
  upiQr?: string;
}

export interface MandateRequest {
  /** Our mandates.id */
  reference: string;
  maxAmountInr: number;
  instalmentInr: number;
  totalCount: number;
  startAt: Date;
  customer: Customer;
  description: string;
}

export interface MandateSetup {
  gatewayRef: string;
  authUrl: string;
}

/** Normalised webhook event (see public.apply_payment_event). */
export interface GatewayEvent {
  id: string;
  type:
    | 'payment.captured' | 'payment.failed' | 'payment.refunded'
    | 'mandate.activated' | 'mandate.rejected' | 'mandate.cancelled'
    | 'mandate.debit_success' | 'mandate.debit_failed';
  payload: {
    reference?: string;
    gateway_ref?: string;
    payment_ref?: string;
    amount?: number;
    method?: 'upi' | 'card' | 'netbanking' | 'mandate';
    reason?: string;
    umrn?: string;
    paid_at?: string;
  };
}

export interface PaymentGateway {
  readonly name: string;
  createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink>;
  createMandate(req: MandateRequest): Promise<MandateSetup>;
  /** Verifies the signature over the raw body. Must be constant-time. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook(rawBody: string): GatewayEvent[];
}
