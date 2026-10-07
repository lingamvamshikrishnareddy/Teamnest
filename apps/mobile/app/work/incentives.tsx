import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee } from 'lucide-react-native';
import { formatINR, formatMonth } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Card } from '@/components/card';
import { Header } from '@/components/header';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useTheme } from '@/providers/theme';

const TONE: Record<string, BadgeTone> = { calculated: 'neutral', pending_approval: 'warning', approved: 'success', rejected: 'danger', paid: 'primary' };
const BASIS: Record<string, string> = { deal_slab: 'Deal incentive', autopay_bonus: 'Auto-pay bonus', collection: 'Collection', target_kicker: 'Target kicker', adjustment: 'Adjustment' };

export default function Incentives() {
  const { context } = useAuth();
  const { kpi } = useTheme();
  const userId = context?.user.id ?? '';
  const q = useQuery({
    queryKey: ['incentives', userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from('incentives').select('*, deal:deals(deal_no, lead:leads(business_name))').eq('user_id', userId).order('period_month', { ascending: false }).order('amount', { ascending: false })).data ?? [],
  });
  if (q.isLoading) return <View className="flex-1 bg-background"><Header title="Incentives" /><Loading /></View>;

  const months = new Map<string, typeof q.data>();
  for (const r of q.data ?? []) months.set(r.period_month, [...(months.get(r.period_month) ?? []), r]);
  const thisMonth = [...months.values()][0] ?? [];
  const earned = thisMonth.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <View className="flex-1 bg-background">
      <Header title="Incentives" />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-16">
        {!q.data?.length ? <EmptyState icon={BadgeIndianRupee} title="No incentives yet" body="Close deals to start earning. Incentives are calculated from your deals and collections." /> : (
          <View className="rounded-card p-4" style={{ backgroundColor: kpi.green.bg }}>
            <Text className="text-sm" style={{ color: kpi.green.fg }}>{formatMonth([...months.keys()][0]!)} so far</Text>
            <Text weight="bold" className="text-3xl" style={{ color: kpi.green.fg }}>{formatINR(earned)}</Text>
            <Text className="text-xs" style={{ color: kpi.green.fg }}>Approved incentives are added to your payslip automatically.</Text>
          </View>
        )}
        {[...months].map(([month, rows]) => (
          <View key={month} className="gap-2">
            <View className="flex-row justify-between">
              <Text weight="semibold">{formatMonth(month)}</Text>
              <Text weight="semibold">{formatINR((rows ?? []).reduce((a, r) => a + Number(r.amount), 0))}</Text>
            </View>
            {(rows ?? []).map((r) => {
              const deal = r.deal as { deal_no?: string; lead?: { business_name?: string } } | null;
              return (
                <Card key={r.id} className="flex-row items-center gap-3 py-3">
                  <View className="flex-1">
                    <Text className="text-sm" numberOfLines={1}>{BASIS[r.basis] ?? r.basis}{deal?.lead?.business_name ? ` · ${deal.lead.business_name}` : ''}</Text>
                    <Text className="text-xs text-text-muted">{deal?.deal_no ?? r.notes ?? ''}{r.rate_pct ? ` · ${r.rate_pct}%` : ''}</Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text weight="semibold">{formatINR(Number(r.amount))}</Text>
                    <Badge label={r.status.replace('_', ' ')} tone={TONE[r.status] ?? 'neutral'} />
                  </View>
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
