'use client';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import {
  Rocket, Box, Smartphone, Globe, Gamepad2, Palette, Megaphone, FlaskConical, Clapperboard, BookOpen, BarChart3, Wrench, Heart, Music, ShoppingBag, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectStatus, TaskColumn } from '@/lib/data/types';
import {
  IdeaGlyph, ProgressGlyph, ReviewGlyph, DoneGlyph, LevelGlyph, UrgentGlyph, EffortGlyph, PlanningGlyph, ActiveGlyph, PausedGlyph, TrophyGlyph,
} from './glyphs';
export { PROJECT_ICON_KEYS, PROJECT_COLOR_KEYS } from '@/lib/project-look';

// Colour of an option: soft tile, its border when chosen, and the ink for its icon and label.
export type Tone = 'brand' | 'blue' | 'amber' | 'orange' | 'red' | 'violet' | 'slate' | 'teal';
export const TONE: Record<Tone, { tile: string; ring: string; ink: string }> = {
  brand: { tile: 'bg-brand-soft', ring: 'border-brand/60', ink: 'text-brand' },
  blue: { tile: 'bg-[#e6eefb] dark:bg-[#1c2636]', ring: 'border-[#3567c4]/50', ink: 'text-[#3567c4] dark:text-[#8fb3f2]' },
  amber: { tile: 'bg-[#fdf3d8] dark:bg-[#3a3016]', ring: 'border-[#c98a00]/50', ink: 'text-[#a26a00] dark:text-[#f0c766]' },
  orange: { tile: 'bg-accent-soft', ring: 'border-accent/60', ink: 'text-[#c25a14] dark:text-accent' },
  red: { tile: 'bg-[#fde4e4] dark:bg-[#3d2121]', ring: 'border-[#c24141]/50', ink: 'text-[#c24141] dark:text-[#f2a0a0]' },
  violet: { tile: 'bg-[#ece6fb] dark:bg-[#2b2540]', ring: 'border-[#6d4fc4]/50', ink: 'text-[#6d4fc4] dark:text-[#b9a6f5]' },
  slate: { tile: 'bg-surface-2', ring: 'border-muted/50', ink: 'text-muted' },
  teal: { tile: 'bg-teal-soft', ring: 'border-teal/50', ink: 'text-teal' },
};

export interface OptionStyle { tone: Tone; icon: (cls: string) => ReactNode }

export const COLUMN_STYLE: Record<TaskColumn, OptionStyle> = {
  idea: { tone: 'amber', icon: (c) => <IdeaGlyph className={c} /> },
  in_progress: { tone: 'blue', icon: (c) => <ProgressGlyph className={c} /> },
  review: { tone: 'violet', icon: (c) => <ReviewGlyph className={c} /> },
  done: { tone: 'brand', icon: (c) => <DoneGlyph className={c} /> },
};

export const PRIORITY_STYLE: OptionStyle[] = [
  { tone: 'slate', icon: (c) => <LevelGlyph level={1} className={c} /> },
  { tone: 'orange', icon: (c) => <LevelGlyph level={2} className={c} /> },
  { tone: 'red', icon: (c) => <UrgentGlyph className={c} /> },
];

export const EFFORT_STYLE: OptionStyle[] = [0, 1, 2, 3, 4].map((size) => ({
  tone: (['slate', 'teal', 'teal', 'blue', 'violet'] as Tone[])[size], icon: (c: string) => <EffortGlyph size={size} className={c} />,
}));

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, OptionStyle> = {
  planning: { tone: 'blue', icon: (c) => <PlanningGlyph className={c} /> },
  active: { tone: 'brand', icon: (c) => <ActiveGlyph className={c} /> },
  paused: { tone: 'slate', icon: (c) => <PausedGlyph className={c} /> },
  done: { tone: 'amber', icon: (c) => <TrophyGlyph className={c} /> },
};

// Four levels: a project's priority and a bug's severity.
export const LEVEL4_STYLE: OptionStyle[] = (['slate', 'blue', 'orange', 'red'] as Tone[]).map((tone, i) => ({
  tone, icon: (c: string) => <LevelGlyph level={i + 1} of={4} className={c} />,
}));

