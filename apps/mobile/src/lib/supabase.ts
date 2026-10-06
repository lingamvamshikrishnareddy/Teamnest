import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createTeamNestClient } from '@teamnest/api-client';
import { env } from './env';
import { sessionStorage } from './secure-storage';

export const supabase = createTeamNestClient({
  url: env.supabaseUrl || 'http://127.0.0.1:54321',
  anonKey: env.supabaseAnonKey || 'missing-anon-key',
  storage: sessionStorage,
  detectSessionInUrl: false,
  clientName: 'mobile',
});

// Only refresh tokens while the app is in the foreground (saves battery, avoids background network).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
