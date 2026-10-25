'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Message } from '@/lib/data/types';

type Listener = (m: Message) => void;
const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

interface MessageRow { id: string; channel: string; author_id: string | null; body: string; file_id: string | null; created_at: string }

const toMessage = (r: MessageRow): Message => ({
  id: r.id, channel: r.channel, authorId: r.author_id, body: r.body, fileId: r.file_id,
  createdAt: new Date(r.created_at).toISOString(), reactions: [],
});

// New chat messages straight from Supabase Realtime (row-level security limits them to what the
// member may read), so they show at once instead of after a full page refresh.
// One shared subscription for every open chat panel. No-op in demo mode (the page polls instead).
export function onNewMessage(listener: Listener) {
  const supabase = supabaseBrowser();
  if (!supabase) return () => {};
  listeners.add(listener);
  channel ??= supabase.channel('live:messages:insert')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const m = toMessage(payload.new as MessageRow);
      listeners.forEach((l) => l(m));
    })
    .subscribe();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && channel) { void supabase.removeChannel(channel); channel = null; }
  };
}
