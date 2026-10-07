'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import { RANGE_PRESETS } from '@/lib/date-range';
import { cn } from '@/lib/utils';

/** Date presets + custom range + slot for dimension filters, all in one row; state lives in the URL. */
export function FilterBar({ children, showRange = true, defaultRange = 'month' }: { children?: ReactNode; showRange?: boolean; defaultRange?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const range = sp.get('range') ?? (sp.get('from') ? 'custom' : defaultRange);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    next.delete('page');
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
      {showRange && (
        <>
          <div className="flex flex-wrap items-center gap-1 rounded-sm bg-surface-muted p-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set({ range: p.value, from: null, to: null })}
                aria-pressed={range === p.value}
                className={cn('h-8 rounded-xs px-3 text-sm font-medium transition-colors', range === p.value ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CalendarRange className="size-4 text-text-subtle" aria-hidden />
            <input type="date" aria-label="From date" defaultValue={sp.get('from') ?? ''} onChange={(e) => e.target.value && set({ range: 'custom', from: e.target.value, to: sp.get('to') ?? e.target.value })}
              className="h-9 rounded-sm border border-border-strong bg-surface px-2 text-sm" />
            <span className="text-text-subtle">–</span>
            <input type="date" aria-label="To date" defaultValue={sp.get('to') ?? ''} onChange={(e) => e.target.value && set({ range: 'custom', to: e.target.value, from: sp.get('from') ?? e.target.value })}
              className="h-9 rounded-sm border border-border-strong bg-surface px-2 text-sm" />
          </div>
        </>
      )}
      {children}
      {pending && <Loader2 className="size-4 animate-spin text-text-muted" aria-label="Updating" />}
    </div>
  );
}

/** URL-backed <select> filter for use inside FilterBar. */
export function SelectFilter({ name, label, options, allLabel = 'All' }: { name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  return (
    <select
      aria-label={label}
      value={sp.get(name) ?? ''}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        next.delete('page');
        start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
      }}
      className="h-9 rounded-sm border border-border-strong bg-surface px-2 pr-7 text-sm"
    >
      <option value="">{label}: {allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
