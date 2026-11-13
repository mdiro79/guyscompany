'use client';
import { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Box, Swords, Trophy, User, Users, Zap } from 'lucide-react';
import { useShell } from '@/components/shell/ShellContext';
import { useDevice } from '@/lib/device';
import { GAME_IDS, league, ranking, type GameId } from '@/lib/arcade';
import { GAMES, gameDef, type GameDef } from './registry';
import { arcadeView, useArcadeView, type HubTab } from './view';
import { arcadeNet, useArcadeNet, type Room } from './net';
import { refreshScores, useArcadeScores } from './scores';
import { MEDALS, Portrait, TopBar, card, themeVars, type Person } from './ui';
import { useThemeMode } from './kit/theme';
import { SoloShell } from './SoloShell';
import { VersusShell } from './VersusShell';

// The arcade: twenty games behind one door. A list of the games (head to head first), the league table,
// and the screen of whichever game is open. It fills whatever it is put in (the office's overlay or
// its own page).

export interface ArcadeCtx { people: Person[]; meId: string; phone: boolean; rtl: boolean; locale: string; name(id: string): string; onClose(): void }

export function Arcade({ onClose }: { onClose: () => void }) {
  const t = useTranslations('office');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const phone = useDevice() === 'phone';
  const view = useArcadeView();
  const net = useArcadeNet();
  const mode = useThemeMode();
  const people = useMemo(() => profiles.map((p) => ({ id: p.id, name: p.displayName, characterId: p.characterId })), [profiles]);
  const ctx = useMemo<ArcadeCtx>(() => ({
    people, meId: user.id, phone, rtl: locale === 'fa', locale, onClose,
    name: (id) => people.find((p) => p.id === id)?.name ?? '—',
  }), [people, user.id, phone, locale, onClose]);
  // Sitting at a table (hosting or joined): its game is the one on screen.
  const mineGame = net.mine?.game ?? null;
  useEffect(() => { if (mineGame && arcadeView.get().game !== mineGame) arcadeView.set({ game: mineGame }); }, [mineGame]);
  useEffect(() => { refreshScores(); }, []);
  // Leaving the arcade leaves the table.
  useEffect(() => () => { arcadeNet.leave(); }, []);
  const def = gameDef(view.game);
  const back = () => { arcadeNet.leave(); arcadeView.set({ game: null }); };
  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-[var(--a-bg)] text-[var(--a-ink)] select-none" role="dialog" aria-label={t('hub.title')}
      style={{ ...themeVars(mode), backgroundImage: 'radial-gradient(46rem 26rem at 8% -6%, var(--a-blob1), transparent 62%), radial-gradient(40rem 26rem at 104% 30%, var(--a-blob2), transparent 60%), radial-gradient(44rem 24rem at 30% 112%, var(--a-blob3), transparent 60%), linear-gradient(var(--a-bg), var(--a-bg2))' }}>
      {!def ? <Hub ctx={ctx} tab={view.tab} />
        : def.kind === 'solo' ? <SoloShell key={def.id} def={def} ctx={ctx} onBack={back} />
          : <VersusShell key={def.id} def={def} ctx={ctx} onBack={back} />}
    </div>
  );
}

function Invites({ ctx }: { ctx: ArcadeCtx }) {
  const t = useTranslations('office');
  const net = useArcadeNet();
  const invites = arcadeNet.invites();
  if (!invites.length && !net.joining) return null;
  return (
    <div className="flex flex-col gap-2">
      {invites.map((r: Room) => {
        const def = gameDef(r.game);
        return (
          <div key={r.id} className="gc-pop flex items-center gap-3 rounded-2xl border border-[var(--a-edge)] bg-[var(--a-sun-soft)] p-2.5">
            <Portrait person={ctx.people.find((p) => p.id === r.host)} size="size-10" ring="#ffd23f" />
            <p className="min-w-0 flex-1 text-sm leading-5"><span className="me-1 text-lg">{def?.icon}</span>{t('hub.invite', { name: ctx.name(r.host), game: t(`games.${r.game}.name`) })}{r.mode === 'race' ? ` · ${t('hub.raceTag')}` : ''}</p>
            <button type="button" disabled={!!net.joining} onClick={() => arcadeNet.join(r.id)} className="min-h-11 shrink-0 rounded-xl bg-[#ffc93c] px-4 text-sm font-extrabold text-[#2b2440] active:scale-95 disabled:opacity-50">{net.joining === r.id ? t('hub.joining') : t('hub.join')}</button>
            <button type="button" onClick={() => arcadeNet.dismiss(r.id)} className="min-h-11 shrink-0 rounded-xl bg-[var(--a-chip)] px-3 text-sm hover:bg-[var(--a-chip2)]">{t('hub.ignore')}</button>
          </div>
        );
      })}
    </div>
  );
}

