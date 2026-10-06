# Teamnest
Build a full-stack platform called "TeamNest" (placeholder name) that combines
(A) a Field Sales & Lead Management system (the core product) and
(B) an Employee HR self-service system, delivered as:
  1. a MOBILE APP for sales executives and team leads (iOS + Android), and
  2. a WEB APP for managers, HR and admins (desktop-first, also responsive).
Both use the same backend, same login and same data.

ORIGINALITY: Use only original branding, copy, illustrations and icons. Do not
use any existing company's name, logo, tagline or screenshots. Use the Lucide
icon set, generic placeholder avatars, and fictional demo data only.

=========================================================
0. TECH STACK
=========================================================
- Monorepo (pnpm workspaces / Turborepo):
  - /apps/mobile  -> React Native + Expo + TypeScript (Expo Router, NativeWind)
  - /apps/web     -> Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
  - /packages/ui, /packages/types, /packages/api-client (shared code)
- Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions)
- Charts: Recharts (web), Victory Native (mobile)
- Maps: Mapbox or Google Maps. Push notifications: Expo Notifications + FCM
- Offline support on mobile (SQLite/WatermelonDB or React Query persistence),
  sync when back online.
- Row-Level Security on every table. Audit log for sensitive actions.

=========================================================
1. ROLES AND ACCESS
=========================================================
Roles: Executive, Team Lead, Area Manager, HR Admin, Finance, Super Admin.
- Executive: own leads, own attendance/leave/payslips (MOBILE focus)
- Team Lead / Area Manager: team data, approvals, team dashboards
- HR Admin: employees, attendance, leave, payroll inputs, policies, documents
- Finance: payments, mandates, invoices, incentive payouts, reimbursements
- Super Admin: configuration, roles, queues, packages, targets
Sensitive HR fields (bank, ID numbers, salary) are visible only to the owner
and HR/Finance, masked elsewhere, encrypted at rest.

