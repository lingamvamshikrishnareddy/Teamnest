import { ActivityIndicator, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/providers/theme';
import { Button } from './button';
import { Text } from './text';

export function EmptyState({ icon: Icon, title, body, actionLabel, onAction }: { icon: LucideIcon; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="items-center px-8 py-12">
      <View className="mb-4 size-16 items-center justify-center rounded-full bg-primary-soft">
        <Icon size={28} color={colors.primaryText} />
      </View>
      <Text weight="semibold" className="text-center text-base">{title}</Text>
      {body ? <Text className="mt-1 text-center text-sm text-text-muted">{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} variant="soft" onPress={onAction} className="mt-5" /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="m-4 items-center rounded-card bg-danger-soft p-5">
      <Text className="text-center text-sm text-danger">{message}</Text>
      {onRetry ? <Button label="Try again" variant="outline" onPress={onRetry} className="mt-3" /> : null}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center p-10">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Lead-card shaped skeleton rows. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="gap-2 rounded-card bg-surface p-4">
          <View className="h-3 w-24 rounded-sm bg-surface-muted" />
          <View className="h-4 w-3/4 rounded-sm bg-surface-muted" />
          <View className="h-3 w-1/2 rounded-sm bg-surface-muted" />
          <View className="mt-2 flex-row gap-2">
            <View className="h-9 flex-1 rounded-sm bg-surface-muted" />
            <View className="h-9 flex-1 rounded-sm bg-surface-muted" />
          </View>
        </View>
      ))}
    </View>
  );
}