function GameCard({ def, ctx }: { def: GameDef; ctx: ArcadeCtx }) {
  const t = useTranslations('office');
  const scores = useArcadeScores();
  const table = ranking(scores, def.id);
  const mine = table.find((r) => r.userId === ctx.meId);
  const leader = table[0];
  return (
    <button type="button" data-game={def.id} onClick={() => arcadeView.set({ game: def.id })}
      className="group relative flex min-h-36 flex-col overflow-hidden rounded-2xl border-2 border-[var(--a-edge)] bg-[var(--a-card)] text-start shadow-[0_5px_0_var(--a-edge)] transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-[0_9px_0_var(--a-edge)] active:translate-y-[3px] active:shadow-[0_2px_0_var(--a-edge)]">
      <span className="relative flex h-16 items-center gap-2 overflow-hidden border-b-2 border-[var(--a-edge)] px-3" style={{ background: def.color }}>
        <span aria-hidden className="pointer-events-none absolute -end-5 -top-6 size-20 rounded-full bg-white/25" />
        <span aria-hidden className="pointer-events-none absolute end-10 -bottom-7 size-14 rounded-full bg-black/10" />
        <span className="text-4xl leading-none drop-shadow-[0_3px_0_rgba(0,0,0,0.22)] transition-transform group-hover:scale-110 group-hover:-rotate-6">{def.icon}</span>
        <span className="relative ms-auto flex flex-wrap justify-end gap-1">
          {def.three && <span className="chip gap-1 bg-[#2b2440]/85 text-[10px] text-white"><Box className="size-3" />{t('hub.threeD')}</span>}
          {def.realtime && <span className="chip gap-1 bg-[#2b2440]/85 text-[10px] text-white"><Zap className="size-3" />{t('hub.live')}</span>}
          {def.players && <span className="chip gap-1 bg-[#2b2440]/85 text-[10px] text-white" dir="ltr"><Users className="size-3" />{def.players[0] === def.players[1] ? def.players[0] : `${def.players[0]}–${def.players[1]}`}</span>}
        </span>
      </span>
      <span className="flex flex-1 flex-col p-3 pt-2">
        <span className="truncate text-base font-black">{t(`games.${def.id}.name`)}</span>
        <span className="line-clamp-2 text-xs leading-5 text-[var(--a-soft)]">{t(`games.${def.id}.tag`)}</span>
        <span className="mt-auto flex items-center gap-2 pt-2 text-[11px] text-[var(--a-soft)]">
          {leader ? <span className="flex min-w-0 items-center gap-1"><span>🥇</span><span className="truncate">{ctx.name(leader.userId)}</span><span className="font-bold tabular-nums text-[var(--a-good)]">{leader.best.toLocaleString(ctx.locale)}</span></span> : <span>{t('hub.beFirst')}</span>}
          {mine && mine.userId !== leader?.userId && <span className="ms-auto shrink-0 tabular-nums">{t('hub.you')}: <b>{mine.best.toLocaleString(ctx.locale)}</b></span>}
        </span>
      </span>
    </button>
  );
}

