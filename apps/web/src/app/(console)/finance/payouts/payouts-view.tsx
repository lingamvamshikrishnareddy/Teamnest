'use client';

import Link from 'next/link';
import { Calculator, Send } from 'lucide-react';
import { formatINR, formatINRCompact } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Row = { id: string; userId: string; name: string; deal: string; basis: string; base: number; rate: number | null; amount: number; status: string };

export function PayoutsView({ month, rows, slabs }: { month: string; rows: Row[]; slabs: { from: number; to: number | null; pct: number }[] }) {
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const people = [...new Map(rows.map((r) => [r.userId, r.name])).entries()].map(([id, name]) => {
    const own = rows.filter((r) => r.userId === id);
    const st = (s: string) => own.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0);
    return { id, name, rows: own, deals: own.filter((r) => r.basis === 'deal_slab').length, revenue: own.filter((r) => r.basis === 'deal_slab').reduce((a, r) => a + r.base, 0), total: own.reduce((a, r) => a + r.amount, 0), calculated: st('calculated'), pending: st('pending_approval'), approved: st('approved') + st('paid') };
  }).sort((a, b) => b.total - a.total);
  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <SummaryChips items={[
        { label: 'Total', value: formatINRCompact(rows.reduce((a, r) => a + r.amount, 0)), tone: 'primary' },
        { label: 'Calculated', value: formatINRCompact(sum('calculated')) }, { label: 'Awaiting approval', value: formatINRCompact(sum('pending_approval')), tone: 'highlight' },
        { label: 'Approved', value: formatINRCompact(sum('approved')), tone: 'success' }, { label: 'Paid', value: formatINRCompact(sum('paid')), tone: 'accent' },
      ]} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">Slabs: {slabs.map((s) => `${formatINRCompact(s.from)}–${s.to ? formatINRCompact(s.to) : '∞'} @ ${s.pct}%`).join(' · ')}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => run('calc', async () => { const { data, error } = await supabase.rpc('calculate_incentives', { p_month: month }); if (error) throw error; return data?.length ?? 0; }, (n) => `Calculated incentives for ${n} people`)}><Calculator /> Calculate</Button>
          <Button disabled={busy !== null || !sum('calculated')} onClick={() => run('sub', async () => { const { data, error } = await supabase.rpc('submit_incentives', { p_month: month }); if (error) throw error; return Number(data); }, (n) => `${n} incentives sent for approval`)}><Send /> Submit for approval</Button>
          {sum('pending_approval') > 0 && <Button asChild variant="soft"><Link href="/approvals">Review approvals</Link></Button>}
        </div>
      </div>
      <DataTable rows={people} rowKey={(p) => p.id} exportName={`incentives-${month.slice(0, 7)}`}
        expand={(p) => (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-muted"><tr className="text-left"><th className="py-1">Deal</th><th>Basis</th><th className="text-right">Base</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>{p.rows.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1">{r.deal || '—'}</td><td>{r.basis.replace('_', ' ')}</td><td className="text-right tabular-nums">{formatINR(r.base)}</td><td className="text-right">{r.rate == null ? '—' : `${r.rate}%`}</td><td className="text-right font-semibold tabular-nums">{formatINR(r.amount)}</td><td><Badge tone={r.status === 'approved' || r.status === 'paid' ? 'success' : r.status === 'pending_approval' ? 'warning' : 'neutral'}>{r.status.replace('_', ' ')}</Badge></td></tr>)}</tbody>
          </table>
        )}
        columns={[
          { key: 'name', header: 'Employee' }, { key: 'deals', header: 'Deals', align: 'right' },
          { key: 'revenue', header: 'Revenue', align: 'right', cell: (p) => formatINR(p.revenue) },
          { key: 'total', header: 'Incentive', align: 'right', cell: (p) => <strong>{formatINR(p.total)}</strong> },
          { key: 'pending', header: 'Awaiting', align: 'right', cell: (p) => (p.pending ? formatINR(p.pending) : '—') },
          { key: 'approved', header: 'Approved / paid', align: 'right', cell: (p) => (p.approved ? formatINR(p.approved) : '—') },
        ]} />
    </>
  );
}
