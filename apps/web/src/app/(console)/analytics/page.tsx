import type { Metadata } from 'next';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { AnalyticsView, type LeadFunnelDay } from './analytics-view';

export const metadata: Metadata = { title: 'Analytics' };

type SP = { range?: string; from?: string; to?: string; tab?: string; group?: string };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const r = resolveRange(sp, '30d');
  const supabase = await getServerClient();

  const [kpis, leads, outcomes, deals, prevKpis] = await Promise.all([
    supabase.from('daily_kpis').select('day, user_id, calls, connected_calls, talk_time_sec, visits, deals, revenue, collections, users!inner(full_name, territory:territories!users_territory_id_fkey(name))').gte('day', r.from).lte('day', r.to),
    supabase.from('leads').select('created_at, status, source, segment, city, owner_id').gte('created_at', r.fromTs).lte('created_at', r.toTs).limit(20000),
    supabase.from('report_outcomes').select('day, outcome_code, label, total').gte('day', r.from).lte('day', r.to),
    supabase.from('deals').select('closed_at, contract_value, payment_mode, package:packages!deals_package_id_fkey(name), lead:leads(city, source)').gte('closed_at', r.fromTs).lte('closed_at', r.toTs),
    supabase.from('daily_kpis').select('user_id, revenue, deals, calls').gte('day', r.prevFrom).lte('day', r.prevTo),
  ]);

  // Lead summary (funnel per day): received → contacted → interested → won
  const byDay = new Map<string, LeadFunnelDay>();
  const blank = (day: string): LeadFunnelDay => ({ day, received: 0, contacted: 0, interested: 0, meetings: 0, won: 0 });
  for (const l of leads.data ?? []) {
    const day = new Date(new Date(l.created_at).getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const d = byDay.get(day) ?? blank(day);
    d.received++;
    if (l.status !== 'new') d.contacted++;
    if (['interested', 'meeting_set', 'negotiation', 'won'].includes(l.status)) d.interested++;
    if (['meeting_set', 'won'].includes(l.status)) d.meetings++;
    if (l.status === 'won') d.won++;
    byDay.set(day, d);
  }

  const cities = new Map<string, { city: string; revenue: number; deals: number; calls: number; connected: number }>();
  const people = new Map<string, { name: string; revenue: number; deals: number; calls: number }>();
  const heat = new Map<string, number>(); // weekday × hour not available from daily rollup → weekday × city
  for (const k of kpis.data ?? []) {
    const u = k.users as unknown as { full_name: string; territory: { name: string } | null };
    const city = u.territory?.name ?? 'Unassigned';
    const c = cities.get(city) ?? { city, revenue: 0, deals: 0, calls: 0, connected: 0 };
    c.revenue += Number(k.revenue); c.deals += k.deals; c.calls += k.calls; c.connected += k.connected_calls;
    cities.set(city, c);
    const p = people.get(k.user_id) ?? { name: u.full_name, revenue: 0, deals: 0, calls: 0 };
    p.revenue += Number(k.revenue); p.deals += k.deals; p.calls += k.calls;
    people.set(k.user_id, p);
    const wd = new Date(`${k.day}T00:00:00Z`).getUTCDay();
    heat.set(`${city}|${wd}`, (heat.get(`${city}|${wd}`) ?? 0) + k.connected_calls);
  }
  const prevByUser = new Map<string, number>();
  for (const k of prevKpis.data ?? []) prevByUser.set(k.user_id, (prevByUser.get(k.user_id) ?? 0) + Number(k.revenue));

  const outcomeTotals = new Map<string, number>();
  for (const o of outcomes.data ?? []) outcomeTotals.set(o.label ?? '', (outcomeTotals.get(o.label ?? '') ?? 0) + Number(o.total));

  const pkgTotals = new Map<string, { name: string; deals: number; revenue: number }>();
  const sources = new Map<string, { source: string; leads: number; won: number }>();
  for (const l of leads.data ?? []) {
    const s = sources.get(l.source) ?? { source: l.source, leads: 0, won: 0 };
    s.leads++; if (l.status === 'won') s.won++;
    sources.set(l.source, s);
  }
  for (const d of deals.data ?? []) {
    const name = (d.package as { name?: string } | null)?.name ?? 'Other';
    const t = pkgTotals.get(name) ?? { name, deals: 0, revenue: 0 };
    t.deals++; t.revenue += Number(d.contract_value);
    pkgTotals.set(name, t);
  }

  const daily = new Map<string, { day: string; calls: number; connected: number; talkMin: number; revenue: number; collections: number }>();
  for (const k of kpis.data ?? []) {
    const d = daily.get(k.day) ?? { day: k.day, calls: 0, connected: 0, talkMin: 0, revenue: 0, collections: 0 };
    d.calls += k.calls; d.connected += k.connected_calls; d.talkMin += Math.round(k.talk_time_sec / 60); d.revenue += Number(k.revenue); d.collections += Number(k.collections);
    daily.set(k.day, d);
  }

  return (
    <>
      <PageHeader title="Business analytics" description="Calls, revenue and leads — compare cities, compare with your own past, and see the funnel." />
      <FilterBar defaultRange="30d">
        <SelectFilter name="group" label="Lead view" options={[{ value: 'leads', label: 'Leads' }, { value: 'unique', label: 'Unique users' }]} allLabel="Leads" />
      </FilterBar>
      <AnalyticsView
        tab={sp.tab ?? 'leads'}
        funnel={[...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))}
        daily={[...daily.values()].sort((a, b) => a.day.localeCompare(b.day))}
        cities={[...cities.values()].sort((a, b) => b.revenue - a.revenue)}
        people={[...people.entries()].map(([id, p]) => ({ ...p, prevRevenue: prevByUser.get(id) ?? 0 })).sort((a, b) => b.revenue - a.revenue)}
        outcomes={[...outcomeTotals.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total)}
        packages={[...pkgTotals.values()].sort((a, b) => b.revenue - a.revenue)}
        sources={[...sources.values()].sort((a, b) => b.leads - a.leads)}
        heat={[...heat.entries()].map(([k, v]) => ({ city: k.split('|')[0]!, weekday: Number(k.split('|')[1]), value: v }))}
        uniqueUsers={sp.group === 'unique'}
      />
    </>
  );
}
