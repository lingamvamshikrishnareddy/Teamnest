import { HttpError } from './http.ts';

/** Scheduled/internal functions accept only the service-role key. */
export function requireServiceRole(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) throw new HttpError(401, 'Service role required', 'unauthorized');
}
