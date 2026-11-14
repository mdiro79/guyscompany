// Drawing board ("Steam Deck" board): what is on a board and how changes apply. Pure functions,
// shared by the 2D board, the conference screen in 3D and the network sync.

/** Board space: 16:9, the shape of the conference screen. Coordinates are rounded to whole units. */
export const BOARD_W = 1600;
export const BOARD_H = 900;

// Every item may carry who made it (`by`, a member id; the board's owner when missing) and its page
// (`pg`, 0 when missing). A highlighter stroke (`hl`) is drawn wide and see-through.
interface ItemBase { id: string; by?: string; pg?: number }
export type BoardItem = ItemBase & (
  | { kind: 'stroke'; color: string; size: number; points: number[]; hl?: boolean } // flat x,y pairs
  | { kind: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { kind: 'image'; x: number; y: number; w: number; h: number; fileId: string });

// `clear` with a page empties that page only; `delpage` removes a page and moves the later ones up.
// `pts` adds points to a stroke being drawn: only the new ones travel (`from` is how many numbers the
// stroke had when they were taken), so a long stroke does not resend all of itself many times a second.
export type BoardOp =
  | { t: 'put'; item: BoardItem } | { t: 'del'; id: string } | { t: 'clear'; pg?: number } | { t: 'delpage'; pg: number }
  | { t: 'pts'; id: string; from: number; points: number[] };

export const BOARD_COLORS = ['#1f2328', '#e5484d', '#f08a24', '#2f9e44', '#2a78d6', '#8e4ec6'] as const;
export const PEN_SIZES = [4, 9, 18] as const;
export const TEXT_SIZES = [36, 56, 88] as const;
export const MAX_ITEMS = 600;
export const MAX_PAGES = 50; // room for a whole presentation, one slide a page
const MAX_POINTS = 2000;
const MAX_TEXT = 300;

export const pageOf = (i: BoardItem) => i.pg ?? 0;
export const onPage = (items: BoardItem[], pg: number) => items.filter((i) => pageOf(i) === pg);

export function applyOp(items: BoardItem[], op: BoardOp): BoardItem[] {
  if (op.t === 'clear') return op.pg === undefined ? [] : items.filter((i) => pageOf(i) !== op.pg);
  if (op.t === 'delpage') return items.filter((i) => pageOf(i) !== op.pg).map((i) => (pageOf(i) > op.pg ? { ...i, pg: pageOf(i) - 1 } : i));
  if (op.t === 'del') return items.filter((i) => i.id !== op.id);
  if (op.t === 'pts') return appendPoints(items, op);
  const at = items.findIndex((i) => i.id === op.item.id);
  if (at >= 0) return items.map((i, k) => (k === at ? op.item : i));
  return items.length >= MAX_ITEMS ? items : [...items, op.item];
}

// New points for a stroke: the part not there yet is added. Points that were missed (a gap) are not
// guessed: the whole stroke follows when it ends.
function appendPoints(items: BoardItem[], op: Extract<BoardOp, { t: 'pts' }>): BoardItem[] {
  const at = items.findIndex((i) => i.id === op.id);
  const old = at >= 0 ? items[at] : null;
  if (!old || old.kind !== 'stroke' || op.from > old.points.length) return items;
  const extra = op.points.slice(old.points.length - op.from);
  if (!extra.length || old.points.length >= MAX_POINTS * 2) return items;
  const points = old.points.concat(extra.slice(0, MAX_POINTS * 2 - old.points.length));
  return items.map((i, k) => (k === at ? { ...old, points } : i));
}

// The op that undoes `op` on `before` (the board as it was).
export function inverseOps(before: BoardItem[], op: BoardOp): BoardOp[] {
  if (op.t === 'clear') return (op.pg === undefined ? before : onPage(before, op.pg)).map((item) => ({ t: 'put', item }));
  if (op.t === 'delpage') return []; // not undoable (asked for confirmation instead)
  const id = op.t === 'put' ? op.item.id : op.id;
  const old = before.find((i) => i.id === id);
  return old ? [{ t: 'put', item: old }] : op.t === 'pts' ? [] : [{ t: 'del', id }];
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

// Items arrive from other tabs over the network: keep only well-formed ones, clamped to the board.
export function cleanItem(v: unknown): BoardItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const base = cleanBase(o);
  if (!base) return null;
  const item = cleanKind(o, base.id);
  return item && { ...item, ...base };
}

function cleanBase(o: Record<string, unknown>): ItemBase | null {
  const id = str(o.id, 40);
  if (!id) return null;
  const base: ItemBase = { id };
  const by = str(o.by, 40), pg = num(o.pg, 0, MAX_PAGES - 1);
  if (by) base.by = by;
  if (pg) base.pg = pg;
  return base;
}

// Flat x,y pairs from the network, clamped near the board; null if any is not a number.
function cleanPoints(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const pts: number[] = [];
  for (let i = 0; i + 1 < Math.min(v.length, MAX_POINTS * 2); i += 2) {
    const x = num(v[i], -50, BOARD_W + 50), y = num(v[i + 1], -50, BOARD_H + 50);
    if (x === null || y === null) return null;
    pts.push(x, y);
  }
  return pts;
}

function cleanKind(o: Record<string, unknown>, id: string): BoardItem | null {
  if (o.kind === 'stroke') {
    const c = color(o.color), size = num(o.size, 1, 60), pts = cleanPoints(o.points);
    if (!c || size === null || !pts) return null;
    return pts.length >= 2 ? { id, kind: 'stroke', color: c, size, points: pts, ...(o.hl === true ? { hl: true } : {}) } : null;
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
  if (o.t === 'clear') { const pg = num(o.pg, 0, MAX_PAGES - 1); return pg === null ? { t: 'clear' } : { t: 'clear', pg }; }
  if (o.t === 'delpage') { const pg = num(o.pg, 0, MAX_PAGES - 1); return pg === null ? null : { t: 'delpage', pg }; }
  if (o.t === 'del') { const id = str(o.id, 40); return id ? { t: 'del', id } : null; }
  if (o.t === 'put') { const item = cleanItem(o.item); return item ? { t: 'put', item } : null; }
  if (o.t === 'pts') {
    const id = str(o.id, 40), from = num(o.from, 0, MAX_POINTS * 2), points = cleanPoints(o.points);
    return id && from !== null && from % 2 === 0 && points?.length ? { t: 'pts', id, from, points } : null;
  }
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

/** Who made an item: its author, or the board's owner for items made before authors were recorded. */
export const authorOf = (i: BoardItem, owner: string) => i.by ?? owner;

/**
 * Whether `by` may apply `op` to `owner`'s board, as it stands in `items`. The owner may do anything; while
 * the owner lets everyone draw, others may add items and change or erase only their own.
 */
export function mayEdit(items: BoardItem[], op: BoardOp, by: string, owner: string, shared: boolean) {
  if (by === owner) return true;
  if (!shared || op.t === 'clear' || op.t === 'delpage') return false;
  const id = op.t === 'put' ? op.item.id : op.id;
  const old = items.find((i) => i.id === id);
  if (old && authorOf(old, owner) !== by) return false;
  if (op.t === 'pts') return !!old;
  return op.t === 'del' || op.item.by === by;
}

/** Where a name tag goes for an item: the end of a stroke, the top right of text, the top left of a picture. */
function anchor(i: BoardItem): [number, number] {
  if (i.kind === 'stroke') return [i.points[i.points.length - 2], i.points[i.points.length - 1]];
  if (i.kind === 'text') { const b = textBox(i); return [b.x + b.w, b.y]; }
  return [i.x, i.y];
}

/**
 * Name tags for a page: one per author per group of nearby items, at the author's newest item in the
 * group, so every piece of writing has its author's name next to it without a tag on each stroke.
 */
export function nameTags(items: BoardItem[], owner: string, gap = 240): { by: string; x: number; y: number; itemId: string }[] {
  const tags: { by: string; x: number; y: number; itemId: string }[] = [];
  for (let k = items.length - 1; k >= 0; k--) {
    const i = items[k], by = authorOf(i, owner);
    const [x, y] = anchor(i);
    if (tags.some((t) => t.by === by && Math.hypot(t.x - x, t.y - y) < gap)) continue;
    tags.push({ by, x, y, itemId: i.id });
  }
  return tags;
}

/**
 * A picture or a piece of text made `factor` times bigger around the board point (cx, cy) — two fingers
 * pinching it, or the mouse wheel. Pictures keep their shape; sizes stay within what the board accepts.
 * Strokes are returned as they are.
 */
export function scaleItem(i: BoardItem, factor: number, cx: number, cy: number): BoardItem {
  if (i.kind === 'image') {
    const k = Math.min(BOARD_W * 2 / i.w, BOARD_H * 2 / i.h, Math.max(40 / Math.min(i.w, i.h), factor));
    return { ...i, w: Math.round(i.w * k), h: Math.round(i.h * k), x: Math.round(cx + (i.x - cx) * k), y: Math.round(cy + (i.y - cy) * k) };
  }
  if (i.kind === 'text') {
    const size = Math.min(160, Math.max(12, Math.round(i.size * factor))), k = size / i.size;
    return { ...i, size, x: Math.min(BOARD_W, Math.max(0, Math.round(cx + (i.x - cx) * k))), y: Math.min(BOARD_H, Math.max(0, Math.round(cy + (i.y - cy) * k))) };
  }
  return i;
}
