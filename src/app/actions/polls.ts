'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { isPollClosed, isValidScore } from '@/lib/polls';
import { fail, okResult, guard, type ActionResult } from './result';

export const voteAction = guard(async function voteAction(pollId: string, score: number) {
  const user = await requireUser();
  if (!isValidScore(score)) return fail('error');
  const poll = (await store().listPolls()).find((p) => p.id === pollId);
  if (!poll || isPollClosed(poll)) return fail('closed');
  await store().upsertVote({ pollId, userId: user.id, score });
  revalidatePath('/', 'layout');
  return okResult();
});

export const createPollAction = guard(async function createPollAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const question = String(form.get('question') ?? '').trim().slice(0, 300);
  const hours = Math.min(24 * 30, Math.max(1, Number(form.get('hours') ?? 24)));
  const taskId = String(form.get('taskId') ?? '') || null;
  if (!question) return fail('error');
  await store().createPoll({ question, taskId, createdBy: user.id, closesAt: new Date(Date.now() + hours * 3600000).toISOString() });
  for (const p of await store().listProfiles()) {
    if (p.id !== user.id) await store().createNotification({ userId: p.id, kind: 'poll_created', payload: { title: question } });
  }
  revalidatePath('/', 'layout');
  return okResult('saved');
});

async function canManage(userId: string, role: string, pollTaskId: string | null, createdBy: string | null) {
  if (role === 'admin' || createdBy === userId) return true;
  if (!pollTaskId) return false;
  const task = (await store().listTasks()).find((t) => t.id === pollTaskId);
  const project = task?.projectId ? (await store().listProjects()).find((p) => p.id === task.projectId) : null;
  return project?.managerId === userId;
}

export const closePollAction = guard(async function closePollAction(pollId: string) {
  const user = await requireUser();
  const poll = (await store().listPolls()).find((p) => p.id === pollId);
  if (!poll || !(await canManage(user.id, user.role, poll.taskId, poll.createdBy))) return fail('forbidden');
  await store().updatePoll(pollId, { closed: true });
  revalidatePath('/', 'layout');
  return okResult();
});

// Tie-break decision by the project manager (or admin).
export const decidePollAction = guard(async function decidePollAction(pollId: string, decision: string) {
  const user = await requireUser();
  const poll = (await store().listPolls()).find((p) => p.id === pollId);
  if (!poll || !(await canManage(user.id, user.role, poll.taskId, null))) return fail('forbidden');
  await store().updatePoll(pollId, { decision: decision.trim().slice(0, 500) || null });
  revalidatePath('/', 'layout');
  return okResult();
});
