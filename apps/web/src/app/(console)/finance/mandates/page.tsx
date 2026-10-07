import type { Metadata } from 'next';
import { SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { MandatesView } from './mandates-view';

export const metadata: Metadata = { title: 'Mandates' };

export default async function MandatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const supabase = await getServerClient();
  let q = supabase.from('report_mandates').select('*').order('created_at', { ascending: false }).limit(5000);
  if (sp.status) q = q.eq('status', sp.status as 'active');
  const { data } = await q;
  return (
    <>
      <PageHeader title="Auto-pay mandates" description="Mandate status, bounces and rejections. Bounced customers move to the Failed Auto-pay queue automatically." />
      <div className="mb-4"><SelectFilter name="status" label="Status" options={['initiated', 'pending_bank', 'active', 'rejected', 'paused', 'cancelled'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} /></div>
      <MandatesView rows={data ?? []} />
    </>
  );
}
