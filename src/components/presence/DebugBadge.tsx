'use client';
import { useEffect, useState } from 'react';
import { realtimeStatus } from '@/lib/realtime/room';
import { getMesh } from '@/lib/realtime/mesh';
import { detectDevice } from '@/lib/device';

// Small connection read-out for diagnosing "not online" reports. Open any page with ?debug=1.
export function DebugBadge({ userId, online }: { userId: string; online: number }) {
  const [on, setOn] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('debug') === '1') { try { localStorage.setItem('gc-debug', '1'); } catch {} }
    if (p.get('debug') === '0') { try { localStorage.removeItem('gc-debug'); } catch {} }
    try { setOn(localStorage.getItem('gc-debug') === '1'); } catch { setOn(p.get('debug') === '1'); }
  }, []);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  const links = getMesh(userId, detectDevice())?.debugLinks() ?? [];
  return (
    <div dir="ltr" className="pointer-events-none fixed bottom-2 left-2 z-[9999] max-w-[90vw] rounded-lg bg-black/80 px-2 py-1 font-mono text-[11px] leading-tight text-white">
      <div>realtime: {realtimeStatus.value}</div>
      <div>online users: {online}</div>
      <div>links: {links.length ? links.join(' ') : 'none'}</div>
    </div>
  );
}
