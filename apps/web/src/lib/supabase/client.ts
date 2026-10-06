'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@teamnest/types';
import { env } from '../env';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  browserClient ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { 'x-teamnest-client': 'web' } },
  });
  return browserClient;
}
