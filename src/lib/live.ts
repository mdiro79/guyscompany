'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

const DEBOUNCE_MS = 400;
const PAUSE_EVENT = 'gc-live-pause';
let paused = false;

// Pauses live refreshes while the page is not seen although its tab is visible: the dashboard kept
// loaded (hidden) inside the office for the desk monitor. Changes made meanwhile refresh once on resume.
export function setLivePaused(value: boolean) {
  if (paused === value) return;
  paused = value;
  window.dispatchEvent(new Event(PAUSE_EVENT));
}
const FALLBACK_POLL_MS = 15000;
const STALE_AFTER_HIDDEN_MS = 30000;

// Re-renders server data when the given tables change (Supabase Realtime), or polls in demo mode.
// Bursts of changes are merged into one refresh, and hidden tabs refresh once when they become visible.
export function useLive(tables: string[], intervalMs = 5000) {
  const router = useRouter();
  const key = tables.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    let hiddenAt = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    const visible = () => document.visibilityState === 'visible' && !paused;
    const refresh = () => {
      if (!visible()) { dirty = true; return; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { dirty = false; router.refresh(); }, DEBOUNCE_MS);
    };
    const onVisibility = () => {
      if (!visible()) { hiddenAt ||= Date.now(); return; }
      // Mobile browsers suspend sockets in the background, so a long absence may have missed events.
      if (dirty || (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS)) refresh();
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(PAUSE_EVENT, onVisibility);
    const startPolling = (ms: number) => { poll ??= setInterval(() => { if (visible()) router.refresh(); }, ms); };

    const supabase = supabaseBrowser();
    if (!supabase) {
      startPolling(intervalMs);
      return () => { if (poll) clearInterval(poll); if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener(PAUSE_EVENT, onVisibility); };
    }
    const channel = supabase.channel(`live:${key}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    // A socket that never answers reports nothing at all, so polling also starts if it is not up in time.
    const giveUp = setTimeout(() => startPolling(FALLBACK_POLL_MS), 8000);
    channel.subscribe((status) => {
      // Realtime unavailable (blocked network, not enabled): keep data fresh by polling instead.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling(FALLBACK_POLL_MS);
      if (status === 'SUBSCRIBED') clearTimeout(giveUp);
      if (status === 'SUBSCRIBED' && poll) { clearInterval(poll); poll = null; }
    });
    return () => {
      clearTimeout(giveUp);
      if (poll) clearInterval(poll);
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(PAUSE_EVENT, onVisibility);
      supabase.removeChannel(channel);
    };
  }, [key, intervalMs, router]);
}
