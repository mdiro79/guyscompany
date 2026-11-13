'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ThreeStage, type ThreeCtx } from '../kit/Stage';
import type { Game3D } from '../kit/types';
import { useBoard } from '../kit/board';
import { theme } from '../kit/theme';
import { sfx } from '../kit/sfx';
import { btnGold, btnSoft } from '../ui';
import type { BoardProps } from '../rules/types';
import { TARGET, scoreOf, type DiceMove, type DiceState } from '../rules/dice';

export { rules } from '../rules/dice';

// Dice 10,000 with real tumbling dice (3D). Tap dice to set them aside; the buttons below roll again or
// bank the turn's points. The table on top shows everyone's banked score on the way to 5,000.

type Props = BoardProps<DiceState, DiceMove>;
// Selection lives outside the 3D scene: both the scene (taps on dice) and the buttons use it.
interface Pick { set: Set<number>; listeners: Set<() => void> }

export default function Dice(props: Props) {
  const { api, get } = useBoard(props);
  const pick = useMemo<Pick>(() => ({ set: new Set(), listeners: new Set() }), []);
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); pick.listeners.add(l); return () => { pick.listeners.delete(l); }; }, [pick]);
  const { s, canMove, move, names, colors, t } = props;
  // A new roll (or someone else's turn) starts with nothing chosen.
  useEffect(() => { pick.set.clear(); pick.listeners.forEach((l) => l()); }, [s.n, s.turn, pick]);
  const chosen = [...pick.set].filter((i) => i < s.dice.length), gain = scoreOf(chosen.map((i) => s.dice[i]));
  const keep = (bank: boolean) => { if (gain) move({ t: 'keep', idx: chosen, bank }); };
  return (
    <div className="absolute inset-0 flex flex-col gap-2">
      <div className="grid shrink-0 gap-1.5" style={{ gridTemplateColumns: `repeat(${s.scores.length}, minmax(0, 1fr))` }}>
        {s.scores.map((v, i) => (
          <div key={i} className={clsx('rounded-xl border-2 border-[var(--a-edge)] bg-[var(--a-card)] px-2 py-1', s.turn === i && 'shadow-[0_3px_0_var(--a-edge)]')} style={s.turn === i ? { background: `color-mix(in oklab, ${colors[i]} 30%, var(--a-card))` } : undefined}>
            <div className="flex items-center gap-1.5 text-xs"><span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} /><span className="truncate font-semibold">{names[i]}</span><b className="ms-auto tabular-nums">{v}</b></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--a-chip2)]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (v / TARGET) * 100)}%`, background: colors[i] }} /></div>
          </div>
        ))}
      </div>
      <div className="relative min-h-0 flex-1"><ThreeStage api={api} fov={38} init={(ctx) => create(ctx, get, pick)} /></div>
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-center gap-2 pb-1">
        <span className="rounded-full bg-[var(--a-chip)] px-3 py-1.5 text-sm font-bold tabular-nums">{t('turn', { n: s.pot + (canMove ? gain : 0) })}</span>
        {canMove && !s.dice.length && <button type="button" onClick={() => move({ t: 'roll' })} className={clsx(btnGold, 'min-w-32')}>🎲 {t('roll')}{s.hot ? ` · ${t('hot')}` : ''}</button>}
        {canMove && s.dice.length > 0 && (gain
          ? <><button type="button" onClick={() => keep(false)} className={btnSoft}>🎲 {t('keep')}</button><button type="button" onClick={() => keep(true)} className={btnGold}>💰 {t('bank', { n: s.pot + gain })}</button></>
          : <span className="text-sm text-[var(--a-soft)]">{t('pick')}</span>)}
      </div>
    </div>
  );
}

// Which way up shows each face (the cube's faces are +x 3, -x 4, +y 1, -y 6, +z 2, -z 5).
const UP: Record<number, [number, number, number]> = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
const FACES = [3, 4, 1, 6, 2, 5];
const DOTS: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

function create({ THREE, scene, camera, size }: ThreeCtx, get: () => Props, pick: Pick): Game3D {
  let pal = theme.get();
  const bg = new THREE.Color(pal.bg1);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a8d8, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(3, 9, 5);
  scene.add(sun);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.3, 48), new THREE.MeshLambertMaterial({ color: pal.teal }));
  felt.position.y = -0.15;
  scene.add(felt);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.22, 10, 48), new THREE.MeshLambertMaterial({ color: pal.orange }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
  scene.add(rim);
  // One texture per face value.
  const face = (v: number) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#e9dcc4'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
    g.fillStyle = v === 1 ? '#ff6b5e' : '#2b2440';
    for (const [x, y] of DOTS[v]) { g.beginPath(); g.arc(64 + x * 32, 64 + y * 32, v === 1 ? 17 : 12, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const faceTex = Object.fromEntries([1, 2, 3, 4, 5, 6].map((v) => [v, face(v)]));
  const cube = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  const dice = Array.from({ length: 6 }, () => {
    const mats = FACES.map((v) => new THREE.MeshLambertMaterial({ map: faceTex[v] }));
    const m = new THREE.Mesh(cube, mats);
    scene.add(m);
    return { m, mats, from: new THREE.Quaternion(), to: new THREE.Quaternion(), k: 1, lift: 0 };
  });
  let seen: DiceState | null = null, shown: number[] = [], grey = false, rolledAt = -10, now = 0;
  const slot = (i: number, n: number): [number, number] => { const cols = n > 4 ? 3 : n > 1 ? Math.min(n, 2) : 1; const rows = Math.ceil(n / cols); return [(i % cols - (cols - 1) / 2) * 1.55, (Math.floor(i / cols) - (rows - 1) / 2) * 1.55]; };
  const show = (values: number[], tumble: boolean) => {
    shown = values;
    dice.forEach((d, i) => {
      d.m.visible = i < values.length;
      if (!d.m.visible) return;
      const [x, z] = slot(i, values.length);
      d.m.position.set(x, 0.48, z);
      const e = UP[values[i]] ?? UP[1];
      d.to.setFromEuler(new THREE.Euler(e[0], Math.floor(Math.random() * 4) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3, e[2], 'YXZ'));
      if (tumble) { d.from.setFromEuler(new THREE.Euler(Math.random() * 9, Math.random() * 9, Math.random() * 9)); d.k = 0; } else { d.m.quaternion.copy(d.to); d.k = 1; }
    });
    if (tumble) { rolledAt = now; sfx.dice(); }
  };
  const ray = new THREE.Raycaster();

  return {
    frame(dt, time) {
      now = time;
      if (theme.get() !== pal) { pal = theme.get(); bg.set(pal.bg1); (felt.material as import('three').MeshLambertMaterial).color.set(pal.teal); }
      const { s } = get();
      if (s !== seen) {
        const rolled = !seen || s.n !== seen.n;
        if (s.bust && rolled) { show(s.bust.dice, true); grey = true; sfx.bad(); }
        else if (s.dice.length) { if (rolled || s.dice.length !== shown.length) show(s.dice, rolled && !!seen); grey = false; }
        else if (!grey || !rolled) { show(Array.from({ length: s.free }, (_, i) => shown[i] ?? ((i * 2) % 6) + 1), false); grey = false; }
        seen = s;
      }
      const waiting = !s.dice.length && !grey;
      dice.forEach((d, i) => {
        if (!d.m.visible) return;
        if (d.k < 1) { d.k = Math.min(1, d.k + dt / 0.75); d.m.quaternion.slerpQuaternions(d.from, d.to, 1 - (1 - d.k) ** 3); }
        const picked = pick.set.has(i) && s.dice.length > 0 && !grey;
        d.lift += ((picked ? 0.5 : 0) - d.lift) * Math.min(1, dt * 14);
        const hop = d.k < 1 ? Math.abs(Math.sin(d.k * Math.PI * 2.5)) * (1 - d.k) * 1.6 : waiting ? Math.max(0, Math.sin(time * 3 + i)) * 0.07 : 0;
        d.m.position.y = 0.48 + d.lift + hop;
        d.m.scale.setScalar(picked ? 1.08 : 1);
        const tint = grey ? 0.55 : picked ? 1 : waiting ? 0.82 : 1;
        for (const m of d.mats) { m.color.setScalar(tint); m.emissive.set(picked ? 0x554400 : 0x000000); }
      });
      const portrait = size.w / size.h < 0.9;
      camera.position.set(0, portrait ? 11.5 : 8.2, portrait ? 7.5 : 6.2);
      camera.lookAt(0, 0, 0.2);
    },
    tap(x, y) {
      const { s, canMove } = get();
      if (!canMove || !s.dice.length || now - rolledAt < 0.5) return;
      ray.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1), camera);
      const hit = ray.intersectObjects(dice.filter((d) => d.m.visible).map((d) => d.m))[0];
      if (!hit) return;
      const i = dice.findIndex((d) => d.m === hit.object);
      if (pick.set.has(i)) pick.set.delete(i); else pick.set.add(i);
      sfx.tick();
      pick.listeners.forEach((l) => l());
    },
  };
}
