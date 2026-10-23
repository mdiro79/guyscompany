import 'server-only';
import { store } from '@/lib/data';

// 'team' is open to everyone; 'office:<slot>' only to the office owner and accepted invitees.
export async function canUseChannel(userId: string, channel: string) {
  if (channel === 'team') return true;
  const m = /^office:([1-4])$/.exec(channel);
  if (!m) return false;
  const slot = Number(m[1]);
  const office = (await store().listOffices()).find((o) => o.slot === slot);
  if (!office) return false;
  if (office.ownerId === userId) return true;
  const invites = await store().listInvites(userId);
  return invites.some((i) => i.slot === slot && i.inviteeId === userId && i.status === 'accepted');
}
