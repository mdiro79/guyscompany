'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { GameApi } from '../kit/types';
import { buzz, sfx } from '../kit/sfx';

// Bug Squash, the office's first arcade game: bugs pop up on a 4×4 board for a moment; squash as many as
// you can in 30 seconds. A golden bug is worth 5, five in a row give a bonus, and the sparkle is a
// feature, not a bug: leave it alone. Played with taps or the mouse.

const ROUND_MS = 30000, CELLS = 16, TICK_MS = 80;
type Kind = 'bug' | 'gold' | 'feature';
interface Cell { kind: Kind; until: number; hit?: number }
const FACE: Record<Kind, string> = { bug: '🐞', gold: '🪲', feature: '✨' };

export default function Bugs({ api }: { api: GameApi }) {
  const [cells, setCells] = useState<(Cell | null)[]>(() => Array(CELLS).fill(null));
  const [left, setLeft] = useState(ROUND_MS);
  const live = useRef({ cells, score: 0, streak: 0, elapsed: 0, nextSpawn: 300, last: 0, over: false });
  useEffect(() => {
    const s = live.current;
    s.last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(), dt = now - s.last;
      s.last = now;
      if (!api.running() || s.over) return;
      s.elapsed += Math.min(dt, 250); // a paused round does not lose time
      const at = s.elapsed;
      if (at >= ROUND_MS) { s.over = true; setLeft(0); api.end(s.score); return; }
      const pace = at / ROUND_MS; // 0 → 1: faster and shorter towards the end
      let next = s.cells;
      // A missed bug breaks the streak; hit marks fade.
      if (next.some((c) => c && at > (c.hit ? c.hit + 220 : c.until))) {
        next = next.map((c) => {
          if (!c) return c;
          if (c.hit) return at > c.hit + 220 ? null : c;
          if (at > c.until) { if (c.kind !== 'feature') s.streak = 0; return null; }
          return c;
        });
      }
      if (at >= s.nextSpawn) {
        const free = next.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
        if (free.length) {
          const roll = Math.random();
          const kind: Kind = roll < 0.08 ? 'gold' : roll < 0.2 + pace * 0.08 ? 'feature' : 'bug';
          next = next.slice();
          next[free[Math.floor(Math.random() * free.length)]] = { kind, until: at + (kind === 'gold' ? 800 : 1350) - pace * 500 };
        }
        s.nextSpawn = at + 640 - pace * 330 + Math.random() * 120;
      }
      if (next !== s.cells) { s.cells = next; setCells(next); }
      setLeft(ROUND_MS - at);
      api.hud(`⏱ ${Math.ceil((ROUND_MS - at) / 1000)}`);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [api]);

  const hit = (i: number) => {
    const s = live.current, c = s.cells[i];
    if (!api.running() || s.over || !c || c.hit) return;
    if (c.kind === 'feature') { s.score = Math.max(0, s.score - 3); s.streak = 0; sfx.bad(); }
    else {
      s.streak += 1;
      s.score += (c.kind === 'gold' ? 5 : 1) + (s.streak % 5 === 0 ? 2 : 0);
      if (c.kind === 'gold') sfx.good(); else sfx.point(s.streak);
    }
    s.cells = s.cells.slice(); s.cells[i] = { ...c, hit: s.elapsed };
    setCells(s.cells); api.score(s.score);
    buzz(12);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <div className="h-3 w-[min(22rem,90%)] overflow-hidden rounded-full border-2 border-[var(--a-edge)] bg-[var(--a-card)]"><div className={clsx('h-full transition-[width] duration-100', left < 8000 ? 'bg-[#ff6b5e]' : 'bg-[#3ccf91]')} style={{ width: `${(left / ROUND_MS) * 100}%` }} /></div>
      <div className="grid aspect-square w-[min(24rem,92%,calc(100dvh-13rem))] touch-manipulation grid-cols-4 gap-2 rounded-3xl border-2 border-[var(--a-edge)] bg-[var(--a-panel)] p-3 shadow-[0_6px_0_var(--a-edge)]" dir="ltr">
        {cells.map((c, i) => (
          <button key={i} type="button" onPointerDown={(e) => { e.preventDefault(); hit(i); }} aria-label={c ? c.kind : 'empty'}
            className={clsx('flex items-center justify-center rounded-2xl border-2 border-[var(--a-edge)] text-[min(9vw,2.4rem)] leading-none transition-colors select-none',
              c?.hit ? (c.kind === 'feature' ? 'bg-[#ff6b5e]' : 'bg-[#3ccf91]') : 'bg-[var(--a-card)] active:bg-[var(--a-chip2)]')}>
            <span className={clsx('transition-transform duration-100', c ? (c.hit ? 'scale-50 opacity-70' : 'scale-100') : 'scale-0')}>{c ? (c.hit && c.kind !== 'feature' ? '💥' : FACE[c.kind]) : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
