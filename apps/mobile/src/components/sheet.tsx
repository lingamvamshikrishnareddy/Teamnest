import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTheme } from '@/providers/theme';
import { Text } from './text';

/** Bottom sheet modal. */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-overlay" onPress={onClose} accessibilityLabel="Close" />
        <View className="max-h-[88%] rounded-t-2xl bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center px-5 pb-2 pt-4">
            <Text weight="bold" className="flex-1 text-lg">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-4 px-5 pb-4" keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View className="border-t border-border px-5 pt-3">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
