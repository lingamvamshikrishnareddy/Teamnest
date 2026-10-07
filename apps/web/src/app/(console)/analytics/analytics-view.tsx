'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatDate, formatINRCompact, formatNumber, formatPercent } from '@teamnest/ui';
import { BarsChart, TrendChart } from '@/components/charts/charts';
import { ChartCard } from '@/components/charts/chart-card';
import { useChartTheme } from '@/components/charts/use-chart-theme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface LeadFunnelDay { day: string; received: number; contacted: number; interested: number; meetings: number; won: number }

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Heatmap({ cells }: { cells: { city: string; weekday: number; value: number }[] }) {
  const t = useChartTheme();
  const cities = [...new Set(cells.map((c) => c.city))];
  const max = Math.max(1, ...cells.map((c) => c.value));
  // sequential: one hue, light → dark (opacity steps of the primary series colour)
  return (
    <div className="overflow-x-auto">
      <table className="text-xs" aria-label="Connected calls by city and weekday">
        <thead><tr><th />{WD.slice(1).concat(WD[0]!).map((d) => <th key={d} className="px-1 pb-1 font-medium text-text-muted">{d}</th>)}</tr></thead>
        <tbody>
          {cities.map((city) => (
            <tr key={city}>
              <th className="pr-2 text-right font-medium text-text-muted">{city}</th>
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                const v = cells.find((c) => c.city === city && c.weekday === wd)?.value ?? 0;
                return (
                  <td key={wd} className="p-0.5">
                    <div title={`${city} · ${WD[wd]}: ${v} connected calls`} className="flex size-11 items-center justify-center rounded-xs text-[11px] font-semibold tabular-nums"
                      style={{ background: t.series[0], opacity: v ? 0.15 + 0.85 * (v / max) : 0.06, color: v / max > 0.55 ? '#fff' : t.text }}>
                      {v || ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsView(props: {
  tab: string; funnel: LeadFunnelDay[]; daily: { day: string; calls: number; connected: number; talkMin: number; revenue: number; collections: number }[];
  cities: { city: string; revenue: number; deals: number; calls: number; connected: number }[]; people: { name: string; revenue: number; deals: number; calls: number; prevRevenue: number }[];
  outcomes: { label: string; total: number }[]; packages: { name: string; deals: number; revenue: number }[]; sources: { source: string; leads: number; won: number }[];
  heat: { city: string; weekday: number; value: number }[]; uniqueUsers: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const setTab = (tab: string) => { const n = new URLSearchParams(sp.toString()); n.set('tab', tab); router.replace(`${pathname}?${n}`, { scroll: false }); };
  const dfmt = (d: string) => formatDate(d).slice(0, 6);
  const funnelTotals = props.funnel.reduce((a, d) => ({ received: a.received + d.received, contacted: a.contacted + d.contacted, interested: a.interested + d.interested, meetings: a.meetings + d.meetings, won: a.won + d.won }), { received: 0, contacted: 0, interested: 0, meetings: 0, won: 0 });

  return (
    <Tabs value={props.tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="leads">Lead analytics</TabsTrigger>
        <TabsTrigger value="calls">Call analytics</TabsTrigger>
        <TabsTrigger value="revenue">Revenue analytics</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
      </TabsList>

      <TabsContent value="leads" className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-5">
          {([['Received', funnelTotals.received], ['Contacted', funnelTotals.contacted], ['Interested', funnelTotals.interested], ['Meetings', funnelTotals.meetings], ['Won', funnelTotals.won]] as const).map(([k, v], i, arr) => (
            <div key={k} className="rounded-card bg-surface p-4 shadow-card">
              <div className="text-xs text-text-muted">{k}</div>
              <div className="text-2xl font-bold tabular-nums">{formatNumber(v)}</div>
              {i > 0 && <div className="text-xs text-text-muted">{formatPercent(arr[i - 1]![1] ? (v / arr[i - 1]![1]) * 100 : 0, 0)} of previous</div>}
            </div>
          ))}
        </div>
        <ChartCard title={props.uniqueUsers ? 'Lead summary · unique businesses' : 'Lead summary'} description="Leads received each day and how far they progressed"
          table={{ columns: ['Day', 'Received', 'Contacted', 'Interested', 'Meetings', 'Won'], rows: props.funnel.map((d) => [formatDate(d.day), d.received, d.contacted, d.interested, d.meetings, d.won]) }}>
          <BarsChart data={props.funnel} x="day" series={[{ key: 'received', label: 'Received' }, { key: 'contacted', label: 'Contacted' }, { key: 'interested', label: 'Interested' }, { key: 'won', label: 'Won' }]} fmt={(v) => formatNumber(v)} />
        </ChartCard>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Lead sources (ROI)" description="Leads and conversions by source" table={{ columns: ['Source', 'Leads', 'Won', 'Win rate'], rows: props.sources.map((s) => [s.source, s.leads, s.won, formatPercent(s.leads ? (s.won / s.leads) * 100 : 0, 1)]) }}>
            <BarsChart data={props.sources} x="source" layout="vertical" series={[{ key: 'leads', label: 'Leads' }, { key: 'won', label: 'Won' }]} height={240} />
          </ChartCard>
          <ChartCard title="Outcomes" description="All recorded outcomes in the period" table={{ columns: ['Outcome', 'Count'], rows: props.outcomes.map((o) => [o.label, o.total]) }}>
            <BarsChart data={props.outcomes} x="label" layout="vertical" series={[{ key: 'total', label: 'Outcomes' }]} height={240} />
          </ChartCard>
        </div>
      </TabsContent>

      <TabsContent value="calls" className="space-y-6">
        <ChartCard title="Calls per day" table={{ columns: ['Day', 'Calls', 'Connected', 'Talk min'], rows: props.daily.map((d) => [formatDate(d.day), d.calls, d.connected, d.talkMin]) }}>
          <TrendChart data={props.daily} x="day" xFmt={dfmt} series={[{ key: 'calls', label: 'Dialled' }, { key: 'connected', label: 'Connected' }]} fmt={(v) => formatNumber(v)} />
        </ChartCard>
        <ChartCard title="Talk time (minutes)" table={{ columns: ['Day', 'Minutes'], rows: props.daily.map((d) => [formatDate(d.day), d.talkMin]) }}>
          <TrendChart data={props.daily} x="day" xFmt={dfmt} series={[{ key: 'talkMin', label: 'Talk time' }]} fmt={(v) => formatNumber(v)} area height={200} />
        </ChartCard>
        <ChartCard title="Connected calls heatmap" description="By city and weekday — darker means more conversations">
          <Heatmap cells={props.heat} />
        </ChartCard>
      </TabsContent>

      <TabsContent value="revenue" className="space-y-6">
        <ChartCard title="Revenue vs collections" table={{ columns: ['Day', 'Revenue', 'Collections'], rows: props.daily.map((d) => [formatDate(d.day), formatINRCompact(d.revenue), formatINRCompact(d.collections)]) }}>
          <TrendChart data={props.daily} x="day" xFmt={dfmt} series={[{ key: 'revenue', label: 'Revenue' }, { key: 'collections', label: 'Collections' }]} fmt={formatINRCompact} />
        </ChartCard>
        <ChartCard title="Packages sold" table={{ columns: ['Package', 'Deals', 'Revenue'], rows: props.packages.map((p) => [p.name, p.deals, formatINRCompact(p.revenue)]) }}>
          <BarsChart data={props.packages} x="name" series={[{ key: 'revenue', label: 'Revenue' }]} fmt={formatINRCompact} />
        </ChartCard>
      </TabsContent>

      <TabsContent value="insights" className="space-y-6">
        <ChartCard title="Compare cities" description="Revenue by city" table={{ columns: ['City', 'Revenue', 'Deals', 'Calls', 'Connect %'], rows: props.cities.map((c) => [c.city, formatINRCompact(c.revenue), c.deals, c.calls, formatPercent(c.calls ? (c.connected / c.calls) * 100 : 0, 0)]) }}>
          <BarsChart data={props.cities} x="city" series={[{ key: 'revenue', label: 'Revenue' }]} fmt={formatINRCompact} height={240} />
        </ChartCard>
        <ChartCard title="Compare with your own past" description="Each person: this period vs the previous period of equal length"
          table={{ columns: ['Person', 'This period', 'Previous', 'Change'], rows: props.people.map((p) => [p.name, formatINRCompact(p.revenue), formatINRCompact(p.prevRevenue), p.prevRevenue ? formatPercent(((p.revenue - p.prevRevenue) / p.prevRevenue) * 100, 0) : '—']) }}>
          <BarsChart data={props.people.slice(0, 12)} x="name" layout="vertical" series={[{ key: 'revenue', label: 'This period' }, { key: 'prevRevenue', label: 'Previous period' }]} fmt={formatINRCompact} height={Math.max(240, props.people.slice(0, 12).length * 36)} />
        </ChartCard>
      </TabsContent>
    </Tabs>
  );
}
