'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { store, type Message, type Profile } from '@/lib/data';
import { canUseChannel } from '@/lib/channels';
import { projectIdOf } from '@/lib/chat';
import { fail, okResult, guard, type ActionResult } from './result';

// Chat actions answer with the saved data and do not re-render the page: rebuilding the layout held the
// reply for seconds. The sender's chat shows the change at once; other members get it from Realtime (or
// polling in demo mode). Only actions that create tasks or bugs refresh the page, so their cards appear.

const BODY_MAX = 4000;
const OLDER_PAGE = 60;

async function notifyMentions(text: string, user: Profile, skip: Set<string>) {
  // @username mentions notify the mentioned member (usernames may contain '.', so match literally).
  const mentioned = new Set(Array.from(text.toLowerCase().matchAll(/@([a-z0-9_.-]{3,24})/g), (m) => m[1].replace(/\.+$/, '')));
  if (!mentioned.size) return;
  const targets = (await store().listProfiles()).filter((p) => p.id !== user.id && !skip.has(p.id) && mentioned.has(p.username));
  await Promise.all(targets.map((p) => store().createNotification({ userId: p.id, kind: 'mention', payload: { name: user.displayName } })));
}

// A message the member may act on: it exists and they can use its chat.
async function reachable(userId: string, id: string) {
  const m = await store().getMessage(id);
  return m && (await canUseChannel(userId, m.channel)) ? m : null;
}

// Deciding is for the author of the message, the project's manager, or an admin.
async function mayDecide(user: Profile, m: Message) {
  if (user.role === 'admin' || m.authorId === user.id) return true;
  const projectId = projectIdOf(m.channel);
  if (!projectId) return false;
  return (await store().listProjects()).some((p) => p.id === projectId && p.managerId === user.id);
}

export const sendMessageAction = guard(async function sendMessageAction(channel: string, body: string, fileId: string | null = null,
  opts: { replyToId?: string | null; decision?: boolean } = {}): Promise<ActionResult & { sent?: Message }> {
  const user = await requireUser();
  const text = body.trim().slice(0, BODY_MAX);
  if (!text && !fileId) return fail('error');
  if (!(await canUseChannel(user.id, channel))) return fail('forbidden');
  // A reply only points at a message of the same chat.
  const replyTo = opts.replyToId ? await store().getMessage(opts.replyToId) : null;
  const replyToId = replyTo && replyTo.channel === channel ? replyTo.id : null;
  const sent = await store().createMessage({ channel, authorId: user.id, body: text, fileId, replyToId, kind: opts.decision && text ? 'decision' : 'text' });
  // Notifications go out after the response, so the message itself is not held up.
  after(async () => {
    const skip = new Set<string>();
    if (replyTo && replyToId && replyTo.authorId && replyTo.authorId !== user.id) {
      skip.add(replyTo.authorId);
      await store().createNotification({ userId: replyTo.authorId, kind: 'reply', payload: { name: user.displayName } });
    }
    await notifyMentions(text, user, skip);
  });
  return { ...okResult(), sent };
});

export const editMessageAction = guard(async function editMessageAction(id: string, body: string): Promise<ActionResult & { editedAt?: string }> {
  const user = await requireUser();
  const m = await reachable(user.id, id);
  const text = body.trim().slice(0, BODY_MAX);
  if (!m || m.authorId !== user.id || (m.kind !== 'text' && m.kind !== 'decision')) return fail('forbidden');
  if (!text && !m.fileId) return fail('error');
  const editedAt = new Date().toISOString();
  await store().updateMessage(id, { body: text, editedAt });
  return { ...okResult(), editedAt };
});

export const deleteMessageAction = guard(async function deleteMessageAction(id: string) {
  const user = await requireUser();
  const m = await reachable(user.id, id);
  if (!m) return fail('error');
  if (m.authorId !== user.id && user.role !== 'admin') return fail('forbidden');
  await store().deleteMessage(id);
  return okResult();
});

// Any member of the chat pins or unpins (a team of four, like a small Telegram group).
export const pinMessageAction = guard(async function pinMessageAction(id: string, pin: boolean): Promise<ActionResult & { pinnedAt?: string | null }> {
  const user = await requireUser();
  const m = await reachable(user.id, id);
  if (!m || m.kind === 'system') return fail('error');
  const pinnedAt = pin ? new Date().toISOString() : null;
  await store().updateMessage(id, { pinnedAt });
  return { ...okResult(), pinnedAt };
});

// Marks a plain message as a team decision (or back). Decisions are listed in the project's Decisions tab.
export const markDecisionAction = guard(async function markDecisionAction(id: string, on: boolean) {
  const user = await requireUser();
  const m = await reachable(user.id, id);
  if (!m || (m.kind !== 'text' && m.kind !== 'decision') || !m.body) return fail('error');
  if (!(await mayDecide(user, m))) return fail('forbidden');
  await store().updateMessage(id, { kind: on ? 'decision' : 'text' });
  const projectId = projectIdOf(m.channel);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return okResult();
});

export const forwardMessageAction = guard(async function forwardMessageAction(id: string, to: string): Promise<ActionResult & { sent?: Message }> {
  const user = await requireUser();
  const m = await reachable(user.id, id);
  if (!m || m.kind === 'system' || !(await canUseChannel(user.id, to))) return fail('error');
  const sent = await store().createMessage({ channel: to, authorId: user.id, body: m.body, fileId: m.fileId, forwardedFrom: m.forwardedFrom ?? m.authorId });
  return { ...okResult(), sent };
});

