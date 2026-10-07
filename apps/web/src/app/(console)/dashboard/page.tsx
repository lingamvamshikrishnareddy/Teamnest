import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  AlertTriangle, BadgeIndianRupee, BarChart3, BookOpenCheck, CalendarCheck, CheckCheck, Clock3, FileBarChart, Gauge, GraduationCap, Handshake,
  IndianRupee, Lightbulb, Megaphone, Palmtree, PhoneCall, Receipt, Repeat, ShieldCheck, Smile, TrendingDown, UserCheck, Users, Wallet,
} from 'lucide-react';
import { sumKpis } from '@teamnest/api-client';
import { ROLE_LABELS } from '@teamnest/types';
import { createTranslator, formatDate, formatDuration, formatINR, formatINRCompact, formatNumber, formatPercent, greetingKey, pctChange, toIstDateString } from '@teamnest/ui';
import { FilterBar } from '@/components/filter-bar';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { TalkTimeTable, type PersonActivity } from './talk-time';
import { AttendanceTrend, RevenueTrend } from './trend';

export const metadata: Metadata = { title: 'Dashboard' };

type SP = { range?: string; from?: string; to?: string };

function ModuleCard({ href, icon: Icon, label, count, hint, tone }: { href: string; icon: typeof Users; label: string; count: string; hint: string; tone: string }) {
  return (
    <Link href={href} className="group rounded-card border border-border/70 bg-surface p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
      <div className="flex items-center justify-between">
        <span className={`inline-flex size-9 items-center justify-center rounded-sm bg-kpi-${tone} text-kpi-${tone}-fg`}><Icon className="size-4" aria-hidden /></span>
        <span className="rounded-full bg-highlight-soft px-2 py-0.5 text-xs font-bold tabular-nums text-highlight-text">{count}</span>
      </div>
      <div className="mt-3 font-semibold group-hover:text-primary-text">{label}</div>
      <div className="text-xs text-text-muted">{hint}</div>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireConsoleSession();
  const sp = await searchParams;
  const r = resolveRange(sp, 'month');
  const supabase = await getServerClient();
  const region = (await cookies()).get('tn_region')?.value || null;
  const t = createTranslator(session.user.locale);
  const role = session.user.role;
  const now = new Date();
  const header = (
    <PageHeader
      title={t(greetingKey(now), { name: session.user.full_name.split(' ')[0] ?? '' })}
      description={<>{ROLE_LABELS[role]} · {session.team?.name ?? session.organization.name} · {formatDate(r.from)} – {formatDate(r.to)}</>}
      actions={<Button asChild variant="soft"><Link href="/approvals"><CheckCheck /> Approvals</Link></Button>}
    />
  );

  // ------------------------------------------------------------------ HR
  if (role === 'hr_admin') {
    const today = toIstDateString();
    const [people, att, inbox, leaveToday, policies, acks, docsPending, grievances] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).neq('status', 'inactive'),
      supabase.from('attendance').select('day, status').gte('day', r.from).lte('day', r.to),
      supabase.from('my_approvals_inbox').select('id', { count: 'exact', head: true }),
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('day', today).eq('status', 'on_leave'),
      supabase.from('policies').select('id, version').eq('requires_ack', true),
      supabase.from('policy_acknowledgements').select('policy_id', { count: 'exact', head: true }),
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'pending').not('owner_user_id', 'is', null),
      supabase.from('requests').select('id', { count: 'exact', head: true }).eq('type', 'grievance').eq('status', 'pending'),
    ]);
    const byDay = new Map<string, { day: string; present: number; absent: number; leave: number }>();
    for (const a of att.data ?? []) {
      const d = byDay.get(a.day) ?? { day: a.day, present: 0, absent: 0, leave: 0 };
      if (a.status === 'present' || a.status === 'half_day') d.present++;
      else if (a.status === 'absent') d.absent++;
      else if (a.status === 'on_leave') d.leave++;
      byDay.set(a.day, d);
    }
    const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).filter((d) => d.present + d.absent + d.leave > 0);
    const todayRow = byDay.get(today);
    const ackPct = (policies.data?.length ?? 0) && people.count ? ((acks.count ?? 0) / ((policies.data?.length ?? 1) * (people.count ?? 1))) * 100 : 0;
    return (
      <>
        {header}
        <FilterBar />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Active employees" value={formatNumber(people.count ?? 0)} tone="blue" icon={Users} />
          <KpiTile label="Present today" value={formatNumber(todayRow?.present ?? 0)} tone="teal" icon={UserCheck} />
          <KpiTile label="On leave today" value={formatNumber(leaveToday.count ?? 0)} tone="orange" icon={Palmtree} />
          <KpiTile label="Pending approvals" value={formatNumber(inbox.count ?? 0)} tone="violet" icon={CalendarCheck} />
        </section>
        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ModuleCard href="/hr/employees" icon={BookOpenCheck} label="Documents to verify" count={formatNumber(docsPending.count ?? 0)} hint="Employee vault uploads" tone="sky" />
          <ModuleCard href="/hr/policies" icon={Megaphone} label="Policy read rate" count={formatPercent(ackPct, 0)} hint="Acknowledged by employees" tone="pink" />
          <ModuleCard href="/hr/requests" icon={ShieldCheck} label="Open grievances" count={formatNumber(grievances.count ?? 0)} hint="Visible to HR only" tone="amber" />
          <ModuleCard href="/hr/payroll" icon={Wallet} label="Payroll inputs" count="Ready" hint="Attendance, incentives, reimbursements" tone="green" />
        </section>
        <div className="mt-6"><AttendanceTrend data={series} /></div>
      </>
    );
  }

  // ------------------------------------------------------------- Sales / Finance / Admin
  let kpiQuery = supabase.from('daily_kpis').select('*, users!inner(id, full_name, territory_id, team_id, teams:teams!users_team_id_fkey(name))').gte('day', r.prevFrom).lte('day', r.to);
  if (region) kpiQuery = kpiQuery.eq('users.territory_id', region);

  const [kpiRes, targets, payments, mandates, quotes, team, ratings, inbox, incentives, unreadPolicies] = await Promise.all([
    kpiQuery,
    supabase.from('targets').select('user_id, metric, target_value').eq('period_month', `${r.to.slice(0, 7)}-01`),
    supabase.from('payments').select('status, method, amount, created_at').gte('created_at', r.fromTs).lte('created_at', r.toTs),
    supabase.from('mandates').select('status, bounce_count'),
    supabase.from('quotes').select('total_amount, status').in('status', ['sent', 'approved', 'pending_approval']),
    supabase.from('users').select('id', { count: 'exact', head: true }).in('role', ['executive', 'team_lead']).eq('status', 'active'),
    supabase.from('ratings').select('score').not('lead_id', 'is', null).gte('created_at', r.fromTs),
    supabase.from('my_approvals_inbox').select('id', { count: 'exact', head: true }),
    supabase.from('incentives').select('amount, status').gte('period_month', `${r.from.slice(0, 7)}-01`).lte('period_month', `${r.to.slice(0, 7)}-01`),
    supabase.from('policies').select('id', { count: 'exact', head: true }).eq('category', 'policy'),
  ]);

  type Row = NonNullable<typeof kpiRes.data>[number];
  const rows: Row[] = kpiRes.data ?? [];
  const cur = rows.filter((x) => x.day >= r.from);
  const prev = rows.filter((x) => x.day < r.from);
  const m = sumKpis(cur);
  const p = sumKpis(prev);

  const pay = payments.data ?? [];
  const success = pay.filter((x) => x.status === 'success');
  const failed = pay.filter((x) => x.status === 'failed');
  const online = success.filter((x) => ['upi', 'card', 'netbanking'].includes(x.method)).length;
  const mand = mandates.data ?? [];
  const mandActive = mand.filter((x) => x.status === 'active').length;
  const mandPending = mand.filter((x) => ['pending_bank', 'initiated'].includes(x.status)).length;
  const mandRejected = mand.filter((x) => x.status === 'rejected').length;
  const bounced = mand.filter((x) => x.bounce_count > 0).length;
  const expected = (quotes.data ?? []).reduce((a, q) => a + Number(q.total_amount), 0);
  const csat = (ratings.data ?? []).length ? (ratings.data ?? []).reduce((a, x) => a + Number(x.score), 0) / (ratings.data ?? []).length : 0;
  const budget = (incentives.data ?? []).reduce((a, x) => a + Number(x.amount), 0);

  // per-person activity + leaderboard
  const tByUser = new Map<string, Record<string, number>>();
  for (const tg of targets.data ?? []) if (tg.user_id) tByUser.set(tg.user_id, { ...(tByUser.get(tg.user_id) ?? {}), [tg.metric]: Number(tg.target_value) });
  const people = new Map<string, PersonActivity>();
  for (const x of cur) {
    const u = x.users as unknown as { id: string; full_name: string; teams: { name: string } | null };
    const a = people.get(x.user_id) ?? { userId: x.user_id, name: u.full_name, team: u.teams?.name ?? null, days: 0, calls: 0, connected: 0, talkSec: 0, visits: 0, meetings: 0, deals: 0, revenue: 0, targets: tByUser.get(x.user_id) ?? {} };
    a.days += x.calls > 0 || x.visits > 0 ? 1 : 0;
    a.calls += x.calls; a.connected += x.connected_calls; a.talkSec += x.talk_time_sec; a.visits += x.visits; a.meetings += x.meetings; a.deals += x.deals; a.revenue += Number(x.revenue);
    people.set(x.user_id, a);
  }
  const ranked = [...people.values()].sort((a, b) => b.revenue - a.revenue);
  const teamTarget = [...people.values()].reduce((a, x) => a + (x.targets.revenue ?? 0), 0);

  const daily = new Map<string, { day: string; revenue: number; collections: number }>();
  for (const x of cur) {
    const d = daily.get(x.day) ?? { day: x.day, revenue: 0, collections: 0 };
    d.revenue += Number(x.revenue); d.collections += Number(x.collections);
    daily.set(x.day, d);
  }
  const trend = [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));
  const vs = r.days === 1 ? 'vs previous day' : `vs previous ${r.days} days`;

  return (
    <>
      {header}
      <FilterBar />

      <section aria-label="Modules" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <ModuleCard href="/reports/sales" icon={Handshake} label="Sales" count={formatNumber(m.deals)} hint="Deals closed" tone="blue" />
        <ModuleCard href="/leads/queues" icon={Megaphone} label="Campaigns" count={formatNumber((quotes.data ?? []).length)} hint="Open quotes" tone="orange" />
        <ModuleCard href="/reports/talk-time" icon={PhoneCall} label="Talk Time" count={`${Math.round(m.talkTimeSec / 3600)}h`} hint="Total talk time" tone="teal" />
        <ModuleCard href="/analytics" icon={Lightbulb} label="Insights" count={formatPercent(m.connectRatePct, 0)} hint="Connect rate" tone="violet" />
        <ModuleCard href="/reports/outcomes" icon={Smile} label="Customer Satisfaction" count={csat ? csat.toFixed(1) : '—'} hint="Avg. review score" tone="pink" />
        <ModuleCard href="/reports/sales" icon={Gauge} label="Team Performance" count={teamTarget ? formatPercent((m.revenue / teamTarget) * 100, 0) : '—'} hint="Of revenue target" tone="green" />
        <ModuleCard href="/finance/payouts" icon={Wallet} label="Budget" count={formatINRCompact(budget)} hint="Incentives in period" tone="amber" />
        <ModuleCard href="/hr/policies" icon={GraduationCap} label="Training" count={formatNumber(unreadPolicies.count ?? 0)} hint="Policies & modules" tone="sky" />
      </section>

      <section aria-label="Sales" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Deals" value={formatNumber(m.deals)} tone="blue" icon={Handshake} change={pctChange(m.deals, p.deals)} hint={vs} />
        <KpiTile label="Collection" value={formatINRCompact(m.collections)} tone="teal" icon={BadgeIndianRupee} change={pctChange(m.collections, p.collections)} hint={vs} />
        <KpiTile label="Contract value" value={formatINRCompact(m.revenue)} tone="orange" icon={IndianRupee} change={pctChange(m.revenue, p.revenue)} hint={vs} />
        <KpiTile label="Expected value" value={formatINRCompact(expected)} tone="violet" icon={TrendingDown} hint="Open quotes incl. GST" />
        <KpiTile label="Auto-pay deals" value={formatNumber(m.autopayDeals)} tone="green" icon={Repeat} hint={`${formatPercent(m.autopayDealPct, 0)} of deals`} />
        <KpiTile label="Non-auto-pay" value={formatNumber(m.deals - m.autopayDeals)} tone="amber" icon={Receipt} />
        <KpiTile label="Online payments" value={formatNumber(online)} tone="sky" icon={IndianRupee} hint={`${formatPercent(success.length ? (online / success.length) * 100 : 0, 0)} of collections`} />
        <KpiTile label="Clearance" value={formatPercent(pay.length ? (success.length / pay.length) * 100 : 0, 0)} tone="pink" icon={CheckCheck} hint={`${failed.length} failed`} />
      </section>
      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><div className="text-sm text-text-muted">Mandate status</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm"><Badge tone="success">{mandActive} active</Badge><Badge tone="warning">{mandPending} pending</Badge><Badge tone="danger">{mandRejected} rejected</Badge></div></Card>
        <Card className="p-4"><div className="text-sm text-text-muted">Bounce %</div><div className="mt-1 text-2xl font-bold tabular-nums">{formatPercent(mandActive ? (bounced / mandActive) * 100 : 0, 1)}</div><div className="text-xs text-text-muted">{bounced} mandates bounced at least once</div></Card>
        <Card className="p-4"><div className="text-sm text-text-muted">Meetings · Team members</div><div className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(m.meetings)} · {formatNumber(team.count ?? 0)}</div><div className="text-xs text-text-muted">{formatDuration(m.talkTimeSec)} talk time</div></Card>
        <Link href="/reports" className="flex items-center gap-3 rounded-card border border-dashed border-border-strong p-4 hover:border-primary hover:text-primary-text"><FileBarChart className="size-6" /><div><div className="font-semibold">Custom reports</div><div className="text-xs text-text-muted">18 reports · export CSV / Excel</div></div></Link>
      </section>

      {(inbox.count ?? 0) > 0 && (
        <Link href="/approvals" className="mt-4 flex items-center gap-2 rounded-card bg-warning-soft px-4 py-3 text-sm text-warning"><AlertTriangle className="size-4" /> {inbox.count} approval{inbox.count === 1 ? '' : 's'} waiting on you</Link>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><RevenueTrend data={trend} /></div>
        <Card>
          <CardHeader><CardTitle>Leaderboard</CardTitle><CardDescription>By contract value</CardDescription></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {ranked.slice(0, 8).map((x, i) => (
                <li key={x.userId} className="flex items-center gap-3 text-sm">
                  <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-highlight text-on-highlight' : 'bg-surface-muted text-text-muted'}`}>{i + 1}</span>
                  <span className="flex-1 truncate">{x.name}<span className="block text-xs text-text-muted">{x.team}</span></span>
                  <span className="text-right font-semibold tabular-nums">{formatINR(x.revenue)}<span className="block text-xs font-normal text-text-muted">{x.deals} deals</span></span>
                </li>
              ))}
              {!ranked.length && <li className="text-sm text-text-muted">No activity in this period.</li>}
            </ol>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6"><TalkTimeTable people={ranked} /></div>
      <p className="mt-6 flex items-center gap-2 text-xs text-text-muted"><BarChart3 className="size-3.5" /><Clock3 className="size-3.5" /> Figures update as calls, visits and payments sync from the field.</p>
    </>
  );
}
