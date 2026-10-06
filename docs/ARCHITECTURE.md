# Architecture

## Overview

```
 Mobile (Expo)  ─┐                      ┌─ Postgres (RLS on every table)
                 ├─ supabase-js ─► Supabase ├─ Auth (JWT + custom claims, TOTP MFA)
 Web (Next.js) ──┘   (@teamnest/api-client) ├─ Storage (9 private buckets, path-scoped)
                                         └─ Edge Functions (payments, webhooks)
```

- **One backend, one login.** Both apps use the same Supabase project and the same typed client.
- **Security lives in the database.** The UI hides modules by role (`packages/types/src/permissions.ts`), but every read/write is enforced by Row-Level Security and `SECURITY DEFINER` functions. A compromised client cannot read beyond its role.

## Data model (58 tables)

| Domain | Tables |
|---|---|
| Core | organizations, roles, territories, teams, users, employees, employee_sensitive |
| Sales | leads, lead_queues, lead_assignments, calls, visits, outcome_codes, outcomes, follow_ups, meetings, packages, quotes, deals, payments, mandates, invoices, receipts, targets, daily_kpis, ratings |
| HR | shifts, geofences, attendance, attendance_locks, leave_types, leave_balances, leave_requests, holidays, payslips, document_categories, documents, requests, policies, policy_acknowledgements, goals, appraisal_cycles, appraisals, reimbursements, incentives |
| Platform | files, approvals, approval_chains, notifications, notification_templates, push_tokens, audit_logs, app_settings, consents, location_pings, import_batches, saved_views, number_sequences |

Conventions: every table has `org_id` (defaults to the caller's org), money is `numeric(14,2)` INR, timestamps are UTC (`timestamptz`) and rendered in IST, and there are foreign keys and indexes on every lookup path.

## Security model

| Role | Sales data | HR data | Sensitive (bank/PAN/salary) |
|---|---|---|---|
| Executive | own | own | own, clear |
| Team Lead / Area Manager | downline (manager chain) | downline | masked |
| HR Admin | — | all | clear (audited) |
| Finance | all | reimbursements, payslips | clear (audited) |
| Super Admin | all + config | config | masked |

- Sensitive fields are encrypted with pgcrypto. The key comes from the Vault secret `teamnest_encryption_key`. Reads go through `get_employee_sensitive()`, which masks the values or logs the access.
- Status changes to approved or rejected are only possible via `decide_approval()`; a trigger blocks direct updates.
- Anonymous grievances are visible to HR only.
- Location pings are accepted only with consent, inside the shift window, and never on leave days.
- The custom access-token hook adds `user_role`, `org_id` and `requires_mfa` claims to the JWT.
- The audit log covers changes to roles, packages, deals, payments, payslips, settings and more, plus sensitive-data views.

## Sales → HR integrations (in the database)

- Calls and visits update `daily_kpis` and award activity points, and the first activity of the day marks attendance present.
- Outcomes set the lead status and next follow-up, and create callback tasks.
- Deals and payments roll up into revenue, collections and auto-pay %. Incentives flow to payslips.
- Approved leave consumes the balance and marks attendance; `available_assignees()` excludes people who are on leave, on a holiday or off-shift.
- One approvals engine with configurable multi-step chains covers leave, discount, reimbursement, request, incentive, regularization and profile changes.

## Design tokens

Source: `packages/ui/src/tokens.ts`. It generates `theme.css` (web) and `theme.native.css` (NativeWind) and feeds a shared Tailwind preset.

| Token | Light | Dark |
|---|---|---|
| primary / header | #2563EB | #2563EB / #0F1A33 |
| accent (teal) | #14B8A6 (text #0F766E) | #2DC4B1 |
| highlight (orange) | #F97316 (text #C2410C) | #FB8A3C |
| background | #F4F6FA | #0B1220 |
| surface (cards, 12px radius) | #FFFFFF | #111A2E |

The KPI pastel tones are blue, teal, orange, violet, pink, green, amber and sky. The font is Inter with Noto Devanagari/Telugu fallbacks. Mobile tap targets are at least 48dp. Every text/background pair is tested for WCAG AA (4.5:1).

## Localization

English, Hindi and Telugu dictionaries share the same keys (enforced by a test). Formatting follows Indian conventions: ₹1,23,456, ₹12.5 L, ₹3.25 Cr, DD MMM YYYY, IST.