function Hub({ ctx, tab }: { ctx: ArcadeCtx; tab: HubTab }) {
  const t = useTranslations('office');
  const labels = { back: t('hub.back'), close: t('hub.close'), mute: t('hub.mute'), unmute: t('hub.unmute'), theme: t('hub.theme') };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.code === 'Escape') ctx.onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ctx]);
  const tabs: { id: HubTab; icon: typeof Swords; label: string }[] = [
    { id: 'versus', icon: Swords, label: t('hub.versus') }, { id: 'solo', icon: User, label: t('hub.solo') }, { id: 'league', icon: Trophy, label: t('hub.league') },
  ];
  const online = arcadeNet.othersOnline().length;
  return (
    <>
      <TopBar title={t('hub.title')} icon="🕹️" onClose={ctx.onClose} rtl={ctx.rtl} labels={labels}>
        <span className="hidden items-center gap-1.5 rounded-full bg-[var(--a-chip)] px-3 py-1 text-xs sm:flex"><span className={clsx('size-2 rounded-full', online ? 'bg-[#3ccf91]' : 'bg-white/30')} />{online ? t('hub.online', { n: online }) : t('hub.nobody')}</span>
      </TopBar>
      <div className="flex shrink-0 gap-2 px-safe pb-2">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} type="button" data-tab={id} onClick={() => arcadeView.set({ tab: id })} aria-pressed={tab === id}
            className={clsx('flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[var(--a-edge)] text-sm font-bold transition-[transform,box-shadow] sm:flex-none sm:px-5', tab === id ? 'translate-y-[2px] bg-[#ffc93c] text-[#2b2440] shadow-[0_1px_0_var(--a-edge)]' : 'bg-[var(--a-card)] shadow-[0_3px_0_var(--a-edge)]')}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe pb-[max(1rem,env(safe-area-inset-bottom))] scrollbar-thin">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <Invites ctx={ctx} />
          {tab === 'league' ? <League ctx={ctx} /> : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {GAMES.filter((g) => g.kind === tab).map((g) => <GameCard key={g.id} def={g} ctx={ctx} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function League({ ctx }: { ctx: ArcadeCtx }) {
  const t = useTranslations('office');
  const scores = useArcadeScores();
  const rows = league(scores, ctx.people.map((p) => p.id));
  const played = GAME_IDS.filter((g: GameId) => scores.some((s) => s.game === g && s.best > 0));
  return (
    <>
      <div className={clsx(card, 'overflow-hidden p-0')}>
        <div className="flex items-center gap-2 border-b-2 border-[var(--a-edge)] bg-[#ffc93c] p-3 text-[#2b2440]"><Trophy className="size-5" /><h3 className="font-extrabold">{t('hub.leagueTitle')}</h3></div>
        <ol>
          {rows.map((r) => {
            const p = ctx.people.find((x) => x.id === r.userId);
            return (
              <li key={r.userId} className={clsx('flex items-center gap-3 border-t border-[var(--a-line)] px-3 py-2.5', r.userId === ctx.meId && 'bg-[var(--a-sun-soft)]')}>
                <span className="w-7 text-center text-lg font-black tabular-nums">{r.points > 0 && MEDALS[r.place] ? MEDALS[r.place] : r.place}</span>
                <Portrait person={p} size="size-10" ring={r.place === 1 && r.points > 0 ? '#ffd23f' : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p?.name}{r.userId === ctx.meId && <span className="ms-1 text-xs font-normal text-[var(--a-soft)]">({t('hub.you')})</span>}</span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-[var(--a-soft)]">
                    <span>🥇 {r.gold}</span><span>🥈 {r.silver}</span><span>🥉 {r.bronze}</span><span>{t('hub.winsCol')}: {r.wins}</span><span>{t('hub.playsCol')}: {r.plays}</span>
                  </span>
                </span>
                <span className="text-end"><span className="block text-2xl leading-none font-black tabular-nums text-[var(--a-good)]">{r.points}</span><span className="text-[10px] text-[var(--a-soft)]">{t('hub.leaguePoints')}</span></span>
              </li>
            );
          })}
        </ol>
        <p className="border-t border-[var(--a-line)] p-3 text-xs leading-5 text-[var(--a-soft)]">{t('hub.leagueHint')}</p>
      </div>
      {played.length > 0 && <h3 className="mt-1 text-sm font-bold text-[var(--a-soft)]">{t('hub.perGame')}</h3>}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {played.map((g) => {
          const def = gameDef(g);
          if (!def) return null;
          return (
            <button key={g} type="button" onClick={() => arcadeView.set({ game: g })} className={clsx(card, 'text-start transition hover:brightness-105')}>
              <span className="mb-1.5 flex items-center gap-2 font-bold"><span className="text-xl">{def.icon}</span><span className="truncate">{t(`games.${g}.name`)}</span></span>
              <ScoreRows game={g} ctx={ctx} max={4} />
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The table of one game (best first). */
export function ScoreRows({ game, ctx, max = 4 }: { game: GameId; ctx: ArcadeCtx; max?: number }) {
  const t = useTranslations('office');
  const scores = useArcadeScores();
  const rows = ranking(scores, game).slice(0, max);
  if (!rows.length) return <p className="rounded-xl bg-[var(--a-chip)] p-2.5 text-center text-xs text-[var(--a-soft)]">{t('hub.noScores')}</p>;
  return (
    <ol className="space-y-1">
      {rows.map((r) => (
        <li key={r.userId} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', r.userId === ctx.meId ? 'bg-[var(--a-sun-soft)]' : 'bg-[var(--a-chip)]')}>
          <span className="w-5 text-center">{MEDALS[r.place] ?? r.place}</span>
          <Portrait person={ctx.people.find((p) => p.id === r.userId)} size="size-6" />
          <span className="me-auto truncate">{ctx.name(r.userId)}</span>
          {r.wins > 0 && <span className="text-[11px] text-[var(--a-soft)]">{t('hub.winsCol')} {r.wins}</span>}
          <span className="font-bold tabular-nums text-[var(--a-good)]">{r.best.toLocaleString(ctx.locale)}</span>
        </li>
      ))}
    </ol>
  );
}
