import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { PoliciesAdmin } from './policies-admin';

export const metadata: Metadata = { title: 'Policies & news' };

export default async function PoliciesPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const [policies, acks, people] = await Promise.all([
    supabase.from('policies').select('*').order('published_at', { ascending: false, nullsFirst: true }),
    supabase.from('policy_acknowledgements').select('policy_id, policy_version, user_id'),
    supabase.from('users').select('id, full_name').neq('status', 'inactive').order('full_name'),
  ]);
  return (
    <>
      <PageHeader title="Policies & announcements" description="Publish policies, updates, events and internal job postings. Track who has read and acknowledged them." />
      <PoliciesAdmin policies={policies.data ?? []} acks={acks.data ?? []} people={people.data ?? []} />
    </>
  );
}
