'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { store, type UserStatus } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { fail, okResult } from './result';

export async function setThemeAction(theme: 'light' | 'dark') {
  (await cookies()).set('gc_theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return okResult();
}

export async function setStatusAction(status: UserStatus) {
  const user = await requireUser();
  if (!['online', 'busy', 'focus'].includes(status)) return fail('error');
  await store().updateProfile(user.id, { status });
  revalidatePath('/', 'layout');
  return okResult();
}

export async function markNotificationsReadAction(ids?: string[]) {
  const user = await requireUser();
  await store().markNotificationsRead(user.id, ids);
  revalidatePath('/', 'layout');
  return okResult();
}

export async function addFocusAction(text: string) {
  const user = await requireUser();
  const value = text.trim().slice(0, 200);
  if (!value) return fail('error');
  await store().createFocus({ userId: user.id, day: todayIso(), text: value });
  revalidatePath('/', 'layout');
  return okResult();
}

export async function toggleFocusAction(id: string, done: boolean) {
  const user = await requireUser();
  await store().updateFocus(id, user.id, { done });
  revalidatePath('/', 'layout');
  return okResult();
}

export async function deleteFocusAction(id: string) {
  const user = await requireUser();
  await store().deleteFocus(id, user.id);
  revalidatePath('/', 'layout');
  return okResult();
}
