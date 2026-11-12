'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import { MESSAGE_KINDS, type Message, type MessageKind } from '@/lib/data/types';

export type MessageChange =
  | { type: 'insert'; message: Message }
  | { type: 'update'; message: Message }
  | { type: 'delete'; id: string };
type Listener = (change: MessageChange) => void;
type InsertListener = (m: Message) => void;
const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

interface MessageRow {
  id: string; channel: string; author_id: string | null; body: string; file_id: string | null; created_at: string;
  reply_to_id?: string | null; forwarded_from?: string | null; kind?: string; ref_id?: string | null; edited_at?: string | null; pinned_at?: string | null;
}

const when = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);
export const toMessage = (r: MessageRow): Message => ({
  id: r.id, channel: r.channel, authorId: r.author_id, body: r.body, fileId: r.file_id,
  replyToId: r.reply_to_id ?? null, forwardedFrom: r.forwarded_from ?? null,
  kind: MESSAGE_KINDS.includes(r.kind as MessageKind) ? (r.kind as MessageKind) : 'text', refId: r.ref_id ?? null,
  editedAt: when(r.edited_at), pinnedAt: when(r.pinned_at),
  createdAt: new Date(r.created_at).toISOString(), reactions: [],
});

// Chat changes straight from Supabase Realtime (row-level security limits them to what the member may
// read), so new, edited, pinned and deleted messages show at once instead of after a page refresh.
// One shared subscription for every open chat. No-op in demo mode (the page polls instead).
export function onMessageChange(listener: Listener) {
  const supabase = supabaseBrowser();
  if (!supabase) return () => {};
  listeners.add(listener);
  channel ??= supabase.channel('live:messages:changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      let change: MessageChange | null = null;
      if (payload.eventType === 'INSERT') change = { type: 'insert', message: toMessage(payload.new as MessageRow) };
      else if (payload.eventType === 'UPDATE') change = { type: 'update', message: toMessage(payload.new as MessageRow) };
      else if (payload.eventType === 'DELETE' && (payload.old as { id?: string }).id) change = { type: 'delete', id: (payload.old as { id: string }).id };
      if (change) { const c = change; listeners.forEach((l) => l(c)); }
    })
    .subscribe();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && channel) { void supabase.removeChannel(channel); channel = null; }
  };
}

/** New messages only (the office chat and the side panel). */
export function onNewMessage(listener: InsertListener) {
  return onMessageChange((c) => { if (c.type === 'insert') listener(c.message); });
}
