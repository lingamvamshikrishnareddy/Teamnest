'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function MonthPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <input
      type="month"
      aria-label="Month"
      value={value}
      max={new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7)}
      onChange={(e) => {
        const n = new URLSearchParams(sp.toString());
        n.set('month', e.target.value);
        router.replace(`${pathname}?${n}`);
      }}
      className="h-9 rounded-sm border border-border-strong bg-surface px-2 text-sm"
    />
  );
}
