import { addDays } from '@/lib/todos';
import { zonedDate } from '@/lib/format';
import type { ChatRead, Message, Profile } from '@/lib/data/types';

// Chats: the team chat, one topic per project, and private office chats (those live in the 3D office).
export const TEAM = 'team';
export const projectChannel = (projectId: string) => `project:${projectId}`;
const PROJECT_RE = /^project:([0-9a-f-]{36})$/i;
export const projectIdOf = (channel: string) => PROJECT_RE.exec(channel)?.[1] ?? null;
export const isChatChannel = (channel: string) => channel === TEAM || PROJECT_RE.test(channel);

// A message's file is shown as a picture, a voice note or a file card.
export const isImage = (mime: string) => /^image\/(png|jpe?g|gif|webp|avif)$/i.test(mime);
export const isAudio = (mime: string) => /^audio\//i.test(mime);
export const VOICE_PREFIX = 'voice-';

// Messages one after another from the same person within this time are drawn as one group.
const GROUP_MS = 5 * 60_000;

export interface MessageRow {
  message: Message;
  day: string; // YYYY-MM-DD in the team's time zone
  newDay: boolean; // first message of its day (a date chip goes above it)
  first: boolean; // first of its author's group (name shown)
  last: boolean; // last of its group (avatar and tail shown)
}

// Cards and system lines stand alone; plain messages and decisions group by author and time.
const groups = (m: Message) => m.kind === 'text' || m.kind === 'decision';

export function layoutMessages(list: Message[]): MessageRow[] {
  const rows = list.map((message) => ({ message, day: zonedDate(message.createdAt), newDay: false, first: true, last: true }));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.newDay = !prev || prev.day !== row.day;
    const joins = !!prev && !row.newDay && groups(row.message) && groups(prev.message) && prev.message.authorId === row.message.authorId
      && !row.message.forwardedFrom && Date.parse(row.message.createdAt) - Date.parse(prev.message.createdAt) < GROUP_MS;
    if (joins) { row.first = false; prev.last = false; }
  });
  return rows;
}

// Who (other than its author) has read a message: everyone whose last read is at or after it.
export function seenBy(message: Message, reads: ChatRead[]) {
  return reads.filter((r) => r.userId !== message.authorId && r.readAt >= message.createdAt).map((r) => r.userId);
}

// Splits text into plain parts, links and @mentions (shown highlighted).
export type Token = { kind: 'text' | 'link' | 'mention'; value: string };
const TOKEN_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"،])|(@[a-z0-9_.-]{3,24})/gi;
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > at) out.push({ kind: 'text', value: text.slice(at, m.index) });
    out.push({ kind: m[1] ? 'link' : 'mention', value: m[0] });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', value: text.slice(at) });
  return out;
}

// One line of a message for previews (reply quotes, the chat list, pinned bar).
export function snippet(m: Pick<Message, 'body' | 'kind'>, max = 90) {
  const line = m.body.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Chat commands (Telegram-bot style) in a project topic or the team chat:
//   /task Fix the login @nima !! tomorrow   → a task (assignee, priority, due day)
//   /bug Sign-in button does nothing !!!    → a bug (severity from the exclamation marks)
//   /decision We ship on Friday             → a message marked as a team decision
export type ChatCommand =
  | { cmd: 'task'; title: string; assigneeId: string | null; priority: 0 | 1 | 2; dueDate: string | null }
  | { cmd: 'bug'; title: string; assigneeId: string | null; severity: 0 | 1 | 2 | 3 }
  | { cmd: 'decision'; text: string };
export const COMMANDS = ['task', 'bug', 'decision'] as const;
const ALIASES: Record<string, (typeof COMMANDS)[number]> = {
  task: 'task', t: 'task', 'کار': 'task', 'تسک': 'task',
  bug: 'bug', b: 'bug', 'باگ': 'bug',
  decision: 'decision', d: 'decision', 'تصمیم': 'decision',
};

const DAY_WORDS: [RegExp, number][] = [
  [/(^|\s)(پس‌?\s?فردا|day after tomorrow)(?=\s|$)/i, 2],
  [/(^|\s)(today|امروز)(?=\s|$)/i, 0],
  [/(^|\s)(tomorrow|فردا)(?=\s|$)/i, 1],
  [/(^|\s)(next week|هفته‌ی?\s?بعد|هفته‌ی?\s?آینده)(?=\s|$)/i, 7],
];

export function parseChatCommand(text: string, today: string, profiles: Pick<Profile, 'id' | 'username' | 'displayName'>[]): ChatCommand | null {
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  const cmd = ALIASES[m[1].toLowerCase()];
  if (!cmd) return null;
  let rest = m[2].trim();
  if (cmd === 'decision') return rest ? { cmd, text: rest } : null;

  let assigneeId = null as string | null;
  rest = rest.replace(/(^|\s)@([^\s@]{2,24})/g, (all, lead: string, name: string) => {
    const who = profiles.find((p) => p.username.toLowerCase() === name.toLowerCase() || p.displayName.toLowerCase() === name.toLowerCase());
    if (!who) return all;
    assigneeId = who.id;
    return lead;
  });
  const bangs = /(^|\s)(!{1,3})(?=\s|$)/.exec(rest);
  rest = rest.replace(/(^|\s)!{1,3}(?=\s|$)/g, '$1');
  let dueDate: string | null = null;
  for (const [re, days] of DAY_WORDS) {
    if (re.test(rest)) { dueDate = addDays(today, days); rest = rest.replace(re, '$1'); break; }
  }
  const title = rest.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) return null;
  const n = bangs ? bangs[2].length : 0;
  if (cmd === 'bug') return { cmd, title, assigneeId, severity: (n === 0 ? 1 : Math.min(3, n)) as 0 | 1 | 2 | 3 };
  return { cmd, title, assigneeId, priority: Math.min(2, n) as 0 | 1 | 2, dueDate };
}

/** Today's date in the team's time zone (re-exported for the chat's quick due chips). */
export const chatToday = () => zonedDate();
