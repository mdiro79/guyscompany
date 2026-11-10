import { OFFICES, RECEPTION_Z, SOUTH, H, OUT, type Vec2 } from './layout';

// Base strengths of the general light, shared by the scene and the conference room's dimmer
// (inside that room the general light follows its wall panel).
export const ENV_INTENSITY = 0.5;
export const hemiIntensity = (low: boolean) => (low ? 1.15 : 0.7);
export const HEMI_NAME = 'gc-hemi';

// Places where a ceiling downlight can shine. Only the few nearest to the viewer are lit at a time
// (LightPool), so the number of real lights stays the same however many rooms the office has.
export interface Fixture { pos: Vec2; intensity: number; color: string }
const MID = (H + OUT) / 2;
export const DOWNLIGHTS: Fixture[] = [
  { pos: [0, RECEPTION_Z], intensity: 22, color: '#ffe2bd' },
  { pos: [-MID, 0], intensity: 20, color: '#ffdcae' }, // café
  { pos: [MID, 0], intensity: 20, color: '#fff0dc' }, // library
  { pos: [0, -MID], intensity: 15, color: '#d9c8ff' }, // game room
  ...OFFICES.map((o): Fixture => ({ pos: [(o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2], intensity: 24, color: o.wallColor === 'orange' ? '#ffd2a3' : '#ffe8cc' })),
];
export const LIGHT_POOL = 4;

// Glowing lamp discs in the ceiling (looks only).
export const LAMPS: Vec2[] = [
  ...DOWNLIGHTS.filter((d) => d.pos[1] !== -MID || d.pos[0] !== 0).map((d) => d.pos),
  [0, SOUTH - 1.5], [0, RECEPTION_Z - 1], [-MID, -4.5], [-MID, 4.5], [MID, -4.5], [MID, 4.5], [-H + 1.2, -H + 1.2], [H - 1.2, -H + 1.2],
];
