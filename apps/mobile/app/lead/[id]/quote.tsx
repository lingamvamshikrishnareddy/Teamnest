import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Check, Clock3, Minus, Plus, Repeat, ShieldAlert, Smartphone } from 'lucide-react-native';
import { closeDeal, createQuote, getLead, listPackages, toAppError, type PaymentMode } from '@teamnest/api-client';
import { formatINR, formatPercent } from '@teamnest/ui';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/providers/theme';

const MODES: { value: PaymentMode; label: string; hint: string; Icon: typeof Repeat }[] = [
  { value: 'autopay', label: 'Auto-pay', hint: 'Monthly UPI Autopay / e-NACH', Icon: Repeat },
  { value: 'online', label: 'Online', hint: 'Payment link or UPI QR', Icon: Smartphone },
  { value: 'cash', label: 'Cash', hint: 'Collect now, receipt instantly', Icon: Banknote },
];

function gstSplit(taxable: number, pct: number, intra: boolean) {
  const tax = Math.round(taxable * pct) / 100;
  return intra ? { cgst: Math.round((tax / 2) * 100) / 100, sgst: tax - Math.round((tax / 2) * 100) / 100, igst: 0, total: taxable + tax } : { cgst: 0, sgst: 0, igst: tax, total: taxable + tax };
}

