export type Role = 'admin' | 'member';
export type UserStatus = 'online' | 'busy' | 'focus';
export type TaskColumn = 'idea' | 'in_progress' | 'review' | 'done';
export type RequestStatus = 'pending' | 'accepted' | 'declined';

export const TASK_COLUMNS: TaskColumn[] = ['idea', 'in_progress', 'review', 'done'];

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  jobTitle: string;
  role: Role;
  characterId: string;
  status: UserStatus;
  mustChangePassword: boolean;
  tutorialDone: boolean;
  createdAt: string;
}

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'done';
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'paused', 'done'];

export interface Project {
  id: string;
  name: string;
  description: string;
  managerId: string | null;
  status: ProjectStatus;
  dueDate: string | null;
  goal: string; // what "done" means for the project
  startDate: string | null;
  priority: number; // 0 low, 1 medium, 2 high, 3 critical
  icon: string; // one of PROJECT_ICONS (components/icons/project)
  color: string; // one of PROJECT_COLORS
  memberIds: string[]; // the project team (the manager counts too)
  createdAt: string;
}
export type NewProject = Pick<Project, 'name' | 'description' | 'managerId'> & Partial<Omit<Project, 'id' | 'createdAt' | 'name' | 'description' | 'managerId'>>;
export const PROJECT_DEFAULTS = { status: 'active', dueDate: null, goal: '', startDate: null, priority: 1, icon: 'rocket', color: 'green', memberIds: [] as string[] } as const satisfies Partial<Project>;

// Project command center.
export type IssueKind = 'bug' | 'defect';
export type IssueStatus = 'open' | 'in_progress' | 'fixed' | 'closed';
export type Severity = 0 | 1 | 2 | 3; // low, medium, high, critical
export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'fixed', 'closed'];

export interface Issue {
  id: string;
  projectId: string;
  kind: IssueKind;
  title: string;
  description: string;
  steps: string;
  severity: Severity;
  status: IssueStatus;
  reporterId: string | null;
  assigneeId: string | null;
  screenshotIds: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}
export type NewIssue = Pick<Issue, 'projectId' | 'kind' | 'title' | 'description' | 'steps' | 'severity' | 'reporterId' | 'assigneeId' | 'screenshotIds'>;
export type IssuePatch = Partial<Pick<Issue, 'title' | 'description' | 'steps' | 'severity' | 'status' | 'assigneeId' | 'kind' | 'screenshotIds' | 'resolvedAt'>>;

export interface IssueComment { id: string; issueId: string; authorId: string | null; body: string; createdAt: string }

export type IdeaKind = 'idea' | 'upgrade';
export type IdeaStatus = 'new' | 'review' | 'planned' | 'done' | 'rejected';
export const IDEA_STATUSES: IdeaStatus[] = ['new', 'review', 'planned', 'done', 'rejected'];

export interface ProjectIdea {
  id: string;
  projectId: string;
  kind: IdeaKind;
  title: string;
  description: string;
  status: IdeaStatus;
  authorId: string | null;
  taskId: string | null;
  createdAt: string;
  voterIds: string[];
}

export interface Milestone { id: string; projectId: string; title: string; dueDate: string | null; done: boolean; createdAt: string }

export interface ChecklistItem { text: string; done: boolean }
export const TASK_PRIORITIES = [0, 1, 2] as const; // normal, high, urgent
export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  column: TaskColumn;
  tags: string[];
  assigneeId: string | null;
  needsVolunteer: boolean;
  priority: number; // 0 normal, 1 high, 2 urgent
  checklist: ChecklistItem[]; // small steps of the task, ticked off on its card
  milestoneId: string | null; // the project phase it belongs to
  effort: number; // 0 not set, 1 small, 2 medium, 3 large, 4 huge
  blockedReason: string; // why it is stuck; empty when it is not blocked
  startDate: string | null;
  dueDate: string | null;
  position: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRole {
  id: string;
  projectId: string;
  name: string;
  description: string;
  volunteerId: string | null;
  createdAt: string;
}