export const toggleReactionAction = guard(async function toggleReactionAction(messageId: string, emoji: string) {
  const user = await requireUser();
  if (![...emoji].length || [...emoji].length > 4) return fail('error');
  if (!(await reachable(user.id, messageId))) return fail('forbidden');
  await store().toggleReaction(messageId, user.id, emoji);
  return okResult();
});

// The member has seen a chat up to `atIso` (the newest message they saw).
export const markChatReadAction = guard(async function markChatReadAction(channel: string, atIso: string) {
  const user = await requireUser();
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime()) || !(await canUseChannel(user.id, channel))) return fail('error');
  // Never later than now (a device with a fast clock cannot mark future messages read).
  await store().markChatRead(user.id, channel, new Date(Math.min(at.getTime(), Date.now())).toISOString());
  return okResult();
});

export const loadOlderAction = guard(async function loadOlderAction(channel: string, beforeIso: string): Promise<ActionResult & { messages?: Message[] }> {
  const user = await requireUser();
  if (!(await canUseChannel(user.id, channel))) return fail('forbidden');
  return { ...okResult(), messages: await store().listMessages(channel, OLDER_PAGE, beforeIso) };
});

export const searchChatAction = guard(async function searchChatAction(channels: string[], query: string): Promise<ActionResult & { messages?: Message[] }> {
  const user = await requireUser();
  const allowed: string[] = [];
  for (const c of channels.slice(0, 50)) if (await canUseChannel(user.id, c)) allowed.push(c);
  return { ...okResult(), messages: await store().searchMessages(allowed, query.slice(0, 100), 40) };
});

// Turns chat into project work: a task or a bug made from a message (or a /task, /bug command), posted
// back into the chat as a live card that answers the message it came from.
export const chatTaskAction = guard(async function chatTaskAction(input: {
  channel: string; title: string; description?: string; assigneeId: string | null; priority: number; dueDate: string | null; projectId: string | null; replyToId?: string | null;
}): Promise<ActionResult & { sent?: Message }> {
  const user = await requireUser();
  if (!(await canUseChannel(user.id, input.channel))) return fail('forbidden');
  const title = input.title.trim().slice(0, 200);
  if (!title) return fail('error');
  const projects = await store().listProjects();
  const projectId = input.projectId && projects.some((p) => p.id === input.projectId) ? input.projectId : null;
  const assigneeId = input.assigneeId && (await store().getProfile(input.assigneeId)) ? input.assigneeId : null;
  const dueDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;
  const task = await store().createTask({
    title, description: (input.description ?? '').trim().slice(0, 4000), projectId, assigneeId, dueDate,
    priority: Math.max(0, Math.min(2, Math.round(input.priority) || 0)), column: assigneeId ? 'in_progress' : 'idea', createdBy: user.id,
  });
  if (assigneeId && assigneeId !== user.id) await store().createNotification({ userId: assigneeId, kind: 'task_assigned', payload: { title } });
  const replyTo = input.replyToId ? await store().getMessage(input.replyToId) : null;
  const sent = await store().createMessage({ channel: input.channel, authorId: user.id, body: title, fileId: null, kind: 'task', refId: task.id, replyToId: replyTo?.channel === input.channel ? replyTo.id : null });
  revalidatePath('/', 'layout');
  return { ...okResult(), sent };
});

export const chatIssueAction = guard(async function chatIssueAction(input: {
  channel: string; projectId: string; title: string; description?: string; severity: number; assigneeId: string | null; replyToId?: string | null;
}): Promise<ActionResult & { sent?: Message }> {
  const user = await requireUser();
  if (!(await canUseChannel(user.id, input.channel))) return fail('forbidden');
  const project = (await store().listProjects()).find((p) => p.id === input.projectId);
  const title = input.title.trim().slice(0, 160);
  if (!project || !title) return fail('error');
  const assigneeId = input.assigneeId && (await store().getProfile(input.assigneeId)) ? input.assigneeId : null;
  const severity = ([0, 1, 2, 3] as const).find((x) => x === input.severity) ?? 1;
  const issue = await store().createIssue({
    projectId: project.id, kind: 'bug', title, description: (input.description ?? '').trim().slice(0, 4000), steps: '', severity, reporterId: user.id, assigneeId, screenshotIds: [],
  });
  if (assigneeId && assigneeId !== user.id) await store().createNotification({ userId: assigneeId, kind: 'issue_assigned', payload: { name: user.displayName, title } });
  if (severity === 3 && project.managerId && project.managerId !== user.id && project.managerId !== assigneeId) {
    await store().createNotification({ userId: project.managerId, kind: 'issue_critical', payload: { title } });
  }
  const replyTo = input.replyToId ? await store().getMessage(input.replyToId) : null;
  const sent = await store().createMessage({ channel: input.channel, authorId: user.id, body: title, fileId: null, kind: 'issue', refId: issue.id, replyToId: replyTo?.channel === input.channel ? replyTo.id : null });
  revalidatePath('/', 'layout');
  return { ...okResult(), sent };
});
