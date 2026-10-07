import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Banknote, CheckCircle2, Copy, FileText, Link2, MessageCircle, Receipt, Repeat, Share2 } from 'lucide-react-native';
import {
  createMandate, createPaymentLink, getAmountDue, getDeal, getDealMoney, recordCashPayment, toAppError, whatsappShareUrl, type PaymentLinkResult,
} from '@teamnest/api-client';
import { formatDate, formatDateTime, formatINR } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { ErrorState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { shareInvoicePdf } from '@/lib/invoice-pdf';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useTheme } from '@/providers/theme';

const PAY_TONE: Record<string, BadgeTone> = { success: 'success', failed: 'danger', pending: 'warning', initiated: 'neutral', refunded: 'info' };
const MANDATE_TONE: Record<string, BadgeTone> = { active: 'success', rejected: 'danger', pending_bank: 'warning', initiated: 'neutral', cancelled: 'neutral', paused: 'warning', expired: 'neutral' };

export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { context } = useAuth();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const deal = useQuery({ queryKey: ['deal', id], queryFn: () => getDeal(supabase, id) });
  const money = useQuery({ queryKey: ['deal-money', id], queryFn: () => getDealMoney(supabase, id), refetchInterval: 15_000 });
  const due = useQuery({ queryKey: ['deal-due', id], queryFn: () => getAmountDue(supabase, id), refetchInterval: 15_000 });
  const [link, setLink] = useState<PaymentLinkResult | null>(null);
  const [cash, setCash] = useState('');

  const refresh = () => {
    for (const k of [['deal', id], ['deal-money', id], ['deal-due', id], ['kpis']]) qc.invalidateQueries({ queryKey: k });
  };

  const sendLink = useMutation({ mutationFn: () => createPaymentLink(supabase, id), onSuccess: (r) => { setLink(r); refresh(); }, onError: (e) => Alert.alert('Payment link', toAppError(e).message) });
  const mandate = useMutation({
    mutationFn: () => createMandate(supabase, id),
    onSuccess: (r) => {
      refresh();
      const l = deal.data?.lead as { contact_name?: string; business_name?: string; whatsapp?: string; phone?: string } | null;
      Alert.alert('Auto-pay link ready', 'Share it with the customer to authorise the mandate.', [
        { text: 'Copy', onPress: () => Clipboard.setStringAsync(r.auth_url) },
        { text: 'WhatsApp', onPress: () => Linking.openURL(whatsappShareUrl(l?.whatsapp ?? l?.phone ?? '', `Hello ${l?.contact_name ?? l?.business_name ?? ''}, please authorise auto-pay for your subscription: ${r.auth_url}`)) },
      ]);
    },
    onError: (e) => Alert.alert('Auto-pay', toAppError(e).message),
  });
  const collect = useMutation({
    mutationFn: () => recordCashPayment(supabase, id, Number(cash), 'Collected in the field'),
    onSuccess: () => { setCash(''); refresh(); Alert.alert('Cash recorded', 'A receipt has been issued.'); },
    onError: (e) => Alert.alert('Cash payment', toAppError(e).message),
  });

  if (deal.isLoading) return <View className="flex-1 bg-background"><Header title="Deal" /><Loading /></View>;
  if (!deal.data) return <View className="flex-1 bg-background"><Header title="Deal" /><ErrorState message="Deal not found" onRetry={() => deal.refetch()} /></View>;

  const d = deal.data;
  const lead = d.lead as { id: string; business_name: string; contact_name: string | null; phone: string; whatsapp: string | null; email: string | null; state: string | null } | null;
  const pkg = d.package as { name: string; tenure_months: number } | null;
  const amountDue = due.data ?? 0;
  const payments = money.data?.payments ?? [];
  const mandates = money.data?.mandates ?? [];
  const invoices = money.data?.invoices ?? [];
  const activeMandate = mandates.find((m) => ['active', 'pending_bank', 'initiated'].includes(m.status));
  const org = context?.organization;

  const shareDoc = async (inv: (typeof invoices)[number]) => {
    const bill = (inv.bill_to ?? {}) as { name?: string; address?: string; gstin?: string; phone?: string };
    await shareInvoicePdf({
      kind: inv.kind, number: inv.invoice_no, issuedAt: inv.issued_at,
      org: { name: org?.name ?? '', legalName: org?.legal_name, gstin: org?.gstin },
      billTo: bill, lines: [{ description: `${pkg?.name ?? 'Subscription'} · ${pkg?.tenure_months ?? ''} months`, amount: Number(inv.subtotal) }],
      discount: Number(inv.discount), cgst: Number(inv.cgst), sgst: Number(inv.sgst), igst: Number(inv.igst), total: Number(inv.total),
    }).catch((e) => Alert.alert('Could not share', String(e)));
  };

  const shareReceipt = async (p: (typeof payments)[number]) => {
    const r = (Array.isArray(p.receipt) ? p.receipt[0] : p.receipt) as { receipt_no: string; issued_at: string } | null;
    if (!r) return;
    await shareInvoicePdf({
      kind: 'receipt', number: r.receipt_no, issuedAt: r.issued_at,
      org: { name: org?.name ?? '', legalName: org?.legal_name, gstin: org?.gstin },
      billTo: { name: lead?.business_name, phone: lead?.phone },
      lines: [{ description: `Payment for ${d.deal_no} (${p.method.toUpperCase()})`, amount: Number(p.amount) }],
      total: Number(p.amount),
      paymentNote: `Received on ${formatDateTime(p.paid_at ?? p.created_at)}${p.gateway_ref ? ` · Ref ${p.gateway_ref}` : ''}`,
    }).catch((e) => Alert.alert('Could not share', String(e)));
  };

  return (
    <View className="flex-1 bg-background">
      <Header title={`Deal ${d.deal_no}`} subtitle={lead?.business_name} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-16" keyboardShouldPersistTaps="handled">
        <Card>
          <View className="flex-row items-center gap-2">
            <Text weight="semibold" className="flex-1 text-base">{pkg?.name}</Text>
            <Badge label={d.status.replace('_', ' ')} tone={d.status === 'active' ? 'success' : d.status === 'pending_payment' ? 'warning' : 'neutral'} />
          </View>
          <Text className="text-sm text-text-muted">
            {formatINR(Number(d.contract_value))} + GST · {d.tenure_months} months · {d.payment_mode} · closed {formatDate(d.closed_at)}
          </Text>
          <View className="mt-4 flex-row items-end justify-between rounded-sm bg-surface-muted p-3">
            <View>
              <Text className="text-xs text-text-muted">{d.payment_mode === 'autopay' ? 'Next instalment' : 'Amount due'}</Text>
              <Text weight="bold" className="text-2xl">{formatINR(amountDue, { decimals: 2 })}</Text>
            </View>
            {amountDue === 0 ? (
              <View className="flex-row items-center gap-1"><CheckCircle2 size={16} color={colors.success} /><Text weight="semibold" className="text-success">Paid</Text></View>
            ) : null}
          </View>
        </Card>

        {amountDue > 0 && d.status !== 'cancelled' && (
          <Card className="gap-3">
            <Text weight="semibold" className="text-base">Collect payment</Text>

            {d.payment_mode === 'autopay' && (
              activeMandate ? (
                <View className="flex-row items-center gap-2 rounded-sm bg-surface-muted p-3">
                  <Repeat size={18} color={colors.primaryText} />
                  <Text className="flex-1 text-sm">Auto-pay mandate {activeMandate.umrn ? `· ${activeMandate.umrn}` : ''}</Text>
                  <Badge label={activeMandate.status.replace('_', ' ')} tone={MANDATE_TONE[activeMandate.status] ?? 'neutral'} />
                </View>
              ) : (
                <Button label="Set up auto-pay" icon={<Repeat size={16} color={colors.onPrimary} />} loading={mandate.isPending} onPress={() => mandate.mutate()} />
              )
            )}

            <Button label={link ? 'Payment link ready' : 'Send payment link / UPI QR'} variant={d.payment_mode === 'online' ? 'primary' : 'outline'} icon={<Link2 size={16} color={d.payment_mode === 'online' ? colors.onPrimary : colors.text} />} loading={sendLink.isPending} onPress={() => sendLink.mutate()} />
            {link && (
              <View className="items-center gap-3 rounded-sm bg-surface-muted p-4">
                {link.upi_qr ? (
                  <View className="rounded-sm bg-white p-3"><QRCode value={link.upi_qr} size={170} /></View>
                ) : null}
                <Text className="text-center text-xs text-text-muted">Customer scans with any UPI app, or opens the link. {formatINR(link.amount, { decimals: 2 })}</Text>
                <View className="flex-row gap-2">
                  <Button label="WhatsApp" variant="accent" icon={<MessageCircle size={16} color={colors.onAccent} />} onPress={() => Linking.openURL(whatsappShareUrl(lead?.whatsapp ?? lead?.phone ?? '', link.whatsapp_text ?? link.url))} />
                  <Button label="Copy link" variant="outline" icon={<Copy size={16} color={colors.text} />} onPress={() => Clipboard.setStringAsync(link.url)} />
                </View>
              </View>
            )}

            <View className="gap-2 border-t border-border pt-3">
              <Field label="Cash collected (₹)" keyboardType="decimal-pad" value={cash} onChangeText={(v) => setCash(v.replace(/[^\d.]/g, ''))} placeholder={amountDue.toFixed(2)} hint="A receipt is issued immediately." />
              <Button label="Record cash" variant="outline" icon={<Banknote size={16} color={colors.text} />} disabled={!Number(cash)} loading={collect.isPending} onPress={() => collect.mutate()} />
            </View>
          </Card>
        )}

        <Text weight="semibold" className="text-base">Payments</Text>
        {payments.length === 0 ? <Text className="text-sm text-text-muted">No payments yet.</Text> : payments.map((p) => {
          const r = (Array.isArray(p.receipt) ? p.receipt[0] : p.receipt) as { receipt_no: string } | null;
          return (
            <Card key={p.id}>
              <View className="flex-row items-center gap-2">
                <Receipt size={18} color={colors.textMuted} />
                <Text weight="semibold" className="flex-1">{formatINR(Number(p.amount), { decimals: 2 })} · {p.method.toUpperCase()}</Text>
                <Badge label={p.status} tone={PAY_TONE[p.status] ?? 'neutral'} />
              </View>
              <Text className="mt-1 text-xs text-text-muted">{formatDateTime(p.paid_at ?? p.created_at)}{r ? ` · ${r.receipt_no}` : ''}</Text>
              {p.failure_reason ? <Text className="mt-1 text-xs text-danger">{p.failure_reason}</Text> : null}
              {r ? (
                <Pressable onPress={() => shareReceipt(p)} className="mt-2 flex-row items-center gap-1" accessibilityRole="button">
                  <Share2 size={14} color={colors.primaryText} /><Text weight="semibold" className="text-sm text-primary-text">Share receipt</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}

        <Text weight="semibold" className="text-base">Invoices</Text>
        {invoices.map((inv) => (
          <Pressable key={inv.id} onPress={() => shareDoc(inv)} accessibilityRole="button">
            <Card>
              <View className="flex-row items-center gap-2">
                <FileText size={18} color={colors.primaryText} />
                <Text weight="semibold" className="flex-1">{inv.kind === 'proforma' ? 'Proforma' : 'Tax invoice'} · {inv.invoice_no}</Text>
                <Share2 size={16} color={colors.textMuted} />
              </View>
              <Text className="mt-1 text-xs text-text-muted">{formatINR(Number(inv.total), { decimals: 2 })} · {formatDate(inv.issued_at)}</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
