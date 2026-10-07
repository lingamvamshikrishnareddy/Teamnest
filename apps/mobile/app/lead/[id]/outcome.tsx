import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Check, CloudOff } from 'lucide-react-native';
import { getLead, toAppError } from '@teamnest/api-client';
import { formatDateTime } from '@teamnest/ui';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { useOutcomeCodes } from '@/hooks/use-outcome-codes';
import { quickTimes } from '@/lib/dates';
import { sendOrQueue } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const DOT: Record<string, string> = { green: '#16A34A', blue: '#2563EB', violet: '#7C3AED', teal: '#0D9488', amber: '#D97706', red: '#DC2626', slate: '#64748B' };

export default function OutcomeScreen() {
  const { id, callId, visitId, connected } = useLocalSearchParams<{ id: string; callId?: string; visitId?: string; connected?: string }>();
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const codes = useOutcomeCodes();
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(supabase, id) });

  // not-connected calls start on "Not Reachable"
  const [code, setCode] = useState<string | null>(connected === '0' ? 'not_reachable' : null);
  const [remarks, setRemarks] = useState('');
  const options = useMemo(() => quickTimes(), []);
  const [when, setWhen] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = codes.data?.find((c) => c.code === code);
  const needsFollowUp = !!selected?.requires_follow_up && !selected?.is_terminal;
  const needsRemarks = !!selected?.requires_remarks;
  const effectiveWhen = needsFollowUp ? when ?? options[0]!.at : null;

  const submit = async () => {
    if (!selected || !context) return;
    if (needsRemarks && !remarks.trim()) return Alert.alert('Remarks needed', `Please add a short note for “${selected.label}”.`);
    if (selected.code === 'deal_closed') {
      // closing goes through the quote → deal flow so pricing and payments are captured
      router.replace({ pathname: '/lead/[id]/quote', params: { id, closing: '1' } });
      return;
    }
    setSaving(true);
    try {
      const res = await sendOrQueue({
        kind: 'outcome',
        userId: context.user.id,
        payload: {
          leadId: id,
          code: selected.code,
          remarks: remarks.trim() || undefined,
          callId: callId || undefined,
          visitId: visitId || undefined,
          nextFollowUpAt: effectiveWhen?.toISOString() ?? null,
        },
      });
      for (const key of [['lead', id], ['lead-timeline', id], ['leads'], ['lead-chips'], ['kpis'], ['agenda']]) qc.invalidateQueries({ queryKey: key });
      if (!res.sent) Alert.alert('Saved offline', 'You’re offline. This outcome will sync automatically when you reconnect.');
      if (selected.code === 'meeting_set') {
        router.replace(`/lead/${id}`);
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert('Could not save', toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  if (codes.isLoading || lead.isLoading) return <View className="flex-1 bg-background"><Header title="Outcome" /><Loading /></View>;

  return (
    <View className="flex-1 bg-background">
      <Header title="Record outcome" subtitle={lead.data?.business_name} />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-32" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text weight="semibold">What happened?</Text>
          <View className="flex-row flex-wrap justify-between gap-y-2">
            {(codes.data ?? []).map((c) => {
              const on = code === c.code;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => setCode(c.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  className={`min-h-tap w-[48.8%] flex-row items-center gap-2 rounded-card border px-3 py-3 ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
                >
                  <View className="size-3 rounded-full" style={{ backgroundColor: DOT[c.color] ?? DOT.slate }} />
                  <Text weight={on ? 'semibold' : 'medium'} className={`flex-1 text-sm ${on ? 'text-primary-text' : ''}`}>{t(`outcome.${c.code}` as never) === `outcome.${c.code}` ? c.label : t(`outcome.${c.code}` as never)}</Text>
                  {on ? <Check size={16} color={colors.primaryText} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {selected?.code === 'deal_closed' ? (
          <View className="rounded-card bg-success-soft p-4">
            <Text className="text-sm text-success">Great! Next you’ll pick the package and price, then collect payment.</Text>
          </View>
        ) : null}
        {selected?.code === 'do_not_contact' ? (
          <View className="rounded-card bg-danger-soft p-4">
            <Text className="text-sm text-danger">This business will be removed from all calling lists. This can’t be undone from the app.</Text>
          </View>
        ) : null}

        {needsFollowUp && (
          <View className="gap-2">
            <Text weight="semibold">Next follow-up</Text>
            <View className="flex-row flex-wrap gap-2">
              {options.map((o) => (
                <Chip key={o.key} label={o.label} active={(when ?? options[0]!.at).getTime() === o.at.getTime()} onPress={() => setWhen(o.at)} />
              ))}
              <Chip label="Pick date & time" active={!!when && !options.some((o) => o.at.getTime() === when.getTime())} onPress={() => setPicker('date')} />
            </View>
            <View className="flex-row items-center gap-2">
              <CalendarDays size={16} color={colors.textMuted} />
              <Text className="text-sm text-text-muted">{effectiveWhen ? formatDateTime(effectiveWhen) : ''}</Text>
            </View>
            {picker ? (
              <DateTimePicker
                value={when ?? options[0]!.at}
                mode={picker}
                minimumDate={new Date()}
                onChange={(e, d) => {
                  if (e.type === 'dismissed' || !d) return setPicker(null);
                  setWhen(d);
                  setPicker(picker === 'date' ? 'time' : null);
                }}
              />
            ) : null}
          </View>
        )}

        <Field
          label={needsRemarks ? 'Remarks (required)' : 'Remarks'}
          value={remarks}
          onChangeText={setRemarks}
          multiline
          placeholder="What did the customer say?"
          maxLength={500}
        />
        <View className="flex-row items-center gap-2">
          <CloudOff size={14} color={colors.textSubtle} />
          <Text className="text-xs text-text-subtle">Works offline — syncs when you’re back online.</Text>
        </View>
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
        <Button label={selected?.code === 'deal_closed' ? 'Continue to quote' : 'Save outcome'} disabled={!selected} loading={saving} onPress={submit} />
      </View>
    </View>
  );
}
