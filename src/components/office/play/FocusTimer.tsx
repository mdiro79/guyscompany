'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { music } from './music';

// A focus timer for the library's pod (25, 15 or 50 minutes). It keeps running when you stand up and
// rings softly when the time is over. One timer per browser tab, kept outside React so it survives re-renders.

const CHOICES = [25, 15, 50];
let state = { minutes: 25, endsAt: 0, leftMs: 25 * 60000, running: false, done: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
let ticker: ReturnType<typeof setInterval> | null = null;

function tick() {
  if (!state.running) return;
  const leftMs = Math.max(0, state.endsAt - Date.now());
  if (leftMs === 0) {
    set({ leftMs: 0, running: false, done: true });
    music().blip([76, 72, 76, 79, 84], 'sine', 0.22, 0.22);
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ }
  } else set({ leftMs });
}
const start = () => { set({ running: true, done: false, endsAt: Date.now() + (state.leftMs || state.minutes * 60000), leftMs: state.leftMs || state.minutes * 60000 }); ticker ??= setInterval(tick, 500); };
const pause = () => set({ running: false, leftMs: Math.max(0, state.endsAt - Date.now()) });
const reset = (minutes = state.minutes) => set({ minutes, leftMs: minutes * 60000, running: false, done: false });

export function useFocusTimer() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return state;
}
export const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.ceil((ms % 60000) / 1000) % 60).padStart(2, '0')}`;

export function FocusTimer() {
  const t = useTranslations('office.focusTimer');
  const s = useFocusTimer();
  return (
    <div className="pointer-events-auto w-[min(17rem,calc(100vw-2rem))] rounded-2xl bg-black/75 p-3 text-sm shadow-xl backdrop-blur">
      <div className="flex items-center gap-2 font-bold"><Timer className="size-4 text-[#8fe0c8]" /><span className="me-auto">{t('title')}</span>
        <span className={clsx('text-2xl tabular-nums', s.done ? 'text-[#7dffb0]' : s.running ? 'text-white' : 'text-white/70')} dir="ltr">{clock(s.leftMs)}</span></div>
      <p className="mt-1 text-xs text-white/65" aria-live="polite">{s.done ? t('done') : s.running ? t('running') : t('hint')}</p>
      <div className="mt-2 flex gap-1.5">
        {CHOICES.map((m) => (
          <button key={m} type="button" onClick={() => reset(m)} disabled={s.running} aria-pressed={s.minutes === m}
            className={clsx('min-h-10 flex-1 rounded-xl tabular-nums disabled:opacity-40', s.minutes === m ? 'bg-[#8fe0c8] font-bold text-[#12352c]' : 'bg-white/10 hover:bg-white/20')}>{m}′</button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" onClick={s.running ? pause : start} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#2f5d45] font-semibold active:scale-95">
          {s.running ? <Pause className="size-4" /> : <Play className="size-4" />}{s.running ? t('pause') : t('start')}
        </button>
        <button type="button" onClick={() => reset()} aria-label={t('reset')} className="flex size-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><RotateCcw className="size-4" /></button>
      </div>
    </div>
  );
}
