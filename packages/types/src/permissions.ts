import type { AppRole } from './roles';

/**
 * UI-level module access. This only decides what to SHOW — every read and
 * write is enforced again by Postgres Row-Level Security.
 */
export type WebModule =
  | 'dashboard'
  | 'approvals'
  | 'leads'
  | 'lead_import'
  | 'queues'
  | 'analytics'
  | 'reports'
  | 'team_map'
  | 'hr.employees'
  | 'hr.attendance'
  | 'hr.leave'
  | 'hr.payroll'
  | 'hr.performance'
  | 'hr.policies'
  | 'hr.helpdesk'
  | 'finance.payments'
  | 'finance.mandates'
  | 'finance.invoices'
  | 'finance.payouts'
  | 'finance.reimbursements'
  | 'settings'
  | 'audit'
  | 'design';

const ALL: AppRole[] = ['executive', 'team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'];
const MANAGERS: AppRole[] = ['team_lead', 'area_manager', 'super_admin'];

export const MODULE_ACCESS: Record<WebModule, readonly AppRole[]> = {
  dashboard: ['team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'],
  approvals: ['team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'],
  leads: MANAGERS,
  lead_import: ['area_manager', 'super_admin'],
  queues: MANAGERS,
  analytics: [...MANAGERS, 'finance'],
  reports: ['team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'],
  team_map: MANAGERS,
  'hr.employees': ['hr_admin', 'super_admin'],
  'hr.attendance': ['hr_admin', 'team_lead', 'area_manager'],
  'hr.leave': ['hr_admin'],
  'hr.payroll': ['hr_admin', 'finance'],
  'hr.performance': ['hr_admin', 'team_lead', 'area_manager'],
  'hr.policies': ['hr_admin', 'super_admin'],
  'hr.helpdesk': ['hr_admin'],
  'finance.payments': ['finance', 'super_admin'],
  'finance.mandates': ['finance', 'super_admin'],
  'finance.invoices': ['finance', 'super_admin'],
  'finance.payouts': ['finance'],
  'finance.reimbursements': ['finance', 'hr_admin'],
  settings: ['super_admin'],
  audit: ['super_admin'],
  design: ALL,
};

export function canAccess(role: AppRole | null | undefined, module: WebModule): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module].includes(role);
}

export function accessibleModules(role: AppRole): WebModule[] {
  return (Object.keys(MODULE_ACCESS) as WebModule[]).filter((m) => canAccess(role, m));
}
