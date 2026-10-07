import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { Helpdesk } from './helpdesk';

export const metadata: Metadata = { title: 'Requests' };

export default async function RequestsPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const { data } = await supabase.from('requests').select('*, user:users!requests_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(1000);
  return (
    <>
      <PageHeader title="Requests & grievances" description="Access, travel, business cards, exits, retention, profile changes and grievances (anonymous ones show no name)." />
      <Helpdesk rows={(data ?? []).map((r) => ({ ...r, requester: r.is_anonymous ? 'Anonymous' : (r.user as { full_name?: string } | null)?.full_name ?? '' }))} />
    </>
  );
}
