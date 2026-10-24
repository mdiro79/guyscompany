import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { summarizePoll, isPollClosed, redactVotes } from '@/lib/polls';
import { todayIso } from '@/lib/format';
import { Hero } from '@/components/Hero';
import { TaskViews } from '@/components/tasks/TaskViews';
import { TeamVote } from '@/components/widgets/TeamVote';
import { TodaysFocus } from '@/components/widgets/TodaysFocus';
import { PersonalTodos } from '@/components/widgets/PersonalTodos';
import { CLEARED_TODO_RETENTION_DAYS } from '@/lib/limits';
import { OfficeMapWidget } from '@/components/widgets/OfficeMapWidget';

export default async function HomePage() {
  const user = await requirePageUser();
  const s = store();
  const streakSince = new Date(Date.now() - CLEARED_TODO_RETENTION_DAYS * 86400000).toISOString();
  const [tasks, projects, polls, votes, focus, todos, todoStats] = await Promise.all([
    s.listTasks(), s.listProjects(), s.listPolls(), s.listVotes(), s.listFocus(user.id, todayIso()), s.listTodos(user.id, streakSince), s.getTodoStats(user.id),
  ]);
  const poll = polls.find((p) => !isPollClosed(p)) ?? polls[0] ?? null;
  return (
    <div className="space-y-4">
      <Hero />
      <TaskViews tasks={tasks} projects={projects} compact />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-flow-row-dense xl:grid-cols-3">
        <TeamVote poll={poll} summary={poll ? summarizePoll(poll, redactVotes(polls, votes, user.id), user.id) : null} />
        <TodaysFocus items={focus} />
        <PersonalTodos todos={todos} today={todayIso()} stats={todoStats} />
        <OfficeMapWidget />
      </div>
    </div>
  );
}
