'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Tables } from '@teamnest/types';
import { formatDate } from '@teamnest/ui';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, FieldRow, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Policy = Tables<'policies'>;

export function PoliciesAdmin({ policies, acks, people }: { policies: Policy[]; acks: { policy_id: string; policy_version: number; user_id: string }[]; people: { id: string; full_name: string }[] }) {
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const [edit, setEdit] = useState<Partial<Policy> | null>(null);
  const [readers, setReaders] = useState<Policy | null>(null);
  const ackSet = (p: Policy) => new Set(acks.filter((a) => a.policy_id === p.id && a.policy_version === p.version).map((a) => a.user_id));

  const save = (publish: boolean) => run('save', async () => {
    const e = edit!;
    const body = { title: e.title!, category: e.category ?? 'policy', body_md: e.body_md ?? '', requires_ack: !!e.requires_ack, published_at: publish ? new Date().toISOString() : e.published_at ?? null };
    if (e.id) {
      // material edits to a published policy bump the version so people re-acknowledge
      const bump = e.published_at && publish && e.requires_ack;
      const { error } = await supabase.from('policies').update({ ...body, version: bump ? (e.version ?? 1) + 1 : e.version }).eq('id', e.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('policies').insert(body);
      if (error) throw error;
    }
    setEdit(null);
    return true;
  }, publish ? 'Published — employees will see it in the app' : 'Draft saved');

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ category: 'policy', requires_ack: true, body_md: '' })}><Plus /> New</Button></div>
      <DataTable rows={policies} rowKey={(p) => p.id} onRowClick={(p) => setEdit(p)} exportName="policies" columns={[
        { key: 'title', header: 'Title' },
        { key: 'category', header: 'Type', cell: (p) => <Badge tone="primary">{p.category.replace('_', ' ')}</Badge> },
        { key: 'version', header: 'Ver.', align: 'right' },
        { key: 'published_at', header: 'Published', cell: (p) => (p.published_at ? formatDate(p.published_at) : <Badge tone="warning">draft</Badge>) },
        { key: 'read', header: 'Acknowledged', align: 'right', value: (p) => (p.requires_ack ? ackSet(p).size : -1), cell: (p) => (p.requires_ack ? (
          <button type="button" className="font-semibold text-primary-text hover:underline" onClick={(e) => { e.stopPropagation(); setReaders(p); }}>{ackSet(p).size} / {people.length}</button>
        ) : '—') },
      ]} />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent wide title={edit?.id ? 'Edit' : 'New policy / announcement'}>
          {edit && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2"><FieldRow label="Title" htmlFor="pt"><Input id="pt" value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></FieldRow></div>
                <FieldRow label="Type" htmlFor="pc"><Select id="pc" value={edit.category ?? 'policy'} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{['policy', 'announcement', 'update', 'event', 'job_posting'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</Select></FieldRow>
              </div>
              <FieldRow label="Content (Markdown: ## heading, - bullet, **bold**)" htmlFor="pb"><Textarea id="pb" className="min-h-64 font-mono text-xs" value={edit.body_md ?? ''} onChange={(e) => setEdit({ ...edit, body_md: e.target.value })} /></FieldRow>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!edit.requires_ack} onChange={(e) => setEdit({ ...edit, requires_ack: e.target.checked })} /> Employees must acknowledge they’ve read it</label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                <Button variant="outline" disabled={!edit.title || busy === 'save'} onClick={() => save(false)}>Save draft</Button>
                <Button disabled={!edit.title || !edit.body_md || busy === 'save'} onClick={() => save(true)}>{edit.published_at ? 'Republish' : 'Publish'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!readers} onOpenChange={(o) => !o && setReaders(null)}>
        <DialogContent title={`Read receipts · ${readers?.title ?? ''}`} description={`Version ${readers?.version ?? ''}`}>
          {readers && (() => {
            const set = ackSet(readers);
            const pending = people.filter((p) => !set.has(p.id));
            return (
              <div className="space-y-3 text-sm">
                <p><strong>{set.size}</strong> acknowledged · <strong>{pending.length}</strong> pending</p>
                <ul className="max-h-72 space-y-1 overflow-y-auto">{pending.map((p) => <li key={p.id} className="rounded-xs bg-surface-muted px-2 py-1">{p.full_name}</li>)}</ul>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
