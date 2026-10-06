'use client';

import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, type AppRole } from '@teamnest/types';
import { getBrowserClient } from '@/lib/supabase/client';
import { Avatar } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function UserMenu({ name, email, role, avatarUrl }: { name: string; email: string; role: AppRole; avatarUrl: string | null }) {
  const router = useRouter();
  const signOut = async () => {
    await getBrowserClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <Avatar name={name} src={avatarUrl} size={32} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-xs text-text-muted">{ROLE_LABELS[role]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-sm font-semibold text-text">{name}</span>
          <span className="block truncate text-xs font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled><UserRound /> My profile</DropdownMenuItem>
        <DropdownMenuItem disabled><ShieldCheck /> Security & MFA</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="text-danger focus:text-danger"><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
