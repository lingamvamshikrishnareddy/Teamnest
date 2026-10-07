import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { Directory } from './directory';

export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from('employees')
    .select('id, employee_code, designation, department, work_city, date_of_joining, onboarding, user:users!employees_user_id_fkey(id, full_name, email, phone, role, status, team:teams!users_team_id_fkey(name), manager:users!manager_id(full_name))')
    .order('employee_code');
  const rows = (data ?? []).map((e) => {
    const u = e.user as unknown as { id: string; full_name: string; email: string; phone: string | null; role: string; status: string; team: { name: string } | null; manager: { full_name: string } | null };
    const checklist = (e.onboarding as { done?: boolean }[] | null) ?? [];
    return {
      id: e.id, code: e.employee_code, name: u.full_name, email: u.email, phone: u.phone ?? '', role: u.role, status: u.status, team: u.team?.name ?? '', manager: u.manager?.full_name ?? '',
      designation: e.designation, department: e.department, city: e.work_city ?? '', joined: e.date_of_joining,
      onboarding: checklist.length ? Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100) : 100,
    };
  });
  return (
    <>
      <PageHeader title="Employees" description={`${rows.length} people · click a row to open the profile`} />
      <Directory rows={rows} />
    </>
  );
}
