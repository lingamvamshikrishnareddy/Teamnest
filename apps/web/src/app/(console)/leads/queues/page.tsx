import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { QueuesManager } from './queues-manager';

export const metadata: Metadata = { title: 'Lead queues' };

export default async function QueuesPage() {
  const session = await requireConsoleSession();
  const supabase = await getServerClient();
  const [queues, counts] = await Promise.all([
    supabase.from('lead_queues').select('*').order('priority'),
    supabase.rpc('queue_counts'),
  ]);
  return (
    <>
      <PageHeader title="Lead queues" description="Queues are rules, not code. Leads join a queue whenever they match its rules." />
      <QueuesManager queues={queues.data ?? []} counts={counts.data ?? []} canEdit={session.user.role === 'super_admin'} />
    </>
  );
}