/** A small tinted chip with an option's icon and label (cards, lists, chat cards). */
export function OptionChip({ style, label, className, iconOnly }: { style: OptionStyle; label: string; className?: string; iconOnly?: boolean }) {
  const tone = TONE[style.tone];
  return (
    <span title={label} className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full font-medium', iconOnly ? 'size-6 justify-center' : 'px-2 py-0.5 text-xs', tone.tile, tone.ink, className)}>
      {style.icon('size-3.5')}{!iconOnly && label}
    </span>
  );
}

export function ColumnChip({ column, iconOnly, className }: { column: TaskColumn; iconOnly?: boolean; className?: string }) {
  const t = useTranslations('tasks');
  return <OptionChip style={COLUMN_STYLE[column]} label={t(`col_${column}`)} iconOnly={iconOnly} className={className} />;
}

export function PriorityChip({ priority, iconOnly }: { priority: number; iconOnly?: boolean }) {
  const t = useTranslations('tasks');
  const p = Math.max(0, Math.min(2, priority)) as 0 | 1 | 2;
  return <OptionChip style={PRIORITY_STYLE[p]} label={t(`priority${p}`)} iconOnly={iconOnly} />;
}

export function EffortChip({ effort, iconOnly }: { effort: number; iconOnly?: boolean }) {
  const t = useTranslations('tasks');
  if (!effort) return null;
  return <OptionChip style={EFFORT_STYLE[effort]} label={t(`effort${effort as 1}`)} iconOnly={iconOnly} />;
}

export function ProjectStatusChip({ status, iconOnly }: { status: ProjectStatus; iconOnly?: boolean }) {
  const t = useTranslations('command.status');
  return <OptionChip style={PROJECT_STATUS_STYLE[status]} label={t(status)} iconOnly={iconOnly} />;
}

export function ProjectPriorityChip({ priority, iconOnly }: { priority: number; iconOnly?: boolean }) {
  const t = useTranslations('projects.priority');
  const p = Math.max(0, Math.min(3, priority));
  return <OptionChip style={LEVEL4_STYLE[p]} label={t(String(p) as '0')} iconOnly={iconOnly} />;
}

// Project icons and colours (chosen in the project dialog; shown as a small app-like tile).
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  rocket: Rocket, box: Box, app: Smartphone, web: Globe, game: Gamepad2, design: Palette, marketing: Megaphone, megaphone: Megaphone,
  research: FlaskConical, video: Clapperboard, docs: BookOpen, data: BarChart3, tool: Wrench, heart: Heart, music: Music, shop: ShoppingBag, magic: Sparkles,
};
export const PROJECT_COLORS: Record<string, [string, string]> = {
  green: ['#3f8a63', '#2f5d45'], teal: ['#33a6a3', '#1f7a7a'], blue: ['#4f8fe8', '#2c5fb8'], violet: ['#9a7cf0', '#6a4ccc'],
  pink: ['#ee7aa8', '#c94a7d'], orange: ['#f6a04d', '#e0662a'], amber: ['#f2c14e', '#d18f12'], slate: ['#7d8a96', '#4e5a66'],
};

export function ProjectIcon({ icon, color, size = 'md', className }: { icon: string; color: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = PROJECT_ICONS[icon] ?? Rocket;
  const [a, b] = PROJECT_COLORS[color] ?? PROJECT_COLORS.green;
  const dim = { xs: 'size-6 rounded-lg', sm: 'size-8 rounded-[10px]', md: 'size-11 rounded-2xl', lg: 'size-14 rounded-[18px]' }[size];
  const glyph = { xs: 'size-3.5', sm: 'size-4', md: 'size-5.5', lg: 'size-7' }[size];
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_2px_6px_-2px_rgba(0,0,0,.35)]', dim, className)}
      style={{ background: `linear-gradient(140deg, ${a}, ${b})` }}>
      <Icon className={glyph} strokeWidth={2.1} />
    </span>
  );
}
