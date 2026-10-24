'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store, type TodoPatch } from '@/lib/data';
import { TODO_OPEN_MAX, TODO_TITLE_MAX, streak } from '@/lib/todos';
import { scoreDone, scoreQuests, xpFor, TODO_CATEGORIES, type TodoCategory, type TodoStats } from '@/lib/todo-game';
import { todayIso, zonedDate } from '@/lib/format';
import { CLEARED_TODO_RETENTION_DAYS } from '@/lib/limits';
import { fail, okResult, guard } from './result';

// Personal to-dos: every action only touches the signed-in member's own items. Finishing one gives XP
// (taken back if it is un-ticked); the server keeps the score, the streak record and the daily bonus.

interface TodoInput { title: string; due: string | null; priority: number; starred: boolean; category: TodoCategory | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDue = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null);
const cleanPriority = (v: unknown) => (v === 1 || v === 2 ? v : 0);
const cleanCategory = (v: unknown): TodoCategory | null => (TODO_CATEGORIES.includes(v as TodoCategory) ? (v as TodoCategory) : null);

// After a change: the best streak so far and today's quest bonus (once a day). Returns the bonus given.
async function settle(userId: string, stats: TodoStats) {
  const since = new Date(Date.now() - CLEARED_TODO_RETENTION_DAYS * 86400000).toISOString();
  const list = await store().listTodos(userId, since);
  const today = todayIso();
  const best = streak(list.filter((t) => t.done && t.doneAt).map((t) => zonedDate(t.doneAt!)), today);
  const withStreak = { ...stats, counters: { ...stats.counters, bestStreak: Math.max(stats.counters.bestStreak, best) } };
  const next = scoreQuests(withStreak, list, today);
  await store().setTodoStats(userId, next);
  return next.xp - withStreak.xp;
}

export const addTodoAction = guard(async function addTodoAction(input: TodoInput) {
  const user = await requireUser();
  const title = String(input.title ?? '').trim().slice(0, TODO_TITLE_MAX);
  if (!title) return fail('error');
  if ((await store().countOpenTodos(user.id)) >= TODO_OPEN_MAX) return fail('tooMany');
  await store().createTodo({ userId: user.id, title, due: cleanDue(input.due), priority: cleanPriority(input.priority), starred: input.starred === true, category: cleanCategory(input.category) ?? 'personal' });
  // Planning ahead is one of the daily quests.
  const bonus = await settle(user.id, await store().getTodoStats(user.id));
  revalidatePath('/', 'layout');
  return okResult(undefined, { bonus: String(bonus) });
});

export const updateTodoAction = guard(async function updateTodoAction(id: string, patch: Partial<TodoInput & { done: boolean }>) {
  const user = await requireUser();
  const clean: TodoPatch = {};
  if (typeof patch.title === 'string') {
    const title = patch.title.trim().slice(0, TODO_TITLE_MAX);
    if (!title) return fail('error');
    clean.title = title;
  }
  if ('due' in patch) clean.due = cleanDue(patch.due);
  if ('priority' in patch) clean.priority = cleanPriority(patch.priority);
  if (typeof patch.starred === 'boolean') clean.starred = patch.starred;
  const category = cleanCategory(patch.category);
  if (category) clean.category = category;
  if (typeof patch.done !== 'boolean') {
    await store().updateTodo(id, user.id, clean);
    revalidatePath('/', 'layout');
    return okResult();
  }
  const before = await store().getTodo(id, user.id);
  if (!before) return fail('error');
  const todo = { ...before, ...clean };
  let stats = await store().getTodoStats(user.id);
  let gained = 0;
  if (patch.done && !before.done) {
    const at = new Date().toISOString();
    gained = xpFor(todo, zonedDate(at));
    Object.assign(clean, { done: true, doneAt: at, xp: gained });
    stats = scoreDone(stats, todo, at, gained, 1);
  } else if (!patch.done && before.done) {
    Object.assign(clean, { done: false, doneAt: null, xp: 0 });
    stats = scoreDone(stats, todo, before.doneAt ?? new Date().toISOString(), before.xp, -1);
  }
  await store().updateTodo(id, user.id, clean);
  const bonus = await settle(user.id, stats);
  revalidatePath('/', 'layout');
  return okResult(undefined, { xp: String(gained), bonus: String(bonus) });
});

export const deleteTodoAction = guard(async function deleteTodoAction(id: string) {
  const user = await requireUser();
  await store().deleteTodo(id, user.id);
  revalidatePath('/', 'layout');
  return okResult();
});

// Done items leave the list but are kept a while for the streak (see CLEARED_TODO_RETENTION_DAYS).
export const clearDoneTodosAction = guard(async function clearDoneTodosAction() {
  const user = await requireUser();
  await store().clearDoneTodos(user.id);
  revalidatePath('/', 'layout');
  return okResult();
});
