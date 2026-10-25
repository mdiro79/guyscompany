'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { isCharacterId } from '@/lib/characters';
import { fail, okResult, guard, type ActionResult } from './result';

export const updateProfileAction = guard(async function updateProfileAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const displayName = String(form.get('displayName') ?? '').trim().slice(0, 40);
  const jobTitle = String(form.get('jobTitle') ?? '').trim().slice(0, 40);
  if (!displayName) return fail('error');
  await store().updateProfile(user.id, { displayName, jobTitle });
  revalidatePath('/', 'layout');
  return okResult('saved');
});

// Only the selected character id (one of the 20) is stored.
export const setCharacterAction = guard(async function setCharacterAction(characterId: string) {
  const user = await requireUser();
  if (!isCharacterId(characterId)) return fail('error');
  await store().updateProfile(user.id, { characterId });
  revalidatePath('/', 'layout');
  return okResult();
});

export const setTutorialDoneAction = guard(async function setTutorialDoneAction(done: boolean) {
  const user = await requireUser();
  await store().updateProfile(user.id, { tutorialDone: done });
  revalidatePath('/', 'layout');
  return okResult();
});

export const requestSwapAction = guard(async function requestSwapAction(toUserId: string) {
  const user = await requireUser();
  if (toUserId === user.id) return fail('error');
  const offices = await store().listOffices();
  if (!offices.some((o) => o.ownerId === user.id) && !offices.some((o) => o.ownerId === toUserId)) return fail('error');
  const pending = (await store().listSwapRequests(user.id)).some((r) => r.status === 'pending' && r.fromUserId === user.id && r.toUserId === toUserId);
  if (pending) return okResult('requestSent');
  await store().createSwapRequest(user.id, toUserId);
  await store().createNotification({ userId: toUserId, kind: 'swap_request', payload: { name: user.displayName } });
  revalidatePath('/', 'layout');
  return okResult('requestSent');
});

// Both sides agree: the recipient accepts and the two offices are exchanged.
export const respondSwapAction = guard(async function respondSwapAction(id: string, accept: boolean) {
  const user = await requireUser();
  const req = (await store().listSwapRequests(user.id)).find((r) => r.id === id);
  if (!req || req.toUserId !== user.id || req.status !== 'pending') return fail('error');
  await store().updateSwapRequest(id, accept ? 'accepted' : 'declined');
  if (accept) {
    const offices = await store().listOffices();
    const a = offices.find((o) => o.ownerId === req.fromUserId);
    const b = offices.find((o) => o.ownerId === req.toUserId);
    if (a) await store().updateOffice(a.slot, { ownerId: req.toUserId });
    if (b) await store().updateOffice(b.slot, { ownerId: req.fromUserId });
  }
  revalidatePath('/', 'layout');
  return okResult();
});
