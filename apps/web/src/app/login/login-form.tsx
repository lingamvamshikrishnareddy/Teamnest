'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { roleFromAccessToken, signInWithPassword, toAppError } from '@teamnest/api-client';
import { requiresMfa } from '@teamnest/types';
import { getBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEMO = [
  { label: 'Super Admin', email: 'aarav@teamnest.demo' },
  { label: 'HR Admin', email: 'kavya@teamnest.demo' },
  { label: 'Finance', email: 'rohan@teamnest.demo' },
  { label: 'Area Manager', email: 'meera@teamnest.demo' },
  { label: 'Team Lead', email: 'sanjana@teamnest.demo' },
];

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [pending, start] = useTransition();
  const isDemo = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      try {
        const { session } = await signInWithPassword(getBrowserClient(), email, password);
        const role = roleFromAccessToken(session?.access_token);
        router.replace(role && requiresMfa(role) ? `/login/mfa?next=${encodeURIComponent(next)}` : next);
        router.refresh();
      } catch (err) {
        setError(toAppError(err).message);
      }
    });
  };

  return (
    <>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-invalid={!!error} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" aria-invalid={!!error} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-subtle hover:text-text" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pending || !email || !password}>
          {pending && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>

      {isDemo && (
        <div className="mt-8 rounded-card border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Demo accounts · password TeamNest@2026</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword('TeamNest@2026'); }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-primary hover:text-primary-text">
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
