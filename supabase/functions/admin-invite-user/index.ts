// POST { email, full_name, role, team_id?, manager_id?, employee_code, designation, date_of_joining, work_city?, phone? }
// Super Admin / HR Admin only. Creates the auth user (invite email) with
// org + role in app_metadata (server-controlled), then the employment record.
import { admin, asUser } from '../_shared/clients.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

const ROLES = ['executive', 'team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'];

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { client, user } = await asUser(req);
  const { data: allowed } = await client.rpc('check_rate_limit', { p_action: 'invite_user', p_max: 20, p_window_seconds: 60 });
  if (allowed === false) throw new HttpError(429, 'Too many requests — please wait a minute', 'rate_limited');
  const { data: me } = await client.from('users').select('org_id, role').eq('id', user.id).single();
  if (!me || !['super_admin', 'hr_admin'].includes(me.role)) throw new HttpError(403, 'Only HR or Super Admin can invite users', 'forbidden');

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, 'Enter a valid email', 'rule_violation');
  if (!ROLES.includes(b.role)) throw new HttpError(422, 'Unknown role', 'rule_violation');
  if (b.role === 'super_admin' && me.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can create another Super Admin', 'forbidden');
  if (!b.full_name || !b.employee_code || !b.designation || !b.date_of_joining) throw new HttpError(422, 'Name, employee code, designation and joining date are required', 'rule_violation');

  const redirectTo = `${Deno.env.get('SITE_URL') ?? 'http://localhost:3000'}/login`;
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: b.full_name },
  });
  if (error) throw new HttpError(422, error.message.includes('already') ? 'A user with this email already exists' : error.message, 'rule_violation');

  // app_metadata is only writable with the service role
  await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: { org_id: me.org_id, role: b.role, team_id: b.team_id ?? null, manager_id: b.manager_id ?? null },
  });
  // the on_auth_user_created trigger may have run before app_metadata was set — upsert the profile explicitly
  const { error: uErr } = await admin.from('users').upsert({
    id: invited.user.id, org_id: me.org_id, role: b.role, full_name: b.full_name, email, phone: b.phone ?? null,
    team_id: b.team_id || null, manager_id: b.manager_id || null, status: 'invited',
  });
  if (uErr) throw uErr;
  const { error: eErr } = await admin.from('employees').insert({
    org_id: me.org_id, user_id: invited.user.id, employee_code: b.employee_code, designation: b.designation,
    department: b.department ?? 'Sales', date_of_joining: b.date_of_joining, work_city: b.work_city ?? null,
    onboarding: [
      { key: 'offer', label: 'Offer accepted', done: true }, { key: 'docs', label: 'Documents submitted', done: false },
      { key: 'bank', label: 'Bank details verified', done: false }, { key: 'induction', label: 'Induction completed', done: false },
      { key: 'assets', label: 'Phone & SIM issued', done: false },
    ],
  });
  if (eErr) throw eErr;
  await admin.from('audit_logs').insert({ org_id: me.org_id, actor_id: user.id, actor_role: me.role, action: 'invite_user', table_name: 'users', record_id: invited.user.id, new_data: { email, role: b.role } });
  return json({ user_id: invited.user.id, email, status: 'invited' }, 201);
});
