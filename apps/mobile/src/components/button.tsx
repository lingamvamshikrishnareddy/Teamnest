import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/theme';
import { Text } from './text';
import { cn } from './cn';

const variants = {
  primary: { box: 'bg-primary', text: 'text-on-primary' },
  accent: { box: 'bg-accent', text: 'text-on-accent' },
  highlight: { box: 'bg-highlight', text: 'text-on-highlight' },
  outline: { box: 'border border-border-strong bg-surface', text: 'text-text' },
  soft: { box: 'bg-primary-soft', text: 'text-primary-text' },
  danger: { box: 'bg-danger', text: 'text-on-danger' },
} as const;

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: keyof typeof variants;
  loading?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

/** 48dp minimum tap target, haptic feedback, busy state. */
export function Button({ label, variant = 'primary', loading, disabled, className, icon, onPress, ...props }: ButtonProps) {
  const v = variants[variant];
  const { colors } = useTheme();
  const spinner = variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      className={cn('min-h-tap flex-row items-center justify-center gap-2 rounded-sm px-5 active:opacity-80', v.box, (disabled || loading) && 'opacity-50', className)}
      {...props}
    >
      {loading ? <ActivityIndicator color={spinner} /> : icon}
      <Text weight="semibold" className={cn('text-base', v.text)}>{label}</Text>
    </Pressable>
  );
}
