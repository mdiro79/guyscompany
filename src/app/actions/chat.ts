'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { store, type Message } from '@/lib/data';
import { canUseChannel } from '@/lib/channels';
import { fail, okResult, guard, type ActionResult } from './result';

// Returns the saved message for the sender's panel. No page re-render here: rebuilding the whole layout
// held the reply for seconds; other members get the message from Realtime (or polling in demo mode).
export const sendMessageAction = guard(async function sendMessageAction(channel: string, body: string, fileId: string | null = null): Promise<ActionResult & { sent?: Message }> {
  const user = await requireUser();
  const text = body.trim().slice(0, 4000);
  if (!text && !fileId) return fail('error');
  if (!(await canUseChannel(user.id, channel))) return fail('forbidden');
  const sent = await store().createMessage({ channel, authorId: user.id, body: text, fileId });
  // @username mentions notify the mentioned member (usernames may contain '.', so match literally).
  // Sent after the response, so the message itself is not held up.
  const mentioned = new Set(Array.from(text.toLowerCase().matchAll(/@([a-z0-9_.-]{3,24})/g), (m) => m[1].replace(/\.+$/, '')));
  if (mentioned.size) {
    after(async () => {
      const targets = (await store().listProfiles()).filter((p) => p.id !== user.id && mentioned.has(p.username));
      await Promise.all(targets.map((p) => store().createNotification({ userId: p.id, kind: 'mention', payload: { name: user.displayName } })));
    });
  }
  return { ...okResult(), sent };
});

export const toggleReactionAction = guard(async function toggleReactionAction(messageId: string, emoji: string) {
  const user = await requireUser();
  if (![...emoji].length || [...emoji].length > 4) return fail('error');
  await store().toggleReaction(messageId, user.id, emoji);
  revalidatePath('/', 'layout');
  return okResult();
});
