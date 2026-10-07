import { memo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, MessageCircle, Mic, Phone, Star } from 'lucide-react-native';
import type { LeadListItem } from '@teamnest/api-client';
import { phoneForLinks } from '@teamnest/ui';
import { formatDistance, formatRelative, formatTime, isSameIstDay } from '@teamnest/ui';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';
import { Badge, toneFor } from './badge';
import { Text } from './text';
import { distanceTo, type Coords } from '@/lib/location';

const TAG_TONE: Record<string, 'highlight' | 'accent' | 'primary' | 'danger' | 'info'> = {
  Hot: 'highlight', Renewal: 'accent', New: 'primary', 'Auto-pay Failed': 'danger', 'Phone Only': 'info',
};

export interface LeadCardProps {
  lead: LeadListItem;
  here?: Coords | null;
  outcomeColors?: Record<string, { label: string; color: string }>;
  onCall: (lead: LeadListItem) => void;
}

export const LeadCard = memo(function LeadCard({ lead, here, outcomeColors, onCall }: LeadCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const due = lead.next_follow_up_at;
  const stamp = due ? (isSameIstDay(due, new Date()) ? `Due ${formatTime(due)}` : `Due ${formatRelative(due)}`) : `Added ${formatRelative(lead.created_at)}`;
  const km = here && lead.lat != null && lead.lng != null ? distanceTo(here, { lat: lead.lat, lng: lead.lng }) : null;
  const outcome = lead.last_outcome_code ? outcomeColors?.[lead.last_outcome_code] : null;
  const open = () => router.push(`/lead/${lead.id}`);

  return (
    <Pressable onPress={open} className="rounded-card bg-surface p-4 active:opacity-90" accessibilityRole="button" accessibilityLabel={`${lead.business_name}, ${stamp}`}>
      <View className="flex-row items-center gap-2">
        <Text className={`flex-1 text-xs ${due && new Date(due) < new Date() ? 'text-danger' : 'text-text-muted'}`}>{stamp}</Text>
        {lead.tag ? <Badge label={lead.tag} tone={TAG_TONE[lead.tag] ?? 'neutral'} /> : null}
      </View>
      <Text weight="semibold" className="mt-1 text-base" numberOfLines={1}>{lead.business_name}</Text>
      <View className="mt-0.5 flex-row items-center gap-2">
        <Text className="text-xs text-text-muted">{lead.lead_code}</Text>
        {lead.rating != null ? (
          <View className="flex-row items-center gap-0.5">
            <Star size={12} color={colors.highlight} fill={colors.highlight} />
            <Text weight="medium" className="text-xs">{Number(lead.rating).toFixed(1)}</Text>
            <Text className="text-xs text-text-subtle">({lead.reviews_count})</Text>
          </View>
        ) : null}
      </View>
      <View className="mt-1 flex-row items-center gap-1">
        <MapPin size={12} color={colors.textSubtle} />
        <Text className="flex-1 text-xs text-text-muted" numberOfLines={1}>
          {[lead.locality, lead.pincode, km != null ? formatDistance(km) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {outcome ? (
        <View className="mt-2 flex-row items-center gap-2">
          <Text className="text-xs text-text-muted">Last:</Text>
          <Badge label={outcome.label} tone={toneFor(outcome.color)} />
        </View>
      ) : null}

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={() => onCall(lead)}
          disabled={lead.is_dnc}
          className={`min-h-tap flex-1 flex-row items-center justify-center gap-2 rounded-sm ${lead.is_dnc ? 'bg-surface-muted' : 'bg-primary'}`}
          accessibilityRole="button"
          accessibilityLabel={`${t('action.call')} ${lead.business_name}`}
        >
          <Phone size={16} color={lead.is_dnc ? colors.textSubtle : colors.onPrimary} />
          <Text weight="semibold" className={lead.is_dnc ? 'text-text-subtle' : 'text-on-primary'}>{lead.is_dnc ? 'Do not call' : t('action.call')}</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(`https://wa.me/${phoneForLinks(lead.whatsapp ?? lead.phone)}`)}
          disabled={lead.is_dnc}
          className="min-h-tap flex-1 flex-row items-center justify-center gap-2 rounded-sm bg-accent-soft"
          accessibilityRole="button"
          accessibilityLabel={`WhatsApp ${lead.business_name}`}
        >
          <MessageCircle size={16} color={colors.accentText} />
          <Text weight="semibold" className="text-accent-text">{t('action.whatsapp')}</Text>
        </Pressable>
      </View>
      <View className="mt-2 flex-row justify-between">
        <Pressable onPress={open} hitSlop={8} accessibilityRole="button"><Text weight="semibold" className="text-sm text-primary-text">{t('action.details')}</Text></Pressable>
        <Pressable onPress={() => router.push(`/lead/${lead.id}?tab=reviews`)} hitSlop={8} accessibilityRole="button"><Text weight="semibold" className="text-sm text-primary-text">Customer Reviews</Text></Pressable>
        <Pressable onPress={() => onCall(lead)} hitSlop={8} accessibilityRole="button" className="flex-row items-center gap-1">
          <Mic size={13} color={colors.primaryText} />
          <Text weight="semibold" className="text-sm text-primary-text">Record Call</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});
