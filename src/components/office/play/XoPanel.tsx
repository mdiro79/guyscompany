'use client';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { music } from './music';
import { useXo, winnerOf, xo } from './xo';

// Noughts and crosses for whoever sits at the game table. `mark` is this seat's side (1 = X, 2 = O);
// `alone` (nobody on the other chair) lets one person play both sides.
export function XoPanel({ mark, alone, opponent }: { mark: 1 | 2; alone: boolean; opponent: string | null }) {
  const t = useTranslations('office.xo');
  const s = useXo();
  const w = winnerOf(s.cells);
  const myTurn = !w && (alone || s.turn === mark);
  const move = (i: number) => {
    if (w || s.cells[i]) return;
    const m = alone ? s.turn : mark;
    if (s.turn !== m) return;
    xo.move(i, m);
    music().blip([m === 1 ? 72 : 67], 'triangle', 0.1);
  };
  // 1–9 play the squares in reading order (computers, while the mouse looks around).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) move(n - 1);
      if (e.code === 'KeyR' && w) xo.again();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const status = w === 'draw' ? t('draw') : w ? (alone ? t('wins', { mark: w.mark === 1 ? '✕' : '◯' }) : w.mark === mark ? t('youWin') : t('youLose'))
    : alone ? t('solo', { mark: s.turn === 1 ? '✕' : '◯' }) : myTurn ? t('yourTurn') : t('theirTurn', { name: opponent ?? '—' });
  return (
    <div className="pointer-events-auto flex w-[min(15rem,calc(100vw-2rem))] flex-col gap-2 rounded-2xl bg-black/75 p-3 text-sm shadow-xl backdrop-blur short:w-[min(24rem,calc(100vw-2rem))] short:flex-row short:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2 font-bold"><span className={mark === 1 ? 'text-[#ff9a4d]' : 'text-[#4fd8cf]'}>{mark === 1 ? '✕' : '◯'}</span><span className="me-auto truncate">{t('title')}</span>
          <span className="tabular-nums text-white/80"><span className="text-[#ff9a4d]">{s.wins[0]}</span> : <span className="text-[#4fd8cf]">{s.wins[1]}</span></span></div>
        <p className={clsx('rounded-lg px-2 py-1 text-center text-xs', myTurn ? 'bg-[#2f5d45]' : 'bg-white/10')} aria-live="polite">{status}</p>
        {w && <button type="button" onClick={() => xo.again()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f6c544] font-bold text-[#1d3a2e] active:scale-95"><RotateCcw className="size-4" />{t('again')}</button>}
      </div>
      <div className="mx-auto grid aspect-square w-full max-w-52 shrink-0 touch-manipulation grid-cols-3 gap-1.5 short:w-36" dir="ltr">
        {s.cells.map((c, i) => (
          <button key={i} type="button" onClick={() => move(i)} disabled={!!c || !myTurn} aria-label={`${i + 1}${c ? (c === 1 ? ' X' : ' O') : ''}`}
            className={clsx('flex items-center justify-center rounded-xl text-2xl font-black transition-colors', c === 1 ? 'text-[#ff9a4d]' : 'text-[#4fd8cf]',
              w && w !== 'draw' && w.line.includes(i) ? 'bg-white/30' : 'bg-white/10', !c && myTurn && 'hover:bg-white/20 active:bg-white/30')}>
            {c === 1 ? '✕' : c === 2 ? '◯' : <span className="text-xs font-normal text-white/25 max-md:hidden">{i + 1}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
