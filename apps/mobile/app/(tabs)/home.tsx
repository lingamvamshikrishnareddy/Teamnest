import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeIndianRupee, Bell, CalendarClock, Fingerprint, Handshake, Lightbulb, PackageOpen, Percent, PhoneCall, Route,
  Repeat, ScanLine, Sparkles, Star, TrendingDown, TrendingUp, Trophy, X,
} from 'lucide-react-native';
import { getMonthSummary, getTodayAttendance, getUnreadCount, qk } from '@teamnest/api-client';
import { formatDate, formatINR, formatNumber, formatPercent, formatTime, greetingKey, istMonthStart, type TranslationKey } from '@teamnest/ui';
import { Card } from '@/components/card';
import { KpiTile } from '@/components/kpi-tile';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const TABS: TranslationKey[] = [
  'home.monthSummary', 'home.followUps', 'home.callbacks', 'home.meetings', 'home.priorityLeads',
  'home.newBusiness', 'home.queues', 'home.outcomes', 'home.reports', 'home.closedDeals',
];

export default function Home() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [tab, setTab] = useState<TranslationKey>('home.monthSummary');
  const [offerVisible, setOfferVisible] = useState(true);
  const userId = context?.user.id ?? '';

  const summary = useQuery({
    queryKey: qk.kpis.month(userId, istMonthStart()),
    queryFn: () => getMonthSummary(supabase, userId),
    enabled: !!userId,
  });
  const attendance = useQuery({ queryKey: qk.attendance.today(userId), queryFn: () => getTodayAttendance(supabase, userId), enabled: !!userId });
  const unread = useQuery({ queryKey: qk.notifications.unread(userId), queryFn: () => getUnreadCount(supabase), enabled: !!userId });
  const rating = useQuery({
    queryKey: ['rating', userId],
    enabled: !!userId,
    queryFn: async () =>
      (await supabase.from('ratings').select('score').eq('subject_user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data?.score ?? null,
  });
  const today = useQuery({
    queryKey: ['today-agenda', userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const [fu, mt] = await Promise.all([
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending').lte('due_at', end.toISOString()),
        supabase.from('meetings').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'scheduled').gte('scheduled_at', start.toISOString()).lte('scheduled_at', end.toISOString()),
      ]);
      return { followUps: fu.count ?? 0, meetings: mt.count ?? 0 };
    },
  });

  const s = summary.data;
  const firstName = context?.user.full_name.split(' ')[0] ?? '';
  const up = (s?.revenueChangePct ?? 0) >= 0;
  const refreshing = summary.isRefetching || attendance.isRefetching;
  const refresh = () => Promise.all([summary.refetch(), attendance.refetch(), today.refetch(), unread.refetch()]);

  return (
    <View className="flex-1 bg-background">
      {/* Blue header */}
      <SafeAreaView edges={['top']} className="bg-header">
        <View className="flex-row items-center gap-3 px-4 pb-5 pt-2">
          <View className="flex-1">
            <Text weight="bold" className="text-xl text-on-header" numberOfLines={1}>{t(greetingKey(), { name: firstName })}</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Star size={14} color="#FDE68A" fill="#FDE68A" />
              <Text weight="semibold" className="text-sm text-on-header">{rating.data ? Number(rating.data).toFixed(1) : '—'}</Text>
              <Text className="text-sm text-on-header opacity-75">· {formatDate(new Date())}</Text>
            </View>
          </View>
          <Pressable className="size-11 items-center justify-center rounded-full bg-white/15" accessibilityRole="button" accessibilityLabel="Scan visiting card or QR" hitSlop={4}>
            <ScanLine size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable className="size-11 items-center justify-center rounded-full bg-white/15" accessibilityRole="button" accessibilityLabel={`Notifications, ${unread.data ?? 0} unread`} hitSlop={4}>
            <Bell size={20} color="#FFFFFF" />
            {!!unread.data && (
              <View className="absolute right-1.5 top-1.5 min-w-4 items-center rounded-full bg-highlight px-1">
                <Text weight="bold" className="text-[10px] text-on-highlight">{unread.data > 9 ? '9+' : unread.data}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerClassName="pb-28"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {/* Today strip */}
        <View className="-mt-1 flex-row gap-2 bg-header px-4 pb-4">
          {[
            { icon: Fingerprint, label: attendance.data?.punch_in_at ? t('home.punchedIn', { time: formatTime(attendance.data.punch_in_at) }) : t('home.notPunchedIn') },
            { icon: PhoneCall, label: `${formatNumber(today.data?.followUps ?? 0)} ${t('home.followUps')}` },
            { icon: CalendarClock, label: `${formatNumber(today.data?.meetings ?? 0)} ${t('home.meetings')}` },
          ].map(({ icon: I, label }) => (
            <View key={label} className="flex-1 flex-row items-center gap-1.5 rounded-sm bg-white/15 px-2.5 py-2">
              <I size={14} color="#FFFFFF" />
              <Text weight="medium" className="flex-1 text-xs text-on-header" numberOfLines={2}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Scrollable section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-3">
          {TABS.map((key) => {
            const active = key === tab;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                className={`min-h-10 justify-center rounded-full px-4 ${active ? 'bg-primary' : 'border border-border bg-surface'}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text weight="semibold" className={`text-sm ${active ? 'text-on-primary' : 'text-text-muted'}`}>{t(key)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab !== 'home.monthSummary' ? (
          <View className="mx-4 items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-10">
            <Text weight="semibold" className="text-base">{t(tab)}</Text>
            <Text className="mt-1 text-center text-sm text-text-muted">This list arrives in Phase 2 — the data is already flowing.</Text>
          </View>
        ) : (
          <View className="gap-4 px-4">
            {/* Revenue hero */}
            <Card>
              <Text className="text-sm text-text-muted">{t('kpi.revenue')} · {t('home.monthSummary')}</Text>
              <View className="mt-1 flex-row items-end gap-2">
                <Text weight="bold" className="text-3xl">{s ? formatINR(s.current.revenue) : '—'}</Text>
                {s?.revenueChangePct != null && (
                  <View className={`mb-1 flex-row items-center gap-1 rounded-full px-2 py-0.5 ${up ? 'bg-success-soft' : 'bg-danger-soft'}`}>
                    {up ? <TrendingUp size={12} color={colors.success} /> : <TrendingDown size={12} color={colors.danger} />}
                    <Text weight="semibold" className={`text-xs ${up ? 'text-success' : 'text-danger'}`}>{formatPercent(Math.abs(s.revenueChangePct))}</Text>
                  </View>
                )}
              </View>
              <Text className="mt-2 text-sm text-text-muted">{up ? t('home.motivation.up') : t('home.motivation.down')}</Text>
            </Card>

            {/* KPI grid */}
            <View className="gap-3">
              <View className="flex-row gap-3">
                <KpiTile label={t('kpi.dealsClosed')} value={formatNumber(s?.current.deals ?? 0)} tone="teal" icon={Handshake} change={pct(s?.current.deals, s?.previous.deals)} />
                <KpiTile label={t('kpi.collections')} value={formatINR(s?.current.collections ?? 0)} tone="orange" icon={BadgeIndianRupee} change={pct(s?.current.collections, s?.previous.collections)} />
              </View>
              <View className="flex-row gap-3">
                <KpiTile label={t('kpi.autopayDealPct')} value={formatPercent(s?.current.autopayDealPct ?? 0, 0)} tone="violet" icon={Repeat} />
                <KpiTile label={t('kpi.onlinePaymentPct')} value={formatPercent(s && s.current.deals ? (s.current.onlinePayments / s.current.deals) * 100 : 0, 0)} tone="sky" icon={Percent} />
              </View>
              <View className="flex-row gap-3">
                <KpiTile label={t('kpi.calls')} value={formatNumber(s?.current.calls ?? 0)} tone="blue" icon={PhoneCall} change={pct(s?.current.calls, s?.previous.calls)} />
                <KpiTile label={t('kpi.visits')} value={formatNumber(s?.current.visits ?? 0)} tone="green" icon={Route} change={pct(s?.current.visits, s?.previous.visits)} />
              </View>
            </View>

            {/* Shortcuts */}
            <View className="flex-row gap-3">
              {[
                { icon: Trophy, label: 'Incentives' },
                { icon: Lightbulb, label: 'Insights' },
                { icon: PackageOpen, label: 'Unsold Packages' },
              ].map(({ icon: I, label }) => (
                <Pressable key={label} className="min-h-tap flex-1 items-center gap-1.5 rounded-card bg-surface py-3" accessibilityRole="button">
                  <View className="size-10 items-center justify-center rounded-full bg-primary-soft"><I size={18} color={colors.primaryText} /></View>
                  <Text weight="medium" className="text-xs">{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Dismissible offer banner */}
            {offerVisible && (
              <View className="flex-row items-center gap-3 rounded-card bg-highlight-soft p-4">
                <Sparkles size={22} color={colors.highlightText} />
                <View className="flex-1">
                  <Text weight="semibold" className="text-sm text-highlight-text">Festive bonus week</Text>
                  <Text className="text-xs text-highlight-text">Extra ₹500 for every auto-pay deal closed this week.</Text>
                </View>
                <Pressable onPress={() => setOfferVisible(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss offer">
                  <X size={18} color={colors.highlightText} />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* AI helper (placeholder) */}
      <Pressable
        className="absolute bottom-5 right-4 size-14 items-center justify-center rounded-full bg-accent"
        accessibilityRole="button"
        accessibilityLabel="AI helper"
      >
        <Sparkles size={24} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

function pct(cur?: number, prev?: number) {
  if (cur == null || !prev) return null;
  return ((cur - prev) / prev) * 100;
}
