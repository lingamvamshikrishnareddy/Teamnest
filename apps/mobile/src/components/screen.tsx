import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** Standard screen: safe area, light-grey canvas, 16dp gutters. */
export function Screen({ children, scroll = true, header, className, ...props }: ScrollViewProps & { scroll?: boolean; header?: ReactNode; className?: string }) {
  return (
    <SafeAreaView edges={header ? ['left', 'right'] : ['top', 'left', 'right']} className="flex-1 bg-background">
      {header}
      {scroll ? (
        <ScrollView contentContainerClassName={cn('px-4 pb-8 pt-4 gap-4', className)} {...props}>{children}</ScrollView>
      ) : (
        <View className={cn('flex-1 px-4 pt-4', className)}>{children}</View>
      )}
    </SafeAreaView>
  );
}
