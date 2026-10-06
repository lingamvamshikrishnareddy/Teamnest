import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  BadgeIndianRupee, CalendarCheck, CheckCheck, Clock3, Handshake, IndianRupee, Palmtree, PhoneCall, Repeat, Route, UserCheck, Users,
} from 'lucide-react';
import { sumKpis } from '@teamnest/api-client';
import { ROLE_LABELS } from '@teamnest/types';
import {
  createTranslator, formatDate, formatDuration, formatINRCompact, formatNumber, formatPercent, greetingKey, istMonthStart, pctChange, toIstDateString,
} from '@teamnest/ui';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await requireConsoleSession();
  const supabase = await getServerClient();
  const region = (await cookies()).get('tn_region')?.value || null;
  const t = createTranslator(session.user.locale);
  const now = new Date();
  const monthStart = istMonthStart(now);
  const prev = new Date(now);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevStart = istMonthStart(prev);
  const today = toIstDateString(now);
  const prevCutoff = `${prevStart.slice(0, 8)}${today.slice(8, 10)}`;

  // RLS scopes these rows to what the signed-in role may see (team, area or org).
  let kpiQuery = supabase.from('daily_kpis').select('*, users!inner(territory_id)').gte('day', prevStart);
  if (region) kpiQuery = kpiQuery.eq('users.territory_id', region);
  const [{ data: kpiRows }, inbox, people, presentToday, onLeaveToday] = await Promise.all([
    kpiQuery,
    supabase.from('my_approvals_inbox').select('id, type', { count: 'exact' }),
    supabase.from('users').select('id', { count: 'exact', head: true }).neq('status', 'inactive'),
    supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('day', today).eq('status', 'present'),
    supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('day', today).eq('status', 'on_leave'),
  ]);

  const rows = kpiRows ?? [];
  const mtd = sumKpis(rows.filter((r) => r.day >= monthStart));
  const lmtd = sumKpis(rows.filter((r) => r.day < monthStart && r.day <= prevCutoff));
  const isHr = session.user.role === 'hr_admin';
  const approvalsByType = (inbox.data ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.type ?? 'other']: (a[r.type ?? 'other'] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader
        title={t(greetingKey(now), { name: session.user.full_name.split(' ')[0] ?? '' })}
        description={
          <>
            {ROLE_LABELS[session.user.role]} · {session.team?.name ?? session.organization.name} · {formatDate(now)}
          </>
        }
        actions={
          <Button asChild variant="soft">
            <Link href="/approvals"><CheckCheck /> Approvals <Badge tone="highlight" className="ml-1">{inbox.count ?? 0}</Badge></Link>
          </Button>
        }
      />

      {isHr ? (
        <section aria-label="People today" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Active employees" value={formatNumber(people.count ?? 0)} tone="blue" icon={Users} />
          <KpiTile label="Present today" value={formatNumber(presentToday.count ?? 0)} tone="teal" icon={UserCheck} />
          <KpiTile label="On leave today" value={formatNumber(onLeaveToday.count ?? 0)} tone="orange" icon={Palmtree} />
          <KpiTile label="Pending approvals" value={formatNumber(inbox.count ?? 0)} tone="violet" icon={CalendarCheck} />
        </section>
      ) : (
        <>
          <section aria-label="Month to date" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label={t('kpi.revenue')} value={formatINRCompact(mtd.revenue)} tone="blue" icon={IndianRupee} change={pctChange(mtd.revenue, lmtd.revenue)} hint={t('kpi.vsLastMonth')} />
            <KpiTile label={t('kpi.dealsClosed')} value={formatNumber(mtd.deals)} tone="teal" icon={Handshake} change={pctChange(mtd.deals, lmtd.deals)} hint={t('kpi.vsLastMonth')} />
            <KpiTile label={t('kpi.collections')} value={formatINRCompact(mtd.collections)} tone="orange" icon={BadgeIndianRupee} change={pctChange(mtd.collections, lmtd.collections)} hint={t('kpi.vsLastMonth')} />
            <KpiTile label={t('kpi.autopayDealPct')} value={formatPercent(mtd.autopayDealPct, 0)} tone="violet" icon={Repeat} change={pctChange(mtd.autopayDealPct, lmtd.autopayDealPct)} />
          </section>
          <section aria-label="Activity" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label={t('kpi.calls')} value={formatNumber(mtd.calls)} tone="sky" icon={PhoneCall} change={pctChange(mtd.calls, lmtd.calls)} hint={`${formatPercent(mtd.connectRatePct, 0)} connected`} />
            <KpiTile label={t('kpi.talkTime')} value={formatDuration(mtd.talkTimeSec)} tone="green" icon={Clock3} change={pctChange(mtd.talkTimeSec, lmtd.talkTimeSec)} />
            <KpiTile label={t('kpi.visits')} value={formatNumber(mtd.visits)} tone="amber" icon={Route} change={pctChange(mtd.visits, lmtd.visits)} hint={`${formatNumber(mtd.distanceKm)} km`} />
            <KpiTile label="Meetings" value={formatNumber(mtd.meetings)} tone="pink" icon={CalendarCheck} change={pctChange(mtd.meetings, lmtd.meetings)} />
          </section>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Build roadmap</CardTitle>
            <CardDescription>Phase 1 is live: schema, security, sign-in, roles and the design system. Modules light up phase by phase.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2">
              {[
                ['1', 'Foundation: schema, RLS, auth, roles, design system', true],
                ['2', 'Mobile: Home, leads, lead detail, outcomes, calls', false],
                ['3', 'Web: manager dashboard, lead import & assignment, reports', false],
                ['4', 'Deals, packages, payments, invoices', false],
                ['5', 'HR core: attendance, leave, payslips, documents', false],
                ['6', 'KPIs & incentives → payroll, approvals inbox', false],
                ['7', 'Analytics, notifications, offline sync, polish', false],
              ].map(([n, label, done]) => (
                <li key={n as string} className="flex items-start gap-3 rounded-sm bg-surface-muted/60 p-3 text-sm">
                  <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-accent text-on-accent' : 'bg-surface text-text-muted ring-1 ring-border'}`}>{n}</span>
                  <span className={done ? 'font-medium' : 'text-text-muted'}>{label}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Waiting on you</CardTitle>
            <CardDescription>Your unified approvals inbox</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(approvalsByType).length === 0 ? (
              <p className="text-sm text-text-muted">You’re all caught up.</p>
            ) : (
              <ul className="divide-y divide-border">
                {Object.entries(approvalsByType).map(([type, n]) => (
                  <li key={type} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="capitalize">{type.replace('_', ' ')}</span>
                    <Badge tone="primary">{n}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
