import type { Metadata } from 'next';
import { AuthLayout } from './auth-layout';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-text-muted">Sign in with the account your admin created for you.</p>
      <LoginForm next={next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'} initialError={error === 'inactive' ? 'Your account is inactive. Please contact HR.' : undefined} />
    </AuthLayout>
  );
}