export interface FileMeta {
  id: string;
  name: string;
  storagePath: string;
  size: number;
  mime: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Reaction {
  userId: string;
  emoji: string;
}

// 'text' a plain message; 'decision' a message the team marked as decided; 'task'/'issue' a card for a
// task or bug made from the chat (refId); 'system' a line the app writes itself (body is its JSON data).
export type MessageKind = 'text' | 'decision' | 'task' | 'issue' | 'system';
export const MESSAGE_KINDS: MessageKind[] = ['text', 'decision', 'task', 'issue', 'system'];

export interface Message {
  id: string;
  channel: string;
  authorId: string | null;
  body: string;
  fileId: string | null;
  replyToId: string | null;
  forwardedFrom: string | null; // the original author of a forwarded message
  kind: MessageKind;
  refId: string | null;
  editedAt: string | null;
  pinnedAt: string | null;
  createdAt: string;
  reactions: Reaction[];
}
export type NewMessage = Pick<Message, 'channel' | 'authorId' | 'body' | 'fileId'> & Partial<Pick<Message, 'replyToId' | 'forwardedFrom' | 'kind' | 'refId'>>;
export type MessagePatch = Partial<Pick<Message, 'body' | 'editedAt' | 'pinnedAt' | 'kind' | 'refId'>>;
export const MESSAGE_DEFAULTS = { replyToId: null, forwardedFrom: null, kind: 'text', refId: null, editedAt: null, pinnedAt: null } as const satisfies Partial<Message>;

// One chat in the list: its newest message, how many arrived since the member last read it, and when that was.
export interface ChatSummary { channel: string; last: Message | null; unread: number; readAt: string | null }
export interface ChatRead { userId: string; channel: string; readAt: string }

export interface Poll {
  id: string;
  question: string;
  taskId: string | null;
  createdBy: string | null;
  closesAt: string;
  closed: boolean;
  decision: string | null;
  createdAt: string;
}

export interface PollVote {
  pollId: string;
  userId: string;
  score: number;
}

export interface FocusItem {
  id: string;
  userId: string;
  day: string;
  text: string;
  done: boolean;
}

export type { TodoCategory, TodoStats } from '@/lib/todo-game';
export type { GameScore } from '@/lib/arcade';
import type { GameScore } from '@/lib/arcade';
import type { TodoCategory, TodoStats } from '@/lib/todo-game';

export interface Todo {
  id: string;
  userId: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  due: string | null; // YYYY-MM-DD, team time zone
  priority: 0 | 1 | 2;
  starred: boolean;
  clearedAt: string | null; // done and cleared from the list (kept for the streak)
  category: TodoCategory;
  xp: number; // XP given when it was finished
  createdAt: string;
}
export type TodoPatch = Partial<Pick<Todo, 'title' | 'done' | 'doneAt' | 'due' | 'priority' | 'starred' | 'category' | 'xp'>>;

// A meeting in the conference room (endedAt null while it runs), the time each member spent in it, a
// member's private notes from it, and a note rewritten by its author for a project (seen by everyone).
export interface Meeting {
  id: string;
  title: string;
  purpose: string;
  projectId: string | null;
  startedBy: string | null;
  startedAt: string;
  endedAt: string | null;
}
export interface MeetingAttendance {
  meetingId: string;
  userId: string;
  firstJoinedAt: string;
  joinedAt: string | null; // start of the current stay in the room, null when out
  seenAt: string; // the current stay was last confirmed (see lib/meetings)
  seconds: number; // finished stays
}
export type NoteKind = 'note' | 'idea';
export interface MeetingNote {
  id: string;
  meetingId: string;
  userId: string;
  kind: NoteKind;
  body: string;
  createdAt: string;
  updatedAt: string;
}
export interface SharedNote {
  id: string;
  noteId: string | null;
  meetingId: string | null;
  projectId: string;
  authorId: string | null;
  kind: NoteKind;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
export type MeetingPatch = Partial<Pick<Meeting, 'title' | 'purpose' | 'projectId' | 'endedAt'>>;

// Conference room light (brightness, warmth) and glass frosting, each 0–100.
export interface RoomSettings { light: number; warmth: number; frost: number }
export interface Room extends RoomSettings { id: string; updatedAt: string }

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  createdBy: string | null;
}

// Team pulse: announcements for everyone, kudos to a teammate, and one standup per member and day.
export type PostKind = 'announcement' | 'kudos' | 'standup';
export const KUDOS_BADGES = ['thanks', 'teamwork', 'idea', 'quality', 'speed', 'help'] as const;
export type KudosBadge = (typeof KUDOS_BADGES)[number];
export interface Post {
  id: string;
  kind: PostKind;
  authorId: string | null;
  targetId: string | null; // kudos: who it is for
  body: string; // the announcement, the kudos note, or the standup's plan for today
  did: string; // standup: what was done since the last one
  blockers: string; // standup: what is in the way
  badge: string; // kudos: one of KUDOS_BADGES
  pinned: boolean; // announcements an admin keeps at the top
  day: string | null; // standup: its day (YYYY-MM-DD)
  createdAt: string;
}
export type NewPost = Pick<Post, 'kind' | 'authorId' | 'body'> & Partial<Pick<Post, 'targetId' | 'did' | 'blockers' | 'badge' | 'pinned' | 'day'>>;

export interface Notification {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface Office {
  slot: number;
  ownerId: string | null;
  wallColor: 'orange' | 'teal';
  glass: 'clear' | 'frosted';
  locked: boolean;
  focus: boolean;
  isPublic: boolean;
}

// Settings of an office nobody owns (also what a newly claimed office starts with).
export const OFFICE_DEFAULTS = { glass: 'clear', locked: false, focus: false, isPublic: false } as const satisfies Partial<Office>;

export interface OfficeVisit {
  id: string;
  slot: number;
  visitorId: string;
  visitedAt: string;
}

export interface SwapRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: RequestStatus;
  createdAt: string;
}

export interface ChatInvite {
  id: string;
  slot: number;
  inviterId: string;
  inviteeId: string;
  status: RequestStatus;
  createdAt: string;
}

export type NewTask = Pick<Task, 'title'> & Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

export interface DataStore {
  listProfiles(): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | null>;
  getProfileByUsername(username: string): Promise<Profile | null>;
  insertProfile(p: Profile): Promise<void>;
  updateProfile(id: string, patch: Partial<Omit<Profile, 'id' | 'createdAt'>>): Promise<void>;
  deleteProfile(id: string): Promise<void>;

