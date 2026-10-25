'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { AlertOctagon, AlertTriangle, ArrowUp, Minus, CircleDot, Loader, CheckCircle2, Archive, Bug, Wrench } from 'lucide-react';
import type { IssueKind, IssueStatus, Severity } from '@/lib/data/types';
import type { Health } from '@/lib/project-health';

// Status colours (reserved for state, always with an icon and a label).
const SEVERITY = [
  { icon: Minus, cls: 'bg-surface-2 text-muted' },
  { icon: ArrowUp, cls: 'bg-[#fdf3d8] text-[#8a6100] dark:bg-[#3a3016] dark:text-[#f0c766]' },
  { icon: AlertTriangle, cls: 'bg-accent-soft text-[#b9531a] dark:text-accent' },
  { icon: AlertOctagon, cls: 'bg-[#fde4e4] text-[#c24141] dark:bg-[#3d2121] dark:text-[#f2a0a0]' },
];

export function SeverityBadge({ severity }: { severity: Severity }) {
  const t = useTranslations('command.sev');
  const s = SEVERITY[severity];
  return <span className={clsx('chip shrink-0 gap-1', s.cls)}><s.icon className="size-3.5" />{t(String(severity) as '0')}</span>;
}

const STATUS: Record<IssueStatus, { icon: typeof CircleDot; cls: string }> = {
  open: { icon: CircleDot, cls: 'bg-accent-soft text-[#b9531a] dark:text-accent' },
  in_progress: { icon: Loader, cls: 'bg-[#e6eefb] text-[#3567c4] dark:bg-[#1c2636] dark:text-[#8fb3f2]' },
  fixed: { icon: CheckCircle2, cls: 'bg-brand-soft text-brand' },
  closed: { icon: Archive, cls: 'bg-surface-2 text-muted' },
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const t = useTranslations('command.istatus');
  const s = STATUS[status];
  return <span className={clsx('chip shrink-0 gap-1', s.cls)}><s.icon className="size-3.5" />{t(status)}</span>;
}

export function KindBadge({ kind }: { kind: IssueKind }) {
  const t = useTranslations('command.kind');
  const Icon = kind === 'bug' ? Bug : Wrench;
  return <span className="chip shrink-0 gap-1 border border-line text-muted"><Icon className="size-3.5" />{t(kind)}</span>;
}

const HEALTH: Record<Health, string> = {
  on_track: 'bg-brand-soft text-brand',
  at_risk: 'bg-accent-soft text-[#b9531a] dark:text-accent',
  off_track: 'bg-[#fde4e4] text-[#c24141] dark:bg-[#3d2121] dark:text-[#f2a0a0]',
};
const HEALTH_DOT: Record<Health, string> = { on_track: 'bg-brand', at_risk: 'bg-accent', off_track: 'bg-danger' };

export function HealthBadge({ health }: { health: Health }) {
  const t = useTranslations('command.health');
  return <span className={clsx('chip gap-1.5', HEALTH[health])}><span className={clsx('size-2 rounded-full', HEALTH_DOT[health])} />{t(health)}</span>;
}
