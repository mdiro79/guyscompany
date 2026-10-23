'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, createAccount, deleteAccount, resetPassword } from '@/lib/auth';
import { store } from '@/lib/data';
import { USERNAME_PATTERN } from '@/lib/env';
import { tempPassword } from '@/lib/password';
import { MAX_MEMBERS } from '@/lib/limits';
import { fail, okResult, guard, type ActionResult } from './result';

export const createAccountAction = guard(async function createAccountAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return fail('usernameInvalid');
  if ((await store().listProfiles()).length >= MAX_MEMBERS) return fail('maxUsers');
  const password = tempPassword();
  try {
    await createAccount({
      username,
      displayName: String(form.get('displayName') ?? '').trim(),
      jobTitle: String(form.get('jobTitle') ?? '').trim(),
      role: form.get('role') === 'admin' ? 'admin' : 'member',
      password,
    });
  } catch (e) {
    return fail(e instanceof Error && e.message === 'USERNAME_TAKEN' ? 'usernameTaken' : 'error');
  }
  revalidatePath('/', 'layout');
  return okResult('created', { password });
});

export const deleteAccountAction = guard(async function deleteAccountAction(id: string) {
  const admin = await requireAdmin();
  if (id === admin.id) return fail('error');
  await deleteAccount(id);
  revalidatePath('/', 'layout');
  return okResult();
});

export const resetPasswordAction = guard(async function resetPasswordAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const password = tempPassword();
  await resetPassword(id, password);
  revalidatePath('/', 'layout');
  return okResult('resetDone', { password });
});

export const setRoleAction = guard(async function setRoleAction(id: string, role: 'admin' | 'member') {
  const admin = await requireAdmin();
  if (id === admin.id) return fail('error');
  await store().updateProfile(id, { role });
  revalidatePath('/', 'layout');
  return okResult();
});

// Assigning an occupied office moves its current owner to the assignee's old office (if any).
export const assignOfficeAction = guard(async function assignOfficeAction(slot: number, userId: string | null) {
  await requireAdmin();
  const offices = await store().listOffices();
  const target = offices.find((o) => o.slot === slot);
  if (!target) return fail('error');
  if (userId) {
    const previous = offices.find((o) => o.ownerId === userId);
    if (previous && previous.slot !== slot) await store().updateOffice(previous.slot, { ownerId: target.ownerId });
  }
  await store().updateOffice(slot, { ownerId: userId });
  revalidatePath('/', 'layout');
  return okResult();
});

export const runCleanupAction = guard(async function runCleanupAction(): Promise<ActionResult> {
  await requireAdmin();
  const { runCleanup } = await import('@/lib/cleanup');
  const r = await runCleanup();
  revalidatePath('/', 'layout');
  return okResult('cleanupDone', { visits: String(r.visits), notifications: String(r.notifications) });
});
