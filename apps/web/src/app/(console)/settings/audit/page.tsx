import type { Metadata } from 'next';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { AuditTable } from './audit-table';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; action?: string; table?: string }> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const r = resolveRange(sp, '7d');
  const supabase = await getServerClient();
  let q = supabase.from('audit_logs').select('id, created_at, actor_id, actor_role, action, table_name, record_id, changed_fields, old_data, new_data').gte('created_at', r.fromTs).lte('created_at', r.toTs).order('created_at', { ascending: false }).limit(2000);
  if (sp.action) q = q.eq('action', sp.action);
  if (sp.table) q = q.eq('table_name', sp.table);
  const [{ data }, users] = await Promise.all([q, supabase.from('users').select('id, full_name')]);
  const names = Object.fromEntries((users.data ?? []).map((u) => [u.id, u.full_name]));
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sensitive actions: role and pricing changes, money movements, payroll, settings, logins, exports and every view of sensitive employee data." />
      <FilterBar defaultRange="7d">
        <SelectFilter name="action" label="Action" options={['insert', 'update', 'delete', 'view_sensitive', 'login', 'export', 'invite_user', 'cash_collected'].map((a) => ({ value: a, label: a.replace('_', ' ') }))} />
        <SelectFilter name="table" label="Record" options={['users', 'employees', 'employee_sensitive', 'packages', 'deals', 'payments', 'payslips', 'incentives', 'approvals', 'app_settings', 'lead_queues'].map((t) => ({ value: t, label: t }))} />
      </FilterBar>
      <AuditTable rows={(data ?? []).map((a) => ({ ...a, id: String(a.id), actor: a.actor_id ? names[a.actor_id] ?? a.actor_id : 'System' }))} />
    </>
  );
}
