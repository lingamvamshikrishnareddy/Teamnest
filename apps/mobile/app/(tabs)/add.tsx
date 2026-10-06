import { Store } from 'lucide-react-native';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useI18n } from '@/providers/i18n';

export default function AddBusiness() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text weight="bold" className="text-2xl">{t('tabs.add')}</Text>
      <ComingSoon icon={Store} phase={2} title="Add a new business" body="Capture a business with location, photos and contact details. Duplicate phone numbers are blocked automatically." />
    </Screen>
  );
}
