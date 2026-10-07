'use client';

import { formatDate, formatDuration, formatINR, formatINRCompact, formatNumber, formatPercent } from '@teamnest/ui';
import { DataTable, SummaryChips, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import type { ReportRow } from './data';

type R = ReportRow;
const n = (r: R, k: string) => Number(r[k] ?? 0);
const s = (r: R, k: string) => (r[k] == null ? '' : String(r[k]));
const money = (k: string, header: string): Column<R> => ({ key: k, header, align: 'right', value: (r) => n(r, k), cell: (r) => formatINR(n(r, k)) });
const num = (k: string, header: string): Column<R> => ({ key: k, header, align: 'right', value: (r) => n(r, k), cell: (r) => formatNumber(n(r, k)) });
const text = (k: string, header: string, hideOnMobile = false): Column<R> => ({ key: k, header, value: (r) => s(r, k), hideOnMobile });
const date = (k: string, header: string): Column<R> => ({ key: k, header, value: (r) => s(r, k), cell: (r) => (r[k] ? formatDate(String(r[k])) : '—') });
const status = (k = 'status', header = 'Status'): Column<R> => ({
  key: k, header, value: (r) => s(r, k),
  cell: (r) => {
    const v = s(r, k);
    const tone = ['success', 'active', 'approved', 'paid', 'verified', 'won'].includes(v) ? 'success' : ['failed', 'rejected', 'cancelled', 'lost', 'dnc'].includes(v) ? 'danger' : ['pending', 'pending_bank', 'pending_approval', 'initiated'].includes(v) ? 'warning' : 'neutral';
    return <Badge tone={tone}>{v.replace('_', ' ')}</Badge>;
  },
});
const sum = (rows: R[], k: string) => rows.reduce((a, r) => a + n(r, k), 0);

function config(type: string, rows: R[], outcomeCodes: { code: string; label: string }[]): { columns: Column<R>[]; chips: { label: string; value: string; tone?: 'primary' | 'accent' | 'highlight' | 'success' | 'danger' | 'neutral' }[] } {
  switch (type) {
    case 'sales':
      return {
        columns: [text('name', 'Name'), text('team', 'Team', true), text('city', 'City', true), num('deals', 'Deals'), money('revenue', 'Revenue'), money('collections', 'Collections'),
          { key: 'autopay_pct', header: 'Auto-pay %', align: 'right', value: (r) => (n(r, 'deals') ? (n(r, 'autopay') / n(r, 'deals')) * 100 : 0), cell: (r) => formatPercent(n(r, 'deals') ? (n(r, 'autopay') / n(r, 'deals')) * 100 : 0, 0) },
          num('calls', 'Calls'), num('visits', 'Visits'), num('meetings', 'Meetings'), num('points', 'Points')],
        chips: [{ label: 'Revenue', value: formatINRCompact(sum(rows, 'revenue')), tone: 'primary' }, { label: 'Collections', value: formatINRCompact(sum(rows, 'collections')), tone: 'accent' }, { label: 'Deals', value: formatNumber(sum(rows, 'deals')) }, { label: 'People', value: formatNumber(rows.length) }],
      };
    case 'talk-time':
      return {
        columns: [text('name', 'Name'), text('team', 'Team', true), num('calls', 'Calls'), num('connected', 'Connected'),
          { key: 'rate', header: 'Connect %', align: 'right', value: (r) => (n(r, 'calls') ? (n(r, 'connected') / n(r, 'calls')) * 100 : 0), cell: (r) => formatPercent(n(r, 'calls') ? (n(r, 'connected') / n(r, 'calls')) * 100 : 0, 0) },
          { key: 'talk_sec', header: 'Talk time', align: 'right', value: (r) => n(r, 'talk_sec'), cell: (r) => formatDuration(n(r, 'talk_sec')) },
          { key: 'avg', header: 'Avg / day', align: 'right', value: (r) => n(r, 'talk_sec') / Math.max(n(r, 'days'), 1), cell: (r) => formatDuration(n(r, 'talk_sec') / Math.max(n(r, 'days'), 1)) },
          { key: 'avg_call', header: 'Avg call', align: 'right', value: (r) => n(r, 'talk_sec') / Math.max(n(r, 'connected'), 1), cell: (r) => formatDuration(n(r, 'talk_sec') / Math.max(n(r, 'connected'), 1)) }],
        chips: [{ label: 'Calls', value: formatNumber(sum(rows, 'calls')), tone: 'primary' }, { label: 'Connect rate', value: formatPercent(sum(rows, 'calls') ? (sum(rows, 'connected') / sum(rows, 'calls')) * 100 : 0, 0), tone: 'accent' }, { label: 'Talk time', value: formatDuration(sum(rows, 'talk_sec')) }],
      };
    case 'outcomes':
      return {
        columns: [text('name', 'Name'), ...outcomeCodes.map((o) => num(o.code, o.label)), num('total', 'Total')],
        chips: outcomeCodes.slice(0, 5).map((o) => ({ label: o.label, value: formatNumber(sum(rows, o.code)) })),
      };
    case 'field-visits':
      return {
        columns: [date('day', 'Date'), text('name', 'Executive'), text('business', 'Business'), text('locality', 'Locality', true), text('purpose', 'Purpose', true),
          { key: 'distance_m', header: 'From shop', align: 'right', value: (r) => n(r, 'distance_m'), cell: (r) => (r.distance_m == null ? '—' : `${formatNumber(n(r, 'distance_m'))} m`) },
          { key: 'verified', header: 'Geofence', value: (r) => (r.verified === false ? 'off-site' : 'verified'), cell: (r) => (r.verified === false ? <Badge tone="warning">off-site</Badge> : <Badge tone="success">verified</Badge>) },
          { key: 'km', header: 'Travel km', align: 'right', value: (r) => n(r, 'km') }],
        chips: [{ label: 'Visits', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Off-site', value: formatNumber(rows.filter((r) => r.verified === false).length), tone: 'highlight' }, { label: 'Distance', value: `${formatNumber(sum(rows, 'km'))} km` }],
      };
    case 'leads':
      return {
        columns: [text('code', 'Lead ID'), text('business', 'Business'), text('phone', 'Phone', true), text('city', 'City'), status(), text('source', 'Source', true), text('owner', 'Owner'), date('created', 'Created')],
        chips: [{ label: 'Leads', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Won', value: formatNumber(rows.filter((r) => r.status === 'won').length), tone: 'success' }, { label: 'Unassigned', value: formatNumber(rows.filter((r) => r.owner === 'Unassigned').length), tone: 'highlight' }],
      };
    case 'incentives':
      return {
        columns: [date('month', 'Month'), text('name', 'Employee'), text('deal', 'Deal', true), text('basis', 'Basis'), money('base', 'Base'), { key: 'rate', header: 'Rate', align: 'right', value: (r) => n(r, 'rate'), cell: (r) => (r.rate == null ? '—' : `${r.rate}%`) }, money('amount', 'Incentive'), status()],
        chips: [{ label: 'Total', value: formatINRCompact(sum(rows, 'amount')), tone: 'primary' }, { label: 'Approved', value: formatINRCompact(sum(rows.filter((r) => r.status === 'approved'), 'amount')), tone: 'success' }, { label: 'Paid', value: formatINRCompact(sum(rows.filter((r) => r.status === 'paid'), 'amount')) }],
      };
    case 'cancelled':
    case 'downgrades':
      return {
        columns: [text('deal', 'Deal'), text('business', 'Business'), text('owner', 'Owner'), ...(type === 'downgrades' ? [text('from_package', 'From')] : []), text('package', type === 'downgrades' ? 'To' : 'Package'), money('value', 'Value'), date('closed', 'Closed'), ...(type === 'cancelled' ? [date('cancelled', 'Cancelled'), text('reason', 'Reason')] : [])],
        chips: [{ label: 'Contracts', value: formatNumber(rows.length), tone: 'danger' }, { label: 'Value', value: formatINRCompact(sum(rows, 'value')) }],
      };
    case 'autopay':
      return {
        columns: [text('month', 'Month'), num('deals', 'All deals'), num('autopay', 'Auto-pay deals'), { key: 'pct', header: 'Auto-pay %', align: 'right', value: (r) => (n(r, 'deals') ? (n(r, 'autopay') / n(r, 'deals')) * 100 : 0), cell: (r) => formatPercent(n(r, 'deals') ? (n(r, 'autopay') / n(r, 'deals')) * 100 : 0, 0) }, num('active', 'Active'), num('pending', 'Pending'), num('rejected', 'Rejected'), num('bounced', 'Bounced'), money('value', 'Auto-pay value')],
        chips: [{ label: 'Auto-pay deals', value: formatNumber(sum(rows, 'autopay')), tone: 'primary' }, { label: 'Bounced', value: formatNumber(sum(rows, 'bounced')), tone: 'danger' }],
      };
    case 'mandates':
      return {
        columns: [text('deal', 'Deal'), text('business', 'Business'), text('owner', 'Owner', true), text('umrn', 'UMRN', true), money('max', 'Max amount'), status(), num('bounces', 'Bounces'), text('reason', 'Rejection reason', true)],
        chips: [{ label: 'Mandates', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Active', value: formatNumber(rows.filter((r) => r.status === 'active').length), tone: 'success' }, { label: 'Rejected', value: formatNumber(rows.filter((r) => r.status === 'rejected').length), tone: 'danger' }, { label: 'Bounced', value: formatNumber(rows.filter((r) => n(r, 'bounces') > 0).length), tone: 'highlight' }],
      };
    case 'payment-failures':
    case 'finance':
      return {
        columns: [date('date', 'Date'), text('deal', 'Deal'), text('business', 'Business'), text('owner', 'Owner', true), money('amount', 'Amount'), text('method', 'Method'), status(), ...(type === 'finance' ? [text('receipt', 'Receipt', true)] : [text('reason', 'Reason'), num('attempt', 'Attempt')])],
        chips: [{ label: type === 'finance' ? 'Collected' : 'Failed amount', value: formatINRCompact(sum(rows.filter((r) => type !== 'finance' || r.status === 'success'), 'amount')), tone: type === 'finance' ? 'success' : 'danger' }, { label: 'Payments', value: formatNumber(rows.length) }],
      };
    case 'invoices':
    case 'proforma':
      return {
        columns: [text('number', 'Invoice no.'), date('date', 'Date'), text('deal', 'Deal'), text('customer', 'Customer'), money('taxable', 'Taxable'), money('cgst', 'CGST'), money('sgst', 'SGST'), money('igst', 'IGST'), money('total', 'Total')],
        chips: [{ label: 'Invoices', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Taxable value', value: formatINRCompact(sum(rows, 'taxable')) }, { label: 'GST', value: formatINRCompact(sum(rows, 'cgst') + sum(rows, 'sgst') + sum(rows, 'igst')) }],
      };
    case 'attendance':
      return {
        columns: [text('code', 'Code'), text('name', 'Name'), num('present', 'Present'), num('half_day', 'Half day'), num('absent', 'Absent'), num('on_leave', 'Leave'), num('late', 'Late'), num('hours', 'Hours'), num('points', 'Points')],
        chips: [{ label: 'Present days', value: formatNumber(sum(rows, 'present')), tone: 'success' }, { label: 'Absences', value: formatNumber(sum(rows, 'absent')), tone: 'danger' }, { label: 'Late marks', value: formatNumber(sum(rows, 'late')), tone: 'highlight' }],
      };
    case 'leave':
      return {
        columns: [text('name', 'Employee'), text('type', 'Type'), date('from', 'From'), date('to', 'To'), num('days', 'Days'), status(), text('reason', 'Reason', true), date('applied', 'Applied')],
        chips: [{ label: 'Requests', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Approved days', value: formatNumber(sum(rows.filter((r) => r.status === 'approved'), 'days')), tone: 'success' }, { label: 'Pending', value: formatNumber(rows.filter((r) => r.status === 'pending').length), tone: 'highlight' }],
      };
    case 'headcount':
      return {
        columns: [text('department', 'Department'), text('city', 'City'), text('role', 'Role'), status(), num('headcount', 'Headcount'), num('joined', 'Joined this month'), num('exits', 'Exits')],
        chips: [{ label: 'Headcount', value: formatNumber(sum(rows, 'headcount')), tone: 'primary' }, { label: 'Joined', value: formatNumber(sum(rows, 'joined')), tone: 'success' }],
      };
    case 'payroll':
      return {
        columns: [text('code', 'Code'), text('name', 'Name'), text('department', 'Department', true), num('paid_days', 'Paid days'), num('absent', 'LOP days'), num('late', 'Late'), money('incentives', 'Incentives'), money('reimbursements', 'Reimbursements'), { key: 'locked', header: 'Locked', value: (r) => (r.locked ? 'yes' : 'no') }],
        chips: [{ label: 'Employees', value: formatNumber(rows.length), tone: 'primary' }, { label: 'Incentives', value: formatINRCompact(sum(rows, 'incentives')), tone: 'success' }, { label: 'Reimbursements', value: formatINRCompact(sum(rows, 'reimbursements')) }],
      };
    default:
      return { columns: [], chips: [] };
  }
}

export function ReportTable({ type, title, rows, outcomeCodes, filename }: { type: string; title: string; rows: R[]; outcomeCodes: { code: string; label: string }[]; filename: string }) {
  const { columns, chips } = config(type, rows, outcomeCodes);
  return (
    <>
      <SummaryChips items={chips} />
      <DataTable rows={rows} columns={columns} rowKey={(r) => String(r.id)} exportName={filename} caption={`${title} report`} pageSize={50} />
    </>
  );
}
