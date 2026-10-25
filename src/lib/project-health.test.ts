import { it, expect } from 'vitest';
import { progress, projectHealth, needsAttention, activityTrend, workload } from './project-health';
import type { Issue, Milestone, Project, Task } from '@/lib/data/types';

const today = '2026-10-24';
const project = (o: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', description: '', managerId: null, status: 'active', dueDate: null, createdAt: '2026-10-01T08:00:00Z', ...o });
const task = (id: string, o: Partial<Task> = {}): Task => ({
  id, projectId: 'p', title: id, description: '', column: 'in_progress', tags: [], assigneeId: null, needsVolunteer: false, startDate: null, dueDate: null,
  position: 0, createdBy: null, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z', ...o,
});
const issue = (id: string, o: Partial<Issue> = {}): Issue => ({
  id, projectId: 'p', kind: 'bug', title: id, description: '', steps: '', severity: 1, status: 'open', reporterId: null, assigneeId: null,
  screenshotIds: [], createdAt: '2026-10-20T08:00:00Z', updatedAt: '2026-10-20T08:00:00Z', resolvedAt: null, ...o,
});
const milestone = (id: string, o: Partial<Milestone> = {}): Milestone => ({ id, projectId: 'p', title: id, dueDate: null, done: false, createdAt: '', ...o });

it('measures progress from finished tasks', () => {
  expect(progress([])).toEqual({ done: 0, total: 0, pct: 0 });
  expect(progress([task('a', { column: 'done' }), task('b'), task('c')])).toEqual({ done: 1, total: 3, pct: 33 });
});

it('rates project health with its reasons', () => {
  expect(projectHealth(project(), [task('a')], [], [], today)).toEqual({ health: 'on_track', reasons: [] });
  const risky = projectHealth(project(), [task('a', { dueDate: '2026-10-20' })], [issue('x', { severity: 3 })], [], today);
  expect(risky.health).toBe('at_risk');
  expect(risky.reasons).toEqual([{ key: 'criticalBugs', n: 1 }, { key: 'overdueTasks', n: 1 }]);
  expect(projectHealth(project({ dueDate: '2026-10-20' }), [task('a')], [], [], today).health).toBe('off_track');
  expect(projectHealth(project(), [task('a')], [], [milestone('m', { dueDate: '2026-10-01' })], today).health).toBe('off_track');
  // Fixed bugs and finished projects do not count against it.
  expect(projectHealth(project(), [], [issue('x', { severity: 3, status: 'fixed' })], [], today).health).toBe('on_track');
  expect(projectHealth(project({ status: 'done', dueDate: '2026-01-01' }), [task('a')], [], [], today).health).toBe('on_track');
  // 23 of 30 days gone with nothing done: far behind.
  expect(projectHealth(project({ dueDate: '2026-10-31' }), [task('a'), task('b')], [], [], today).reasons[0]).toEqual({ key: 'behindSchedule', pct: 77 });
});

it('lists what needs attention, most serious first', () => {
  const items = needsAttention(
    [task('late', { dueDate: '2026-10-22' }), task('done', { column: 'done', dueDate: '2026-10-01' }), task('later', { dueDate: '2026-11-01' })],
    [issue('high', { severity: 2 }), issue('crit', { severity: 3 }), issue('low', { severity: 0 }), issue('fixed', { severity: 3, status: 'fixed' })],
    [milestone('ms', { dueDate: '2026-10-10' })], today,
  );
  expect(items.map((i) => i.id)).toEqual(['crit', 'high', 'ms', 'late']);
});

it('counts daily activity and workload', () => {
  const tr = activityTrend([task('a', { column: 'done', updatedAt: '2026-10-24T09:00:00Z' })],
    [issue('x', { createdAt: '2026-10-23T09:00:00Z', resolvedAt: '2026-10-24T10:00:00Z' })], today, 3);
  expect(tr).toEqual({ days: ['2026-10-22', '2026-10-23', '2026-10-24'], done: [0, 0, 1], reported: [0, 1, 0], fixed: [0, 0, 1] });
  expect(workload(['u'], [task('a', { assigneeId: 'u' }), task('b', { assigneeId: 'u', column: 'done' })], [issue('x', { assigneeId: 'u' })]))
    .toEqual([{ id: 'u', tasks: 1, bugs: 1 }]);
});
