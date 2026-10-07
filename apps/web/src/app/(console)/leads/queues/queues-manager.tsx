'use client';

import { useState } from 'react';
import { Pencil, Plus, Shuffle, Trash2 } from 'lucide-react';
import { autoAssignQueue } from '@teamnest/api-client';
import type { LeadQueue, QueueRule } from '@teamnest/types';
import { formatNumber } from '@teamnest/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldRow, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Count = { queue_id: string; total: number; unassigned: number };
type Leaf = { field: string; op: string; value?: string };

const FIELDS = ['status', 'segment', 'tag', 'priority_score', 'rating', 'city', 'pincode', 'category', 'source', 'owner_id', 'last_outcome_code', 'last_contacted_at', 'next_follow_up_at', 'expires_at', 'current_package_id'];
const OPS = [
  ['eq', 'is'], ['neq', 'is not'], ['in', 'is any of'], ['not_in', 'is none of'], ['gte', '≥'], ['lte', '≤'], ['gt', '>'], ['lt', '<'],
  ['is_null', 'is empty'], ['not_null', 'is set'], ['contains', 'contains'], ['today', 'is today'],
  ['within_next_days', 'within next N days'], ['within_last_days', 'within last N days'], ['older_than_days', 'older than N days'],
];
const NO_VALUE = new Set(['is_null', 'not_null', 'today']);

function toLeaves(rules: unknown): { mode: 'all' | 'any'; leaves: Leaf[] } {
  const r = (rules ?? {}) as { all?: QueueRule[]; any?: QueueRule[] };
  const mode = r.any ? 'any' : 'all';
  const list = (r.any ?? r.all ?? []) as Array<{ field?: string; op?: string; value?: unknown }>;
  return { mode, leaves: list.filter((x) => x.field).map((x) => ({ field: x.field!, op: x.op!, value: Array.isArray(x.value) ? x.value.join(', ') : x.value === undefined ? '' : String(x.value) })) };
}

function fromLeaves(mode: 'all' | 'any', leaves: Leaf[]) {
  return {
    [mode]: leaves.map((l) => {
      if (NO_VALUE.has(l.op)) return { field: l.field, op: l.op };
      if (l.op === 'in' || l.op === 'not_in') return { field: l.field, op: l.op, value: (l.value ?? '').split(',').map((s) => s.trim()).filter(Boolean) };
      const n = Number(l.value);
      return { field: l.field, op: l.op, value: l.value !== '' && !Number.isNaN(n) && /days|gte|lte|gt|lt/.test(l.op) ? n : l.value };
    }),
  };
}

