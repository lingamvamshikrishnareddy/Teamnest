import { Contact } from 'lucide-react-native';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/providers/i18n';

export default function Leads() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text weight="bold" className="text-2xl">{t('tabs.leads')}</Text>
      <ComingSoon icon={Contact} phase={2} title="Your leads, search and filters" body="Lead cards with call, WhatsApp, outcomes and visit check-in. Your 2,000 demo leads are already loaded." />
    </Screen>
  );
}
