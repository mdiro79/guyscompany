'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store, type IdeaStatus, type IssueKind, type IssuePatch, type IssueStatus, type Profile, type Severity } from '@/lib/data';
import { IDEA_STATUSES, ISSUE_STATUSES } from '@/lib/data/types';
import { fail, okResult, guard } from './result';

// Project command center: bugs and defects, their comments, ideas and upgrades, milestones.
// Any member reports, comments, suggests and votes; the project manager (or an admin) runs the
// ideas pipeline and milestones; a bug may be deleted by its reporter, the manager or an admin.

const MAX_SCREENSHOTS = 6;
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const severityOf = (v: unknown): Severity => (v === 0 || v === 1 || v === 2 || v === 3 ? v : 1);

async function projectOf(id: string) { return (await store().listProjects()).find((p) => p.id === id) ?? null; }
const manages = (user: Profile, managerId: string | null) => user.role === 'admin' || managerId === user.id;

// Only uploaded image files (screenshots) are kept, at most six.
async function screenshots(ids: unknown) {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids.slice(0, MAX_SCREENSHOTS)) {
    if (typeof id !== 'string') continue;
    const f = await store().getFile(id);
    if (f?.mime.startsWith('image/')) out.push(id);
  }
  return out;
}

const done = () => { revalidatePath('/', 'layout'); return okResult(); };

interface IssueInput { kind: IssueKind; title: string; description: string; steps: string; severity: number; assigneeId: string | null; screenshotIds: string[] }

export const reportIssueAction = guard(async function reportIssueAction(projectId: string, input: IssueInput) {
  const user = await requireUser();
  const project = await projectOf(projectId);
  const title = text(input.title, 160);
  if (!project || !title) return fail('error');
  const assigneeId = input.assigneeId && (await store().getProfile(input.assigneeId)) ? input.assigneeId : null;
  const issue = await store().createIssue({
    projectId, kind: input.kind === 'defect' ? 'defect' : 'bug', title, description: text(input.description, 4000), steps: text(input.steps, 4000),
    severity: severityOf(input.severity), reporterId: user.id, assigneeId, screenshotIds: await screenshots(input.screenshotIds),
  });
  if (assigneeId && assigneeId !== user.id) await store().createNotification({ userId: assigneeId, kind: 'issue_assigned', payload: { name: user.displayName, title } });
  if (issue.severity === 3 && project.managerId && project.managerId !== user.id && project.managerId !== assigneeId) {
    await store().createNotification({ userId: project.managerId, kind: 'issue_critical', payload: { title } });
  }
  return done();
});

export const updateIssueAction = guard(async function updateIssueAction(id: string, patch: Partial<IssueInput & { status: IssueStatus }>) {
  const user = await requireUser();
  const issue = (await store().listIssues()).find((i) => i.id === id);
  if (!issue) return fail('error');
  const clean: IssuePatch = {};
  if (patch.title !== undefined) { const t = text(patch.title, 160); if (!t) return fail('error'); clean.title = t; }
  if (patch.description !== undefined) clean.description = text(patch.description, 4000);
  if (patch.steps !== undefined) clean.steps = text(patch.steps, 4000);
  if (patch.kind !== undefined) clean.kind = patch.kind === 'defect' ? 'defect' : 'bug';
  if (patch.severity !== undefined) clean.severity = severityOf(patch.severity);
  if (patch.screenshotIds !== undefined) clean.screenshotIds = await screenshots(patch.screenshotIds);
  if (patch.status !== undefined && ISSUE_STATUSES.includes(patch.status)) {
    clean.status = patch.status;
    const resolved = patch.status === 'fixed' || patch.status === 'closed';
    clean.resolvedAt = resolved ? (issue.resolvedAt ?? new Date().toISOString()) : null;
  }
  if (patch.assigneeId !== undefined) {
    clean.assigneeId = patch.assigneeId && (await store().getProfile(patch.assigneeId)) ? patch.assigneeId : null;
    if (clean.assigneeId && clean.assigneeId !== issue.assigneeId && clean.assigneeId !== user.id) {
      await store().createNotification({ userId: clean.assigneeId, kind: 'issue_assigned', payload: { name: user.displayName, title: clean.title ?? issue.title } });
    }
  }
  await store().updateIssue(id, clean);
  return done();
});

