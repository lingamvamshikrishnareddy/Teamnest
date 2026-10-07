import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PartyPopper, Plus } from 'lucide-react-native';
import { applyLeave, cancelLeave, getLeaveOverview, toAppError } from '@teamnest/api-client';
import { formatDate, toIstDateString } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral', draft: 'neutral' };

export default function Leave() {
  const params = useLocalSearchParams<{ from?: string }>();
  const { context } = useAuth();
  const { t } = useI18n();
  const { kpi, colors } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const year = new Date().getFullYear();
  const data = useQuery({ queryKey: ['leave', userId, year], queryFn: () => getLeaveOverview(supabase, userId, year), enabled: !!userId });
  const [tab, setTab] = useState<'requests' | 'holidays'>('requests');
  const [open, setOpen] = useState(!!params.from);
  const today = toIstDateString();
  const [form, setForm] = useState({ typeId: '', from: params.from ?? today, to: params.from ?? today, half: null as null | 'first_half' | 'second_half', reason: '' });

  const types = (data.data?.types ?? []).filter((lt) => !lt.applicable_gender || lt.applicable_gender === context?.employee?.gender);
  const balanceOf = (id: string) => data.data?.balances.find((b) => b.leave_type_id === id)?.balance;
  const tones = ['teal', 'blue', 'violet', 'orange', 'green', 'pink'] as const;

  const apply = useMutation({
    mutationFn: () => applyLeave(supabase, userId, { leaveTypeId: form.typeId, from: form.from, to: form.half ? form.from : form.to, halfDay: form.half, reason: form.reason || undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      setOpen(false);
      Alert.alert('Leave requested', `${r.days} day(s) sent to your manager for approval.`);
    },
    onError: (e) => Alert.alert('Can’t apply', toAppError(e).message),
  });
  const cancel = useMutation({ mutationFn: (id: string) => cancelLeave(supabase, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }), onError: (e) => Alert.alert('Can’t cancel', toAppError(e).message) });

  const upcoming = useMemo(() => (data.data?.holidays ?? []).filter((h) => !h.city || h.city === context?.employee?.work_city), [data.data, context?.employee?.work_city]);

  if (data.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.leave')} /><Loading /></View>;

  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.leave')} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-32">
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {types.filter((lt) => lt.annual_quota > 0 || balanceOf(lt.id) !== undefined).slice(0, 6).map((lt, i) => {
            const tone = kpi[tones[i % tones.length]!];
            return (
              <View key={lt.id} className="w-[48.5%] rounded-card p-4" style={{ backgroundColor: tone.bg }}>
                <Text weight="medium" className="text-sm" style={{ color: tone.fg }}>{lt.name}</Text>
                <Text weight="bold" className="mt-1 text-2xl" style={{ color: tone.fg }}>{balanceOf(lt.id) ?? 0}</Text>
                <Text className="text-xs" style={{ color: tone.fg, opacity: 0.8 }}>days available</Text>
              </View>
            );
          })}
        </View>

        <View className="flex-row gap-2">
          <Chip label="My requests" active={tab === 'requests'} onPress={() => setTab('requests')} />
          <Chip label="Holiday calendar" active={tab === 'holidays'} onPress={() => setTab('holidays')} />
        </View>

        {tab === 'requests' ? (
          (data.data?.requests ?? []).map((r) => {
            const lt = r.leave_type as { name?: string } | null;
            return (
              <Card key={r.id}>
                <View className="flex-row items-center gap-2">
                  <Text weight="semibold" className="flex-1">{lt?.name} · {r.days} day{Number(r.days) === 1 ? '' : 's'}</Text>
                  <Badge label={r.status} tone={TONE[r.status] ?? 'neutral'} />
                </View>
                <Text className="mt-1 text-sm text-text-muted">{formatDate(r.from_date)}{r.to_date !== r.from_date ? ` – ${formatDate(r.to_date)}` : ''}{r.half_day ? ` · ${r.half_day.replace('_', ' ')}` : ''}</Text>
                {r.reason ? <Text className="mt-1 text-sm">{r.reason}</Text> : null}
                {(r.status === 'pending' || (r.status === 'approved' && r.from_date > today)) ? (
                  <Button label="Cancel request" variant="outline" className="mt-3" loading={cancel.isPending && cancel.variables === r.id}
                    onPress={() => Alert.alert('Cancel leave?', undefined, [{ text: 'Keep' }, { text: 'Cancel leave', style: 'destructive', onPress: () => cancel.mutate(r.id) }])} />
                ) : null}
              </Card>
            );
          })
        ) : (
          <View className="overflow-hidden rounded-card">
            {upcoming.map((h) => (
              <View key={h.id} className={`flex-row items-center gap-3 border-b border-border bg-surface px-4 py-3 ${h.day < today ? 'opacity-50' : ''}`}>
                <PartyPopper size={18} color={colors.highlightText} />
                <View className="flex-1"><Text weight="semibold">{h.name}</Text><Text className="text-xs text-text-muted">{formatDate(h.day)}{h.city ? ` · ${h.city}` : ''}</Text></View>
                {h.is_optional ? <Badge label="Optional" tone="info" /> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
        <Button label="Apply leave" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setOpen(true)} />
      </View>

      <Sheet visible={open} title="Apply leave" onClose={() => setOpen(false)} footer={<Button label={t('action.submit')} disabled={!form.typeId} loading={apply.isPending} onPress={() => apply.mutate()} />}>
        <Text weight="semibold">Leave type</Text>
        <View className="flex-row flex-wrap gap-2">
          {types.map((lt) => <Chip key={lt.id} label={`${lt.name}${balanceOf(lt.id) !== undefined ? ` · ${balanceOf(lt.id)}` : ''}`} active={form.typeId === lt.id} onPress={() => setForm((f) => ({ ...f, typeId: lt.id }))} />)}
        </View>
        <View className="flex-row gap-3">
          <DateField label="From" value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v, to: v > f.to ? v : f.to }))} />
          {!form.half ? <DateField label="To" value={form.to} minimumDate={new Date(`${form.from}T00:00:00`)} onChange={(v) => setForm((f) => ({ ...f, to: v }))} /> : null}
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Chip label="Full day(s)" active={!form.half} onPress={() => setForm((f) => ({ ...f, half: null }))} />
          <Chip label="First half" active={form.half === 'first_half'} onPress={() => setForm((f) => ({ ...f, half: 'first_half' }))} />
          <Chip label="Second half" active={form.half === 'second_half'} onPress={() => setForm((f) => ({ ...f, half: 'second_half' }))} />
        </View>
        <Field label="Reason" value={form.reason} onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))} multiline maxLength={300} />
        <Text className="text-xs text-text-muted">Week-offs and holidays are excluded automatically. Your manager gets an approval request.</Text>
      </Sheet>
    </View>
  );
}
