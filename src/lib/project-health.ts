import type { Issue, Milestone, Project, Task } from '@/lib/data/types';
import { addDays } from '@/lib/todos';
import { zonedDate } from '@/lib/format';

// Numbers behind the project command center. Dates are YYYY-MM-DD in the team's time zone.

export const isOpenIssue = (i: Issue) => i.status === 'open' || i.status === 'in_progress';

export function progress(tasks: Task[]) {
  const done = tasks.filter((t) => t.column === 'done').length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export type Health = 'on_track' | 'at_risk' | 'off_track';
export type HealthReason =
  | { key: 'criticalBugs'; n: number } | { key: 'overdueTasks'; n: number } | { key: 'overdueMilestones'; n: number }
  | { key: 'behindSchedule'; pct: number } | { key: 'pastDeadline' } | { key: 'manyBugs'; n: number };

// On track, at risk or off track, with the reasons that decided it.
export function projectHealth(project: Project, tasks: Task[], issues: Issue[], milestones: Milestone[], today: string): { health: Health; reasons: HealthReason[] } {
  if (project.status === 'done') return { health: 'on_track', reasons: [] };
  const reasons: HealthReason[] = [];
  const open = issues.filter(isOpenIssue);
  const critical = open.filter((i) => i.severity === 3).length;
  const high = open.filter((i) => i.severity >= 2).length;
  const overdueTasks = tasks.filter((t) => t.column !== 'done' && t.dueDate && t.dueDate < today).length;
  const overdueMilestones = milestones.filter((m) => !m.done && m.dueDate && m.dueDate < today).length;
  const { pct } = progress(tasks);
  let lag = 0;
  if (project.dueDate) {
    const start = zonedDate(project.createdAt);
    const span = Math.max(1, dayDiff(start, project.dueDate));
    const elapsed = Math.min(100, Math.max(0, (dayDiff(start, today) / span) * 100));
    lag = Math.round(elapsed - pct);
  }
  const pastDeadline = !!project.dueDate && project.dueDate < today && pct < 100;
  if (critical) reasons.push({ key: 'criticalBugs', n: critical });
  if (pastDeadline) reasons.push({ key: 'pastDeadline' });
  if (overdueMilestones) reasons.push({ key: 'overdueMilestones', n: overdueMilestones });
  if (overdueTasks) reasons.push({ key: 'overdueTasks', n: overdueTasks });
  if (lag > 15) reasons.push({ key: 'behindSchedule', pct: lag });
  if (high >= 3) reasons.push({ key: 'manyBugs', n: high });
  const severe = pastDeadline || overdueMilestones > 0 || lag > 35 || (critical > 0 && overdueTasks >= 3);
  return { health: severe ? 'off_track' : reasons.length ? 'at_risk' : 'on_track', reasons };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type AttentionItem =
  | { kind: 'issue'; id: string; title: string; severity: number; status: Issue['status'] }
  | { kind: 'task'; id: string; title: string; dueDate: string }
  | { kind: 'milestone'; id: string; title: string; dueDate: string };

// What needs someone now: open critical/high bugs first, then overdue milestones and tasks.
export function needsAttention(tasks: Task[], issues: Issue[], milestones: Milestone[], today: string, limit = 6): AttentionItem[] {
  const out: AttentionItem[] = [
    ...issues.filter((i) => isOpenIssue(i) && i.severity >= 2).sort((a, b) => b.severity - a.severity || a.createdAt.localeCompare(b.createdAt))
      .map((i) => ({ kind: 'issue' as const, id: i.id, title: i.title, severity: i.severity, status: i.status })),
    ...milestones.filter((m) => !m.done && m.dueDate && m.dueDate < today).map((m) => ({ kind: 'milestone' as const, id: m.id, title: m.title, dueDate: m.dueDate! })),
    ...tasks.filter((t) => t.column !== 'done' && t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, dueDate: t.dueDate! })),
  ];
  return out.slice(0, limit);
}

// Per day for the last `days` days: tasks finished, bugs reported and bugs fixed.
export function activityTrend(tasks: Task[], issues: Issue[], today: string, days = 14) {
  const list = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const count = (dates: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const d of dates) if (d) { const k = zonedDate(d); m.set(k, (m.get(k) ?? 0) + 1); }
    return list.map((d) => m.get(d) ?? 0);
  };
  return {
    days: list,
    done: count(tasks.filter((t) => t.column === 'done').map((t) => t.updatedAt)),
    reported: count(issues.map((i) => i.createdAt)),
    fixed: count(issues.map((i) => i.resolvedAt)),
  };
}

// Open tasks and open bugs per member (who is carrying what).
export function workload(memberIds: string[], tasks: Task[], issues: Issue[]) {
  return memberIds.map((id) => ({
    id,
    tasks: tasks.filter((t) => t.assigneeId === id && t.column !== 'done').length,
    bugs: issues.filter((i) => i.assigneeId === id && isOpenIssue(i)).length,
  }));
}
