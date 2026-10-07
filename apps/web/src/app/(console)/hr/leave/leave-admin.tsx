'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Tables } from '@teamnest/types';
import { formatDate } from '@teamnest/ui';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, FieldRow } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Req = { id: string; name: string; type: string; from: string; to: string; days: number; status: string; reason: string; applied: string };
type Bal = { userId: string; name: string; typeId: string; balance: number; used: number };

export function LeaveAdmin({ requests, types, balances, holidays }: { requests: Req[]; types: Tables<'leave_types'>[]; balances: Bal[]; holidays: Tables<'holidays'>[] }) {
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const [editType, setEditType] = useState<Tables<'leave_types'> | null>(null);
  const [holiday, setHoliday] = useState({ day: '', name: '', city: '', optional: false });

  const people = [...new Map(balances.map((b) => [b.userId, b.name])).entries()].map(([id, name]) => ({ id, name }));
  const accruing = types.filter((t) => balances.some((b) => b.typeId === t.id));

  return (
    <Tabs defaultValue="requests">
      <TabsList className="flex-wrap">
        <TabsTrigger value="requests">Requests</TabsTrigger>
        <TabsTrigger value="balances">Balances</TabsTrigger>
        <TabsTrigger value="types">Leave types</TabsTrigger>
        <TabsTrigger value="holidays">Holidays</TabsTrigger>
      </TabsList>

      <TabsContent value="requests">
        <DataTable rows={requests} rowKey={(r) => r.id} exportName="leave-requests" columns={[
          { key: 'name', header: 'Employee' }, { key: 'type', header: 'Type' },
          { key: 'from', header: 'From', cell: (r) => formatDate(r.from) }, { key: 'to', header: 'To', cell: (r) => formatDate(r.to) },
          { key: 'days', header: 'Days', align: 'right' },
          { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : r.status === 'rejected' ? 'danger' : 'neutral'}>{r.status}</Badge> },
          { key: 'reason', header: 'Reason', hideOnMobile: true }, { key: 'applied', header: 'Applied', cell: (r) => formatDate(r.applied), hideOnMobile: true },
        ]} />
        <p className="mt-2 text-xs text-text-muted">Pending requests are decided from the Approvals inbox by the employee’s manager (and HR for leave over 3 days).</p>
      </TabsContent>

      <TabsContent value="balances">
        <DataTable rows={people} rowKey={(p) => p.id} exportName="leave-balances" columns={[
          { key: 'name', header: 'Employee' },
          ...accruing.map((t) => ({ key: t.id, header: t.code, align: 'right' as const, value: (p: { id: string }) => balances.find((b) => b.userId === p.id && b.typeId === t.id)?.balance ?? 0 })),
        ]} />
        <div className="mt-3 flex justify-end">
          <Button variant="outline" disabled={busy === 'accrue'} onClick={() => confirm('Run this month’s leave accrual for everyone?') && run('accrue', async () => { const { data, error } = await supabase.rpc('accrue_leave'); if (error) throw error; return Number(data); }, (n) => `Accrual added to ${n} balances`)}>Run monthly accrual</Button>
        </div>
      </TabsContent>

      <TabsContent value="types">
        <DataTable rows={types} rowKey={(t) => t.id} onRowClick={(t) => setEditType(t)} columns={[
          { key: 'code', header: 'Code' }, { key: 'name', header: 'Name' },
          { key: 'annual_quota', header: 'Days / year', align: 'right' }, { key: 'accrual', header: 'Accrual' },
          { key: 'carry_forward_max', header: 'Carry forward', align: 'right' },
          { key: 'min_notice_days', header: 'Notice days', align: 'right' },
          { key: 'is_paid', header: 'Paid', value: (t) => (t.is_paid ? 'Yes' : 'No') },
          { key: 'is_active', header: 'Active', cell: (t) => <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'Active' : 'Off'}</Badge> },
        ]} />
      </TabsContent>

      <TabsContent value="holidays">
        <div className="mb-4 grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-5">
          <Input type="date" aria-label="Date" value={holiday.day} onChange={(e) => setHoliday({ ...holiday, day: e.target.value })} />
          <Input placeholder="Holiday name" aria-label="Name" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} className="sm:col-span-2" />
          <Input placeholder="City (empty = all)" aria-label="City" value={holiday.city} onChange={(e) => setHoliday({ ...holiday, city: e.target.value })} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={holiday.optional} onChange={(e) => setHoliday({ ...holiday, optional: e.target.checked })} /> Optional</label>
            <Button size="sm" disabled={!holiday.day || !holiday.name || busy === 'h'} onClick={() => run('h', async () => { const { error } = await supabase.from('holidays').insert({ day: holiday.day, name: holiday.name, city: holiday.city || null, is_optional: holiday.optional }); if (error) throw error; setHoliday({ day: '', name: '', city: '', optional: false }); return true; }, 'Holiday added')}><Plus /> Add</Button>
          </div>
        </div>
        <DataTable rows={holidays} rowKey={(h) => h.id} exportName="holidays" columns={[
          { key: 'day', header: 'Date', cell: (h) => formatDate(h.day) }, { key: 'name', header: 'Holiday' }, { key: 'city', header: 'City', value: (h) => h.city ?? 'All cities' },
          { key: 'is_optional', header: 'Type', value: (h) => (h.is_optional ? 'Optional' : 'Mandatory') },
          { key: 'x', header: '', sortable: false, cell: (h) => <Button size="sm" variant="ghost" aria-label={`Delete ${h.name}`} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${h.name}?`)) run('hd', async () => { const { error } = await supabase.from('holidays').delete().eq('id', h.id); if (error) throw error; return true; }, 'Holiday removed'); }}><Trash2 /></Button> },
        ]} />
      </TabsContent>

      <Dialog open={!!editType} onOpenChange={(o) => !o && setEditType(null)}>
        <DialogContent title={`Edit ${editType?.name ?? ''}`}>
          {editType && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Name" htmlFor="tn"><Input id="tn" value={editType.name} onChange={(e) => setEditType({ ...editType, name: e.target.value })} /></FieldRow>
              <FieldRow label="Days per year" htmlFor="tq"><Input id="tq" type="number" step="0.5" value={editType.annual_quota} onChange={(e) => setEditType({ ...editType, annual_quota: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="Carry forward max" htmlFor="tc"><Input id="tc" type="number" step="0.5" value={editType.carry_forward_max} onChange={(e) => setEditType({ ...editType, carry_forward_max: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="Notice (days)" htmlFor="tnd"><Input id="tnd" type="number" value={editType.min_notice_days} onChange={(e) => setEditType({ ...editType, min_notice_days: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="Max consecutive days" htmlFor="tmc"><Input id="tmc" type="number" value={editType.max_consecutive_days ?? ''} onChange={(e) => setEditType({ ...editType, max_consecutive_days: e.target.value ? Number(e.target.value) : null })} /></FieldRow>
              <div className="flex items-end gap-4 text-sm">
                <label className="flex items-center gap-1.5"><Checkbox checked={editType.allow_half_day} onChange={(e) => setEditType({ ...editType, allow_half_day: e.target.checked })} /> Half day</label>
                <label className="flex items-center gap-1.5"><Checkbox checked={editType.is_active} onChange={(e) => setEditType({ ...editType, is_active: e.target.checked })} /> Active</label>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" onClick={() => setEditType(null)}>Cancel</Button>
                <Button disabled={busy === 't'} onClick={() => run('t', async () => {
                  const { error } = await supabase.from('leave_types').update({ name: editType.name, annual_quota: editType.annual_quota, carry_forward_max: editType.carry_forward_max, min_notice_days: editType.min_notice_days, max_consecutive_days: editType.max_consecutive_days, allow_half_day: editType.allow_half_day, is_active: editType.is_active }).eq('id', editType.id);
                  if (error) throw error;
                  setEditType(null);
                  return true;
                }, 'Leave type saved')}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
