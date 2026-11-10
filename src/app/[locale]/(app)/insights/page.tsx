import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { InsightsView } from '@/components/pages/InsightsView';

// Team insights: numbers worked out from what is already in the app (no table of its own).
export default async function InsightsPage() {
  await requirePageUser();
  const s = store();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [tasks, projects, issues, milestones, meetings, posts] = await Promise.all([s.listTasks(), s.listProjects(), s.listIssues(), s.listMilestones(), s.listMeetings(200), s.listPosts(since, 300)]);
  const attendance = await s.listAttendance(meetings.map((m) => m.id));
  return <InsightsView tasks={tasks} projects={projects} issues={issues} milestones={milestones} meetings={meetings} attendance={attendance} posts={posts} today={todayIso()} />;
}
