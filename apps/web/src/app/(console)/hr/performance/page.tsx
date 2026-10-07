import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { PerformanceView } from './performance-view';

export const metadata: Metadata = { title: 'Performance' };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const session = await requireConsoleSession();
  const sp = await searchParams;
  const supabase = await getServerClient();
  const { data: cycles } = await supabase.from('appraisal_cycles').select('*').order('period_start', { ascending: false });
  const cycle = cycles?.find((c) => c.id === sp.cycle) ?? cycles?.find((c) => c.status === 'active') ?? cycles?.[0];
  const [goals, appraisals] = cycle
    ? await Promise.all([
        supabase.from('goals').select('id, user_id, kra, title, metric_key, auto_source, target_value, achieved_value, weightage_pct, user:users!goals_user_id_fkey(full_name)').eq('cycle_id', cycle.id),
        supabase.from('appraisals').select('id, user_id, status, self_score, manager_score, final_score, strengths, improvements, user:users!appraisals_user_id_fkey(full_name)').eq('cycle_id', cycle.id),
      ])
    : [{ data: [] }, { data: [] }];
  return (
    <>
      <PageHeader title="Performance" description="KRA/KPI goals auto-filled from live sales data, weighted scores and appraisal reviews." />
      <PerformanceView
        cycles={(cycles ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        cycleId={cycle?.id ?? null}
        goals={(goals.data ?? []).map((g) => ({ ...g, name: (g.user as { full_name?: string } | null)?.full_name ?? '' }))}
        appraisals={(appraisals.data ?? []).map((a) => ({ ...a, name: (a.user as { full_name?: string } | null)?.full_name ?? '' }))}
        isHr={session.user.role === 'hr_admin'}
      />
    </>
  );
}
