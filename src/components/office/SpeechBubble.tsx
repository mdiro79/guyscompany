'use client';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Crown } from 'lucide-react';

const RIM = '#1d4a3a';
const PAPER = '#fbf6ea';
export const TAIL_HEIGHT = 20; // px the tail reaches below the card (room the parent leaves for it)

// Gold-ringed round badge: a crown for the receptionist, the person's portrait otherwise.
export function Badge({ characterId, crown, className }: { characterId?: string; crown?: boolean; className?: string }) {
  return (
    <span className={clsx('relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#163328] ring-[2.5px] ring-[#f6c544]', className)}>
      {crown || !characterId
        ? <Crown className="size-5 fill-[#f6c544] text-[#c9921a]" strokeWidth={1.6} />
        : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/models/thumbs/${characterId}.webp`} alt="" className="size-full object-cover" />
        )}
    </span>
  );
}

// Speech bubble above a character (owner reference image): a cream card with a thick dark-green rim,
// a dark-green name tab on its top edge (badge, status dot, name), three yellow "pop" strokes at the
// top corner and a tail down to the head. Persian or English text sets its own direction.
// The tail's tip follows `--tail` (horizontal offset of the head from the card centre, in px).
export function SpeechBubble({ name, characterId, crown, dot = '#3ee07a', chip, children, action, tail = true, className }: {
  name: ReactNode; characterId?: string; crown?: boolean; dot?: string; chip?: ReactNode; children: ReactNode; action?: ReactNode; tail?: boolean; className?: string;
}) {
  return (
    <div dir="ltr" className={clsx('relative pt-[26px]', className)}>
      <div className="relative rounded-[26px] border-[3.5px] bg-[#fbf6ea] px-4 pt-6 pb-3 text-[#1f2a24] shadow-[0_10px_26px_rgba(20,40,30,0.28)]" style={{ borderColor: RIM }}>
        <div className="text-[15px] leading-[1.65] font-semibold" dir="auto">{children}</div>
        {action && <div className="mt-2 flex items-center justify-end gap-1.5">{action}</div>}
      </div>
      {/* name tab on the rim */}
      <div className="absolute top-0 left-3 flex max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-[20px] py-1 ps-1 pe-4 text-white shadow-[0_4px_10px_rgba(20,30,25,0.3)]" style={{ background: RIM }}>
        <Badge characterId={characterId} crown={crown} />
        <span className="size-2.5 shrink-0 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: dot, color: dot }} />
        <span className="truncate text-[15px] leading-none font-extrabold tracking-tight">{name}</span>
        {chip !== undefined && <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/90">{chip}</span>}
      </div>
      {/* pop strokes at the top corner */}
      <svg viewBox="0 0 32 32" className="pointer-events-none absolute top-0 -right-3 size-8 overflow-visible" aria-hidden>
        {['M6 14 L2 4', 'M14 16 L20 6', 'M17 22 L28 18'].map((d) => (
          <path key={d} d={d} stroke="#ffd23f" strokeWidth="4" strokeLinecap="round" className="gc-glow" />
        ))}
      </svg>
      {tail && (
        <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden
          className="pointer-events-none absolute top-[calc(100%-3.5px)] -translate-x-1/2 overflow-visible group-data-[tail=0]:hidden"
          style={{ left: 'calc(50% + var(--tail, 0px))' }}>
          <path d="M2 0 L17 19 L32 0" fill={PAPER} stroke={RIM} strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// "…" while someone types: a small bubble in the same style, above their name.
export function TypingBubble() {
  return (
    <div dir="ltr" className="relative mb-3 rounded-full border-[3px] bg-[#fbf6ea] px-3.5 py-2 shadow-[0_6px_14px_rgba(20,40,30,0.25)]" style={{ borderColor: RIM }}>
      <span className="flex gap-1.5">
        {[0, 160, 320].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-[#1d4a3a]" style={{ animationDelay: `${d}ms` }} />)}
      </span>
      <svg width="20" height="13" viewBox="0 0 20 13" aria-hidden className="absolute top-[calc(100%-3px)] left-1/2 -translate-x-1/2 overflow-visible">
        <path d="M1 0 L10 11 L19 0" fill={PAPER} stroke={RIM} strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Round dark-green arrow button of the bubble (next / older / newer). Mirrors in right-to-left pages.
export function BubbleButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-label={label} title={label}
      className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#2f5d45] text-white shadow-[0_4px_10px_rgba(47,93,69,0.45)] transition hover:bg-[#28503b] active:scale-95 disabled:opacity-60 short:size-10">
      {children}
    </button>
  );
}
