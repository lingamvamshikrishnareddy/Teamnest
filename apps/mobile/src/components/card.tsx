import { View, type ViewProps } from 'react-native';
import { nativeShadows } from '@teamnest/ui';
import { cn } from './cn';

export function Card({ className, style, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('rounded-card bg-surface p-4', className)} style={[nativeShadows.card, style]} {...props} />;
}
