// Drawing board ("Steam Deck" board): what is on a board and how changes apply. Pure functions,
// shared by the 2D board, the conference screen in 3D and the network sync.

/** Board space: 16:9, the shape of the conference screen. Coordinates are rounded to whole units. */
export const BOARD_W = 1600;
export const BOARD_H = 900;

export type BoardItem =
  | { id: string; kind: 'stroke'; color: string; size: number; points: number[] } // flat x,y pairs
  | { id: string; kind: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { id: string; kind: 'image'; x: number; y: number; w: number; h: number; fileId: string };

export type BoardOp = { t: 'put'; item: BoardItem } | { t: 'del'; id: string } | { t: 'clear' };

export const BOARD_COLORS = ['#1f2328', '#e5484d', '#f08a24', '#2f9e44', '#2a78d6', '#8e4ec6'] as const;
export const PEN_SIZES = [4, 9, 18] as const;
export const TEXT_SIZES = [36, 56, 88] as const;
export const MAX_ITEMS = 600;
const MAX_POINTS = 2000;
const MAX_TEXT = 300;

export function applyOp(items: BoardItem[], op: BoardOp): BoardItem[] {
  if (op.t === 'clear') return [];
  if (op.t === 'del') return items.filter((i) => i.id !== op.id);
  const at = items.findIndex((i) => i.id === op.item.id);
  if (at >= 0) return items.map((i, k) => (k === at ? op.item : i));
  return items.length >= MAX_ITEMS ? items : [...items, op.item];
}

// The op that undoes `op` on `before` (the board as it was).
export function inverseOps(before: BoardItem[], op: BoardOp): BoardOp[] {
  if (op.t === 'clear') return before.map((item) => ({ t: 'put', item }));
  const id = op.t === 'del' ? op.id : op.item.id;
  const old = before.find((i) => i.id === id);
  return old ? [{ t: 'put', item: old }] : [{ t: 'del', id }];
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

// Items arrive from other tabs over the network: keep only well-formed ones, clamped to the board.
export function cleanItem(v: unknown): BoardItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 40);
  if (!id) return null;
  if (o.kind === 'stroke') {
    const c = color(o.color), size = num(o.size, 1, 60);
    if (!c || size === null || !Array.isArray(o.points)) return null;
    const pts: number[] = [];
    for (let i = 0; i + 1 < Math.min(o.points.length, MAX_POINTS * 2); i += 2) {
      const x = num(o.points[i], -50, BOARD_W + 50), y = num(o.points[i + 1], -50, BOARD_H + 50);
      if (x === null || y === null) return null;
      pts.push(x, y);
    }
    return pts.length >= 2 ? { id, kind: 'stroke', color: c, size, points: pts } : null;
  }
  if (o.kind === 'text') {
    const c = color(o.color), text = str(o.text, MAX_TEXT), x = num(o.x, 0, BOARD_W), y = num(o.y, 0, BOARD_H), size = num(o.size, 12, 160);
    return c && text && x !== null && y !== null && size !== null ? { id, kind: 'text', x, y, text, color: c, size } : null;
  }
  if (o.kind === 'image') {
    const fileId = str(o.fileId, 64), x = num(o.x, -BOARD_W, BOARD_W), y = num(o.y, -BOARD_H, BOARD_H), w = num(o.w, 20, BOARD_W * 2), h = num(o.h, 20, BOARD_H * 2);
    return fileId && /^[\w-]+$/.test(fileId) && x !== null && y !== null && w !== null && h !== null ? { id, kind: 'image', x, y, w, h, fileId } : null;
  }
  return null;
}

export function cleanOp(v: unknown): BoardOp | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.t === 'clear') return { t: 'clear' };
  if (o.t === 'del') { const id = str(o.id, 40); return id ? { t: 'del', id } : null; }
  if (o.t === 'put') { const item = cleanItem(o.item); return item ? { t: 'put', item } : null; }
  return null;
}

// Adds a point to a stroke unless it is too close to the last one (keeps strokes light to send).
export function addPoint(points: number[], x: number, y: number, minGap = 2.5): number[] {
  const n = points.length;
  const px = Math.round(x), py = Math.round(y);
  if (n >= 2 && Math.hypot(points[n - 2] - px, points[n - 1] - py) < minGap) return points;
  return n >= MAX_POINTS * 2 ? points : [...points, px, py];
}

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Rough box of a text item (width estimated from its length; good enough for picking).
export const textBox = (i: Extract<BoardItem, { kind: 'text' }>) => {
  const lines = i.text.split('\n');
  const w = Math.max(...lines.map((l) => l.length)) * i.size * 0.55;
  return { x: i.x, y: i.y, w: Math.max(w, i.size), h: lines.length * i.size * 1.25 };
};

/** The top-most item at (x, y), within `r` board units. */
export function itemAt(items: BoardItem[], x: number, y: number, r = 12): BoardItem | null {
  for (let k = items.length - 1; k >= 0; k--) {
    const i = items[k];
    if (i.kind === 'stroke') {
      const p = i.points;
      if (p.length === 2 && Math.hypot(p[0] - x, p[1] - y) <= r + i.size / 2) return i;
      for (let j = 2; j < p.length; j += 2) if (segDist(x, y, p[j - 2], p[j - 1], p[j], p[j + 1]) <= r + i.size / 2) return i;
    } else {
      const b = i.kind === 'text' ? textBox(i) : i;
      if (x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r) return i;
    }
  }
  return null;
}

export function moveItem(i: BoardItem, dx: number, dy: number): BoardItem {
  if (i.kind === 'stroke') return { ...i, points: i.points.map((v, k) => Math.round(v + (k % 2 ? dy : dx))) };
  return { ...i, x: Math.round(i.x + dx), y: Math.round(i.y + dy) };
}

/** Image size that fits the board at most `share` of each side, keeping its shape. */
export function fitImage(w: number, h: number, share = 0.6) {
  const s = Math.min((BOARD_W * share) / w, (BOARD_H * share) / h, 1);
  return { w: Math.max(20, Math.round(w * s)), h: Math.max(20, Math.round(h * s)) };
}
