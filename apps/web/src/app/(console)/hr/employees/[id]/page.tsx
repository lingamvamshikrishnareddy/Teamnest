import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ROLE_LABELS } from '@teamnest/types';
import { formatDate } from '@teamnest/ui';
import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { EmployeeAdmin } from './employee-admin';

export const metadata: Metadata = { title: 'Employee' };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireConsoleSession();
  const { id } = await params;
  const supabase = await getServerClient();
  const { data: e } = await supabase.from('employees').select('*, user:users!employees_user_id_fkey(*)').eq('id', id).maybeSingle();
  if (!e) notFound();
  const u = e.user as unknown as { id: string; full_name: string; email: string; phone: string | null; role: keyof typeof ROLE_LABELS; status: string; team_id: string | null; manager_id: string | null; avatar_url: string | null };
  const year = new Date().getFullYear();
  const [docs, balances, teams, managers, att, shifts] = await Promise.all([
    supabase.from('documents').select('id, title, status, rejection_reason, created_at, file_id, category:document_categories(name)').eq('owner_user_id', u.id).order('created_at', { ascending: false }),
    supabase.from('leave_balances').select('balance, used, leave_type:leave_types(name)').eq('user_id', u.id).eq('year', year),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('users').select('id, full_name').in('role', ['team_lead', 'area_manager', 'super_admin', 'hr_admin', 'finance']).order('full_name'),
    supabase.from('report_attendance').select('*').eq('user_id', u.id).order('period_month', { ascending: false }).limit(3),
    supabase.from('shifts').select('id, name'),
  ]);
  const emergency = (e.emergency_contact ?? {}) as { name?: string; relation?: string; phone?: string };

  return (
    <>
      <Link href="/hr/employees" className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ChevronLeft className="size-4" /> Employees</Link>
      <PageHeader title={u.full_name} description={<>{e.employee_code} · {e.designation} · {ROLE_LABELS[u.role]}</>} actions={<Avatar name={u.full_name} src={u.avatar_url} size={44} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>Email: <strong>{u.email}</strong></p>
              <p>Phone: <strong>{u.phone ?? '—'}</strong></p>
              <p>Department: <strong>{e.department}</strong> · {e.employment_type.replace('_', ' ')}</p>
              <p>City: <strong>{e.work_city}</strong></p>
              <p>Joined: <strong>{formatDate(e.date_of_joining)}</strong>{e.probation_end_date ? ` · probation till ${formatDate(e.probation_end_date)}` : ''}</p>
              <p>Emergency: <strong>{emergency.name ?? '—'}</strong> {emergency.relation ? `(${emergency.relation})` : ''} {emergency.phone ?? ''}</p>
              <p>Status: <Badge tone={u.status === 'active' ? 'success' : 'warning'}>{u.status}</Badge></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Leave balance {year}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(balances.data ?? []).map((b, i) => (
                <div key={i} className="flex justify-between"><span>{(b.leave_type as { name?: string } | null)?.name}</span><span className="tabular-nums"><strong>{b.balance}</strong> left · {b.used} used</span></div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Attendance (last 3 months)</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(att.data ?? []).map((a) => (
                <div key={a.period_month} className="flex justify-between"><span>{formatDate(a.period_month!).slice(3)}</span><span className="tabular-nums">{a.present} P · {a.absent} A · {a.on_leave} L · {a.late} late</span></div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <EmployeeAdmin
            canEditSensitive={session.user.role === 'hr_admin' || session.user.role === 'super_admin'}
            employee={{ id: e.id, userId: u.id, role: u.role, status: u.status, teamId: u.team_id, managerId: u.manager_id, shiftId: e.shift_id, onboarding: (e.onboarding as { key: string; label: string; done: boolean }[]) ?? [] }}
            docs={(docs.data ?? []).map((d) => ({ id: d.id, title: d.title, status: d.status, reason: d.rejection_reason, category: (d.category as { name?: string } | null)?.name ?? '', created: d.created_at, fileId: d.file_id }))}
            teams={teams.data ?? []}
            managers={(managers.data ?? []).filter((m) => m.id !== u.id)}
            shifts={shifts.data ?? []}
          />
        </div>
      </div>
    </>
  );
}
