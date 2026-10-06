import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Service-role client: bypasses RLS. Use only after authorising the caller. */
export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

/** Client acting as the caller (RLS applies) + the verified user. */
export async function asUser(req: Request) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required', 'unauthorized');
  const client = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Session expired — sign in again', 'unauthorized');
  return { client, user: data.user };
}
