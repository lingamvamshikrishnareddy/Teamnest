import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { formatDate } from '@teamnest/ui';
import { FilterBar, SelectFilter } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { resolveRange } from '@/lib/date-range';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { reportByKey } from '../registry';
import { loadReport } from './data';
import { ReportTable } from './report-table';

type SP = { range?: string; from?: string; to?: string; team?: string; city?: string; status?: string };

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return { title: `${reportByKey(type)?.title ?? 'Report'} report` };
}

const STATUS_OPTIONS: Record<string, string[]> = {
  leads: ['new', 'contacted', 'interested', 'meeting_set', 'won', 'lost', 'dnc'],
  incentives: ['calculated', 'pending_approval', 'approved', 'paid', 'rejected'],
  mandates: ['initiated', 'pending_bank', 'active', 'rejected', 'cancelled'],
  finance: ['success', 'pending', 'failed', 'refunded'],
  leave: ['pending', 'approved', 'rejected', 'cancelled'],
};

export default async function ReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SP> }) {
  await requireConsoleSession();
  const [{ type }, sp] = await Promise.all([params, searchParams]);
  const def = reportByKey(type);
  if (!def) notFound();
  const r = resolveRange(sp, type === 'payroll' || type === 'headcount' ? 'month' : 'month');
  const supabase = await getServerClient();
  const [rows, teams, outcomeCodes] = await Promise.all([
    loadReport(supabase, type, r, { team: sp.team, city: sp.city, status: sp.status }),
    supabase.from('teams').select('id, name').order('name'),
    type === 'outcomes' ? supabase.from('outcome_codes').select('code, label').order('sort_order') : Promise.resolve({ data: [] as { code: string; label: string }[] }),
  ]);

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ChevronLeft className="size-4" /> Reports</Link>
      <PageHeader title={`${def.title} report`} description={`${def.description} · ${formatDate(r.from)} – ${formatDate(r.to)}`} />
      <FilterBar showRange={type !== 'headcount'}>
        {['sales', 'talk-time', 'attendance'].includes(type) && <SelectFilter name="team" label="Team" options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />}
        {['sales', 'talk-time', 'leads', 'finance'].includes(type) && <SelectFilter name="city" label="City" options={['Hyderabad', 'Bengaluru', 'Pune'].map((c) => ({ value: c, label: c }))} />}
        {STATUS_OPTIONS[type] && <SelectFilter name="status" label="Status" options={STATUS_OPTIONS[type]!.map((s) => ({ value: s, label: s.replace('_', ' ') }))} />}
      </FilterBar>
      <ReportTable type={type} title={def.title} rows={rows} outcomeCodes={outcomeCodes.data ?? []} filename={`${type}-${r.from}-to-${r.to}`} />
    </>
  );
}
