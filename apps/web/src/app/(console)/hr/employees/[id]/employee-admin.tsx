'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Eye, FileText, Lock, ShieldCheck, X } from 'lucide-react';
import { signedFileUrl, toAppError } from '@teamnest/api-client';
import { ROLES, ROLE_LABELS } from '@teamnest/types';
import { formatDate, formatINR } from '@teamnest/ui';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldRow, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Sensitive = { is_masked: boolean; bank_name: string | null; bank_ifsc: string | null; bank_account: string | null; pan: string | null; aadhaar: string | null; uan: string | null; annual_ctc: number | null; monthly_gross: number | null };

export function EmployeeAdmin({ employee, docs, teams, managers, shifts, canEditSensitive }: {
  employee: { id: string; userId: string; role: string; status: string; teamId: string | null; managerId: string | null; shiftId: string | null; onboarding: { key: string; label: string; done: boolean }[] };
  docs: { id: string; title: string; status: string; reason: string | null; category: string; created: string; fileId: string | null }[];
  teams: { id: string; name: string }[]; managers: { id: string; full_name: string }[]; shifts: { id: string; name: string }[]; canEditSensitive: boolean;
}) {
  const { run, busy } = useAction();
  const toast = useToast();
  const supabase = getBrowserClient();
  const [sensitive, setSensitive] = useState<Sensitive | null>(null);
  const [form, setForm] = useState({ role: employee.role, status: employee.status, teamId: employee.teamId ?? '', managerId: employee.managerId ?? '', shiftId: employee.shiftId ?? '' });
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', bank_ifsc: '', bank_account: '', pan: '', aadhaar: '', uan: '', annual_ctc: '', monthly_gross: '' });
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null);

  const reveal = async () => {
    const { data, error } = await supabase.rpc('get_employee_sensitive', { p_employee_id: employee.id });
    if (error) return toast({ tone: 'error', title: 'Could not load', body: toAppError(error).message });
    setSensitive((data?.[0] as Sensitive) ?? null);
  };

  const saveJob = () => run('job', async () => {
    const { error } = await supabase.from('users').update({ role: form.role as 'executive', status: form.status as 'active', team_id: form.teamId || null, manager_id: form.managerId || null }).eq('id', employee.userId);
    if (error) throw error;
    const { error: e2 } = await supabase.from('employees').update({ shift_id: form.shiftId || null }).eq('id', employee.id);
    if (e2) throw e2;
    return true;
  }, 'Employment details saved');

  const toggleStep = (key: string) => run(`ob-${key}`, async () => {
    const next = employee.onboarding.map((s) => (s.key === key ? { ...s, done: !s.done } : s));
    const { error } = await supabase.from('employees').update({ onboarding: next }).eq('id', employee.id);
    if (error) throw error;
    return true;
  });

  const saveBank = () => run('bank', async () => {
    const v = (k: keyof typeof bank) => bank[k].trim() || undefined;
    if (bank.pan && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(bank.pan)) throw new Error('PAN format looks wrong (ABCDE1234F)');
    if (bank.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bank.bank_ifsc)) throw new Error('IFSC must be 11 characters (e.g. DEMO0000123)');
    const { error } = await supabase.rpc('set_employee_sensitive', {
      p_employee_id: employee.id, p_bank_name: v('bank_name'), p_bank_ifsc: v('bank_ifsc'), p_bank_account: v('bank_account'), p_pan: v('pan'), p_aadhaar: v('aadhaar'), p_uan: v('uan'),
      p_annual_ctc: bank.annual_ctc ? Number(bank.annual_ctc) : undefined, p_monthly_gross: bank.monthly_gross ? Number(bank.monthly_gross) : undefined,
    });
    if (error) throw error;
    setBankOpen(false);
    setSensitive(null);
    return true;
  }, 'Sensitive details updated (encrypted)');

  const setDoc = (id: string, status: 'verified' | 'rejected', reason?: string) => run(`doc-${id}`, async () => {
    const { error } = await supabase.from('documents').update({ status, rejection_reason: reason ?? null, verified_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    setReject(null);
    return true;
  }, status === 'verified' ? 'Document verified' : 'Document rejected');

  const openDoc = async (fileId: string | null) => {
    if (!fileId) return toast({ tone: 'error', title: 'No file attached' });
    try { window.open(await signedFileUrl(supabase, fileId), '_blank', 'noopener'); } catch (e) { toast({ tone: 'error', title: 'Could not open', body: toAppError(e).message }); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Role, team & shift</CardTitle><CardDescription>Changes are audited.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Role" htmlFor="role"><Select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></FieldRow>
          <FieldRow label="Status" htmlFor="status"><Select id="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['active', 'on_notice', 'inactive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></FieldRow>
          <FieldRow label="Team" htmlFor="team"><Select id="team" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}><option value="">—</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></FieldRow>
          <FieldRow label="Reports to" htmlFor="mgr"><Select id="mgr" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></FieldRow>
          <FieldRow label="Shift" htmlFor="shift"><Select id="shift" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}><option value="">—</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FieldRow>
          <div className="flex items-end justify-end"><Button disabled={busy === 'job'} onClick={saveJob}>Save</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div><CardTitle className="flex items-center gap-2"><Lock className="size-4" /> Bank, ID & salary</CardTitle><CardDescription className="mt-1">Encrypted at rest. Viewing clear values is recorded in the audit log.</CardDescription></div>
          <div className="flex gap-2">
            {!sensitive && <Button variant="outline" size="sm" onClick={reveal}><Eye /> Reveal</Button>}
            {canEditSensitive && <Button size="sm" onClick={() => setBankOpen(true)}><ShieldCheck /> Update</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {sensitive ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {([['Bank', sensitive.bank_name], ['IFSC', sensitive.bank_ifsc], ['Account', sensitive.bank_account], ['PAN', sensitive.pan], ['Aadhaar', sensitive.aadhaar], ['UAN', sensitive.uan],
                ['Annual CTC', sensitive.annual_ctc != null ? formatINR(sensitive.annual_ctc) : null], ['Monthly gross', sensitive.monthly_gross != null ? formatINR(sensitive.monthly_gross) : null]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border py-1"><dt className="text-text-muted">{k}</dt><dd className="font-mono">{v ?? '—'}</dd></div>
              ))}
              {sensitive.is_masked && <p className="text-xs text-text-muted sm:col-span-2">Masked for your role.</p>}
            </dl>
          ) : <p className="text-sm text-text-muted">Hidden. Click “Reveal” when you need it.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Onboarding checklist</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {employee.onboarding.map((s) => (
            <button key={s.key} type="button" disabled={busy === `ob-${s.key}`} onClick={() => toggleStep(s.key)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-muted">
              {s.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-text-subtle" />}{s.label}
            </button>
          ))}
          {!employee.onboarding.length && <p className="text-sm text-text-muted">No checklist.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-border p-3 text-sm">
              <FileText className="size-4 text-text-muted" />
              <div className="flex-1"><div className="font-medium">{d.title}</div><div className="text-xs text-text-muted">{d.category} · {formatDate(d.created)}{d.reason ? ` · ${d.reason}` : ''}</div></div>
              <Badge tone={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}>{d.status}</Badge>
              <Button size="sm" variant="ghost" onClick={() => openDoc(d.fileId)}>View</Button>
              {d.status === 'pending' && (
                <>
                  <Button size="sm" variant="accent" disabled={busy === `doc-${d.id}`} onClick={() => setDoc(d.id, 'verified')}><CheckCircle2 /> Verify</Button>
                  <Button size="sm" variant="outline" onClick={() => setReject({ id: d.id, reason: '' })}><X /> Reject</Button>
                </>
              )}
            </div>
          ))}
          {!docs.length && <p className="text-sm text-text-muted">No documents uploaded.</p>}
        </CardContent>
      </Card>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent wide title="Update sensitive details" description="Leave a field empty to keep the current value. Values are encrypted before they’re stored.">
          <div className="grid gap-4 sm:grid-cols-2">
            {([['bank_name', 'Bank name'], ['bank_ifsc', 'IFSC'], ['bank_account', 'Account number'], ['pan', 'PAN'], ['aadhaar', 'Aadhaar'], ['uan', 'UAN'], ['annual_ctc', 'Annual CTC (₹)'], ['monthly_gross', 'Monthly gross (₹)']] as const).map(([k, label]) => (
              <FieldRow key={k} label={label} htmlFor={k}><Input id={k} autoComplete="off" value={bank[k]} onChange={(e) => setBank({ ...bank, [k]: e.target.value })} inputMode={k.includes('ctc') || k.includes('gross') ? 'numeric' : undefined} /></FieldRow>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button><Button disabled={busy === 'bank'} onClick={saveBank}>Save securely</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reject} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent title="Reject document" description="The employee sees this reason and can re-upload.">
          <Textarea value={reject?.reason ?? ''} onChange={(e) => setReject((r) => r && { ...r, reason: e.target.value })} placeholder="e.g. Image is blurred — please re-upload" aria-label="Reason" />
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" disabled={!reject?.reason.trim()} onClick={() => reject && setDoc(reject.id, 'rejected', reject.reason)}>Reject</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
