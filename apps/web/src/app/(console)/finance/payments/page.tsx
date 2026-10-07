import type { Metadata } from 'next';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { PaymentsView } from './payments-view';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; status?: string; method?: string }> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const r = resolveRange(sp, '30d');
  const supabase = await getServerClient();
  let q = supabase.from('report_payments').select('*').gte('created_at', r.fromTs).lte('created_at', r.toTs).order('created_at', { ascending: false }).limit(5000);
  if (sp.status) q = q.eq('status', sp.status as 'success');
  if (sp.method) q = q.eq('method', sp.method as 'upi');
  const [{ data }, events] = await Promise.all([q, supabase.from('payment_events').select('id, provider, event_type, status, received_at, error').order('received_at', { ascending: false }).limit(50)]);
  return (
    <>
      <PageHeader title="Payments" description="Every collection across UPI, cards, net banking, mandates and cash — with gateway events for reconciliation." />
      <FilterBar defaultRange="30d">
        <SelectFilter name="status" label="Status" options={['success', 'pending', 'failed', 'refunded', 'initiated'].map((s) => ({ value: s, label: s }))} />
        <SelectFilter name="method" label="Method" options={['upi', 'card', 'netbanking', 'mandate', 'cash'].map((s) => ({ value: s, label: s }))} />
      </FilterBar>
      <PaymentsView rows={data ?? []} events={events.data ?? []} />
    </>
  );
}
