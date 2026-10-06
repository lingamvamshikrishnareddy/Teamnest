import { Link } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';

export default function NotFound() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
      <Text weight="bold" className="text-xl">Page not found</Text>
      <Link href="/home" className="text-primary-text">Go home</Link>
    </View>
  );
}
