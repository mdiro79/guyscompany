'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { KUDOS_BADGES, type KudosBadge } from '@/lib/data/types';
import { fail, okResult, guard, type ActionResult } from './result';

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max);

// Team pulse: announcements, kudos and the daily standup.

export const postAnnouncementAction = guard(async function postAnnouncementAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const body = text(form, 'body', 1000);
  if (!body) return fail('empty');
  // Only an admin can keep an announcement at the top.
  await store().createPost({ kind: 'announcement', authorId: user.id, body, pinned: user.role === 'admin' && form.get('pinned') === 'on' });
  revalidatePath('/', 'layout');
  return okResult('saved');
});

export const sendKudosAction = guard(async function sendKudosAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const targetId = String(form.get('targetId') ?? '');
  const badge = String(form.get('badge') ?? '') as KudosBadge;
  const body = text(form, 'body', 500);
  if (targetId === user.id || !KUDOS_BADGES.includes(badge) || !(await store().getProfile(targetId))) return fail('invalid');
  await store().createPost({ kind: 'kudos', authorId: user.id, targetId, badge, body });
  await store().createNotification({ userId: targetId, kind: 'kudos', payload: { name: user.displayName } });
  revalidatePath('/', 'layout');
  return okResult('saved');
});

export const saveStandupAction = guard(async function saveStandupAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const standup = { did: text(form, 'did', 600), body: text(form, 'plan', 600), blockers: text(form, 'blockers', 600) };
  if (!standup.did && !standup.body && !standup.blockers) return fail('empty');
  await store().saveStandup(user.id, todayIso(), standup);
  revalidatePath('/', 'layout');
  return okResult('saved');
});

export const deletePostAction = guard(async function deletePostAction(id: string) {
  const user = await requireUser();
  const post = await store().getPost(id);
  if (!post || (user.role !== 'admin' && post.authorId !== user.id)) return fail('forbidden');
  await store().deletePost(id);
  revalidatePath('/', 'layout');
  return okResult();
});

export const pinPostAction = guard(async function pinPostAction(id: string, pinned: boolean) {
  const user = await requireUser();
  const post = await store().getPost(id);
  if (user.role !== 'admin' || post?.kind !== 'announcement') return fail('forbidden');
  await store().updatePost(id, { pinned });
  revalidatePath('/', 'layout');
  return okResult();
});
