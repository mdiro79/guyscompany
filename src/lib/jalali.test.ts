import { describe, it, expect } from 'vitest';
import { toJalali, toGregorian, jalaliMonthLength } from './jalali';

describe('jalali', () => {
  it('converts known dates', () => {
    expect(toJalali(2024, 3, 20)).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(toJalali(2026, 10, 23)).toEqual({ jy: 1405, jm: 8, jd: 1 });
    expect(toGregorian(1405, 8, 1)).toEqual({ gy: 2026, gm: 10, gd: 23 });
  });
  it('round-trips a year of days', () => {
    for (let d = 0; d < 366; d++) {
      const g = new Date(Date.UTC(2025, 0, 1 + d));
      const j = toJalali(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate());
      expect(toGregorian(j.jy, j.jm, j.jd)).toEqual({ gy: g.getUTCFullYear(), gm: g.getUTCMonth() + 1, gd: g.getUTCDate() });
    }
  });
  it('month lengths', () => {
    expect(jalaliMonthLength(1403, 1)).toBe(31);
    expect(jalaliMonthLength(1403, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
});
