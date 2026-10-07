import { Linking, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Contact, Handshake, Inbox, ListFilter, Phone, PlayCircle, Target, Trophy } from 'lucide-react-native';
import { getMyTargets, getQueueCounts, listLeads, listMyAgenda, listMyDeals, qk } from '@teamnest/api-client';
import { formatDuration, formatINR, formatINRCompact, formatNumber, formatPercent, formatRelative, formatTime, isSameIstDay, istMonthStart, toIstDateString, type TranslationKey } from '@teamnest/ui';
import { supabase } from '@/lib/supabase';
import { useCall } from '@/providers/call';
import { useTheme } from '@/providers/theme';
import { Badge } from './badge';
import { Card } from './card';
import { EmptyState, Loading } from './states';
import { Text } from './text';

interface Props { userId: string }

function Row({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} className="min-h-tap flex-row items-center gap-3 border-b border-border bg-surface px-4 py-3" accessibilityRole="button">
      <View className="flex-1">
        <Text weight="semibold" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text className="text-xs text-text-muted" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? <ChevronRight size={18} color={colors.textSubtle} />}
    </Pressable>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <View className="mx-4 overflow-hidden rounded-card">{children}</View>;
}

type AgendaRow = { id: string; due_at?: string; scheduled_at?: string; note?: string | null; agenda?: string | null; lead: { id: string; business_name: string; phone: string; locality: string | null } | null };

function Agenda({ userId, kind }: Props & { kind: 'follow_ups' | 'callbacks' | 'meetings' }) {
  const { call } = useCall();
  const { colors } = useTheme();
  const today = toIstDateString();
  const q = useQuery({
    queryKey: ['agenda', kind, userId, today],
    queryFn: () => listMyAgenda(supabase, userId, kind, { from: `${today}T00:00:00+05:30`, to: `${today}T23:59:59+05:30` }),
  });
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []) as unknown as AgendaRow[];
  if (!rows.length) return <EmptyState icon={CalendarClock} title={kind === 'meetings' ? 'No meetings today' : 'Nothing due today'} body="New tasks appear here when you schedule them after a call." />;
  return (
    <List>
      {rows.map((r) => {
        const at = r.due_at ?? r.scheduled_at!;
        const overdue = new Date(at) < new Date() && !isSameIstDay(at, new Date());
        return (
          <Row
            key={r.id}
            title={r.lead?.business_name ?? 'Lead'}
            subtitle={`${overdue ? `Overdue · ${formatRelative(at)}` : formatTime(at)}${r.note || r.agenda ? ` · ${r.note ?? r.agenda}` : ''}`}
            onPress={() => r.lead && router.push(`/lead/${r.lead.id}`)}
            right={r.lead ? (
              <Pressable onPress={() => call({ id: r.lead!.id, business_name: r.lead!.business_name, phone: r.lead!.phone })} className="size-11 items-center justify-center rounded-full bg-primary" accessibilityLabel={`Call ${r.lead.business_name}`} accessibilityRole="button">
                <Phone size={18} color={colors.onPrimary} />
              </Pressable>
            ) : undefined}
          />
        );
      })}
    </List>
  );
}

function LeadsList({ userId, sort }: Props & { sort: 'priority' | 'recent' }) {
  const q = useQuery({ queryKey: ['leads', 'home', sort, userId], queryFn: () => listLeads(supabase, { ownerId: userId, chip: 'all', sort, pageSize: 15 }) });
  if (q.isLoading) return <Loading />;
  if (!q.data?.rows.length) return <EmptyState icon={Contact} title="No leads yet" />;
  return (
    <List>
      {q.data.rows.map((l) => (
        <Row key={l.id} title={l.business_name} subtitle={`${l.locality ?? l.city ?? ''} · score ${l.priority_score}${l.next_follow_up_at ? ` · due ${formatRelative(l.next_follow_up_at)}` : ''}`} onPress={() => router.push(`/lead/${l.id}`)} />
      ))}
    </List>
  );
}

