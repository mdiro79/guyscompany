// Base strengths of the general light, shared by the scene and the conference room's dimmer
// (inside that room the general light follows its wall panel).
export const ENV_INTENSITY = 0.5;
export const hemiIntensity = (low: boolean) => (low ? 1.15 : 0.7);
export const HEMI_NAME = 'gc-hemi';
