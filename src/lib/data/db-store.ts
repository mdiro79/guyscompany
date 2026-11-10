import 'server-only';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { dbGeneration, getDb, resetDb, schema as s } from '@/db';
import { describeDbError, isConnectionError, isNotSentError } from '@/lib/db-errors';
import { cleanCounters, emptyCounters } from '@/lib/todo-game';
import { OFFICE_DEFAULTS, type DataStore, type Issue, type IssueComment, type Meeting, type MeetingAttendance, type MeetingNote, type Message, type Milestone, type Notification, type Post, type ProjectIdea, type Room, type SharedNote, type Todo } from './types';

type Row = Record<string, unknown>;
// Drizzle returns Date objects for timestamp columns; the app works with ISO strings.
const iso = <T,>(row: Row): T => {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as T;
};
const isoAll = <T,>(rows: Row[]) => rows.map((r) => iso<T>(r));
const dates = <T extends Row>(patch: T) => {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = typeof v === 'string' && /(At|At_)$/.test(k) ? new Date(v) : v;
  }
  return out;
};

export type Db = PgDatabase<PgQueryResultHKT, typeof s>;

// `db` is injectable for tests (PGlite); production uses the Supabase pooler connection.
export function createDbStore(injected?: Db): DataStore {
  // Resolved per call so a stale serverless connection is replaced (see getDb).
  const db = () => injected ?? (getDb() as unknown as Db);
  const store: DataStore = {
    async listProfiles() { return isoAll(await db().select().from(s.profiles).orderBy(asc(s.profiles.createdAt))); },
    async getProfile(id) { const [r] = await db().select().from(s.profiles).where(eq(s.profiles.id, id)); return r ? iso(r) : null; },
    async getProfileByUsername(u) { const [r] = await db().select().from(s.profiles).where(eq(s.profiles.username, u)); return r ? iso(r) : null; },
    async insertProfile(p) { await db().insert(s.profiles).values({ ...p, createdAt: new Date(p.createdAt) }); },
    async updateProfile(id, patch) { await db().update(s.profiles).set(dates(patch)).where(eq(s.profiles.id, id)); },
    async deleteProfile(id) { await db().delete(s.profiles).where(eq(s.profiles.id, id)); },

    async listProjects() { return isoAll(await db().select().from(s.projects).orderBy(asc(s.projects.createdAt))); },
    async createProject(p) { const [r] = await db().insert(s.projects).values(p).returning(); return iso(r); },
    async updateProject(id, patch) { await db().update(s.projects).set(patch).where(eq(s.projects.id, id)); },
    async deleteProject(id) { await db().delete(s.projects).where(eq(s.projects.id, id)); },

    async listTasks() { return isoAll(await db().select().from(s.tasks).orderBy(asc(s.tasks.position), asc(s.tasks.createdAt))); },
    async createTask(t) {
      const [{ max }] = await db().select({ max: sql<number>`coalesce(max(${s.tasks.position}), 0)` }).from(s.tasks);
      const [r] = await db().insert(s.tasks).values({ position: Number(max) + 1, ...t }).returning();
      return iso(r);
    },
    async updateTask(id, patch) { await db().update(s.tasks).set({ ...dates(patch), updatedAt: new Date() }).where(eq(s.tasks.id, id)); },
    async deleteTask(id) { await db().delete(s.tasks).where(eq(s.tasks.id, id)); },

    async listRoles() { return isoAll(await db().select().from(s.projectRoles).orderBy(asc(s.projectRoles.createdAt))); },
    async createRole(r) { const [x] = await db().insert(s.projectRoles).values(r).returning(); return iso(x); },
    async updateRole(id, patch) { await db().update(s.projectRoles).set(patch).where(eq(s.projectRoles.id, id)); },
    async deleteRole(id) { await db().delete(s.projectRoles).where(eq(s.projectRoles.id, id)); },

    async listFiles() { return isoAll(await db().select().from(s.files).orderBy(desc(s.files.createdAt))); },
    async getFile(id) { const [r] = await db().select().from(s.files).where(eq(s.files.id, id)); return r ? iso(r) : null; },
    async createFile(f) { const [r] = await db().insert(s.files).values(f).returning(); return iso(r); },
    async deleteFile(id) { await db().delete(s.files).where(eq(s.files.id, id)); },

    async listMessages(channel, limit) {
      const rows = await db().select().from(s.messages).where(eq(s.messages.channel, channel)).orderBy(desc(s.messages.createdAt)).limit(limit);
      const ids = rows.map((r) => r.id);
      const reacts = ids.length ? await db().select().from(s.reactions).where(inArray(s.reactions.messageId, ids)) : [];
      return rows.reverse().map((r) => ({
        ...iso<Omit<Message, 'reactions'>>(r),
        reactions: reacts.filter((x) => x.messageId === r.id).map(({ userId, emoji }) => ({ userId, emoji })),
      }));
    },
    async createMessage(m) { const [r] = await db().insert(s.messages).values(m).returning(); return { ...iso<Omit<Message, 'reactions'>>(r), reactions: [] }; },
    async toggleReaction(messageId, userId, emoji) {
      const where = and(eq(s.reactions.messageId, messageId), eq(s.reactions.userId, userId), eq(s.reactions.emoji, emoji));
      const deleted = await db().delete(s.reactions).where(where).returning();
      if (!deleted.length) await db().insert(s.reactions).values({ messageId, userId, emoji });
    },

    async listPolls() { return isoAll(await db().select().from(s.polls).orderBy(desc(s.polls.createdAt))); },
    async createPoll(p) { const [r] = await db().insert(s.polls).values({ ...p, closesAt: new Date(p.closesAt) }).returning(); return iso(r); },
    async updatePoll(id, patch) { await db().update(s.polls).set(patch).where(eq(s.polls.id, id)); },
    async listVotes(pollId) { return pollId ? db().select().from(s.pollVotes).where(eq(s.pollVotes.pollId, pollId)) : db().select().from(s.pollVotes); },
    async upsertVote(v) {
      await db().insert(s.pollVotes).values(v).onConflictDoUpdate({ target: [s.pollVotes.pollId, s.pollVotes.userId], set: { score: v.score } });
    },

    async listFocus(userId, day) { return db().select().from(s.focusItems).where(and(eq(s.focusItems.userId, userId), eq(s.focusItems.day, day))); },
    async createFocus(f) { const [r] = await db().insert(s.focusItems).values(f).returning(); return r; },
    async updateFocus(id, userId, patch) { await db().update(s.focusItems).set(patch).where(and(eq(s.focusItems.id, id), eq(s.focusItems.userId, userId))); },
    async deleteFocus(id, userId) { await db().delete(s.focusItems).where(and(eq(s.focusItems.id, id), eq(s.focusItems.userId, userId))); },

    async listTodos(userId, doneSince) {
      return isoAll<Todo>(await db().select().from(s.todos).where(and(eq(s.todos.userId, userId),
        or(isNull(s.todos.clearedAt), gte(s.todos.doneAt, new Date(doneSince))))).orderBy(asc(s.todos.createdAt)));
    },
    async createTodo(t) { const [r] = await db().insert(s.todos).values(t).returning(); return iso<Todo>(r); },
    async getTodo(id, userId) {
      const [r] = await db().select().from(s.todos).where(and(eq(s.todos.id, id), eq(s.todos.userId, userId)));
      return r ? iso<Todo>(r) : null;
    },
    async getTodoStats(userId) {
      const [r] = await db().select().from(s.todoStats).where(eq(s.todoStats.userId, userId));
      return r ? { xp: r.xp, counters: cleanCounters(r.counters) } : { xp: 0, counters: emptyCounters() };
    },
    async setTodoStats(userId, stats) {
      const row = { xp: stats.xp, counters: stats.counters, updatedAt: new Date() };
      await db().insert(s.todoStats).values({ userId, ...row }).onConflictDoUpdate({ target: s.todoStats.userId, set: row });
    },
    async updateTodo(id, userId, patch) { await db().update(s.todos).set(dates(patch)).where(and(eq(s.todos.id, id), eq(s.todos.userId, userId))); },
    async deleteTodo(id, userId) { await db().delete(s.todos).where(and(eq(s.todos.id, id), eq(s.todos.userId, userId))); },
    async clearDoneTodos(userId) {
      await db().update(s.todos).set({ clearedAt: new Date() }).where(and(eq(s.todos.userId, userId), eq(s.todos.done, true), isNull(s.todos.clearedAt)));
    },
    async countOpenTodos(userId) {
      const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(s.todos).where(and(eq(s.todos.userId, userId), eq(s.todos.done, false)));
      return Number(n);
    },

    async listIssues(projectId) {
      const q = db().select().from(s.issues);
      return isoAll<Issue>(await (projectId ? q.where(eq(s.issues.projectId, projectId)) : q).orderBy(desc(s.issues.createdAt)));
    },
    async createIssue(i) { const [r] = await db().insert(s.issues).values(i).returning(); return iso<Issue>(r); },
    async updateIssue(id, patch) { await db().update(s.issues).set({ ...dates(patch), updatedAt: new Date() }).where(eq(s.issues.id, id)); },
    async deleteIssue(id) { await db().delete(s.issues).where(eq(s.issues.id, id)); },
    async listIssueComments(ids) {
      return ids.length ? isoAll<IssueComment>(await db().select().from(s.issueComments).where(inArray(s.issueComments.issueId, ids)).orderBy(asc(s.issueComments.createdAt))) : [];
    },
    async createIssueComment(c) { const [r] = await db().insert(s.issueComments).values(c).returning(); return iso<IssueComment>(r); },
    async listIdeas(projectId) {
      const q = db().select().from(s.projectIdeas);
      const rows = await (projectId ? q.where(eq(s.projectIdeas.projectId, projectId)) : q).orderBy(desc(s.projectIdeas.createdAt));
      const ids = rows.map((r) => r.id);
      const votes = ids.length ? await db().select().from(s.ideaVotes).where(inArray(s.ideaVotes.ideaId, ids)) : [];
      return rows.map((r) => ({ ...iso<Omit<ProjectIdea, 'voterIds'>>(r), voterIds: votes.filter((v) => v.ideaId === r.id).map((v) => v.userId) }));
    },
    async createIdea(i) { const [r] = await db().insert(s.projectIdeas).values(i).returning(); return { ...iso<Omit<ProjectIdea, 'voterIds'>>(r), voterIds: [] }; },
    async updateIdea(id, patch) { await db().update(s.projectIdeas).set(patch).where(eq(s.projectIdeas.id, id)); },
    async deleteIdea(id) { await db().delete(s.projectIdeas).where(eq(s.projectIdeas.id, id)); },
    async toggleIdeaVote(ideaId, userId) {
      const where = and(eq(s.ideaVotes.ideaId, ideaId), eq(s.ideaVotes.userId, userId));
      const deleted = await db().delete(s.ideaVotes).where(where).returning();
      if (!deleted.length) await db().insert(s.ideaVotes).values({ ideaId, userId });
    },
    async listMilestones(projectId) {
      const q = db().select().from(s.milestones);
      return isoAll<Milestone>(await (projectId ? q.where(eq(s.milestones.projectId, projectId)) : q).orderBy(asc(s.milestones.dueDate), asc(s.milestones.createdAt)));
    },
    async createMilestone(m) { const [r] = await db().insert(s.milestones).values(m).returning(); return iso<Milestone>(r); },
    async updateMilestone(id, patch) { await db().update(s.milestones).set(patch).where(eq(s.milestones.id, id)); },
    async deleteMilestone(id) { await db().delete(s.milestones).where(eq(s.milestones.id, id)); },

    async listMeetings(limit) { return isoAll<Meeting>(await db().select().from(s.meetings).orderBy(desc(s.meetings.startedAt)).limit(limit)); },
    async getMeeting(id) { const [r] = await db().select().from(s.meetings).where(eq(s.meetings.id, id)); return r ? iso<Meeting>(r) : null; },
    async getOpenMeeting() {
      const [r] = await db().select().from(s.meetings).where(isNull(s.meetings.endedAt)).orderBy(desc(s.meetings.startedAt)).limit(1);
      return r ? iso<Meeting>(r) : null;
    },
    async createMeeting(m) { const [r] = await db().insert(s.meetings).values(m).returning(); return iso<Meeting>(r); },
    async updateMeeting(id, patch) { await db().update(s.meetings).set(dates(patch)).where(eq(s.meetings.id, id)); },
    async listAttendance(ids) {
      return ids.length ? isoAll<MeetingAttendance>(await db().select().from(s.meetingAttendance).where(inArray(s.meetingAttendance.meetingId, ids))) : [];
    },
    async setAttendance(a) {
      const row = { firstJoinedAt: new Date(a.firstJoinedAt), joinedAt: a.joinedAt ? new Date(a.joinedAt) : null, seenAt: new Date(a.seenAt), seconds: a.seconds };
      await db().insert(s.meetingAttendance).values({ meetingId: a.meetingId, userId: a.userId, ...row })
        .onConflictDoUpdate({ target: [s.meetingAttendance.meetingId, s.meetingAttendance.userId], set: row });
    },
    async listMeetingNotes(userId) {
      return isoAll<MeetingNote>(await db().select().from(s.meetingNotes).where(eq(s.meetingNotes.userId, userId)).orderBy(asc(s.meetingNotes.createdAt)));
    },
    async createMeetingNote(n) { const [r] = await db().insert(s.meetingNotes).values(n).returning(); return iso<MeetingNote>(r); },
    async updateMeetingNote(id, userId, patch) {
      await db().update(s.meetingNotes).set({ ...patch, updatedAt: new Date() }).where(and(eq(s.meetingNotes.id, id), eq(s.meetingNotes.userId, userId)));
    },
    async deleteMeetingNote(id, userId) { await db().delete(s.meetingNotes).where(and(eq(s.meetingNotes.id, id), eq(s.meetingNotes.userId, userId))); },
    async listSharedNotes({ projectId, meetingIds }) {
      const where = projectId ? eq(s.sharedNotes.projectId, projectId) : meetingIds ? (meetingIds.length ? inArray(s.sharedNotes.meetingId, meetingIds) : sql`false`) : undefined;
      return isoAll<SharedNote>(await db().select().from(s.sharedNotes).where(where).orderBy(desc(s.sharedNotes.updatedAt)));
    },
    async shareNote(n) {
      const set = { projectId: n.projectId, kind: n.kind, title: n.title, body: n.body, updatedAt: new Date() };
      const [r] = n.noteId
        ? await db().insert(s.sharedNotes).values(n).onConflictDoUpdate({ target: s.sharedNotes.noteId, set }).returning()
        : await db().insert(s.sharedNotes).values(n).returning();
      return iso<SharedNote>(r);
    },
    async deleteSharedNote(id, authorId) { await db().delete(s.sharedNotes).where(and(eq(s.sharedNotes.id, id), eq(s.sharedNotes.authorId, authorId))); },

    async listPosts(since, limit) {
      return isoAll<Post>(await db().select().from(s.posts).where(gte(s.posts.createdAt, new Date(since))).orderBy(desc(s.posts.createdAt)).limit(limit));
    },
    async getPost(id) { const [r] = await db().select().from(s.posts).where(eq(s.posts.id, id)); return r ? iso<Post>(r) : null; },
    async createPost(p) { const [r] = await db().insert(s.posts).values(p).returning(); return iso<Post>(r); },
    async saveStandup(authorId, day, text) {
      const [old] = await db().select({ id: s.posts.id }).from(s.posts).where(and(eq(s.posts.kind, 'standup'), eq(s.posts.authorId, authorId), eq(s.posts.day, day)));
      const [r] = old
        ? await db().update(s.posts).set(text).where(eq(s.posts.id, old.id)).returning()
        : await db().insert(s.posts).values({ kind: 'standup', authorId, day, ...text }).returning();
      return iso<Post>(r);
    },
    async updatePost(id, patch) { await db().update(s.posts).set(patch).where(eq(s.posts.id, id)); },
    async deletePost(id) { await db().delete(s.posts).where(eq(s.posts.id, id)); },

    async getRoom(id) { const [r] = await db().select().from(s.rooms).where(eq(s.rooms.id, id)); return r ? iso<Room>(r) : null; },
    async updateRoom(id, patch) {
      const [r] = await db().insert(s.rooms).values({ id, ...patch, updatedAt: new Date() })
        .onConflictDoUpdate({ target: s.rooms.id, set: { ...patch, updatedAt: new Date() } }).returning();
      return iso<Room>(r);
    },

    async listEvents(from, to) {
      return isoAll(await db().select().from(s.calendarEvents)
        .where(and(gte(s.calendarEvents.endsAt, new Date(from)), lte(s.calendarEvents.startsAt, new Date(to))))
        .orderBy(asc(s.calendarEvents.startsAt)));
    },
    async createEvent(e) {
      const [r] = await db().insert(s.calendarEvents).values({ ...e, startsAt: new Date(e.startsAt), endsAt: new Date(e.endsAt) }).returning();
      return iso(r);
    },
    async deleteEvent(id) { await db().delete(s.calendarEvents).where(eq(s.calendarEvents.id, id)); },

    async listNotifications(userId) {
      return isoAll<Notification>(await db().select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.createdAt)).limit(50));
    },
    async createNotification(n) { await db().insert(s.notifications).values(n); },
    async markNotificationsRead(userId, ids) {
      const base = and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt));
      await db().update(s.notifications).set({ readAt: new Date() }).where(ids?.length ? and(base, inArray(s.notifications.id, ids)) : base);
    },

    async listOffices() { return db().select().from(s.offices).orderBy(asc(s.offices.slot)); },
    async updateOffice(slot, patch) { await db().update(s.offices).set(patch).where(eq(s.offices.slot, slot)); },
    // The row lock makes a race fair: the second of two people claiming the same office gets 'taken'.
    // A member who already has an office moves: its settings, private chat, invites and visitor log come
    // along and the old office is left empty. Whatever a former owner left in the target office (private
    // chat, invites, visits) is removed first, so nobody reads someone else's private chat.
    async claimOffice(slot, userId) {
      return db().transaction(async (tx) => {
        const [target] = await tx.select().from(s.offices).where(eq(s.offices.slot, slot)).for('update');
        if (!target) return 'taken';
        if (target.ownerId) return target.ownerId === userId ? 'claimed' : 'taken';
        const [previous] = await tx.select().from(s.offices).where(eq(s.offices.ownerId, userId));
        const channel = `office:${slot}`;
        await tx.delete(s.messages).where(eq(s.messages.channel, channel));
        await tx.delete(s.privateChatInvites).where(eq(s.privateChatInvites.slot, slot));
        await tx.delete(s.officeVisits).where(eq(s.officeVisits.slot, slot));
        if (previous) {
          await tx.update(s.messages).set({ channel }).where(eq(s.messages.channel, `office:${previous.slot}`));
          await tx.update(s.privateChatInvites).set({ slot }).where(eq(s.privateChatInvites.slot, previous.slot));
          await tx.update(s.officeVisits).set({ slot }).where(eq(s.officeVisits.slot, previous.slot));
          await tx.update(s.offices).set({ ownerId: null, ...OFFICE_DEFAULTS }).where(eq(s.offices.slot, previous.slot));
        }
        const settings = previous ? { glass: previous.glass, locked: previous.locked, focus: previous.focus, isPublic: previous.isPublic } : OFFICE_DEFAULTS;
        await tx.update(s.offices).set({ ownerId: userId, ...settings }).where(eq(s.offices.slot, slot));
        return 'claimed';
      });
    },
    async addVisit(slot, visitorId) { await db().insert(s.officeVisits).values({ slot, visitorId }); },
    async listVisits(slot, since) {
      return isoAll(await db().select().from(s.officeVisits).where(and(eq(s.officeVisits.slot, slot), gte(s.officeVisits.visitedAt, new Date(since)))).orderBy(desc(s.officeVisits.visitedAt)));
    },
    async listSwapRequests(userId) {
      return isoAll(await db().select().from(s.officeSwapRequests).where(or(eq(s.officeSwapRequests.fromUserId, userId), eq(s.officeSwapRequests.toUserId, userId))));
    },
    async createSwapRequest(fromUserId, toUserId) { const [r] = await db().insert(s.officeSwapRequests).values({ fromUserId, toUserId }).returning(); return iso(r); },
    async updateSwapRequest(id, status) { const [r] = await db().update(s.officeSwapRequests).set({ status }).where(eq(s.officeSwapRequests.id, id)).returning(); return r ? iso(r) : null; },
    async listInvites(userId) {
      return isoAll(await db().select().from(s.privateChatInvites).where(or(eq(s.privateChatInvites.inviterId, userId), eq(s.privateChatInvites.inviteeId, userId))));
    },
    async createInvite(i) { const [r] = await db().insert(s.privateChatInvites).values(i).returning(); return iso(r); },
    async updateInvite(id, status) { const [r] = await db().update(s.privateChatInvites).set({ status }).where(eq(s.privateChatInvites.id, id)).returning(); return r ? iso(r) : null; },

    async purge(visitsBefore, notificationsBefore, todosBefore) {
      const v = await db().delete(s.officeVisits).where(lt(s.officeVisits.visitedAt, new Date(visitsBefore))).returning({ id: s.officeVisits.id });
      const n = await db().delete(s.notifications)
        .where(and(isNotNull(s.notifications.readAt), lt(s.notifications.readAt, new Date(notificationsBefore))))
        .returning({ id: s.notifications.id });
      const t = await db().delete(s.todos).where(and(isNotNull(s.todos.clearedAt), lt(s.todos.clearedAt, new Date(todosBefore)))).returning({ id: s.todos.id });
      return { visits: v.length, notifications: n.length, todos: t.length };
    },
  };
  return injected ? store : resilient(store);
}

