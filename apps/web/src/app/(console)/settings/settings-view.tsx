'use client';

import { useState } from 'react';
import { Plus, Save, UserPlus } from 'lucide-react';
import { toAppError } from '@teamnest/api-client';
import { ROLES, ROLE_LABELS, type AppRole, type Tables } from '@teamnest/types';
import { formatINR, formatRelative } from '@teamnest/ui';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, FieldRow, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type U = { id: string; full_name: string; email: string; role: AppRole; status: string; team_id: string | null; manager_id: string | null; last_seen_at: string | null; mfa_enrolled: boolean };
type Props = {
  month: string; users: U[]; teams: { id: string; name: string; lead_user_id: string | null; territory_id: string | null; is_active: boolean }[];
  territories: { id: string; name: string; code: string; kind: string; parent_id: string | null; pincodes: string[] }[];
  targets: { id: string; user_id: string | null; metric: string; target_value: number; weightage_pct: number }[];
  outcomes: Tables<'outcome_codes'>[]; packages: Tables<'packages'>[]; chains: Tables<'approval_chains'>[]; templates: Tables<'notification_templates'>[];
  settings: { key: string; value: unknown; description: string | null }[];
};

const METRICS = ['revenue', 'deals', 'collections', 'autopay_pct', 'talk_time_min', 'visits'];

