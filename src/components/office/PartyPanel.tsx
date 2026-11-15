'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { PartyPopper, X, Tv, Music, Square, Upload, Loader2, Volume2, VolumeX, Lightbulb, Palette, Disc3, Sparkles, Zap, Grid3x3, Flashlight, Footprints } from 'lucide-react';
import { uploadFile } from '@/lib/upload';
import { MAX_FILE_BYTES } from '@/lib/limits';
import { syncedNow } from '@/lib/realtime/room';
import { party, partyPhase, useParty, LIGHT_MODES, PARTY_STYLES, type PartyLights } from './party';
import { partyAudio } from './partyAudio';

const STYLE_ICONS = ['🪩', '🏠', '🎉', '🌆'];

/**
 * The conference room's party controls, for everyone in the room: party mode (the table and chairs go up
 * into the ceiling and the light rig comes down), the main screen down/up, the music (built-in tracks or
 * a song of one's own, which everyone hears) and the light show.
 */
export function PartyPanel({ open, onOpen }: { open: boolean; onOpen: (o: boolean) => void }) {
  const t = useTranslations('office.party');
  const s = useParty();
  const muted = useSyncExternalStore(partyAudio.subscribeMute, partyAudio.muted, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const moving = s.at > 0 && (() => { const p = partyPhase(s, syncedNow()).progress; return p > 0 && p < 1; })();
  const l = s.lights;
  const set = (patch: Partial<PartyLights>) => party.setLights(patch);

  const addSong = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)$/i.test(file.name)) { setError(t('notAudio')); return; }
    if (file.size > MAX_FILE_BYTES) { setError(t('tooBig')); return; }
    setBusy(true);
    try {
      const fileId = await uploadFile(file);
      party.addSong({ fileId, name: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || '♪' });
    } catch { setError(t('uploadFailed')); } finally { setBusy(false); }
  };

  const chip = (on: boolean) => clsx('flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition active:scale-95', on ? 'bg-white/25 ring-2 ring-white/60' : 'bg-white/10 hover:bg-white/20');
  const toggle = (k: keyof PartyLights, label: string, Icon: typeof Tv) => (
    <button type="button" onClick={() => set({ [k]: !l[k] } as Partial<PartyLights>)} aria-pressed={!!l[k]} className={chip(!!l[k])}><Icon className="size-4" />{label}</button>
  );
  const playingStyle = s.track?.kind === 'style' ? s.track.style : -1, playingSong = s.track?.kind === 'song' ? s.track.fileId : null;

  return (
    <>
      <button type="button" onClick={() => onOpen(!open)} aria-expanded={open}
        className={clsx('gc-kb-hide relative flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-lg transition-transform active:scale-95', s.on ? 'bg-gradient-to-r from-[#c2417c] to-[#7b4dd6]' : 'bg-black/60 backdrop-blur')}>
        <PartyPopper className="size-4" />{t('title')}
        {s.track && <span className="absolute -top-1 -end-1 size-3 animate-pulse rounded-full bg-[#ffd34d]" />}
      </button>
      {open && (
        <div role="dialog" aria-label={t('title')}
          className="pointer-events-auto absolute top-full left-1/2 z-10 mt-2 max-h-[calc(100dvh-8.5rem)] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl bg-black/85 p-3 text-sm shadow-xl backdrop-blur short:max-h-[calc(100dvh-7.25rem)]">
          <div className="mb-2 flex items-center gap-2">
            <PartyPopper className="size-5 text-[#ffb3d9]" /><h2 className="me-auto font-bold">{t('title')}</h2>
            <button type="button" onClick={() => onOpen(false)} aria-label={t('close')} className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
          </div>

          {/* The room */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => party.setOn(!s.on)} aria-pressed={s.on}
              className={clsx('flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-xs font-bold transition active:scale-95', s.on ? 'bg-gradient-to-r from-[#c2417c] to-[#7b4dd6]' : 'bg-white/10 hover:bg-white/20')}>
              <span className="text-lg leading-none">🪩</span>{moving ? t('moving') : s.on ? t('partyOff') : t('partyOn')}
            </button>
            <button type="button" onClick={() => party.setTvDown(!s.tvDown)} aria-pressed={s.tvDown}
              className={clsx('flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-xs font-bold transition active:scale-95', s.tvDown ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20')}>
              <Tv className="size-5" />{s.tvDown ? t('tvUp') : t('tvDown')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-white/55">{t('partyHint')}</p>

          {/* Music */}
          <h3 className="mt-3 mb-1.5 flex items-center gap-1.5 text-xs font-bold text-white/80"><Music className="size-4" />{t('music')}</h3>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: PARTY_STYLES }, (_, i) => (
              <button key={i} type="button" onClick={() => party.play(playingStyle === i ? null : { kind: 'style', style: i })} aria-pressed={playingStyle === i}
                className={clsx(chip(playingStyle === i), 'flex-col gap-0 px-1 py-1.5')}><span className="text-lg leading-none">{STYLE_ICONS[i]}</span>{t(`style${i}`)}</button>
            ))}
          </div>
          {s.songs.length > 0 && (
            <ul className="mt-2 flex max-h-36 flex-col gap-1 overflow-y-auto">
              {s.songs.map((song) => (
                <li key={song.fileId}>
                  <button type="button" onClick={() => party.play(playingSong === song.fileId ? null : { kind: 'song', ...song })} aria-pressed={playingSong === song.fileId}
                    className={clsx(chip(playingSong === song.fileId), 'w-full justify-start')}><span>{playingSong === song.fileId ? '🔊' : '🎵'}</span><span className="min-w-0 truncate" dir="auto">{song.name}</span></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className={clsx(chip(false), 'flex-1')}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{t('addSong')}
            </button>
            {s.track && <button type="button" onClick={() => party.play(null)} className={chip(false)} aria-label={t('stop')} title={t('stop')}><Square className="size-4" />{t('stop')}</button>}
            <button type="button" onClick={() => partyAudio.setMuted(!muted)} aria-pressed={muted} className={chip(muted)} aria-label={muted ? t('unmute') : t('mute')} title={muted ? t('unmute') : t('mute')}>
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>
          <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac,.opus" hidden onChange={(e) => { void addSong(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <p role="alert" className="mt-1.5 rounded-lg bg-[#d9443c]/80 px-2 py-1 text-xs">{error}</p>}

          {/* Lights */}
          <h3 className="mt-3 mb-1.5 flex items-center gap-1.5 text-xs font-bold text-white/80"><Sparkles className="size-4" />{t('lights')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {LIGHT_MODES.map((m) => <button key={m} type="button" onClick={() => set({ mode: m })} aria-pressed={l.mode === m} className={chip(l.mode === m)}>{t(`mode_${m}`)}</button>)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {toggle('main', t('main'), Lightbulb)}
            {toggle('color', t('color'), Palette)}
            {toggle('ball', t('ball'), Disc3)}
            {toggle('heads', t('heads'), Flashlight)}
            {toggle('lasers', t('lasers'), Sparkles)}
            {toggle('floor', t('floor'), Grid3x3)}
            {toggle('strobe', t('strobe'), Zap)}
            {toggle('jump', t('jump'), Footprints)}
          </div>
          {(['intensity', 'speed'] as const).map((k) => (
            <label key={k} className="mt-2 flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-white/75">{t(k)}</span>
              <input type="range" min={0} max={100} value={l[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} className="min-w-0 flex-1 accent-[#c2417c]" />
            </label>
          ))}
          {!s.on && <p className="mt-2 text-[11px] leading-4 text-white/55">{t('lightsHint')}</p>}
        </div>
      )}
    </>
  );
}
