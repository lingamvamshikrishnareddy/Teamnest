import type { AppRole, SessionContext } from '@teamnest/types';
import { requiresMfa } from '@teamnest/types';
import type { TeamNestClient } from './client';
import { toAppError, unwrap } from './errors';

export async function signInWithPassword(client: TeamNestClient, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw toAppError(error);
  await client.rpc('log_audit_event', { p_action: 'login', p_table: 'auth', p_record: data.user.id }).then(() => undefined, () => undefined);
  return data;
}

export async function signOut(client: TeamNestClient) {
  const { error } = await client.auth.signOut();
  if (error) throw toAppError(error);
}

/** Role from the JWT custom claim (set by custom_access_token_hook). */
export function roleFromAccessToken(accessToken: string | undefined | null): AppRole | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return (json.user_role as AppRole) ?? null;
  } catch {
    return null;
  }
}

/** Loads the signed-in user's profile, employment record, org, team and manager. */
export async function loadSessionContext(client: TeamNestClient): Promise<SessionContext | null> {
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;

  const user = unwrap(await client.from('users').select('*').eq('id', auth.user.id).single());
  const [employee, organization, team, manager] = await Promise.all([
    client.from('employees').select('*').eq('user_id', user.id).maybeSingle(),
    client.from('organizations').select('*').eq('id', user.org_id).single(),
    user.team_id ? client.from('teams').select('*').eq('id', user.team_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    user.manager_id
      ? client.from('users').select('id, full_name, avatar_url, phone').eq('id', user.manager_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (organization.error) throw toAppError(organization.error);

  return {
    user,
    employee: employee.data ?? null,
    organization: organization.data,
    team: team.data ?? null,
    manager: manager.data ?? null,
  };
}

// ---------------------------------------------------------------------------
// MFA (TOTP) — required for HR Admin, Finance and Super Admin
// ---------------------------------------------------------------------------
export type MfaState =
  | { status: 'not_required' }
  | { status: 'verified' }
  | { status: 'needs_enrollment' }
  | { status: 'needs_challenge'; factorId: string };

export async function getMfaState(client: TeamNestClient, role: AppRole): Promise<MfaState> {
  if (!requiresMfa(role)) return { status: 'not_required' };
  const { data: aal, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw toAppError(error);
  if (aal.currentLevel === 'aal2') return { status: 'verified' };

  const { data: factors, error: fErr } = await client.auth.mfa.listFactors();
  if (fErr) throw toAppError(fErr);
  const totp = factors.totp.find((f) => f.status === 'verified');
  return totp ? { status: 'needs_challenge', factorId: totp.id } : { status: 'needs_enrollment' };
}

export async function enrollTotp(client: TeamNestClient) {
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TeamNest' });
  if (error) throw toAppError(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

export async function verifyTotp(client: TeamNestClient, factorId: string, code: string) {
  const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) throw toAppError(error);
  return data;
}
