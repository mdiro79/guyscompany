'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import type { Pose } from './Player';
import { officeUi } from './store';
import { EMOTE_MS, isEmoteId, type EmoteId } from './emotes';

export interface RemoteAvatar { userId: string; pose: Pose; receivedAt: number; emote: { id: EmoteId; until: number } | null }

// Position/orientation travel over WebRTC data channels only (never the database).
// Each user's character follows the newest command across their devices ("last command wins").
export function useOfficeNet(mesh: Mesh | null, userId: string) {
  const remotes = useRef(new Map<string, RemoteAvatar>());
  const external = useRef<Pose | null>(null);

  useEffect(() => {
    if (!mesh) return;
    const offState = mesh.onState((from, msg) => {
      if (msg.k !== 'pose') return;
      const pose = msg as unknown as Pose;
      if (from.userId === userId) {
        if (from.tabId !== mesh.self.tabId && (!external.current || pose.t > external.current.t)) external.current = pose;
        return;
      }
      const cur = remotes.current.get(from.userId);
      if (cur && cur.pose.t > pose.t && performance.now() - cur.receivedAt < 3000) return;
      remotes.current.set(from.userId, { userId: from.userId, pose, receivedAt: performance.now(), emote: cur?.emote ?? null });
    });
    const offEvent = mesh.onEvent((from, msg) => {
      if (msg.type !== 'emote' || !isEmoteId(msg.id)) return;
      const until = Date.now() + EMOTE_MS;
      if (from.userId === userId) { officeUi.set({ myEmote: { id: msg.id, until } }); return; }
      const cur = remotes.current.get(from.userId);
      if (cur) cur.emote = { id: msg.id, until };
    });
    return () => { offState(); offEvent(); };
  }, [mesh, userId]);

  const sendPose = useCallback((pose: Pose) => mesh?.sendState({ k: 'pose', ...pose }), [mesh]);
  const sendEmote = useCallback((id: EmoteId) => {
    officeUi.set({ myEmote: { id, until: Date.now() + EMOTE_MS } });
    mesh?.sendEvent({ type: 'emote', id, t: syncedNow() });
  }, [mesh]);

  return { remotes, external, sendPose, sendEmote };
}
