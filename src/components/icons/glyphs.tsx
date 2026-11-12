// Our own duotone icons for the named options of tasks and projects (stage, priority, size, status).
// One style for all: 24×24, 1.8 px rounded strokes in the current colour over a soft fill of the same
// colour, so a tile tinted with an option's colour shows the whole icon in that colour.
import type { ReactNode, SVGProps } from 'react';

type GlyphProps = { className?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Glyph({ className, children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden className={className ?? 'size-5'} {...rest}>
      {children}
    </svg>
  );
}
const soft = { fill: 'currentColor', fillOpacity: 0.18, stroke: 'none' } as const;
const solid = { fill: 'currentColor', stroke: 'none' } as const;

// Task stages ----------------------------------------------------------------------------------------

/** Idea: a bulb with a soft glow and three rays. */
export function IdeaGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path {...soft} d="M12 3.6a5.6 5.6 0 0 0-3.3 10.1c.7.5 1.1 1.3 1.1 2.1v.9h4.4v-.9c0-.8.4-1.6 1.1-2.1A5.6 5.6 0 0 0 12 3.6Z" />
      <path d="M12 3.6a5.6 5.6 0 0 0-3.3 10.1c.7.5 1.1 1.3 1.1 2.1v.9h4.4v-.9c0-.8.4-1.6 1.1-2.1A5.6 5.6 0 0 0 12 3.6Z" />
      <path d="M9.8 19.4h4.4M10.8 21.6h2.4" />
      <path d="M12 7.2a2.6 2.6 0 0 0-2.4 1.6" strokeOpacity={0.7} />
      <path d="M2.8 9.3h1.4M19.8 9.3h1.4M4.9 3.4l1 1M19.1 3.4l-1 1" />
    </Glyph>
  );
}

/** In progress: a ring two-thirds filled, turning. */
export function ProgressGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle {...soft} cx="12" cy="12" r="8.6" />
      <path fill="currentColor" fillOpacity={0.55} stroke="none" d="M12 12V3.4a8.6 8.6 0 1 1-7.45 12.9Z" />
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 12V7.4" strokeWidth={2.2} />
      <circle {...solid} cx="12" cy="12" r="1.6" />
    </Glyph>
  );
}

/** Review: an eye inside a magnifying glass. */
export function ReviewGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle {...soft} cx="10.5" cy="10.5" r="6.8" />
      <circle cx="10.5" cy="10.5" r="6.8" />
      <path d="m15.6 15.6 5 5" strokeWidth={2.4} />
      <path d="M6.6 10.5s1.5-2.5 3.9-2.5 3.9 2.5 3.9 2.5-1.5 2.5-3.9 2.5-3.9-2.5-3.9-2.5Z" />
      <circle {...solid} cx="10.5" cy="10.5" r="1.2" />
    </Glyph>
  );
}

/** Done: a check on a seal with a small sparkle. */
export function DoneGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path {...soft} d="M12 2.8 14.3 4.5l2.9-.1.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.9-.1L12 21.2l-2.3-1.7-2.9.1-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.9.1Z" />
      <path d="M12 2.8 14.3 4.5l2.9-.1.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.9-.1L12 21.2l-2.3-1.7-2.9.1-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.9.1Z" />
      <path d="m8.4 12.2 2.5 2.5 4.9-5.1" strokeWidth={2.2} />
    </Glyph>
  );
}

// Levels: priority (3 bars) and severity (4 bars) -----------------------------------------------------

/** Rising bars, the first `level` of `of` filled (like a phone's signal). */
export function LevelGlyph({ level, of = 3, ...p }: GlyphProps & { level: number; of?: number }) {
  const gap = of === 4 ? 1.2 : 1.8;
  const w = (18 - gap * (of - 1)) / of;
  return (
    <Glyph {...p}>
      {Array.from({ length: of }, (_, i) => {
        const h = 5 + (i * 13) / (of - 1);
        return <rect key={i} x={3 + i * (w + gap)} y={20.5 - h} width={w} height={h} rx={1.3}
          fill="currentColor" fillOpacity={i < level ? 1 : 0.2} stroke="none" />;
      })}
    </Glyph>
  );
}

/** Urgent: three full bars with a small flame on top. */
export function UrgentGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect {...solid} x="3" y="15.5" width="4.8" height="5" rx="1.3" />
      <rect {...solid} x="9.6" y="11" width="4.8" height="9.5" rx="1.3" />
      <rect {...solid} x="16.2" y="9" width="4.8" height="11.5" rx="1.3" />
      <path {...solid} d="M18.6 1.8c.3 1.4 1.9 2 1.9 3.8a1.9 1.9 0 0 1-3.8 0c0-.6.3-1.1.6-1.5.1.6.5 1 .9 1 .4-1.1.1-2.2.4-3.3Z" />
    </Glyph>
  );
}

