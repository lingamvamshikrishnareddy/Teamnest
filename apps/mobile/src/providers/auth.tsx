import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSessionContext, signInWithPassword, signOut as apiSignOut } from '@teamnest/api-client';
import type { SessionContext } from '@teamnest/types';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  context: SessionContext | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshContext: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('loading');

  const refreshContext = useCallback(async () => {
    try {
      setContext(await loadSessionContext(supabase));
    } catch {
      setContext(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshContext();
      setStatus(data.session ? 'signed_in' : 'signed_out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signed_in' : 'signed_out');
      if (!next) setContext(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshContext]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      session,
      context,
      signIn: async (email, password) => {
        await signInWithPassword(supabase, email, password);
        await refreshContext();
      },
      signOut: () => apiSignOut(supabase),
      refreshContext,
    }),
    [status, session, context, refreshContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
