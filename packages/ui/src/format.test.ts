import { describe, expect, it } from 'vitest';
import {
  formatDate, formatDateTime, formatDistance, formatDuration, formatINR, formatINRCompact, formatNumber,
  formatPercent, formatPhone, formatRelative, formatTime, greetingKey, groupIndian, initials, maskTail,
  pctChange, phoneForLinks, toIstDateString, istMonthStart,
} from './format';

describe('Indian number formats', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian('100')).toBe('100');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
    expect(groupIndian('1234567890')).toBe('1,23,45,67,890');
  });

  it('formats rupees', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(-2500.5, { decimals: 2 })).toBe('-₹2,500.50');
    expect(formatINR(null)).toBe('—');
    expect(formatNumber(9876543.21, 2)).toBe('98,76,543.21');
  });

  it('compacts to K / lakh / crore', () => {
    expect(formatINRCompact(950)).toBe('₹950');
    expect(formatINRCompact(85_400)).toBe('₹85.4K');
    expect(formatINRCompact(1_250_000)).toBe('₹12.5 L');
    expect(formatINRCompact(100_000)).toBe('₹1 L');
    expect(formatINRCompact(32_500_000)).toBe('₹3.25 Cr');
  });

  it('formats percentages and changes', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(40)).toBe('40%');
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe('IST dates (DD MMM YYYY)', () => {
  it('formats in IST regardless of host timezone', () => {
    // 2026-10-05T20:00Z is already 6 Oct 01:30 in India
    expect(formatDate('2026-10-05T20:00:00Z')).toBe('06 Oct 2026');
    expect(toIstDateString('2026-10-05T20:00:00Z')).toBe('2026-10-06');
    expect(formatTime('2026-10-06T08:35:00Z')).toBe('2:05 PM');
    expect(formatTime('2026-10-05T18:30:00Z')).toBe('12:00 AM');
    expect(formatDateTime('2026-01-26T04:30:00Z')).toBe('26 Jan 2026, 10:00 AM');
    expect(istMonthStart('2026-10-31T19:00:00Z')).toBe('2026-11-01');
  });

  it('describes relative times', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    expect(formatRelative(new Date('2026-10-06T09:59:40Z'), now)).toBe('just now');
    expect(formatRelative(new Date('2026-10-06T09:55:00Z'), now)).toBe('5 min ago');
    expect(formatRelative(new Date('2026-10-06T12:00:00Z'), now)).toBe('in 2 h');
    expect(formatRelative(new Date('2026-10-03T10:00:00Z'), now)).toBe('3 days ago');
    expect(formatRelative(new Date('2026-09-01T10:00:00Z'), now)).toBe('01 Sep 2026');
  });

  it('greets by IST time of day', () => {
    expect(greetingKey('2026-10-06T03:00:00Z')).toBe('greeting.morning'); // 08:30 IST
    expect(greetingKey('2026-10-06T08:00:00Z')).toBe('greeting.afternoon'); // 13:30 IST
    expect(greetingKey('2026-10-06T13:00:00Z')).toBe('greeting.evening'); // 18:30 IST
  });
});

describe('misc formatters', () => {
  it('durations, distance, phone, masking', () => {
    expect(formatDuration(3725)).toBe('1h 02m');
    expect(formatDuration(252)).toBe('4m 12s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(2380)).toBe('2.4 km');
    expect(formatDistance(12_600)).toBe('13 km');
    expect(formatPhone('+919800000001')).toBe('+91 98000 00001');
    expect(formatPhone('098000 00001')).toBe('+91 98000 00001');
    expect(phoneForLinks('+91 98000 00001')).toBe('919800000001');
    expect(maskTail('000012345678')).toBe('•••• 5678');
    expect(initials('Priya Nair')).toBe('PN');
    expect(initials('Kiran')).toBe('K');
  });
});
