'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store, type TodoPatch } from '@/lib/data';
import { TODO_OPEN_MAX, TODO_TITLE_MAX } from '@/lib/todos';
import { fail, okResult, guard } from './result';

// Personal to-dos: every action only touches the signed-in member's own items.

interface TodoInput { title: string; due: string | null; priority: number; starred: boolean }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDue = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null);
const cleanPriority = (v: unknown) => (v === 1 || v === 2 ? v : 0);

export const addTodoAction = guard(async function addTodoAction(input: TodoInput) {
  const user = await requireUser();
  const title = String(input.title ?? '').trim().slice(0, TODO_TITLE_MAX);
  if (!title) return fail('error');
  if ((await store().countOpenTodos(user.id)) >= TODO_OPEN_MAX) return fail('tooMany');
  await store().createTodo({ userId: user.id, title, due: cleanDue(input.due), priority: cleanPriority(input.priority), starred: input.starred === true });
  revalidatePath('/', 'layout');
  return okResult();
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
  if (typeof patch.done === 'boolean') { clean.done = patch.done; clean.doneAt = patch.done ? new Date().toISOString() : null; }
  await store().updateTodo(id, user.id, clean);
  revalidatePath('/', 'layout');
  return okResult();
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
