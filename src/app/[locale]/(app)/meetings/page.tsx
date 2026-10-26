import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { MeetingsView } from '@/components/meetings/MeetingsView';

// Meetings and the member's own notes from them (their "profile" of meeting notes).
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const s = store();
  const [{ tab }, meetings, notes, projects] = await Promise.all([searchParams, s.listMeetings(200), s.listMeetingNotes(user.id), s.listProjects()]);
  const ids = meetings.map((m) => m.id);
  const [attendance, shared] = await Promise.all([s.listAttendance(ids), s.listSharedNotes({ meetingIds: ids })]);
  return <MeetingsView meetings={meetings} attendance={attendance} notes={notes} shared={shared} projects={projects} tab={tab} />;
}
