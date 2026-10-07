'use client';

import { Printer } from 'lucide-react';
import type { Tables } from '@teamnest/types';
import { formatDate, formatINR, formatINRCompact, invoiceHtml } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Inv = Tables<'invoices'> & { deal: { deal_no: string; package: { name: string; tenure_months: number } | null } | null };

export function InvoicesView({ rows, org }: { rows: Inv[]; org: { name: string; legalName: string | null; gstin: string | null } }) {
  const print = (i: Inv) => {
    const bill = (i.bill_to ?? {}) as { name?: string; address?: string; gstin?: string; phone?: string };
    const html = invoiceHtml({
      kind: i.kind, number: i.invoice_no, issuedAt: i.issued_at, org, billTo: bill,
      lines: [{ description: `${i.deal?.package?.name ?? 'Subscription'} · ${i.deal?.package?.tenure_months ?? ''} months (${i.deal?.deal_no ?? ''})`, amount: Number(i.subtotal) }],
      discount: Number(i.discount), cgst: Number(i.cgst), sgst: Number(i.sgst), igst: Number(i.igst), total: Number(i.total),
    });
    const w = window.open('', '_blank', 'noopener,width=900,height=1000');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const tax = rows.filter((r) => r.kind === 'tax');
  return (
    <>
      <SummaryChips items={[
        { label: 'Tax invoices', value: String(tax.length), tone: 'primary' },
        { label: 'Taxable value', value: formatINRCompact(tax.reduce((a, r) => a + Number(r.subtotal) - Number(r.discount), 0)) },
        { label: 'GST', value: formatINRCompact(tax.reduce((a, r) => a + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0)), tone: 'accent' },
        { label: 'Proforma', value: String(rows.length - tax.length) },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.id} exportName="invoices" columns={[
        { key: 'invoice_no', header: 'Number' },
        { key: 'kind', header: 'Kind', cell: (r) => <Badge tone={r.kind === 'tax' ? 'primary' : 'neutral'}>{r.kind}</Badge> },
        { key: 'issued_at', header: 'Date', cell: (r) => formatDate(r.issued_at) },
        { key: 'customer', header: 'Customer', value: (r) => (r.bill_to as { name?: string } | null)?.name ?? '' },
        { key: 'deal', header: 'Deal', value: (r) => r.deal?.deal_no ?? '', hideOnMobile: true },
        { key: 'gst', header: 'GST', align: 'right', value: (r) => Number(r.cgst) + Number(r.sgst) + Number(r.igst), cell: (r) => formatINR(Number(r.cgst) + Number(r.sgst) + Number(r.igst), { decimals: 2 }) },
        { key: 'total', header: 'Total', align: 'right', value: (r) => Number(r.total), cell: (r) => formatINR(Number(r.total), { decimals: 2 }) },
        { key: 'p', header: '', sortable: false, cell: (r) => <Button size="sm" variant="ghost" onClick={() => print(r)} aria-label={`Print ${r.invoice_no}`}><Printer /></Button> },
      ]} />
    </>
  );
}
