import { describe, expect, it } from 'vitest';
import { COMPUTER, LADDER, LOWEST, PHONE, WINDOW_MS, floorOf, initialQuality, stepQuality, type QualityState } from './quality';

const run = (s: QualityState, windows: number, ratio: number | null, t0: number, running = true, tune = PHONE) => {
  let t = t0;
  for (let i = 0; i < windows; i++) { t += WINDOW_MS; s = stepQuality(s, { now: t, dt: WINDOW_MS, running, ratio }, tune); }
  return { s, t };
};

describe('adaptive quality', () => {
  it('goes down one step at a time when frames are late, never jumping', () => {
    let { s, t } = run(initialQuality(), 2, 0.5, 0);
    expect(s.level).toBe(1);
    ({ s, t } = run(s, 1, 0.5, t));
    expect(s.level).toBe(1); // at least a few seconds between steps
    ({ s } = run(s, 2, 0.5, t));
    expect(s.level).toBe(2);
  });

  it('comes back up only after a long smooth stretch, and waits longer after a step that did not hold', () => {
    let { s, t } = run(initialQuality(), 2, 0.5, 0, true, COMPUTER);
    expect(s.level).toBe(1);
    ({ s, t } = run(s, 10, 1, t, true, COMPUTER));
    expect(s.level).toBe(1);
    ({ s, t } = run(s, 6, 1, t, true, COMPUTER));
    expect(s.level).toBe(0);
    const wait = s.upWait;
    ({ s, t } = run(s, 2, 0.5, t, true, COMPUTER));
    expect(s.level).toBe(1);
    expect(s.upWait).toBe(wait * 2);
  });

  it('lowers the best allowed step slowly while running (heat) and raises it again during pauses', () => {
    let { s, t } = run(initialQuality(), PHONE.heatStepMs / WINDOW_MS, 1, 0);
    expect(floorOf(s, PHONE)).toBe(1);
    expect(s.level).toBe(1);
    ({ s, t } = run(s, (PHONE.heatStepMs * 10) / WINDOW_MS, 1, t));
    expect(s.level).toBe(PHONE.comfort); // never below the comfort step from heat alone
    ({ s } = run(s, (PHONE.heatStepMs * 3) / WINDOW_MS, null, t, false));
    expect(floorOf(s, PHONE)).toBe(PHONE.comfort - 3);
  });

  it('changes one thing at a time along the ladder', () => {
    for (let i = 1; i <= LOWEST; i++) {
      const a = LADDER[i - 1], b = LADDER[i];
      expect(b.sharpness).toBeLessThanOrEqual(a.sharpness);
      expect(a.sharpness - b.sharpness).toBeLessThanOrEqual(0.2 + 1e-9);
    }
    expect(LADDER[PHONE.comfort].fps).toBe(60);
  });
});
