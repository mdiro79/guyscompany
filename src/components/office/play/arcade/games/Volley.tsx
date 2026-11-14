'use client';
import { ArenaStage } from '../kit/arena';
import { makeVolley, CW, CH } from '../sims/volley';
import type { RtProps } from '../VersusShell';

// Sky Volley (rules in sims/volley.ts): beach volleyball from above, one or two a side.
export default function Volley(rt: RtProps) {
  return <div className="absolute inset-0"><ArenaStage rt={rt} size={[CW, CH]} tilt={0.6} make={(c) => makeVolley(c)} /></div>;
}
