import { View } from 'react-native';
import { Text } from './text';
import { cn } from './cn';

const tones = {
  neutral: 'bg-surface-muted text-text-muted',
  primary: 'bg-primary-soft text-primary-text',
  accent: 'bg-accent-soft text-accent-text',
  highlight: 'bg-highlight-soft text-highlight-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
} as const;
export type BadgeTone = keyof typeof tones;

export function Badge({ label, tone = 'neutral', className }: { label: string; tone?: BadgeTone; className?: string }) {
  const [bg, fg] = tones[tone].split(' ');
  return (
    <View className={cn('self-start rounded-full px-2 py-0.5', bg, className)}>
      <Text weight="semibold" className={cn('text-[11px]', fg)}>{label}</Text>
    </View>
  );
}

/** Outcome / status colour → badge tone. */
export function toneFor(color?: string | null): BadgeTone {
  switch (color) {
    case 'green': case 'teal': return 'success';
    case 'blue': return 'primary';
    case 'violet': return 'info';
    case 'amber': case 'orange': return 'warning';
    case 'red': return 'danger';
    default: return 'neutral';
  }
}
