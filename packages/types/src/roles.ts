import type { Enums } from './database';

export type AppRole = Enums<'app_role'>;

export const ROLES: readonly AppRole[] = [
  'executive',
  'team_lead',
  'area_manager',
  'hr_admin',
  'finance',
  'super_admin',
] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  executive: 'Sales Executive',
  team_lead: 'Team Lead',
  area_manager: 'Area Manager',
  hr_admin: 'HR Admin',
  finance: 'Finance',
  super_admin: 'Super Admin',
};

/** Roles that must complete MFA (TOTP) before using the web console. */
export const MFA_REQUIRED_ROLES: readonly AppRole[] = ['hr_admin', 'finance', 'super_admin'];

/** Roles whose primary surface is the mobile app. */
export const MOBILE_ROLES: readonly AppRole[] = ['executive', 'team_lead', 'area_manager'];

/** Roles allowed into the web console. */
export const WEB_ROLES: readonly AppRole[] = ['team_lead', 'area_manager', 'hr_admin', 'finance', 'super_admin'];

export const MANAGER_ROLES: readonly AppRole[] = ['team_lead', 'area_manager'];

export function requiresMfa(role: AppRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

export function canUseWeb(role: AppRole): boolean {
  return WEB_ROLES.includes(role);
}

export function isManager(role: AppRole): boolean {
  return MANAGER_ROLES.includes(role);
}
