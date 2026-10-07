import type { Metadata } from 'next';
import { formatDate } from '@teamnest/ui';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { monthFromParam } from '../month';
import { MonthPicker } from '../month-picker';
import { PayrollView } from './payroll-view';

export const metadata: Metadata = { title: 'Payroll inputs' };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requireConsoleSession();
  const m = monthFromParam((await searchParams).month);
  const supabase = await getServerClient();
  const [inputs, slips, lock] = await Promise.all([
    supabase.from('payroll_inputs').select('*').eq('period_month', m.start).order('full_name'),
    supabase.from('payslips').select('user_id, status, gross, net_pay, total_deductions').eq('period_month', m.start),
    supabase.from('attendance_locks').select('locked_at').eq('period_month', m.start).maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Payroll inputs" description={`${formatDate(m.start).slice(3)} · attendance days, approved incentives and reimbursements, ready to export or turn into payslips`} actions={<MonthPicker value={m.key} />} />
      <PayrollView month={m.start} inputs={inputs.data ?? []} slips={slips.data ?? []} locked={!!lock.data} canGenerate={session.user.role === 'hr_admin'} />
    </>
  );
}
