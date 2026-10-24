import {
  pgTable, uuid, text, boolean, integer, smallint, timestamp, date, jsonb, primaryKey, pgEnum, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const roleEnum = pgEnum('user_role', ['admin', 'member']);
export const statusEnum = pgEnum('user_status', ['online', 'busy', 'focus']);
export const columnEnum = pgEnum('task_column', ['idea', 'in_progress', 'review', 'done']);
export const glassEnum = pgEnum('glass_mode', ['clear', 'frosted']);
export const wallEnum = pgEnum('wall_color', ['orange', 'teal']);
export const requestStatusEnum = pgEnum('request_status', ['pending', 'accepted', 'declined']);

// One row per Supabase auth user; id equals auth.users.id.
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  jobTitle: text('job_title').notNull().default(''),
  role: roleEnum('role').notNull().default('member'),
  characterId: text('character_id').notNull().default('humans-casual2-female'),
  status: statusEnum('status').notNull().default('online'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  tutorialDone: boolean('tutorial_done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  managerId: uuid('manager_id').references(() => profiles.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'), // planning | active | paused | done
  dueDate: date('due_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('project_status', sql`${t.status} in ('planning', 'active', 'paused', 'done')`)]);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  column: columnEnum('column').notNull().default('idea'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
  needsVolunteer: boolean('needs_volunteer').notNull().default(false),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  position: integer('position').notNull().default(0),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tasks_column_idx').on(t.column)]);

// Project roles that need a volunteer.
export const projectRoles = pgTable('project_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  volunteerId: uuid('volunteer_id').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  storagePath: text('storage_path').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// channel: 'team' or 'office:<slot>' for private office chats.
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel').notNull().default('team'),
  authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
  body: text('body').notNull().default(''),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('messages_channel_created_idx').on(t.channel, t.createdAt)]);

export const reactions = pgTable('reactions', {
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
}, (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]);

// Scores stay hidden until the poll is closed.
export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  closed: boolean('closed').notNull().default(false),
  // On a tie at the deadline the project manager decides.
  decision: text('decision'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pollVotes = pgTable('poll_votes', {
  pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
}, (t) => [
  primaryKey({ columns: [t.pollId, t.userId] }),
  check('score_range', sql`${t.score} between 1 and 10`),
]);

export const focusItems = pgTable('focus_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  text: text('text').notNull(),
  done: boolean('done').notNull().default(false),
});

// Personal to-do list (private to its owner). Cleared done items stay a while for the streak, then the cleanup cron removes them.
export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  doneAt: timestamp('done_at', { withTimezone: true }),
  due: date('due'),
  priority: smallint('priority').notNull().default(0),
  starred: boolean('starred').notNull().default(false),
  clearedAt: timestamp('cleared_at', { withTimezone: true }),
  category: text('category').notNull().default('personal'), // personal | work | learning | health
  xp: smallint('xp').notNull().default(0), // XP given when it was finished (taken back if un-ticked)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('todos_user_idx').on(t.userId), check('priority_range', sql`${t.priority} between 0 and 2`),
  check('todo_category', sql`${t.category} in ('personal', 'work', 'learning', 'health')`)]);

// The to-do game per member: total XP and the counters behind the achievements (kept when old
// to-dos are cleaned up).
export const todoStats = pgTable('todo_stats', {
  userId: uuid('user_id').primaryKey().references(() => profiles.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  counters: jsonb('counters').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Project command center: bugs and defects (with screenshots), their discussion, ideas and upgrades
// with member upvotes, and milestones.
export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('bug'), // bug | defect
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  steps: text('steps').notNull().default(''),
  severity: smallint('severity').notNull().default(1), // 0 low, 1 medium, 2 high, 3 critical
  status: text('status').notNull().default('open'), // open | in_progress | fixed | closed
  reporterId: uuid('reporter_id').references(() => profiles.id, { onDelete: 'set null' }),
  assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
  screenshotIds: uuid('screenshot_ids').array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [
  index('issues_project_idx').on(t.projectId),
  check('issue_kind', sql`${t.kind} in ('bug', 'defect')`),
  check('issue_status', sql`${t.status} in ('open', 'in_progress', 'fixed', 'closed')`),
  check('issue_severity', sql`${t.severity} between 0 and 3`),
]);

export const issueComments = pgTable('issue_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('issue_comments_issue_idx').on(t.issueId)]);

export const projectIdeas = pgTable('project_ideas', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('idea'), // idea | upgrade
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('new'), // new | review | planned | done | rejected
  authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('project_ideas_project_idx').on(t.projectId),
  check('idea_kind', sql`${t.kind} in ('idea', 'upgrade')`),
  check('idea_status', sql`${t.status} in ('new', 'review', 'planned', 'done', 'rejected')`),
]);

export const ideaVotes = pgTable('idea_votes', {
  ideaId: uuid('idea_id').notNull().references(() => projectIdeas.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.ideaId, t.userId] })]);

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueDate: date('due_date'),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('milestones_project_idx').on(t.projectId)]);

// Shared room settings changed from a wall panel (the conference room: light and glass frosting, 0–100).
export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  light: smallint('light').notNull().default(100),
  warmth: smallint('warmth').notNull().default(40),
  frost: smallint('frost').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('room_ranges', sql`${t.light} between 0 and 100 and ${t.warmth} between 0 and 100 and ${t.frost} between 0 and 100`)]);

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Four fixed office slots; wall colour belongs to the slot.
export const offices = pgTable('offices', {
  slot: integer('slot').primaryKey(),
  ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'set null' }),
  wallColor: wallEnum('wall_color').notNull(),
  glass: glassEnum('glass').notNull().default('clear'),
  locked: boolean('locked').notNull().default(false),
  focus: boolean('focus').notNull().default(false),
  isPublic: boolean('is_public').notNull().default(false),
});

export const officeVisits = pgTable('office_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  slot: integer('slot').notNull().references(() => offices.slot, { onDelete: 'cascade' }),
  visitorId: uuid('visitor_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
});

export const officeSwapRequests = pgTable('office_swap_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUserId: uuid('from_user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  status: requestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const privateChatInvites = pgTable('private_chat_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  slot: integer('slot').notNull().references(() => offices.slot, { onDelete: 'cascade' }),
  inviterId: uuid('inviter_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  inviteeId: uuid('invitee_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  status: requestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
