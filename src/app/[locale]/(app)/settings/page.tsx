import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { SettingsView } from '@/components/pages/SettingsView';

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [swaps, invites, notes, shared] = await Promise.all([
    store().listSwapRequests(user.id), store().listInvites(user.id), store().listMeetingNotes(user.id), store().listSharedNotes({}),
  ]);
  const noteStats = { notes: notes.length, meetings: new Set(notes.map((n) => n.meetingId)).size, shared: shared.filter((n) => n.authorId === user.id).length };
  return <SettingsView swaps={swaps} invites={invites} noteStats={noteStats} />;
}
