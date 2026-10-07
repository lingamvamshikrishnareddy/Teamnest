import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee, CalendarCheck, CheckCheck, FileText, FolderLock, IdCard, Inbox, Megaphone, Palmtree, Target, type LucideIcon } from 'lucide-react-native';
import { getApprovalsInbox } from '@teamnest/api-client';
import type { KpiTone } from '@teamnest/ui';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

type Tile = { label: string; icon: LucideIcon; tone: KpiTone; href: string; badge?: number };

export default function Work() {
  const { t } = useI18n();
  const { kpi } = useTheme();
  const { context } = useAuth();
  const isManager = context?.user.role === 'team_lead' || context?.user.role === 'area_manager';
  const inbox = useQuery({ queryKey: ['approvals', 'inbox'], queryFn: () => getApprovalsInbox(supabase), enabled: isManager });

  const tiles: Tile[] = [
    ...(isManager ? [{ label: 'Approvals', icon: CheckCheck, tone: 'orange' as const, href: '/approvals', badge: inbox.data?.length }] : []),
    { label: t('work.attendance'), icon: CalendarCheck, tone: 'teal', href: '/work/attendance' },
    { label: t('work.leave'), icon: Palmtree, tone: 'green', href: '/work/leave' },
    { label: t('work.payslips'), icon: FileText, tone: 'blue', href: '/work/payslips' },
    { label: t('work.documents'), icon: FolderLock, tone: 'violet', href: '/work/documents' },
    { label: t('work.goals'), icon: Target, tone: 'orange', href: '/work/goals' },
    { label: 'Incentives', icon: BadgeIndianRupee, tone: 'green', href: '/work/incentives' },
    { label: t('work.requests'), icon: Inbox, tone: 'sky', href: '/work/requests' },
    { label: t('work.policies'), icon: Megaphone, tone: 'pink', href: '/work/policies' },
    { label: 'My card', icon: IdCard, tone: 'blue', href: '/work/id-card' },
  ];

  return (
    <Screen>
      <Text weight="bold" className="text-2xl">{t('tabs.work')}</Text>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {tiles.map(({ label, icon: Icon, tone, href, badge }) => (
          <Pressable key={href} onPress={() => router.push(href as never)} className="min-h-[112px] w-[48.5%] justify-between rounded-card p-4 active:opacity-80" style={{ backgroundColor: kpi[tone].bg }} accessibilityRole="button" accessibilityLabel={`${label}${badge ? `, ${badge} pending` : ''}`}>
            <View className="flex-row items-start justify-between">
              <View className="size-10 items-center justify-center rounded-sm" style={{ backgroundColor: kpi[tone].icon }}><Icon size={20} color={kpi[tone].fg} /></View>
              {badge ? <View className="min-w-6 items-center rounded-full bg-highlight px-1.5 py-0.5"><Text weight="bold" className="text-xs text-on-highlight">{badge}</Text></View> : null}
            </View>
            <Text weight="semibold" className="text-base" style={{ color: kpi[tone].fg }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