const READ_TIMEOUT_MS = 8000;

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`query took longer than ${ms} ms`), { code: 'QUERY_TIMEOUT' })), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

const RETRY_DELAY_MS = 250;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A dead or hung connection (e.g. after the serverless instance was frozen) or a busy pooler fails the query;
// reads are retried once on fresh connections. Writes are retried only when the query certainly never
// reached the database, so a write is never applied twice. Reads also get a time limit (writes have none).
export function resilient(store: DataStore): DataStore {
  const out = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(store) as [string, (...a: unknown[]) => Promise<unknown>][]) {
    const read = /^(list|get)/.test(name);
    const run = (args: unknown[]) => (read ? timeout(fn(...args), READ_TIMEOUT_MS) : fn(...args));
    out[name] = async (...args: unknown[]) => {
      let gen = dbGeneration();
      try {
        const p = run(args);
        gen = dbGeneration(); // the query has picked its connection set synchronously
        return await p;
      } catch (e) {
        // A TypeError while reading means rows of the wrong shape (e.g. "a.map is not a function" on an
        // array column): the pooler handed back another query's answer after a connection was dropped
        // under load. The connections are replaced and the read is asked again.
        if (!(read ? isConnectionError(e) || e instanceof TypeError : isNotSentError(e))) throw e;
        console.warn(`[db] ${name} failed (${describeDbError(e).code}); retrying on a new connection`);
        // Fresh connections serve the retry at once; the old ones get a few seconds to finish what is in
        // flight instead of being cut mid-query, which left the pooler answering later queries with stale rows.
        resetDb(5, gen);
        await wait(RETRY_DELAY_MS);
        return run(args);
      }
    };
  }
  return out as unknown as DataStore;
}

