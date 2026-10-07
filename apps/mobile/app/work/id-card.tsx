import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Share2 } from 'lucide-react-native';
import { formatPhone, ROLE_LABELS_FALLBACK } from '@/lib/labels';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Header } from '@/components/header';
import { LogoMark } from '@/components/logo';
import { Text } from '@/components/text';
import { useAuth } from '@/providers/auth';
import { useTheme } from '@/providers/theme';

/** Visiting card (vCard QR for customers) and employee ID card. */
export default function IdCard() {
  const { context } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'visiting' | 'id'>('visiting');
  if (!context) return null;
  const { user, employee, organization } = context;
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${user.full_name}`, `ORG:${organization.name}`, `TITLE:${employee?.designation ?? ''}`, `TEL;TYPE=CELL:${user.phone ?? ''}`, `EMAIL:${user.email}`, 'END:VCARD'].join('\n');
  const idPayload = JSON.stringify({ t: 'teamnest-id', org: organization.slug, code: employee?.employee_code, name: user.full_name });

  return (
    <View className="flex-1 bg-background">
      <Header title="My card" />
      <View className="flex-1 items-center gap-5 p-6">
        <View className="flex-row gap-2">
          <Chip label="Visiting card" active={mode === 'visiting'} onPress={() => setMode('visiting')} />
          <Chip label="ID card" active={mode === 'id'} onPress={() => setMode('id')} />
        </View>
        <View className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface" style={{ elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
          <View className="flex-row items-center gap-3 bg-header px-5 py-4">
            <LogoMark size={36} />
            <Text weight="bold" className="flex-1 text-base text-on-header">{organization.name}</Text>
          </View>
          <View className="items-center gap-2 p-6">
            <Avatar name={user.full_name} src={user.avatar_url} size={72} />
            <Text weight="bold" className="text-xl">{user.full_name}</Text>
            <Text className="text-sm text-text-muted">{employee?.designation ?? ROLE_LABELS_FALLBACK[user.role]}</Text>
            {mode === 'visiting' ? (
              <>
                <Text className="text-sm">{formatPhone(user.phone)}</Text>
                <Text className="text-sm">{user.email}</Text>
              </>
            ) : (
              <>
                <Text weight="semibold" className="text-sm">{employee?.employee_code}</Text>
                <Text className="text-xs text-text-muted">{employee?.work_city} · Blood group {employee?.blood_group ?? '—'}</Text>
              </>
            )}
            <View className="mt-3 rounded-sm bg-white p-3">
              <QRCode value={mode === 'visiting' ? vcard : idPayload} size={160} color="#121926" />
            </View>
            <Text className="text-xs text-text-muted">{mode === 'visiting' ? 'Customers scan to save your contact' : 'Show at office reception'}</Text>
          </View>
        </View>
        {mode === 'visiting' ? (
          <Button label="Share contact" icon={<Share2 size={16} color={colors.onPrimary} />} onPress={() => Share.share({ message: `${user.full_name}\n${employee?.designation ?? ''}, ${organization.name}\n${formatPhone(user.phone)}\n${user.email}` })} />
        ) : null}
      </View>
    </View>
  );
}
