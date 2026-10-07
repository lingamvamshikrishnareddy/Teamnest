'use client';

import type { Tables } from '@teamnest/types';
import { formatDate, formatINR, formatINRCompact } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Row = Tables<'reimbursements'> & { name: string };

export function ReimbursementsView({ rows }: { rows: Row[] }) {
  const { run, busy } = useAction();
  const s = (st: string) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.amount), 0);
  return (
    <>
      <SummaryChips items={[
        { label: 'Pending', value: formatINRCompact(s('pending')), tone: 'highlight' }, { label: 'Approved', value: formatINRCompact(s('approved')), tone: 'success' },
        { label: 'Paid out', value: formatINRCompact(rows.filter((r) => r.paid_at).reduce((a, r) => a + Number(r.amount), 0)), tone: 'accent' },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.id} exportName="reimbursements" columns={[
        { key: 'name', header: 'Employee' }, { key: 'category', header: 'Category', value: (r) => r.category.replace('_', ' ') },
        { key: 'expense_date', header: 'Date', cell: (r) => formatDate(r.expense_date) },
        { key: 'amount', header: 'Amount', align: 'right', value: (r) => Number(r.amount), cell: (r) => formatINR(Number(r.amount)) },
        { key: 'distance_km', header: 'Km', align: 'right', value: (r) => (r.distance_km == null ? null : Number(r.distance_km)), hideOnMobile: true },
        { key: 'description', header: 'Details', hideOnMobile: true },
        { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : r.status === 'rejected' ? 'danger' : 'neutral'}>{r.paid_at ? 'paid' : r.status}</Badge> },
        { key: 'pay', header: '', sortable: false, cell: (r) => (r.status === 'approved' && !r.paid_at ? (
          <Button size="sm" variant="soft" disabled={busy === r.id} onClick={() => run(r.id, async () => { const { error } = await getBrowserClient().from('reimbursements').update({ paid_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; return true; }, 'Marked as paid')}>Mark paid</Button>
        ) : null) },
      ]} />
    </>
  );
}
