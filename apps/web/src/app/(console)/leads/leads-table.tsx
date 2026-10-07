'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, Star, UserPlus } from 'lucide-react';
import { assignLeads, getAvailableAssignees, type LeadListItem } from '@teamnest/api-client';
import { formatPhone, formatRelative } from '@teamnest/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, FieldRow, Select, Textarea } from '@/components/ui/form';
import { exportCsv } from '@/lib/export';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

const STATUS_TONE: Record<string, 'primary' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  new: 'primary', contacted: 'info', interested: 'success', meeting_set: 'info', negotiation: 'warning', won: 'success', lost: 'neutral', dnc: 'danger', invalid: 'neutral',
};

export function LeadsTable({ rows, total, page, pageSize, owners, outcomes, search }: {
  rows: LeadListItem[]; total: number; page: number; pageSize: number; owners: { id: string; name: string }[]; outcomes: Record<string, string>; search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [available, setAvailable] = useState<{ user_id: string; full_name: string; open_leads: number }[]>([]);
  const { run, busy } = useAction();
  const nameOf = Object.fromEntries(owners.map((o) => [o.id, o.name]));

  useEffect(() => {
    const id = setTimeout(() => {
      if (q === search) return;
      const next = new URLSearchParams(sp.toString());
      if (q) next.set('q', q); else next.delete('q');
      next.delete('page');
      start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (assignOpen) getAvailableAssignees(getBrowserClient()).then(setAvailable).catch(() => setAvailable([]));
  }, [assignOpen]);

  const go = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set('page', String(p));
    start(() => router.push(`${pathname}?${next}`));
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const doAssign = async () => {
    const n = await run('assign', () => assignLeads(getBrowserClient(), [...selected], assignee, reason || undefined), (c) => `${c} lead${c === 1 ? '' : 's'} assigned to ${nameOf[assignee] ?? 'executive'}`);
    if (n !== undefined) { setSelected(new Set()); setAssignOpen(false); setReason(''); }
  };

  return (
    <div className="rounded-card border border-border/70 bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, lead ID or phone" aria-label="Search leads"
            className="h-9 w-full rounded-sm border border-border bg-surface-muted pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-sm bg-primary-soft px-2 py-1 text-sm text-primary-text">
            <span className="font-semibold">{selected.size} selected</span>
            <Button size="sm" onClick={() => setAssignOpen(true)}><UserPlus /> Assign</Button>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => exportCsv(rows, [
          { header: 'Lead ID', value: (r) => r.lead_code }, { header: 'Business', value: (r) => r.business_name }, { header: 'Phone', value: (r) => r.phone },
          { header: 'Locality', value: (r) => r.locality }, { header: 'City', value: (r) => r.city }, { header: 'Status', value: (r) => r.status },
          { header: 'Owner', value: (r) => (r.owner_id ? nameOf[r.owner_id] : '') }, { header: 'Priority', value: (r) => r.priority_score },
        ], 'leads-page')}><Download /> Export page</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Leads</caption>
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="w-10 px-3 py-2.5"><Checkbox aria-label="Select all on this page" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th className="px-3 py-2.5 text-left">Business</th>
              <th className="hidden px-3 py-2.5 text-left md:table-cell">Location</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="hidden px-3 py-2.5 text-left lg:table-cell">Last outcome</th>
              <th className="px-3 py-2.5 text-left">Owner</th>
              <th className="hidden px-3 py-2.5 text-left md:table-cell">Next follow-up</th>
              <th className="px-3 py-2.5 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={`border-t border-border hover:bg-surface-muted/40 ${selected.has(l.id) ? 'bg-primary-soft/40' : ''}`}>
                <td className="px-3 py-2.5"><Checkbox aria-label={`Select ${l.business_name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                <td className="px-3 py-2.5">
                  <Link href={`/leads/${l.id}`} className="font-semibold hover:text-primary-text hover:underline">{l.business_name}</Link>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {l.lead_code} · {formatPhone(l.phone)}
                    {l.rating != null && <span className="inline-flex items-center gap-0.5"><Star className="size-3 fill-highlight text-highlight" />{Number(l.rating).toFixed(1)}</span>}
                    {l.tag && <Badge tone="highlight">{l.tag}</Badge>}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 text-text-muted md:table-cell">{[l.locality, l.city, l.pincode].filter(Boolean).join(', ')}{l.lat == null ? <Badge tone="warning" className="ml-1">no GPS</Badge> : null}</td>
                <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[l.status] ?? 'neutral'}>{l.status.replace('_', ' ')}</Badge></td>
                <td className="hidden px-3 py-2.5 text-text-muted lg:table-cell">{l.last_outcome_code ? outcomes[l.last_outcome_code] ?? l.last_outcome_code : '—'}{l.last_contacted_at ? <div className="text-xs">{formatRelative(l.last_contacted_at)}</div> : null}</td>
                <td className="px-3 py-2.5">{l.owner_id ? nameOf[l.owner_id] ?? '—' : <Badge tone="warning">Unassigned</Badge>}</td>
                <td className="hidden px-3 py-2.5 md:table-cell">{l.next_follow_up_at ? <span className={new Date(l.next_follow_up_at) < new Date() ? 'text-danger' : ''}>{formatRelative(l.next_follow_up_at)}</span> : '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.priority_score}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-14 text-center text-text-muted">No leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm text-text-muted">
        <span>{total.toLocaleString('en-IN')} leads</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
          <span className="tabular-nums">{page + 1} / {pages}</span>
          <Button variant="ghost" size="icon" className="size-8" disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight /></Button>
        </div>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent title={`Assign ${selected.size} lead(s)`} description="Only people who are available today (not on leave, on shift) are listed.">
          <div className="space-y-4">
            <FieldRow label="Assign to" htmlFor="assignee">
              <Select id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Choose…</option>
                {available.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name} · {a.open_leads} open</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Reason (optional)" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></FieldRow>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button disabled={!assignee || busy === 'assign'} onClick={doAssign}>Assign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
