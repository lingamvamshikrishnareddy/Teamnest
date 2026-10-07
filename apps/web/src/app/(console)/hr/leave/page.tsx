import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { LeaveAdmin } from './leave-admin';

export const metadata: Metadata = { title: 'Leave' };

export default async function LeavePage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const year = new Date().getFullYear();
  const [requests, types, balances, holidays] = await Promise.all([
    supabase.from('leave_requests').select('id, from_date, to_date, days, half_day, status, reason, created_at, user:users!leave_requests_user_id_fkey(full_name), leave_type:leave_types(name)').order('created_at', { ascending: false }).limit(500),
    supabase.from('leave_types').select('*').order('code'),
    supabase.from('leave_balances').select('user_id, balance, used, leave_type_id, user:users!leave_balances_user_id_fkey(full_name)').eq('year', year),
    supabase.from('holidays').select('*').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day'),
  ]);
  return (
    <>
      <PageHeader title="Leave" description="Requests, balances, leave policy and holiday calendars." />
      <LeaveAdmin
        requests={(requests.data ?? []).map((r) => ({ id: r.id, name: (r.user as { full_name?: string } | null)?.full_name ?? '', type: (r.leave_type as { name?: string } | null)?.name ?? '', from: r.from_date, to: r.to_date, days: Number(r.days), status: r.status, reason: r.reason ?? '', applied: r.created_at }))}
        types={types.data ?? []}
        balances={(balances.data ?? []).map((b) => ({ userId: b.user_id, name: (b.user as { full_name?: string } | null)?.full_name ?? '', typeId: b.leave_type_id, balance: Number(b.balance), used: Number(b.used) }))}
        holidays={holidays.data ?? []}
      />
    </>
  );
}
