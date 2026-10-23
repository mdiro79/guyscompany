'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { canUseChannel } from '@/lib/channels';
import { fail, okResult, type ActionResult } from './result';

export async function sendMessageAction(channel: string, body: string, fileId: string | null = null): Promise<ActionResult> {
  const user = await requireUser();
  const text = body.trim().slice(0, 4000);
  if (!text && !fileId) return fail('error');
  if (!(await canUseChannel(user.id, channel))) return fail('forbidden');
  await store().createMessage({ channel, authorId: user.id, body: text, fileId });
  // @username mentions notify the mentioned member (usernames may contain '.', so match literally).
  const mentioned = new Set(Array.from(text.toLowerCase().matchAll(/@([a-z0-9_.-]{3,24})/g), (m) => m[1].replace(/\.+$/, '')));
  const targets = (await store().listProfiles()).filter((p) => p.id !== user.id && mentioned.has(p.username));
  await Promise.all(targets.map((p) => store().createNotification({ userId: p.id, kind: 'mention', payload: { name: user.displayName } })));
  revalidatePath('/', 'layout');
  return okResult();
}

export async function toggleReactionAction(messageId: string, emoji: string) {
  const user = await requireUser();
  if (![...emoji].length || [...emoji].length > 4) return fail('error');
  await store().toggleReaction(messageId, user.id, emoji);
  revalidatePath('/', 'layout');
  return okResult();
}
