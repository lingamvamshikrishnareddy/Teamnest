'use client';

import { useState } from 'react';
import type { Tables } from '@teamnest/types';
import { formatDate } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/form';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Row = Tables<'requests'> & { requester: string };

export function Helpdesk({ rows }: { rows: Row[] }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const by = (t: string) => rows.filter((r) => r.type === t && r.status === 'pending').length;
  return (
    <>
      <SummaryChips items={[
        { label: 'Open', value: String(rows.filter((r) => r.status === 'pending').length), tone: 'primary' },
        { label: 'Grievances', value: String(by('grievance')), tone: 'danger' },
        { label: 'Exits', value: String(by('exit')), tone: 'highlight' },
        { label: 'Profile changes', value: String(by('profile_change')) },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => { setOpen(r); setNote(r.resolution ?? ''); }} exportName="requests" columns={[
        { key: 'request_no', header: 'No.' },
        { key: 'type', header: 'Type', cell: (r) => <Badge tone={r.type === 'grievance' ? 'danger' : 'primary'}>{r.type.replace('_', ' ')}</Badge> },
        { key: 'subject', header: 'Subject' },
        { key: 'requester', header: 'From' },
        { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : r.status === 'rejected' ? 'danger' : 'neutral'}>{r.status}</Badge> },
        { key: 'created_at', header: 'Raised', cell: (r) => formatDate(r.created_at) },
      ]} />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent wide title={open ? `${open.request_no} · ${open.subject}` : ''} description={open ? `${open.type.replace('_', ' ')} from ${open.requester}` : ''}>
          {open && (
            <div className="space-y-4 text-sm">
              {open.details && <p className="whitespace-pre-wrap rounded-sm bg-surface-muted p-3">{open.details}</p>}
              {Object.keys(open.payload as object).length > 0 && <pre className="overflow-x-auto rounded-sm bg-surface-muted p-3 text-xs">{JSON.stringify(open.payload, null, 2)}</pre>}
              <Textarea placeholder="Resolution / notes shared with the employee" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Resolution" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
                <Button disabled={busy === 'n'} onClick={() => run('n', async () => { const { error } = await getBrowserClient().from('requests').update({ resolution: note }).eq('id', open.id); if (error) throw error; setOpen(null); return true; }, 'Notes saved')}>Save notes</Button>
              </div>
              {open.status === 'pending' && <p className="text-xs text-text-muted">Approve or reject from the Approvals inbox — the decision is applied automatically (e.g. profile changes update the employee record).</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
