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
  // @username mentions notify the mentioned member.
  const profiles = await store().listProfiles();
  for (const p of profiles) {
    if (p.id !== user.id && new RegExp(`@${p.username}\\b`, 'i').test(text)) {
      await store().createNotification({ userId: p.id, kind: 'mention', payload: { name: user.displayName } });
    }
  }
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
