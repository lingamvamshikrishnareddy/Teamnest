import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from '@teamnest/types';

export type TeamNestClient = SupabaseClient<Database>;

export interface ClientOptions {
  url: string;
  anonKey: string;
  /** Session storage (mobile passes an expo-secure-store adapter). */
  storage?: SupportedStorage;
  /** Web OAuth/magic-link callback parsing. Off on mobile. */
  detectSessionInUrl?: boolean;
  /** Optional per-app header so the audit trail can tell web from mobile. */
  clientName?: 'web' | 'mobile' | 'edge';
}

export function createTeamNestClient(opts: ClientOptions): TeamNestClient {
  if (!opts.url || !opts.anonKey) {
    throw new Error('Supabase URL and anon key are required — check your .env (see .env.example).');
  }
  return createClient<Database>(opts.url, opts.anonKey, {
    auth: {
      storage: opts.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: opts.detectSessionInUrl ?? false,
    },
    global: { headers: { 'x-teamnest-client': opts.clientName ?? 'web' } },
  });
}
