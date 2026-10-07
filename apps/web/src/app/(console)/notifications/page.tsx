import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { NotificationList } from './notification-list';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList rows={data ?? []} />
    </>
  );
}
