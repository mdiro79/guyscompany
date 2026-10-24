import { describe, it, expect } from 'vitest';
import { parseQuickAdd, dueKind, sortTodos, streak, addDays } from './todos';

const today = '2026-10-24'; // a Saturday

describe('quick add', () => {
  it('reads Persian date words, priority and star', () => {
    expect(parseQuickAdd('خرید نان فردا !! *', today)).toEqual({ title: 'خرید نان', due: '2026-10-25', priority: 2, starred: true, category: null });
    expect(parseQuickAdd('تماس با دکتر امروز !', today)).toEqual({ title: 'تماس با دکتر', due: today, priority: 1, starred: false, category: null });
    expect(parseQuickAdd('ورزش پس فردا مهم', today)).toMatchObject({ title: 'ورزش', due: '2026-10-26', starred: true, category: null });
    expect(parseQuickAdd('ورزش پس‌فردا', today).due).toBe('2026-10-26');
  });
  it('reads weekdays (today included) without confusing شنبه inside other days', () => {
    expect(parseQuickAdd('مطالعه شنبه', today).due).toBe(today);
    expect(parseQuickAdd('مطالعه سه شنبه', today).due).toBe('2026-10-27');
    expect(parseQuickAdd('مطالعه سه‌شنبه', today).due).toBe('2026-10-27');
    expect(parseQuickAdd('مطالعه پنجشنبه', today).due).toBe('2026-10-29');
    expect(parseQuickAdd('call mom friday urgent', today)).toMatchObject({ title: 'call mom', due: '2026-10-30', priority: 2 });
    expect(parseQuickAdd('plan next week', today).due).toBe('2026-10-31');
  });
  it('keeps plain text and never returns an empty title', () => {
    expect(parseQuickAdd('گزارش ماهانه #کار فردا', today)).toMatchObject({ title: 'گزارش ماهانه', category: 'work', due: '2026-10-25' });
    expect(parseQuickAdd('run 5k #health', today)).toMatchObject({ title: 'run 5k', category: 'health' });
    expect(parseQuickAdd('#یادگیری', today)).toMatchObject({ title: '#یادگیری', category: null });
    expect(parseQuickAdd('tag #random stays', today)).toMatchObject({ title: 'tag #random stays', category: null });
    expect(parseQuickAdd('  read a book  ', today)).toEqual({ title: 'read a book', due: null, priority: 0, starred: false, category: null });
    expect(parseQuickAdd('فردا', today)).toEqual({ title: 'فردا', due: null, priority: 0, starred: false, category: null });
  });
});

it('labels due dates', () => {
  expect(dueKind('2026-10-20', today)).toBe('overdue');
  expect(dueKind(today, today)).toBe('today');
  expect(dueKind('2026-10-25', today)).toBe('tomorrow');
  expect(dueKind('2026-10-30', today)).toBe('week');
  expect(dueKind('2026-11-10', today)).toBe('later');
});

it('orders open items by date, star and priority; done ones last, newest first', () => {
  const t = (id: string, o: Partial<{ done: boolean; due: string | null; starred: boolean; priority: number; createdAt: string; doneAt: string | null }>) =>
    ({ id, done: false, due: null, starred: false, priority: 0, createdAt: '2026-10-01', doneAt: null, ...o });
  const list = [
    t('nodate', {}), t('done-old', { done: true, doneAt: '2026-10-20T10:00:00Z' }), t('tomorrow', { due: '2026-10-25' }),
    t('today-star', { due: today, starred: true }), t('today', { due: today }), t('overdue', { due: '2026-10-22' }),
    t('done-new', { done: true, doneAt: '2026-10-24T10:00:00Z' }), t('nodate-urgent', { priority: 2 }),
  ];
  expect(sortTodos(list).map((x) => x.id)).toEqual(['overdue', 'today-star', 'today', 'tomorrow', 'nodate-urgent', 'nodate', 'done-new', 'done-old']);
});

it('counts the streak of days with something done', () => {
  expect(streak([], today)).toBe(0);
  expect(streak([today, addDays(today, -1), addDays(today, -2)], today)).toBe(3);
  expect(streak([addDays(today, -1), addDays(today, -2)], today)).toBe(2); // not lost before today's first
  expect(streak([today, addDays(today, -2)], today)).toBe(1);
});
