import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, LocateFixed } from 'lucide-react-native';
import { createLead, findLeadByPhone, toAppError } from '@teamnest/api-client';
import { formatPhone } from '@teamnest/ui';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Text } from '@/components/text';
import { currentPosition, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const CATEGORIES = ['Restaurant', 'Clinic', 'Salon', 'Fitness', 'Pharmacy', 'Retail', 'Education', 'Bakery', 'Hardware', 'Real Estate', 'Automobile', 'Other'];
const EMPTY = { business_name: '', contact_name: '', phone: '', email: '', category: '', segment: 'b2c' as 'b2b' | 'b2c', address_line: '', locality: '', city: '', pincode: '' };
type Form = typeof EMPTY;

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.business_name.trim().length < 2) e.business_name = 'Enter the business name';
  const ten = f.phone.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(ten)) e.phone = 'Enter a valid 10-digit mobile number';
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'Email looks invalid';
  if (f.pincode && !/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = 'Pincode must be 6 digits';
  return e;
}

export default function AddBusiness() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>({ ...EMPTY, city: context?.employee?.work_city ?? '' });
  const [touched, setTouched] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [dup, setDup] = useState<{ id: string; business_name: string; mine: boolean } | null>(null);
  const errors = touched ? validate(form) : {};
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // live duplicate check once the number is complete
  useEffect(() => {
    const ten = form.phone.replace(/\D/g, '').slice(-10);
    if (ten.length !== 10) return setDup(null);
    let cancelled = false;
    findLeadByPhone(supabase, ten).then((l) => !cancelled && setDup(l ? { id: l.id, business_name: l.business_name, mine: l.owner_id === context?.user.id } : null));
    return () => { cancelled = true; };
  }, [form.phone, context?.user.id]);

  const locate = async () => {
    setLocating(true);
    try {
      setCoords(await currentPosition());
    } catch (e) {
      Alert.alert('Location', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      createLead(supabase, context!.user.id, {
        business_name: form.business_name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: formatPhone(form.phone),
        email: form.email.trim() || null,
        category: form.category || null,
        segment: form.segment,
        address_line: form.address_line.trim() || null,
        locality: form.locality.trim() || null,
        city: form.city.trim() || null,
        pincode: form.pincode || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        tag: 'New',
      }),
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-chips'] });
      setForm({ ...EMPTY, city: form.city });
      setCoords(null);
      setTouched(false);
      router.push(`/lead/${lead.id}`);
    },
    onError: (e) => {
      const err = toAppError(e);
      Alert.alert('Could not add business', err.code === 'duplicate' ? 'A business with this phone number already exists.' : err.message);
    },
  });

  const submit = () => {
    setTouched(true);
    if (Object.keys(validate(form)).length || dup) return;
    save.mutate();
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} className="bg-header">
        <View className="px-4 pb-4 pt-2">
          <Text weight="bold" className="text-xl text-on-header">{t('tabs.add')}</Text>
          <Text className="text-sm text-on-header opacity-80">New businesses are assigned to you automatically.</Text>
        </View>
      </SafeAreaView>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 p-4 pb-32" keyboardShouldPersistTaps="handled">
          <Field label="Business name" required value={form.business_name} onChangeText={set('business_name')} error={errors.business_name} autoCapitalize="words" />
          <Field label="Mobile number" required value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" maxLength={16} placeholder="98xxx xxxxx" />
          {dup ? (
            <Pressable onPress={() => dup.mine && router.push(`/lead/${dup.id}`)} className="flex-row gap-2 rounded-sm bg-warning-soft p-3" accessibilityRole={dup.mine ? 'button' : undefined}>
              <AlertTriangle size={16} color={colors.warning} />
              <Text className="flex-1 text-sm text-warning">
                Already in TeamNest as “{dup.business_name}”{dup.mine ? ' — tap to open your lead.' : ' (owned by a colleague). Ask your team lead to reassign it.'}
              </Text>
            </Pressable>
          ) : null}
          <Field label="Contact person" value={form.contact_name} onChangeText={set('contact_name')} autoCapitalize="words" />
          <Field label="Email" value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />

          <Text weight="semibold">Category</Text>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((c) => <Chip key={c} label={c} active={form.category === c} onPress={() => set('category')(form.category === c ? '' : c)} />)}
          </View>
          <Text weight="semibold">Segment</Text>
          <View className="flex-row gap-2">
            <Chip label="B2C (consumers)" active={form.segment === 'b2c'} onPress={() => setForm((f) => ({ ...f, segment: 'b2c' }))} />
            <Chip label="B2B (businesses)" active={form.segment === 'b2b'} onPress={() => setForm((f) => ({ ...f, segment: 'b2b' }))} />
          </View>

          <Field label="Address" value={form.address_line} onChangeText={set('address_line')} />
          <View className="flex-row gap-3">
            <View className="flex-1"><Field label="Locality" value={form.locality} onChangeText={set('locality')} /></View>
            <View className="w-32"><Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} error={errors.pincode} keyboardType="number-pad" maxLength={6} /></View>
          </View>
          <Field label="City" value={form.city} onChangeText={set('city')} />

          <Pressable onPress={locate} className="min-h-tap flex-row items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface p-4" accessibilityRole="button">
            {coords ? <CheckCircle2 size={20} color={colors.success} /> : <LocateFixed size={20} color={colors.primaryText} />}
            <View className="flex-1">
              <Text weight="semibold">{coords ? 'Location captured' : locating ? 'Getting location…' : 'Use my current location'}</Text>
              <Text className="text-xs text-text-muted">{coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${Math.round(coords.accuracy ?? 0)} m)` : 'Stand at the shop so visits can be verified later'}</Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-4 pt-3">
        <Button label="Save business" loading={save.isPending} disabled={!!dup} onPress={submit} />
      </View>
    </View>
  );
}
