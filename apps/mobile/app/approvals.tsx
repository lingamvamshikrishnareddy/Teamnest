import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react-native';
import { decideApproval, getApprovalsInbox, toAppError } from '@teamnest/api-client';
import { formatINR, formatRelative } from '@teamnest/ui';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { EmptyState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/providers/theme';

const TYPE_LABEL: Record<string, string> = {
  leave: 'Leave', discount: 'Discount', reimbursement: 'Reimbursement', request: 'Request', incentive: 'Incentive', regularization: 'Punch correction', profile_change: 'Profile change', payroll: 'Payroll',
};

export default function Approvals() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['approvals', 'inbox'], queryFn: () => getApprovalsInbox(supabase) });
  const [filter, setFilter] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; approve: boolean; title: string } | null>(null);
  const [comment, setComment] = useState('');

  const decide = useMutation({
    mutationFn: () => decideApproval(supabase, deciding!.id, deciding!.approve, comment || undefined),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setDeciding(null);
      setComment('');
      if (a.status === 'pending') Alert.alert('Approved', 'Moved to the next approver in the chain.');
    },
    onError: (e) => Alert.alert('Could not decide', toAppError(e).message),
  });

  const rows = (q.data ?? []).filter((r) => !filter || r.type === filter);
  const types = [...new Set((q.data ?? []).map((r) => r.type).filter(Boolean))] as string[];

  return (
    <View className="flex-1 bg-background">
      <Header title="Approvals" subtitle={`${q.data?.length ?? 0} waiting`} />
      {q.isLoading ? <Loading /> : (
        <ScrollView contentContainerClassName="gap-3 p-4 pb-16" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
          {types.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <Chip label="All" active={!filter} onPress={() => setFilter(null)} />
              {types.map((ty) => <Chip key={ty} label={TYPE_LABEL[ty] ?? ty} active={filter === ty} onPress={() => setFilter(ty)} />)}
            </ScrollView>
          ) : null}
          {!rows.length ? <EmptyState icon={CheckCheck} title="You’re all caught up" body="New leave, discount and expense requests from your team land here." /> : null}
          {rows.map((r) => (
            <Card key={r.id} className="gap-3">
              <View className="flex-row items-center gap-3">
                <Avatar name={r.requester_name ?? 'Anonymous'} src={r.requester_avatar} size={40} />
                <View className="flex-1">
                  <Text weight="semibold">{r.requester_name ?? 'Anonymous'}</Text>
                  <Text className="text-xs text-text-muted">{r.created_at ? formatRelative(r.created_at) : ''}{(r.total_steps ?? 1) > 1 ? ` · step ${r.current_step}/${r.total_steps}` : ''}</Text>
                </View>
                <Badge label={TYPE_LABEL[r.type ?? ''] ?? r.type ?? ''} tone="primary" />
              </View>
              <Text weight="medium">{r.title}</Text>
              {r.amount ? <Text className="text-sm text-text-muted">{formatINR(Number(r.amount))}</Text> : null}
              {r.due_at && new Date(r.due_at) < new Date() ? <Text className="text-xs text-danger">Overdue (SLA {formatRelative(r.due_at)})</Text> : null}
              <View className="flex-row gap-2">
                <Button label="Reject" variant="outline" className="flex-1" onPress={() => setDeciding({ id: r.id!, approve: false, title: r.title ?? '' })} />
                <Button label="Approve" variant="accent" className="flex-1" onPress={() => setDeciding({ id: r.id!, approve: true, title: r.title ?? '' })} />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
      <Sheet visible={!!deciding} title={deciding?.approve ? 'Approve' : 'Reject'} onClose={() => setDeciding(null)}
        footer={<Button label={deciding?.approve ? 'Approve' : 'Reject'} variant={deciding?.approve ? 'accent' : 'danger'} loading={decide.isPending} onPress={() => decide.mutate()} />}>
        <Text>{deciding?.title}</Text>
        <Field label={deciding?.approve ? 'Comment (optional)' : 'Reason'} value={comment} onChangeText={setComment} multiline maxLength={300} />
      </Sheet>
    </View>
  );
}
