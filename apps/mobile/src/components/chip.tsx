import { Pressable } from 'react-native';
import { Text } from './text';
import { cn } from './cn';

export function Chip({ label, active, onPress, count, className }: { label: string; active?: boolean; onPress?: () => void; count?: number; className?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      className={cn('min-h-10 flex-row items-center justify-center gap-1.5 rounded-full px-4', active ? 'bg-primary' : 'border border-border bg-surface', className)}
    >
      <Text weight="semibold" className={cn('text-sm', active ? 'text-on-primary' : 'text-text-muted')}>
        {label}{count !== undefined ? ` (${count})` : ''}
      </Text>
    </Pressable>
  );
}
