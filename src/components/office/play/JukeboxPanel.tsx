'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Music, Square, Volume2, VolumeX, X } from 'lucide-react';
import { jukebox, TRACKS, useJukebox } from './jukebox';

const ICONS = ['🎧', '🌆', '🌿', '🪩'];

// The jukebox's buttons: pick a style for everyone, stop it, or silence the music on this device only.
export function JukeboxPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('office.juke');
  const { track, muted } = useJukebox();
  return (
    <div className="w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-black/75 p-3 text-sm shadow-xl backdrop-blur" role="dialog" aria-label={t('title')}>
      <div className="mb-2 flex items-center gap-2">
        <Music className="size-5 text-[#ffb45c]" /><h2 className="me-auto font-bold">{t('title')}</h2>
        <button type="button" onClick={onClose} aria-label={t('close')} className="flex size-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TRACKS.map((id, i) => (
          <button key={id} type="button" onClick={() => jukebox.set(i)} aria-pressed={track === i}
            className={clsx('flex min-h-14 items-center gap-2 rounded-xl px-3 text-start font-semibold transition active:scale-95', track === i ? 'bg-[#ffb45c] text-[#2a1a08]' : 'bg-white/10 hover:bg-white/20')}>
            <span className="text-xl">{ICONS[i]}</span><span className="min-w-0 truncate">{t(`track.${id}`)}</span>
            {track === i && <span className="ms-auto flex items-end gap-0.5" aria-hidden>{[0, 1, 2].map((b) => <span key={b} className="gc-eq w-1 rounded-full bg-[#2a1a08]" style={{ animationDelay: `${b * 120}ms` }} />)}</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => jukebox.set(-1)} disabled={track < 0} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"><Square className="size-4" />{t('stop')}</button>
        <button type="button" onClick={() => jukebox.setMuted(!muted)} aria-pressed={muted} className={clsx('flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl', muted ? 'bg-[#d9443c]' : 'bg-white/10 hover:bg-white/20')}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}{muted ? t('muted') : t('mute')}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/65">{t('shared')}</p>
    </div>
  );
}
