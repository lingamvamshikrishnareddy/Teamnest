import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { canUseWeb, requiresMfa, type SessionContext } from '@teamnest/types';
import { loadSessionContext } from '@teamnest/api-client';
import { getServerClient } from './supabase/server';

/** Loads the signed-in user's context once per request. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await getServerClient();
  return loadSessionContext(supabase);
});

/**
 * Guard for console pages: signed in, allowed on web, and MFA-verified
 * for roles that require it (HR Admin, Finance, Super Admin).
 */
export async function requireConsoleSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.status === 'inactive') redirect('/login?error=inactive');
  if (!canUseWeb(session.user.role)) redirect('/mobile-only');

  if (requiresMfa(session.user.role)) {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== 'aal2') redirect('/login/mfa');
  }
  return session;
}
