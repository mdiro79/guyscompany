'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { removeObject } from '@/lib/storage';
import { fromZonedLocal } from '@/lib/format';
import { fail, okResult, guard, type ActionResult } from './result';

export const createEventAction = guard(async function createEventAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const title = String(form.get('title') ?? '').trim().slice(0, 200);
  // datetime-local inputs carry no zone; they mean Tehran time (the server itself runs on UTC).
  const startsAt = fromZonedLocal(String(form.get('startsAt') ?? ''));
  const endsAt = fromZonedLocal(String(form.get('endsAt') || form.get('startsAt') || ''));
  if (!title || Number.isNaN(startsAt.getTime())) return fail('error');
  const end = Number.isNaN(endsAt.getTime()) || endsAt < startsAt ? new Date(startsAt.getTime() + 3600000) : endsAt;
  await store().createEvent({ title, startsAt: startsAt.toISOString(), endsAt: end.toISOString(), createdBy: user.id });
  revalidatePath('/', 'layout');
  return okResult('saved');
});

export const deleteEventAction = guard(async function deleteEventAction(id: string) {
  await requireUser();
  await store().deleteEvent(id);
  revalidatePath('/', 'layout');
  return okResult();
});

export const deleteFileAction = guard(async function deleteFileAction(id: string) {
  const user = await requireUser();
  const file = await store().getFile(id);
  if (!file || (user.role !== 'admin' && file.uploadedBy !== user.id)) return fail('forbidden');
  await removeObject(file.storagePath);
  await store().deleteFile(id);
  revalidatePath('/', 'layout');
  return okResult();
});
