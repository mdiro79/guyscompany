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
  createdAt: string;
}

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

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  column: TaskColumn;
  tags: string[];
  assigneeId: string | null;
  needsVolunteer: boolean;
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

export interface Message {
  id: string;
  channel: string;
  authorId: string | null;
  body: string;
  fileId: string | null;
  createdAt: string;
  reactions: Reaction[];
}

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
  createProject(p: Pick<Project, 'name' | 'description' | 'managerId'> & Partial<Pick<Project, 'status' | 'dueDate'>>): Promise<Project>;
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

  listMessages(channel: string, limit: number): Promise<Message[]>;
  createMessage(m: Pick<Message, 'channel' | 'authorId' | 'body' | 'fileId'>): Promise<Message>;
  toggleReaction(messageId: string, userId: string, emoji: string): Promise<void>;

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
