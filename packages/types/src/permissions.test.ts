import { describe, expect, it } from 'vitest';
import { accessibleModules, canAccess, MODULE_ACCESS, WEB_NAV, requiresMfa, ROLES } from './index';

describe('permissions', () => {
  it('executives never get web console modules besides the design reference', () => {
    expect(accessibleModules('executive')).toEqual(['design']);
  });

  it('HR cannot see sales leads, finance cannot see HR employees', () => {
    expect(canAccess('hr_admin', 'leads')).toBe(false);
    expect(canAccess('finance', 'hr.employees')).toBe(false);
  });

  it('only super admin reaches settings and audit', () => {
    for (const role of ROLES) {
      expect(canAccess(role, 'settings')).toBe(role === 'super_admin');
      expect(canAccess(role, 'audit')).toBe(role === 'super_admin');
    }
  });

  it('admin roles require MFA', () => {
    expect(requiresMfa('hr_admin')).toBe(true);
    expect(requiresMfa('finance')).toBe(true);
    expect(requiresMfa('super_admin')).toBe(true);
    expect(requiresMfa('executive')).toBe(false);
  });

  it('every nav item points at a known module', () => {
    const modules = Object.keys(MODULE_ACCESS);
    for (const section of WEB_NAV) for (const item of section.items) expect(modules).toContain(item.module);
  });

  it('null role has no access', () => {
    expect(canAccess(null, 'dashboard')).toBe(false);
  });
});
