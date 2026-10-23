'use client';
import clsx from 'clsx';
import { Crown } from 'lucide-react';

// Four-point sparkle used by the nameplate and the speech bubble.
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" fill="currentColor" />
    </svg>
  );
}

const RAYS = [-62, -28, 6, 40]; // degrees of the short rays above the badge

// Name label above a character: dark green pill with a cream rim, a gold-ringed badge (a crown for the
// receptionist, the person's portrait otherwise), sparkles, and a status dot with a line under the name.
// The line is the voice level while someone talks, or moves while the receptionist types.
export function Nameplate({ name, characterId, crown = false, dot = '#3ee07a', level = 0, typing = false, unread = 0 }: {
  name: string; characterId?: string; crown?: boolean; dot?: string; level?: number; typing?: boolean; unread?: number;
}) {
  return (
    <div dir="ltr" className="relative flex items-center gap-2 rounded-full border-2 border-[#f3e7d3] bg-gradient-to-b from-[#2f5d4a] to-[#1c3d31] py-1 ps-1 pe-4 text-white shadow-[0_6px_14px_rgba(20,30,25,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]">
      <span className="relative shrink-0">
        {RAYS.map((deg) => (
          <span key={deg} className="gc-glow absolute top-1/2 left-1/2 h-1.5 w-[3px] rounded-full bg-[#ffd23f]"
            style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-22px)` }} />
        ))}
        <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#163328] ring-2 ring-[#f6c544]">
          {crown || !characterId
            ? <Crown className="size-[18px] fill-[#f6c544] text-[#c9921a]" strokeWidth={1.6} />
            : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/models/thumbs/${characterId}.webp`} alt="" className="size-full object-cover" />
            )}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="max-w-40 truncate text-[15px] leading-none font-extrabold tracking-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">{name}</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full shadow-[0_0_6px_currentColor]" style={{ background: dot, color: dot }} />
          <span className="h-1 w-16 overflow-hidden rounded-full bg-white/15">
            <span className={clsx('block h-full rounded-full transition-[width] duration-150', typing && 'gc-typing')}
              style={{ width: typing ? '100%' : `${60 + Math.min(1, level) * 40}%`, background: typing ? undefined : dot }} />
          </span>
        </span>
      </span>
      {unread > 0 && <span className="rounded-full bg-[#f07a2a] px-1.5 text-[11px] font-bold">{unread}</span>}
      <Sparkle className="gc-twinkle absolute -top-2.5 end-1 size-4 text-[#ffd23f]" />
      <Sparkle className="gc-twinkle absolute -top-1 -end-2.5 size-2.5 text-[#ffe48a] [animation-delay:.7s]" />
    </div>
  );
}
