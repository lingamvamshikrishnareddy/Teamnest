import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { ApprovalsInbox } from './inbox';

export const metadata: Metadata = { title: 'Approvals' };

export default async function ApprovalsPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const [inbox, decided] = await Promise.all([
    supabase.from('my_approvals_inbox').select('*').order('created_at', { ascending: false }),
    supabase.from('approvals').select('id, type, title, amount, status, decided_at, requested_by, history').neq('status', 'pending').order('decided_at', { ascending: false }).limit(50),
  ]);
  return (
    <>
      <PageHeader title="Approvals" description="Leave, discounts, reimbursements, requests, punch corrections and incentives — one inbox." />
      <ApprovalsInbox pending={inbox.data ?? []} decided={decided.data ?? []} />
    </>
  );
}
