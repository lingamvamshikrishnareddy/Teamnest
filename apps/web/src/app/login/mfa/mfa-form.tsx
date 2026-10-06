'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { enrollTotp, getMfaState, loadSessionContext, toAppError, verifyTotp, type MfaState } from '@teamnest/api-client';
import { getBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [state, setState] = useState<MfaState | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const client = getBrowserClient();
      const session = await loadSessionContext(client);
      if (!session) return router.replace('/login');
      const s = await getMfaState(client, session.user.role);
      if (s.status === 'verified' || s.status === 'not_required') return router.replace(next);
      setState(s);
      if (s.status === 'needs_enrollment') setEnrollment(await enrollTotp(client));
    })().catch((e) => setError(toAppError(e).message));
  }, [next, router]);

  const factorId = state?.status === 'needs_challenge' ? state.factorId : enrollment?.factorId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError(undefined);
    start(async () => {
      try {
        await verifyTotp(getBrowserClient(), factorId, code);
        router.replace(next);
        router.refresh();
      } catch {
        setError('That code didn’t work. Codes refresh every 30 seconds — try the latest one.');
      }
    });
  };

  return (
    <div>
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-text">
        <ShieldCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Two-step verification</h1>
      <p className="mt-1 text-sm text-text-muted">
        Your role can see sensitive employee and payment data, so we ask for a code from an authenticator app.
      </p>

      {!state && !error && <Skeleton className="mt-8 h-40 w-full" />}

      {enrollment && (
        <div className="mt-6 rounded-card border border-border bg-surface p-4">
          <p className="text-sm font-medium">1. Scan this QR code with Google Authenticator, Microsoft Authenticator or similar.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="Authenticator QR code" className="mx-auto my-4 size-44 rounded-sm bg-white p-2" />
          <p className="flex items-center gap-1.5 text-xs text-text-muted"><KeyRound className="size-3.5" /> Or enter key: <code className="font-mono text-text">{enrollment.secret}</code></p>
        </div>
      )}

      {factorId && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">{enrollment ? '2. Enter the 6-digit code' : '6-digit code'}</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="text-center font-mono text-lg tracking-[0.4em]" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending || code.replace(/\s/g, '').length !== 6}>
            {pending && <Loader2 className="animate-spin" />} Verify
          </Button>
        </form>
      )}
      {error && <p role="alert" className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
