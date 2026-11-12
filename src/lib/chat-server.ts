import 'server-only';
import { store } from '@/lib/data';
import { projectChannel } from '@/lib/chat';

// Lines the app writes into a project's topic when its work moves (shown centred, like Telegram's
// service messages). The body holds the event as JSON so it reads in either language.
export type SystemEvent =
  | { e: 'task_done'; title: string; taskId: string }
  | { e: 'milestone_done'; title: string }
  | { e: 'issue_fixed'; title: string };

export async function postSystem(projectId: string | null, actorId: string, event: SystemEvent) {
  if (!projectId) return;
  await store().createMessage({ channel: projectChannel(projectId), authorId: actorId, body: JSON.stringify(event), fileId: null, kind: 'system' });
}