export const deleteIssueAction = guard(async function deleteIssueAction(id: string) {
  const user = await requireUser();
  const issue = (await store().listIssues()).find((i) => i.id === id);
  if (!issue) return fail('error');
  const project = await projectOf(issue.projectId);
  if (issue.reporterId !== user.id && !manages(user, project?.managerId ?? null)) return fail('forbidden');
  await store().deleteIssue(id);
  return done();
});

export const commentIssueAction = guard(async function commentIssueAction(issueId: string, body: string) {
  const user = await requireUser();
  const t = text(body, 2000);
  if (!t || !(await store().listIssues()).some((i) => i.id === issueId)) return fail('error');
  await store().createIssueComment({ issueId, authorId: user.id, body: t });
  return done();
});

export const createIdeaAction = guard(async function createIdeaAction(projectId: string, input: { kind: string; title: string; description: string }) {
  const user = await requireUser();
  const title = text(input.title, 160);
  if (!title || !(await projectOf(projectId))) return fail('error');
  await store().createIdea({ projectId, kind: input.kind === 'upgrade' ? 'upgrade' : 'idea', title, description: text(input.description, 2000), authorId: user.id });
  return done();
});

export const voteIdeaAction = guard(async function voteIdeaAction(ideaId: string) {
  const user = await requireUser();
  await store().toggleIdeaVote(ideaId, user.id);
  return done();
});

export const setIdeaStatusAction = guard(async function setIdeaStatusAction(ideaId: string, status: IdeaStatus) {
  const user = await requireUser();
  const idea = (await store().listIdeas()).find((i) => i.id === ideaId);
  if (!idea || !IDEA_STATUSES.includes(status)) return fail('error');
  if (!manages(user, (await projectOf(idea.projectId))?.managerId ?? null)) return fail('forbidden');
  await store().updateIdea(ideaId, { status });
  return done();
});

// Puts the idea on the project's board (Idea column) and marks it planned.
export const ideaToTaskAction = guard(async function ideaToTaskAction(ideaId: string) {
  const user = await requireUser();
  const idea = (await store().listIdeas()).find((i) => i.id === ideaId);
  if (!idea || idea.taskId) return fail('error');
  if (!manages(user, (await projectOf(idea.projectId))?.managerId ?? null)) return fail('forbidden');
  const task = await store().createTask({ title: idea.title, description: idea.description, projectId: idea.projectId, column: 'idea', tags: [idea.kind === 'upgrade' ? 'Upgrade' : 'Idea'], createdBy: user.id });
  await store().updateIdea(ideaId, { taskId: task.id, status: 'planned' });
  return done();
});

export const deleteIdeaAction = guard(async function deleteIdeaAction(ideaId: string) {
  const user = await requireUser();
  const idea = (await store().listIdeas()).find((i) => i.id === ideaId);
  if (!idea) return fail('error');
  if (idea.authorId !== user.id && !manages(user, (await projectOf(idea.projectId))?.managerId ?? null)) return fail('forbidden');
  await store().deleteIdea(ideaId);
  return done();
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createMilestoneAction = guard(async function createMilestoneAction(projectId: string, title: string, dueDate: string | null) {
  const user = await requireUser();
  const project = await projectOf(projectId);
  const t = text(title, 120);
  if (!project || !t) return fail('error');
  if (!manages(user, project.managerId)) return fail('forbidden');
  await store().createMilestone({ projectId, title: t, dueDate: dueDate && DATE.test(dueDate) ? dueDate : null });
  return done();
});

export const toggleMilestoneAction = guard(async function toggleMilestoneAction(id: string, isDone: boolean) {
  const user = await requireUser();
  const m = (await store().listMilestones()).find((x) => x.id === id);
  if (!m) return fail('error');
  if (!manages(user, (await projectOf(m.projectId))?.managerId ?? null)) return fail('forbidden');
  await store().updateMilestone(id, { done: isDone });
  return done();
});

export const deleteMilestoneAction = guard(async function deleteMilestoneAction(id: string) {
  const user = await requireUser();
  const m = (await store().listMilestones()).find((x) => x.id === id);
  if (!m) return fail('error');
  if (!manages(user, (await projectOf(m.projectId))?.managerId ?? null)) return fail('forbidden');
  await store().deleteMilestone(id);
  return done();
});
