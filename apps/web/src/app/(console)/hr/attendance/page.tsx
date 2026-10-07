import type { Metadata } from 'next';
import { formatDate } from '@teamnest/ui';
import { SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { monthFromParam } from '../month';
import { MonthPicker } from '../month-picker';
import { Register } from './register';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; team?: string }> }) {
  const session = await requireConsoleSession();
  const sp = await searchParams;
  const m = monthFromParam(sp.month);
  const supabase = await getServerClient();
  let peopleQ = supabase.from('users').select('id, full_name, team_id, employees(employee_code)').neq('status', 'inactive').order('full_name');
  if (sp.team) peopleQ = peopleQ.eq('team_id', sp.team);
  const [people, rows, lock, teams, pendingCorrections] = await Promise.all([
    peopleQ,
    supabase.from('attendance').select('user_id, day, status, is_late, source, punch_in_at, punch_out_at, work_minutes').gte('day', m.start).lte('day', m.end),
    supabase.from('attendance_locks').select('locked_at').eq('period_month', m.start).maybeSingle(),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('type', 'punch_correction').eq('status', 'pending'),
  ]);
  return (
    <>
      <PageHeader title="Attendance" description={`Register for ${formatDate(m.start).slice(3)} · calls and field visits mark people present automatically`}
        actions={<MonthPicker value={m.key} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2"><SelectFilter name="team" label="Team" options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))} /></div>
      <Register
        month={m}
        people={(people.data ?? []).map((p) => ({ id: p.id, name: p.full_name, code: (Array.isArray(p.employees) ? p.employees[0] : p.employees)?.employee_code ?? '' }))}
        rows={rows.data ?? []}
        lockedAt={lock.data?.locked_at ?? null}
        canLock={session.user.role === 'hr_admin'}
        pendingCorrections={pendingCorrections.count ?? 0}
      />
    </>
  );
}
