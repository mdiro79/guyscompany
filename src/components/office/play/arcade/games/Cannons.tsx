'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, label, rrect, scene, shape, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { buzz, sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { COLS, COLW, GRAVITY, MAX_HP, WH, WW, type CannonsMove, type CannonsState, type Shot } from '../rules/cannons';

export { rules } from '../rules/cannons';

// The battlefield: hills, cannons, the wind and the shell in flight. Aim by dragging back from your own
// cannon like a slingshot (letting go fires), with the buttons under the field, or with the keyboard.

const K = 0.6, W = WW * K, FIELD = WH * K, H = FIELD + 78;
type Props = BoardProps<CannonsState, CannonsMove>;
const sx = (x: number) => x * K, sy = (y: number) => FIELD - y * K;
const BTN = { aDown: [8, 44], aUp: [136, 44], pDown: [196, 44], pUp: [324, 44], fire: [384, 148] } as const; // x, width

export default function Cannons(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s;
  let shown = { h: prev.h, tanks: prev.tanks }; // what is on screen while a shell still flies
  let anim: { shot: Shot; i: number } | null = null;
  let aim: [number, number] = [...(prev.aim[Math.max(0, get().seat)] ?? [60, 60])] as [number, number], aimSeat = -1;
  let held: keyof typeof BTN | 'left' | 'right' | 'up' | 'down' | null = null, heldFor = 0, sling = false;
  const tankXY = (i: number): [number, number] => [sx((shown.tanks[i].c + 0.5) * COLW), sy(shown.h[shown.tanks[i].c])];
  const nudge = (which: typeof held, amount: number) => {
    if (which === 'aDown' || which === 'left') aim[0] = Math.min(180, aim[0] + amount); else if (which === 'aUp' || which === 'right') aim[0] = Math.max(0, aim[0] - amount);
    else if (which === 'pDown' || which === 'down') aim[1] = Math.max(10, aim[1] - amount); else if (which === 'pUp' || which === 'up') aim[1] = Math.min(100, aim[1] + amount);
  };
  const fire = () => { const { canMove, move } = get(); if (canMove && !anim) { move({ a: aim[0], p: aim[1] }); sfx.boom(); buzz(30); } };
  const button = (x: number, y: number): keyof typeof BTN | null => { if (y < FIELD + 12 || y > FIELD + 66) return null; for (const k of Object.keys(BTN) as (keyof typeof BTN)[]) if (x >= BTN[k][0] && x <= BTN[k][0] + BTN[k][1]) return k; return null; };

  return {
    step(dt) {
      fx.step(dt);
      const { s, seat, canMove } = get();
      if (s !== prev) {
        if (s.shot && s.n !== prev.n) anim = { shot: s.shot, i: 0 }; else shown = { h: s.h, tanks: s.tanks };
        prev = s;
      }
      // My turn begins: the barrel starts where I left it last time.
      if (canMove && aimSeat !== s.turn) { aimSeat = s.turn; aim = [...s.aim[s.turn]] as [number, number]; } else if (!canMove) aimSeat = -1;
      if (anim) {
        anim.i += dt * 150;
        const pts = anim.shot.path.length / 2;
        if (anim.i >= pts - 1) {
          const { hit, dmg } = anim.shot, p = theme.get();
          if (hit) {
            const x = sx(hit[0]), y = sy(hit[1]);
            fx.burst(x, y, p.orange, 26, 250, 5, 0.7); fx.burst(x, y, p.sun, 14, 150, 4, 0.5); fx.pop(x, y, p.white, 46); fx.shake(9, 0.4);
            sfx.boom(); buzz(60);
          }
          shown = { h: s.h, tanks: s.tanks };
          dmg.forEach((d, i) => { if (d > 0) { const [x, y] = tankXY(i); fx.text(x, y - 34, `-${d}`, p.coral, 20); } });
          anim = null;
        }
      }
      if (held && canMove) { heldFor += dt; if (heldFor > 0.3) nudge(held, dt * 34); }
      void seat;
    },
    draw(g, t) {
      const p = theme.get(), { s, seat, canMove, colors, names } = get();
      fx.begin(g);
      scene(g, W, H, t, p, false);
      // Wind
      const wx = W / 2, wind = s.wind;
      write(g, p, `${get().t('wind')} ${wind > 0 ? '→' : wind < 0 ? '←' : ''} ${Math.round(Math.abs(wind) * 10)}`, wx, 16, 12, 800);
      g.strokeStyle = p.sky; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(wx - wind * 40, 32); g.lineTo(wx + wind * 40, 32); g.stroke();
      // Hills
      g.save(); g.beginPath(); g.rect(0, 0, W, FIELD); g.clip();
      shape(g, p, p.dark ? '#2f7a55' : '#7fd08a', () => {
        g.beginPath(); g.moveTo(0, FIELD + 4); g.lineTo(0, sy(shown.h[0]));
        for (let i = 0; i < COLS; i++) g.lineTo(sx((i + 0.5) * COLW), sy(shown.h[i]));
        g.lineTo(W, sy(shown.h[COLS - 1])); g.lineTo(W, FIELD + 4); g.closePath();
      }, 2.5, 0);
      // Cannons
      shown.tanks.forEach((tank, i) => {
        const [x, y] = tankXY(i), dead = tank.hp <= 0, mine = i === s.turn && canMove;
        const a = ((mine ? aim[0] : s.aim[i][0]) * Math.PI) / 180;
        g.globalAlpha = dead ? 0.35 : 1;
        g.strokeStyle = p.ink; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + Math.cos(a) * 20, y - 8 - Math.sin(a) * 20); g.stroke();
        g.strokeStyle = colors[i]; g.lineWidth = 5; g.stroke();
        shape(g, p, colors[i], () => { g.beginPath(); g.arc(x, y, 12, Math.PI, 0); g.closePath(); }, 2, 0);
        for (const d of [-7, 7]) ball(g, p, x + d, y, 4, p.dark ? '#cfc7e8' : '#4a4266', 1.5, 0);
        if (!dead) {
          g.fillStyle = p.ink; rrect(g, x - 17, y - 36, 34, 7, 3); g.fill();
          g.fillStyle = tank.hp > 50 ? p.mint : tank.hp > 25 ? p.sun : p.coral; rrect(g, x - 16, y - 35, 32 * (tank.hp / MAX_HP), 5, 2.5); g.fill();
          write(g, p, names[i], x, y - 46, 10, 700, s.turn === i ? p.text : p.soft, 90);
          if (s.turn === i && !anim) { g.fillStyle = colors[i]; g.beginPath(); g.moveTo(x, y - 56 - Math.sin(t * 6) * 3); g.lineTo(x - 5, y - 64 - Math.sin(t * 6) * 3); g.lineTo(x + 5, y - 64 - Math.sin(t * 6) * 3); g.fill(); }
        }
        g.globalAlpha = 1;
      });
      // The first stretch of the flight, as a hint
      if (canMove && !anim && s.tanks[s.turn].hp > 0) {
        const [x, y] = tankXY(s.turn), a = (aim[0] * Math.PI) / 180, v = aim[1] * 6 * K;
        g.fillStyle = p.text;
        for (let i = 1; i <= 7; i++) { const tt = i * 0.055; g.globalAlpha = 0.6 - i * 0.07; g.beginPath(); g.arc(x + Math.cos(a) * v * tt, y - 10 - (Math.sin(a) * v * tt - 0.5 * GRAVITY * K * tt * tt), 2.5, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      }
      // The shell
      if (anim) {
        const i = Math.min(anim.shot.path.length / 2 - 1, Math.floor(anim.i)), x = sx(anim.shot.path[i * 2]), y = sy(anim.shot.path[i * 2 + 1]);
        for (let k = 1; k < 7; k++) { const j = Math.max(0, i - k * 2); g.globalAlpha = 0.4 - k * 0.055; g.fillStyle = p.text; g.beginPath(); g.arc(sx(anim.shot.path[j * 2]), sy(anim.shot.path[j * 2 + 1]), 4 - k * 0.4, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
        ball(g, p, x, y, 5, p.ink, 0, 0);
      }
      g.restore();
      // Controls
      tile(g, p, 4, FIELD + 6, W - 8, 66, 14, p.paper, 2, 3);
      const live = canMove && !anim;
      g.globalAlpha = live ? 1 : 0.4;
      const key = (k: keyof typeof BTN, text: string, color: string) => { const [x, w] = BTN[k]; tile(g, p, x, FIELD + 16, w, 46, 12, color, 2, held === k ? 0 : 3); label(g, p, text, x + w / 2, FIELD + 39, k === 'fire' ? 17 : 20, p.white, w - 8); };
      key('aDown', '↺', p.sky); key('aUp', '↻', p.sky); key('pDown', '−', p.grape); key('pUp', '+', p.grape); key('fire', `💥 ${get().t('fire')}`, p.coral);
      write(g, p, get().t('angle'), 94, FIELD + 27, 10, 600, p.soft); write(g, p, `${Math.round(aim[0] <= 90 ? aim[0] : 180 - aim[0])}°`, 94, FIELD + 46, 17, 800);
      write(g, p, get().t('power'), 282, FIELD + 27, 10, 600, p.soft); write(g, p, String(Math.round(aim[1])), 282, FIELD + 46, 17, 800);
      g.globalAlpha = 1;
      void seat;
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    pointer(e) {
      const { s, canMove } = get();
      if (!canMove || anim) { held = null; sling = false; return; }
      if (e.type === 'down') {
        const b = button(e.x, e.y);
        if (b === 'fire') { fire(); return; }
        if (b) { held = b; heldFor = 0; nudge(b, 1); sfx.tick(); return; }
        const [x, y] = tankXY(s.turn);
        if (Math.hypot(e.x - x, e.y - y) < 46 && e.y < FIELD) sling = true;
      } else if (e.type === 'move' && sling) {
        // Pulled back like a slingshot: the shell flies the opposite way; the longer the pull, the harder.
        const [x, y] = tankXY(s.turn), dx = x - e.x, dy = e.y - (y - 8), len = Math.hypot(dx, dy);
        if (len > 6) { aim = [Math.max(0, Math.min(180, (Math.atan2(dy, dx) * 180) / Math.PI)), Math.max(10, Math.min(100, len * 0.95))]; }
      } else if (e.type === 'up') {
        if (sling) { sling = false; const [x, y] = tankXY(s.turn); if (Math.hypot(e.x - x, e.y - y) > 16) fire(); }
        held = null;
      }
    },
    key(code, down) {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
      if (map[code]) { if (down && get().canMove) { held = map[code]; heldFor = 0; nudge(held, 1); } else if (!down && held === map[code]) held = null; }
      else if (down && (code === 'Space' || code === 'Enter')) fire();
    },
  };
}
