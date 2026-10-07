'use client';

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts';
import { Legend } from './chart-card';
import { useChartTheme } from './use-chart-theme';

export interface Series {
  key: string;
  label: string;
}

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, label, fmt, labelFmt }: TooltipProps<number, string> & { fmt: Fmt; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-xs shadow-raised">
      <div className="mb-1 font-semibold text-text">{labelFmt ? labelFmt(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-text-muted">
          <span className="size-2 rounded-[2px]" style={{ background: p.color }} aria-hidden />
          <span className="flex-1">{p.name}</span>
          <span className="font-semibold tabular-nums text-text">{fmt(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (color: string) => ({ tick: { fill: color, fontSize: 11 }, tickLine: false, axisLine: false });

/** Change over time. One y-axis; crosshair tooltip; 2px lines. */
export function TrendChart({ data, x, series, fmt = String, xFmt, height = 260, area = false }: { data: object[]; x: string; series: Series[]; fmt?: Fmt; xFmt?: (v: string) => string; height?: number; area?: boolean }) {
  const t = useChartTheme();
  const colors = series.map((_, i) => t.series[i] ?? t.other);
  const Chart = area ? AreaChart : LineChart;
  return (
    <div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i]! }))} />
      <div style={{ height }} role="img" aria-label={`Trend of ${series.map((s) => s.label).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="0" />
            <XAxis dataKey={x} {...axisProps(t.axis)} tickFormatter={xFmt} minTickGap={24} />
            <YAxis {...axisProps(t.axis)} tickFormatter={fmt} width={64} />
            <Tooltip content={<ChartTooltip fmt={fmt} labelFmt={xFmt} />} cursor={{ stroke: t.axis, strokeWidth: 1 }} />
            {series.map((s, i) =>
              area ? (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} fill={colors[i]} fillOpacity={0.12} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} />
              ) : (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Magnitude comparison. Grouped (or stacked) bars with 4px rounded data-ends. */
export function BarsChart({ data, x, series, fmt = String, height = 280, stacked = false, layout = 'horizontal' }: { data: object[]; x: string; series: Series[]; fmt?: Fmt; height?: number; stacked?: boolean; layout?: 'horizontal' | 'vertical' }) {
  const t = useChartTheme();
  const colors = series.map((_, i) => t.series[i] ?? t.other);
  const vertical = layout === 'vertical';
  return (
    <div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i]! }))} />
      <div style={{ height }} role="img" aria-label={`Bar chart of ${series.map((s) => s.label).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, bottom: 0, left: vertical ? 8 : 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={vertical} horizontal={!vertical} stroke={t.grid} />
            {vertical ? (
              <>
                <XAxis type="number" {...axisProps(t.axis)} tickFormatter={fmt} />
                <YAxis type="category" dataKey={x} {...axisProps(t.axis)} width={120} />
              </>
            ) : (
              <>
                <XAxis dataKey={x} {...axisProps(t.axis)} interval={0} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 60 : 30} />
                <YAxis {...axisProps(t.axis)} tickFormatter={fmt} width={64} />
              </>
            )}
            <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: t.grid, opacity: 0.4 }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} stackId={stacked ? 'a' : undefined}
                stroke={stacked ? t.surface : undefined} strokeWidth={stacked ? 2 : 0}
                radius={stacked ? (i === series.length - 1 ? (vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
