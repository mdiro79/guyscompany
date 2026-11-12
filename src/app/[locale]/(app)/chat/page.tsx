import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { CHAT_PAGE_SIZE } from '@/lib/limits';
import { todayIso } from '@/lib/format';
import { TEAM, isChatChannel, projectChannel, projectIdOf } from '@/lib/chat';
import { ChatApp } from '@/components/chat/ChatApp';

export const dynamic = 'force-dynamic';

// The chat page: the team chat and one topic per project, Telegram style. `?c=` is the open chat
// (none on phones shows the list; computers open the team chat).
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string; m?: string }> }) {
  const user = await requirePageUser();
  const { c, m } = await searchParams;
  const s = store();
  const projects = await s.listProjects();
  const asked = c && isChatChannel(c) && (!projectIdOf(c) || projects.some((p) => p.id === projectIdOf(c))) ? c : null;
  const channel = asked ?? TEAM;
  const channels = [TEAM, ...projects.map((p) => projectChannel(p.id))];
  const [summaries, messages, pinned, decisions, reads, tasks, issues, milestones, files] = await Promise.all([
    s.chatSummaries(user.id, channels), s.listMessages(channel, CHAT_PAGE_SIZE), s.listPinnedMessages(channel),
    projectIdOf(channel) ? s.listMessagesOfKind(channel, 'decision', 30) : Promise.resolve([]), s.listChatReads(channel),
    s.listTasks(), s.listIssues(), s.listMilestones(), s.listFiles(),
  ]);
  return (
    <ChatApp channel={channel} opened={!!asked} focusId={m ?? null} projects={projects} summaries={summaries} messages={messages} pinned={pinned} decisions={decisions}
      reads={reads} tasks={tasks} issues={issues} milestones={milestones} files={files} today={todayIso()} />
  );
}
