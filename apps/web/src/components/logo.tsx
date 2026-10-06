import { cn } from '@/lib/utils';

/**
 * Original TeamNest mark: three nested arcs (a nest / a team gathered
 * around a point) with a highlight dot. Placeholder brand — swap freely.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="rgb(var(--tn-primary))" />
      <path d="M7 15.5a9 9 0 0 0 18 0" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.5 15.5a5.5 5.5 0 0 0 11 0" stroke="rgb(var(--tn-accent))" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="11" r="2.6" fill="rgb(var(--tn-highlight))" />
    </svg>
  );
}

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && <span className="text-lg font-bold tracking-tight">TeamNest</span>}
    </span>
  );
}
