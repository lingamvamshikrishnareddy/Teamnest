// Gateway → TeamNest webhook. Verifies the signature over the raw body, then
// hands each normalised event to public.apply_payment_event (idempotent).
// Deploy with --no-verify-jwt: the gateway authenticates by signature.
import { admin } from '../_shared/clients.ts';
import { getGateway } from '../_shared/gateway/index.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const raw = await req.text();
  const gateway = getGateway();

  if (!(await gateway.verifyWebhook(raw, req.headers))) {
    console.warn('webhook signature mismatch');
    throw new HttpError(401, 'Invalid signature', 'invalid_signature');
  }

  const results: Record<string, string> = {};
  for (const event of gateway.parseWebhook(raw)) {
    const { data, error } = await admin.rpc('apply_payment_event', {
      p_provider: gateway.name,
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload: event.payload,
    });
    if (error) {
      // Non-2xx makes the gateway retry; the event table keeps retries idempotent.
      console.error('apply_payment_event failed', event.id, error.message);
      return json({ error: 'processing_failed', event: event.id }, 500);
    }
    results[event.id] = data as string;
  }
  return json({ ok: true, results });
});
