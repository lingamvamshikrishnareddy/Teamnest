import { describe, expect, it, vi } from 'vitest';
import { resolveRange } from './date-range';
import { toCsv } from './export';

describe('resolveRange (IST)', () => {
  it('computes presets and an equal-length comparison window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T06:00:00Z')); // 11:30 IST, 7 Oct
    const week = resolveRange({ range: '7d' });
    expect(week).toMatchObject({ from: '2026-10-01', to: '2026-10-07', days: 7, prevFrom: '2026-09-24', prevTo: '2026-09-30' });
    expect(resolveRange({ range: 'month' })).toMatchObject({ from: '2026-10-01', to: '2026-10-07' });
    expect(resolveRange({ range: 'last_month' })).toMatchObject({ from: '2026-09-01', to: '2026-09-30', days: 30 });
    expect(resolveRange({ range: 'yesterday' })).toMatchObject({ from: '2026-10-06', to: '2026-10-06' });
    expect(resolveRange({ from: '2026-08-01', to: '2026-08-15' })).toMatchObject({ preset: 'custom', from: '2026-08-01', to: '2026-08-15', fromTs: '2026-08-01T00:00:00+05:30' });
    vi.useRealTimers();
  });

  it('rejects malformed custom dates', () => {
    const r = resolveRange({ from: "2026-01-01'; drop table x", to: 'nope' });
    expect(r.from).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('toCsv', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: 'Sunrise, Dental', b: '=HYPERLINK("x")', c: 12 }, { a: 'Say "hi"', b: '+91 98', c: null }], [
      { header: 'Name', value: (r) => r.a }, { header: 'Note', value: (r) => r.b }, { header: 'N', value: (r) => r.c },
    ]);
    expect(csv.split('\n')).toEqual(['Name,Note,N', '"Sunrise, Dental","\'=HYPERLINK(""x"")",12', '"Say ""hi""",\'+91 98,']);
  });
});