function Queues() {
  const q = useQuery({ queryKey: ['queue-counts'], queryFn: () => getQueueCounts(supabase) });
  if (q.isLoading) return <Loading />;
  return (
    <List>
      {(q.data ?? []).filter((x) => Number(x.total) > 0).map((x) => (
        <Row key={x.queue_id} title={x.name} subtitle={`${formatNumber(Number(x.total))} leads`} onPress={() => router.push('/leads?chip=all')}
          right={<Badge label={formatNumber(Number(x.total))} tone="primary" />} />
      ))}
      {!q.data?.some((x) => Number(x.total) > 0) ? <EmptyState icon={ListFilter} title="No leads in your queues" /> : null}
    </List>
  );
}

function Outcomes({ userId }: Props) {
  const { colors } = useTheme();
  const q = useQuery({
    queryKey: ['my-outcomes', userId, istMonthStart()],
    queryFn: async () => (await supabase.from('report_outcomes').select('label, total').eq('user_id', userId).gte('day', istMonthStart())).data ?? [],
  });
  if (q.isLoading) return <Loading />;
  const totals = new Map<string, number>();
  for (const r of q.data ?? []) totals.set(r.label ?? '', (totals.get(r.label ?? '') ?? 0) + Number(r.total));
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <EmptyState icon={Inbox} title="No outcomes this month yet" />;
  return (
    <Card className="mx-4 gap-3">
      <Text weight="semibold">This month</Text>
      {rows.map(([label, n]) => (
        <View key={label} accessible accessibilityLabel={`${label}: ${n}`}>
          <View className="flex-row justify-between"><Text className="text-sm">{label}</Text><Text weight="semibold" className="text-sm">{n}</Text></View>
          <View className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"><View className="h-2 rounded-full" style={{ width: `${(n / max) * 100}%`, backgroundColor: colors.primary }} /></View>
        </View>
      ))}
    </Card>
  );
}

const METRIC_LABEL: Record<string, string> = { revenue: 'Revenue', deals: 'Deals', collections: 'Collections', autopay_pct: 'Auto-pay %', talk_time_min: 'Talk time (min)', visits: 'Visits', calls: 'Calls', meetings: 'Meetings' };

function Reports({ userId }: Props) {
  const { colors } = useTheme();
  const month = istMonthStart();
  const targets = useQuery({ queryKey: ['targets', userId, month], queryFn: () => getMyTargets(supabase, userId, month) });
  const kpis = useQuery({
    queryKey: ['kpis', 'report', userId, month],
    queryFn: async () => (await supabase.from('report_sales_by_user').select('*').eq('user_id', userId).eq('period_month', month).maybeSingle()).data,
  });
  if (targets.isLoading || kpis.isLoading) return <Loading />;
  const k = kpis.data;
  const actual = (m: string) => {
    if (!k) return 0;
    switch (m) {
      case 'revenue': return Number(k.revenue);
      case 'deals': return Number(k.deals);
      case 'collections': return Number(k.collections);
      case 'talk_time_min': return Math.round(Number(k.talk_time_sec) / 60);
      case 'visits': return Number(k.visits);
      case 'autopay_pct': return Number(k.deals) ? (Number(k.autopay_deals) / Number(k.deals)) * 100 : 0;
      default: return 0;
    }
  };
  const fmt = (m: string, v: number) => (m === 'revenue' || m === 'collections' ? formatINRCompact(v) : m === 'autopay_pct' ? formatPercent(v, 0) : formatNumber(v));
  return (
    <View className="gap-3 px-4">
      <Card className="flex-row flex-wrap justify-between gap-y-3">
        {[
          ['Calls', formatNumber(Number(k?.calls ?? 0))],
          ['Connected', formatPercent(k && Number(k.calls) ? (Number(k.connected_calls) / Number(k.calls)) * 100 : 0, 0)],
          ['Talk time', formatDuration(Number(k?.talk_time_sec ?? 0))],
          ['Visits', formatNumber(Number(k?.visits ?? 0))],
          ['Distance', `${formatNumber(Number(k?.distance_km ?? 0))} km`],
          ['Points', formatNumber(Number(k?.activity_points ?? 0))],
        ].map(([label, v]) => (
          <View key={label} className="w-[31%]"><Text className="text-xs text-text-muted">{label}</Text><Text weight="bold" className="text-base">{v}</Text></View>
        ))}
      </Card>
      <Card className="gap-3">
        <View className="flex-row items-center gap-2"><Target size={18} color={colors.primaryText} /><Text weight="semibold">Targets this month</Text></View>
        {(targets.data ?? []).map((tg) => {
          const a = actual(tg.metric);
          const pct = Math.min(100, (a / Math.max(Number(tg.target_value), 1)) * 100);
          return (
            <View key={tg.id} accessible accessibilityLabel={`${METRIC_LABEL[tg.metric] ?? tg.metric}: ${fmt(tg.metric, a)} of ${fmt(tg.metric, Number(tg.target_value))}`}>
              <View className="flex-row justify-between">
                <Text className="text-sm">{METRIC_LABEL[tg.metric] ?? tg.metric} <Text className="text-xs text-text-muted">({tg.weightage_pct}%)</Text></Text>
                <Text weight="semibold" className="text-sm">{fmt(tg.metric, a)} / {fmt(tg.metric, Number(tg.target_value))}</Text>
              </View>
              <View className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? colors.success : pct >= 60 ? colors.accent : colors.highlight }} />
              </View>
            </View>
          );
        })}
        {!targets.data?.length ? <Text className="text-sm text-text-muted">No targets set for this month.</Text> : null}
      </Card>
    </View>
  );
}

