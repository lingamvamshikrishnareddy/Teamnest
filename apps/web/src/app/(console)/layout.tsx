import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireConsoleSession();
  const supabase = await getServerClient();
  const [regions, unread, cookieStore] = await Promise.all([
    supabase.from('territories').select('id, name').eq('kind', 'city').eq('is_active', true).order('name'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    cookies(),
  ]);

  return (
    <AppShell
      user={{
        name: session.user.full_name,
        email: session.user.email,
        role: session.user.role,
        avatarUrl: session.user.avatar_url,
        orgName: session.organization.name,
      }}
      regions={regions.data ?? []}
      currentRegion={cookieStore.get('tn_region')?.value || null}
      unread={unread.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