=========================================================
2. VISUAL STYLE
=========================================================
Royal-blue (#2563EB) headers, teal (#14B8A6) accents, orange (#F97316) for
highlights, white rounded cards (12px), soft shadows, light-grey (#F4F6FA)
background, Inter font, pastel colored KPI tiles with trend arrows.
Light + dark mode. Accessible contrast, large tap targets on mobile.

=========================================================
3. MOBILE APP (Executives & Team Leads)
=========================================================
Bottom tabs: Home | Leads | Add Business (+) | Work (HR) | Profile

3.1 HOME
- Greeting, rating, notification bell, scan icon, AI Helper floating button
- Scrollable tabs: Month Summary | Follow-ups | Callbacks | Meetings |
  Priority Leads | New Business | Queues | Outcomes | Reports | Closed Deals
- Month Summary: revenue figure with % change + motivational message, pastel
  KPI tiles (Deals Closed, 1-Yr/3-Yr Renewals, Collections, Auto-pay Success,
  Auto-pay Deal %, Online Payment %), shortcuts (Incentives, Insights, Unsold
  Packages), dismissible offer banner, "Team Wins" video carousel
- Today strip: punch status, pending follow-ups, meetings today

3.2 LEAD LIST + LEAD DETAIL
- Search by business name, filters, chips: Today(n) / All(n) / Pending
- Lead card: timestamp, tag badge, business name, lead ID, star rating,
  locality - pincode - distance, last outcome, WhatsApp + Call buttons,
  [Details] [Customer Reviews] [Record Call]
- Lead detail: contact, map + navigate, timeline (calls, visits, notes,
  documents), package pitch, quote builder, outcome form, schedule
  follow-up/meeting, upload photos/documents
- Friendly empty states and skeleton loaders

3.3 CALL, VISIT AND OUTCOME FLOW
- Click-to-call, WhatsApp, optional call recording WITH consent notice
- Outcome picker: Interested, Call Back, Not Interested, Do Not Contact,
  Wrong Number, Meeting Set, Deal Closed + remarks + next follow-up time
- Field visit check-in/check-out with GPS + photo (geofenced to lead location)
- Auto-log talk time, call count, visits, distance travelled

3.4 DEAL CLOSING AND PAYMENT
- Select package, price, discount (approval rule if above limit)
- Collect documents (KYC) with camera + rejection reasons shown later
- Payment: auto-pay mandate setup, online payment link/QR, cash receipt
- Generate proforma invoice and receipt (PDF), share via WhatsApp

3.5 WORK (HR self-service tab)
- Attendance: punch in/out (GPS + selfie optional), monthly donut summary,
  calendar view, daily list with points/hours, "need to apply" reminders
- Leave: balance by type, apply/cancel, status, holiday calendar
- Payslips and Documents: payslip PDFs by month, document vault by category
  (education, ID/address proof, offer/appointment letter, PF/gratuity,
  investment proofs)
- Goals and KPIs: targets vs achieved with weightage, auto-filled from sales
  data, strengths / improvement notes, appraisal status
- Requests: punch correction, leave, access, travel, reimbursement, business
  cards, retention bonus, exit, grievance (anonymous option)
- Policies and Updates (acknowledge-read tracking), Visiting card and ID card
  share (QR), Notifications

3.6 PROFILE
- Company, personal, bank, emergency contact and reporting-head cards with
  edit-request flow (HR approves changes), settings, language, logout

=========================================================
4. WEB APP (Managers, HR, Finance, Admin)
=========================================================
Left sidebar + top bar with global search, notifications, city/region switcher.

4.1 MANAGER DASHBOARD
Module cards with count badges: Sales, Campaigns, Talk Time, Insights,
Customer Satisfaction, Team Performance, Budget, Training.
- Sales tiles: Deals, Collection, Expected Value, Contract Value, Auto-pay,
  Non-Auto-pay, Mandate Status, Clearance, Online Payments, Meetings,
  Bounce %, Team Members, Custom Reports
- Talk Time: filters (Drill-down, period, average vs total), expandable
  employee rows, Metric | Achieved | Target table
- Insights: compare cities, compare with own past, leaderboard, heatmap map
- Live team map (where executives are now, visits today)

4.2 LEAD MANAGEMENT (ADMIN)
- Lead import (CSV/Excel) with duplicate detection and validation
- Configurable lead queues (rules-based, not hard-coded): Main, Unassigned,
  Work-from-Home, Top B2B, B2B, Top B2C, Expired Paid, Priority, Renewals,
  Failed Auto-pay, Hot Today, Hot Live, Low Reach, Quick Wins
- Bulk assign / reassign, round-robin and territory-based auto-assignment
- Action Needed: Rejected Documents, Rejected Mandates, Data Anomalies,
  Missing Locations
- Packages, pricing, discount rules, approval workflows, campaigns

4.3 BUSINESS ANALYTICS
- Call Analytics, Revenue Analytics, Lead Analytics (Summary, Onboarding, ROI,
  Partner Overview, Activity Tracker), Listing Analytics, Partner tracker
- Lead Summary: filters (Daily/Yesterday/Past Week...), toggle (Leads | Unique
  Users), grouped bar chart (Received, Delivered, Unique Delivered, Generated,
  Unique Generated), Full View, data table, CSV/Excel export
- Saved views, scheduled email reports

4.4 REPORTS (all with date range, filters, search, summary chips, export)
Sales, Outcomes, Auto-pay Monthly, Mandates, Payment Failures, Cancelled
Contracts, Downgrades, Incentives, Field Visits, Invoices & Receipts, Leads,
Talk Time, Finance, Proforma Invoices, Attendance, Leave, Headcount, Payroll
Inputs.

4.5 HR ADMIN CONSOLE
- Employee directory and profiles, onboarding checklist, document collection
- Attendance management: shifts, geofences, regularization approvals, late/
  absent rules, monthly attendance lock
- Leave policy engine: leave types, accrual, carry-forward, holiday calendars
  per city, approval chains
- Payroll inputs: attendance days, incentives, deductions, reimbursements,
  export to payroll system, payslip generation and publishing
- Performance: KRA/KPI templates, goal assignment, appraisal cycles,
  manager review, score calculation
- Policies and announcements with read-receipts, internal job postings,
  events, exit management, grievance handling, headcount requests

4.6 FINANCE CONSOLE
Payments, mandate status and bounces, collections follow-up, invoices,
reimbursements, incentive payout approvals.

4.7 ADMIN SETTINGS
Users and roles, teams and territories, targets, queues, outcome codes,
packages, approval chains, notification templates, audit log, data retention.

=========================================================
5. INTEGRATIONS BETWEEN SALES AND HR (KEY DIFFERENTIATOR)
=========================================================
- Field visit check-ins and calls automatically count toward attendance and
  activity points.
- Deals and collections automatically calculate incentives; approved incentives
  flow into payroll inputs and appear on the payslip.
- KPI/KRA achievement values auto-populate from live sales data.
- Leave and shift data feed lead assignment (no leads to people on leave).
- Manager approvals (leave, discounts, reimbursements, requests) in one
  unified "Approvals" inbox on web and mobile.
- Single notification center (push, in-app, email, WhatsApp templates).

=========================================================
6. DATA MODEL (Supabase / Postgres)
=========================================================
Core: organizations, users, roles, teams, territories, employees
Sales: leads, lead_queues, lead_assignments, calls, visits, outcomes,
follow_ups, meetings, packages, quotes, deals, payments, mandates, invoices,
receipts, targets, daily_kpis, ratings
HR: attendance, shifts, geofences, leave_types, leave_balances, leave_requests,
holidays, payslips, documents, document_categories, requests, policies,
policy_acknowledgements, goals, appraisal_cycles, appraisals, reimbursements,
incentives
Platform: notifications, approvals, audit_logs, files, app_settings
Include indexes, foreign keys, RLS policies and seed SQL.

=========================================================
7. NON-FUNCTIONAL REQUIREMENTS
=========================================================
- Privacy: consent for call recording and location tracking, tracking only
  during working hours, clear employee-facing privacy notice
- Security: JWT auth, MFA for admins, encrypted sensitive fields, rate limiting
- Performance: paginated lists, virtualized tables, cached dashboards
- Localization: English + Hindi + Telugu ready (i18n), Indian formats
  (INR, lakh/crore, DD MMM YYYY), IST timezone
- Seed realistic FICTIONAL demo data so every screen looks populated
- Tests for critical flows, CI pipeline, environment-based config

=========================================================
8. BUILD ORDER (do one phase at a time, confirm before moving on)
=========================================================
Phase 1: Monorepo setup, Supabase schema + RLS, auth + roles, design system
Phase 2: Mobile Home + Lead list + Lead detail + Outcome flow + Call logging
Phase 3: Web Manager Dashboard + Lead import/assignment + Reports basics
Phase 4: Deal closing, packages, payments, invoices
Phase 5: HR core: attendance (GPS), leave, payslips, documents (mobile + web HR)
Phase 6: KPIs/KRA + incentives -> payroll integration, approvals inbox
Phase 7: Advanced analytics, notifications, offline sync, polish, testing

Start with Phase 1 now. Show me the folder structure, database schema and
design tokens first, then wait for my approval.
