'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toAppError } from '@teamnest/api-client';
import { useToast } from '@/components/toast';

/** Runs a mutation, toasts the result and refreshes server data. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast({ tone: 'success', title: typeof success === 'function' ? success(r) : success });
      start(() => router.refresh());
      return r;
    } catch (e) {
      toast({ tone: 'error', title: 'Something went wrong', body: e instanceof Error && !('code' in e) ? e.message : toAppError(e).message });
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}
