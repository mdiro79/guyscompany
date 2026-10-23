export const EMOTES = [
  { id: 'smile', emoji: '😊' }, { id: 'laugh', emoji: '😂' }, { id: 'surprise', emoji: '😮' }, { id: 'sad', emoji: '😢' },
  { id: 'angry', emoji: '😠' }, { id: 'thinking', emoji: '🤔' }, { id: 'wink', emoji: '😉' }, { id: 'sleepy', emoji: '😴' },
  { id: 'love', emoji: '😍' }, { id: 'cool', emoji: '😎' }, { id: 'shy', emoji: '😳' }, { id: 'party', emoji: '🥳' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];
export const EMOTE_MS = 4000;
export const emoteEmoji = (id: string) => EMOTES.find((e) => e.id === id)?.emoji ?? '';
export const isEmoteId = (id: unknown): id is EmoteId => EMOTES.some((e) => e.id === id);
