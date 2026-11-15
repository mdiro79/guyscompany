'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Bot, Flag, RotateCcw } from 'lucide-react';
import { bestMove, inCheck, type Color } from './chess';
import { chessGame, useChess } from './chessGame';
import { chessPromote } from '../ChessTable';

const GLYPH = { q: '♛', r: '♜', b: '♝', n: '♞' } as const;

/**
 * Beside the chess table while sitting at it: who plays which side, whose turn it is, check and the end of
 * the game, the last moves, the promotion choice and new game / resign. With nobody on the other chair the
 * computer plays it, from this device.
 */
export function ChessPanel({ color, opponent, onEmote }: { color: Color; opponent: string | null; onEmote: (id: 'party' | 'sad' | 'thinking') => void }) {
  const t = useTranslations('office.chess');
  const s = useChess();
  const pending = useSyncExternalStore((l) => chessPromote.subscribe(l), () => chessPromote.pending, () => null);
  const vsBot = !opponent;
  const mine = s.pos.turn === color && !s.result;

  // The computer's move, a moment after the player's (it "thinks" for a bit).
  useEffect(() => {
    if (!vsBot || s.result || s.pos.turn === color) return;
    const id = setTimeout(() => {
      const now = chessGame.get();
      if (now.result || now.pos.turn === color) return;
      const m = bestMove(now.pos, 3);
      if (m) chessGame.move(m, now.pos.turn);
    }, 700);
    return () => clearTimeout(id);
  }, [vsBot, s, color]);

  // The end of a game: a cheer from the winner, a sigh from the other (seen above their heads).
  const ended = useRef(s.game);
  useEffect(() => {
    if (!s.result || ended.current === s.game) return;
    ended.current = s.game;
    onEmote(s.result.winner === color ? 'party' : s.result.winner ? 'sad' : 'thinking');
  }, [s.result, s.game, color, onEmote]);

  const side = (c: Color) => (c === color ? t('you') : opponent ?? t('computer'));
  const status = s.result
    ? s.result.winner ? t(`won_${s.result.reason}`, { name: side(s.result.winner) }) : t(`draw_${s.result.reason}`)
    : mine ? (inCheck(s.pos) ? t('yourTurnCheck') : t('yourTurn')) : t('theirTurn', { name: side(s.pos.turn) });
  const moves: string[] = [];
  for (let i = Math.max(0, s.sans.length - 8 - (s.sans.length % 2)); i < s.sans.length; i += 2) moves.push(`${i / 2 + 1}. ${s.sans[i]}${s.sans[i + 1] ? ` ${s.sans[i + 1]}` : ''}`);

  return (
    <div className="pointer-events-auto w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl bg-black/75 p-3 text-sm shadow-xl backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">♞</span>
        <h2 className="me-auto font-bold">{t('title')}</h2>
        {vsBot && <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px]"><Bot className="size-3.5" />{t('computer')}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        {(['w', 'b'] as const).map((c) => (
          <div key={c} className={clsx('flex items-center gap-1.5 rounded-lg px-2 py-1.5', s.pos.turn === c && !s.result ? 'bg-white/20 ring-1 ring-white/50' : 'bg-white/5')}>
            <span className={clsx('size-3 shrink-0 rounded-full', c === 'w' ? 'bg-[#f0e3c8]' : 'bg-[#3a2a20] ring-1 ring-white/40')} />
            <span className="truncate">{side(c)}</span>
          </div>
        ))}
      </div>
      <p role="status" className={clsx('mt-2 rounded-lg px-2 py-1.5 text-center font-semibold', s.result ? 'bg-[#2f5d45]' : mine ? 'bg-[#5b8def]/70' : 'bg-white/10')}>{status}</p>
      {!s.result && !s.sans.length && <p className="mt-1.5 text-[11px] leading-4 text-white/60">{t('how')}</p>}
      {pending && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="text-xs text-white/70">{t('promote')}</span>
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button key={p} type="button" onClick={() => chessPromote.choose(p, color)} aria-label={t(`piece_${p}`)} title={t(`piece_${p}`)}
              className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-2xl hover:bg-white/25">{GLYPH[p]}</button>
          ))}
        </div>
      )}
      {moves.length > 0 && <p className="mt-2 text-xs leading-5 text-white/75" dir="ltr">{moves.join('  ')}</p>}
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={() => chessGame.newGame()} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 text-xs font-semibold hover:bg-white/25"><RotateCcw className="size-4" />{t('newGame')}</button>
        {!s.result && s.sans.length > 0 && <button type="button" onClick={() => chessGame.resign(color)} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 text-xs font-semibold hover:bg-white/20"><Flag className="size-4" />{t('resign')}</button>}
      </div>
    </div>
  );
}
