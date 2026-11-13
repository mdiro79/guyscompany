'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Bot, Play, RotateCcw, Smartphone, Trophy, Users, Wifi } from 'lucide-react';
import type { GameDef } from './registry';
import type { ArcadeCtx } from './Arcade';
import { ScoreRows } from './Arcade';
import { arcadeNet, useArcadeNet, type Room, type Seat } from './net';
import { arcadeScores, useArcadeScores } from './scores';
import { newSeed } from './kit/rng';
import { sfx } from './kit/sfx';
import { SEAT_COLORS, type BoardProps, type Outcome, type Rules } from './rules/types';
import { GameBoundary, Portrait, TopBar, btnGold, btnSoft, card } from './ui';

// The screen of a head-to-head game: choose the opponent (the computer, a teammate over the network, or
// a second player on this device), wait at the table, play, see the result and play again.

/** What a real-time game (both play at once) gets instead of a board. */
export interface RtProps {
  room: Room; seat: number; // my seat
  host: boolean; // this device runs the game for everyone at the table
  names: string[]; colors: string[]; bots: boolean[];
  finish(winners: number[]): void;
  phone: boolean; rtl: boolean;
  t(key: string, values?: Record<string, string | number>): string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRules = Rules<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Loaded { Board: ComponentType<any>; rules: AnyRules | null }

const BOT_DELAY_MS = 750;

export function VersusShell({ def, ctx, onBack }: { def: GameDef; ctx: ArcadeCtx; onBack: () => void }) {
  const t = useTranslations('office');
  const tg = useTranslations(`office.games.${def.id}`);
  const net = useArcadeNet();
  useArcadeScores();
  const room = net.mine && net.mine.mode === 'match' && net.mine.game === def.id ? net.mine : null;
  const [mod, setMod] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    def.load().then((m) => { if (on) setMod({ Board: m.default, rules: (m.rules as AnyRules | undefined) ?? null }); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [def]);
  const [min, max] = def.players ?? [2, 2];
  const [count, setCount] = useState(min);
  const me = ctx.meId;
  const others = arcadeNet.othersOnline().length;
  const labels = { back: t('hub.back'), close: t('hub.close'), mute: t('hub.mute'), unmute: t('hub.unmute'), theme: t('hub.theme') };
  const gt = useCallback((key: string, values?: Record<string, string | number>) => tg(key, values), [tg]);

  const first = (r: Room | null) => ((r?.round ?? 0)) % (r?.seats.length ?? count);
  const open = (kind: 'bot' | 'team' | 'local') => {
    // A growing table starts with its host alone: whoever joins gets a new seat.
    const grows = !!def.grow && kind === 'team';
    const seats: Seat[] = [{ k: 'human', id: me }, ...(grows ? [] : Array.from({ length: count - 1 }, (): Seat => (kind === 'bot' ? { k: 'bot' } : kind === 'local' ? { k: 'local' } : { k: 'open' })))];
    const seed = newSeed();
    arcadeNet.host(def.id, 'match', seats, kind === 'team' ? null : mod?.rules ? mod.rules.init(count, seed, 0) : null, grows);
    sfx.start();
  };
  const startMatch = () => {
    if (!room || room.host !== me) return;
    arcadeNet.start(mod?.rules ? mod.rules.init(room.seats.length, newSeed(), first(room)) : null);
    sfx.start();
  };

  // ——— The match ———
  const rules = mod?.rules ?? null;
  const playing = !!room && room.status !== 'lobby';
  const rt = !!def.realtime;
  const mySeats = useMemo(() => (room ? room.seats.flatMap((s, i) => ((s.k === 'human' && s.id === me) || (s.k === 'local' && room.host === me) ? [i] : [])) : []), [room, me]);
  const names = useMemo(() => (room ? room.seats.map((s, i) => (s.k === 'human' ? ctx.name(s.id) : s.k === 'bot' ? `${t('hub.seatBot')}${room.seats.filter((x) => x.k === 'bot').length > 1 ? ` ${i}` : ''}` : s.k === 'local' ? t('hub.seatGuest', { n: i + 1 }) : '…')) : []), [room, ctx, t]);
  const state = room?.state;
  let turn = -1, outcome: Outcome | null = null, broken = false;
  if (playing && state != null) {
    try {
      if (rules) { turn = rules.turn(state); outcome = rules.result(state); }
      else { const w = (state as { winners?: unknown }).winners; if (Array.isArray(w)) outcome = { winners: w.filter((x): x is number => Number.isInteger(x)) }; }
    } catch { broken = true; }
  }
  const over = playing && (room?.status === 'done' || !!outcome);
  const actSeat = mySeats.includes(turn) ? turn : -1;
  const viewSeat = actSeat >= 0 ? actSeat : mySeats[0] ?? 0;
  // One of the people at the table moves the computer's pieces: the first who is still here.
  const driver = room ? room.seats.find((s) => s.k === 'human' && !arcadeNet.gone(room, s.id)) : undefined;
  const iDrive = !!driver && driver.k === 'human' && driver.id === me;

  const move = useCallback((m: unknown) => {
    const r = arcadeNet.get().mine;
    if (!r || !rules || r.status !== 'play') return;
    let seat = -1, next: unknown = null;
    try { seat = rules.turn(r.state); next = rules.apply(r.state, seat, m); } catch { return; }
    const mine = r.seats[seat];
    if (!next || !mine || !((mine.k === 'human' && mine.id === me) || (mine.k === 'local' && r.host === me))) return;
    arcadeNet.setState(next, !!rules.result(next));
  }, [rules, me]);

  // The computer's turn.
  const seq = room?.seq ?? 0;
  useEffect(() => {
    if (!room || !rules || !iDrive || room.status !== 'play' || turn < 0 || room.seats[turn]?.k !== 'bot') return;
    const id = setTimeout(() => {
      const r = arcadeNet.get().mine;
      if (!r || r.seq !== seq || r.status !== 'play') return;
      try {
        const next = rules.apply(r.state, turn, rules.bot(r.state, turn, Math.random));
        if (next) arcadeNet.setState(next, !!rules.result(next));
      } catch (e) { console.error('[arcade] computer move failed:', e); }
    }, BOT_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, iDrive, turn, rules]);
  // Someone left: the computer takes their seat.
  const goneSeat = room && playing && !over ? room.seats.findIndex((s) => s.k === 'human' && s.id !== me && arcadeNet.gone(room, s.id)) : -1;
  const [leftName, setLeftName] = useState<string | null>(null);
  useEffect(() => {
    if (goneSeat < 0 || !room) return;
    setLeftName(names[goneSeat]);
    if (iDrive && !(rt && room.host !== me)) arcadeNet.botSeat(goneSeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goneSeat, iDrive]);
  useEffect(() => { if (!leftName) return; const id = setTimeout(() => setLeftName(null), 5000); return () => clearTimeout(id); }, [leftName]);
  // A real-time game is run by its host: without the host it is over.
  const hostGone = !!room && room.host !== me && arcadeNet.gone(room, room.host) && (rt || room.status === 'lobby');

  // The result is recorded once per match, by each player for themselves.
  const reported = useRef('');
  const mainSeat = room ? room.seats.findIndex((s) => s.k === 'human' && s.id === me) : -1;
  const won = !!outcome && outcome.winners.includes(mainSeat);
  const shared = !!outcome && (outcome.winners.length === 0 || (won && outcome.winners.length > 1));
  useEffect(() => {
    if (!room || !outcome || mainSeat < 0) return;
    const key = `${room.id}:${room.round}`;
    if (reported.current === key) return;
    reported.current = key;
    const vs = room.seats.some((s) => s.k === 'human' && s.id !== me) ? 'human' : room.seats.some((s) => s.k === 'bot') ? 'bot' : null;
    if (vs) arcadeScores.report(def.id, { outcome: shared ? 'draw' : won ? 'win' : 'loss', vs });
    if (won && !shared) sfx.win(); else if (shared) sfx.good(); else sfx.lose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!outcome, room?.id, room?.round]);
  const finish = useCallback((winners: number[]) => { const r = arcadeNet.get().mine; if (r && r.status === 'play') arcadeNet.setState({ winners }, true); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.code === 'Escape' && !(e.target as HTMLElement | null)?.closest?.('input,textarea,select')) onBack(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onBack]);

  const colors = SEAT_COLORS;
  const seatChip = (i: number) => {
    const s = room!.seats[i], active = turn === i && !over;
    const person = s.k === 'human' ? ctx.people.find((p) => p.id === s.id) : undefined;
    return (
      <span key={i} className={clsx('flex min-w-0 items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-2.5 text-xs transition', active ? 'bg-[var(--a-ink)] text-[var(--a-bg)]' : 'bg-[var(--a-chip)]', outcome?.winners.includes(i) && 'ring-2 ring-[var(--a-gold)]')}>
        {person ? <Portrait person={person} size="size-6" ring={colors[i]} /> : <span className="flex size-6 items-center justify-center rounded-full text-sm" style={{ background: colors[i], color: '#14173a' }}>{s.k === 'bot' ? <Bot className="size-4" /> : i + 1}</span>}
        <span className="max-w-24 truncate font-semibold">{names[i]}</span>
        {outcome?.scores && <b className="tabular-nums">{outcome.scores[i]}</b>}
      </span>
    );
  };
  const status = !room || !playing ? '' : over
    ? (shared ? t('hub.draw') : mainSeat >= 0 ? (won ? t('hub.youWin') : t('hub.youLose')) : outcome?.winners.length ? t('hub.wins', { name: names[outcome.winners[0]] }) : t('hub.draw'))
    : rt ? '' : turn < 0 ? '' : actSeat >= 0 ? (mySeats.length > 1 ? t('hub.turnOf', { name: names[turn] }) : t('hub.yourTurn')) : room.seats[turn]?.k === 'bot' ? t('hub.thinking') : t('hub.turnOf', { name: names[turn] });

  const Board = mod?.Board;
  const boardProps: BoardProps<unknown, unknown> | null = room && rules && state != null ? { s: state, seat: viewSeat, canMove: actSeat >= 0 && !over && room.status === 'play', move, names, colors, phone: ctx.phone, rtl: ctx.rtl, t: gt } : null;
  const rtProps: RtProps | null = room && rt ? { room, seat: Math.max(0, mainSeat), host: room.host === me, names, colors, bots: room.seats.map((s) => s.k === 'bot'), finish, phone: ctx.phone, rtl: ctx.rtl, t: gt } : null;

  return (
    <>
      <TopBar title={t(`games.${def.id}.name`)} icon={def.icon} color={def.color} onBack={onBack} onClose={ctx.onClose} rtl={ctx.rtl} labels={labels} />
      {room && playing && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-safe pb-1.5">
          {room.seats.map((_, i) => seatChip(i))}
          {status && <span className={clsx('ms-auto rounded-full px-3 py-1 text-xs font-bold', over ? 'bg-[#ffc93c] text-[#2b2440]' : actSeat >= 0 ? 'bg-[#3ccf91] text-[#2b2440]' : 'bg-[var(--a-chip)]')} aria-live="polite">{status}</span>}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {/* The game */}
        {room && playing && Board && !broken && (rt ? !!rtProps : !!boardProps) && (
          <div className="absolute inset-2 sm:inset-3">
            <GameBoundary key={`${room.id}:${room.round}`} fallback={<div className="flex h-full items-center justify-center"><p className="rounded-2xl bg-[var(--a-chip)] p-4 text-sm">{t('hub.error')}</p></div>}>
              {rt ? <Board {...rtProps} /> : <Board {...boardProps} />}
            </GameBoundary>
          </div>
        )}
        {broken && <div className="absolute inset-0 flex items-center justify-center"><p className="rounded-2xl bg-[var(--a-chip)] p-4 text-sm">{t('hub.error')}</p></div>}
        {leftName && !over && <p className="gc-pop pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded-full border-2 border-[var(--a-edge)] bg-[var(--a-card)] px-4 py-1.5 text-xs">{t('hub.left', { name: leftName })}</p>}

        {/* After the match */}
        {room && over && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className={clsx(card, 'gc-pop pointer-events-auto flex w-[min(26rem,100%)] flex-col gap-2 bg-[var(--a-panel)] shadow-2xl')}>
              <p className="text-center text-xl font-black" >{status}</p>
              {hostGone ? <p className="text-center text-xs text-[var(--a-coral)]">{t('hub.hostLeft')}</p>
                : room.host === me ? <button type="button" onClick={startMatch} className={btnGold}><RotateCcw className="size-5" />{t('hub.rematch')}</button>
                  : <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.waitRematch')}</p>}
              <button type="button" onClick={onBack} className={clsx(btnSoft, 'min-h-11 text-sm')}>{t('hub.leave')}</button>
            </div>
          </div>
        )}
        {room && playing && !over && hostGone && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--a-veil)]"><div className={clsx(card, 'flex flex-col gap-3 bg-[var(--a-panel)] text-center')}><p>{t('hub.hostLeft')}</p><button type="button" onClick={onBack} className={btnSoft}>{t('hub.back')}</button></div></div>
        )}

        {/* Before the match: choose the opponent, or wait at the table */}
        {(!room || !playing) && (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-2 scrollbar-thin">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 md:flex-row md:items-start md:pt-6 short:flex-row short:items-start">
              <div className={clsx(card, 'flex min-w-0 flex-1 flex-col gap-3 bg-[var(--a-panel)]')}>
                <div className="flex items-center gap-3">
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl border-2 border-[var(--a-edge)] text-4xl shadow-[0_4px_0_var(--a-edge)]" style={{ background: def.color }}>{def.icon}</span>
                  <div className="min-w-0"><p className="truncate text-xl font-black">{t(`games.${def.id}.name`)}</p><p className="text-sm leading-5 text-[var(--a-soft)]">{t(`games.${def.id}.tag`)}</p></div>
                </div>
                {!room ? (
                  <>
                    <div className="rounded-xl bg-[var(--a-chip)] p-3 text-sm leading-6 whitespace-pre-line text-[var(--a-soft)]">
                      <p className="mb-1 text-xs font-bold text-[var(--a-soft)]">{t('hub.howTo')}</p>
                      {t(`games.${def.id}.how`)}
                      <p className="mt-2 text-xs text-[var(--a-sky)]">{t(`games.${def.id}.${ctx.phone ? 'touch' : 'keys'}`)}</p>
                    </div>
                    {max > min && (
                      <div className="flex items-center gap-2 text-sm"><span className="me-auto text-[var(--a-soft)]">{t('hub.playersCount')}</span>
                        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
                          <button key={n} type="button" onClick={() => setCount(n)} aria-pressed={count === n} className={clsx('size-11 rounded-xl font-black', count === n ? 'bg-[var(--a-ink)] text-[var(--a-bg)]' : 'bg-[var(--a-chip)] hover:bg-[var(--a-chip2)]')}>{n}</button>
                        ))}
                      </div>
                    )}
                    {failed ? <p className="rounded-xl bg-[var(--a-sun-soft)] p-3 text-center text-sm">{t('hub.error')}</p> : !mod ? <p className="p-3 text-center text-sm text-[var(--a-soft)]">{t('hub.loading')}</p> : (
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => open('bot')} className={btnGold}><Bot className="size-5" />{t('hub.vsBot')}</button>
                        <button type="button" onClick={() => open('team')} disabled={!others} className={clsx(btnSoft, 'border border-[var(--a-edge)]')}>
                          <Wifi className="size-5 text-[var(--a-good)]" />{t('hub.vsTeam')}{!others && <span className="text-xs font-normal text-[var(--a-soft)]">· {t('hub.nobody')}</span>}
                        </button>
                        {!rt && <button type="button" onClick={() => open('local')} className={btnSoft}><Smartphone className="size-5" />{t('hub.vsLocal')}</button>}
                      </div>
                    )}
                    {net.joining && <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.joining')}</p>}
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-sm font-bold"><Users className="size-4" />{t('hub.lobby')}</p>
                    <ol className="space-y-1.5">
                      {room.seats.map((s, i) => (
                        <li key={i} className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--a-chip)] px-2">
                          {s.k === 'human' ? <Portrait person={ctx.people.find((p) => p.id === s.id)} size="size-8" ring={colors[i]} /> : <span className="flex size-8 items-center justify-center rounded-full" style={{ background: colors[i], color: '#14173a' }}>{s.k === 'bot' ? <Bot className="size-5" /> : i + 1}</span>}
                          <span className={clsx('me-auto truncate text-sm', s.k === 'open' && 'animate-pulse text-[var(--a-soft)]')}>{s.k === 'open' ? t('hub.seatOpen') : names[i]}{s.k === 'human' && s.id === room.host && ' ★'}</span>
                          {room.host === me && i > 0 && s.k !== 'human' && (room.grow
                            ? <button type="button" onClick={() => arcadeNet.dropSeat(i)} className="min-h-9 rounded-lg bg-[var(--a-chip)] px-3 text-xs hover:bg-[var(--a-chip2)]">✕</button>
                            : <button type="button" onClick={() => arcadeNet.setSeat(i, s.k === 'bot' ? { k: 'open' } : { k: 'bot' })} className="min-h-9 rounded-lg bg-[var(--a-chip)] px-3 text-xs hover:bg-[var(--a-chip2)]">{s.k === 'bot' ? t('hub.makeOpen') : t('hub.makeBot')}</button>
                          )}
                        </li>
                      ))}
                    </ol>
                    {room.grow && <p className="text-center text-xs text-[var(--a-soft)]">{t('hub.growHint')}</p>}
                    {room.grow && room.host === me && room.seats.length < max && <button type="button" onClick={() => arcadeNet.addBot()} className={clsx(btnSoft, 'min-h-11 text-sm')}><Bot className="size-4" />{t('hub.addBot')}</button>}
                    {hostGone ? <p className="text-center text-xs text-[var(--a-coral)]">{t('hub.hostLeft')}</p>
                      : room.host === me ? (
                        <button type="button" onClick={startMatch} disabled={!mod || (room.grow ? room.seats.length < 2 : room.seats.some((s) => s.k === 'open'))} className={btnGold}><Play className="size-5" />{(room.grow ? room.seats.length < 2 : room.seats.some((s) => s.k === 'open')) ? t('hub.waitPlayers') : t('hub.startMatch')}</button>
                      ) : <p className="text-center text-sm text-[var(--a-soft)]">{t('hub.waitHost')}</p>}
                    <button type="button" onClick={() => arcadeNet.leave()} className={clsx(btnSoft, 'min-h-11 text-sm')}>{t('hub.leave')}</button>
                  </>
                )}
              </div>
              <div className={clsx(card, 'w-full shrink-0 bg-[var(--a-panel)] md:w-64 short:w-56')}>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Trophy className="size-4 text-[var(--a-gold)]" />{t('hub.top')}</p>
                <ScoreRows game={def.id} ctx={ctx} />
                <p className="mt-2 text-[11px] leading-4 text-[var(--a-soft)]">{t('hub.pointsHint')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
