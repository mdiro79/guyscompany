'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { reportGameAction, listGameScoresAction } from '@/app/actions/arcade';
import { ARCADE, applyDelta, isGameId, scoreDelta, type GameId, type GameReport, type GameScore } from '@/lib/arcade';

// The game room's records in the browser. They are kept on the server (table game_scores); this store
// holds the copy on screen, adds a finished round at once (before the server answers) and tells teammates
// in the office over WebRTC, so the tables and the room's screens change live.

let rows: GameScore[] = [];
let me = '';
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
const news = new Set<(n: News) => void>();
const emit = () => { rows = rows.slice(); listeners.forEach((l) => l()); };

/** Something worth a toast: a member's new record or a won match. */
export interface News { userId: string; game: GameId; best: number; kind: 'record' | 'win' }

const key = (r: { userId: string; game: string }) => `${r.userId}:${r.game}`;
function put(row: GameScore) {
  const i = rows.findIndex((r) => key(r) === key(row));
  // Counters only grow, so an older copy never replaces a newer one.
  if (i >= 0 && (rows[i].plays > row.plays || (rows[i].plays === row.plays && rows[i].best >= row.best))) return false;
  if (i >= 0) rows[i] = row; else rows.push(row);
  return true;
}
const valid = (r: unknown): r is GameScore => {
  const x = r as GameScore;
  return !!x && typeof x.userId === 'string' && isGameId(x.game) && [x.best, x.plays, x.wins].every((n) => Number.isInteger(n) && n >= 0 && n < 1e9) && typeof x.updatedAt === 'string';
};

export const arcadeScores = {
  get: () => rows,
  me: () => me,
  of: (game: string, userId = me) => rows.find((r) => r.game === game && r.userId === userId),
  /** The server's list (page data); live changes that are newer stay. */
  load(list: GameScore[]) { let changed = false; for (const r of list) if (valid(r)) changed = put(r) || changed; if (changed) emit(); },
  /** Records a finished round. Returns whether it is this member's new best score. */
  report(game: GameId, report: GameReport): boolean {
    const d = scoreDelta(game, report);
    if (!d || !me) return false;
    const prev = arcadeScores.of(game);
    const next: GameScore = { userId: me, game, ...applyDelta(prev, d), updatedAt: new Date().toISOString() };
    const record = ARCADE[game].kind === 'solo' && next.best > (prev?.best ?? 0);
    put(next); emit();
    const kind = record ? 'record' : d.wins && 'outcome' in report && report.vs === 'human' ? 'win' : null;
    mesh?.sendEvent({ type: 'ar-row', row: next, news: kind });
    void reportGameAction(game, report).then((r) => { if (r.ok && r.row && put(r.row)) emit(); }).catch(() => {});
    return record;
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  onNews(l: (n: News) => void) { news.add(l); return () => { news.delete(l); }; },
};

export const useArcadeScores = () => useSyncExternalStore(arcadeScores.subscribe, arcadeScores.get, arcadeScores.get);

const OLD_KEY = 'gc-arcade-best'; // Bug Squash's best from before the records moved to the server

let fetched = 0;
/** Fetches the tables from the server (at most once a minute); `initial` is a list the page already has. */
export function refreshScores(initial?: GameScore[]) {
  const done = (list: GameScore[]) => {
    arcadeScores.load(list);
    try {
      const old = Math.floor(Number(localStorage.getItem(OLD_KEY)) || 0);
      if (old > 0 && me) { localStorage.removeItem(OLD_KEY); if (old > (arcadeScores.of('bugs')?.best ?? 0)) arcadeScores.report('bugs', { score: Math.min(old, ARCADE.bugs.cap) }); }
    } catch { /* storage blocked */ }
  };
  if (initial) { fetched = Date.now(); done(initial); return; }
  if (Date.now() - fetched < 60000) return;
  fetched = Date.now();
  void listGameScoresAction().then(done).catch(() => { fetched = 0; });
}

export function connectScores(m: Mesh | null, userId: string) {
  mesh = m; me = userId;
  if (!m) return () => {};
  const off = m.onEvent((from, msg) => {
    const row = msg.row;
    if (msg.type !== 'ar-row' || !valid(row) || row.userId !== from.userId) return;
    if (put(row)) emit();
    if ((msg.news === 'record' || msg.news === 'win') && from.userId !== me) news.forEach((l) => l({ userId: from.userId, game: row.game as GameId, best: row.best, kind: msg.news as News['kind'] }));
  });
  // Someone just connected: they get my rows (theirs may be older than the page data they loaded).
  const offPeers = m.onPeers(() => setTimeout(() => { for (const r of rows) if (r.userId === me) m.sendEvent({ type: 'ar-row', row: r, news: null }); }, 1500));
  return () => { off(); offPeers(); mesh = null; };
}
