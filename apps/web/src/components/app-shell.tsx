'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Menu, Search, X } from 'lucide-react';
import { canAccess, WEB_NAV, type AppRole } from '@teamnest/types';
import { cn } from '@/lib/utils';
import { Icon } from './icon';
import { Logo } from './logo';
import { RegionSwitcher, type RegionOption } from './region-switcher';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { UserMenu } from './user-menu';

export interface ShellUser {
  name: string;
  email: string;
  role: AppRole;
  avatarUrl: string | null;
  orgName: string;
}

export function AppShell({
  user, regions, currentRegion, unread, children,
}: { user: ShellUser; regions: RegionOption[]; currentRegion: string | null; unread: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = WEB_NAV.map((s) => ({ ...s, items: s.items.filter((i) => canAccess(user.role, i.module)) })).filter(
    (s) => s.items.length,
  );
  // the longest nav href that prefixes the current path wins (so /leads/queues doesn't also light up /leads)
  const activeHref = sections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-border bg-surface transition-transform duration-base ease-standard lg:translate-x-0',
          open ? 'translate-x-0 shadow-raised' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" aria-label="TeamNest home"><Logo /></Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </div>
        <div className="px-5 pb-3 text-xs font-medium text-text-muted">{user.orgName}</div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">{section.title}</div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group flex h-10 items-center gap-3 rounded-sm px-2.5 text-sm font-medium transition-colors',
                          active ? 'bg-primary-soft text-primary-text' : 'text-text-muted hover:bg-surface-muted hover:text-text',
                        )}
                      >
                        <Icon name={item.icon} className={cn('size-[18px]', active ? 'text-primary-text' : 'text-text-subtle group-hover:text-text')} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.phase > 1 && (
                          <span className="rounded-full bg-surface-muted px-1.5 text-[10px] font-semibold text-text-muted">P{item.phase}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      {/* Top bar */}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <RegionSwitcher regions={regions} current={currentRegion} />
          <form role="search" className="relative ml-1 hidden max-w-md flex-1 md:block" action="/search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search leads, employees, invoices…"
              aria-label="Global search"
              className="h-9 w-full rounded-sm border border-border bg-surface-muted pl-9 pr-14 text-sm placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 text-[10px] font-medium text-text-muted">
              /
            </kbd>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
              <Link href="/notifications"><Bell />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-[10px] font-bold leading-4 text-on-highlight">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              </Link>
            </Button>
            <ThemeToggle />
            <div className="mx-1 h-6 w-px bg-border" aria-hidden />
            <UserMenu name={user.name} email={user.email} role={user.role} avatarUrl={user.avatarUrl} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
