import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text } from './text';

/** Blue app header with back button (pushed screens). */
export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <SafeAreaView edges={['top']} className="bg-header">
      <View className="min-h-14 flex-row items-center gap-1 px-2 pb-2">
        <Pressable
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))}
          className="size-11 items-center justify-center rounded-full active:bg-white/15"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={26} color="#FFFFFF" />
        </Pressable>
        <View className="flex-1">
          <Text weight="semibold" className="text-lg text-on-header" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text className="text-xs text-on-header opacity-80" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </SafeAreaView>
  );
}