function ClosedDeals({ userId }: Props) {
  const q = useQuery({ queryKey: ['my-deals', userId], queryFn: () => listMyDeals(supabase, userId, 30) });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={Handshake} title="No deals yet" body="Your closed deals will show here." />;
  return (
    <List>
      {q.data.map((d) => (
        <Row
          key={d.id}
          title={(d.lead as { business_name?: string } | null)?.business_name ?? d.deal_no}
          subtitle={`${d.deal_no} · ${(d.package as { name?: string } | null)?.name ?? ''} · ${formatRelative(d.closed_at)}`}
          onPress={() => router.push(`/deal/${d.id}`)}
          right={<View className="items-end"><Text weight="semibold">{formatINR(Number(d.contract_value))}</Text><Badge label={d.status.replace('_', ' ')} tone={d.status === 'active' ? 'success' : 'warning'} /></View>}
        />
      ))}
    </List>
  );
}

export function HomeSection({ tab, userId }: { tab: TranslationKey; userId: string }) {
  switch (tab) {
    case 'home.followUps': return <Agenda userId={userId} kind="follow_ups" />;
    case 'home.callbacks': return <Agenda userId={userId} kind="callbacks" />;
    case 'home.meetings': return <Agenda userId={userId} kind="meetings" />;
    case 'home.priorityLeads': return <LeadsList userId={userId} sort="priority" />;
    case 'home.newBusiness': return <LeadsList userId={userId} sort="recent" />;
    case 'home.queues': return <Queues />;
    case 'home.outcomes': return <Outcomes userId={userId} />;
    case 'home.reports': return <Reports userId={userId} />;
    case 'home.closedDeals': return <ClosedDeals userId={userId} />;
    default: return null;
  }
}

/** "Team Wins" carousel — items come from app_settings.team_wins (title, by, video_url). */
export function TeamWins() {
  const { colors } = useTheme();
  const q = useQuery({
    queryKey: ['team-wins'],
    staleTime: 30 * 60_000,
    queryFn: async () => ((await supabase.from('app_settings').select('value').eq('key', 'team_wins').maybeSingle()).data?.value ?? []) as { title: string; by: string; video_url?: string }[],
  });
  if (!q.data?.length) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2 px-4"><Trophy size={18} color={colors.highlightText} /><Text weight="semibold" className="text-base">Team Wins</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4" snapToInterval={252} decelerationRate="fast">
        {q.data.map((w) => (
          <Pressable key={w.title} onPress={() => w.video_url && Linking.openURL(w.video_url)} className="h-36 w-60 justify-end overflow-hidden rounded-card bg-header p-4" accessibilityRole="button" accessibilityLabel={`${w.title} by ${w.by}`}>
            <View className="absolute right-4 top-4"><PlayCircle size={34} color="#FFFFFF" /></View>
            <View className="absolute -bottom-10 -left-6 size-32 rounded-full bg-accent opacity-30" />
            <Text weight="bold" className="text-base text-on-header" numberOfLines={2}>{w.title}</Text>
            <Text className="text-xs text-on-header opacity-80">{w.by}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
