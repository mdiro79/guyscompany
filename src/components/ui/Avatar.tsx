'use client';
import clsx from 'clsx';
import type { Profile, UserStatus } from '@/lib/data/types';

const BG = ['bg-accent', 'bg-teal', 'bg-brand', 'bg-[#8b6fd6]', 'bg-[#d6705f]'];
const DOT: Record<UserStatus | 'offline', string> = { online: 'bg-online', busy: 'bg-busy', focus: 'bg-focus', offline: 'bg-muted' };

// Character portrait (rendered at build time) over an initial-letter fallback.
export function Avatar({ profile, size = 'md', status }: { profile: Pick<Profile, 'displayName' | 'characterId'> | null; size?: 'sm' | 'md' | 'lg'; status?: UserStatus | 'offline' }) {
  const name = profile?.displayName ?? '?';
  const color = BG[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % BG.length];
  const dim = size === 'sm' ? 'size-7 text-xs' : size === 'lg' ? 'size-14 text-xl' : 'size-10 text-sm';
  return (
    <span className={clsx('relative inline-flex shrink-0', dim)}>
      <span className={clsx('relative flex size-full items-center justify-center overflow-hidden rounded-full font-semibold text-white', color)}>
        {[...name][0]?.toUpperCase()}
        {profile?.characterId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/models/thumbs/${profile.characterId}.webp`} alt="" loading="lazy" className="absolute inset-0 size-full bg-surface-2 object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
      </span>
      {status && <span className={clsx('absolute -bottom-0.5 -end-0.5 size-3 rounded-full ring-2 ring-surface', DOT[status])} />}
    </span>
  );
}
