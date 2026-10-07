import type { Metadata } from 'next';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { InvoicesView } from './invoices-view';

export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; kind?: string }> }) {
  const session = await requireConsoleSession();
  const sp = await searchParams;
  const r = resolveRange(sp, 'month');
  const supabase = await getServerClient();
  let q = supabase.from('invoices').select('*, deal:deals(deal_no, package:packages!deals_package_id_fkey(name, tenure_months))').gte('issued_at', r.fromTs).lte('issued_at', r.toTs).order('issued_at', { ascending: false }).limit(5000);
  if (sp.kind) q = q.eq('kind', sp.kind as 'tax');
  const { data } = await q;
  return (
    <>
      <PageHeader title="Invoices & receipts" description="Proforma and GST tax invoices. Open any invoice to print or save it as PDF." />
      <FilterBar><SelectFilter name="kind" label="Kind" options={[{ value: 'tax', label: 'Tax invoice' }, { value: 'proforma', label: 'Proforma' }]} /></FilterBar>
      <InvoicesView rows={data ?? []} org={{ name: session.organization.name, legalName: session.organization.legal_name, gstin: session.organization.gstin }} />
    </>
  );
}
