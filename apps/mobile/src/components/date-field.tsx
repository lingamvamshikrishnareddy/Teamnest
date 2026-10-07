import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { formatDate } from '@teamnest/ui';
import { useTheme } from '@/providers/theme';
import { Text } from './text';

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date input (value as YYYY-MM-DD) using the native picker. */
export function DateField({ label, value, onChange, minimumDate, maximumDate }: { label: string; value: string; onChange: (v: string) => void; minimumDate?: Date; maximumDate?: Date }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-1">
      <Text weight="medium" className="mb-1.5 text-sm">{label}</Text>
      <Pressable onPress={() => setOpen(true)} className="min-h-tap flex-row items-center gap-2 rounded-sm border border-border-strong bg-surface px-4" accessibilityRole="button" accessibilityLabel={`${label}: ${formatDate(value)}`}>
        <CalendarDays size={16} color={colors.textMuted} />
        <Text className="text-base">{formatDate(value)}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={new Date(`${value}T12:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(e, d) => {
            setOpen(false);
            if (e.type !== 'dismissed' && d) onChange(toIso(d));
          }}
        />
      ) : null}
    </View>
  );
}
