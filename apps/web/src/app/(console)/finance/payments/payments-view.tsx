'use client';

import type { Views } from '@teamnest/types';
import { formatDateTime, formatINR, formatINRCompact, formatRelative } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Ev = { id: string; provider: string; event_type: string; status: string; received_at: string; error: string | null };
const tone = (s: string) => (s === 'success' || s === 'processed' ? 'success' : s === 'failed' ? 'danger' : s === 'pending' || s === 'initiated' ? 'warning' : 'neutral');

export function PaymentsView({ rows, events }: { rows: Views<'report_payments'>[]; events: Ev[] }) {
  const ok = rows.filter((r) => r.status === 'success');
  return (
    <>
      <SummaryChips items={[
        { label: 'Collected', value: formatINRCompact(ok.reduce((a, r) => a + Number(r.amount), 0)), tone: 'success' },
        { label: 'Payments', value: String(rows.length), tone: 'primary' },
        { label: 'Failed', value: String(rows.filter((r) => r.status === 'failed').length), tone: 'danger' },
        { label: 'Pending', value: String(rows.filter((r) => r.status === 'pending' || r.status === 'initiated').length), tone: 'highlight' },
        { label: 'Cash', value: formatINRCompact(ok.filter((r) => r.method === 'cash').reduce((a, r) => a + Number(r.amount), 0)) },
      ]} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DataTable rows={rows} rowKey={(r) => r.id!} exportName="payments" pageSize={50} columns={[
            { key: 'created_at', header: 'Date', value: (r) => r.created_at, cell: (r) => formatDateTime(r.paid_at ?? r.created_at!) },
            { key: 'business_name', header: 'Customer' }, { key: 'deal_no', header: 'Deal', hideOnMobile: true },
            { key: 'owner_name', header: 'Executive', hideOnMobile: true },
            { key: 'amount', header: 'Amount', align: 'right', value: (r) => Number(r.amount), cell: (r) => formatINR(Number(r.amount), { decimals: 2 }) },
            { key: 'method', header: 'Method' },
            { key: 'status', header: 'Status', cell: (r) => <Badge tone={tone(r.status!)}>{r.status}</Badge> },
            { key: 'receipt_no', header: 'Receipt', hideOnMobile: true },
            { key: 'failure_reason', header: 'Failure', hideOnMobile: true },
          ]} />
        </div>
        <Card>
          <CardHeader><CardTitle>Gateway events</CardTitle></CardHeader>
          <CardContent className="max-h-[640px] space-y-2 overflow-y-auto text-sm">
            {events.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-2 border-b border-border pb-2">
                <div><code className="text-xs">{e.event_type}</code><div className="text-xs text-text-muted">{e.provider} · {formatRelative(e.received_at)}</div>{e.error && <div className="text-xs text-danger">{e.error}</div>}</div>
                <Badge tone={tone(e.status)}>{e.status}</Badge>
              </div>
            ))}
            {!events.length && <p className="text-text-muted">No webhook events yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
