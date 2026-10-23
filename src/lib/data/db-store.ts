import 'server-only';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { dbGeneration, getDb, resetDb, schema as s } from '@/db';
import { describeDbError, isConnectionError } from '@/lib/db-errors';
import type { DataStore, Message, Notification } from './types';

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

    async purge(visitsBefore, notificationsBefore) {
      const v = await db().delete(s.officeVisits).where(lt(s.officeVisits.visitedAt, new Date(visitsBefore))).returning({ id: s.officeVisits.id });
      const n = await db().delete(s.notifications)
        .where(and(isNotNull(s.notifications.readAt), lt(s.notifications.readAt, new Date(notificationsBefore))))
        .returning({ id: s.notifications.id });
      return { visits: v.length, notifications: n.length };
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

// A dead or hung connection (e.g. after the serverless instance was frozen) fails the query; it is retried
// once on fresh connections. Reads also get a time limit (writes have none, so a slow write is never repeated).
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
        if (!isConnectionError(e)) throw e;
        console.warn(`[db] ${name} failed (${describeDbError(e).code}); retrying on a new connection`);
        resetDb(0, gen);
        return run(args);
      }
    };
  }
  return out as unknown as DataStore;
}

