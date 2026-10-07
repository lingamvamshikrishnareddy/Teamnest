'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { decideApproval } from '@teamnest/api-client';
import type { ApprovalInboxItem } from '@teamnest/types';
import { formatDateTime, formatINR, formatRelative } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

const TYPE: Record<string, string> = { leave: 'Leave', discount: 'Discount', reimbursement: 'Reimbursement', request: 'Request', incentive: 'Incentive', regularization: 'Punch correction', profile_change: 'Profile change', payroll: 'Payroll' };

type Decided = { id: string; type: string; title: string; amount: number | null; status: string; decided_at: string | null };

export function ApprovalsInbox({ pending, decided }: { pending: ApprovalInboxItem[]; decided: Decided[] }) {
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<{ ids: string[]; approve: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const overdue = pending.filter((p) => p.due_at && new Date(p.due_at) < new Date()).length;

  const decide = async () => {
    if (!dialog) return;
    const supabase = getBrowserClient();
    await run('decide', async () => {
      for (const id of dialog.ids) await decideApproval(supabase, id, dialog.approve, comment || undefined);
      return dialog.ids.length;
    }, (n) => `${n} request${n === 1 ? '' : 's'} ${dialog.approve ? 'approved' : 'rejected'}`);
    setDialog(null);
    setComment('');
  };

  return (
    <>
      <SummaryChips items={[
        { label: 'Waiting on you', value: String(pending.length), tone: 'primary' },
        { label: 'Past SLA', value: String(overdue), tone: overdue ? 'danger' : 'neutral' },
        ...Object.entries(pending.reduce<Record<string, number>>((a, p) => ({ ...a, [p.type ?? '']: (a[p.type ?? ''] ?? 0) + 1 }), {})).map(([k, v]) => ({ label: TYPE[k] ?? k, value: String(v) })),
      ]} />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending <Badge tone="highlight">{pending.length}</Badge></TabsTrigger>
          <TabsTrigger value="decided">Recently decided</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <DataTable
            rows={pending}
            rowKey={(r) => r.id!}
            selectable
            exportName="approvals-pending"
            selectionActions={(ids, clear) => (
              <>
                <Button size="sm" variant="accent" onClick={() => { setDialog({ ids, approve: true }); clear(); }}><Check /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => { setDialog({ ids, approve: false }); clear(); }}><X /> Reject</Button>
              </>
            )}
            columns={[
              { key: 'requester', header: 'Requested by', value: (r) => r.requester_name ?? 'Anonymous', cell: (r) => (
                <span className="flex items-center gap-2"><Avatar name={r.requester_name ?? 'Anonymous'} src={r.requester_avatar} size={28} /> {r.requester_name ?? 'Anonymous'}</span>
              ) },
              { key: 'type', header: 'Type', value: (r) => TYPE[r.type ?? ''] ?? r.type, cell: (r) => <Badge tone="primary">{TYPE[r.type ?? ''] ?? r.type}</Badge> },
              { key: 'title', header: 'Request', value: (r) => r.title },
              { key: 'amount', header: 'Amount', align: 'right', value: (r) => (r.amount == null ? null : Number(r.amount)), cell: (r) => (r.amount == null ? '—' : formatINR(Number(r.amount))) },
              { key: 'step', header: 'Step', align: 'center', value: (r) => `${r.current_step}/${r.total_steps}`, hideOnMobile: true },
              { key: 'created_at', header: 'Received', value: (r) => r.created_at, cell: (r) => (r.created_at ? formatRelative(r.created_at) : '') },
              { key: 'due', header: 'SLA', value: (r) => r.due_at, cell: (r) => (r.due_at ? <span className={new Date(r.due_at) < new Date() ? 'font-semibold text-danger' : 'text-text-muted'}>{formatRelative(r.due_at)}</span> : '—'), hideOnMobile: true },
              { key: 'actions', header: '', sortable: false, cell: (r) => (
                <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="accent" onClick={() => setDialog({ ids: [r.id!], approve: true })} aria-label={`Approve ${r.title}`}><Check /></Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ ids: [r.id!], approve: false })} aria-label={`Reject ${r.title}`}><X /></Button>
                </span>
              ) },
            ]}
            empty="You’re all caught up."
          />
        </TabsContent>
        <TabsContent value="decided">
          <DataTable
            rows={decided}
            rowKey={(r) => r.id}
            exportName="approvals-decided"
            columns={[
              { key: 'type', header: 'Type', value: (r) => TYPE[r.type] ?? r.type },
              { key: 'title', header: 'Request' },
              { key: 'amount', header: 'Amount', align: 'right', value: (r) => r.amount, cell: (r) => (r.amount == null ? '—' : formatINR(Number(r.amount))) },
              { key: 'status', header: 'Decision', cell: (r) => <Badge tone={r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge> },
              { key: 'decided_at', header: 'Decided', cell: (r) => (r.decided_at ? formatDateTime(r.decided_at) : '') },
            ]}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={`${dialog?.approve ? 'Approve' : 'Reject'} ${dialog?.ids.length ?? 0} request(s)`} description="The requester is notified with your comment.">
          <Textarea placeholder={dialog?.approve ? 'Comment (optional)' : 'Reason for rejecting'} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} aria-label="Comment" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant={dialog?.approve ? 'accent' : 'danger'} disabled={busy === 'decide' || (!dialog?.approve && !comment.trim())} onClick={decide}>
              {dialog?.approve ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
