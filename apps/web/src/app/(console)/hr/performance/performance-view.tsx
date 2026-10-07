'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatINRCompact, formatNumber, formatPercent } from '@teamnest/ui';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldRow, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

type Goal = { id: string; user_id: string; name: string; kra: string; title: string; metric_key: string | null; auto_source: boolean; target_value: number; achieved_value: number; weightage_pct: number };
type Appraisal = { id: string; user_id: string; name: string; status: string; self_score: number | null; manager_score: number | null; final_score: number | null; strengths: string | null; improvements: string | null };

const fmt = (k: string | null, v: number) => (k === 'revenue' || k === 'collections' ? formatINRCompact(v) : k === 'autopay_pct' ? formatPercent(v, 0) : formatNumber(v, v % 1 ? 1 : 0));

export function PerformanceView({ cycles, cycleId, goals, appraisals, isHr }: { cycles: { id: string; name: string; status: string }[]; cycleId: string | null; goals: Goal[]; appraisals: Appraisal[]; isHr: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { run, busy } = useAction();
  const supabase = getBrowserClient();
  const [review, setReview] = useState<Appraisal | null>(null);

  const people = [...new Map(goals.map((g) => [g.user_id, g.name])).entries()].map(([id, name]) => {
    const own = goals.filter((g) => g.user_id === id);
    const w = own.reduce((a, g) => a + Number(g.weightage_pct), 0);
    const score = w ? (own.reduce((a, g) => a + Math.min(Number(g.achieved_value) / Math.max(Number(g.target_value), 0.0001), 1.2) * Number(g.weightage_pct), 0) / w) * 100 : 0;
    return { id, name, score, goals: own };
  }).sort((a, b) => b.score - a.score);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Cycle" value={cycleId ?? ''} onChange={(e) => router.replace(`${pathname}?cycle=${e.target.value}`)} className="h-9 w-auto">
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
        </Select>
        <Button variant="outline" size="sm" disabled={busy === 'r'} onClick={() => run('r', async () => { const { data, error } = await supabase.rpc('refresh_auto_goals', { p_cycle_id: cycleId ?? undefined }); if (error) throw error; return Number(data); }, (n) => `${n} goals refreshed from sales data`)}><RefreshCw /> Refresh live goals</Button>
      </div>
      <Tabs defaultValue="goals">
        <TabsList><TabsTrigger value="goals">Goals & scores</TabsTrigger><TabsTrigger value="appraisals">Appraisals</TabsTrigger></TabsList>
        <TabsContent value="goals">
          <DataTable rows={people} rowKey={(p) => p.id} exportName="goal-scores"
            expand={(p) => (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-text-muted"><tr className="text-left"><th className="py-1">KRA</th><th>Goal</th><th className="text-right">Weight</th><th className="text-right">Achieved</th><th className="text-right">Target</th><th className="text-right">%</th></tr></thead>
                <tbody>{p.goals.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="py-1">{g.kra}</td><td>{g.title}{g.auto_source ? <Badge tone="accent" className="ml-1">live</Badge> : null}</td>
                    <td className="text-right">{g.weightage_pct}%</td><td className="text-right font-semibold tabular-nums">{fmt(g.metric_key, Number(g.achieved_value))}</td>
                    <td className="text-right tabular-nums">{fmt(g.metric_key, Number(g.target_value))}</td>
                    <td className="text-right tabular-nums">{formatPercent((Number(g.achieved_value) / Math.max(Number(g.target_value), 0.0001)) * 100, 0)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            columns={[
              { key: 'name', header: 'Employee' },
              { key: 'goals', header: 'Goals', align: 'right', value: (p) => p.goals.length },
              { key: 'score', header: 'Weighted achievement', align: 'right', value: (p) => p.score, cell: (p) => (
                <span className="inline-flex items-center gap-2"><span className="h-2 w-24 overflow-hidden rounded-full bg-surface-muted"><span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.min(p.score, 100)}%` }} /></span>{formatPercent(p.score, 0)}</span>
              ) },
            ]} />
        </TabsContent>
        <TabsContent value="appraisals">
          <DataTable rows={appraisals} rowKey={(a) => a.id} onRowClick={(a) => setReview(a)} exportName="appraisals" columns={[
            { key: 'name', header: 'Employee' },
            { key: 'status', header: 'Stage', cell: (a) => <Badge tone={a.status === 'closed' ? 'success' : a.status === 'manager_review' ? 'warning' : 'neutral'}>{a.status.replace('_', ' ')}</Badge> },
            { key: 'self_score', header: 'Self', align: 'right', value: (a) => a.self_score },
            { key: 'manager_score', header: 'Manager', align: 'right', value: (a) => a.manager_score },
            { key: 'final_score', header: 'Final', align: 'right', value: (a) => a.final_score },
          ]} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent wide title={`Review · ${review?.name ?? ''}`}>
          {review && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Manager score (0–5)" htmlFor="ms"><Input id="ms" type="number" min={0} max={5} step={0.1} value={review.manager_score ?? ''} onChange={(e) => setReview({ ...review, manager_score: e.target.value ? Number(e.target.value) : null })} /></FieldRow>
              <FieldRow label="Stage" htmlFor="st"><Select id="st" value={review.status} onChange={(e) => setReview({ ...review, status: e.target.value })}>{['not_started', 'self_review', 'manager_review', 'calibration', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></FieldRow>
              <FieldRow label="Strengths" htmlFor="sg"><Textarea id="sg" value={review.strengths ?? ''} onChange={(e) => setReview({ ...review, strengths: e.target.value })} /></FieldRow>
              <FieldRow label="Areas to improve" htmlFor="im"><Textarea id="im" value={review.improvements ?? ''} onChange={(e) => setReview({ ...review, improvements: e.target.value })} /></FieldRow>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
                <Button disabled={busy === 'a'} onClick={() => run('a', async () => {
                  const closing = review.status === 'closed';
                  const { error } = await supabase.from('appraisals').update({ manager_score: review.manager_score, status: review.status as 'closed', strengths: review.strengths, improvements: review.improvements, final_score: closing && isHr ? review.manager_score : review.final_score, closed_at: closing ? new Date().toISOString() : null }).eq('id', review.id);
                  if (error) throw error;
                  setReview(null);
                  return true;
                }, 'Review saved')}>Save review</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
