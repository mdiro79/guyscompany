'use server';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { isGameId, scoreDelta, type GameReport, type GameScore } from '@/lib/arcade';
import { guard } from './result';

// A finished round of a game-room game. The browser is trusted with its own result (a team of four);
// the server only checks that the report fits the game and keeps the record. Teammates in the office hear
// about it at once over WebRTC, so no page is re-rendered here.
export const reportGameAction = guard(async function reportGameAction(game: string, report: GameReport): Promise<{ ok: boolean; row?: GameScore }> {
  const user = await requireUser();
  if (!isGameId(game) || !report || typeof report !== 'object') return { ok: false };
  const d = scoreDelta(game, report);
  if (!d) return { ok: false };
  return { ok: true, row: await store().reportGame(user.id, game, d) };
}, { ok: false });

export const listGameScoresAction = guard(async function listGameScoresAction(): Promise<GameScore[]> {
  await requireUser();
  return store().listGameScores();
}, []);
