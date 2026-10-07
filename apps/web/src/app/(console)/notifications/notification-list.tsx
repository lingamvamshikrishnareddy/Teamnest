'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { markAllRead } from '@teamnest/api-client';
import type { Tables } from '@teamnest/types';
import { formatRelative } from '@teamnest/ui';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';

export function NotificationList({ rows }: { rows: Tables<'notifications'>[] }) {
  const router = useRouter();
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const open = async (n: Tables<'notifications'>) => {
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    const route = (n.data as { route?: string } | null)?.route;
    router.push(route?.startsWith('/deals/') ? '/finance/payments' : route?.startsWith('/work/') || route?.startsWith('/home') ? '/dashboard' : route ?? '/dashboard');
    router.refresh();
  };
  if (!rows.length) return <EmptyState icon={Bell} title="No notifications yet" />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="outline" size="sm" disabled={busy === 'all' || rows.every((r) => r.read_at)} onClick={() => run('all', () => markAllRead(supabase).then(() => true), 'All marked as read')}><CheckCheck /> Mark all read</Button></div>
      <Card className="divide-y divide-border">
        {rows.map((n) => (
          <button key={n.id} type="button" onClick={() => open(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-muted/50', !n.read_at && 'bg-primary-soft/30')}>
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-highlight')} aria-hidden />
            <span className="flex-1"><span className={cn('block text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>{n.body && <span className="block text-sm text-text-muted">{n.body}</span>}</span>
            <span className="whitespace-nowrap text-xs text-text-muted">{formatRelative(n.created_at)}</span>
          </button>
        ))}
      </Card>
    </>
  );
}
