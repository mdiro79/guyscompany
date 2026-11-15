// Poses for photos (the phone's camera): a button for each, seen by everyone for a few seconds, so a group
// photo can have everyone posing. Each character plays the first of these clips it has (they differ by
// character family); characters without any of them show the pose with their arms.
export const GESTURES = [
  { id: 'wave', emoji: '👋', clips: ['Wave', 'Yes', 'Interact'], loop: true },
  { id: 'victory', emoji: '🏆', clips: ['Victory', 'Jump_Full_Short', 'Yes', 'Dance'], loop: false },
  { id: 'dance', emoji: '💃', clips: ['Dance', 'Victory', 'Walking_C', 'Running_B'], loop: true },
  { id: 'jump', emoji: '🦘', clips: ['Jump', 'Jump_Full_Short', 'Jump_Full_Long'], loop: true },
  { id: 'thumbs', emoji: '👍', clips: ['Yes', 'Use_Item', 'Interact', 'PickUp'], loop: false },
  { id: 'power', emoji: '💥', clips: ['Punch', 'SwordSlash', 'Headbutt', 'Throw', 'Shoot_OneHanded'], loop: false },
  { id: 'faint', emoji: '😵', clips: ['Death', 'Death_A', 'Defeat', 'Death_B'], loop: false },
  { id: 'shy', emoji: '🙈', clips: ['Duck', 'Defeat', 'HitReact', 'Hit_A', 'HitRecieve', 'RecieveHit'], loop: false },
] as const;
export type GestureId = (typeof GESTURES)[number]['id'];
export const GESTURE_MS = 4500;
export const isGestureId = (v: unknown): v is GestureId => GESTURES.some((g) => g.id === v);
export const gestureOf = (id: GestureId | null | undefined) => GESTURES.find((g) => g.id === id) ?? null;
