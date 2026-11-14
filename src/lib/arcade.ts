// The game room's catalogue and scoring rules, shared by the server (which keeps the records) and the
// browser (which shows them). Solo games keep a high score; head-to-head games keep league points:
// 3 for a win against a teammate, 1 for a draw against a teammate or a win against the computer.

export type GameKind = 'solo' | 'versus';
export interface GameRule { kind: GameKind; cap: number } // cap: the highest score the server accepts for a round

export const ARCADE = {
  // Solo (also played as a live race against teammates)
  bugs: { kind: 'solo', cap: 2000 },
  serpent: { kind: 'solo', cap: 100000 },
  breaker: { kind: 'solo', cap: 1000000 },
  swarm: { kind: 'solo', cap: 1000000 },
  gems: { kind: 'solo', cap: 1000000 },
  circuit: { kind: 'solo', cap: 100000 },
  stack: { kind: 'solo', cap: 10000 },
  runner: { kind: 'solo', cap: 1000000 },
  orbit: { kind: 'solo', cap: 100000 },
  // Head to head
  nard: { kind: 'versus', cap: 0 },
  four: { kind: 'versus', cap: 0 },
  checkers: { kind: 'versus', cap: 0 },
  reversi: { kind: 'versus', cap: 0 },
  dice: { kind: 'versus', cap: 0 },
  cannons: { kind: 'versus', cap: 0 },
  soccer: { kind: 'versus', cap: 0 },
  darts: { kind: 'versus', cap: 0 },
  archery: { kind: 'versus', cap: 0 },
  hockey: { kind: 'versus', cap: 0 },
  pong: { kind: 'versus', cap: 0 },
  trails: { kind: 'versus', cap: 0 },
  sumo: { kind: 'versus', cap: 0 },
  rush: { kind: 'versus', cap: 0 },
  volley: { kind: 'versus', cap: 0 },
} as const satisfies Record<string, GameRule>;

export type GameId = keyof typeof ARCADE;
export const GAME_IDS = Object.keys(ARCADE) as GameId[];
export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ARCADE, v);

export interface GameScore { userId: string; game: string; best: number; plays: number; wins: number; updatedAt: string }

/** What a browser reports after a finished round. */
export type GameReport =
  | { score: number; won?: boolean } // solo round; `won`: it was a live race against teammates and this member won it
  | { outcome: 'win' | 'loss' | 'draw'; vs: 'human' | 'bot' }; // head-to-head match

export const WIN_POINTS = { human: 3, bot: 1 } as const;

/**
 * How a report changes a record: `score` competes with the best so far, `points` are added to it,
 * `wins` is added to the win count. Null when the report does not fit the game.
 */
export function scoreDelta(game: GameId, r: GameReport): { score: number; points: number; wins: number } | null {
  const rule: GameRule = ARCADE[game];
  if ('outcome' in r) {
    if (rule.kind !== 'versus' || !['win', 'loss', 'draw'].includes(r.outcome) || (r.vs !== 'human' && r.vs !== 'bot')) return null;
    const points = r.outcome === 'win' ? WIN_POINTS[r.vs] : r.outcome === 'draw' && r.vs === 'human' ? 1 : 0;
    return { score: 0, points, wins: r.outcome === 'win' ? 1 : 0 };
  }
  if (rule.kind !== 'solo' || typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
  const score = Math.floor(r.score);
  if (score < 0 || score > rule.cap) return null;
  return { score, points: 0, wins: r.won === true ? 1 : 0 };
}

/** The record after a report (what the store does in one statement). */
export function applyDelta(prev: Pick<GameScore, 'best' | 'plays' | 'wins'> | undefined, d: { score: number; points: number; wins: number }) {
  return { best: Math.max(prev?.best ?? 0, d.score) + d.points, plays: (prev?.plays ?? 0) + 1, wins: (prev?.wins ?? 0) + d.wins };
}

/** One game's table: best first; equal scores share a place. */
export function ranking(scores: GameScore[], game: string) {
  const rows = scores.filter((s) => s.game === game && s.best > 0).sort((a, b) => b.best - a.best || a.updatedAt.localeCompare(b.updatedAt));
  let place = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.best < rows[i - 1].best) place = i + 1;
    return { ...r, place };
  });
}

export const PLACE_POINTS = [0, 5, 3, 2, 1];
export interface LeagueRow { userId: string; points: number; gold: number; silver: number; bronze: number; plays: number; wins: number; place: number }

/** The league over all games: place points per game (5, 3, 2, 1), medals, rounds played. Best first. */
export function league(scores: GameScore[], userIds: string[]): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(userIds.map((id) => [id, { userId: id, points: 0, gold: 0, silver: 0, bronze: 0, plays: 0, wins: 0, place: 0 }]));
  for (const s of scores) { const r = rows.get(s.userId); if (r && isGameId(s.game)) { r.plays += s.plays; r.wins += s.wins; } }
  for (const game of GAME_IDS) {
    for (const r of ranking(scores, game)) {
      const row = rows.get(r.userId);
      if (!row) continue;
      row.points += PLACE_POINTS[r.place] ?? 0;
      if (r.place === 1) row.gold++; else if (r.place === 2) row.silver++; else if (r.place === 3) row.bronze++;
    }
  }
  const list = [...rows.values()].sort((a, b) => b.points - a.points || b.gold - a.gold || b.wins - a.wins || b.plays - a.plays);
  let place = 0;
  list.forEach((r, i) => { if (i === 0 || r.points < list[i - 1].points) place = i + 1; r.place = place; });
  return list;
}