// Effort: building blocks, one to four -------------------------------------------------------------

const BLOCKS: Record<number, [number, number][]> = {
  1: [[8.5, 13.5]],
  2: [[3.8, 13.5], [12.8, 13.5]],
  3: [[3.8, 13.5], [12.8, 13.5], [8.3, 6.5]],
  4: [[1.5, 13.5], [8.5, 13.5], [15.5, 13.5], [8.5, 6.5]],
};
export function EffortGlyph({ size, ...p }: GlyphProps & { size: number }) {
  if (!size) {
    return (
      <Glyph {...p}>
        <rect x="5" y="5" width="14" height="14" rx="3" strokeDasharray="3 2.6" />
        <path d="M10 10.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.4" />
        <circle {...solid} cx="12" cy="16" r="1" />
      </Glyph>
    );
  }
  const w = size === 4 ? 6.5 : 7;
  return (
    <Glyph {...p}>
      {BLOCKS[size].map(([x, y], i) => (
        <g key={i}>
          <rect {...soft} x={x} y={y} width={w} height={6.2} rx={1.5} />
          <rect x={x} y={y} width={w} height={6.2} rx={1.5} />
        </g>
      ))}
    </Glyph>
  );
}

// Project status -------------------------------------------------------------------------------------

/** Planning: a clipboard with a plan. */
export function PlanningGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect {...soft} x="4.8" y="4.2" width="14.4" height="17" rx="2.4" />
      <rect x="4.8" y="4.2" width="14.4" height="17" rx="2.4" />
      <rect x="8.8" y="2.6" width="6.4" height="3.4" rx="1.2" fill="var(--surface, #fff)" />
      <path d="m8.2 11 1.2 1.2 2-2.2M13.4 11.2h2.6M8.2 16l1.2 1.2 2-2.2M13.4 16.2h2.6" />
    </Glyph>
  );
}

/** Active: play, with speed lines. */
export function ActiveGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle {...soft} cx="13.6" cy="12" r="8" />
      <circle cx="13.6" cy="12" r="8" />
      <path {...solid} d="M11.8 8.4v7.2l5.6-3.6Z" />
      <path d="M1.8 8.8h2.6M1.2 12h2.8M1.8 15.2h2.6" />
    </Glyph>
  );
}

/** Paused: two bars in a circle. */
export function PausedGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle {...soft} cx="12" cy="12" r="8.8" />
      <circle cx="12" cy="12" r="8.8" />
      <rect {...solid} x="8.6" y="7.8" width="2.4" height="8.4" rx="1" />
      <rect {...solid} x="13" y="7.8" width="2.4" height="8.4" rx="1" />
    </Glyph>
  );
}

/** Done: a trophy. */
export function TrophyGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path {...soft} d="M7.6 3.6h8.8v5.6a4.4 4.4 0 0 1-8.8 0Z" />
      <path d="M7.6 3.6h8.8v5.6a4.4 4.4 0 0 1-8.8 0Z" />
      <path d="M7.6 5.6H4.8a3 3 0 0 0 3.3 4.3M16.4 5.6h2.8a3 3 0 0 1-3.3 4.3" />
      <path d="M12 13.6v3.4M8.6 20.6h6.8M9.8 17h4.4l.6 3.6H9.2Z" />
      <path {...solid} d="m12 5.3.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2Z" />
    </Glyph>
  );
}

// Chat -------------------------------------------------------------------------------------------------

/** A decision: a gavel over a block. */
export function DecisionGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect {...soft} x="3" y="17.4" width="11" height="3.6" rx="1.2" />
      <rect x="3" y="17.4" width="11" height="3.6" rx="1.2" />
      <path d="m10.4 4.4 5.6 5.6M8.3 6.5l3.4-3.4 5.6 5.6-3.4 3.4Z" />
      <path d="m12.5 10.7 7.6 7.6" strokeWidth={2.4} />
    </Glyph>
  );
}

/** A project's chat topic: two bubbles over a folder tab. */
export function TopicGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path {...soft} d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H8.2L4.6 21v-3.2a2 2 0 0 1-1.1-1.8Z" />
      <path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H8.2L4.6 21v-3.2a2 2 0 0 1-1.1-1.8Z" />
      <path d="M8 11.4h8M8 14.6h5" />
    </Glyph>
  );
}
