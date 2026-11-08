'use client';
import { useCallback, useEffect, useRef } from 'react';
import { ROOM_STATE_IDLE_MS, type Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import type { Pose } from './Player';
import { officeUi } from './store';
import { EMOTE_MS, isEmoteId, type EmoteId } from './emotes';
import { labelsChanged } from './labels';

// typing: until when (Date.now()) the person counts as typing in the office chat.
export interface RemoteAvatar { userId: string; pose: Pose; receivedAt: number; emote: { id: EmoteId; until: number } | null; typing: number }

export const TYPING_MS = 4000; // a "typing" signal lasts this long unless renewed
const TYPING_RENEW_MS = 2500;
// A position through the room fallback counts as received this much later, so a character standing
// still (resent every ROOM_STATE_IDLE_MS) stays shown like one on a direct link (5 s).
const ROOM_POSE_GRACE_MS = ROOM_STATE_IDLE_MS;

// Position/orientation travel over WebRTC data channels only (never the database).
// Each user's character follows the newest command across their devices ("last command wins").
// Emotes and "typing…" are short-lived events on the same links.
export function useOfficeNet(mesh: Mesh | null, userId: string) {
  const remotes = useRef(new Map<string, RemoteAvatar>());
  const external = useRef<Pose | null>(null);
  const typingSent = useRef(0);

  useEffect(() => {
    if (!mesh) return;
    mesh.setInOffice(true);
    const offState = mesh.onState((from, msg, viaRoom) => {
      if (msg.k !== 'pose') return;
      const pose = msg as unknown as Pose;
      if (from.userId === userId) {
        if (from.tabId !== mesh.self.tabId && (!external.current || pose.t > external.current.t)) external.current = pose;
        return;
      }
      const cur = remotes.current.get(from.userId);
      if (cur && cur.pose.t > pose.t && performance.now() - cur.receivedAt < 3000) return;
      const receivedAt = performance.now() + (viaRoom ? ROOM_POSE_GRACE_MS : 0);
      remotes.current.set(from.userId, { userId: from.userId, pose, receivedAt, emote: cur?.emote ?? null, typing: cur?.typing ?? 0 });
    });
    const offEvent = mesh.onEvent((from, msg) => {
      if (msg.type === 'typing' && from.userId !== userId) {
        const cur = remotes.current.get(from.userId);
        if (cur) { cur.typing = msg.on ? Date.now() + TYPING_MS : 0; labelsChanged(); }
        return;
      }
      if (msg.type !== 'emote' || !isEmoteId(msg.id)) return;
      const until = Date.now() + EMOTE_MS;
      if (from.userId === userId) { officeUi.set({ myEmote: { id: msg.id, until } }); return; }
      const cur = remotes.current.get(from.userId);
      if (cur) { cur.emote = { id: msg.id, until }; labelsChanged(); }
    });
    return () => { offState(); offEvent(); mesh.setInOffice(false); };
  }, [mesh, userId]);

  const sendPose = useCallback((pose: Pose) => mesh?.sendState({ k: 'pose', ...pose }), [mesh]);
  const sendEmote = useCallback((id: EmoteId) => {
    officeUi.set({ myEmote: { id, until: Date.now() + EMOTE_MS } });
    mesh?.sendEvent({ type: 'emote', id, t: syncedNow() });
  }, [mesh]);
  // While typing the signal is renewed every few seconds; it is cleared on send or when the field empties.
  const sendTyping = useCallback((on: boolean) => {
    const now = Date.now();
    if (on && now - typingSent.current < TYPING_RENEW_MS) return;
    if (!on && !typingSent.current) return;
    typingSent.current = on ? now : 0;
    mesh?.sendEvent({ type: 'typing', on });
  }, [mesh]);

  return { remotes, external, sendPose, sendEmote, sendTyping };
}
