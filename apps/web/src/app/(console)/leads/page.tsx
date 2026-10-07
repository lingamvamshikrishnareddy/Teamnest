import type { Metadata } from 'next';
import Link from 'next/link';
import { ListFilter, Upload } from 'lucide-react';
import { listLeads } from '@teamnest/api-client';
import type { LeadStatus } from '@teamnest/types';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { LeadsTable } from './leads-table';

export const metadata: Metadata = { title: 'Leads' };

type SP = { q?: string; status?: string; owner?: string; city?: string; segment?: string; tag?: string; chip?: string; page?: string; sort?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireConsoleSession();
  const sp = await searchParams;
  const supabase = await getServerClient();
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  const [result, owners, outcomes] = await Promise.all([
    listLeads(supabase, {
      search: sp.q,
      status: sp.status ? (sp.status.split(',') as LeadStatus[]) : undefined,
      ownerId: sp.owner === 'unassigned' ? null : sp.owner || undefined,
      city: sp.city || undefined,
      segment: (sp.segment as 'b2b' | 'b2c') || undefined,
      tag: sp.tag || undefined,
      chip: (sp.chip as 'today' | 'pending') || undefined,
      sort: (sp.sort as 'priority') || 'priority',
      page,
      pageSize: 50,
    }),
    supabase.from('users').select('id, full_name, role, territory_id').in('role', ['executive', 'team_lead']).eq('status', 'active').order('full_name'),
    supabase.from('outcome_codes').select('code, label, color'),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every lead you can see — your team’s, plus unassigned leads in your area."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/leads/queues"><ListFilter /> Queues</Link></Button>
            <Button asChild><Link href="/leads/import"><Upload /> Import</Link></Button>
          </>
        }
      />
      <FilterBar showRange={false}>
        <SelectFilter name="chip" label="Follow-up" options={[{ value: 'today', label: 'Due today' }, { value: 'pending', label: 'Overdue' }]} allLabel="Any" />
        <SelectFilter name="status" label="Status" options={['new', 'contacted', 'interested', 'meeting_set', 'negotiation', 'won', 'lost', 'dnc'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
        <SelectFilter name="owner" label="Owner" options={[{ value: 'unassigned', label: 'Unassigned' }, ...(owners.data ?? []).map((o) => ({ value: o.id, label: o.full_name }))]} allLabel="Anyone" />
        <SelectFilter name="city" label="City" options={['Hyderabad', 'Bengaluru', 'Pune'].map((c) => ({ value: c, label: c }))} />
        <SelectFilter name="segment" label="Segment" options={[{ value: 'b2b', label: 'B2B' }, { value: 'b2c', label: 'B2C' }]} />
        <SelectFilter name="tag" label="Tag" options={['Hot', 'New', 'Renewal', 'Phone Only', 'Auto-pay Failed'].map((t) => ({ value: t, label: t }))} />
      </FilterBar>
      <LeadsTable
        rows={result.rows}
        total={result.total}
        page={page}
        pageSize={result.pageSize}
        owners={(owners.data ?? []).map((o) => ({ id: o.id, name: o.full_name }))}
        outcomes={Object.fromEntries((outcomes.data ?? []).map((o) => [o.code, o.label]))}
        search={sp.q ?? ''}
      />
    </>
  );
}
