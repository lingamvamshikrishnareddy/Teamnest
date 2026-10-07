import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Target, TrendingUp } from 'lucide-react-native';
import { getGoals } from '@teamnest/api-client';
import { formatDate, formatINRCompact, formatNumber, formatPercent } from '@teamnest/ui';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Header } from '@/components/header';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const money = new Set(['revenue', 'collections']);
const fmt = (key: string | null, v: number) => (key && money.has(key) ? formatINRCompact(v) : key === 'autopay_pct' ? formatPercent(v, 0) : formatNumber(v, v % 1 ? 1 : 0));

export default function Goals() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const userId = context?.user.id ?? '';
  const q = useQuery({ queryKey: ['goals', userId], queryFn: () => getGoals(supabase, userId), enabled: !!userId });
  const [cycleId, setCycleId] = useState<string | null>(null);
  const cycle = q.data?.cycles.find((c) => c.id === (cycleId ?? q.data?.cycles.find((x) => x.status === 'active')?.id ?? q.data?.cycles[0]?.id));
  const goals = (q.data?.goals ?? []).filter((g) => g.cycle_id === cycle?.id);
  const appraisal = q.data?.appraisals.find((a) => a.cycle_id === cycle?.id);
  const score = useMemo(() => {
    const w = goals.reduce((a, g) => a + Number(g.weightage_pct), 0);
    if (!w) return 0;
    return goals.reduce((a, g) => a + Math.min(Number(g.achieved_value) / Math.max(Number(g.target_value), 0.0001), 1.2) * Number(g.weightage_pct), 0) / w * 100;
  }, [goals]);

  if (q.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.goals')} /><Loading /></View>;
  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.goals')} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-16">
        <View className="flex-row flex-wrap gap-2">
          {(q.data?.cycles ?? []).map((c) => <Chip key={c.id} label={c.name} active={c.id === cycle?.id} onPress={() => setCycleId(c.id)} />)}
        </View>
        {cycle ? (
          <Card className="gap-2">
            <View className="flex-row items-center gap-2">
              <TrendingUp size={20} color={colors.primaryText} />
              <Text weight="semibold" className="flex-1 text-base">Weighted achievement</Text>
              <Badge label={cycle.status} tone={cycle.status === 'active' ? 'success' : 'info'} />
            </View>
            <Text weight="bold" className="text-3xl">{formatPercent(score, 0)}</Text>
            <Text className="text-xs text-text-muted">{formatDate(cycle.period_start)} – {formatDate(cycle.period_end)} · auto-updated from your sales data</Text>
            {appraisal ? (
              <View className="mt-2 rounded-sm bg-surface-muted p-3">
                <Text weight="semibold" className="text-sm">Appraisal: {appraisal.status.replace('_', ' ')}</Text>
                {appraisal.final_score ? <Text className="text-sm">Final score {appraisal.final_score} / 5</Text> : appraisal.manager_score ? <Text className="text-sm">Manager score {appraisal.manager_score} / 5</Text> : null}
              </View>
            ) : null}
          </Card>
        ) : null}
        {!goals.length ? <EmptyState icon={Target} title="No goals assigned yet" /> : null}
        {goals.map((g) => {
          const pct = Math.min(100, (Number(g.achieved_value) / Math.max(Number(g.target_value), 0.0001)) * 100);
          return (
            <Card key={g.id} className="gap-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-text-muted">{g.kra}</Text>
                {g.auto_source ? <View className="flex-row items-center gap-1"><Sparkles size={12} color={colors.accentText} /><Text className="text-xs text-accent-text">Live</Text></View> : null}
                <Text className="ml-auto text-xs text-text-muted">Weight {g.weightage_pct}%</Text>
              </View>
              <Text weight="semibold">{g.title}</Text>
              <View className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <View className="h-2.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? colors.success : pct >= 60 ? colors.accent : colors.highlight }} />
              </View>
              <Text className="text-sm"><Text weight="bold">{fmt(g.metric_key, Number(g.achieved_value))}</Text> of {fmt(g.metric_key, Number(g.target_value))} · {formatPercent(pct, 0)}</Text>
              {g.strengths ? <Text className="text-xs text-success">Strengths: {g.strengths}</Text> : null}
              {g.improvements ? <Text className="text-xs text-warning">Improve: {g.improvements}</Text> : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
