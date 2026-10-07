import { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus } from 'lucide-react-native';
import { listMyRequests, raiseRequest, submitReimbursement, toAppError, type RequestType } from '@teamnest/api-client';
import { formatDate, formatINR, toIstDateString } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const TYPES: { value: RequestType | 'reimbursement'; label: string }[] = [
  { value: 'punch_correction', label: 'Punch correction' }, { value: 'reimbursement', label: 'Reimbursement' }, { value: 'travel', label: 'Travel' },
  { value: 'access', label: 'Access' }, { value: 'business_card', label: 'Business cards' }, { value: 'profile_change', label: 'Profile change' },
  { value: 'retention_bonus', label: 'Retention bonus' }, { value: 'exit', label: 'Exit / resignation' }, { value: 'grievance', label: 'Grievance' },
];
const REIMB = ['travel', 'fuel', 'food', 'phone', 'client_meeting', 'stationery', 'other'];
const TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral', draft: 'neutral' };

export default function Requests() {
  const params = useLocalSearchParams<{ type?: RequestType; day?: string }>();
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const list = useQuery({ queryKey: ['requests', userId], queryFn: () => listMyRequests(supabase, userId), enabled: !!userId });
  const reimbursements = useQuery({
    queryKey: ['reimbursements', userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from('reimbursements').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)).data ?? [],
  });
  const [open, setOpen] = useState(!!params.type);
  const [type, setType] = useState<RequestType | 'reimbursement'>(params.type ?? 'punch_correction');
  const [f, setF] = useState({ subject: '', details: '', day: params.day ?? toIstDateString(), punchIn: '09:30', punchOut: '18:30', amount: '', category: 'fuel', km: '', anonymous: false, phone: '' });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      if (type === 'reimbursement') {
        const amt = Number(f.amount);
        if (!(amt > 0)) throw new Error('Enter the amount');
        return submitReimbursement(supabase, userId, { category: f.category, expenseDate: f.day, amount: amt, description: f.details || undefined, distanceKm: f.km ? Number(f.km) : undefined });
      }
      const payload: Record<string, unknown> = {};
      let subject = f.subject.trim();
      if (type === 'punch_correction') { payload.day = f.day; payload.punch_in = f.punchIn; payload.punch_out = f.punchOut; subject ||= `Punch correction for ${formatDate(f.day)}`; }
      if (type === 'profile_change' && f.phone) payload.changes = { phone: f.phone };
      if (!subject) throw new Error('Add a short subject');
      return raiseRequest(supabase, userId, { type, subject, details: f.details || undefined, payload, anonymous: f.anonymous });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['reimbursements'] });
      setOpen(false);
      Alert.alert('Submitted', type === 'grievance' && f.anonymous ? 'Your grievance was sent to HR anonymously. It won’t appear in your list.' : 'You’ll be notified when it’s reviewed.');
    },
    onError: (e) => Alert.alert('Could not submit', e instanceof Error && !('code' in e) ? e.message : toAppError(e).message),
  });

  if (list.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.requests')} /><Loading /></View>;
  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.requests')} />
      <ScrollView contentContainerClassName="gap-3 p-4 pb-32">
        {!list.data?.length && !reimbursements.data?.length ? <EmptyState icon={Inbox} title="No requests yet" /> : null}
        {(reimbursements.data ?? []).map((r) => (
          <Card key={r.id}>
            <View className="flex-row items-center gap-2">
              <Text weight="semibold" className="flex-1">Reimbursement · {r.category.replace('_', ' ')}</Text>
              <Badge label={r.status} tone={TONE[r.status] ?? 'neutral'} />
            </View>
            <Text className="text-sm text-text-muted">{formatINR(Number(r.amount))} · {formatDate(r.expense_date)}{r.distance_km ? ` · ${r.distance_km} km` : ''}</Text>
          </Card>
        ))}
        {(list.data ?? []).map((r) => (
          <Card key={r.id}>
            <View className="flex-row items-center gap-2">
              <Text weight="semibold" className="flex-1" numberOfLines={1}>{r.subject}</Text>
              <Badge label={r.status} tone={TONE[r.status] ?? 'neutral'} />
            </View>
            <Text className="text-xs text-text-muted">{r.request_no} · {r.type.replace('_', ' ')} · {formatDate(r.created_at)}</Text>
            {r.resolution ? <Text className="mt-1 text-sm">{r.resolution}</Text> : null}
          </Card>
        ))}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
        <Button label="New request" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setOpen(true)} />
      </View>

      <Sheet visible={open} title="New request" onClose={() => setOpen(false)} footer={<Button label={t('action.submit')} loading={submit.isPending} onPress={() => submit.mutate()} />}>
        <View className="flex-row flex-wrap gap-2">
          {TYPES.map((x) => <Chip key={x.value} label={x.label} active={type === x.value} onPress={() => setType(x.value)} />)}
        </View>
        {type === 'punch_correction' && (
          <>
            <DateField label="Date" value={f.day} maximumDate={new Date()} onChange={set('day') as (v: string) => void} />
            <View className="flex-row gap-3">
              <View className="flex-1"><Field label="Punch in (HH:MM)" value={f.punchIn} onChangeText={set('punchIn')} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
              <View className="flex-1"><Field label="Punch out (HH:MM)" value={f.punchOut} onChangeText={set('punchOut')} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
            </View>
          </>
        )}
        {type === 'reimbursement' && (
          <>
            <View className="flex-row flex-wrap gap-2">{REIMB.map((c) => <Chip key={c} label={c.replace('_', ' ')} active={f.category === c} onPress={() => set('category')(c)} />)}</View>
            <View className="flex-row gap-3">
              <View className="flex-1"><Field label="Amount (₹)" value={f.amount} onChangeText={(v) => set('amount')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
              {f.category === 'fuel' ? <View className="flex-1"><Field label="Distance (km)" value={f.km} onChangeText={(v) => set('km')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View> : null}
            </View>
            <DateField label="Expense date" value={f.day} maximumDate={new Date()} onChange={set('day') as (v: string) => void} />
          </>
        )}
        {type === 'profile_change' && <Field label="New mobile number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" hint="Bank or ID changes: describe below; HR updates them securely." />}
        {type !== 'reimbursement' && type !== 'punch_correction' ? <Field label="Subject" value={f.subject} onChangeText={set('subject')} maxLength={120} /> : null}
        <Field label="Details" value={f.details} onChangeText={set('details')} multiline maxLength={1000} />
        {type === 'grievance' && (
          <View className="flex-row items-center gap-3 rounded-sm bg-surface p-3">
            <View className="flex-1"><Text weight="semibold">Submit anonymously</Text><Text className="text-xs text-text-muted">HR sees the message but not your name.</Text></View>
            <Switch value={f.anonymous} onValueChange={(v) => set('anonymous')(v)} accessibilityLabel="Submit anonymously" />
          </View>
        )}
      </Sheet>
    </View>
  );
}
