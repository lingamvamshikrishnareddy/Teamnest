import type { Metadata } from 'next';
import { SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { ReimbursementsView } from './reimbursements-view';

export const metadata: Metadata = { title: 'Reimbursements' };

export default async function ReimbursementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const supabase = await getServerClient();
  let q = supabase.from('reimbursements').select('*, user:users!reimbursements_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(2000);
  if (sp.status) q = q.eq('status', sp.status as 'pending');
  const { data } = await q;
  return (
    <>
      <PageHeader title="Reimbursements" description="Fuel, travel and expense claims. Approvals happen in the inbox; approved claims are added to payroll." />
      <div className="mb-4"><SelectFilter name="status" label="Status" options={['pending', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: s }))} /></div>
      <ReimbursementsView rows={(data ?? []).map((r) => ({ ...r, name: (r.user as { full_name?: string } | null)?.full_name ?? '' }))} />
    </>
  );
}
