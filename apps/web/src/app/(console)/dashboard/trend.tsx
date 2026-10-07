'use client';

import { formatDate, formatINRCompact } from '@teamnest/ui';
import { ChartCard } from '@/components/charts/chart-card';
import { TrendChart } from '@/components/charts/charts';

export function RevenueTrend({ data }: { data: { day: string; revenue: number; collections: number }[] }) {
  return (
    <ChartCard
      title="Revenue & collections"
      description="Daily, in the selected period"
      table={{ columns: ['Day', 'Revenue', 'Collections'], rows: data.map((d) => [formatDate(d.day), formatINRCompact(d.revenue), formatINRCompact(d.collections)]) }}
    >
      <TrendChart data={data} x="day" series={[{ key: 'revenue', label: 'Revenue' }, { key: 'collections', label: 'Collections' }]} fmt={formatINRCompact} xFmt={(d) => formatDate(d).slice(0, 6)} area />
    </ChartCard>
  );
}

export function AttendanceTrend({ data }: { data: { day: string; present: number; absent: number; leave: number }[] }) {
  return (
    <ChartCard
      title="Attendance"
      description="People per day"
      table={{ columns: ['Day', 'Present', 'On leave', 'Absent'], rows: data.map((d) => [formatDate(d.day), d.present, d.leave, d.absent]) }}
    >
      <TrendChart data={data} x="day" series={[{ key: 'present', label: 'Present' }, { key: 'leave', label: 'On leave' }, { key: 'absent', label: 'Absent' }]} xFmt={(d) => formatDate(d).slice(0, 6)} />
    </ChartCard>
  );
}
