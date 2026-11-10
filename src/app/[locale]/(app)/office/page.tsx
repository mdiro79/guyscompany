import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { CHAT_PAGE_SIZE } from '@/lib/limits';
import { OfficeView } from '@/components/office/OfficeView';
import { announcements } from '@/lib/pulse';
import { todayIso } from '@/lib/format';

export default async function OfficePage() {
  const user = await requirePageUser();
  const s = store();
  const [messages, offices, files, room, meeting, projects, posts, profiles] = await Promise.all([
    s.listMessages('team', CHAT_PAGE_SIZE), s.listOffices(), s.listFiles(), s.getRoom('conference'), s.getOpenMeeting(), s.listProjects(),
    s.listPosts(new Date(Date.now() - 30 * 86400000).toISOString(), 100), s.listProfiles(),
  ]);
  // The notice kiosk in the reception shows the team pulse: the pinned (or newest) announcement, today's standups and the latest kudos.
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.displayName ?? '';
  const news = announcements(posts)[0], kudos = posts.find((p) => p.kind === 'kudos');
  const notice = {
    news: news?.body ?? null, newsBy: name(news?.authorId ?? null), members: profiles.length,
    standups: posts.filter((p) => p.kind === 'standup' && p.day === todayIso()).length,
    kudos: kudos ? [name(kudos.authorId), name(kudos.targetId)] as [string, string] : null,
  };
  // The meeting in the conference room, who attends it and my notes from it.
  const [attendance, notes] = meeting ? await Promise.all([s.listAttendance([meeting.id]), s.listMeetingNotes(user.id)]) : [[], []];
  const mine = offices.find((o) => o.ownerId === user.id);
  const invitedSlots = [...new Set((await s.listInvites(user.id)).filter((i) => i.inviteeId === user.id && i.status === 'accepted').map((i) => i.slot))];
  const channels = [...new Set([...(mine ? [mine.slot] : []), ...invitedSlots])];
  const privateChats = Object.fromEntries(await Promise.all(channels.map(async (slot) => [slot, await s.listMessages(`office:${slot}`, CHAT_PAGE_SIZE)] as const)));
  return <OfficeView messages={messages} privateChats={privateChats} invitedSlots={invitedSlots} files={files} room={room} notice={notice}
    meeting={{ meeting, attendance, notes: notes.filter((n) => n.meetingId === meeting?.id), projects }} />;
}
