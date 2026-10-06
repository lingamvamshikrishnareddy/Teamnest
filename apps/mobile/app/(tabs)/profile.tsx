import { Alert, Linking, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Globe, Landmark, LogOut, Moon, ShieldCheck, Siren, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { ROLE_LABELS } from '@teamnest/types';
import { formatDate, formatPhone, LOCALES } from '@teamnest/ui';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="flex-row justify-between gap-4 py-2">
      <Text className="text-sm text-text-muted">{label}</Text>
      <Text weight="medium" className="flex-1 text-right text-sm" numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View className="mb-1 flex-row items-center gap-2">
        <Icon size={18} color={colors.primaryText} />
        <Text weight="semibold" className="flex-1 text-base">{title}</Text>
        <Text weight="medium" className="text-xs text-primary-text">Request edit</Text>
      </View>
      {children}
    </Card>
  );
}

export default function Profile() {
  const { context, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { colors, preference, setPreference } = useTheme();
  const user = context?.user;
  const employee = context?.employee;

  // Masked for everyone except the owner, HR and Finance — enforced in Postgres.
  const bank = useQuery({
    queryKey: ['sensitive', employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => (await supabase.rpc('get_employee_sensitive', { p_employee_id: employee!.id })).data?.[0] ?? null,
  });

  if (!user) return null;
  const emergency = (employee?.emergency_contact ?? {}) as { name?: string; relation?: string; phone?: string };

  const cycleLanguage = () => {
    const idx = LOCALES.findIndex((l) => l.code === locale);
    void setLocale(LOCALES[(idx + 1) % LOCALES.length]!.code);
  };
  const cycleTheme = () => setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system');

  return (
    <Screen>
      <View className="items-center pt-2">
        <Avatar name={user.full_name} src={user.avatar_url} size={80} />
        <Text weight="bold" className="mt-3 text-xl">{user.full_name}</Text>
        <Text className="text-sm text-text-muted">{employee?.designation ?? ROLE_LABELS[user.role]} · {employee?.employee_code}</Text>
      </View>

      <Section icon={Building2} title="Company">
        <Row label="Organisation" value={context?.organization.name} />
        <Row label="Team" value={context?.team?.name} />
        <Row label="Department" value={employee?.department} />
        <Row label="Work city" value={employee?.work_city} />
        <Row label="Joined" value={employee?.date_of_joining ? formatDate(employee.date_of_joining) : null} />
      </Section>

      <Section icon={UserRound} title="Personal">
        <Row label="Email" value={user.email} />
        <Row label="Phone" value={formatPhone(user.phone)} />
        <Row label="Blood group" value={employee?.blood_group} />
      </Section>

      <Section icon={Landmark} title="Bank">
        <Row label="Bank" value={bank.data?.bank_name} />
        <Row label="Account" value={bank.data?.bank_account ? `•••• ${bank.data.bank_account.slice(-4)}` : null} />
        <Row label="IFSC" value={bank.data?.bank_ifsc} />
        <Row label="PAN" value={bank.data?.pan ? `•••••${bank.data.pan.slice(-5)}` : null} />
      </Section>

      <Section icon={Siren} title="Emergency contact">
        <Row label="Name" value={emergency.name} />
        <Row label="Relation" value={emergency.relation} />
        <Row label="Phone" value={formatPhone(emergency.phone)} />
      </Section>

      <Section icon={UsersRound} title="Reporting head">
        <Row label="Name" value={context?.manager?.full_name} />
        <Row label="Phone" value={formatPhone(context?.manager?.phone)} />
      </Section>

      <Card className="p-0">
        {[
          { icon: Globe, label: 'Language', value: LOCALES.find((l) => l.code === locale)?.nativeLabel, onPress: cycleLanguage },
          { icon: Moon, label: 'Appearance', value: preference[0]!.toUpperCase() + preference.slice(1), onPress: cycleTheme },
          { icon: ShieldCheck, label: 'Privacy notice', value: 'v2026.1', onPress: () => Linking.openURL('https://example.com/privacy') },
        ].map(({ icon: Icon, label, value, onPress }, i) => (
          <Pressable key={label} onPress={onPress} className={`min-h-tap flex-row items-center gap-3 px-4 py-3 ${i ? 'border-t border-border' : ''}`} accessibilityRole="button">
            <Icon size={20} color={colors.textMuted} />
            <Text weight="medium" className="flex-1 text-base">{label}</Text>
            <Text className="text-sm text-text-muted">{value}</Text>
            <ChevronRight size={18} color={colors.textSubtle} />
          </Pressable>
        ))}
      </Card>

      <Pressable
        onPress={() =>
          Alert.alert(t('action.signOut'), undefined, [
            { text: t('action.cancel'), style: 'cancel' },
            { text: t('action.signOut'), style: 'destructive', onPress: () => void signOut() },
          ])
        }
        className="min-h-tap flex-row items-center justify-center gap-2 rounded-card border border-border bg-surface"
        accessibilityRole="button"
      >
        <LogOut size={18} color={colors.danger} />
        <Text weight="semibold" className="text-base text-danger">{t('action.signOut')}</Text>
      </Pressable>
    </Screen>
  );
}
