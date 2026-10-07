import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, CheckCircle2, ChevronRight } from 'lucide-react-native';
import { acknowledgePolicy, listPolicies, toAppError } from '@teamnest/api-client';
import { formatDate } from '@teamnest/ui';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

/** Minimal markdown: ## headings, - bullets, **bold**. */
function Markdown({ text }: { text: string }) {
  return (
    <View className="gap-2">
      {text.split('\n').filter((l) => l.trim()).map((line, i) => {
        if (line.startsWith('## ')) return <Text key={i} weight="semibold" className="mt-2 text-base">{line.slice(3)}</Text>;
        const bullet = line.startsWith('- ');
        const parts = (bullet ? line.slice(2) : line).split(/\*\*(.+?)\*\*/g);
        return (
          <Text key={i} className="text-sm leading-6">
            {bullet ? '•  ' : ''}
            {parts.map((p, j) => (j % 2 ? <Text key={j} weight="semibold" className="text-sm">{p}</Text> : p.replace(/\*(.+?)\*/g, '$1')))}
          </Text>
        );
      })}
    </View>
  );
}

export default function Policies() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const q = useQuery({ queryKey: ['policies', userId], queryFn: () => listPolicies(supabase, userId), enabled: !!userId });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = q.data?.find((p) => p.id === openId);
  const ack = useMutation({
    mutationFn: () => acknowledgePolicy(supabase, userId, open!.id, open!.version),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); setOpenId(null); },
    onError: (e) => Alert.alert('Could not acknowledge', toAppError(e).message),
  });

  if (q.isLoading) return <View className="flex-1 bg-background"><Header title={t('work.policies')} /><Loading /></View>;
  const pending = (q.data ?? []).filter((p) => p.requires_ack && !p.acknowledged).length;
  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.policies')} subtitle={pending ? `${pending} to acknowledge` : undefined} />
      <ScrollView contentContainerClassName="p-4 pb-16">
        <View className="overflow-hidden rounded-card">
          {(q.data ?? []).map((p) => (
            <Pressable key={p.id} onPress={() => setOpenId(p.id)} className="min-h-tap flex-row items-center gap-3 border-b border-border bg-surface px-4 py-3" accessibilityRole="button">
              {p.acknowledged ? <CheckCircle2 size={20} color={colors.success} /> : <BookOpenCheck size={20} color={p.requires_ack ? colors.highlight : colors.textMuted} />}
              <View className="flex-1">
                <Text weight="semibold" numberOfLines={2}>{p.title}</Text>
                <Text className="text-xs text-text-muted">{p.category.replace('_', ' ')} · {p.published_at ? formatDate(p.published_at) : ''}</Text>
              </View>
              {p.requires_ack && !p.acknowledged ? <Badge label="Action needed" tone="highlight" /> : <ChevronRight size={18} color={colors.textSubtle} />}
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Sheet
        visible={!!open}
        title={open?.title ?? ''}
        onClose={() => setOpenId(null)}
        footer={open?.requires_ack && !open.acknowledged ? <Button label="I have read and understood" loading={ack.isPending} onPress={() => ack.mutate()} /> : undefined}
      >
        {open ? <Markdown text={open.body_md} /> : null}
        {open?.acknowledged ? <Text className="text-sm text-success">You acknowledged version {open.version}.</Text> : null}
      </Sheet>
    </View>
  );
}
