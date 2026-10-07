import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { monthFromParam } from '../../hr/month';
import { MonthPicker } from '../../hr/month-picker';
import { PayoutsView } from './payouts-view';

export const metadata: Metadata = { title: 'Incentive payouts' };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireConsoleSession();
  const m = monthFromParam((await searchParams).month);
  const supabase = await getServerClient();
  const [{ data }, slabs] = await Promise.all([
    supabase.from('incentives').select('id, user_id, basis, base_amount, rate_pct, amount, status, deal:deals(deal_no), user:users!incentives_user_id_fkey(full_name)').eq('period_month', m.start),
    supabase.from('app_settings').select('value').eq('key', 'incentive_slabs').maybeSingle(),
  ]);
  return (
    <>
      <PageHeader title="Incentive payouts" description="Calculated from deals with marginal revenue slabs + auto-pay bonus. Approved incentives flow into payroll and the payslip." actions={<MonthPicker value={m.key} />} />
      <PayoutsView month={m.start} slabs={(slabs.data?.value as { from: number; to: number | null; pct: number }[]) ?? []}
        rows={(data ?? []).map((i) => ({ id: i.id, userId: i.user_id, name: (i.user as { full_name?: string } | null)?.full_name ?? '', deal: (i.deal as { deal_no?: string } | null)?.deal_no ?? '', basis: i.basis, base: Number(i.base_amount), rate: i.rate_pct == null ? null : Number(i.rate_pct), amount: Number(i.amount), status: i.status }))} />
    </>
  );
}
