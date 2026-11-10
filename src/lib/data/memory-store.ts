import type {
  DataStore, Profile, Project, Task, ProjectRole, FileMeta, Message, Poll, PollVote, FocusItem, Todo, TodoStats, Room,
  Issue, IssueComment, ProjectIdea, Milestone, Meeting, MeetingAttendance, MeetingNote, SharedNote,
  CalendarEvent, Notification, Office, OfficeVisit, SwapRequest, ChatInvite, NewTask, Post,
} from './types';
import { OFFICE_DEFAULTS } from './types';
import { createSeed } from './seed';
import { emptyCounters } from '@/lib/todo-game';

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

// In-memory store for demo mode. Data lives as long as the server process.
export function createMemoryStore(): DataStore {
  const seed = createSeed();
  const db = {
    profiles: seed.profiles as Profile[],
    projects: seed.projects as Project[],
    tasks: seed.tasks as Task[],
    roles: seed.roles as ProjectRole[],
    files: [] as FileMeta[],
    messages: seed.messages as Message[],
    polls: seed.polls as Poll[],
    votes: [] as PollVote[],
    focus: seed.focus as FocusItem[],
    todos: seed.todos as Todo[],
    todoStats: new Map<string, TodoStats>(seed.todoStats),
    issues: seed.issues as Issue[],
    comments: seed.comments as IssueComment[],
    ideas: seed.ideas as ProjectIdea[],
    milestones: seed.milestones as Milestone[],
    meetings: [] as Meeting[],
    attendance: [] as MeetingAttendance[],
    notes: [] as MeetingNote[],
    shared: [] as SharedNote[],
    rooms: [{ id: 'conference', light: 100, warmth: 40, frost: 0, updatedAt: new Date(0).toISOString() }] as Room[],
    events: seed.events as CalendarEvent[],
    posts: seed.posts as Post[],
    notifications: seed.notifications as Notification[],
    offices: seed.offices as Office[],
    visits: [] as OfficeVisit[],
    swaps: [] as SwapRequest[],
    invites: [] as ChatInvite[],
  };
  const clone = <T,>(x: T): T => structuredClone(x);
  const patchIn = <T extends object>(list: T[], match: (x: NoInfer<T>) => boolean, patch: NoInfer<Partial<T>>) => {
    const item = list.find(match);
    if (item) Object.assign(item, patch);
    return item;
  };

  return {
    async listProfiles() { return clone(db.profiles); },
    async getProfile(id) { return clone(db.profiles.find((p) => p.id === id) ?? null); },
    async getProfileByUsername(u) { return clone(db.profiles.find((p) => p.username === u) ?? null); },
    async insertProfile(p) { db.profiles.push(clone(p)); },
    async updateProfile(id, patch) { patchIn(db.profiles, (p) => p.id === id, patch); },
    async deleteProfile(id) {
      db.profiles = db.profiles.filter((p) => p.id !== id);
      db.offices.forEach((o) => { if (o.ownerId === id) o.ownerId = null; });
      db.tasks.forEach((t) => { if (t.assigneeId === id) t.assigneeId = null; });
    },

    async listProjects() { return clone(db.projects); },
    async createProject(p) { const x: Project = { status: 'active', dueDate: null, ...p, id: uuid(), createdAt: now() }; db.projects.push(x); return clone(x); },
    async updateProject(id, patch) { patchIn(db.projects, (p) => p.id === id, patch); },
    async deleteProject(id) {
      db.projects = db.projects.filter((p) => p.id !== id);
      db.tasks = db.tasks.filter((t) => t.projectId !== id);
      db.roles = db.roles.filter((r) => r.projectId !== id);
      db.issues = db.issues.filter((r) => r.projectId !== id);
      db.ideas = db.ideas.filter((r) => r.projectId !== id);
      db.milestones = db.milestones.filter((r) => r.projectId !== id);
      db.shared = db.shared.filter((r) => r.projectId !== id);
      for (const m of db.meetings) if (m.projectId === id) m.projectId = null;
    },

    async listTasks() { return clone(db.tasks); },
    async createTask(t: NewTask) {
      const x: Task = {
        projectId: null, description: '', column: 'idea', tags: [], assigneeId: null, needsVolunteer: false,
        startDate: null, dueDate: null, position: db.tasks.length + 1, createdBy: null, ...t,
        id: uuid(), createdAt: now(), updatedAt: now(),
      };
      db.tasks.push(x);
      return clone(x);
    },
    async updateTask(id, patch) { patchIn(db.tasks, (t) => t.id === id, { ...patch, updatedAt: now() }); },
    async deleteTask(id) { db.tasks = db.tasks.filter((t) => t.id !== id); },

    async listRoles() { return clone(db.roles); },
    async createRole(r) { const x = { ...r, id: uuid(), volunteerId: null, createdAt: now() }; db.roles.push(x); return clone(x); },
    async updateRole(id, patch) { patchIn(db.roles, (r) => r.id === id, patch); },
    async deleteRole(id) { db.roles = db.roles.filter((r) => r.id !== id); },

    async listFiles() { return clone(db.files).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getFile(id) { return clone(db.files.find((f) => f.id === id) ?? null); },
    async createFile(f) { const x = { ...f, id: uuid(), createdAt: now() }; db.files.push(x); return clone(x); },
    async deleteFile(id) { db.files = db.files.filter((f) => f.id !== id); },

    async listMessages(channel, limit) {
      return clone(db.messages.filter((m) => m.channel === channel).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-limit));
    },
    async createMessage(m) { const x = { ...m, id: uuid(), createdAt: now(), reactions: [] }; db.messages.push(x); return clone(x); },
    async toggleReaction(messageId, userId, emoji) {
      const m = db.messages.find((x) => x.id === messageId);
      if (!m) return;
      const i = m.reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
      if (i >= 0) m.reactions.splice(i, 1); else m.reactions.push({ userId, emoji });
    },

    async listPolls() { return clone(db.polls).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async createPoll(p) { const x = { ...p, id: uuid(), closed: false, decision: null, createdAt: now() }; db.polls.push(x); return clone(x); },
    async updatePoll(id, patch) { patchIn(db.polls, (p) => p.id === id, patch); },
    async listVotes(pollId) { return clone(pollId ? db.votes.filter((v) => v.pollId === pollId) : db.votes); },
    async upsertVote(v) {
      const existing = db.votes.find((x) => x.pollId === v.pollId && x.userId === v.userId);
      if (existing) existing.score = v.score; else db.votes.push({ ...v });
    },

    async listFocus(userId, day) { return clone(db.focus.filter((f) => f.userId === userId && f.day === day)); },
    async createFocus(f) { const x = { ...f, id: uuid(), done: false }; db.focus.push(x); return clone(x); },
    async updateFocus(id, userId, patch) { patchIn(db.focus, (f) => f.id === id && f.userId === userId, patch); },
    async deleteFocus(id, userId) { db.focus = db.focus.filter((f) => !(f.id === id && f.userId === userId)); },

    async listTodos(userId, doneSince) { return clone(db.todos.filter((t) => t.userId === userId && (!t.clearedAt || (t.doneAt ?? '') >= doneSince))); },
    async createTodo(t) { const x: Todo = { category: 'personal', ...t, id: uuid(), done: false, doneAt: null, clearedAt: null, xp: 0, createdAt: now() }; db.todos.push(x); return clone(x); },
    async getTodo(id, userId) { const t = db.todos.find((x) => x.id === id && x.userId === userId); return t ? clone(t) : null; },
    async getTodoStats(userId) { const s = db.todoStats.get(userId); return s ? clone(s) : { xp: 0, counters: emptyCounters() }; },
    async setTodoStats(userId, stats) { db.todoStats.set(userId, clone(stats)); },
    async updateTodo(id, userId, patch) { patchIn(db.todos, (t) => t.id === id && t.userId === userId, patch); },
    async deleteTodo(id, userId) { db.todos = db.todos.filter((t) => !(t.id === id && t.userId === userId)); },
    async clearDoneTodos(userId) { for (const t of db.todos) if (t.userId === userId && t.done && !t.clearedAt) t.clearedAt = now(); },
    async countOpenTodos(userId) { return db.todos.filter((t) => t.userId === userId && !t.done).length; },

    async listIssues(projectId) { return clone(db.issues.filter((i) => !projectId || i.projectId === projectId)); },
    async createIssue(i) { const x: Issue = { ...i, status: 'open', id: uuid(), createdAt: now(), updatedAt: now(), resolvedAt: null }; db.issues.push(x); return clone(x); },
    async updateIssue(id, patch) { patchIn(db.issues, (i) => i.id === id, { ...patch, updatedAt: now() }); },
    async deleteIssue(id) { db.issues = db.issues.filter((i) => i.id !== id); db.comments = db.comments.filter((c) => c.issueId !== id); },
    async listIssueComments(ids) { return clone(db.comments.filter((c) => ids.includes(c.issueId))); },
    async createIssueComment(c) { const x = { ...c, id: uuid(), createdAt: now() }; db.comments.push(x); return clone(x); },
    async listIdeas(projectId) { return clone(db.ideas.filter((i) => !projectId || i.projectId === projectId)); },
    async createIdea(i) { const x: ProjectIdea = { ...i, status: 'new', taskId: null, id: uuid(), createdAt: now(), voterIds: [] }; db.ideas.push(x); return clone(x); },
    async updateIdea(id, patch) { patchIn(db.ideas, (i) => i.id === id, patch); },
    async deleteIdea(id) { db.ideas = db.ideas.filter((i) => i.id !== id); },
    async toggleIdeaVote(ideaId, userId) {
      const idea = db.ideas.find((i) => i.id === ideaId);
      if (idea) idea.voterIds = idea.voterIds.includes(userId) ? idea.voterIds.filter((u) => u !== userId) : [...idea.voterIds, userId];
    },
    async listMilestones(projectId) { return clone(db.milestones.filter((m) => !projectId || m.projectId === projectId)); },
    async createMilestone(m) { const x = { ...m, done: false, id: uuid(), createdAt: now() }; db.milestones.push(x); return clone(x); },
    async updateMilestone(id, patch) { patchIn(db.milestones, (m) => m.id === id, patch); },
    async deleteMilestone(id) { db.milestones = db.milestones.filter((m) => m.id !== id); },

    async listMeetings(limit) { return clone([...db.meetings].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)); },
    async getMeeting(id) { const m = db.meetings.find((x) => x.id === id); return m ? clone(m) : null; },
    async getOpenMeeting() {
      const m = db.meetings.filter((x) => !x.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      return m ? clone(m) : null;
    },
    async createMeeting(m) { const x: Meeting = { ...m, id: uuid(), startedAt: now(), endedAt: null }; db.meetings.push(x); return clone(x); },
    async updateMeeting(id, patch) { patchIn(db.meetings, (m) => m.id === id, patch); },
    async listAttendance(ids) { return clone(db.attendance.filter((a) => ids.includes(a.meetingId))); },
    async setAttendance(a) {
      db.attendance = db.attendance.filter((x) => !(x.meetingId === a.meetingId && x.userId === a.userId));
      db.attendance.push(clone(a));
    },
    async listMeetingNotes(userId) { return clone(db.notes.filter((n) => n.userId === userId)); },
    async createMeetingNote(n) { const x: MeetingNote = { ...n, id: uuid(), createdAt: now(), updatedAt: now() }; db.notes.push(x); return clone(x); },
    async updateMeetingNote(id, userId, patch) { patchIn(db.notes, (n) => n.id === id && n.userId === userId, { ...patch, updatedAt: now() }); },
    async deleteMeetingNote(id, userId) {
      db.notes = db.notes.filter((n) => !(n.id === id && n.userId === userId));
      for (const x of db.shared) if (x.noteId === id) x.noteId = null;
    },
    async listSharedNotes({ projectId, meetingIds }) {
      return clone(db.shared.filter((n) => (!projectId || n.projectId === projectId) && (!meetingIds || (!!n.meetingId && meetingIds.includes(n.meetingId))))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    },
    async shareNote(n) {
      const old = n.noteId ? db.shared.find((x) => x.noteId === n.noteId) : undefined;
      if (old) { Object.assign(old, { projectId: n.projectId, kind: n.kind, title: n.title, body: n.body, updatedAt: now() }); return clone(old); }
      const x: SharedNote = { ...n, id: uuid(), createdAt: now(), updatedAt: now() };
      db.shared.push(x);
      return clone(x);
    },
    async deleteSharedNote(id, authorId) { db.shared = db.shared.filter((n) => !(n.id === id && n.authorId === authorId)); },

    async getRoom(id) { const r = db.rooms.find((x) => x.id === id); return r ? clone(r) : null; },
    async updateRoom(id, patch) {
      let r = db.rooms.find((x) => x.id === id);
      if (!r) { r = { id, light: 100, warmth: 40, frost: 0, updatedAt: now() }; db.rooms.push(r); }
      Object.assign(r, patch, { updatedAt: now() });
      return clone(r);
    },

    async listPosts(since, limit) { return clone(db.posts.filter((p) => p.createdAt >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)); },
    async getPost(id) { return clone(db.posts.find((p) => p.id === id) ?? null); },
    async createPost(p) {
      const x: Post = { targetId: null, did: '', blockers: '', badge: '', pinned: false, day: null, ...p, id: uuid(), createdAt: now() };
      db.posts.push(x);
      return clone(x);
    },
    async saveStandup(authorId, day, text) {
      const old = db.posts.find((p) => p.kind === 'standup' && p.authorId === authorId && p.day === day);
      if (old) { Object.assign(old, text); return clone(old); }
      return this.createPost({ kind: 'standup', authorId, day, ...text });
    },
    async updatePost(id, patch) { patchIn(db.posts, (p) => p.id === id, patch); },
    async deletePost(id) { db.posts = db.posts.filter((p) => p.id !== id); },

    async listEvents(from, to) { return clone(db.events.filter((e) => e.endsAt >= from && e.startsAt <= to)); },
    async createEvent(e) { const x = { ...e, id: uuid() }; db.events.push(x); return clone(x); },
    async deleteEvent(id) { db.events = db.events.filter((e) => e.id !== id); },

    async listNotifications(userId) {
      return clone(db.notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
    },
    async createNotification(n) { db.notifications.push({ ...n, id: uuid(), readAt: null, createdAt: now() }); },
    async markNotificationsRead(userId, ids) {
      db.notifications.forEach((n) => { if (n.userId === userId && !n.readAt && (!ids || ids.includes(n.id))) n.readAt = now(); });
    },

    async listOffices() { return clone(db.offices).sort((a, b) => a.slot - b.slot); },
    async updateOffice(slot, patch) { patchIn(db.offices, (o) => o.slot === slot, patch); },
    // Same rules as the database store: a move carries the owner's office along, leftovers are removed.
    async claimOffice(slot, userId) {
      const target = db.offices.find((o) => o.slot === slot);
      if (!target) return 'taken';
      if (target.ownerId) return target.ownerId === userId ? 'claimed' : 'taken';
      const previous = db.offices.find((o) => o.ownerId === userId);
      const channel = `office:${slot}`;
      db.messages = db.messages.filter((m) => m.channel !== channel);
      db.invites = db.invites.filter((i) => i.slot !== slot);
      db.visits = db.visits.filter((v) => v.slot !== slot);
      if (previous) {
        db.messages.forEach((m) => { if (m.channel === `office:${previous.slot}`) m.channel = channel; });
        db.invites.forEach((i) => { if (i.slot === previous.slot) i.slot = slot; });
        db.visits.forEach((v) => { if (v.slot === previous.slot) v.slot = slot; });
        Object.assign(target, { glass: previous.glass, locked: previous.locked, focus: previous.focus, isPublic: previous.isPublic });
        Object.assign(previous, { ownerId: null, ...OFFICE_DEFAULTS });
      } else {
        Object.assign(target, OFFICE_DEFAULTS);
      }
      target.ownerId = userId;
      return 'claimed';
    },
    async addVisit(slot, visitorId) { db.visits.push({ id: uuid(), slot, visitorId, visitedAt: now() }); },
    async listVisits(slot, since) { return clone(db.visits.filter((v) => v.slot === slot && v.visitedAt >= since)); },
    async listSwapRequests(userId) { return clone(db.swaps.filter((s) => s.fromUserId === userId || s.toUserId === userId)); },
    async createSwapRequest(fromUserId, toUserId) { const x: SwapRequest = { id: uuid(), fromUserId, toUserId, status: 'pending', createdAt: now() }; db.swaps.push(x); return clone(x); },
    async updateSwapRequest(id, status) { return clone(patchIn(db.swaps, (s) => s.id === id, { status }) ?? null); },
    async listInvites(userId) { return clone(db.invites.filter((i) => i.inviterId === userId || i.inviteeId === userId)); },
    async createInvite(i) { const x: ChatInvite = { ...i, id: uuid(), status: 'pending', createdAt: now() }; db.invites.push(x); return clone(x); },
    async updateInvite(id, status) { return clone(patchIn(db.invites, (i) => i.id === id, { status }) ?? null); },

    async purge(visitsBefore, notificationsBefore, todosBefore) {
      const v = db.visits.length, n = db.notifications.length, t = db.todos.length;
      db.visits = db.visits.filter((x) => x.visitedAt >= visitsBefore);
      db.notifications = db.notifications.filter((x) => !x.readAt || x.readAt >= notificationsBefore);
      db.todos = db.todos.filter((x) => !x.clearedAt || x.clearedAt >= todosBefore);
      return { visits: v - db.visits.length, notifications: n - db.notifications.length, todos: t - db.todos.length };
    },
  };
}
