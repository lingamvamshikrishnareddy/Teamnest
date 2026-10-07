import type { Metadata } from 'next';
import Link from 'next/link';
import { FileBarChart, IndianRupee, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { REPORTS } from './registry';

export const metadata: Metadata = { title: 'Reports' };
const ICON = { Sales: FileBarChart, Payments: IndianRupee, People: Users };

export default async function ReportsIndex() {
  await requireConsoleSession();
  return (
    <>
      <PageHeader title="Reports" description="Every report supports date ranges, filters, search and CSV / Excel export. You only see data you have access to." />
      {(['Sales', 'Payments', 'People'] as const).map((g) => {
        const Icon = ICON[g];
        return (
          <section key={g} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted"><Icon className="size-4" /> {g}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <Link key={r.key} href={`/reports/${r.key}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-card">
                  <Card className="h-full p-4 transition-shadow hover:shadow-raised">
                    <div className="font-semibold">{r.title}</div>
                    <div className="mt-1 text-sm text-text-muted">{r.description}</div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
