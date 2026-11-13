'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, label, rrect, scene, tile } from '../kit/fx';
import { theme, type Palette } from '../kit/theme';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { BAR, legal, pips, type NardMove, type NardState } from '../rules/nard';

export { rules } from '../rules/nard';

// The backgammon board, seen from the player's own side: their home is bottom right, checkers travel
// anticlockwise from top right, along the top to the left, down and along the bottom to the right.

const W = 360, H = 430, PW = 25, BARW = 22, TRAY = 26, LEFT = 6, TOP = 58, BH = 300, R = 10.5, OFF = -1;
type Props = BoardProps<NardState, NardMove>;

export default function Nard(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

// Where an own point (0–23), the bar or the tray is on the board, for the viewer.
const colX = (col: number) => LEFT + col * PW + (col >= 6 ? BARW : 0) + PW / 2; // col 0–11 from the left
const pointX = (i: number) => colX(i < 12 ? 11 - i : i - 12);
const isTop = (i: number) => i >= 12;
const BAR_X = LEFT + 6 * PW + BARW / 2, TRAY_X = LEFT + 12 * PW + BARW + TRAY / 2 + 2;
/** Centre of the n-th checker (from the edge) on a point; tall stacks are squeezed. */
function spot(i: number, n: number, total: number): [number, number] {
  const gap = total > 5 ? (R * 2 * 4.2) / (total - 1) : R * 2;
  return isTop(i) ? [pointX(i), TOP + R + 2 + n * gap] : [pointX(i), TOP + BH - R - 2 - n * gap];
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, sel = -2, slide = 1, slideFrom: [number, number] = [0, 0], note = 0, shown = get().s.n, rollT = 1;
  // An own point of `who` seen as an own point of the viewer.
  const seen = (who: number, i: number) => (who === get().seat ? i : 23 - i);
  const place = (who: number, i: number): [number, number] => {
    const { s, seat } = get();
    if (i === BAR) return [BAR_X, TOP + BH / 2 + (who === seat ? 34 : -34)];
    if (i < 0) return [TRAY_X, who === seat ? TOP + BH - 30 : TOP + 30];
    const v = seen(who, i), total = Math.abs(s.p[seat === 0 ? v : 23 - v]);
    return spot(v, Math.max(0, total - 1), total);
  };
  const moves = () => (get().canMove ? legal(get().s) : []);

  return {
    step(dt) {
      fx.step(dt); slide = Math.min(1, slide + dt / 0.26); note = Math.max(0, note - dt); rollT = Math.min(1, rollT + dt / 0.5);
      const s = get().s;
      if (s === prev) return;
      if (s.last && s.last !== prev.last) {
        slideFrom = place(s.last.seat, s.last.from); slide = 0;
        if (s.last.hit) { const [x, y] = place(s.last.seat, s.last.to); const p = theme.get(); fx.confetti(x, y, [p.white, p.sun, p.coral], 14, 200); fx.shake(4, 0.2); sfx.hit(); } else sfx.place();
      }
      if (s.n !== shown) { shown = s.n; rollT = 0; sfx.dice(); if (s.skipped) note = 2.4; }
      sel = -2; prev = s;
    },
    draw(g, t) {
      const p = theme.get(), { s, seat, colors, names } = get(), other = 1 - seat;
      fx.begin(g);
      scene(g, W, H, t, p);
      // Who is who, with pip counts (the distance still to travel).
      [other, seat].forEach((who, row) => {
        const y = row ? H - 30 : 26;
        tile(g, p, LEFT, y - 16, W - LEFT * 2, 32, 16, p.paper, 2, 3);
        ball(g, p, LEFT + 20, y, 10, colors[who], 2, 0);
        g.font = '700 13px "Inter Variable", "Vazirmatn Variable", system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = p.text; g.fillText(names[who], LEFT + 38, y + 1, 150);
        g.textAlign = 'right'; g.fillStyle = p.soft; g.fillText(`${pips(s, who)} ◆  ${s.off[who]}/15`, W - LEFT - 14, y + 1);
        if (s.turn === who && s.dice.length) { g.strokeStyle = colors[who]; g.lineWidth = 3; rrect(g, LEFT, y - 16, W - LEFT * 2, 32, 16); g.stroke(); }
      });
      // Board: felt, bar, tray and the 24 triangles.
      tile(g, p, LEFT - 4, TOP - 4, W - LEFT * 2 + 8, BH + 8, 12, p.dark ? '#4a3524' : '#b9895a', 2, 4);
      g.fillStyle = p.dark ? '#2f3f37' : '#f6ead4'; rrect(g, LEFT, TOP, 12 * PW + BARW, BH, 6); g.fill();
      g.fillStyle = p.dark ? '#3a2a1c' : '#a6784c'; g.fillRect(LEFT + 6 * PW, TOP, BARW, BH);
      g.fillStyle = p.dark ? '#22302a' : '#ead9bd'; rrect(g, TRAY_X - TRAY / 2, TOP, TRAY, BH, 5); g.fill();
      const ms = moves(), from = ms.some((m) => m.from === sel) ? sel : -2, dests = ms.filter((m) => m.from === from);
      for (let i = 0; i < 24; i++) {
        const x = pointX(i), top = isTop(i), y0 = top ? TOP : TOP + BH, tip = top ? TOP + BH * 0.4 : TOP + BH * 0.6;
        g.fillStyle = i % 2 ? (p.dark ? '#7a4a3a' : '#e07a5f') : (p.dark ? '#3f6f73' : '#3d8f8f');
        g.beginPath(); g.moveTo(x - PW / 2 + 1.5, y0); g.lineTo(x + PW / 2 - 1.5, y0); g.lineTo(x, tip); g.closePath(); g.fill();
        if (dests.some((m) => m.from - m.die === i)) { g.fillStyle = p.sun; g.globalAlpha = 0.5 + Math.sin(t * 6) * 0.25; g.beginPath(); g.arc(x, top ? tip + 9 : tip - 9, 6, 0, TAU); g.fill(); g.globalAlpha = 1; }
      }
      if (dests.some((m) => m.from - m.die < 0)) { g.strokeStyle = p.sun; g.lineWidth = 3; g.setLineDash([5, 4]); g.lineDashOffset = -t * 14; rrect(g, TRAY_X - TRAY / 2, TOP + BH / 2, TRAY, BH / 2, 5); g.stroke(); g.setLineDash([]); }
      // Checkers (the one that just moved slides in).
      const sliding = slide < 1 && s.last ? s.last : null;
      const checker = (x: number, y: number, who: number, glow = false) => {
        ball(g, p, x, y, R, colors[who], 2, 2);
        g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R * 0.55, 0, TAU); g.stroke();
        if (glow) { g.strokeStyle = p.white; g.lineWidth = 2; g.setLineDash([3, 3]); g.lineDashOffset = -t * 10; g.beginPath(); g.arc(x, y, R + 2.5, 0, TAU); g.stroke(); g.setLineDash([]); }
      };
      for (let v = 0; v < 24; v++) {
        const raw = s.p[seat === 0 ? v : 23 - v], who = raw > 0 ? 0 : 1;
        let n = Math.abs(raw);
        if (!n) continue;
        const total = n;
        if (sliding && sliding.to >= 0 && seen(sliding.seat, sliding.to) === v) n--;
        const movable = who === seat && ms.some((m) => m.from === v);
        for (let k = 0; k < n; k++) { const [x, y] = spot(v, k, total); checker(x, y - (v === from && k === n - 1 ? (isTop(v) ? -5 : 5) : 0), who, movable && k === n - 1 && v !== from); }
        if (total > 5) { const [x, y] = spot(v, 0, total); label(g, p, String(total), x, y, 11, p.white); }
      }
      for (const who of [0, 1]) {
        const n = s.bar[who];
        for (let k = 0; k < n; k++) checker(BAR_X, TOP + BH / 2 + (who === seat ? 1 : -1) * (34 + k * 9), who, who === seat && ms.some((m) => m.from === BAR) && k === n - 1);
        // Borne-off checkers as a pile of thin slices in the tray.
        for (let k = 0; k < s.off[who]; k++) { g.fillStyle = colors[who]; const y = who === seat ? TOP + BH - 8 - k * 7 : TOP + 3 + k * 7; rrect(g, TRAY_X - 10, y, 20, 5.5, 2); g.fill(); g.strokeStyle = p.ink; g.lineWidth = 1; g.stroke(); }
      }
      if (sliding) { const [tx, ty] = place(sliding.seat, sliding.to), k = 1 - (1 - slide) ** 3; checker(slideFrom[0] + (tx - slideFrom[0]) * k, slideFrom[1] + (ty - slideFrom[1]) * k - Math.sin(k * Math.PI) * 14, sliding.seat); }
      // Dice of the player to move: played ones fade.
      if (s.dice.length || s.off.some((n) => n >= 15)) {
        const all = s.roll[0] === s.roll[1] ? [s.roll[0], s.roll[0], s.roll[0], s.roll[0]] : [s.roll[0], s.roll[1]];
        const left = s.dice.slice(), side = s.turn === seat ? 1 : -1;
        all.forEach((v, i) => {
          const k = left.indexOf(v), unused = k >= 0;
          if (unused) left.splice(k, 1);
          const cx = (side > 0 ? LEFT + 9 * PW + BARW : LEFT + 3 * PW) + (i - (all.length - 1) / 2) * 27, cy = TOP + BH / 2;
          die(g, p, cx, cy + (1 - rollT) * -18 * Math.abs(Math.sin(rollT * 9 + i)), rollT < 1 ? 1 + Math.floor((t * 20 + i * 3) % 6) : v, unused ? 1 : 0.35, colors[s.turn], (1 - rollT) * (i % 2 ? 1 : -1) * 2.5);
        });
      }
      if (note > 0) { g.globalAlpha = Math.min(1, note); label(g, p, get().t('noMove'), W / 2, TOP + BH / 2 + 44, 14, p.sun, W - 60); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    tap(x, y) {
      const { canMove, move } = get();
      if (!canMove || y < TOP - 6 || y > TOP + BH + 6) return;
      const ms = moves();
      // Which own point (or the bar, or the tray) was tapped.
      let hit = -2;
      if (Math.abs(x - TRAY_X) < TRAY / 2 + 3) hit = OFF;
      else if (Math.abs(x - BAR_X) < BARW / 2 + 2) hit = BAR;
      else for (let i = 0; i < 24; i++) if (Math.abs(x - pointX(i)) <= PW / 2 && isTop(i) === y < TOP + BH / 2) hit = i;
      if (hit === -2) return;
      const dest = ms.filter((m) => m.from === sel && (hit === OFF ? m.from - m.die < 0 : m.from - m.die === hit));
      if (sel !== -2 && dest.length) { move(dest.sort((a, b) => a.die - b.die)[0]); sel = -2; return; }
      // Tapping the chosen point again plays its larger die.
      if (hit === sel) { const own = ms.filter((m) => m.from === sel).sort((a, b) => b.die - a.die); if (own.length) { move(own[0]); sel = -2; } return; }
      if (ms.some((m) => m.from === hit)) { sel = hit; sfx.tick(); } else sel = -2;
    },
  };
}

const PIPS: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
function die(g: CanvasRenderingContext2D, p: Palette, x: number, y: number, v: number, alpha: number, color: string, rot: number) {
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha;
  tile(g, p, -11, -11, 22, 22, 5, '#ffffff', 2, alpha === 1 ? 3 : 0);
  g.fillStyle = color;
  for (const [dx, dy] of PIPS[v] ?? []) { g.beginPath(); g.arc(dx * 5.6, dy * 5.6, 2.3, 0, TAU); g.fill(); }
  g.restore();
}
