'use client';

import { FileCheck2, Send } from 'lucide-react';
import type { Views } from '@teamnest/types';
import { formatINR, formatINRCompact } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Slip = { user_id: string; status: string; gross: number; net_pay: number | null; total_deductions: number };

export function PayrollView({ month, inputs, slips, locked, canGenerate }: { month: string; inputs: Views<'payroll_inputs'>[]; slips: Slip[]; locked: boolean; canGenerate: boolean }) {
  const { run, busy } = useAction();
  const slipBy = new Map(slips.map((s) => [s.user_id, s]));
  const published = slips.filter((s) => s.status === 'published').length;
  const gen = (publish: boolean) => run(publish ? 'pub' : 'gen', async () => {
    const { data, error } = await getBrowserClient().rpc('generate_payslips', { p_month: month, p_publish: publish });
    if (error) throw error;
    return Number(data);
  }, (n) => (publish ? `${n} payslips published — employees notified` : `${n} draft payslips generated`));

  return (
    <>
      <SummaryChips items={[
        { label: 'Employees', value: String(inputs.length), tone: 'primary' },
        { label: 'Incentives', value: formatINRCompact(inputs.reduce((a, i) => a + Number(i.incentives ?? 0), 0)), tone: 'success' },
        { label: 'Reimbursements', value: formatINRCompact(inputs.reduce((a, i) => a + Number(i.reimbursements ?? 0), 0)), tone: 'accent' },
        { label: 'Payslips', value: `${slips.length} (${published} published)` },
        { label: 'Attendance', value: locked ? 'Locked' : 'Open', tone: locked ? 'success' : 'highlight' },
      ]} />
      {canGenerate && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {!locked && <span className="text-sm text-warning">Lock attendance for this month before publishing.</span>}
          <Button variant="outline" disabled={busy !== null} onClick={() => gen(false)}><FileCheck2 /> Generate drafts</Button>
          <Button disabled={busy !== null || !locked} onClick={() => confirm('Publish payslips? Employees will be notified and drafts become final.') && gen(true)}><Send /> Publish</Button>
        </div>
      )}
      <DataTable rows={inputs} rowKey={(r) => r.user_id!} exportName={`payroll-inputs-${month.slice(0, 7)}`} pageSize={50} columns={[
        { key: 'employee_code', header: 'Code' }, { key: 'full_name', header: 'Name' }, { key: 'department', header: 'Dept', hideOnMobile: true },
        { key: 'paid_days', header: 'Paid days', align: 'right', value: (r) => Number(r.paid_days ?? 0) },
        { key: 'absent_days', header: 'LOP', align: 'right', value: (r) => Number(r.absent_days ?? 0) },
        { key: 'late_marks', header: 'Late', align: 'right', value: (r) => Number(r.late_marks ?? 0) },
        { key: 'incentives', header: 'Incentives', align: 'right', value: (r) => Number(r.incentives ?? 0), cell: (r) => formatINR(Number(r.incentives ?? 0)) },
        { key: 'reimbursements', header: 'Reimburse', align: 'right', value: (r) => Number(r.reimbursements ?? 0), cell: (r) => formatINR(Number(r.reimbursements ?? 0)) },
        { key: 'net', header: 'Net pay', align: 'right', value: (r) => slipBy.get(r.user_id!)?.net_pay ?? null, cell: (r) => { const s = slipBy.get(r.user_id!); return s ? formatINR(Number(s.net_pay)) : '—'; } },
        { key: 'slip', header: 'Payslip', value: (r) => slipBy.get(r.user_id!)?.status ?? 'none', cell: (r) => { const s = slipBy.get(r.user_id!); return s ? <Badge tone={s.status === 'published' ? 'success' : 'warning'}>{s.status}</Badge> : <Badge>none</Badge>; } },
      ]} />
    </>
  );
}
