import { formatDate, formatINR } from './format';

/** Proforma / tax invoice / receipt HTML shared by web (print) and mobile (PDF). */
export interface InvoiceDoc {
  kind: 'proforma' | 'tax' | 'receipt';
  number: string;
  issuedAt: string;
  org: { name: string; legalName?: string | null; gstin?: string | null };
  billTo: { name?: string; address?: string; gstin?: string; phone?: string };
  lines: { description: string; amount: number }[];
  discount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total: number;
  paymentNote?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => esc(formatINR(n, { decimals: 2 }));

export function invoiceHtml(d: InvoiceDoc) {
  const title = d.kind === 'proforma' ? 'Proforma Invoice' : d.kind === 'tax' ? 'Tax Invoice' : 'Payment Receipt';
  const subtotal = d.lines.reduce((a, l) => a + l.amount, 0);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:Inter,-apple-system,Roboto,'Noto Sans',sans-serif;color:#121926;margin:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563EB;padding-bottom:16px}
    h1{font-size:22px;margin:0;color:#2563EB} .muted{color:#4B5565} table{width:100%;border-collapse:collapse;margin-top:20px}
    th{text-align:left;background:#F4F6FA;padding:8px;font-size:11px;text-transform:uppercase;color:#4B5565}
    td{padding:8px;border-bottom:1px solid #E3E8EF} .r{text-align:right} .total td{font-weight:700;font-size:14px;border-top:2px solid #121926}
    .box{background:#F4F6FA;border-radius:8px;padding:12px;margin-top:16px} .foot{margin-top:28px;font-size:10px;color:#667085}
  </style></head><body>
  <div class="top">
    <div><h1>${esc(title)}</h1><div class="muted">No. ${esc(d.number)} · ${esc(formatDate(d.issuedAt))}</div></div>
    <div class="r"><strong>${esc(d.org.legalName ?? d.org.name)}</strong>${d.org.gstin ? `<div class="muted">GSTIN ${esc(d.org.gstin)}</div>` : ''}</div>
  </div>
  <div class="box"><div class="muted">Bill to</div><strong>${esc(d.billTo.name)}</strong>
    ${d.billTo.address ? `<div>${esc(d.billTo.address)}</div>` : ''}${d.billTo.gstin ? `<div>GSTIN ${esc(d.billTo.gstin)}</div>` : ''}${d.billTo.phone ? `<div>${esc(d.billTo.phone)}</div>` : ''}</div>
  <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
    ${d.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
    ${d.discount ? `<tr><td>Discount</td><td class="r">− ${money(d.discount)}</td></tr>` : ''}
    ${d.kind !== 'receipt' ? `<tr><td>Taxable value</td><td class="r">${money(subtotal - (d.discount ?? 0))}</td></tr>` : ''}
    ${d.cgst ? `<tr><td>CGST 9%</td><td class="r">${money(d.cgst)}</td></tr>` : ''}
    ${d.sgst ? `<tr><td>SGST 9%</td><td class="r">${money(d.sgst)}</td></tr>` : ''}
    ${d.igst ? `<tr><td>IGST 18%</td><td class="r">${money(d.igst)}</td></tr>` : ''}
    <tr class="total"><td>${d.kind === 'receipt' ? 'Amount received' : 'Total'}</td><td class="r">${money(d.total)}</td></tr>
  </tbody></table>
  ${d.paymentNote ? `<div class="box">${esc(d.paymentNote)}</div>` : ''}
  <div class="foot">This is a computer-generated document and does not require a signature.</div>
  </body></html>`;
}

