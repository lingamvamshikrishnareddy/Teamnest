import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/providers/theme';
import { Text } from './text';

export function ComingSoon({ icon: Icon, title, body, phase }: { icon: LucideIcon; title: string; body: string; phase: number }) {
  const { colors } = useTheme();
  return (
    <View className="items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-10">
      <View className="mb-4 size-14 items-center justify-center rounded-full bg-primary-soft">
        <Icon size={24} color={colors.primaryText} />
      </View>
      <Text weight="semibold" className="text-center text-base">{title}</Text>
      <Text className="mt-1 text-center text-sm text-text-muted">{body}</Text>
      <View className="mt-4 rounded-full bg-highlight-soft px-3 py-1">
        <Text weight="semibold" className="text-xs text-highlight-text">Arriving in Phase {phase}</Text>
      </View>
    </View>
  );
}
