// Personal to-dos: quick-add parsing, ordering, due labels and the completion streak.
// Dates are YYYY-MM-DD in the team's time zone (see todayIso).

export type Priority = 0 | 1 | 2; // normal, medium, urgent

import type { TodoCategory } from './todo-game';

export interface ParsedTodo { title: string; due: string | null; priority: Priority; starred: boolean; category: TodoCategory | null }

export const TODO_TITLE_MAX = 200;
export const TODO_OPEN_MAX = 300;

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekday = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// Next date (today included) that falls on the given weekday (0 = Sunday).
const nextWeekday = (today: string, day: number) => addDays(today, (day - weekday(today) + 7) % 7);

// Words for dates, Persian and English. Multi-word forms come first so "سه شنبه" is not read as "شنبه".
const DAY_WORDS: [RegExp, (today: string) => string][] = [
  [/^(پس[\s‌]?فردا|day after tomorrow)$/i, (t) => addDays(t, 2)],
  [/^(هفته[\s‌]?(ی[\s‌]?)?بعد|next week)$/i, (t) => addDays(t, 7)],
  [/^(سه[\s‌]?شنبه|tue|tues|tuesday)$/i, (t) => nextWeekday(t, 2)],
  [/^(پنج[\s‌]?شنبه|thu|thur|thurs|thursday)$/i, (t) => nextWeekday(t, 4)],
  [/^(یک[\s‌]?شنبه|sun|sunday)$/i, (t) => nextWeekday(t, 0)],
  [/^(دو[\s‌]?شنبه|mon|monday)$/i, (t) => nextWeekday(t, 1)],
  [/^(چهار[\s‌]?شنبه|wed|wednesday)$/i, (t) => nextWeekday(t, 3)],
  [/^(شنبه|sat|saturday)$/i, (t) => nextWeekday(t, 6)],
  [/^(جمعه|fri|friday)$/i, (t) => nextWeekday(t, 5)],
  [/^(امروز|today)$/i, (t) => t],
  [/^(فردا|tomorrow|tmr)$/i, (t) => addDays(t, 1)],
];
const STAR = /^(\*|⭐|★|مهم|important)$/i;
const URGENT = /^(!!+|فوری|urgent)$/i;
const MEDIUM = /^!$/;
// A category is typed as a hashtag: #کار, #work, #یادگیری, #learn, …
const CATEGORY_WORDS: [RegExp, TodoCategory][] = [
  [/^#(شخصی|personal|home|خانه)$/i, 'personal'],
  [/^#(کار|work|job)$/i, 'work'],
  [/^#(یادگیری|درس|مطالعه|learn|learning|study)$/i, 'learning'],
  [/^#(سلامت|سلامتی|ورزش|health|fitness|sport)$/i, 'health'],
];

// "خرید نان فردا !! *" → title "خرید نان", due tomorrow, urgent, starred.
// Recognised words are taken out of the title; two-word forms ("سه شنبه", "پس فردا", "next week") are tried first.
export function parseQuickAdd(input: string, today: string): ParsedTodo {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const out: ParsedTodo = { title: '', due: null, priority: 0, starred: false, category: null };
  const keep: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
    const pairMatch = pair && DAY_WORDS.find(([re]) => re.test(pair));
    if (pairMatch) { out.due = pairMatch[1](today); i++; continue; }
    const w = words[i];
    const day = DAY_WORDS.find(([re]) => re.test(w));
    if (day) { out.due = day[1](today); continue; }
    if (STAR.test(w)) { out.starred = true; continue; }
    if (URGENT.test(w)) { out.priority = 2; continue; }
    if (MEDIUM.test(w)) { out.priority = Math.max(out.priority, 1) as Priority; continue; }
    const cat = CATEGORY_WORDS.find(([re]) => re.test(w));
    if (cat) { out.category = cat[1]; continue; }
    keep.push(w);
  }
  // Nothing but keywords: keep the text as typed rather than adding an empty to-do.
  out.title = (keep.length ? keep.join(' ') : input.trim()).slice(0, TODO_TITLE_MAX);
  if (!keep.length) { out.due = null; out.priority = 0; out.starred = false; out.category = null; }
  return out;
}

export type DueKind = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export function dueKind(due: string, today: string): DueKind {
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === addDays(today, 1)) return 'tomorrow';
  return due <= addDays(today, 6) ? 'week' : 'later';
}

interface Sortable { done: boolean; due: string | null; starred: boolean; priority: number; createdAt: string; doneAt: string | null }

// Open items first: by due date (overdue and today on top, no date last), then starred, priority and age.
// Done items after them, the most recently finished first.
export function sortTodos<T extends Sortable>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt ?? '').localeCompare(a.doneAt ?? '');
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// Days in a row with at least one finished to-do, ending today (or yesterday, so a streak is not lost
// before today's first one).
export function streak(doneDays: string[], today: string) {
  const days = new Set(doneDays);
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) { n++; day = addDays(day, -1); }
  return n;
}
