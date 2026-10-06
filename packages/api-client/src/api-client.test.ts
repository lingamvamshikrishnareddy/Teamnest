import { describe, expect, it } from 'vitest';
import { roleFromAccessToken, sumKpis, toAppError } from './index';

const row = (o: Partial<Record<string, number | string>>) =>
  ({
    org_id: 'o', user_id: 'u', day: '2026-10-01', calls: 0, connected_calls: 0, talk_time_sec: 0, visits: 0,
    distance_km: 0, meetings: 0, outcomes: 0, deals: 0, revenue: 0, collections: 0, autopay_deals: 0,
    online_payments: 0, activity_points: 0, updated_at: '', ...o,
  }) as never;

describe('sumKpis', () => {
  it('totals rows and derives percentages', () => {
    const t = sumKpis([row({ calls: 10, connected_calls: 6, deals: 2, autopay_deals: 1, revenue: 1000 }), row({ calls: 10, connected_calls: 4, deals: 2, autopay_deals: 2, revenue: 500.5 })]);
    expect(t.calls).toBe(20);
    expect(t.revenue).toBe(1500.5);
    expect(t.connectRatePct).toBe(50);
    expect(t.autopayDealPct).toBe(75);
  });
  it('handles empty input', () => {
    expect(sumKpis([]).autopayDealPct).toBe(0);
  });
});

describe('toAppError', () => {
  it('maps RLS denials and keeps our own guard messages', () => {
    expect(toAppError({ code: '42501', message: 'permission denied for table leads' }).message).toBe('You don’t have access to do that.');
    expect(toAppError({ code: '42501', message: 'Use the approvals inbox to approve or reject' }).message).toMatch(/approvals inbox/);
  });
  it('maps duplicates and network errors', () => {
    expect(toAppError({ code: '23505' }).code).toBe('duplicate');
    expect(toAppError({ message: 'TypeError: Failed to fetch' }).retryable).toBe(true);
  });
});

describe('roleFromAccessToken', () => {
  it('reads the user_role claim', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x', user_role: 'team_lead' })).toString('base64url');
    expect(roleFromAccessToken(`h.${payload}.s`)).toBe('team_lead');
    expect(roleFromAccessToken('garbage')).toBeNull();
    expect(roleFromAccessToken(null)).toBeNull();
  });
});
