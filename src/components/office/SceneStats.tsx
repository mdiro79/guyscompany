'use client';
import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';

// Render cost of the last frame (draw calls, triangles) and a smoothed frame rate, read by the debug
// badge (?debug=1) and by the measuring scripts through window.__gcStats(). Costs nothing visible.
export const sceneStats = { calls: 0, triangles: 0, fps: 0, geometries: 0, textures: 0 };

export function SceneStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false; // count all passes of a frame (effects render several)
    let last = performance.now();
    const off = addAfterEffect(() => {
      const now = performance.now();
      const fps = 1000 / Math.max(1, now - last);
      last = now;
      sceneStats.fps += (fps - sceneStats.fps) * 0.05;
      sceneStats.calls = gl.info.render.calls;
      sceneStats.triangles = gl.info.render.triangles;
      sceneStats.geometries = gl.info.memory.geometries;
      sceneStats.textures = gl.info.memory.textures;
      gl.info.reset();
    });
    (window as unknown as { __gcStats?: unknown }).__gcStats = () => ({ ...sceneStats, fps: Math.round(sceneStats.fps) });
    return () => { off(); gl.info.autoReset = true; };
  }, [gl]);
  return null;
}
