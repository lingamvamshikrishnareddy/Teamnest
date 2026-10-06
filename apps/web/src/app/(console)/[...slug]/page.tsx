import { notFound } from 'next/navigation';
import { Hammer } from 'lucide-react';
import { canAccess, WEB_NAV } from '@teamnest/types';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';

/** Placeholder for console modules scheduled in later phases. */
export default async function ComingSoon({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const href = `/${slug.join('/')}`;
  const item = WEB_NAV.flatMap((s) => s.items).find((i) => i.href === href);
  if (!item) notFound();

  const session = await requireConsoleSession();
  if (!canAccess(session.user.role, item.module)) notFound();

  return (
    <>
      <PageHeader title={item.label} />
      <EmptyState
        icon={Hammer}
        title={`Arriving in Phase ${item.phase}`}
        description="The data model, security rules and demo data for this module are already in place. The screens are built in their phase."
      />
    </>
  );
}
