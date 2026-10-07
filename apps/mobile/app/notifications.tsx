import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, IndianRupee, Megaphone, Contact, Users } from 'lucide-react-native';
import { listNotifications, markAllRead } from '@teamnest/api-client';
import { formatRelative } from '@teamnest/ui';
import { Header } from '@/components/header';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/providers/theme';

const ICON = { payments: IndianRupee, leads: Contact, hr: Users, approvals: CheckCheck, system: Megaphone } as const;

/** Maps web-style deep links to app routes. */
function routeFor(data: unknown): string | null {
  const r = (data as { route?: string } | null)?.route;
  if (!r) return null;
  if (r.startsWith('/approvals')) return '/approvals';
  if (r.startsWith('/work/')) return r;
  if (r.startsWith('/deals/')) return `/deal/${r.split('/')[2]}`;
  if (r.startsWith('/leads')) return r.replace('/leads', '/leads');
  if (r.startsWith('/home')) return '/home';
  return null;
}

export default function Notifications() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => listNotifications(supabase, 50) });
  const readAll = useMutation({ mutationFn: () => markAllRead(supabase), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;

  const open = async (id: string, data: unknown, wasRead: boolean) => {
    if (!wasRead) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    const to = routeFor(data);
    if (to) router.push(to as never);
  };

  return (
    <View className="flex-1 bg-background">
      <Header
        title="Notifications"
        right={unread ? <Pressable onPress={() => readAll.mutate()} className="px-3 py-2" accessibilityRole="button"><Text weight="semibold" className="text-sm text-on-header">Mark all read</Text></Pressable> : undefined}
      />
      {q.isLoading ? <Loading /> : (
        <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
          {!q.data?.length ? <EmptyState icon={BellOff} title="No notifications" /> : null}
          {(q.data ?? []).map((n) => {
            const Icon = ICON[n.category as keyof typeof ICON] ?? Bell;
            return (
              <Pressable key={n.id} onPress={() => open(n.id, n.data, !!n.read_at)} className={`min-h-tap flex-row gap-3 border-b border-border px-4 py-3 ${n.read_at ? 'bg-background' : 'bg-surface'}`} accessibilityRole="button">
                <View className="size-10 items-center justify-center rounded-full bg-primary-soft"><Icon size={18} color={colors.primaryText} /></View>
                <View className="flex-1">
                  <Text weight={n.read_at ? 'regular' : 'semibold'}>{n.title}</Text>
                  {n.body ? <Text className="text-sm text-text-muted" numberOfLines={2}>{n.body}</Text> : null}
                  <Text className="mt-0.5 text-xs text-text-subtle">{formatRelative(n.created_at)}</Text>
                </View>
                {!n.read_at ? <View className="mt-2 size-2.5 rounded-full bg-highlight" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
