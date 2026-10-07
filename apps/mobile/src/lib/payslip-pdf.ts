import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatINR, formatMonth } from '@teamnest/ui';

interface Comp { code: string; label: string; amount: number }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function sharePayslipPdf(p: {
  org: string; name: string; code: string; designation: string; month: string; paidDays: number; lopDays: number;
  earnings: Comp[]; deductions: Comp[]; gross: number; totalDeductions: number; net: number; bankMasked?: string;
}) {
  const rows = Math.max(p.earnings.length, p.deductions.length);
  const m = (n: number) => esc(formatINR(n, { decimals: 0 }));
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:Inter,-apple-system,Roboto,sans-serif;margin:32px;color:#121926;font-size:12px}
    h1{color:#2563EB;font-size:20px;margin:0} .muted{color:#4B5565} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:7px 8px;border-bottom:1px solid #E3E8EF;text-align:left} th{background:#F4F6FA;font-size:11px;text-transform:uppercase;color:#4B5565}
    .r{text-align:right} .net{margin-top:18px;background:#EFF5FF;border-radius:8px;padding:14px;font-size:16px;font-weight:700;display:flex;justify-content:space-between}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-top:14px}
  </style></head><body>
  <h1>Payslip · ${esc(formatMonth(p.month))}</h1><div class="muted">${esc(p.org)}</div>
  <div class="grid"><div>Employee: <b>${esc(p.name)}</b></div><div>Code: <b>${esc(p.code)}</b></div>
  <div>Designation: ${esc(p.designation)}</div><div>Paid days: ${p.paidDays}${p.lopDays ? ` (LOP ${p.lopDays})` : ''}</div>
  ${p.bankMasked ? `<div>Bank A/c: ${esc(p.bankMasked)}</div>` : ''}</div>
  <table><thead><tr><th>Earnings</th><th class="r">Amount</th><th>Deductions</th><th class="r">Amount</th></tr></thead><tbody>
  ${Array.from({ length: rows }).map((_, i) => `<tr><td>${esc(p.earnings[i]?.label ?? '')}</td><td class="r">${p.earnings[i] ? m(p.earnings[i]!.amount) : ''}</td><td>${esc(p.deductions[i]?.label ?? '')}</td><td class="r">${p.deductions[i] ? m(p.deductions[i]!.amount) : ''}</td></tr>`).join('')}
  <tr><th>Gross</th><th class="r">${m(p.gross)}</th><th>Total deductions</th><th class="r">${m(p.totalDeductions)}</th></tr>
  </tbody></table>
  <div class="net"><span>Net pay</span><span>${m(p.net)}</span></div>
  <p class="muted" style="font-size:10px;margin-top:24px">Computer-generated payslip; no signature required.</p></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
