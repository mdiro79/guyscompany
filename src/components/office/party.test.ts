import { describe, expect, it } from 'vitest';
import { cleanParty, floorTaken, partyPhase, tvPhase, PARTY_TOTAL, STAGE, LIGHTS_DEFAULT } from './party';

const at = 1_000_000;
const sec = (s: number) => at + s * 1000;

describe('party room moves', () => {
  it('opens the hatch, tucks and lifts the furniture, closes the hatch, then lowers the rig', () => {
    const on = { on: true, at };
    expect(partyPhase(on, sec(0))).toMatchObject({ hatch: 0, lift: 0, rig: 0 });
    expect(partyPhase(on, sec(STAGE.open)).hatch).toBeCloseTo(1);
    const lifting = partyPhase(on, sec(STAGE.open + STAGE.tuck + STAGE.lift / 2));
    expect(lifting.hatch).toBe(1); expect(lifting.tuck).toBe(1); expect(lifting.lift).toBeCloseTo(0.5);
    const done = partyPhase(on, sec(PARTY_TOTAL + 1));
    expect(done).toMatchObject({ hatch: 0, tuck: 1, lift: 1, rig: 1 });
  });
  it('plays the same moves backwards when the party ends', () => {
    const off = { on: false, at };
    expect(partyPhase(off, sec(0))).toMatchObject({ lift: 1, rig: 1 });
    expect(partyPhase(off, sec(STAGE.rig / 2)).rig).toBeCloseTo(0.5);
    expect(partyPhase(off, sec(PARTY_TOTAL))).toMatchObject({ hatch: 0, tuck: 0, lift: 0, rig: 0 });
  });
  it('the middle of the room is free from the start of the party until the furniture is back down', () => {
    expect(floorTaken({ on: true, at }, sec(0))).toBe(true);
    expect(floorTaken({ on: false, at }, sec(1))).toBe(true);
    expect(floorTaken({ on: false, at }, sec(PARTY_TOTAL + 1))).toBe(false);
    expect(floorTaken({ on: false, at: 0 }, sec(0))).toBe(false);
  });
  it('the screen slides down and up', () => {
    expect(tvPhase({ tvDown: true, tvAt: at }, sec(0))).toBe(0);
    expect(tvPhase({ tvDown: true, tvAt: at }, sec(10))).toBe(1);
    expect(tvPhase({ tvDown: false, tvAt: at }, sec(10))).toBe(0);
  });
});

describe('party state from others', () => {
  it('keeps what is well formed and drops the rest', () => {
    const s = cleanParty({ on: true, at: 5, tvDown: 'yes', track: { kind: 'song', fileId: 'abc-1', name: 'Song' }, songs: [{ fileId: '../x' }, { fileId: 'ok_1', name: 'A' }], lights: { mode: 'boom', intensity: 400 } })!;
    expect(s.on).toBe(true); expect(s.tvDown).toBe(false);
    expect(s.track).toEqual({ kind: 'song', fileId: 'abc-1', name: 'Song' });
    expect(s.songs).toEqual([{ fileId: 'ok_1', name: 'A' }]);
    expect(s.lights.mode).toBe('beat'); expect(s.lights.intensity).toBe(100); expect(s.lights.jump).toBe(LIGHTS_DEFAULT.jump);
    expect(cleanParty({ track: { kind: 'style', style: 99 } })!.track).toBeNull();
    expect(cleanParty(null)).toBeNull();
  });
});
