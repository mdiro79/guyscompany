'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  sendMessageAction, editMessageAction, deleteMessageAction, pinMessageAction, toggleReactionAction, markDecisionAction, loadOlderAction,
} from '@/app/actions/chat';
import { MESSAGE_DEFAULTS, type Message, type Reaction } from '@/lib/data/types';
import { useShell } from '@/components/shell/ShellContext';
import { onMessageChange } from '@/lib/live-messages';

export const PENDING = 'pending:';
const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt);
type Patch = Partial<Omit<Message, 'id' | 'channel'>>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const applied = (m: Message, p: Patch) => Object.entries(p).every(([k, v]) => same(m[k as keyof Message], v));

// Messages of one channel as the member should see them right now: the server's list, older pages
// loaded on scroll, plus what is not in it yet (our own while sending and once saved, others' from
// Realtime), with edits, pins, reactions and deletions applied at once. The next page refresh brings
// them in `saved` and the local copies are dropped. Shared by the chat page, the side chat and the office.
export function useChat(channel: string, saved: Message[]) {
  const { user } = useShell();
  const [local, setLocal] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(saved.length >= 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const loading = useRef(false);

  // A new chat starts from its own first page.
  useEffect(() => { setOlder([]); setLocal([]); setPatches({}); setRemoved(new Set()); setHasOlder(saved.length >= 50); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback((id: string, p: Patch) => setPatches((all) => ({ ...all, [id]: { ...all[id], ...p } })), []);
  const drop = useCallback((id: string) => {
    setRemoved((r) => new Set(r).add(id));
    setLocal((l) => l.filter((m) => m.id !== id));
    setOlder((o) => o.filter((m) => m.id !== id));
  }, []);

  useEffect(() => onMessageChange((c) => {
    if (c.type === 'delete') { drop(c.id); return; }
    const m = c.message;
    if (m.channel !== channel) return;
    if (c.type === 'update') {
      // Reactions live in their own table: an update never carries them.
      patch(m.id, { body: m.body, kind: m.kind, refId: m.refId, editedAt: m.editedAt, pinnedAt: m.pinnedAt, fileId: m.fileId });
      return;
    }
    setLocal((l) => {
      if (l.some((x) => x.id === m.id)) return l;
      // Our own message can arrive here before the send finishes: it takes the place of its "sending" copy.
      const own = m.authorId === user.id ? l.findIndex((x) => x.id.startsWith(PENDING) && x.body === m.body && x.fileId === m.fileId) : -1;
      return own < 0 ? [...l, m] : l.map((x, i) => (i === own ? m : x));
    });
  }), [channel, user.id, patch, drop]);

  const savedIds = useMemo(() => new Set(saved.map((m) => m.id)), [saved]);
  // Local copies and changes step aside once the server's list shows them.
  useEffect(() => {
    setLocal((l) => (l.some((m) => savedIds.has(m.id)) ? l.filter((m) => !savedIds.has(m.id)) : l));
    setPatches((all) => {
      const keep = Object.entries(all).filter(([id, p]) => { const m = saved.find((x) => x.id === id); return !m || !applied(m, p); });
      return keep.length === Object.keys(all).length ? all : Object.fromEntries(keep);
    });
    setRemoved((r) => { const keep = [...r].filter((id) => savedIds.has(id)); return keep.length === r.size ? r : new Set(keep); });
  }, [saved, savedIds]);

  const messages = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of [...older, ...saved, ...local]) map.set(m.id, m);
    const out: Message[] = [];
    for (const m of map.values()) {
      if (removed.has(m.id)) continue;
      out.push(patches[m.id] ? { ...m, ...patches[m.id] } : m);
    }
    return out.sort(byTime);
  }, [older, saved, local, patches, removed]);

  // The message shows right away as "sending"; resolves false (and the copy disappears) if sending fails.
  const send = useCallback((body: string, fileId: string | null = null, opts: { replyToId?: string | null; decision?: boolean } = {}) => new Promise<boolean>((resolve) => {
    const tempId = `${PENDING}${crypto.randomUUID()}`;
    const draft: Message = {
      ...MESSAGE_DEFAULTS, id: tempId, channel, authorId: user.id, body: body.trim(), fileId, replyToId: opts.replyToId ?? null,
      kind: opts.decision ? 'decision' : 'text', createdAt: new Date().toISOString(), reactions: [],
    };
    setLocal((l) => [...l, draft]);
    start(async () => {
      const r = await sendMessageAction(channel, body, fileId, opts).catch(() => null);
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

  /** Adds a message made elsewhere (a task card, a forward) without waiting for the refresh. */
  const add = useCallback((m: Message) => { if (m.channel === channel) setLocal((l) => (l.some((x) => x.id === m.id) ? l : [...l, m])); }, [channel]);

  // Each change shows at once and is undone if the server says no.
  const optimistic = useCallback(<T extends { ok: boolean }>(id: string, p: Patch, before: Patch, run: () => Promise<T>) => {
    patch(id, p);
    start(async () => { const r = await run().catch(() => null); if (!r?.ok) patch(id, before); });
  }, [patch]);

  const find = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);
  const edit = useCallback((id: string, body: string) => {
    const m = find(id); if (!m) return;
    optimistic(id, { body: body.trim(), editedAt: new Date().toISOString() }, { body: m.body, editedAt: m.editedAt }, () => editMessageAction(id, body));
  }, [find, optimistic]);
  const pin = useCallback((id: string, on: boolean) => {
    const m = find(id); if (!m) return;
    optimistic(id, { pinnedAt: on ? new Date().toISOString() : null }, { pinnedAt: m.pinnedAt }, () => pinMessageAction(id, on));
  }, [find, optimistic]);
  const decide = useCallback((id: string, on: boolean) => {
    const m = find(id); if (!m) return;
    optimistic(id, { kind: on ? 'decision' : 'text' }, { kind: m.kind }, () => markDecisionAction(id, on));
  }, [find, optimistic]);
  const react = useCallback((id: string, emoji: string) => {
    const m = find(id); if (!m) return;
    const mine = m.reactions.some((r) => r.userId === user.id && r.emoji === emoji);
    const reactions: Reaction[] = mine ? m.reactions.filter((r) => !(r.userId === user.id && r.emoji === emoji)) : [...m.reactions, { userId: user.id, emoji }];
    optimistic(id, { reactions }, { reactions: m.reactions }, () => toggleReactionAction(id, emoji));
  }, [find, optimistic, user.id]);
  const remove = useCallback((id: string) => {
    drop(id);
    start(async () => {
      const r = await deleteMessageAction(id).catch(() => null);
      if (!r?.ok) setRemoved((s) => { const n = new Set(s); n.delete(id); return n; });
    });
  }, [drop]);

  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => !m.id.startsWith(PENDING));
    if (!first || loading.current || !hasOlder) return 0;
    loading.current = true;
    setLoadingOlder(true);
    try {
      const r = await loadOlderAction(channel, first.createdAt).catch(() => null);
      const page = r?.ok ? r.messages ?? [] : [];
      if (r?.ok && page.length < 60) setHasOlder(false);
      if (page.length) setOlder((o) => [...page, ...o]);
      return page.length;
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }, [channel, messages, hasOlder]);

  return { messages, send, add, edit, pin, decide, react, remove, loadOlder, hasOlder, loadingOlder };
}
