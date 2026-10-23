import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { summarizePoll, isPollClosed, redactVotes } from '@/lib/polls';
import { todayIso } from '@/lib/format';
import { Hero } from '@/components/Hero';
import { TaskViews } from '@/components/tasks/TaskViews';
import { TeamVote } from '@/components/widgets/TeamVote';
import { TodaysFocus } from '@/components/widgets/TodaysFocus';
import { OfficeMapWidget } from '@/components/widgets/OfficeMapWidget';

export default async function HomePage() {
  const user = (await currentUser())!;
  const s = store();
  const [tasks, projects, polls, votes, focus] = await Promise.all([s.listTasks(), s.listProjects(), s.listPolls(), s.listVotes(), s.listFocus(user.id, todayIso())]);
  const poll = polls.find((p) => !isPollClosed(p)) ?? polls[0] ?? null;
  return (
    <div className="space-y-4">
      <Hero />
      <TaskViews tasks={tasks} projects={projects} compact />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TeamVote poll={poll} summary={poll ? summarizePoll(poll, redactVotes(polls, votes, user.id), user.id) : null} />
        <TodaysFocus items={focus} />
        <OfficeMapWidget />
      </div>
    </div>
  );
}
