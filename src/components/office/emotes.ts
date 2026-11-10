export const EMOTES = [
  { id: 'smile', emoji: '😊' }, { id: 'laugh', emoji: '😂' }, { id: 'surprise', emoji: '😮' }, { id: 'sad', emoji: '😢' },
  { id: 'angry', emoji: '😠' }, { id: 'thinking', emoji: '🤔' }, { id: 'wink', emoji: '😉' }, { id: 'sleepy', emoji: '😴' },
  { id: 'love', emoji: '😍' }, { id: 'cool', emoji: '😎' }, { id: 'shy', emoji: '😳' }, { id: 'party', emoji: '🥳' },
] as const;

// Shown by what a character does (the coffee machine, the dance floor); not on the emote wheel.
export const ACTION_EMOTES = [{ id: 'coffee', emoji: '☕' }, { id: 'dance', emoji: '💃' }] as const;
const ALL = [...EMOTES, ...ACTION_EMOTES];

export type EmoteId = (typeof ALL)[number]['id'];
export const EMOTE_MS = 4000;
export const emoteEmoji = (id: string) => ALL.find((e) => e.id === id)?.emoji ?? '';
export const isEmoteId = (id: unknown): id is EmoteId => ALL.some((e) => e.id === id);
