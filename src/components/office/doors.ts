'use client';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { doors, doorLeaf, type DoorDef, type Segment } from './layout';

// Shared open/closed state of the hinged doors (E toggles them). Changes travel over the WebRTC
// events channel with a server-corrected timestamp; the newest command wins, late joiners catch up
// from a periodic snapshot. Nothing is stored in the database.

export const DOORS: DoorDef[] = doors();
const state = new Map<string, { open: boolean; t: number }>(DOORS.map((d) => [d.id, { open: d.defaultOpen, t: 0 }]));
// Current (animated) leaf angle per door, read by the collision code every frame.
export const doorAngles = new Map<string, number>(DOORS.map((d) => [d.id, d.defaultOpen ? d.open : d.closed]));
const listeners = new Set<() => void>();
let mesh: Mesh | null = null;

export const isDoorOpen = (id: string) => state.get(id)?.open ?? false;
export const subscribeDoors = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function apply(id: string, open: boolean, t: number) {
  const cur = state.get(id);
  if (!cur || t <= cur.t) return false;
  state.set(id, { open, t });
  listeners.forEach((l) => l());
  return true;
}

export function setDoor(id: string, open: boolean) {
  const t = syncedNow();
  if (apply(id, open, t)) mesh?.sendEvent({ type: 'door', id, open, t });
}

export const toggleDoor = (id: string) => setDoor(id, !isDoorOpen(id));

// Collision segments for the leaves at their current angle (a closed leaf seals the gap).
export const doorLeaves = (): Segment[] => DOORS.map((d) => doorLeaf(d, doorAngles.get(d.id) ?? d.closed));

export function connectDoors(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => {
    if (msg.type === 'door' && typeof msg.id === 'string' && typeof msg.open === 'boolean' && typeof msg.t === 'number') apply(msg.id, msg.open, msg.t);
    if (msg.type === 'doors' && Array.isArray(msg.list)) {
      for (const d of msg.list as { id: unknown; open: unknown; t: unknown }[]) {
        if (typeof d.id === 'string' && typeof d.open === 'boolean' && typeof d.t === 'number') apply(d.id, d.open, d.t);
      }
    }
  });
  const snapshot = () => {
    const list = [...state.entries()].filter(([, v]) => v.t > 0).map(([id, v]) => ({ id, ...v }));
    if (list.length) m.sendEvent({ type: 'doors', list });
  };
  const offPeers = m.onPeers(() => setTimeout(snapshot, 1500));
  const timer = setInterval(snapshot, 8000);
  return () => { off(); offPeers(); clearInterval(timer); mesh = null; };
}
