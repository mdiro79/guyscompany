'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { X, Play, RotateCcw, Trophy } from 'lucide-react';
import { music } from './music';
import { arcadeScores, useArcadeScores } from './scores';

// "Bug Squash", the arcade cabinet's game: bugs pop up on a 4×4 board for a moment; squash as many as
// you can in 30 seconds. A golden bug is worth 5, five in a row give a bonus, and the sparkle is a
// feature, not a bug: leave it alone. Played with taps or the mouse, the same on phones and computers.

const ROUND_MS = 30000, CELLS = 16, TICK_MS = 80;
type Kind = 'bug' | 'gold' | 'feature';
interface Cell { kind: Kind; until: number; hit?: number }
const FACE: Record<Kind, string> = { bug: '🐞', gold: '🪲', feature: '✨' };

export function ArcadeGame({ people, meId, onClose }: { people: { id: string; name: string }[]; meId: string; onClose: () => void }) {
  const t = useTranslations('office.arcade');
  const scores = useArcadeScores();
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [cells, setCells] = useState<(Cell | null)[]>(() => Array(CELLS).fill(null));
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(ROUND_MS);
  const [record, setRecord] = useState(false);
  const live = useRef({ cells, score: 0, streak: 0, startedAt: 0, nextSpawn: 0 });

  const start = useCallback(() => {
    const now = performance.now();
    live.current = { cells: Array(CELLS).fill(null), score: 0, streak: 0, startedAt: now, nextSpawn: now + 300 };
    setCells(live.current.cells); setScore(0); setLeft(ROUND_MS); setRecord(false); setPhase('play');
    music().blip([72, 76, 79], 'square', 0.08);
  }, []);

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setInterval(() => {
      const s = live.current, now = performance.now(), elapsed = now - s.startedAt;
      if (elapsed >= ROUND_MS) {
        setLeft(0); setPhase('over');
        setRecord(arcadeScores.report(s.score));
        music().blip([79, 76, 72, 67], 'triangle', 0.12, 0.14);
        return;
      }
      const pace = elapsed / ROUND_MS; // 0 → 1: faster and shorter towards the end
      let next = s.cells;
      // A missed bug breaks the streak; hit marks fade.
      if (next.some((c) => c && now > (c.hit ? c.hit + 220 : c.until))) {
        next = next.map((c) => {
          if (!c) return c;
          if (c.hit) return now > c.hit + 220 ? null : c;
          if (now > c.until) { if (c.kind !== 'feature') s.streak = 0; return null; }
          return c;
        });
      }
      if (now >= s.nextSpawn) {
        const free = next.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
        if (free.length) {
          const roll = Math.random();
          const kind: Kind = roll < 0.08 ? 'gold' : roll < 0.2 + pace * 0.08 ? 'feature' : 'bug';
          next = next.slice();
          next[free[Math.floor(Math.random() * free.length)]] = { kind, until: now + (kind === 'gold' ? 800 : 1350) - pace * 500 };
        }
        s.nextSpawn = now + 640 - pace * 330 + Math.random() * 120;
      }
      if (next !== s.cells) { s.cells = next; setCells(next); }
      setLeft(ROUND_MS - elapsed);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  const hit = (i: number) => {
    const s = live.current, c = s.cells[i];
    if (phase !== 'play' || !c || c.hit) return;
    if (c.kind === 'feature') { s.score = Math.max(0, s.score - 3); s.streak = 0; music().blip([50, 46], 'sawtooth', 0.09); }
    else {
      s.streak += 1;
      s.score += (c.kind === 'gold' ? 5 : 1) + (s.streak % 5 === 0 ? 2 : 0);
      music().blip(c.kind === 'gold' ? [84, 88, 91] : [76 + Math.min(12, s.streak)], 'square', 0.07, 0.07);
    }
    s.cells = s.cells.slice(); s.cells[i] = { ...c, hit: performance.now() };
    setCells(s.cells); setScore(s.score);
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
      if ((e.code === 'Enter' || e.code === 'Space') && phase !== 'play') { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, phase, start]);

  const table = Object.entries(scores).map(([id, best]) => ({ id, best, name: people.find((p) => p.id === id)?.name ?? '—' })).sort((a, b) => b.best - a.best).slice(0, 4);
  const best = scores[meId] ?? 0;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0b0d24]/90 p-3 backdrop-blur-sm" role="dialog" aria-label={t('title')}>
      <div className="flex max-h-full w-[min(26rem,100%)] flex-col gap-3 overflow-y-auto rounded-3xl border-2 border-[#3a3f8f] bg-[#14173a] p-4 shadow-2xl short:w-[min(44rem,100%)] short:flex-row short:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐞</span>
            <h2 className="me-auto truncate text-lg font-extrabold text-[#ffd23f]">{t('title')}</h2>
            <button type="button" onClick={onClose} aria-label={t('close')} className="flex size-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><X className="size-5" /></button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-1.5 font-bold tabular-nums">{t('score')}: <span className="text-[#7dffb0]">{score}</span></span>
            <span className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 tabular-nums"><Trophy className="size-4 text-[#ffd23f]" />{best}</span>
            <span className="ms-auto tabular-nums text-white/80">{Math.ceil(left / 1000)}s</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={clsx('h-full rounded-full transition-[width] duration-100', left < 8000 ? 'bg-[#ff6b5b]' : 'bg-[#7dffb0]')} style={{ width: `${(left / ROUND_MS) * 100}%` }} /></div>
          {phase !== 'play' && (
            <div className="rounded-2xl bg-white/5 p-3 text-sm leading-6">
              {phase === 'over' ? (
                <p className="text-center text-base font-bold">{record ? t('record', { score }) : t('result', { score })}</p>
              ) : <p className="text-white/85">{t('how')}</p>}
              {table.length > 0 && (
                <ol className="mt-2 space-y-1">
                  {table.map((r, i) => (
                    <li key={r.id} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1', r.id === meId ? 'bg-[#ffd23f]/15' : 'bg-white/5')}>
                      <span className="w-5 text-center">{['🥇', '🥈', '🥉', '4'][i]}</span><span className="me-auto truncate">{r.name}</span><span className="font-bold tabular-nums text-[#7dffb0]">{r.best}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button type="button" onClick={start} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ffd23f] text-base font-extrabold text-[#14173a] transition active:scale-95">
                {phase === 'over' ? <RotateCcw className="size-5" /> : <Play className="size-5" />}{phase === 'over' ? t('again') : t('start')}
              </button>
            </div>
          )}
        </div>
        <div className="mx-auto grid aspect-square w-full max-w-[min(22rem,62dvh)] shrink-0 touch-manipulation grid-cols-4 gap-1.5 short:w-[min(18rem,78dvh)]" dir="ltr">
          {cells.map((c, i) => (
            <button key={i} type="button" onPointerDown={(e) => { e.preventDefault(); hit(i); }} aria-label={c ? c.kind : 'empty'}
              className={clsx('flex items-center justify-center rounded-2xl text-[min(9vw,2.4rem)] leading-none transition-colors select-none',
                c?.hit ? (c.kind === 'feature' ? 'bg-[#ff6b5b]/50' : 'bg-[#7dffb0]/40') : 'bg-[#232869] active:bg-[#2f3590]')}>
              <span className={clsx('transition-transform duration-100', c ? (c.hit ? 'scale-50 opacity-60' : 'scale-100') : 'scale-0')}>{c ? (c.hit && c.kind !== 'feature' ? '💥' : FACE[c.kind]) : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
