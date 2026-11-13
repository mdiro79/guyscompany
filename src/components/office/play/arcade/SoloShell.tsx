'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Flag, Pause, Play, RotateCcw, Trophy, Users } from 'lucide-react';
import { syncedNow } from '@/lib/realtime/room';
import { ARCADE } from '@/lib/arcade';
import type { GameDef } from './registry';
import type { ArcadeCtx } from './Arcade';
import { ScoreRows } from './Arcade';
import type { GameApi } from './kit/types';
import { newSeed } from './kit/rng';
import { sfx } from './kit/sfx';
import { arcadeNet, useArcadeNet } from './net';
import { arcadeScores, useArcadeScores } from './scores';
import { GameBoundary, MEDALS, Portrait, TopBar, btnGold, btnSoft, card, iconBtn } from './ui';

// The screen of a solo game: how to play and the table before a round, the game itself, the result after.
// Any solo game can also be raced: everyone at the table plays the very same round at the same time and
// sees the others' scores live.

type Phase = 'ready' | 'count' | 'play' | 'over';
const REPORT_WAIT_MS = 30000; // a finished racer's round is recorded at the latest after this (a slow rival must not hold it back)

export function SoloShell({ def, ctx, onBack }: { def: GameDef; ctx: ArcadeCtx; onBack: () => void }) {
  const t = useTranslations('office');
  const net = useArcadeNet();
  useArcadeScores();
  const race = net.mine && net.mine.mode === 'race' && net.mine.game === def.id ? net.mine : null;
  const [Game, setGame] = useState<ComponentType<{ api: GameApi }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    def.load().then((m) => { if (on) setGame(() => m.default); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [def]);

  const [phase, setPhase] = useState<Phase>('ready');
  const [run, setRun] = useState(0);
  const [seed, setSeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [final, setFinal] = useState(0);
  const [record, setRecord] = useState(false);
  const [hud, setHud] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const live = useRef({ phase, paused, racing: false });
  live.current.phase = phase; live.current.paused = paused; live.current.racing = !!race;
  const scoreEl = useRef<HTMLSpanElement>(null);
  const scoreNow = useRef(0), lastPost = useRef(0);
  const pending = useRef<number | null>(null); // a finished race round not recorded yet
  const fmt = useCallback((n: number) => n.toLocaleString(ctx.locale), [ctx.locale]);

  const start = useCallback((s: number) => {
    scoreNow.current = 0;
    if (scoreEl.current) scoreEl.current.textContent = '0';
    setSeed(s); setRun((r) => r + 1); setPaused(false); setHud(null); setRecord(false); setPhase('play');
    live.current.phase = 'play'; live.current.paused = false;
    sfx.start();
  }, []);

  const flush = useCallback((won: boolean) => {
    if (pending.current === null) return;
    const score = pending.current;
    pending.current = null;
    setRecord(arcadeScores.report(def.id, won ? { score, won: true } : { score }));
  }, [def.id]);

  const finish = useCallback((raw: number) => {
    if (live.current.phase !== 'play') return;
    live.current.phase = 'over';
    const score = Math.max(0, Math.min(ARCADE[def.id].cap, Math.floor(Number.isFinite(raw) ? raw : 0)));
    setFinal(score); setPhase('over'); setPaused(false);
    if (live.current.racing) { arcadeNet.postScore(score, true); pending.current = score; sfx.good(); }
    else { const rec = arcadeScores.report(def.id, { score }); setRecord(rec); if (rec) sfx.great(); else sfx.lose(); }
  }, [def.id]);

  const tg = useTranslations(`office.games.${def.id}`);
  const api = useMemo<GameApi>(() => ({
    seed, phone: ctx.phone, rtl: ctx.rtl,
    score(n) {
      const v = Math.max(0, Math.floor(n));
      if (v === scoreNow.current) return;
      scoreNow.current = v;
      if (scoreEl.current) scoreEl.current.textContent = fmt(v);
      const now = performance.now();
      if (live.current.racing && now - lastPost.current > 350) { lastPost.current = now; arcadeNet.postScore(v, false); }
    },
    hud(text) { setHud((p) => (p === text ? p : text)); },
    end: finish,
    running: () => live.current.phase === 'play' && !live.current.paused,
    t: (key, values) => tg(key, values),
    // A new object per round, so a stale game cannot touch the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [run, seed]);

  // ——— Race ———
  const racers = race ? arcadeNet.humans(race) : [];
  const standing = racers.map((id) => ({ id, score: net.live[id]?.score ?? 0, done: !!net.live[id]?.done, away: !!race && id !== ctx.meId && arcadeNet.gone(race, id) }))
    .sort((a, b) => b.score - a.score);
  const raceRunning = !!race && race.round > 0 && race.status !== 'lobby';
  const raceOver = raceRunning && standing.length > 0 && standing.every((r) => r.done || r.away);
  const winner = raceOver && standing.length > 1 && standing[0].score > standing[1].score ? standing[0].id : null;
  const iHost = race?.host === ctx.meId;
  const hostGone = !!race && !iHost && arcadeNet.gone(race, race.host);
  // A new round of the race: count down to the shared start, then everyone plays the same seed.
  const started = useRef(0);
  const roundKey = race && race.status === 'play' ? race.round : 0;
  useEffect(() => {
    if (!race || !roundKey || started.current === roundKey) return;
    started.current = roundKey;
    flush(false);
    setPhase('count'); live.current.phase = 'count';
    const tick = () => {
      const left = race.startAt - syncedNow();
      if (left <= 0) { clearInterval(id); start(race.seed); return; }
      setCount(Math.ceil(left / 1000));
    };
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  // The race is decided: record my round (a win counts), and the host closes the round.
  useEffect(() => {
    if (!raceOver) return;
    flush(winner === ctx.meId);
    if (iHost && race?.status === 'play') arcadeNet.finishRace();
    if (winner === ctx.meId) sfx.win();
  }, [raceOver, winner, ctx.meId, iHost, race?.status, flush]);
  useEffect(() => {
    if (phase !== 'over' || pending.current === null) return;
    const id = setTimeout(() => flush(false), REPORT_WAIT_MS);
    return () => clearTimeout(id);
  }, [phase, flush]);
  // Left the table or the screen with a round not recorded yet.
  useEffect(() => { if (!race) flush(false); }, [race, flush]);
  useEffect(() => () => flush(false), [flush]);

  const canStartRace = iHost && racers.filter((id) => id === ctx.meId || arcadeNet.present(id)).length >= 2 && (race?.status !== 'play' || raceOver);
  const begin = useCallback(() => {
    if (!Game) return;
    if (race) { if (canStartRace) arcadeNet.start(); return; }
    start(newSeed());
  }, [Game, race, canStartRace, start]);
  const leaveRace = () => { flush(false); arcadeNet.leave(); if (phase === 'count') setPhase('ready'); };

  // Keys of the shell (the game has its own): Enter starts, P pauses, Esc pauses or goes back.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select')) return;
      const ph = live.current.phase;
      if (e.code === 'KeyP' && ph === 'play' && !live.current.racing) setPaused((p) => !p);
      else if (e.code === 'Escape') { if (ph === 'play' && !live.current.racing && !live.current.paused) setPaused(true); else onBack(); }
      else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && (ph === 'ready' || ph === 'over')) { e.preventDefault(); begin(); }
      else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && live.current.paused) setPaused(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [begin, onBack]);
  // A hidden tab pauses a solo round.
  useEffect(() => {
    const h = () => { if (document.hidden && live.current.phase === 'play' && !live.current.racing) setPaused(true); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  const labels = { back: t('hub.back'), close: t('hub.close'), mute: t('hub.mute'), unmute: t('hub.unmute'), theme: t('hub.theme') };
  const best = arcadeScores.of(def.id)?.best ?? 0;
  const others = arcadeNet.othersOnline().length;
  const inGame = phase === 'play' || phase === 'over';
  const racePanel = race && (
    <div className={clsx(card, 'flex flex-col gap-2')}>
      <div className="flex items-center gap-2 text-sm font-bold"><Flag className="size-4 text-[var(--a-coral)]" />{t('hub.raceTitle')}<span className="ms-auto text-xs font-normal text-[var(--a-soft)]">{standing.length}</span></div>
      <ol className="space-y-1">
        {standing.map((r, i) => (
          <li key={r.id} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', r.id === ctx.meId ? 'bg-[var(--a-sun-soft)]' : 'bg-[var(--a-chip)]', r.away && 'opacity-50')}>
            <span className="w-5 text-center">{raceOver ? MEDALS[i + 1] ?? i + 1 : ''}</span>
            <Portrait person={ctx.people.find((p) => p.id === r.id)} size="size-6" />
            <span className="me-auto truncate">{ctx.name(r.id)}{r.id === race.host && ' ★'}</span>
            {raceRunning && <span className="font-bold tabular-nums text-[var(--a-good)]">{fmt(r.score)}</span>}
            {raceRunning && !r.done && !r.away && <span className="size-2 animate-pulse rounded-full bg-[#ff6b5e]" />}
          </li>
        ))}
      </ol>
      {raceOver && <p className="text-center text-sm font-bold text-[var(--a-gold)]">{winner === ctx.meId ? t('hub.raceWon') : winner ? t('hub.raceWinner', { name: ctx.name(winner) }) : t('hub.draw')}</p>}
      {raceRunning && !raceOver && phase === 'over' && <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.raceWaiting')}</p>}
      {hostGone ? <p className="text-center text-xs text-[var(--a-coral)]">{t('hub.hostLeft')}</p>
        : iHost ? <button type="button" onClick={begin} disabled={!canStartRace} className={btnGold}><Flag className="size-5" />{raceRunning ? t('hub.raceAgain') : t('hub.raceStart')}</button>
          : (!raceRunning || raceOver) && <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.raceWaitHost', { name: ctx.name(race.host) })}</p>}
      {iHost && !canStartRace && (!raceRunning || raceOver) && <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.raceNeed')}</p>}
      <button type="button" onClick={leaveRace} className={clsx(btnSoft, 'min-h-10 text-sm')}>{t('hub.raceLeave')}</button>
    </div>
  );

  return (
    <>
      <TopBar title={t(`games.${def.id}.name`)} icon={def.icon} color={def.color} onBack={onBack} onClose={ctx.onClose} rtl={ctx.rtl} labels={labels}>
        {inGame && hud && <span dir="ltr" className="max-w-[9rem] truncate rounded-lg bg-[var(--a-chip)] px-2.5 py-1.5 text-xs font-semibold tabular-nums sm:max-w-none sm:text-sm">{hud}</span>}
        <span dir="ltr" className={clsx('items-center gap-1 rounded-lg bg-[var(--a-chip)] px-3 py-1.5 text-sm font-bold tabular-nums', inGame ? 'flex' : 'hidden')}><span ref={scoreEl} className="text-[var(--a-good)]">0</span></span>
        {phase === 'play' && !race && <button type="button" onClick={(e) => { e.currentTarget.blur(); setPaused((p) => !p); }} aria-label={paused ? t('hub.resume') : t('hub.pause')} className={iconBtn}>{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</button>}
      </TopBar>
      {race && inGame && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-safe pb-1.5 scrollbar-thin">
          {standing.map((r) => (
            <span key={r.id} className={clsx('flex shrink-0 items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-2.5 text-xs', r.id === ctx.meId ? 'bg-[var(--a-sun-soft)]' : 'bg-[var(--a-chip)]', r.away && 'opacity-50')}>
              <Portrait person={ctx.people.find((p) => p.id === r.id)} size="size-6" /><span className="max-w-20 truncate">{ctx.name(r.id)}</span><b className="tabular-nums text-[var(--a-good)]">{fmt(r.score)}</b>{r.done && <span>🏁</span>}
            </span>
          ))}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-2 sm:inset-3">
          {inGame && Game && (
            <GameBoundary key={run} fallback={<div className="flex h-full items-center justify-center"><p className="rounded-2xl bg-[var(--a-chip)] p-4 text-sm">{t('hub.error')}</p></div>}>
              <Game api={api} />
            </GameBoundary>
          )}
        </div>
        {phase === 'count' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><span key={count} className="gc-pop text-8xl font-black text-[var(--a-gold)] drop-shadow-[0_5px_0_var(--a-edge)]">{count || t('hub.raceGo')}</span><span className="text-sm text-[var(--a-soft)]">{t('hub.raceCount')}</span></div>
        )}
        {paused && phase === 'play' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--a-veil)]">
            <div className={clsx(card, 'flex w-[min(20rem,90%)] flex-col gap-3 bg-[var(--a-panel)] text-center')}>
              <p className="text-lg font-extrabold">{t('hub.paused')}</p>
              <button type="button" onClick={() => setPaused(false)} className={btnGold}><Play className="size-5" />{t('hub.resume')}</button>
              <button type="button" onClick={onBack} className={btnSoft}>{t('hub.back')}</button>
            </div>
          </div>
        )}
        {(phase === 'ready' || phase === 'over') && (
          <div className={clsx('absolute inset-0 z-10 overflow-y-auto overscroll-contain px-3 py-2 scrollbar-thin', phase === 'over' && 'bg-[var(--a-veil)] ')}>
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 md:flex-row md:items-start md:justify-center md:pt-6 short:flex-row short:items-start">
              <div className={clsx(card, 'flex min-w-0 flex-1 flex-col gap-3 bg-[var(--a-panel)]')}>
                {phase === 'over' ? (
                  <div className="text-center">
                    <p className="text-sm text-[var(--a-soft)]">{t('hub.score')}</p>
                    <p className="gc-pop text-5xl font-black tabular-nums" style={{ color: `color-mix(in oklab, ${def.color} 75%, var(--a-ink))` }}>{fmt(final)}</p>
                    {record ? <p className="mt-1 font-extrabold text-[var(--a-gold)]">🏆 {t('hub.record')}</p> : <p className="mt-1 flex items-center justify-center gap-1 text-sm text-[var(--a-soft)]"><Trophy className="size-4 text-[var(--a-gold)]" />{t('hub.best')}: {fmt(Math.max(best, final))}</p>}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl border-2 border-[var(--a-edge)] text-4xl shadow-[0_4px_0_var(--a-edge)]" style={{ background: def.color }}>{def.icon}</span>
                      <div className="min-w-0"><p className="truncate text-xl font-black">{t(`games.${def.id}.name`)}</p><p className="text-sm leading-5 text-[var(--a-soft)]">{t(`games.${def.id}.tag`)}</p></div>
                    </div>
                    <div className="rounded-xl bg-[var(--a-chip)] p-3 text-sm leading-6 whitespace-pre-line text-[var(--a-soft)]">
                      <p className="mb-1 text-xs font-bold text-[var(--a-soft)]">{t('hub.howTo')}</p>
                      {t(`games.${def.id}.how`)}
                      <p className="mt-2 text-xs text-[var(--a-sky)]">{t(`games.${def.id}.${ctx.phone ? 'touch' : 'keys'}`)}</p>
                    </div>
                  </>
                )}
                {failed ? <p className="rounded-xl bg-[var(--a-sun-soft)] p-3 text-center text-sm">{t('hub.error')}</p>
                  : !race && <button type="button" onClick={begin} disabled={!Game} className={btnGold}>{phase === 'over' ? <RotateCcw className="size-5" /> : <Play className="size-5" />}{!Game ? t('hub.loading') : phase === 'over' ? t('hub.again') : t('hub.start')}</button>}
                {!race && !failed && (
                  <button type="button" disabled={!others} onClick={() => arcadeNet.host(def.id, 'race', [{ k: 'human', id: ctx.meId }])} className={clsx(btnSoft, 'min-h-11 text-sm')} title={t('hub.raceHint')}>
                    <Users className="size-4" />{t('hub.race')}{!others && <span className="text-xs font-normal text-[var(--a-soft)]">· {t('hub.nobody')}</span>}
                  </button>
                )}
                {racePanel}
                {phase === 'over' && <button type="button" onClick={onBack} className={clsx(btnSoft, 'min-h-11 text-sm')}>{t('hub.back')}</button>}
              </div>
              <div className={clsx(card, 'w-full shrink-0 bg-[var(--a-panel)] md:w-64 short:w-56')}>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Trophy className="size-4 text-[var(--a-gold)]" />{t('hub.top')}</p>
                <ScoreRows game={def.id} ctx={ctx} />
                {!race && <p className="mt-2 text-[11px] leading-4 text-[var(--a-soft)]">{t('hub.raceHint')}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
