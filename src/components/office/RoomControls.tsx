'use client';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { X, Sun, SunDim, Eye, EyeOff, Presentation, Users, Coffee, Power, Lightbulb, Blinds } from 'lucide-react';
import { saveRoomAction } from '@/app/actions/rooms';
import type { RoomSettings } from '@/lib/data/types';
import { roomControls, useRoomSettings, current } from './roomControls';

const SAVE_AFTER_MS = 600;

// Light scenes of the conference room (brightness, warmth 0 = cool … 100 = warm).
const SCENES = [
  { id: 'meeting', icon: Users, light: 100, warmth: 45 },
  { id: 'presentation', icon: Presentation, light: 25, warmth: 55 },
  { id: 'relax', icon: Coffee, light: 55, warmth: 90 },
  { id: 'off', icon: Power, light: 0, warmth: 45 },
] as const;
const GLASS = [{ id: 'clear', frost: 0 }, { id: 'half', frost: 50 }, { id: 'frosted', frost: 100 }] as const;

function Slider({ value, onChange, label, track, start, end }: {
  value: number; onChange: (v: number) => void; label: string; track: string; start: React.ReactNode; end: React.ReactNode;
}) {
  return (
    // Always left to right, so its ends (dim/bright, cool/warm, clear/frosted) match the track in Persian too.
    <div className="flex items-center gap-2" dir="ltr">
      <span className="shrink-0 text-white/70">{start}</span>
      <input type="range" min={0} max={100} step={1} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}
        className="gc-range h-11 min-w-0 flex-1 touch-pan-x short:h-9" style={{ ['--track' as string]: track }} />
      <span className="shrink-0 text-white/70">{end}</span>
      <span className="w-10 shrink-0 text-end text-xs tabular-nums" dir="ltr">{value}%</span>
    </div>
  );
}

// Controls of the conference room's smart wall panel. Every change shows at once for everyone in the
// office (WebRTC) and is saved shortly after the last move.
export function RoomControls({ onClose }: { onClose: () => void }) {
  const t = useTranslations('office.room');
  const s = useRoomSettings();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; void saveRoomAction('conference', current()); } };
  const change = (patch: Partial<RoomSettings>) => {
    roomControls.set(patch);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  };
  // Saves a pending change when the panel closes.
  useEffect(() => () => flush(), []);

  const scene = SCENES.find((x) => x.light === s.light && x.warmth === s.warmth)?.id;
  return (
    <div className="pointer-events-auto max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-black/75 p-3 text-sm text-white shadow-xl backdrop-blur short:max-h-[calc(100dvh-4.5rem)]"
      role="dialog" aria-label={t('title')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#3fb3ad]/25 text-[#7fd0c2]"><Lightbulb className="size-4" /></span>
        <span className="me-auto font-semibold">{t('title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')} className="flex size-10 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
      </div>

      <div className="mb-1 flex items-center gap-1.5 text-xs text-white/70"><Lightbulb className="size-3.5" />{t('light')}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {SCENES.map(({ id, icon: Icon, light, warmth }) => (
          <button key={id} type="button" aria-pressed={scene === id} onClick={() => change({ light, warmth })}
            className={clsx('flex min-h-14 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl text-[11px] short:min-h-11 short:flex-row', scene === id ? 'bg-[#2f5d45]' : 'bg-white/10 hover:bg-white/20')}>
            <Icon className="size-4" />{t(`scene.${id}`)}
          </button>
        ))}
      </div>
      <Slider value={s.light} onChange={(light) => change({ light })} label={t('brightness')} track="linear-gradient(90deg,#3b3a36,#fff2d6)"
        start={<SunDim className="size-4" />} end={<Sun className="size-4" />} />
      <Slider value={s.warmth} onChange={(warmth) => change({ warmth })} label={t('warmth')} track="linear-gradient(90deg,#eaf1ff,#ffbf73)"
        start={<span className="text-[11px]">{t('cool')}</span>} end={<span className="text-[11px]">{t('warm')}</span>} />

      <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs text-white/70"><Blinds className="size-3.5" />{t('glass')}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {GLASS.map(({ id, frost }) => (
          <button key={id} type="button" aria-pressed={s.frost === frost} onClick={() => change({ frost })}
            className={clsx('min-h-10 touch-manipulation rounded-xl text-xs short:min-h-9', s.frost === frost ? 'bg-[#2f5d45]' : 'bg-white/10 hover:bg-white/20')}>{t(`glassLevel.${id}`)}</button>
        ))}
      </div>
      <Slider value={s.frost} onChange={(frost) => change({ frost })} label={t('frost')} track="linear-gradient(90deg,rgba(201,230,227,.45),#f4f1ec)"
        start={<Eye className="size-4" />} end={<EyeOff className="size-4" />} />
      <p className="mt-1 text-[11px] text-white/55 short:hidden">{t('shared')}</p>
    </div>
  );
}