export default function QuoteBuilder() {
  const { id, quoteId } = useLocalSearchParams<{ id: string; quoteId?: string; closing?: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(supabase, id) });
  const packages = useQuery({ queryKey: ['packages'], queryFn: () => listPackages(supabase), staleTime: 10 * 60_000 });
  const companyState = useQuery({
    queryKey: ['setting', 'company_state'],
    queryFn: async () => ((await supabase.from('app_settings').select('value').eq('key', 'company_state').maybeSingle()).data?.value as string | undefined) ?? 'Telangana',
  });

  const [activeQuoteId, setActiveQuoteId] = useState<string | undefined>(quoteId);
  const existing = useQuery({
    queryKey: ['quote', activeQuoteId],
    enabled: !!activeQuoteId,
    queryFn: async () => (await supabase.from('quotes').select('*, package:packages(name, tenure_months)').eq('id', activeQuoteId!).single()).data,
    // while waiting for a discount approval, check every 20 s
    refetchInterval: (q) => (q.state.data?.status === 'pending_approval' ? 20_000 : false),
  });

  const [pkgId, setPkgId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<PaymentMode>('autopay');
  const pkg = packages.data?.find((p) => p.id === pkgId);

  useEffect(() => {
    if (!pkgId && packages.data?.[1]) setPkgId(packages.data[1].id);
  }, [packages.data, pkgId]);

  const intra = (lead.data?.state ?? companyState.data ?? '').toLowerCase() === (companyState.data ?? '').toLowerCase();
  const calc = useMemo(() => {
    if (!pkg) return null;
    const list = Number(pkg.list_price);
    const disc = Math.round(list * discount) / 100;
    const net = list - disc;
    return { list, disc, net, ...gstSplit(net, Number(pkg.gst_pct), intra) };
  }, [pkg, discount, intra]);

  const maxFree = Number(pkg?.max_discount_pct ?? 0);
  const hardCap = Number(pkg?.hard_floor_discount_pct ?? 0);
  const needsApproval = discount > maxFree;

  const create = useMutation({
    mutationFn: () => createQuote(supabase, { leadId: id, packageId: pkg!.id, listPrice: Number(pkg!.list_price), discountPct: discount, gstPct: Number(pkg!.gst_pct), notes: notes || undefined }),
    onSuccess: (q) => {
      setActiveQuoteId(q.id);
      qc.invalidateQueries({ queryKey: ['lead-quotes', id] });
      qc.invalidateQueries({ queryKey: ['lead-timeline', id] });
    },
    onError: (e) => Alert.alert('Could not create quote', toAppError(e).message),
  });

  const close = useMutation({
    mutationFn: () => closeDeal(supabase, activeQuoteId!, mode),
    onSuccess: (deal) => {
      for (const key of [['lead', id], ['lead-deals', id], ['lead-timeline', id], ['kpis'], ['leads']]) qc.invalidateQueries({ queryKey: key });
      router.replace(`/deal/${deal.id}`);
    },
    onError: (e) => Alert.alert('Could not close the deal', toAppError(e).message),
  });

  if (lead.isLoading || packages.isLoading) return <View className="flex-1 bg-background"><Header title="Quote" /><Loading /></View>;

  // ---- an existing quote: show status and close ----
  const q = existing.data;
  if (activeQuoteId && q) {
    const closable = ['approved', 'sent', 'accepted', 'draft'].includes(q.status);
    return (
      <View className="flex-1 bg-background">
        <Header title={`Quote ${q.quote_no}`} subtitle={lead.data?.business_name} />
        <ScrollView contentContainerClassName="gap-4 p-4 pb-32">
          <Card>
            <View className="flex-row items-center gap-2">
              <Text weight="semibold" className="flex-1 text-base">{(q.package as { name?: string } | null)?.name}</Text>
              <Badge label={q.status.replace('_', ' ')} tone={q.status === 'pending_approval' ? 'warning' : q.status === 'rejected' ? 'danger' : 'success'} />
            </View>
            <Totals rows={[
              ['List price', formatINR(Number(q.list_price))],
              [`Discount (${formatPercent(Number(q.discount_pct), 1)})`, `− ${formatINR(Number(q.discount_amount))}`],
              ['Net', formatINR(Number(q.net_price))],
              [`GST ${q.gst_pct}%`, formatINR(Number(q.total_amount) - Number(q.net_price))],
            ]} total={formatINR(Number(q.total_amount))} />
          </Card>

          {q.status === 'pending_approval' && (
            <View className="flex-row gap-3 rounded-card bg-warning-soft p-4">
              <Clock3 size={20} color={colors.warning} />
              <Text className="flex-1 text-sm text-warning">Waiting for your manager to approve the {q.discount_pct}% discount. You’ll get a notification — this screen updates automatically.</Text>
            </View>
          )}
          {q.status === 'rejected' && (
            <View className="gap-3 rounded-card bg-danger-soft p-4">
              <Text className="text-sm text-danger">The discount was not approved. Build a new quote with a lower discount.</Text>
              <Button label="New quote" variant="outline" onPress={() => setActiveQuoteId(undefined)} />
            </View>
          )}

          {closable && (
            <>
              <Text weight="semibold">How will the customer pay?</Text>
              <View className="gap-2">
                {MODES.map(({ value, label, hint, Icon }) => (
                  <Pressable
                    key={value}
                    onPress={() => setMode(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: mode === value }}
                    className={`min-h-tap flex-row items-center gap-3 rounded-card border p-4 ${mode === value ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
                  >
                    <Icon size={20} color={mode === value ? colors.primaryText : colors.textMuted} />
                    <View className="flex-1">
                      <Text weight="semibold" className={mode === value ? 'text-primary-text' : ''}>{label}</Text>
                      <Text className="text-xs text-text-muted">{hint}</Text>
                    </View>
                    {mode === value ? <Check size={18} color={colors.primaryText} /> : null}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
        {closable && (
          <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
            <Button label="Close deal" variant="accent" loading={close.isPending} onPress={() => close.mutate()} />
          </View>
        )}
      </View>
    );
  }

  // ---- new quote ----
  return (
    <View className="flex-1 bg-background">
      <Header title="Build a quote" subtitle={lead.data?.business_name} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-32" keyboardShouldPersistTaps="handled">
        <Text weight="semibold">Package</Text>
        <View className="gap-2">
          {(packages.data ?? []).map((p) => {
            const on = p.id === pkgId;
            const features = (p.features as string[] | null) ?? [];
            return (
              <Pressable
                key={p.id}
                onPress={() => { setPkgId(p.id); setDiscount(0); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                className={`rounded-card border p-4 ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
              >
                <View className="flex-row items-center gap-2">
                  <Text weight="semibold" className={`flex-1 text-base ${on ? 'text-primary-text' : ''}`}>{p.name}</Text>
                  <Text weight="bold" className="text-base">{formatINR(Number(p.list_price))}</Text>
                </View>
                <Text className="text-xs text-text-muted">{p.tenure_months} months · {p.description}</Text>
                {on && features.length ? <Text className="mt-2 text-xs text-text-muted">✓ {features.join('  ✓ ')}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {pkg && calc && (
          <Card>
            <View className="flex-row items-center">
              <Text weight="semibold" className="flex-1">Discount</Text>
              <Pressable onPress={() => setDiscount((d) => Math.max(0, d - 1))} className="size-11 items-center justify-center rounded-full border border-border" accessibilityLabel="Decrease discount" accessibilityRole="button">
                <Minus size={18} color={colors.text} />
              </Pressable>
              <Text weight="bold" className="w-16 text-center text-xl">{discount}%</Text>
              <Pressable onPress={() => setDiscount((d) => Math.min(hardCap, d + 1))} className="size-11 items-center justify-center rounded-full border border-border" accessibilityLabel="Increase discount" accessibilityRole="button">
                <Plus size={18} color={colors.text} />
              </Pressable>
            </View>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
              <View className="h-2" style={{ width: `${(discount / Math.max(hardCap, 1)) * 100}%`, backgroundColor: needsApproval ? colors.warning : colors.accent }} />
            </View>
            <Text className="mt-1 text-xs text-text-muted">Up to {maxFree}% without approval · max {hardCap}%</Text>
            {needsApproval ? (
              <View className="mt-3 flex-row gap-2 rounded-sm bg-warning-soft p-3">
                <ShieldAlert size={16} color={colors.warning} />
                <Text className="flex-1 text-xs text-warning">Above {maxFree}% needs your manager’s approval before you can close.</Text>
              </View>
            ) : null}
            <Totals rows={[
              ['List price', formatINR(calc.list)],
              ['Discount', `− ${formatINR(calc.disc, { decimals: 2 })}`],
              ['Taxable value', formatINR(calc.net, { decimals: 2 })],
              ...(intra
                ? ([[`CGST ${Number(pkg.gst_pct) / 2}%`, formatINR(calc.cgst, { decimals: 2 })], [`SGST ${Number(pkg.gst_pct) / 2}%`, formatINR(calc.sgst, { decimals: 2 })]] as [string, string][])
                : ([[`IGST ${pkg.gst_pct}%`, formatINR(calc.igst, { decimals: 2 })]] as [string, string][])),
            ]} total={formatINR(calc.total, { decimals: 2 })} />
          </Card>
        )}
        <Field label="Notes for the customer" value={notes} onChangeText={setNotes} multiline maxLength={500} />
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-8 pt-3">
        <Button label={needsApproval ? 'Send for approval' : 'Create quote'} disabled={!pkg} loading={create.isPending} onPress={() => create.mutate()} />
      </View>
    </View>
  );
}

function Totals({ rows, total }: { rows: [string, string][]; total: string }) {
  return (
    <View className="mt-4 gap-1.5 border-t border-border pt-3">
      {rows.map(([k, v]) => (
        <View key={k} className="flex-row justify-between">
          <Text className="text-sm text-text-muted">{k}</Text>
          <Text className="text-sm">{v}</Text>
        </View>
      ))}
      <View className="mt-1 flex-row justify-between border-t border-border pt-2">
        <Text weight="semibold">Total</Text>
        <Text weight="bold" className="text-base">{total}</Text>
      </View>
    </View>
  );
}
