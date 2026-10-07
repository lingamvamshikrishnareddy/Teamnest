'use client';

import type { Views } from '@teamnest/types';
import { formatDate, formatINR } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';

export function MandatesView({ rows }: { rows: Views<'report_mandates'>[] }) {
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <>
      <SummaryChips items={[
        { label: 'Active', value: String(c('active')), tone: 'success' }, { label: 'Awaiting bank', value: String(c('pending_bank') + c('initiated')), tone: 'highlight' },
        { label: 'Rejected', value: String(c('rejected')), tone: 'danger' }, { label: 'Bounced (≥1)', value: String(rows.filter((r) => (r.bounce_count ?? 0) > 0).length), tone: 'danger' },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.id!} exportName="mandates" columns={[
        { key: 'deal_no', header: 'Deal' }, { key: 'business_name', header: 'Customer' }, { key: 'owner_name', header: 'Executive', hideOnMobile: true },
        { key: 'umrn', header: 'UMRN', hideOnMobile: true },
        { key: 'max_amount', header: 'Max', align: 'right', value: (r) => Number(r.max_amount), cell: (r) => formatINR(Number(r.max_amount)) },
        { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'active' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status?.replace('_', ' ')}</Badge> },
        { key: 'bounce_count', header: 'Bounces', align: 'right', cell: (r) => ((r.bounce_count ?? 0) > 0 ? <Badge tone="danger">{r.bounce_count}</Badge> : '0') },
        { key: 'last_bounce_at', header: 'Last bounce', cell: (r) => (r.last_bounce_at ? formatDate(r.last_bounce_at) : '—'), hideOnMobile: true },
        { key: 'rejection_reason', header: 'Reason', hideOnMobile: true },
      ]} />
    </>
  );
}
