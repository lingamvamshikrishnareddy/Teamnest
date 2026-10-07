import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Text } from './text';

export interface DonutSlice { label: string; value: number; color: string }

/** Lightweight donut (react-native-svg) with a centre label and legend. */
export function Donut({ slices, size = 140, stroke = 18, center, sub }: { slices: DonutSlice[]; size?: number; stroke?: number; center: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, slices.reduce((a, s) => a + s.value, 0));
  let offset = 0;
  return (
    <View className="flex-row items-center gap-5" accessible accessibilityLabel={slices.map((s) => `${s.label} ${s.value}`).join(', ')}>
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="#8883" strokeWidth={stroke} fill="none" />
            {slices.filter((s) => s.value > 0).map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <Circle key={s.label} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-offset} strokeLinecap="butt" />
              );
              offset += len;
              return el;
            })}
          </G>
        </Svg>
        <Text weight="bold" className="text-2xl">{center}</Text>
        {sub ? <Text className="text-xs text-text-muted">{sub}</Text> : null}
      </View>
      <View className="flex-1 gap-1.5">
        {slices.map((s) => (
          <View key={s.label} className="flex-row items-center gap-2">
            <View className="size-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <Text className="flex-1 text-sm">{s.label}</Text>
            <Text weight="semibold" className="text-sm">{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
