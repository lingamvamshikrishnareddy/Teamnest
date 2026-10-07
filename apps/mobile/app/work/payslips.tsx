import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, FileDown, Wallet } from 'lucide-react-native';
import { listPayslips } from '@teamnest/api-client';
import type { PayComponent } from '@teamnest/types';
import { formatINR, formatMonth } from '@teamnest/ui';
import { Card } from '@/components/card';
import { Header } from '@/components/header';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { sharePayslipPdf } from '@/lib/payslip-pdf';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

export default function Payslips() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const userId = context?.user.id ?? '';
  const q = useQuery({ queryKey: ['payslips', userId], queryFn: () => listPayslips(supabase, userId), enabled: !!userId });
  const bank = useQuery({
    queryKey: ['sensitive', context?.employee?.id],
    enabled: !!context?.employee?.id,
    queryFn: async () => (await supabase.rpc('get_employee_sensitive', { p_employee_id: context!.employee!.id })).data?.[0] ?? null,
  });
  const [open, setOpen] = useState<string | null>(null);

  if (q.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.payslips')} /><Loading /></View>;

  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.payslips')} />
      <ScrollView contentContainerClassName="gap-3 p-4 pb-16">
        {!q.data?.length ? <EmptyState icon={Wallet} title="No payslips yet" body="Your payslip appears here once HR publishes it." /> : null}
        {(q.data ?? []).map((p) => {
          const earnings = (p.earnings as unknown as PayComponent[]) ?? [];
          const deductions = (p.deductions as unknown as PayComponent[]) ?? [];
          const expanded = open === p.id;
          return (
            <Card key={p.id}>
              <Pressable onPress={() => setOpen(expanded ? null : p.id)} className="flex-row items-center gap-3" accessibilityRole="button" accessibilityState={{ expanded }}>
                <View className="flex-1">
                  <Text weight="semibold" className="text-base">{formatMonth(p.period_month)}</Text>
                  <Text className="text-xs text-text-muted">{p.paid_days} paid days{Number(p.incentive_amount) ? ` · incl. ${formatINR(Number(p.incentive_amount))} incentive` : ''}</Text>
                </View>
                <Text weight="bold" className="text-base">{formatINR(Number(p.net_pay))}</Text>
                {expanded ? <ChevronUp size={18} color={colors.textMuted} /> : <ChevronDown size={18} color={colors.textMuted} />}
              </Pressable>
              {expanded && (
                <View className="mt-3 gap-3 border-t border-border pt-3">
                  {[['Earnings', earnings, Number(p.gross)], ['Deductions', deductions, Number(p.total_deductions)]].map(([title, items, total]) => (
                    <View key={title as string} className="gap-1">
                      <Text weight="semibold" className="text-sm text-text-muted">{title as string}</Text>
                      {(items as PayComponent[]).filter((c) => c.amount).map((c) => (
                        <View key={c.code} className="flex-row justify-between"><Text className="text-sm">{c.label}</Text><Text className="text-sm">{formatINR(c.amount)}</Text></View>
                      ))}
                      <View className="flex-row justify-between border-t border-border pt-1"><Text weight="semibold" className="text-sm">Total</Text><Text weight="semibold" className="text-sm">{formatINR(total as number)}</Text></View>
                    </View>
                  ))}
                  <Pressable
                    className="min-h-tap flex-row items-center justify-center gap-2 rounded-sm bg-primary-soft"
                    accessibilityRole="button"
                    onPress={() =>
                      sharePayslipPdf({
                        org: context!.organization.legal_name ?? context!.organization.name, name: context!.user.full_name, code: context!.employee?.employee_code ?? '',
                        designation: context!.employee?.designation ?? '', month: p.period_month, paidDays: Number(p.paid_days), lopDays: Number(p.lop_days),
                        earnings, deductions, gross: Number(p.gross), totalDeductions: Number(p.total_deductions), net: Number(p.net_pay),
                        bankMasked: bank.data?.bank_account ? `•••• ${bank.data.bank_account.slice(-4)}` : undefined,
                      }).catch((e) => Alert.alert('Could not create PDF', String(e)))
                    }
                  >
                    <FileDown size={18} color={colors.primaryText} />
                    <Text weight="semibold" className="text-primary-text">Download PDF</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
