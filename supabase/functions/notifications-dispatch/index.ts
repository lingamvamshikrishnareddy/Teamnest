// Delivers queued notifications beyond in-app: push (Expo), email (Resend),
// WhatsApp (Meta Cloud API templates). Called every minute by pg_cron.
// Each channel is optional — unconfigured channels are recorded as "skipped".
import { admin } from '../_shared/clients.ts';
import { json, serve } from '../_shared/http.ts';
import { requireServiceRole } from '../_shared/service.ts';

type Note = { id: string; org_id: string; user_id: string; category: string; title: string; body: string | null; data: Record<string, unknown>; template_code: string | null };

const EXPO = 'https://exp.host/--/api/v2/push/send';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'TeamNest <no-reply@example.com>';
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN');
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
// email only for these categories (others are push-only)
const EMAIL_CATEGORIES = new Set(['hr', 'approvals', 'payments']);

serve(async (req) => {
  requireServiceRole(req);
  const { data: notes, error } = await admin.rpc('claim_notifications', { p_limit: 300 });
  if (error) throw error;
  const batch = (notes ?? []) as Note[];
  if (!batch.length) return json({ delivered: 0 });

  const userIds = [...new Set(batch.map((n) => n.user_id))];
  const [{ data: tokens }, { data: users }, { data: templates }] = await Promise.all([
    admin.from('push_tokens').select('user_id, token').in('user_id', userIds),
    admin.from('users').select('id, email, phone, full_name, locale').in('id', userIds),
    admin.from('notification_templates').select('org_id, code, channel, locale, subject, body').eq('is_active', true),
  ]);
  const tokensBy = new Map<string, string[]>();
  for (const t of tokens ?? []) tokensBy.set(t.user_id, [...(tokensBy.get(t.user_id) ?? []), t.token]);
  const userBy = new Map((users ?? []).map((u) => [u.id, u]));
  const tpl = (n: Note, channel: string) => (templates ?? []).find((t) => t.org_id === n.org_id && t.code === n.template_code && t.channel === channel);
  const fill = (s: string, n: Note) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String((n.data as Record<string, unknown>)[k] ?? userBy.get(n.user_id)?.full_name ?? ''));

  // ---- push (Expo accepts up to 100 messages per request)
  const messages = batch.flatMap((n) => (tokensBy.get(n.user_id) ?? []).map((to) => ({ to, title: n.title, body: n.body ?? undefined, data: n.data, sound: null, channelId: 'default', _id: n.id })));
  const pushStatus = new Map<string, string>();
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(chunk.map(({ _id, ...m }) => m)) });
      const out = await res.json();
      (out.data ?? []).forEach((r: { status: string; details?: { error?: string } }, j: number) => {
        pushStatus.set(chunk[j]!._id, r.status === 'ok' ? 'sent' : 'failed');
        if (r.details?.error === 'DeviceNotRegistered') deadTokens.push(chunk[j]!.to);
      });
    } catch {
      chunk.forEach((m) => pushStatus.set(m._id, 'failed'));
    }
  }
  if (deadTokens.length) await admin.from('push_tokens').delete().in('token', deadTokens);

  // ---- email & WhatsApp
  const results = await Promise.all(batch.map(async (n) => {
    const u = userBy.get(n.user_id);
    const delivery: Record<string, string> = { push: pushStatus.get(n.id) ?? (tokensBy.has(n.user_id) ? 'failed' : 'no_device') };

    const et = tpl(n, 'email');
    if (RESEND_KEY && u?.email && (et || EMAIL_CATEGORIES.has(n.category))) {
      const subject = et?.subject ? fill(et.subject, n) : n.title;
      const text = et ? fill(et.body, n) : `${n.title}\n\n${n.body ?? ''}`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: MAIL_FROM, to: u.email, subject, text }) }).catch(() => null);
      delivery.email = r?.ok ? 'sent' : 'failed';
    } else delivery.email = 'skipped';

    const wt = tpl(n, 'whatsapp');
    if (WA_TOKEN && WA_PHONE_ID && wt && u?.phone) {
      const to = `91${u.phone.replace(/\D/g, '').slice(-10)}`;
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { authorization: `Bearer ${WA_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: fill(wt.body, n) } }),
      }).catch(() => null);
      delivery.whatsapp = r?.ok ? 'sent' : 'failed';
    }
    return { id: n.id, delivery };
  }));

  await Promise.all(results.map((r) => admin.from('notifications').update({ delivery: r.delivery }).eq('id', r.id)));
  return json({ delivered: batch.length, push: messages.length });
});
