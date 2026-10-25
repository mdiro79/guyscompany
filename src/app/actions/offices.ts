'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store, type Office } from '@/lib/data';
import { fail, okResult, guard } from './result';

type OfficeSettings = Partial<Pick<Office, 'glass' | 'locked' | 'focus' | 'isPublic'>>;

export const updateMyOfficeAction = guard(async function updateMyOfficeAction(patch: OfficeSettings) {
  const user = await requireUser();
  const office = (await store().listOffices()).find((o) => o.ownerId === user.id);
  if (!office) return fail('forbidden');
  const clean: OfficeSettings = {};
  if (patch.glass === 'clear' || patch.glass === 'frosted') clean.glass = patch.glass;
  for (const k of ['locked', 'focus', 'isPublic'] as const) if (typeof patch[k] === 'boolean') clean[k] = patch[k];
  await store().updateOffice(office.slot, clean);
  // Office focus mode also sets the owner's status.
  if (typeof clean.focus === 'boolean') await store().updateProfile(user.id, { status: clean.focus ? 'focus' : 'online' });
  revalidatePath('/', 'layout');
  return okResult();
});

// Visitor log (kept 30 days by the cleanup cron). One entry per visitor per office per hour.
export const recordVisitAction = guard(async function recordVisitAction(slot: number) {
  const user = await requireUser();
  const office = (await store().listOffices()).find((o) => o.slot === slot);
  if (!office || office.ownerId === user.id) return okResult();
  const recent = await store().listVisits(slot, new Date(Date.now() - 3600000).toISOString());
  if (!recent.some((v) => v.visitorId === user.id)) await store().addVisit(slot, user.id);
  return okResult();
});

export const listVisitsAction = guard(async function listVisitsAction(slot: number) {
  const user = await requireUser();
  const office = (await store().listOffices()).find((o) => o.slot === slot);
  if (!office || (office.ownerId !== user.id && user.role !== 'admin')) return [];
  return store().listVisits(slot, new Date(Date.now() - 30 * 86400000).toISOString());
}, []);

export const inviteToChatAction = guard(async function inviteToChatAction(inviteeId: string) {
  const user = await requireUser();
  const office = (await store().listOffices()).find((o) => o.ownerId === user.id);
  if (!office || inviteeId === user.id) return fail('forbidden');
  await store().createInvite({ slot: office.slot, inviterId: user.id, inviteeId });
  await store().createNotification({ userId: inviteeId, kind: 'chat_invite', payload: { name: user.displayName } });
  revalidatePath('/', 'layout');
  return okResult();
});

// The invitee must accept before entering the private chat.
export const respondInviteAction = guard(async function respondInviteAction(id: string, accept: boolean) {
  const user = await requireUser();
  const invite = (await store().listInvites(user.id)).find((i) => i.id === id);
  if (!invite || invite.inviteeId !== user.id || invite.status !== 'pending') return fail('error');
  await store().updateInvite(id, accept ? 'accepted' : 'declined');
  revalidatePath('/', 'layout');
  return okResult();
});
