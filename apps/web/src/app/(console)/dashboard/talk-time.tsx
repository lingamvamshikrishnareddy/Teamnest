'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDuration, formatINRCompact, formatNumber, formatPercent } from '@teamnest/ui';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface PersonActivity {
  userId: string;
  name: string;
  team: string | null;
  days: number;
  calls: number;
  connected: number;
  talkSec: number;
  visits: number;
  meetings: number;
  deals: number;
  revenue: number;
  targets: Record<string, number>;
}

/** Talk Time: expandable employee rows with Metric | Achieved | Target. Average vs total toggle. */
export function TalkTimeTable({ people }: { people: PersonActivity[] }) {
  const [mode, setMode] = useState<'total' | 'average'>('total');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const v = (p: PersonActivity, n: number) => (mode === 'average' ? n / Math.max(p.days, 1) : n);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div><CardTitle>Talk time</CardTitle><CardDescription className="mt-1">Click a person to drill down. {mode === 'average' ? 'Per working day.' : 'Totals for the period.'}</CardDescription></div>
        <div className="flex rounded-sm bg-surface-muted p-0.5 text-sm" role="group" aria-label="Show">
          {(['total', 'average'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('rounded-xs px-3 py-1 capitalize', mode === m && 'bg-surface shadow-sm')}>{m}</button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-text-muted"><tr className="text-left">
            <th className="py-2">Employee</th><th className="text-right">Calls</th><th className="text-right">Connected</th><th className="text-right">Talk time</th><th className="hidden text-right md:table-cell">Visits</th><th className="text-right">Deals</th>
          </tr></thead>
          <tbody>
            {people.map((p) => {
              const isOpen = open.has(p.userId);
              const metrics: [string, string, string][] = [
                ['Calls', formatNumber(v(p, p.calls), mode === 'average' ? 1 : 0), p.targets.calls ? formatNumber(p.targets.calls) : '—'],
                ['Talk time', formatDuration(v(p, p.talkSec)), p.targets.talk_time_min ? formatDuration(p.targets.talk_time_min * 60 * (mode === 'average' ? 1 / 26 : 1)) : '—'],
                ['Visits', formatNumber(v(p, p.visits), mode === 'average' ? 1 : 0), p.targets.visits ? formatNumber(p.targets.visits * (mode === 'average' ? 1 / 26 : 1), mode === 'average' ? 1 : 0) : '—'],
                ['Meetings', formatNumber(v(p, p.meetings), mode === 'average' ? 1 : 0), '—'],
                ['Deals', formatNumber(p.deals), p.targets.deals ? formatNumber(p.targets.deals) : '—'],
                ['Revenue', formatINRCompact(p.revenue), p.targets.revenue ? formatINRCompact(p.targets.revenue) : '—'],
              ];
              return (
                <Fragment key={p.userId}>
                  <tr className="cursor-pointer border-t border-border hover:bg-surface-muted/40" onClick={() => toggle(p.userId)} aria-expanded={isOpen}>
                    <td className="py-2.5"><span className="flex items-center gap-1.5 font-medium">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{p.name}</span><span className="pl-6 text-xs text-text-muted">{p.team}</span></td>
                    <td className="text-right tabular-nums">{formatNumber(v(p, p.calls), mode === 'average' ? 1 : 0)}</td>
                    <td className="text-right tabular-nums">{formatPercent(p.calls ? (p.connected / p.calls) * 100 : 0, 0)}</td>
                    <td className="text-right tabular-nums">{formatDuration(v(p, p.talkSec))}</td>
                    <td className="hidden text-right tabular-nums md:table-cell">{formatNumber(v(p, p.visits), mode === 'average' ? 1 : 0)}</td>
                    <td className="text-right tabular-nums">{p.deals}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-surface-muted/40">
                      <td colSpan={6} className="px-6 py-3">
                        <table className="w-full max-w-md text-sm">
                          <thead className="text-xs uppercase text-text-muted"><tr className="text-left"><th className="py-1">Metric</th><th className="text-right">Achieved</th><th className="text-right">Target</th></tr></thead>
                          <tbody>{metrics.map(([m, a, t]) => <tr key={m} className="border-t border-border"><td className="py-1">{m}</td><td className="text-right font-semibold tabular-nums">{a}</td><td className="text-right tabular-nums text-text-muted">{t}</td></tr>)}</tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!people.length && <tr><td colSpan={6} className="py-8 text-center text-text-muted">No activity in this period.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
