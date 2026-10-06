/** Public runtime config. Fails loudly (with a helpful message) when misconfigured. */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to apps/web/.env.local and fill it in.`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  appEnv: (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? 'local') as 'local' | 'staging' | 'production',
};
