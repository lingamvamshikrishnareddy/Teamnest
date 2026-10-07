import { describe, expect, it } from 'vitest';
import { quickTimes } from './dates';
import { distanceTo } from './geo';

describe('quickTimes', () => {
  it('offers sensible follow-up slots during the day', () => {
    const now = new Date(2026, 9, 7, 11, 10); // Wed 11:10
    const opts = quickTimes(now);
    expect(opts.map((o) => o.key)).toEqual(['later', 'tomorrow', '2days', 'nextweek']);
    expect(opts[0]!.at.getHours()).toBe(13);
    expect(opts[0]!.at.getMinutes()).toBe(30);
    expect(opts[1]!.at.getDate()).toBe(8);
    expect(opts[3]!.at.getDay()).toBe(1); // Monday
  });
  it('drops "in 2 hours" late in the evening', () => {
    expect(quickTimes(new Date(2026, 9, 7, 20, 0)).map((o) => o.key)).not.toContain('later');
  });
});

describe('distanceTo', () => {
  it('matches known distances', () => {
    // Madhapur → Secunderabad ≈ 11.6 km
    const d = distanceTo({ lat: 17.4483, lng: 78.3915 }, { lat: 17.4399, lng: 78.4983 });
    expect(d).toBeGreaterThan(11_000);
    expect(d).toBeLessThan(12_000);
    expect(distanceTo({ lat: 12.9, lng: 77.6 }, { lat: 12.9, lng: 77.6 })).toBe(0);
  });
});
