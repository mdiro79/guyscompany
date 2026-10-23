'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// Re-renders server data when the given tables change (Supabase Realtime), or polls in demo mode.
export function useLive(tables: string[], intervalMs = 5000) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(',');
  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 150);
    };
    const supabase = supabaseBrowser();
    if (!supabase) {
      const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, intervalMs);
      return () => clearInterval(id);
    }
    const channel = supabase.channel(`live:${key}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [key, intervalMs, router]);
}
