'use client';
import { ArenaStage } from '../kit/arena';
import { makeSumo, S } from '../sims/sumo';
import type { RtProps } from '../VersusShell';

// Sumo Bumpers (rules in sims/sumo.ts): push everyone off the shrinking platform.
export default function Sumo(rt: RtProps) {
  return <div className="absolute inset-0"><ArenaStage rt={rt} size={[S, S]} tilt={0.55} table={false} make={(c) => makeSumo(c)} /></div>;
}
