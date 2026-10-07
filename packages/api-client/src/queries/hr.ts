import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export async function getAttendanceMonth(client: TeamNestClient, userId: string, monthStart: string) {
  const [y, m] = monthStart.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return unwrap(
    await client.from('attendance').select('*').eq('user_id', userId).gte('day', monthStart).lt('day', next).order('day'),
  );
}

export function summarizeAttendance(rows: { status: string; is_late: boolean; work_minutes: number | null; activity_points: number }[]) {
  const s = { present: 0, half_day: 0, absent: 0, on_leave: 0, holiday: 0, week_off: 0, late: 0, workMinutes: 0, points: 0 };
  for (const r of rows) {
    if (r.status in s) (s as Record<string, number>)[r.status]! += 1;
    if (r.is_late) s.late += 1;
    s.workMinutes += r.work_minutes ?? 0;
    s.points += r.activity_points;
  }
  return s;
}

export async function getLeaveOverview(client: TeamNestClient, userId: string, year: number) {
  const [types, balances, requests, holidays] = await Promise.all([
    client.from('leave_types').select('*').eq('is_active', true).order('code'),
    client.from('leave_balances').select('*').eq('user_id', userId).eq('year', year),
    client.from('leave_requests').select('*, leave_type:leave_types(name, code, color)').eq('user_id', userId).order('from_date', { ascending: false }).limit(50),
    client.from('holidays').select('*').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day'),
  ]);
  return { types: unwrap(types), balances: unwrap(balances), requests: unwrap(requests), holidays: unwrap(holidays) };
}

export async function applyLeave(client: TeamNestClient, userId: string, l: { leaveTypeId: string; from: string; to: string; halfDay?: 'first_half' | 'second_half' | null; reason?: string }) {
  return unwrap(
    await client
      .from('leave_requests')
      // days is recalculated server-side (working days minus holidays)
      .insert({ user_id: userId, leave_type_id: l.leaveTypeId, from_date: l.from, to_date: l.to, half_day: l.halfDay ?? null, days: 1, reason: l.reason, status: 'pending' })
      .select('*')
      .single(),
  );
}

export async function cancelLeave(client: TeamNestClient, id: string) {
  return unwrap(await client.from('leave_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id).select('id').single());
}

export async function listPayslips(client: TeamNestClient, userId: string) {
  return unwrap(await client.from('payslips').select('*').eq('user_id', userId).eq('status', 'published').order('period_month', { ascending: false }));
}

export async function listMyDocuments(client: TeamNestClient, userId: string) {
  return unwrap(await client.from('documents').select('*, category:document_categories(name, code, is_sensitive)').eq('owner_user_id', userId).order('created_at', { ascending: false }));
}

export async function listMyRequests(client: TeamNestClient, userId: string) {
  return unwrap(await client.from('requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50));
}

export type RequestType =
  | 'punch_correction' | 'leave' | 'access' | 'travel' | 'reimbursement' | 'business_card'
  | 'retention_bonus' | 'exit' | 'grievance' | 'profile_change';

export async function raiseRequest(client: TeamNestClient, userId: string, r: { type: RequestType; subject: string; details?: string; payload?: Record<string, unknown>; anonymous?: boolean }) {
  const anonymous = r.type === 'grievance' && !!r.anonymous;
  return unwrap(
    await client
      .from('requests')
      .insert({ type: r.type, user_id: anonymous ? null : userId, is_anonymous: anonymous, subject: r.subject, details: r.details, payload: (r.payload ?? {}) as never, status: 'pending' })
      .select(anonymous ? 'id' : '*')
      .single(),
  );
}

export async function submitReimbursement(client: TeamNestClient, userId: string, r: { category: string; expenseDate: string; amount: number; description?: string; distanceKm?: number }) {
  return unwrap(
    await client
      .from('reimbursements')
      .insert({ user_id: userId, category: r.category, expense_date: r.expenseDate, amount: r.amount, description: r.description, distance_km: r.distanceKm, status: 'pending' })
      .select('*')
      .single(),
  );
}

export async function listPolicies(client: TeamNestClient, userId: string) {
  const [policies, acks] = await Promise.all([
    client.from('policies').select('*').order('published_at', { ascending: false }),
    client.from('policy_acknowledgements').select('policy_id, policy_version').eq('user_id', userId),
  ]);
  const acked = new Set(unwrap(acks).map((a) => `${a.policy_id}:${a.policy_version}`));
  return unwrap(policies).map((p) => ({ ...p, acknowledged: acked.has(`${p.id}:${p.version}`) }));
}

export async function acknowledgePolicy(client: TeamNestClient, userId: string, policyId: string, version: number) {
  const { error } = await client.from('policy_acknowledgements').insert({ policy_id: policyId, user_id: userId, policy_version: version });
  if (error && error.code !== '23505') throw error;
}

export async function getGoals(client: TeamNestClient, userId: string) {
  const cycles = unwrap(await client.from('appraisal_cycles').select('*').order('period_start', { ascending: false }).limit(2));
  const goals = unwrap(await client.from('goals').select('*').eq('user_id', userId).in('cycle_id', cycles.map((c) => c.id)).order('weightage_pct', { ascending: false }));
  const appraisals = unwrap(await client.from('appraisals').select('*').eq('user_id', userId));
  return { cycles, goals, appraisals };
}

export async function getMyTargets(client: TeamNestClient, userId: string, monthStart: string) {
  return unwrap(await client.from('targets').select('*').eq('user_id', userId).eq('period_month', monthStart));
}

/** Signed URL for a private file (payslip PDF, document). */
export async function signedFileUrl(client: TeamNestClient, fileId: string, expiresIn = 300) {
  const f = unwrap(await client.from('files').select('bucket, path').eq('id', fileId).single());
  const { data, error } = await client.storage.from(f.bucket).createSignedUrl(f.path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
