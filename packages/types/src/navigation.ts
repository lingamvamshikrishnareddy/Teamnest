import type { WebModule } from './permissions';

/** Web sidebar definition. `icon` is a Lucide icon name (PascalCase). */
export interface NavItem {
  module: WebModule;
  label: string;
  href: string;
  icon: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const WEB_NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { module: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', phase: 3 },
      { module: 'approvals', label: 'Approvals', href: '/approvals', icon: 'CheckCheck', phase: 6 },
      { module: 'team_map', label: 'Live team map', href: '/team-map', icon: 'MapPinned', phase: 3 },
    ],
  },
  {
    title: 'Sales',
    items: [
      { module: 'leads', label: 'Leads', href: '/leads', icon: 'Contact', phase: 3 },
      { module: 'queues', label: 'Queues', href: '/leads/queues', icon: 'ListFilter', phase: 3 },
      { module: 'lead_import', label: 'Import leads', href: '/leads/import', icon: 'Upload', phase: 3 },
      { module: 'analytics', label: 'Analytics', href: '/analytics', icon: 'ChartColumnBig', phase: 7 },
      { module: 'reports', label: 'Reports', href: '/reports', icon: 'FileBarChart', phase: 3 },
    ],
  },
  {
    title: 'People',
    items: [
      { module: 'hr.employees', label: 'Employees', href: '/hr/employees', icon: 'Users', phase: 5 },
      { module: 'hr.attendance', label: 'Attendance', href: '/hr/attendance', icon: 'CalendarCheck', phase: 5 },
      { module: 'hr.leave', label: 'Leave', href: '/hr/leave', icon: 'Palmtree', phase: 5 },
      { module: 'hr.payroll', label: 'Payroll inputs', href: '/hr/payroll', icon: 'Wallet', phase: 6 },
      { module: 'hr.performance', label: 'Performance', href: '/hr/performance', icon: 'Target', phase: 6 },
      { module: 'hr.policies', label: 'Policies & news', href: '/hr/policies', icon: 'Megaphone', phase: 5 },
      { module: 'hr.helpdesk', label: 'Requests', href: '/hr/requests', icon: 'LifeBuoy', phase: 5 },
    ],
  },
  {
    title: 'Finance',
    items: [
      { module: 'finance.payments', label: 'Payments', href: '/finance/payments', icon: 'IndianRupee', phase: 4 },
      { module: 'finance.mandates', label: 'Mandates', href: '/finance/mandates', icon: 'Repeat', phase: 4 },
      { module: 'finance.invoices', label: 'Invoices', href: '/finance/invoices', icon: 'ReceiptText', phase: 4 },
      { module: 'finance.payouts', label: 'Incentive payouts', href: '/finance/payouts', icon: 'BadgeIndianRupee', phase: 6 },
      { module: 'finance.reimbursements', label: 'Reimbursements', href: '/finance/reimbursements', icon: 'Receipt', phase: 6 },
    ],
  },
  {
    title: 'Admin',
    items: [
      { module: 'settings', label: 'Settings', href: '/settings', icon: 'Settings', phase: 3 },
      { module: 'audit', label: 'Audit log', href: '/settings/audit', icon: 'ShieldCheck', phase: 3 },
      { module: 'design', label: 'Design system', href: '/design-system', icon: 'Palette', phase: 1 },
    ],
  },
];

/** Mobile bottom tabs (Expo Router routes). */
export const MOBILE_TABS = [
  { name: 'home', label: 'Home', icon: 'House' },
  { name: 'leads', label: 'Leads', icon: 'Contact' },
  { name: 'add', label: 'Add Business', icon: 'Plus' },
  { name: 'work', label: 'Work', icon: 'BriefcaseBusiness' },
  { name: 'profile', label: 'Profile', icon: 'CircleUser' },
] as const;
