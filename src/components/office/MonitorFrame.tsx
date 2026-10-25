'use client';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { allSeats } from './layout';
import { officeUi } from './store';

const SEATS = allSeats();
const W = 0.6, H = 0.4, DY = 0.004;
const v = new THREE.Vector3();
const BAR = 'calc(48px + env(safe-area-inset-top))';

// Projects the monitor screen of the current seat to page coordinates and moves the DOM panel there
// (one iframe element is reused for monitor and fullscreen so the dashboard keeps its state).
export function MonitorFrame() {
  const { camera, size } = useThree();
  useFrame(() => {
    const el = document.getElementById('gc-monitor-frame');
    const ui = officeUi.get();
    if (!el) return;
    if (ui.panel === 'fullscreen') {
      // Below the 48px bar that holds the fullscreen/exit buttons, so nothing covers the dashboard.
      Object.assign(el.style, { display: 'block', left: '0px', top: BAR, width: '100%', height: `calc(100% - ${BAR})`, borderRadius: '0px' });
      return;
    }
    const seat = ui.seatId ? SEATS.find((s) => s.id === ui.seatId) : null;
    if (!seat?.monitor || ui.panel !== 'monitor') { el.style.display = 'none'; return; }
    const [mx, my, mz] = seat.monitor.pos;
    const xs: number[] = [], ys: number[] = [];
    for (const [dx, dy] of [[-W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2], [W / 2, -H / 2]]) {
      v.set(mx + dx, my + DY + dy, mz).project(camera);
      xs.push((v.x * 0.5 + 0.5) * size.width);
      ys.push((-v.y * 0.5 + 0.5) * size.height);
    }
    const left = Math.min(...xs), top = Math.min(...ys);
    Object.assign(el.style, {
      display: 'block', left: `${left}px`, top: `${top}px`, borderRadius: '6px',
      width: `${Math.max(...xs) - left}px`, height: `${Math.max(...ys) - top}px`,
    });
  });
  return null;
}
