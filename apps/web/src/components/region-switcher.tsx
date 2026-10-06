'use client';

import { Check, ChevronDown, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './ui/dropdown-menu';

export interface RegionOption {
  id: string;
  name: string;
}

/** City / region scope for dashboards and reports (stored in a cookie). */
export function RegionSwitcher({ regions, current }: { regions: RegionOption[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = regions.find((r) => r.id === current)?.name ?? 'All regions';

  const choose = (id: string | null) => {
    document.cookie = `tn_region=${id ?? ''}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={pending} aria-label="Switch region">
          <MapPin className="text-accent-text" />
          <span className="max-w-[9rem] truncate">{label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Region</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => choose(null)}>
          <Check className={current ? 'invisible' : ''} /> All regions
        </DropdownMenuItem>
        {regions.map((r) => (
          <DropdownMenuItem key={r.id} onSelect={() => choose(r.id)}>
            <Check className={current === r.id ? '' : 'invisible'} /> {r.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
