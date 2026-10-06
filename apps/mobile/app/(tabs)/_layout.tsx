import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BriefcaseBusiness, CircleUser, Contact, House, Plus } from 'lucide-react-native';
import { layout, nativeShadows } from '@teamnest/ui';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: layout.mobileTabBarHeight + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="leads" options={{ title: t('tabs.leads'), tabBarIcon: ({ color, size }) => <Contact color={color} size={size} /> }} />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarAccessibilityLabel: t('tabs.add'),
          tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
          tabBarIcon: () => (
            <View
              className="-mt-6 size-14 items-center justify-center rounded-full border-4 bg-highlight"
              style={[{ borderColor: colors.surface }, Platform.OS === 'web' ? undefined : nativeShadows.raised]}
            >
              <Plus color={colors.onHighlight} size={28} strokeWidth={2.6} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="work" options={{ title: t('tabs.work'), tabBarIcon: ({ color, size }) => <BriefcaseBusiness color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} /> }} />
    </Tabs>
  );
}
