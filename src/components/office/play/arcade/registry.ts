import type { ComponentType } from 'react';
import { ARCADE, type GameId, type GameKind } from '@/lib/arcade';

// The games of the arcade: how each looks in the list and where its code is. Every game is its own
// chunk, downloaded the first time it is opened.
export interface GameDef {
  id: GameId; kind: GameKind;
  icon: string; color: string; // accent of its card, cabinet and effects
  three?: boolean; // drawn in 3D
  players?: [number, number]; // head-to-head: fewest and most
  realtime?: boolean; // both play at the same time (needs a live link; not on one shared device)
  legacy?: boolean; // the old cabinet game
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<{ default: ComponentType<any>; rules?: unknown }>;
}

const def = (id: GameId, icon: string, color: string, load: GameDef['load'], more: Partial<GameDef> = {}): GameDef => ({ id, kind: ARCADE[id].kind, icon, color, load, ...more });

export const GAMES: GameDef[] = [
  // Head to head
  def('hockey', '🏒', '#4aa8ff', () => import('./games/Hockey'), { players: [2, 2], realtime: true }),
  def('pong', '🏓', '#ff7eb6', () => import('./games/Pong'), { players: [2, 2], realtime: true }),
  def('soccer', '⚽', '#3ccf91', () => import('./games/Soccer'), { players: [2, 2] }),
  def('nard', '🎲', '#e0a458', () => import('./games/Nard'), { players: [2, 2] }),
  def('archery', '🏹', '#ff9f43', () => import('./games/Archery'), { players: [2, 4] }),
  def('darts', '🎯', '#ff6b5e', () => import('./games/Darts'), { players: [2, 4] }),
  def('cannons', '💥', '#ff9f43', () => import('./games/Cannons'), { players: [2, 4] }),
  def('trails', '⚡', '#9b6bff', () => import('./games/Trails'), { players: [2, 4], realtime: true }),
  def('four', '🔴', '#ff6b5e', () => import('./games/Four'), { players: [2, 2], three: true }),
  def('dice', '🎰', '#ffc93c', () => import('./games/Dice'), { players: [2, 4], three: true }),
  def('checkers', '⛃', '#c98a5a', () => import('./games/Checkers'), { players: [2, 2] }),
  def('reversi', '⚫', '#22c1b4', () => import('./games/Reversi'), { players: [2, 2] }),
  // Solo
  def('swarm', '🛸', '#9b6bff', () => import('./games/Swarm')),
  def('runner', '🏃', '#ff7eb6', () => import('./games/Runner'), { three: true }),
  def('serpent', '🐍', '#3ccf91', () => import('./games/Serpent')),
  def('stack', '🧱', '#4aa8ff', () => import('./games/Stack'), { three: true }),
  def('breaker', '🧨', '#ff9f43', () => import('./games/Breaker')),
  def('gems', '💎', '#4aa8ff', () => import('./games/Gems')),
  def('orbit', '🪐', '#ffc93c', () => import('./games/Orbit')),
  def('circuit', '🔌', '#22c1b4', () => import('./games/Circuit')),
  def('bugs', '🐞', '#ff6b5e', () => import('./games/Bugs'), { legacy: true }),
];

export const gameDef = (id: string | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
