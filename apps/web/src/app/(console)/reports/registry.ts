export interface ReportDef {
  key: string;
  title: string;
  group: 'Sales' | 'Payments' | 'People';
  description: string;
}

export const REPORTS: ReportDef[] = [
  { key: 'sales', title: 'Sales', group: 'Sales', description: 'Deals, revenue, collections and activity per person' },
  { key: 'outcomes', title: 'Outcomes', group: 'Sales', description: 'Call and visit outcomes per person' },
  { key: 'talk-time', title: 'Talk time', group: 'Sales', description: 'Calls, connect rate and talk time per person' },
  { key: 'field-visits', title: 'Field visits', group: 'Sales', description: 'Every check-in with geofence verification' },
  { key: 'leads', title: 'Leads', group: 'Sales', description: 'Leads created in the period with status' },
  { key: 'incentives', title: 'Incentives', group: 'Sales', description: 'Calculated, approved and paid incentives' },
  { key: 'cancelled', title: 'Cancelled contracts', group: 'Sales', description: 'Deals cancelled with reasons' },
  { key: 'downgrades', title: 'Downgrades', group: 'Sales', description: 'Customers who moved to a smaller plan' },
  { key: 'autopay', title: 'Auto-pay monthly', group: 'Payments', description: 'Auto-pay deals and mandate health by month' },
  { key: 'mandates', title: 'Mandates', group: 'Payments', description: 'Mandate status, bounces and rejections' },
  { key: 'payment-failures', title: 'Payment failures', group: 'Payments', description: 'Failed payments and reasons' },
  { key: 'finance', title: 'Finance', group: 'Payments', description: 'All payments with receipts' },
  { key: 'invoices', title: 'Invoices & receipts', group: 'Payments', description: 'Tax invoices issued' },
  { key: 'proforma', title: 'Proforma invoices', group: 'Payments', description: 'Proforma invoices issued' },
  { key: 'attendance', title: 'Attendance', group: 'People', description: 'Present, absent, leave and late marks per person' },
  { key: 'leave', title: 'Leave', group: 'People', description: 'Leave requests and decisions' },
  { key: 'headcount', title: 'Headcount', group: 'People', description: 'Employees by department, city and role' },
  { key: 'payroll', title: 'Payroll inputs', group: 'People', description: 'Paid days, incentives and reimbursements' },
];

export const reportByKey = (k: string) => REPORTS.find((r) => r.key === k);
