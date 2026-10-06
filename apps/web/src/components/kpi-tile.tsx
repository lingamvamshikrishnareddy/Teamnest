import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { KpiTone } from '@teamnest/ui';
import { formatPercent } from '@teamnest/ui';
import { cn } from '@/lib/utils';

const toneClass: Record<KpiTone, { bg: string; fg: string; icon: string }> = {
  blue: { bg: 'bg-kpi-blue', fg: 'text-kpi-blue-fg', icon: 'bg-kpi-blue-icon' },
  teal: { bg: 'bg-kpi-teal', fg: 'text-kpi-teal-fg', icon: 'bg-kpi-teal-icon' },
  orange: { bg: 'bg-kpi-orange', fg: 'text-kpi-orange-fg', icon: 'bg-kpi-orange-icon' },
  violet: { bg: 'bg-kpi-violet', fg: 'text-kpi-violet-fg', icon: 'bg-kpi-violet-icon' },
  pink: { bg: 'bg-kpi-pink', fg: 'text-kpi-pink-fg', icon: 'bg-kpi-pink-icon' },
  green: { bg: 'bg-kpi-green', fg: 'text-kpi-green-fg', icon: 'bg-kpi-green-icon' },
  amber: { bg: 'bg-kpi-amber', fg: 'text-kpi-amber-fg', icon: 'bg-kpi-amber-icon' },
  sky: { bg: 'bg-kpi-sky', fg: 'text-kpi-sky-fg', icon: 'bg-kpi-sky-icon' },
};

export interface KpiTileProps {
  label: string;
  value: string;
  tone: KpiTone;
  icon: LucideIcon;
  /** % change vs comparison period; null hides the trend. */
  change?: number | null;
  /** For metrics where down is good (e.g. bounce %). */
  inverse?: boolean;
  hint?: string;
  className?: string;
}

export function KpiTile({ label, value, tone, icon: IconCmp, change, inverse, hint, className }: KpiTileProps) {
  const t = toneClass[tone];
  const dir = change == null ? null : Math.abs(change) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? null : (dir === 'up') !== !!inverse;
  const Arrow = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <div className={cn('rounded-card p-4', t.bg, className)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-sm font-medium', t.fg)}>{label}</span>
        <span className={cn('inline-flex size-8 items-center justify-center rounded-sm', t.icon, t.fg)}>
          <IconCmp className="size-4" aria-hidden />
        </span>
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', t.fg)}>{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {dir && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full bg-surface/70 px-1.5 py-0.5 font-semibold',
              good === null ? 'text-text-muted' : good ? 'text-success' : 'text-danger',
            )}
          >
            <Arrow className="size-3" aria-hidden />
            {formatPercent(Math.abs(change!), 1)}
            <span className="sr-only">{dir === 'up' ? 'increase' : dir === 'down' ? 'decrease' : 'no change'}</span>
          </span>
        )}
        {hint && <span className={cn('opacity-80', t.fg)}>{hint}</span>}
      </div>
    </div>
  );
}