  listProjects(): Promise<Project[]>;
  createProject(p: NewProject): Promise<Project>;
  updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  createTask(t: NewTask): Promise<Task>;
  updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<void>;
  deleteTask(id: string): Promise<void>;

  listRoles(): Promise<ProjectRole[]>;
  createRole(r: Omit<ProjectRole, 'id' | 'createdAt' | 'volunteerId'>): Promise<ProjectRole>;
  updateRole(id: string, patch: Partial<Pick<ProjectRole, 'volunteerId' | 'name' | 'description'>>): Promise<void>;
  deleteRole(id: string): Promise<void>;

  listFiles(): Promise<FileMeta[]>;
  getFile(id: string): Promise<FileMeta | null>;
  createFile(f: Omit<FileMeta, 'id' | 'createdAt'>): Promise<FileMeta>;
  deleteFile(id: string): Promise<void>;

  // The newest `limit` messages of a chat (oldest first), or the ones before `beforeIso` (older pages).
  listMessages(channel: string, limit: number, beforeIso?: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | null>;
  createMessage(m: NewMessage): Promise<Message>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  toggleReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  listPinnedMessages(channel: string): Promise<Message[]>;
  // Messages of one kind in a chat, newest first (e.g. a project's decisions).
  listMessagesOfKind(channel: string, kind: MessageKind, limit: number): Promise<Message[]>;
  searchMessages(channels: string[], query: string, limit: number): Promise<Message[]>;
  chatSummaries(userId: string, channels: string[]): Promise<ChatSummary[]>;
  listChatReads(channel: string): Promise<ChatRead[]>;
  markChatRead(userId: string, channel: string, atIso: string): Promise<void>;

  listPolls(): Promise<Poll[]>;
  createPoll(p: Pick<Poll, 'question' | 'taskId' | 'createdBy' | 'closesAt'>): Promise<Poll>;
  updatePoll(id: string, patch: Partial<Pick<Poll, 'closed' | 'decision'>>): Promise<void>;
  listVotes(pollId?: string): Promise<PollVote[]>;
  upsertVote(v: PollVote): Promise<void>;

  listFocus(userId: string, day: string): Promise<FocusItem[]>;
  createFocus(f: Omit<FocusItem, 'id' | 'done'>): Promise<FocusItem>;
  updateFocus(id: string, userId: string, patch: Partial<Pick<FocusItem, 'done' | 'text'>>): Promise<void>;
  deleteFocus(id: string, userId: string): Promise<void>;

  // Open and done to-dos, plus cleared ones finished since `doneSinceIso` (for the streak).
  listTodos(userId: string, doneSinceIso: string): Promise<Todo[]>;
  createTodo(t: Pick<Todo, 'userId' | 'title' | 'due' | 'priority' | 'starred'> & Partial<Pick<Todo, 'category'>>): Promise<Todo>;
  getTodo(id: string, userId: string): Promise<Todo | null>;
  getTodoStats(userId: string): Promise<TodoStats>;
  setTodoStats(userId: string, stats: TodoStats): Promise<void>;
  updateTodo(id: string, userId: string, patch: TodoPatch): Promise<void>;
  deleteTodo(id: string, userId: string): Promise<void>;
  clearDoneTodos(userId: string): Promise<void>;
  countOpenTodos(userId: string): Promise<number>;

  // Project command center (projectId omitted: every project).
  listIssues(projectId?: string): Promise<Issue[]>;
  createIssue(i: NewIssue): Promise<Issue>;
  updateIssue(id: string, patch: IssuePatch): Promise<void>;
  deleteIssue(id: string): Promise<void>;
  listIssueComments(issueIds: string[]): Promise<IssueComment[]>;
  createIssueComment(c: Pick<IssueComment, 'issueId' | 'authorId' | 'body'>): Promise<IssueComment>;
  listIdeas(projectId?: string): Promise<ProjectIdea[]>;
  createIdea(i: Pick<ProjectIdea, 'projectId' | 'kind' | 'title' | 'description' | 'authorId'>): Promise<ProjectIdea>;
  updateIdea(id: string, patch: Partial<Pick<ProjectIdea, 'title' | 'description' | 'status' | 'kind' | 'taskId'>>): Promise<void>;
  deleteIdea(id: string): Promise<void>;
  toggleIdeaVote(ideaId: string, userId: string): Promise<void>;
  listMilestones(projectId?: string): Promise<Milestone[]>;
  createMilestone(m: Pick<Milestone, 'projectId' | 'title' | 'dueDate'>): Promise<Milestone>;
  updateMilestone(id: string, patch: Partial<Pick<Milestone, 'title' | 'dueDate' | 'done'>>): Promise<void>;
  deleteMilestone(id: string): Promise<void>;

  // Meetings (newest first), attendance, one's own notes and the notes shared with projects.
  listMeetings(limit: number): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | null>;
  getOpenMeeting(): Promise<Meeting | null>; // the newest meeting not ended
  createMeeting(m: Pick<Meeting, 'title' | 'purpose' | 'projectId' | 'startedBy'>): Promise<Meeting>;
  updateMeeting(id: string, patch: MeetingPatch): Promise<void>;
  listAttendance(meetingIds: string[]): Promise<MeetingAttendance[]>;
  setAttendance(a: MeetingAttendance): Promise<void>;
  listMeetingNotes(userId: string): Promise<MeetingNote[]>;
  createMeetingNote(n: Pick<MeetingNote, 'meetingId' | 'userId' | 'kind' | 'body'>): Promise<MeetingNote>;
  updateMeetingNote(id: string, userId: string, patch: Partial<Pick<MeetingNote, 'kind' | 'body'>>): Promise<void>;
  deleteMeetingNote(id: string, userId: string): Promise<void>;
  listSharedNotes(filter: { projectId?: string; meetingIds?: string[] }): Promise<SharedNote[]>;
  // Creates or replaces the author's shared version of a note (one per note).
  shareNote(n: Pick<SharedNote, 'noteId' | 'meetingId' | 'projectId' | 'authorId' | 'kind' | 'title' | 'body'>): Promise<SharedNote>;
  deleteSharedNote(id: string, authorId: string): Promise<void>;

  // Team pulse (newest first). A member's standup for a day is replaced, not repeated.
  listPosts(sinceIso: string, limit: number): Promise<Post[]>;
  getPost(id: string): Promise<Post | null>;
  createPost(p: NewPost): Promise<Post>;
  saveStandup(authorId: string, day: string, text: Pick<Post, 'body' | 'did' | 'blockers'>): Promise<Post>;
  updatePost(id: string, patch: Partial<Pick<Post, 'pinned' | 'body'>>): Promise<void>;
  deletePost(id: string): Promise<void>;

  // Game room records. `reportGame` adds a finished round in one step: best = max(best, score) + points.
  listGameScores(): Promise<GameScore[]>;
  reportGame(userId: string, game: string, d: { score: number; points: number; wins: number }): Promise<GameScore>;

  getRoom(id: string): Promise<Room | null>;
  updateRoom(id: string, patch: Partial<RoomSettings>): Promise<Room>;

  listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]>;
  createEvent(e: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;

  listNotifications(userId: string): Promise<Notification[]>;
  createNotification(n: Pick<Notification, 'userId' | 'kind' | 'payload'>): Promise<void>;
  markNotificationsRead(userId: string, ids?: string[]): Promise<void>;

  listOffices(): Promise<Office[]>;
  updateOffice(slot: number, patch: Partial<Omit<Office, 'slot' | 'wallColor'>>): Promise<void>;
  // Takes an empty office for userId in one step ('taken' if someone else got it first). See db-store.
  claimOffice(slot: number, userId: string): Promise<'claimed' | 'taken'>;
  addVisit(slot: number, visitorId: string): Promise<void>;
  listVisits(slot: number, sinceIso: string): Promise<OfficeVisit[]>;
  listSwapRequests(userId: string): Promise<SwapRequest[]>;
  createSwapRequest(fromUserId: string, toUserId: string): Promise<SwapRequest>;
  updateSwapRequest(id: string, status: RequestStatus): Promise<SwapRequest | null>;
  listInvites(userId: string): Promise<ChatInvite[]>;
  createInvite(i: Pick<ChatInvite, 'slot' | 'inviterId' | 'inviteeId'>): Promise<ChatInvite>;
  updateInvite(id: string, status: RequestStatus): Promise<ChatInvite | null>;

  purge(visitsBeforeIso: string, readNotificationsBeforeIso: string, clearedTodosBeforeIso: string): Promise<{ visits: number; notifications: number; todos: number }>;
}
