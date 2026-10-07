# Operations runbook

## 1. Provision Supabase

1. Create a project (region: Mumbai `ap-south-1` for Indian data residency).
2. Apply the schema: `supabase link --project-ref <ref> && supabase db push`.
3. **Encryption key** (sensitive HR fields): Dashboard → Project Settings → Vault → new secret
   `teamnest_encryption_key` (32+ random characters). Never rotate without re-encrypting
   `employee_sensitive` (decrypt with the old key, `set_employee_sensitive` with the new).
4. **Auth**:
   - Disable public sign-ups (users are invited by HR/Admin).
   - Enable TOTP MFA.
   - Enable the *Custom Access Token* hook → `public.custom_access_token_hook`.
   - Set Site URL and redirect URLs (`https://console.example.com`, `teamnest://`).
5. **Storage**: buckets and policies are created by migration `0008`. Check them in the dashboard.
6. **Demo data** (staging only): `DATABASE_URL=… pnpm db:seed` (it refuses to run when `APP_ENV=production`).

## 2. Edge Functions

```bash
supabase functions deploy payments-create-link mandates-create admin-invite-user
supabase functions deploy payments-webhook notifications-dispatch storage-cleanup --no-verify-jwt
supabase secrets set APP_ENV=production SITE_URL=https://console.example.com ALLOWED_ORIGIN=https://console.example.com \
  PAYMENT_PROVIDER=razorpay RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=… \
  RESEND_API_KEY=… MAIL_FROM="TeamNest <no-reply@yourdomain>" WHATSAPP_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=…
```

- Gateway webhook URL: `https://<ref>.supabase.co/functions/v1/payments-webhook`. In Razorpay, subscribe to `payment_link.paid`, `payment.failed`, `subscription.*` and `refund.processed`.
- The mock gateway is refused when `APP_ENV=production`.

## 3. Scheduled jobs

Enable the `pg_cron` and `pg_net` extensions, then add two Vault secrets: `teamnest_project_url` (`https://<ref>.supabase.co`) and `teamnest_service_key` (the service-role key). Re-run migration `0011` (or `supabase db push`). It registers:

| Job | Schedule (UTC) | What it does |
|---|---|---|
| tn-dispatch-notifications | every minute | push / email / WhatsApp delivery |
| tn-follow-up-reminders | every 15 min | reminders 1 h before follow-ups & meetings |
| tn-close-stale-tasks | 19:00 (00:30 IST) | missed follow-ups, no-show meetings, absent marks |
| tn-data-retention | 19:30 | location pings, call recordings, audit log per `data_retention_days` |
| tn-refresh-goals | 20:00 | KPI goals from live sales data |
| tn-accrue-leave | 1st of month 19:00 | monthly leave accrual |
| tn-storage-cleanup | 21:00 | deletes expired Storage objects |

## 4. Web console (Vercel or any Node host)

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_ENV=production`. Then build with `pnpm --filter @teamnest/web build`. Security headers are set in `next.config.ts`.

## 5. Mobile (EAS)

```bash
cd apps/mobile
eas init                       # sets EAS_PROJECT_ID
eas build --profile staging    # internal distribution
eas build --profile production && eas submit --profile production
```

Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `GOOGLE_MAPS_ANDROID_KEY` as EAS secrets. Push notifications need the FCM v1 credentials uploaded with `eas credentials`.

## 6. Security checklist

- RLS is enforced on every table. `pnpm db:test` runs 140+ assertions covering the role boundaries.
- Admin roles (HR, Finance, Super Admin) must use MFA, and the web console enforces AAL2.
- Sensitive fields are pgcrypto-encrypted, and views are audited.
- Supabase Auth rate-limits sign-in. Edge Functions use `check_rate_limit`: payment links 10/min, mandates 5/min, invites 20/min.
- Location is accepted only with consent and inside shift hours. Call recording needs explicit consent.
- The service-role key lives only in Edge Function secrets and Vault, never in an app bundle.

## 7. Local development without Docker

`scripts/local-stack/start.sh` runs Supabase Auth, PostgREST and a gateway against any Postgres, applying the migrations and seed. `.local-stack/gateway.log` lists every failed API call (non-2xx), which helps when you're writing queries.
