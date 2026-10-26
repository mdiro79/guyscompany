'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { sendMessageAction } from '@/app/actions/chat';
import type { Message } from '@/lib/data/types';
import { useShell } from '@/components/shell/ShellContext';
import { onNewMessage } from '@/lib/live-messages';

export const PENDING = 'pending:';
const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt);

// Messages of one channel as the member should see them right now: the server's list plus messages not
// in it yet (our own while sending and once saved, others' from Realtime). They show at once; the next
// page refresh brings them in `saved` and the local copies are dropped. Shared by the dashboard chat and
// the chat in the 3D office.
export function useChat(channel: string, saved: Message[]) {
  const { user } = useShell();
  const [local, setLocal] = useState<Message[]>([]);
  const [, start] = useTransition();

  useEffect(() => onNewMessage((m) => {
    if (m.channel !== channel) return;
    setLocal((l) => {
      if (l.some((x) => x.id === m.id)) return l;
      // Our own message can arrive here before the send finishes: it takes the place of its "sending" copy.
      const own = m.authorId === user.id ? l.findIndex((x) => x.id.startsWith(PENDING) && x.body === m.body && x.fileId === m.fileId) : -1;
      return own < 0 ? [...l, m] : l.map((x, i) => (i === own ? m : x));
    });
  }), [channel, user.id]);
  const savedIds = useMemo(() => new Set(saved.map((m) => m.id)), [saved]);
  useEffect(() => { setLocal((l) => (l.some((m) => savedIds.has(m.id)) ? l.filter((m) => !savedIds.has(m.id)) : l)); }, [savedIds]);
  const messages = useMemo(() => {
    const extra = local.filter((m) => !savedIds.has(m.id));
    return extra.length ? [...saved, ...extra].sort(byTime) : saved;
  }, [saved, local, savedIds]);

  // The message shows right away as "sending"; resolves false (and the copy disappears) if sending fails.
  const send = useCallback((body: string, fileId: string | null = null) => new Promise<boolean>((resolve) => {
    const tempId = `${PENDING}${crypto.randomUUID()}`;
    setLocal((l) => [...l, { id: tempId, channel, authorId: user.id, body: body.trim(), fileId, createdAt: new Date().toISOString(), reactions: [] }]);
    start(async () => {
      const r = await sendMessageAction(channel, body, fileId).catch(() => null);
      if (r?.ok && r.sent) {
        const sent = r.sent;
        // Realtime may have delivered it already.
        setLocal((l) => (l.some((m) => m.id === sent.id) ? l.filter((m) => m.id !== tempId) : l.map((m) => (m.id === tempId ? sent : m))));
        resolve(true);
        return;
      }
      setLocal((l) => l.filter((m) => m.id !== tempId));
      resolve(false);
    });
  }), [channel, user.id]);

  return { messages, send };
}
