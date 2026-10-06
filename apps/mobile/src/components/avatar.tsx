import { Image, View } from 'react-native';
import { initials, type KpiTone } from '@teamnest/ui';
import { useTheme } from '@/providers/theme';
import { Text } from './text';

const order: KpiTone[] = ['blue', 'teal', 'orange', 'violet', 'pink', 'green'];

export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  const { kpi } = useTheme();
  const tone = kpi[order[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % order.length]!];
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg }} className="items-center justify-center">
      <Text weight="semibold" style={{ color: tone.fg, fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}
