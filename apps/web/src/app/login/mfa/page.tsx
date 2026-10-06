import type { Metadata } from 'next';
import { AuthLayout } from '../auth-layout';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Two-step verification' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout>
      <MfaForm next={next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'} />
    </AuthLayout>
  );
}
