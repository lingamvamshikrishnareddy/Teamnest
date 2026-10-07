import { Stack } from 'expo-router';
import { useTheme } from '@/providers/theme';

export default function WorkLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
