import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { CHAT_PAGE_SIZE } from '@/lib/limits';
import { OfficeView } from '@/components/office/OfficeView';

export default async function OfficePage() {
  const user = await requirePageUser();
  const s = store();
  const [messages, offices, files, room] = await Promise.all([s.listMessages('team', CHAT_PAGE_SIZE), s.listOffices(), s.listFiles(), s.getRoom('conference')]);
  const mine = offices.find((o) => o.ownerId === user.id);
  const invitedSlots = [...new Set((await s.listInvites(user.id)).filter((i) => i.inviteeId === user.id && i.status === 'accepted').map((i) => i.slot))];
  const channels = [...new Set([...(mine ? [mine.slot] : []), ...invitedSlots])];
  const privateChats = Object.fromEntries(await Promise.all(channels.map(async (slot) => [slot, await s.listMessages(`office:${slot}`, CHAT_PAGE_SIZE)] as const)));
  return <OfficeView messages={messages} privateChats={privateChats} invitedSlots={invitedSlots} files={files} room={room} />;
}
