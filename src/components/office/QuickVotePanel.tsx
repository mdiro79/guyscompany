'use client';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Vote, X } from 'lucide-react';
import { CHOICES, quickVote, tally, useQuickVote, type Choice } from '@/lib/board/vote';
import { useKeyboardOpen } from '@/lib/viewport';
import { KEYBOARD_DOCK, KEYBOARD_PANEL, useFocusInView } from './MeetingPanel';

const FACE: Record<Choice, string> = { yes: '👍', no: '👎', unsure: '🤔' };
const BAR: Record<Choice, string> = { yes: 'bg-[#22a559]', no: 'bg-[#d9443c]', unsure: 'bg-[#f6c544]' };

/** A quick vote in the conference room: its button for the bar above the room, and the panel under it. */
export function QuickVotePanel({ meId, names, open, onOpen }: { meId: string; names: (id: string) => string; open: boolean; onOpen: (o: boolean) => void }) {
  const t = useTranslations('office.vote');
  const v = useQuickVote();
  const [question, setQuestion] = useState('');
  const counts = v ? tally(v) : null;
  const total = counts ? counts.yes + counts.no + counts.unsure : 0;
  const mine = v?.votes[meId];
  const kb = useKeyboardOpen();
  const panel = useRef<HTMLDivElement>(null);
  useFocusInView(panel, kb);
  return (
    <>
      <button type="button" onClick={() => onOpen(!open)} aria-expanded={open}
        className={clsx('gc-kb-hide relative flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-lg transition-transform active:scale-95', v?.open ? 'bg-[#5b8def]' : 'bg-black/60 backdrop-blur')}>
        <Vote className="size-4" />{t('title')}
        {v?.open && !mine && <span className="absolute -top-1 -end-1 size-3 animate-pulse rounded-full bg-[#ff6b5b]" />}
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label={t('title')}
          className={clsx('pointer-events-auto overflow-y-auto overscroll-contain rounded-2xl bg-black/85 text-sm shadow-xl backdrop-blur',
            kb ? `${KEYBOARD_DOCK} ${KEYBOARD_PANEL} p-2` : 'absolute top-full left-1/2 z-10 mt-2 max-h-[calc(100dvh-8.5rem)] w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 p-3 short:max-h-[calc(100dvh-7.25rem)]')}>
          <div className="mb-2 flex items-center gap-2">
            <Vote className="size-5 text-[#9cc4ff]" /><h2 className="me-auto min-w-0 truncate font-bold" dir="auto">{v ? v.question || t('defaultQuestion') : t('title')}</h2>
            <button type="button" onClick={() => onOpen(false)} aria-label={t('close')} className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
          </div>
          {v ? (
            <>
              <p className="mb-2 text-xs text-white/65">{t('askedBy', { name: names(v.by) })} · {v.open ? t('votes', { n: total }) : t('closed', { n: total })}</p>
              <div className="grid grid-cols-3 gap-2">
                {CHOICES.map((c) => (
                  <button key={c} type="button" disabled={!v.open} onClick={() => quickVote.cast(c)} aria-pressed={mine === c}
                    className={clsx('flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 disabled:opacity-90', mine === c ? 'bg-white/25 ring-2 ring-white/70' : 'bg-white/10 hover:bg-white/20')}>
                    <span className="text-2xl leading-none">{FACE[c]}</span><span className="text-xs">{t(c)} · <b className="tabular-nums">{counts![c]}</b></span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
                {total > 0 && CHOICES.map((c) => <div key={c} className={BAR[c]} style={{ width: `${(counts![c] / total) * 100}%` }} />)}
              </div>
              {total > 0 && <p className="mt-1.5 text-xs leading-5 text-white/70" dir="auto">{CHOICES.filter((c) => counts![c]).map((c) => `${FACE[c]} ${Object.entries(v.votes).filter(([, x]) => x === c).map(([id]) => names(id)).join('، ')}`).join('  ·  ')}</p>}
              <div className="mt-2 flex gap-2">
                {v.open
                  ? <button type="button" onClick={() => quickVote.end()} className="min-h-11 flex-1 rounded-xl bg-white/15 font-semibold hover:bg-white/25">{t('end')}</button>
                  : <button type="button" onClick={() => quickVote.clear()} className="min-h-11 flex-1 rounded-xl bg-white/15 font-semibold hover:bg-white/25">{t('clear')}</button>}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); quickVote.start(question); setQuestion(''); }} className="flex flex-col gap-2">
              <p className="text-xs leading-5 text-white/65">{t('hint')}</p>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} dir="auto" placeholder={t('placeholder')}
                className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 text-white placeholder:text-white/45 focus:border-white/60 focus:outline-none" />
              <button type="submit" className="min-h-11 rounded-xl bg-[#5b8def] font-semibold active:scale-95">{t('start')}</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
