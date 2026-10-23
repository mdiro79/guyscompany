'use client';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Sparkle } from './Nameplate';

export const TAIL_HEIGHT = 44; // px of the dotted tail under the card (space the parent leaves for it)

// Frosted-glass speech card shared by the receptionist's tour and teammates' chat messages:
// a teal sparkle badge on the corner, the speaker's portrait, a title with a small counter chip,
// the text, an optional round action button, and a dotted glowing tail that runs down to the head.
// The tail's end follows `--tail` (horizontal offset of the head from the card centre, in px).
export function SpeechBubble({ characterId, title, chip, children, action, tail = true, className }: {
  characterId: string; title: ReactNode; chip?: ReactNode; children: ReactNode; action?: ReactNode; tail?: boolean; className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <div className="relative rounded-[22px] border border-white/80 bg-white/80 p-3.5 text-[#1f2a24] shadow-[0_14px_34px_rgba(31,42,36,0.2)] backdrop-blur-xl sm:p-4">
        {/* glossy top light */}
        <span className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-t-[22px] bg-gradient-to-b from-white/60 to-transparent" />
        <span className="absolute -top-4 -start-4 flex size-11 -rotate-6 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7fd0c2] to-[#3f998c] shadow-[0_6px_14px_rgba(63,153,140,0.45)] ring-2 ring-white/70">
          <Sparkle className="size-5 text-white" />
          <span className="gc-glow absolute -top-2 -end-1.5 h-2 w-0.5 rotate-[35deg] rounded-full bg-[#7fd0c2]" />
          <span className="gc-glow absolute -start-2 -bottom-1 h-0.5 w-2 -rotate-[25deg] rounded-full bg-[#7fd0c2] [animation-delay:.5s]" />
        </span>
        <div className="relative flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/models/thumbs/${characterId}.webp`} alt="" className="size-11 shrink-0 rounded-full bg-[#f6e3cf] object-cover shadow ring-2 ring-white short:size-9" />
          <div className="min-w-0 pt-0.5">
            <div className="truncate text-[15px] leading-5 font-bold">{title}</div>
            {chip !== undefined && <span className="mt-1 inline-block rounded-full bg-[#1f2a24]/[0.07] px-2.5 py-0.5 text-xs font-medium text-[#4b5750]" dir="ltr">{chip}</span>}
          </div>
        </div>
        <div className="relative mt-2 text-[15px] leading-6 text-[#1f2a24]/90 short:text-sm short:leading-5" dir="auto">{children}</div>
        {action && <div className="relative -mb-1 mt-1 flex items-center justify-end gap-1">{action}</div>}
      </div>
      {tail && (
        <svg width="46" height={TAIL_HEIGHT} viewBox={`0 0 46 ${TAIL_HEIGHT}`} aria-hidden
          className="pointer-events-none absolute top-full -mt-px overflow-visible group-data-[tail=0]:hidden"
          style={{ left: 'calc(50% + var(--tail, 0px) - 4px)' }}>
          <path d={`M40 0C40 18 10 20 4 ${TAIL_HEIGHT - 2}`} fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="2.5" strokeDasharray="1 5" strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 2px #5fc4b4)' }} />
          <circle cx="38" cy="8" r="3.5" fill="#ffffff" stroke="#5fc4b4" strokeWidth="1.5" className="gc-glow" />
          <circle cx="22" cy="24" r="4" fill="#ffffff" stroke="#5fc4b4" strokeWidth="1.5" className="gc-glow [animation-delay:.4s]" />
          <circle cx="4" cy={TAIL_HEIGHT - 2} r="3" fill="#ffffff" stroke="#5fc4b4" strokeWidth="1.5" className="gc-glow [animation-delay:.8s]" />
        </svg>
      )}
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
