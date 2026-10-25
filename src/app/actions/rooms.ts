'use server';
import { requireUser } from '@/lib/auth';
import { store, type RoomSettings } from '@/lib/data';
import { okResult, guard } from './result';

const ROOMS = new Set(['conference']);
const clamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : undefined);

// Saves the conference room's light and glass (any member, from the wall panel). Others already see the
// change live over WebRTC; this keeps it for whoever comes in later. No page re-render is needed.
export const saveRoomAction = guard(async function saveRoomAction(id: string, patch: Partial<RoomSettings>) {
  await requireUser();
  if (!ROOMS.has(id)) return okResult();
  const clean: Partial<RoomSettings> = {};
  for (const k of ['light', 'warmth', 'frost'] as const) { const v = clamp(patch[k]); if (v !== undefined) clean[k] = v; }
  if (Object.keys(clean).length) await store().updateRoom(id, clean);
  return okResult();
});
