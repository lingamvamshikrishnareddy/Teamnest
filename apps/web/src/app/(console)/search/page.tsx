import type { Metadata } from 'next';
import Link from 'next/link';
import { Contact, FileText, Handshake, Users } from 'lucide-react';
import { canAccess } from '@teamnest/types';
import { formatDate, formatINR, formatPhone } from '@teamnest/ui';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireConsoleSession();
  const q = ((await searchParams).q ?? '').trim().slice(0, 80);
  const role = session.user.role;
  if (q.length < 2) return <><PageHeader title="Search" /><EmptyState icon={Contact} title="Type at least 2 characters" description="Search leads by name, ID or phone; people by name or code; deals and invoices by number." /></>;

  const supabase = await getServerClient();
  const like = `%${q.replace(/[%,()]/g, ' ')}%`;
  const digits = q.replace(/\D/g, '');
  const [leads, people, deals, invoices] = await Promise.all([
    canAccess(role, 'leads')
      ? supabase.from('leads').select('id, business_name, lead_code, phone, city, status').or(digits.length >= 4 ? `phone_normalized.like.%${digits.slice(-10)}%,business_name.ilike.${like}` : `business_name.ilike.${like},lead_code.ilike.${like}`).limit(15)
      : Promise.resolve({ data: [] as { id: string; business_name: string; lead_code: string; phone: string; city: string | null; status: string }[] }),
    supabase.from('users').select('id, full_name, email, role, employees(id, employee_code)').or(`full_name.ilike.${like},email.ilike.${like}`).limit(10),
    canAccess(role, 'leads') || canAccess(role, 'finance.payments')
      ? supabase.from('deals').select('id, deal_no, contract_value, status, lead:leads(id, business_name)').ilike('deal_no', like).limit(10)
      : Promise.resolve({ data: [] as never[] }),
    canAccess(role, 'finance.invoices') ? supabase.from('invoices').select('id, invoice_no, kind, total, issued_at').ilike('invoice_no', like).limit(10) : Promise.resolve({ data: [] as never[] }),
  ]);
  const total = (leads.data?.length ?? 0) + (people.data?.length ?? 0) + (deals.data?.length ?? 0) + (invoices.data?.length ?? 0);

  return (
    <>
      <PageHeader title={`Results for “${q}”`} description={`${total} match${total === 1 ? '' : 'es'}`} />
      {total === 0 && <EmptyState icon={Contact} title="No matches" description="Try a phone number, lead ID (TN-…), deal number (DL-…) or invoice number (INV-…)." />}
      <div className="grid gap-6 lg:grid-cols-2">
        {!!leads.data?.length && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Contact className="size-4" /> Leads</CardTitle></CardHeader>
            <CardContent className="space-y-1">{leads.data.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-surface-muted">
                <span><strong>{l.business_name}</strong> <span className="text-text-muted">· {l.lead_code} · {formatPhone(l.phone)}</span></span><Badge>{l.status}</Badge>
              </Link>
            ))}</CardContent></Card>
        )}
        {!!people.data?.length && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> People</CardTitle></CardHeader>
            <CardContent className="space-y-1">{people.data.map((u) => {
              const emp = Array.isArray(u.employees) ? u.employees[0] : u.employees;
              const href = canAccess(role, 'hr.employees') && emp ? `/hr/employees/${emp.id}` : undefined;
              const inner = <><span><strong>{u.full_name}</strong> <span className="text-text-muted">· {emp?.employee_code} · {u.email}</span></span><Badge tone="primary">{u.role.replace('_', ' ')}</Badge></>;
              return href ? <Link key={u.id} href={href} className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-surface-muted">{inner}</Link> : <div key={u.id} className="flex items-center justify-between px-2 py-1.5 text-sm">{inner}</div>;
            })}</CardContent></Card>
        )}
        {!!deals.data?.length && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Handshake className="size-4" /> Deals</CardTitle></CardHeader>
            <CardContent className="space-y-1">{deals.data.map((d: { id: string; deal_no: string; contract_value: number; status: string; lead: { id: string; business_name: string } | null }) => (
              <Link key={d.id} href={d.lead ? `/leads/${d.lead.id}` : '#'} className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-surface-muted">
                <span><strong>{d.deal_no}</strong> <span className="text-text-muted">· {d.lead?.business_name}</span></span><span>{formatINR(Number(d.contract_value))}</span>
              </Link>
            ))}</CardContent></Card>
        )}
        {!!invoices.data?.length && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Invoices</CardTitle></CardHeader>
            <CardContent className="space-y-1">{invoices.data.map((i: { id: string; invoice_no: string; kind: string; total: number; issued_at: string }) => (
              <Link key={i.id} href={`/finance/invoices?range=custom&from=${i.issued_at.slice(0, 10)}&to=${i.issued_at.slice(0, 10)}`} className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-surface-muted">
                <span><strong>{i.invoice_no}</strong> <span className="text-text-muted">· {i.kind} · {formatDate(i.issued_at)}</span></span><span>{formatINR(Number(i.total))}</span>
              </Link>
            ))}</CardContent></Card>
        )}
      </div>
    </>
  );
}
