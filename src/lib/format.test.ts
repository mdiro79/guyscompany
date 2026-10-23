import { describe, it, expect } from 'vitest';
import { daysFromToday, fromZonedLocal, todayIso, zonedDate } from './format';

describe('Tehran dates', () => {
  it('uses the Tehran calendar day, not UTC', () => {
    // 21:00 UTC is already 00:30 the next day in Tehran (UTC+3:30).
    expect(zonedDate('2026-10-23T21:00:00Z')).toBe('2026-10-24');
    expect(todayIso(new Date('2026-10-23T20:00:00Z'))).toBe('2026-10-23');
  });
  it('reads datetime-local input as Tehran wall time', () => {
    expect(fromZonedLocal('2026-10-23T10:00').toISOString()).toBe('2026-10-23T06:30:00.000Z');
    expect(fromZonedLocal('2026-01-01T00:15').toISOString()).toBe('2025-12-31T20:45:00.000Z');
    expect(Number.isNaN(fromZonedLocal('').getTime())).toBe(true);
  });
  it('counts days from the Tehran today', () => {
    const now = new Date('2026-10-23T21:00:00Z'); // Oct 24 in Tehran
    expect(daysFromToday('2026-10-24', now)).toBe(0);
    expect(daysFromToday('2026-10-23', now)).toBe(-1);
    expect(daysFromToday('2026-10-31', now)).toBe(7);
  });
});
