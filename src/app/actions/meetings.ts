'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store, type NoteKind } from '@/lib/data';
import {
  join, leave, meetingEnd, MEETING_PURPOSE_MAX, MEETING_TITLE_MAX, NOTE_MAX, SHARED_BODY_MAX, SHARED_TITLE_MAX,
} from '@/lib/meetings';
import { finishMeeting as finish, runningMeeting as running } from '@/lib/meetings-server';
import { fail, okResult, guard } from './result';

// Meetings in the conference room. Any member starts one (name, what it is for, optionally a project),
// renames it or ends it; the office records who is in the room. Notes are private to their author, who
// may share a rewritten version with a project for the whole team.

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const kindOf = (v: unknown): NoteKind => (v === 'idea' ? 'idea' : 'note');
const done = (data?: Record<string, string>) => { revalidatePath('/', 'layout'); return okResult(undefined, data); };
const projectExists = async (id: unknown) => typeof id === 'string' && (await store().listProjects()).some((p) => p.id === id);

interface MeetingInput { title: string; purpose: string; projectId: string | null }

export const startMeetingAction = guard(async function startMeetingAction(input: MeetingInput) {
  const user = await requireUser();
  const title = text(input.title, MEETING_TITLE_MAX);
  if (!title) return fail('title');
  const current = await running();
  // Someone else started one a moment ago: join theirs instead of starting a second.
  if (current) return fail('running', { id: current.id });
  const m = await store().createMeeting({ title, purpose: text(input.purpose, MEETING_PURPOSE_MAX), projectId: (await projectExists(input.projectId)) ? input.projectId : null, startedBy: user.id });
  await store().setAttendance(join(null, m.id, user.id, Date.now()));
  return done({ id: m.id });
});

export const updateMeetingAction = guard(async function updateMeetingAction(id: string, input: Partial<MeetingInput>) {
  await requireUser();
  const patch: Partial<MeetingInput> = {};
  if (typeof input.title === 'string') { patch.title = text(input.title, MEETING_TITLE_MAX); if (!patch.title) return fail('title'); }
  if (typeof input.purpose === 'string') patch.purpose = text(input.purpose, MEETING_PURPOSE_MAX);
  if ('projectId' in input) patch.projectId = (await projectExists(input.projectId)) ? input.projectId! : null;
  if (!(await store().getMeeting(id))) return fail('error');
  await store().updateMeeting(id, patch);
  return done();
});

export const endMeetingAction = guard(async function endMeetingAction(id: string) {
  await requireUser();
  const m = await store().getMeeting(id);
  if (!m) return fail('error');
  if (!m.endedAt) await finish(m, Date.now());
  return done();
});

/**
 * The office reports that this member is in the conference room (`here`: on entering, then every couple
 * of minutes) or left it. Only entering and leaving refresh pages; the regular "still here" does not.
 */
export const meetingPresenceAction = guard(async function meetingPresenceAction(id: string, here: boolean) {
  const user = await requireUser();
  const m = await store().getMeeting(id);
  if (!m || m.endedAt) return fail('ended');
  const now = Date.now();
  const attendance = await store().listAttendance([id]);
  const before = attendance.find((a) => a.userId === user.id);
  if (here) {
    const end = meetingEnd(m, attendance, now);
    if (end !== null) { await finish(m, end); return fail('ended'); }
    const next = join(before ?? null, id, user.id, now);
    await store().setAttendance(next);
    return before?.joinedAt === next.joinedAt ? okResult() : done();
  }
  if (before?.joinedAt) { await store().setAttendance(leave(before, now)); return done(); }
  return okResult();
});

export const addNoteAction = guard(async function addNoteAction(meetingId: string, input: { kind: NoteKind; body: string }) {
  const user = await requireUser();
  const body = text(input.body, NOTE_MAX);
  if (!body || !(await store().getMeeting(meetingId))) return fail('error');
  const note = await store().createMeetingNote({ meetingId, userId: user.id, kind: kindOf(input.kind), body });
  return done({ id: note.id });
});

export const updateNoteAction = guard(async function updateNoteAction(id: string, input: { kind?: NoteKind; body?: string }) {
  const user = await requireUser();
  const patch: { kind?: NoteKind; body?: string } = {};
  if (input.kind) patch.kind = kindOf(input.kind);
  if (typeof input.body === 'string') { patch.body = text(input.body, NOTE_MAX); if (!patch.body) return fail('error'); }
  await store().updateMeetingNote(id, user.id, patch);
  return done();
});

export const deleteNoteAction = guard(async function deleteNoteAction(id: string) {
  const user = await requireUser();
  await store().deleteMeetingNote(id, user.id);
  return done();
});

/** Shares the author's rewritten version of their note with a project (replaces an earlier version). */
export const shareNoteAction = guard(async function shareNoteAction(noteId: string, input: { projectId: string; kind: NoteKind; title: string; body: string }) {
  const user = await requireUser();
  const note = (await store().listMeetingNotes(user.id)).find((n) => n.id === noteId);
  const title = text(input.title, SHARED_TITLE_MAX);
  if (!note || !title) return fail('error');
  if (!(await projectExists(input.projectId))) return fail('project');
  await store().shareNote({ noteId, meetingId: note.meetingId, projectId: input.projectId, authorId: user.id, kind: kindOf(input.kind), title, body: text(input.body, SHARED_BODY_MAX) });
  return done();
});

export const unshareNoteAction = guard(async function unshareNoteAction(sharedId: string) {
  const user = await requireUser();
  await store().deleteSharedNote(sharedId, user.id);
  return done();
});
