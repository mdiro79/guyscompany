'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRoom, type PresenceMeta } from '@/lib/realtime/room';
import { useShell } from '@/components/shell/ShellContext';
import { detectDevice, isEmbedded } from '@/lib/device';
import type { Profile } from '@/lib/data/types';
import { PresenceCtx } from './PresenceContext';
import { DebugBadge } from './DebugBadge';

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, demo } = useShell();
  const [peers, setPeers] = useState<PresenceMeta[]>([]);
  useEffect(() => {
    if (isEmbedded()) return;
    const room = getRoom();
    const off = room.onPresence(setPeers);
    room.track({ userId: user.id, device: detectDevice(), micActive: false });
    return off;
  }, [user.id]);
  const value = useMemo(() => {
    const onlineIds = new Set(peers.map((p) => p.userId));
    onlineIds.add(user.id);
    return {
      onlineIds,
      // Demo mode has no shared presence across devices, so everyone is shown with their saved status.
      statusOf: (p: Profile) => (demo || onlineIds.has(p.id) ? p.status : 'offline' as const),
    };
  }, [peers, user.id, demo]);
  return <PresenceCtx.Provider value={value}>{children}<DebugBadge userId={user.id} online={value.onlineIds.size} /></PresenceCtx.Provider>;
}
