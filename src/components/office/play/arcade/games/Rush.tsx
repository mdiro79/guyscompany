'use client';
import { ArenaStage } from '../kit/arena';
import { makeRush, rushSize } from '../sims/rush';
import type { RtProps } from '../VersusShell';

// Coin Rush (rules in sims/rush.ts): a minute to grab the most coins; ram rivals to steal theirs.
export default function Rush(rt: RtProps) {
  return <div className="absolute inset-0"><ArenaStage rt={rt} size={rushSize(rt.room.seats.length)} tilt={0.5} make={(c) => makeRush(c)} /></div>;
}
