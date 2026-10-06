import { View } from 'react-native';
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react-native';
import { formatPercent, trend, type KpiTone } from '@teamnest/ui';
import { useTheme } from '@/providers/theme';
import { Text } from './text';

export function KpiTile({ label, value, tone, icon: Icon, change }: { label: string; value: string; tone: KpiTone; icon: LucideIcon; change?: number | null }) {
  const { kpi, name } = useTheme();
  const t = kpi[tone];
  const dir = change == null ? null : Math.abs(change) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
  const Arrow = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  const trendColor = dir === 'up' ? trend[name].up : dir === 'down' ? trend[name].down : trend[name].flat;

  return (
    <View
      className="flex-1 rounded-card p-3.5"
      style={{ backgroundColor: t.bg, minHeight: 104 }}
      accessible
      accessibilityLabel={`${label}: ${value}${dir ? `, ${dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'unchanged'} ${formatPercent(Math.abs(change ?? 0))}` : ''}`}
    >
      <View className="flex-row items-start justify-between">
        <Text weight="medium" className="flex-1 pr-2 text-sm" style={{ color: t.fg }} numberOfLines={2}>{label}</Text>
        <View className="size-8 items-center justify-center rounded-sm" style={{ backgroundColor: t.icon }}>
          <Icon size={16} color={t.fg} />
        </View>
      </View>
      <Text weight="bold" className="mt-2 text-xl" style={{ color: t.fg }}>{value}</Text>
      {dir && (
        <View className="mt-1 flex-row items-center gap-0.5">
          <Arrow size={12} color={trendColor} />
          <Text weight="semibold" className="text-xs" style={{ color: trendColor }}>{formatPercent(Math.abs(change!))}</Text>
        </View>
      )}
    </View>
  );
}