export function SettingsView(p: Props) {
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const [invite, setInvite] = useState<Record<string, string> | null>(null);
  const [pkg, setPkg] = useState<Partial<Tables<'packages'>> | null>(null);
  const [oc, setOc] = useState<Tables<'outcome_codes'> | null>(null);
  const [chain, setChain] = useState<(Tables<'approval_chains'> & { stepsText: string; condText: string }) | null>(null);
  const [tpl, setTpl] = useState<Tables<'notification_templates'> | null>(null);
  const [setting, setSetting] = useState<{ key: string; text: string; description: string | null } | null>(null);
  const [tg, setTg] = useState<Record<string, string>>({});
  const nameOf = Object.fromEntries(p.users.map((u) => [u.id, u.full_name]));
  const execs = p.users.filter((u) => u.role === 'executive' && u.status !== 'inactive');
  const tKey = (uid: string, m: string) => `${uid}|${m}`;
  const tVal = (uid: string, m: string) => tg[tKey(uid, m)] ?? String(p.targets.find((t) => t.user_id === uid && t.metric === m)?.target_value ?? '');

  const sendInvite = () => run('invite', async () => {
    const { error, data } = await supabase.functions.invoke('admin-invite-user', { body: invite ?? {} });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      throw new Error((ctx ? (await ctx.json().catch(() => null))?.message : null) ?? error.message);
    }
    setInvite(null);
    return data;
  }, 'Invitation sent');

  const saveTargets = () => run('targets', async () => {
    const rows = Object.entries(tg).filter(([, v]) => v !== '').map(([k, v]) => {
      const [user_id, metric] = k.split('|') as [string, string];
      return { user_id, metric, period_month: p.month, target_value: Number(v), weightage_pct: { revenue: 40, deals: 20, collections: 15, autopay_pct: 10, talk_time_min: 10, visits: 5 }[metric] ?? 0 };
    });
    for (const r of rows) {
      const existing = p.targets.find((t) => t.user_id === r.user_id && t.metric === r.metric);
      const { error } = existing ? await supabase.from('targets').update({ target_value: r.target_value }).eq('id', existing.id) : await supabase.from('targets').insert(r);
      if (error) throw error;
    }
    setTg({});
    return rows.length;
  }, (n) => `${n} targets saved`);

  return (
    <Tabs defaultValue="users">
      <TabsList className="h-auto flex-wrap">
        {([['users', 'Users & roles'], ['teams', 'Teams & territories'], ['targets', 'Targets'], ['packages', 'Packages & pricing'], ['outcomes', 'Outcome codes'], ['chains', 'Approval chains'], ['templates', 'Notifications'], ['org', 'Organisation']] as const).map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="users">
        <div className="mb-3 flex justify-end"><Button onClick={() => setInvite({ role: 'executive', date_of_joining: new Date().toISOString().slice(0, 10) })}><UserPlus /> Invite user</Button></div>
        <DataTable rows={p.users} rowKey={(u) => u.id} exportName="users" columns={[
          { key: 'full_name', header: 'Name' }, { key: 'email', header: 'Email' },
          { key: 'role', header: 'Role', value: (u) => ROLE_LABELS[u.role], cell: (u) => <Badge tone="primary">{ROLE_LABELS[u.role]}</Badge> },
          { key: 'team', header: 'Team', value: (u) => p.teams.find((t) => t.id === u.team_id)?.name ?? '' },
          { key: 'manager', header: 'Manager', value: (u) => (u.manager_id ? nameOf[u.manager_id] : '') },
          { key: 'mfa', header: 'MFA', value: (u) => (u.mfa_enrolled ? 'on' : 'off'), cell: (u) => (['hr_admin', 'finance', 'super_admin'].includes(u.role) ? <Badge tone={u.mfa_enrolled ? 'success' : 'danger'}>{u.mfa_enrolled ? 'enrolled' : 'required'}</Badge> : '—') },
          { key: 'status', header: 'Status', cell: (u) => <Badge tone={u.status === 'active' ? 'success' : u.status === 'invited' ? 'info' : 'neutral'}>{u.status}</Badge> },
          { key: 'last_seen_at', header: 'Last seen', cell: (u) => (u.last_seen_at ? formatRelative(u.last_seen_at) : '—') },
        ]} />
        <p className="mt-2 text-xs text-text-muted">Change someone’s role, team or manager from their HR profile (People → Employees).</p>
      </TabsContent>

      <TabsContent value="teams" className="grid gap-6 lg:grid-cols-2">
        <DataTable rows={p.teams} rowKey={(t) => t.id} columns={[
          { key: 'name', header: 'Team' },
          { key: 'lead', header: 'Team lead', value: (t) => (t.lead_user_id ? nameOf[t.lead_user_id] : '') },
          { key: 'territory', header: 'Territory', value: (t) => p.territories.find((x) => x.id === t.territory_id)?.name ?? '' },
          { key: 'members', header: 'Members', align: 'right', value: (t) => p.users.filter((u) => u.team_id === t.id).length },
        ]} />
        <DataTable rows={p.territories} rowKey={(t) => t.id} exportName="territories" columns={[
          { key: 'name', header: 'Territory' }, { key: 'code', header: 'Code' }, { key: 'kind', header: 'Level' },
          { key: 'parent', header: 'Parent', value: (t) => p.territories.find((x) => x.id === t.parent_id)?.name ?? '' },
          { key: 'pincodes', header: 'Pincodes', value: (t) => t.pincodes.join(', ') },
        ]} />
      </TabsContent>

      <TabsContent value="targets">
        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Monthly targets</caption>
            <thead className="bg-surface-muted/60 text-xs uppercase text-text-muted"><tr><th className="px-3 py-2 text-left">Executive</th>{METRICS.map((m) => <th key={m} className="px-2 py-2 text-right">{m.replace('_', ' ')}</th>)}</tr></thead>
            <tbody>
              {execs.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{u.full_name}</td>
                  {METRICS.map((m) => (
                    <td key={m} className="px-1 py-1">
                      <Input aria-label={`${u.full_name} ${m}`} className="h-8 w-28 text-right tabular-nums" inputMode="decimal" value={tVal(u.id, m)} onChange={(e) => setTg({ ...tg, [tKey(u.id, m)]: e.target.value.replace(/[^\d.]/g, '') })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-sm text-text-muted">{Object.keys(tg).length} unsaved change(s) · month {p.month.slice(0, 7)}</span>
          <Button disabled={!Object.keys(tg).length || busy === 'targets'} onClick={saveTargets}><Save /> Save targets</Button>
        </div>
      </TabsContent>

      <TabsContent value="packages">
        <div className="mb-3 flex justify-end"><Button onClick={() => setPkg({ code: '', name: '', tier: 'standard', tenure_months: 12, list_price: 0, gst_pct: 18, max_discount_pct: 10, hard_floor_discount_pct: 25, is_active: true, sort_order: 10 })}><Plus /> New package</Button></div>
        <DataTable rows={p.packages} rowKey={(x) => x.id} onRowClick={(x) => setPkg(x)} columns={[
          { key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'tenure_months', header: 'Months', align: 'right' },
          { key: 'list_price', header: 'Price', align: 'right', value: (x) => Number(x.list_price), cell: (x) => formatINR(Number(x.list_price)) },
          { key: 'max_discount_pct', header: 'Free discount', align: 'right', cell: (x) => `${x.max_discount_pct}%` },
          { key: 'hard_floor_discount_pct', header: 'Max discount', align: 'right', cell: (x) => `${x.hard_floor_discount_pct}%` },
          { key: 'is_active', header: 'Status', cell: (x) => <Badge tone={x.is_active ? 'success' : 'neutral'}>{x.is_active ? 'Active' : 'Hidden'}</Badge> },
        ]} />
      </TabsContent>

      <TabsContent value="outcomes">
        <DataTable rows={p.outcomes} rowKey={(x) => x.id} onRowClick={(x) => setOc(x)} columns={[
          { key: 'code', header: 'Code' }, { key: 'label', header: 'Label' }, { key: 'sets_lead_status', header: 'Moves lead to', value: (x) => x.sets_lead_status ?? '—' },
          { key: 'requires_follow_up', header: 'Follow-up', value: (x) => (x.requires_follow_up ? 'Yes' : '—') },
          { key: 'requires_remarks', header: 'Remarks', value: (x) => (x.requires_remarks ? 'Required' : '—') },
          { key: 'is_terminal', header: 'Ends calling', value: (x) => (x.is_terminal ? 'Yes' : '—') },
        ]} />
      </TabsContent>

      <TabsContent value="chains">
        <DataTable rows={p.chains} rowKey={(x) => x.id} onRowClick={(x) => setChain({ ...x, stepsText: JSON.stringify(x.steps, null, 2), condText: JSON.stringify(x.conditions, null, 2) })} columns={[
          { key: 'type', header: 'Type' }, { key: 'name', header: 'Chain' }, { key: 'priority', header: 'Priority', align: 'right' },
          { key: 'steps', header: 'Steps', value: (x) => (x.steps as { relation?: string; role?: string }[]).map((s) => s.relation ?? s.role).join(' → ') },
          { key: 'sla_hours', header: 'SLA (h)', align: 'right' },
          { key: 'is_active', header: 'Active', value: (x) => (x.is_active ? 'Yes' : 'No') },
        ]} />
      </TabsContent>

      <TabsContent value="templates">
        <DataTable rows={p.templates} rowKey={(x) => x.id} onRowClick={(x) => setTpl(x)} columns={[
          { key: 'code', header: 'Event' }, { key: 'channel', header: 'Channel', cell: (x) => <Badge tone="primary">{x.channel}</Badge> }, { key: 'locale', header: 'Language' },
          { key: 'body', header: 'Message' },
        ]} />
      </TabsContent>

      <TabsContent value="org">
        <DataTable rows={p.settings} rowKey={(x) => x.key} onRowClick={(x) => setSetting({ key: x.key, text: JSON.stringify(x.value, null, 2), description: x.description })} columns={[
          { key: 'key', header: 'Setting' }, { key: 'description', header: 'What it controls' },
          { key: 'value', header: 'Value', value: (x) => JSON.stringify(x.value), cell: (x) => <code className="line-clamp-1 max-w-md text-xs">{JSON.stringify(x.value)}</code> },
        ]} />
      </TabsContent>

      {/* ---------- dialogs ---------- */}
      <Dialog open={!!invite} onOpenChange={(o) => !o && setInvite(null)}>
        <DialogContent wide title="Invite user" description="They receive an email to set a password. Admin roles must enrol MFA on first sign-in.">
          {invite && (
            <div className="grid gap-4 sm:grid-cols-2">
              {([['full_name', 'Full name'], ['email', 'Work email'], ['phone', 'Mobile'], ['employee_code', 'Employee code'], ['designation', 'Designation'], ['work_city', 'Work city']] as const).map(([k, l]) => (
                <FieldRow key={k} label={l} htmlFor={`i-${k}`}><Input id={`i-${k}`} value={invite[k] ?? ''} onChange={(e) => setInvite({ ...invite, [k]: e.target.value })} /></FieldRow>
              ))}
              <FieldRow label="Joining date" htmlFor="i-doj"><Input id="i-doj" type="date" value={invite.date_of_joining ?? ''} onChange={(e) => setInvite({ ...invite, date_of_joining: e.target.value })} /></FieldRow>
              <FieldRow label="Role" htmlFor="i-role"><Select id="i-role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></FieldRow>
              <FieldRow label="Team" htmlFor="i-team"><Select id="i-team" value={invite.team_id ?? ''} onChange={(e) => setInvite({ ...invite, team_id: e.target.value })}><option value="">—</option>{p.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></FieldRow>
              <FieldRow label="Reports to" htmlFor="i-mgr"><Select id="i-mgr" value={invite.manager_id ?? ''} onChange={(e) => setInvite({ ...invite, manager_id: e.target.value })}><option value="">—</option>{p.users.filter((u) => u.role !== 'executive').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></FieldRow>
              <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setInvite(null)}>Cancel</Button><Button disabled={busy === 'invite' || !invite.email || !invite.full_name} onClick={sendInvite}>Send invite</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pkg} onOpenChange={(o) => !o && setPkg(null)}>
        <DialogContent wide title={pkg?.id ? `Edit ${pkg.name}` : 'New package'} description="Discounts up to the free limit need no approval; above it go to managers; nothing above the max is allowed.">
          {pkg && (
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldRow label="Code" htmlFor="p-code"><Input id="p-code" value={pkg.code ?? ''} disabled={!!pkg.id} onChange={(e) => setPkg({ ...pkg, code: e.target.value.toUpperCase() })} /></FieldRow>
              <div className="sm:col-span-2"><FieldRow label="Name" htmlFor="p-name"><Input id="p-name" value={pkg.name ?? ''} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} /></FieldRow></div>
              <FieldRow label="Months" htmlFor="p-m"><Input id="p-m" type="number" value={pkg.tenure_months ?? 12} onChange={(e) => setPkg({ ...pkg, tenure_months: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="List price (₹, ex-GST)" htmlFor="p-pr"><Input id="p-pr" type="number" value={pkg.list_price ?? 0} onChange={(e) => setPkg({ ...pkg, list_price: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="GST %" htmlFor="p-g"><Input id="p-g" type="number" value={pkg.gst_pct ?? 18} onChange={(e) => setPkg({ ...pkg, gst_pct: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="Free discount %" htmlFor="p-fd"><Input id="p-fd" type="number" value={pkg.max_discount_pct ?? 10} onChange={(e) => setPkg({ ...pkg, max_discount_pct: Number(e.target.value) })} /></FieldRow>
              <FieldRow label="Max discount %" htmlFor="p-md"><Input id="p-md" type="number" value={pkg.hard_floor_discount_pct ?? 25} onChange={(e) => setPkg({ ...pkg, hard_floor_discount_pct: Number(e.target.value) })} /></FieldRow>
              <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={!!pkg.is_active} onChange={(e) => setPkg({ ...pkg, is_active: e.target.checked })} /> Available to sell</label>
              <div className="sm:col-span-3"><FieldRow label="Description" htmlFor="p-d"><Textarea id="p-d" className="min-h-16" value={pkg.description ?? ''} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} /></FieldRow></div>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button variant="outline" onClick={() => setPkg(null)}>Cancel</Button>
                <Button disabled={busy === 'pkg' || !pkg.code || !pkg.name} onClick={() => run('pkg', async () => {
                  if ((pkg.max_discount_pct ?? 0) > (pkg.hard_floor_discount_pct ?? 0)) throw new Error('Free discount cannot exceed the maximum discount');
                  const body = { name: pkg.name!, tenure_months: pkg.tenure_months!, list_price: pkg.list_price!, gst_pct: pkg.gst_pct!, max_discount_pct: pkg.max_discount_pct!, hard_floor_discount_pct: pkg.hard_floor_discount_pct!, is_active: !!pkg.is_active, description: pkg.description ?? null };
                  const { error } = pkg.id ? await supabase.from('packages').update(body).eq('id', pkg.id) : await supabase.from('packages').insert({ ...body, code: pkg.code! });
                  if (error) throw error;
                  setPkg(null);
                  return true;
                }, 'Package saved')}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!oc} onOpenChange={(o) => !o && setOc(null)}>
        <DialogContent title={`Outcome · ${oc?.code ?? ''}`}>
          {oc && (
            <div className="space-y-4">
              <FieldRow label="Label shown to executives" htmlFor="oc-l"><Input id="oc-l" value={oc.label} onChange={(e) => setOc({ ...oc, label: e.target.value })} /></FieldRow>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={oc.requires_follow_up} onChange={(e) => setOc({ ...oc, requires_follow_up: e.target.checked })} /> Ask for next follow-up</label>
                <label className="flex items-center gap-2"><Checkbox checked={oc.requires_remarks} onChange={(e) => setOc({ ...oc, requires_remarks: e.target.checked })} /> Remarks required</label>
                <label className="flex items-center gap-2"><Checkbox checked={oc.is_terminal} onChange={(e) => setOc({ ...oc, is_terminal: e.target.checked })} /> Stops further calls</label>
                <label className="flex items-center gap-2"><Checkbox checked={oc.is_active} onChange={(e) => setOc({ ...oc, is_active: e.target.checked })} /> Active</label>
              </div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOc(null)}>Cancel</Button><Button disabled={busy === 'oc'} onClick={() => run('oc', async () => { const { error } = await supabase.from('outcome_codes').update({ label: oc.label, requires_follow_up: oc.requires_follow_up, requires_remarks: oc.requires_remarks, is_terminal: oc.is_terminal, is_active: oc.is_active }).eq('id', oc.id); if (error) throw error; setOc(null); return true; }, 'Outcome saved')}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chain} onOpenChange={(o) => !o && setChain(null)}>
        <DialogContent wide title={`Approval chain · ${chain?.name ?? ''}`} description='Steps run in order. Use {"relation":"manager"}, {"relation":"skip_manager"} or {"role":"hr_admin"|"finance"}. Conditions: {"min_amount":5000} or {"min_value":3}.'>
          {chain && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Steps (JSON)" htmlFor="c-s"><Textarea id="c-s" className="min-h-40 font-mono text-xs" value={chain.stepsText} onChange={(e) => setChain({ ...chain, stepsText: e.target.value })} /></FieldRow>
              <FieldRow label="Conditions (JSON)" htmlFor="c-c"><Textarea id="c-c" className="min-h-40 font-mono text-xs" value={chain.condText} onChange={(e) => setChain({ ...chain, condText: e.target.value })} /></FieldRow>
              <FieldRow label="SLA hours" htmlFor="c-sla"><Input id="c-sla" type="number" value={chain.sla_hours} onChange={(e) => setChain({ ...chain, sla_hours: Number(e.target.value) })} /></FieldRow>
              <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={chain.is_active} onChange={(e) => setChain({ ...chain, is_active: e.target.checked })} /> Active</label>
              <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setChain(null)}>Cancel</Button><Button disabled={busy === 'ch'} onClick={() => run('ch', async () => {
                let steps: unknown, conditions: unknown;
                try { steps = JSON.parse(chain.stepsText); conditions = JSON.parse(chain.condText); } catch { throw new Error('Steps and conditions must be valid JSON'); }
                if (!Array.isArray(steps) || !steps.length) throw new Error('Add at least one step');
                const { error } = await supabase.from('approval_chains').update({ steps: steps as never, conditions: conditions as never, sla_hours: chain.sla_hours, is_active: chain.is_active }).eq('id', chain.id);
                if (error) throw error;
                setChain(null);
                return true;
              }, 'Approval chain saved')}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!tpl} onOpenChange={(o) => !o && setTpl(null)}>
        <DialogContent title={`${tpl?.code ?? ''} · ${tpl?.channel ?? ''}`} description="Use {{placeholders}} like {{name}}, {{business}}, {{link}}.">
          {tpl && (
            <div className="space-y-4">
              {tpl.channel === 'email' || tpl.channel === 'push' ? <FieldRow label="Subject / title" htmlFor="t-s"><Input id="t-s" value={tpl.subject ?? ''} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} /></FieldRow> : null}
              <FieldRow label="Message" htmlFor="t-b"><Textarea id="t-b" value={tpl.body} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} /></FieldRow>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTpl(null)}>Cancel</Button><Button disabled={busy === 'tpl'} onClick={() => run('tpl', async () => { const { error } = await supabase.from('notification_templates').update({ subject: tpl.subject, body: tpl.body }).eq('id', tpl.id); if (error) throw error; setTpl(null); return true; }, 'Template saved')}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!setting} onOpenChange={(o) => !o && setSetting(null)}>
        <DialogContent title={setting?.key ?? ''} description={setting?.description ?? undefined}>
          {setting && (
            <div className="space-y-4">
              <Textarea aria-label="Value (JSON)" className="min-h-48 font-mono text-xs" value={setting.text} onChange={(e) => setSetting({ ...setting, text: e.target.value })} />
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSetting(null)}>Cancel</Button><Button disabled={busy === 'set'} onClick={() => run('set', async () => {
                let value: unknown;
                try { value = JSON.parse(setting.text); } catch { throw new Error('Value must be valid JSON (strings need quotes)'); }
                const { error } = await supabase.from('app_settings').update({ value: value as never }).eq('key', setting.key);
                if (error) throw new Error(toAppError(error).message);
                setSetting(null);
                return true;
              }, 'Setting saved')}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
