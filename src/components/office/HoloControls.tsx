'use client';
import { useEffect, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Minus, Plus, RotateCcw, RotateCw, ScanEye, ArrowDownToLine, Projector } from 'lucide-react';
import { tablet, setHolo } from './tablet';
import { holoView, useHoloView } from './holo';

// Buttons for one's own smart screen, at the side of the view in the conference room: on/off, bigger and
// smaller, turn left and right, "fit to my view" (right in front of where one looks, as large as fits) and
// back over the table. Keys on computers: [ and ] turn it, - and = resize it.
const TURN = Math.PI / 12; // 15°

export function HoloControls() {
  const t = useTranslations('office.holo');
  const on = useSyncExternalStore(tablet.subscribe, () => tablet.get().holo, () => false);
  const v = useHoloView();
  useEffect(() => { holoView.load(); }, []);
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'BracketLeft') holoView.turn(TURN);
      else if (e.code === 'BracketRight') holoView.turn(-TURN);
      else if (e.code === 'Minus') holoView.grow(1 / 1.15);
      else if (e.code === 'Equal') holoView.grow(1.15);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on]);
  const btn = 'flex size-10 items-center justify-center rounded-xl text-white transition active:scale-90 hover:bg-white/15 short:size-9';
  const b = (label: string, Icon: typeof Plus, onClick: () => void, extra?: string) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={clsx(btn, extra)}><Icon className="size-5" /></button>
  );
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-black/55 p-1 shadow-lg backdrop-blur" role="toolbar" aria-label={t('title')}>
      <button type="button" onClick={() => setHolo(!on)} aria-pressed={on} aria-label={on ? t('off') : t('on')} title={on ? t('off') : t('on')}
        className={clsx(btn, on && 'bg-[#19a7c9] hover:bg-[#19a7c9]')}><Projector className="size-5" /></button>
      {on && (
        <>
          {b(t('bigger'), Plus, () => holoView.grow(1.15))}
          {b(t('smaller'), Minus, () => holoView.grow(1 / 1.15))}
          {b(t('turnLeft'), RotateCcw, () => holoView.turn(TURN))}
          {b(t('turnRight'), RotateCw, () => holoView.turn(-TURN))}
          {b(t('fit'), ScanEye, () => holoView.fit(), 'bg-white/10')}
          {v.place && b(t('overTable'), ArrowDownToLine, () => holoView.overTable())}
        </>
      )}
    </div>
  );
}
