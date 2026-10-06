import { Pressable, View } from 'react-native';
import { CalendarCheck, FileText, FolderLock, Inbox, Megaphone, Palmtree, Target, type LucideIcon } from 'lucide-react-native';
import type { KpiTone, TranslationKey } from '@teamnest/ui';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const MODULES: { key: TranslationKey; icon: LucideIcon; tone: KpiTone; phase: number }[] = [
  { key: 'work.attendance', icon: CalendarCheck, tone: 'teal', phase: 5 },
  { key: 'work.leave', icon: Palmtree, tone: 'green', phase: 5 },
  { key: 'work.payslips', icon: FileText, tone: 'blue', phase: 5 },
  { key: 'work.documents', icon: FolderLock, tone: 'violet', phase: 5 },
  { key: 'work.goals', icon: Target, tone: 'orange', phase: 6 },
  { key: 'work.requests', icon: Inbox, tone: 'sky', phase: 5 },
  { key: 'work.policies', icon: Megaphone, tone: 'pink', phase: 5 },
];

export default function Work() {
  const { t } = useI18n();
  const { kpi } = useTheme();
  return (
    <Screen>
      <Text weight="bold" className="text-2xl">{t('tabs.work')}</Text>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {MODULES.map(({ key, icon: Icon, tone, phase }) => (
          <Pressable
            key={key}
            className="min-h-[112px] w-[48.5%] justify-between rounded-card p-4"
            style={{ backgroundColor: kpi[tone].bg }}
            accessibilityRole="button"
            accessibilityHint={`Arrives in phase ${phase}`}
          >
            <View className="size-10 items-center justify-center rounded-sm" style={{ backgroundColor: kpi[tone].icon }}>
              <Icon size={20} color={kpi[tone].fg} />
            </View>
            <View>
              <Text weight="semibold" className="text-base" style={{ color: kpi[tone].fg }}>{t(key)}</Text>
              <Text className="text-xs" style={{ color: kpi[tone].fg, opacity: 0.8 }}>Phase {phase}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
