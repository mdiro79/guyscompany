import { emptyCounters } from '@/lib/todo-game';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';
import { createDbStore, type Db } from './db-store';
import type { DataStore } from './types';

// Runs the Drizzle store against an in-process Postgres with the real migration.
let store: DataStore;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  const pg = new PGlite();
  const dir = path.resolve(__dirname, '../../../drizzle');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(path.join(dir, f), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pg.exec(stmt);
  }
  await pg.exec("insert into offices (slot, wall_color) values (1,'orange'),(2,'teal'),(3,'teal'),(4,'orange')");
  store = createDbStore(drizzle(pg, { schema }) as unknown as Db);
  const base = { jobTitle: '', role: 'member' as const, characterId: 'kaykit-mage', status: 'online' as const, mustChangePassword: true, tutorialDone: false, createdAt: new Date().toISOString() };
  await store.insertProfile({ ...base, id: A, username: 'alice', displayName: 'Alice', role: 'admin' });
  await store.insertProfile({ ...base, id: B, username: 'bob', displayName: 'Bob' });
});

describe('db store', () => {
  it('profiles', async () => {
    expect((await store.listProfiles()).map((p) => p.username)).toEqual(['alice', 'bob']);
    await store.updateProfile(B, { mustChangePassword: false, characterId: 'monsters-b-cat' });
    const bob = await store.getProfileByUsername('bob');
    expect(bob?.mustChangePassword).toBe(false);
    expect(bob?.characterId).toBe('monsters-b-cat');
    expect(typeof bob?.createdAt).toBe('string');
  });
  it('tasks and projects', async () => {
    const p = await store.createProject({ name: 'P', description: '', managerId: A });
    const t1 = await store.createTask({ title: 'One', projectId: p.id, tags: ['a', 'b'], dueDate: '2026-11-01' });
    const t2 = await store.createTask({ title: 'Two' });
    expect(t2.position).toBeGreaterThan(t1.position);
    await store.updateTask(t1.id, { column: 'done', assigneeId: B });
    const t = (await store.listTasks()).find((x) => x.id === t1.id)!;
    expect(t.column).toBe('done');
    expect(t.tags).toEqual(['a', 'b']);
    expect(t.dueDate).toBe('2026-11-01');
    await store.deleteProject(p.id);
    expect((await store.listTasks()).some((x) => x.id === t1.id)).toBe(false);
  });
  it('messages and reactions', async () => {
    const m = await store.createMessage({ channel: 'team', authorId: A, body: 'سلام', fileId: null });
    await store.toggleReaction(m.id, B, '👍');
    expect((await store.listMessages('team', 10))[0].reactions).toEqual([{ userId: B, emoji: '👍' }]);
    await store.toggleReaction(m.id, B, '👍');
    expect((await store.listMessages('team', 10))[0].reactions).toEqual([]);
    expect(await store.listMessages('office:1', 10)).toEqual([]);
  });
  it('polls with one vote per user and score range', async () => {
    const poll = await store.createPoll({ question: 'q', taskId: null, createdBy: A, closesAt: new Date(Date.now() + 60000).toISOString() });
    await store.upsertVote({ pollId: poll.id, userId: B, score: 4 });
    await store.upsertVote({ pollId: poll.id, userId: B, score: 9 });
    expect(await store.listVotes(poll.id)).toEqual([{ pollId: poll.id, userId: B, score: 9 }]);
    await expect(store.upsertVote({ pollId: poll.id, userId: A, score: 11 })).rejects.toThrow();
  });
  it('offices, swaps, invites, visits and cleanup', async () => {
    await store.updateOffice(1, { ownerId: A, glass: 'frosted', locked: true });
    expect((await store.listOffices())[0]).toMatchObject({ slot: 1, ownerId: A, glass: 'frosted', locked: true, wallColor: 'orange' });
    const r = await store.createSwapRequest(B, A);
    expect((await store.updateSwapRequest(r.id, 'accepted'))?.status).toBe('accepted');
    const inv = await store.createInvite({ slot: 1, inviterId: A, inviteeId: B });
    expect((await store.listInvites(B))[0].id).toBe(inv.id);
    await store.addVisit(1, B);
    expect((await store.listVisits(1, new Date(Date.now() - 60000).toISOString())).length).toBe(1);
    await store.createNotification({ userId: B, kind: 'mention', payload: { name: 'Alice' } });
    await store.markNotificationsRead(B);
    const purged = await store.purge(new Date(Date.now() + 1000).toISOString(), new Date(Date.now() + 1000).toISOString(), new Date(Date.now() + 1000).toISOString());
    expect(purged).toEqual({ visits: 1, notifications: 1, todos: 0 });
  });
  it('focus items, events and files', async () => {
    const f = await store.createFocus({ userId: A, day: '2026-10-23', text: 'x' });
    await store.updateFocus(f.id, B, { done: true }); // other user cannot change it
    expect((await store.listFocus(A, '2026-10-23'))[0].done).toBe(false);
    const e = await store.createEvent({ title: 'E', startsAt: '2026-10-23T10:00:00.000Z', endsAt: '2026-10-23T11:00:00.000Z', createdBy: A });
    expect((await store.listEvents('2026-10-23T00:00:00.000Z', '2026-10-24T00:00:00.000Z'))[0].id).toBe(e.id);
    const file = await store.createFile({ name: 'a.txt', storagePath: 'x/a.txt', size: 3, mime: 'text/plain', uploadedBy: A });
    expect((await store.getFile(file.id))?.name).toBe('a.txt');
  });
  it('project command center: issues with screenshots and comments, ideas with votes, milestones', async () => {
    const p = await store.createProject({ name: 'P', description: '', managerId: A });
    expect(p).toMatchObject({ status: 'active', dueDate: null });
    await store.updateProject(p.id, { status: 'paused', dueDate: '2026-12-01' });
    expect((await store.listProjects()).find((x) => x.id === p.id)).toMatchObject({ status: 'paused', dueDate: '2026-12-01' });
    const shot = await store.createFile({ name: 's.png', storagePath: 'x/s.png', size: 9, mime: 'image/png', uploadedBy: B });
    const i = await store.createIssue({ projectId: p.id, kind: 'bug', title: 'Crash', description: 'd', steps: '1', severity: 3, reporterId: B, assigneeId: A, screenshotIds: [shot.id] });
    expect(i).toMatchObject({ status: 'open', severity: 3, screenshotIds: [shot.id], resolvedAt: null });
    const resolvedAt = new Date().toISOString();
    await store.updateIssue(i.id, { status: 'fixed', resolvedAt });
    expect((await store.listIssues(p.id))[0]).toMatchObject({ status: 'fixed', resolvedAt });
    await expect(store.updateIssue(i.id, { severity: 7 as never })).rejects.toThrow();
    await store.createIssueComment({ issueId: i.id, authorId: A, body: 'on it' });
    expect((await store.listIssueComments([i.id])).map((c) => c.body)).toEqual(['on it']);
    const idea = await store.createIdea({ projectId: p.id, kind: 'upgrade', title: 'Dark mode', description: '', authorId: B });
    await store.toggleIdeaVote(idea.id, A);
    await store.toggleIdeaVote(idea.id, B);
    await store.toggleIdeaVote(idea.id, B); // second vote removes it
    await store.updateIdea(idea.id, { status: 'planned' });
    expect((await store.listIdeas(p.id))[0]).toMatchObject({ status: 'planned', voterIds: [A] });
    const m = await store.createMilestone({ projectId: p.id, title: 'Beta', dueDate: '2026-11-01' });
    await store.updateMilestone(m.id, { done: true });
    expect((await store.listMilestones(p.id))[0]).toMatchObject({ title: 'Beta', done: true });
    await store.deleteProject(p.id); // cascades
    expect(await store.listIssues(p.id)).toEqual([]);
    expect(await store.listIdeas(p.id)).toEqual([]);
  });
  it('room settings: upsert, partial update and range check', async () => {
    expect(await store.getRoom('conference')).toBeNull();
    expect(await store.updateRoom('conference', { light: 30 })).toMatchObject({ id: 'conference', light: 30, warmth: 40, frost: 0 });
    const r = await store.updateRoom('conference', { frost: 80, warmth: 10 });
    expect(r).toMatchObject({ light: 30, warmth: 10, frost: 80 });
    expect((await store.getRoom('conference'))?.frost).toBe(80);
    await expect(store.updateRoom('conference', { light: 150 })).rejects.toThrow();
  });
  it('personal to-dos: private, done/cleared, streak window and cleanup', async () => {
    const t = await store.createTodo({ userId: A, title: 'buy bread', due: '2026-10-25', priority: 2, starred: true });
    expect(t).toMatchObject({ title: 'buy bread', due: '2026-10-25', priority: 2, starred: true, done: false, doneAt: null, clearedAt: null });
    await store.createTodo({ userId: A, title: 'call', due: null, priority: 0, starred: false });
    await store.updateTodo(t.id, B, { title: 'hacked' }); // other user cannot change it
    await store.deleteTodo(t.id, B);
    const since = new Date(Date.now() - 86400000).toISOString();
    expect((await store.listTodos(A, since)).map((x) => x.title).sort()).toEqual(['buy bread', 'call']);
    expect(await store.listTodos(B, since)).toEqual([]);
    const doneAt = new Date().toISOString();
    await store.updateTodo(t.id, A, { done: true, doneAt, due: null });
    expect(await store.countOpenTodos(A)).toBe(1);
    await store.clearDoneTodos(A);
    const cleared = (await store.listTodos(A, since)).find((x) => x.id === t.id)!;
    expect(cleared.clearedAt).not.toBeNull(); // still listed for the streak
    expect(cleared.doneAt).toBe(doneAt);
    expect((await store.listTodos(A, new Date(Date.now() + 60000).toISOString())).map((x) => x.title)).toEqual(['call']);
    const far = new Date(Date.now() + 60000).toISOString();
    expect(await store.purge(new Date(0).toISOString(), new Date(0).toISOString(), far)).toEqual({ visits: 0, notifications: 0, todos: 1 });
  });

  it('to-do game: categories, XP per to-do and the score per member', async () => {
    const t = await store.createTodo({ userId: A, title: 'read', due: null, priority: 0, starred: false, category: 'learning' });
    expect(t).toMatchObject({ category: 'learning', xp: 0 });
    await store.updateTodo(t.id, A, { done: true, doneAt: new Date().toISOString(), xp: 15 });
    expect(await store.getTodo(t.id, A)).toMatchObject({ done: true, xp: 15 });
    expect(await store.getTodo(t.id, B)).toBeNull();
    await expect(store.updateTodo(t.id, A, { category: 'nope' as never })).rejects.toThrow();
    expect(await store.getTodoStats(A)).toEqual({ xp: 0, counters: emptyCounters() });
    const stats = { xp: 135, counters: { ...emptyCounters(), done: 3, cat: { personal: 1, work: 0, learning: 2, health: 0 } } };
    await store.setTodoStats(A, stats);
    await store.setTodoStats(A, { ...stats, xp: 150 });
    expect(await store.getTodoStats(A)).toEqual({ ...stats, xp: 150 });
  });
});