export function QueuesManager({ queues, counts, canEdit }: { queues: LeadQueue[]; counts: Count[]; canEdit: boolean }) {
  const { run, busy } = useAction();
  const byId = Object.fromEntries(counts.map((c) => [c.queue_id, c]));
  const [editing, setEditing] = useState<Partial<LeadQueue> | null>(null);
  const [rules, setRules] = useState<{ mode: 'all' | 'any'; leaves: Leaf[] }>({ mode: 'all', leaves: [] });
  const [assignFor, setAssignFor] = useState<LeadQueue | null>(null);
  const [strategy, setStrategy] = useState('round_robin');

  const openEdit = (q?: LeadQueue) => {
    setEditing(q ?? { code: '', name: '', description: '', priority: 100, color: 'blue', assignment_strategy: 'manual', is_active: true });
    setRules(toLeaves(q?.rules));
  };

  const save = async () => {
    const payload = { ...editing, rules: fromLeaves(rules.mode, rules.leaves) } as LeadQueue;
    const supabase = getBrowserClient();
    const r = await run('save', async () => {
      if (payload.id) {
        const { error } = await supabase.from('lead_queues').update({ name: payload.name, description: payload.description, rules: payload.rules, priority: payload.priority, assignment_strategy: payload.assignment_strategy, is_active: payload.is_active, color: payload.color }).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lead_queues').insert({ code: payload.code || payload.name!.toLowerCase().replace(/\W+/g, '_'), name: payload.name!, description: payload.description, rules: payload.rules, priority: payload.priority, assignment_strategy: payload.assignment_strategy, color: payload.color });
        if (error) throw error;
      }
      return true;
    }, 'Queue saved');
    if (r) setEditing(null);
  };

  const remove = (q: LeadQueue) => run('del', async () => { const { error } = await getBrowserClient().from('lead_queues').update({ is_active: false }).eq('id', q.id); if (error) throw error; return true; }, `${q.name} deactivated`);

  return (
    <>
      {canEdit && <div className="mb-4 flex justify-end"><Button onClick={() => openEdit()}><Plus /> New queue</Button></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q) => {
          const c = byId[q.id];
          const { mode, leaves } = toLeaves(q.rules);
          return (
            <Card key={q.id} className={`flex flex-col p-5 ${q.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{q.name}</h3>
                  <p className="text-sm text-text-muted">{q.description}</p>
                </div>
                <Badge tone={q.is_active ? 'primary' : 'neutral'}>P{q.priority}</Badge>
              </div>
              <div className="mt-4 flex gap-6">
                <div><div className="text-2xl font-bold tabular-nums">{formatNumber(Number(c?.total ?? 0))}</div><div className="text-xs text-text-muted">leads</div></div>
                <div><div className="text-2xl font-bold tabular-nums text-highlight-text">{formatNumber(Number(c?.unassigned ?? 0))}</div><div className="text-xs text-text-muted">unassigned</div></div>
              </div>
              <ul className="mt-3 flex-1 space-y-1 text-xs text-text-muted">
                {leaves.map((l, i) => <li key={i}><code className="rounded-xs bg-surface-muted px-1">{l.field}</code> {OPS.find((o) => o[0] === l.op)?.[1]} {l.value}{i < leaves.length - 1 ? <span className="ml-1 font-semibold uppercase">{mode === 'all' ? 'and' : 'or'}</span> : null}</li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="soft" disabled={!Number(c?.unassigned)} onClick={() => { setAssignFor(q); setStrategy(q.assignment_strategy === 'manual' ? 'round_robin' : q.assignment_strategy); }}><Shuffle /> Auto-assign</Button>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil /> Edit</Button>}
                {canEdit && q.is_active && <Button size="sm" variant="ghost" onClick={() => remove(q)} aria-label={`Deactivate ${q.name}`}><Trash2 /></Button>}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent title={`Auto-assign · ${assignFor?.name ?? ''}`} description="Distributes unassigned leads to people in your team who are working today. Anyone on leave, a holiday or off-shift is skipped.">
          <FieldRow label="Strategy" htmlFor="strategy">
            <Select id="strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value="round_robin">Round robin (even spread)</option>
              <option value="territory">Territory (lead’s city / cluster)</option>
              <option value="load_balanced">Load balanced (fewest open leads)</option>
            </Select>
          </FieldRow>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button disabled={busy === 'auto'} onClick={async () => {
              const r = await run('auto', () => autoAssignQueue(getBrowserClient(), assignFor!.id, strategy as 'round_robin'), (rows) => `Assigned ${rows.reduce((a, x) => a + Number(x.assigned), 0)} leads to ${rows.length} people`);
              if (r) setAssignFor(null);
            }}>Assign now</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent wide title={editing?.id ? `Edit ${editing.name}` : 'New queue'}>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2"><FieldRow label="Name" htmlFor="qn"><Input id="qn" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></FieldRow></div>
                <FieldRow label="Priority (lower first)" htmlFor="qp"><Input id="qp" type="number" value={editing.priority ?? 100} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} /></FieldRow>
              </div>
              <FieldRow label="Description" htmlFor="qd"><Textarea id="qd" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="min-h-16" /></FieldRow>
              <FieldRow label="Default assignment" htmlFor="qs">
                <Select id="qs" value={editing.assignment_strategy ?? 'manual'} onChange={(e) => setEditing({ ...editing, assignment_strategy: e.target.value })}>
                  {['manual', 'round_robin', 'territory', 'load_balanced'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Select>
              </FieldRow>
              <div className="rounded-sm border border-border p-3">
                <div className="mb-3 flex items-center gap-2 text-sm">
                  Leads match when
                  <Select value={rules.mode} onChange={(e) => setRules({ ...rules, mode: e.target.value as 'all' | 'any' })} className="h-8 w-auto">
                    <option value="all">all</option><option value="any">any</option>
                  </Select>
                  of these are true:
                </div>
                <div className="space-y-2">
                  {rules.leaves.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Select aria-label="Field" value={l.field} onChange={(e) => setRules({ ...rules, leaves: rules.leaves.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                        {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </Select>
                      <Select aria-label="Operator" value={l.op} onChange={(e) => setRules({ ...rules, leaves: rules.leaves.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>
                        {OPS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </Select>
                      <Input aria-label="Value" disabled={NO_VALUE.has(l.op)} value={l.value ?? ''} placeholder={l.op === 'in' || l.op === 'not_in' ? 'a, b, c' : ''} onChange={(e) => setRules({ ...rules, leaves: rules.leaves.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                      <Button variant="ghost" size="icon" aria-label="Remove condition" onClick={() => setRules({ ...rules, leaves: rules.leaves.filter((_, j) => j !== i) })}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
                <Button variant="link" size="sm" onClick={() => setRules({ ...rules, leaves: [...rules.leaves, { field: 'status', op: 'eq', value: '' }] })}><Plus /> Add condition</Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button disabled={!editing.name || busy === 'save'} onClick={save}>Save queue</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
