'use client';

import Link from 'next/link';
import { Lock, LockOpen } from 'lucide-react';
import { formatTime } from '@teamnest/ui';
import { SummaryChips } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { exportCsv } from '@/lib/export';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';

type Row = { user_id: string; day: string; status: string; is_late: boolean; source: string; punch_in_at: string | null; punch_out_at: string | null; work_minutes: number | null };
const CODE: Record<string, { c: string; cls: string; label: string }> = {
  present: { c: 'P', cls: 'bg-kpi-green text-kpi-green-fg', label: 'Present' },
  half_day: { c: '½', cls: 'bg-kpi-amber text-kpi-amber-fg', label: 'Half day' },
  absent: { c: 'A', cls: 'bg-kpi-pink text-kpi-pink-fg', label: 'Absent' },
  on_leave: { c: 'L', cls: 'bg-kpi-sky text-kpi-sky-fg', label: 'Leave' },
  holiday: { c: 'H', cls: 'bg-kpi-blue text-kpi-blue-fg', label: 'Holiday' },
  week_off: { c: '·', cls: 'text-text-subtle', label: 'Week off' },
};

export function Register({ month, people, rows, lockedAt, canLock, pendingCorrections }: {
  month: { key: string; start: string; days: number }; people: { id: string; name: string; code: string }[]; rows: Row[]; lockedAt: string | null; canLock: boolean; pendingCorrections: number;
}) {
  const { run, busy } = useAction();
  const map = new Map(rows.map((r) => [`${r.user_id}|${r.day}`, r]));
  const days = Array.from({ length: month.days }, (_, i) => `${month.key}-${String(i + 1).padStart(2, '0')}`);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  const exportIt = () => exportCsv(people, [
    { header: 'Code', value: (p) => p.code }, { header: 'Name', value: (p) => p.name },
    ...days.map((d) => ({ header: d.slice(8), value: (p: { id: string }) => CODE[map.get(`${p.id}|${d}`)?.status ?? '']?.c ?? '' })),
    { header: 'Present', value: (p) => days.filter((d) => map.get(`${p.id}|${d}`)?.status === 'present').length },
  ], `attendance-${month.key}`);

  return (
    <>
      <SummaryChips items={[
        { label: 'Present days', value: String(count('present')), tone: 'success' }, { label: 'Absences', value: String(count('absent')), tone: 'danger' },
        { label: 'Leave days', value: String(count('on_leave')), tone: 'accent' }, { label: 'Late marks', value: String(rows.filter((r) => r.is_late).length), tone: 'highlight' },
      ]} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pendingCorrections > 0 && <Link href="/approvals" className="rounded-sm bg-warning-soft px-3 py-2 text-sm text-warning">{pendingCorrections} punch correction(s) waiting for approval</Link>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportIt}>Export register</Button>
          {canLock && (lockedAt ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-3 py-1.5 text-sm"><Lock className="size-4" /> Locked</span>
          ) : (
            <Button size="sm" disabled={busy === 'lock'} onClick={() => confirm(`Lock ${month.key}? Attendance becomes read-only for payroll.`) && run('lock', async () => { const { error } = await getBrowserClient().rpc('lock_attendance_month', { p_month: month.start }); if (error) throw error; return true; }, 'Month locked')}>
              <LockOpen /> Lock month
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-card border border-border/70 bg-surface shadow-card">
        <table className="text-xs">
          <caption className="sr-only">Attendance register</caption>
          <thead className="bg-surface-muted/60 text-text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-muted px-3 py-2 text-left">Employee</th>
              {days.map((d) => {
                const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                return <th key={d} className={cn('w-8 px-0.5 py-2 text-center font-medium', wd === 0 && 'text-text-subtle')}>{Number(d.slice(8))}</th>;
              })}
              <th className="px-2 py-2 text-right">P</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">L</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const own = days.map((d) => map.get(`${p.id}|${d}`));
              return (
                <tr key={p.id} className="border-t border-border">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1.5 text-left font-medium">{p.name}<span className="block text-[10px] font-normal text-text-muted">{p.code}</span></th>
                  {own.map((r, i) => {
                    const c = r ? CODE[r.status] : null;
                    const tip = r ? `${days[i]} · ${c?.label}${r.punch_in_at ? ` · ${formatTime(r.punch_in_at)}–${r.punch_out_at ? formatTime(r.punch_out_at) : '…'}` : r.source !== 'punch' ? ` · ${r.source.replace('_', ' ')}` : ''}${r.is_late ? ' · late' : ''}` : days[i];
                    return (
                      <td key={i} className="p-0.5 text-center" title={tip}>
                        <span className={cn('inline-flex size-7 items-center justify-center rounded-xs font-semibold', c?.cls, r?.is_late && 'ring-2 ring-highlight')}>{c?.c ?? ''}</span>
                      </td>
                    );
                  })}
                  <td className="px-2 text-right font-semibold tabular-nums">{own.filter((r) => r?.status === 'present').length}</td>
                  <td className="px-2 text-right tabular-nums">{own.filter((r) => r?.status === 'absent').length}</td>
                  <td className="px-2 text-right tabular-nums">{own.filter((r) => r?.status === 'on_leave').length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted" aria-label="Legend">
        {Object.values(CODE).map((c) => <li key={c.label} className="flex items-center gap-1"><span className={cn('inline-flex size-5 items-center justify-center rounded-xs font-semibold', c.cls)}>{c.c}</span>{c.label}</li>)}
        <li className="flex items-center gap-1"><span className="inline-flex size-5 rounded-xs ring-2 ring-highlight" />Late</li>
      </ul>
    </>
  );
}
