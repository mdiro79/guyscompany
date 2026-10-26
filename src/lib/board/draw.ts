'use client';
import { BOARD_H, BOARD_W, nameTags, type BoardItem } from './model';

// Paints a board onto a 2D canvas: the board on screen (2D) and the conference screen texture (3D)
// use the same code, so both show exactly the same picture.

const images = new Map<string, HTMLImageElement>();
const waiting = new Set<() => void>();

/** The loaded picture for an uploaded file, or null while it loads (`onLoad` runs when it is ready). */
export function boardImage(fileId: string, onLoad: () => void): HTMLImageElement | null {
  let img = images.get(fileId);
  if (!img) {
    img = new Image();
    // The conference screen draws it into a WebGL texture, which needs a CORS-clean picture.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { const l = [...waiting]; waiting.clear(); l.forEach((f) => f()); };
    img.src = `/api/files/${fileId}`;
    images.set(fileId, img);
  }
  if (img.complete && img.naturalWidth) return img;
  waiting.add(onLoad);
  return null;
}

const RTL = /[֐-ࣿיִ-ﻼ]/;
const FONT = '"Vazirmatn Variable", "Inter Variable", system-ui, sans-serif';

function stroke(g: CanvasRenderingContext2D, i: Extract<BoardItem, { kind: 'stroke' }>) {
  const p = i.points;
  // A highlighter is a wide, see-through marker drawn with square-ish ends.
  const size = i.hl ? i.size * 3 : i.size;
  g.save();
  if (i.hl) { g.globalAlpha = 0.35; g.lineCap = 'butt'; }
  g.strokeStyle = i.color; g.fillStyle = i.color; g.lineWidth = size;
  if (p.length === 2) { g.beginPath(); g.arc(p[0], p[1], size / 2, 0, Math.PI * 2); g.fill(); g.restore(); return; }
  // Smooth curve through the midpoints of the recorded points.
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let k = 2; k < p.length - 2; k += 2) g.quadraticCurveTo(p[k], p[k + 1], (p[k] + p[k + 2]) / 2, (p[k + 1] + p[k + 3]) / 2);
  g.lineTo(p[p.length - 2], p[p.length - 1]);
  g.stroke();
  g.restore();
}

function text(g: CanvasRenderingContext2D, i: Extract<BoardItem, { kind: 'text' }>) {
  g.fillStyle = i.color;
  g.font = `600 ${i.size}px ${FONT}`;
  g.textBaseline = 'top';
  // Lines run right-to-left when they contain Persian; every line keeps its left edge at the item's x.
  g.textAlign = 'left';
  i.text.split('\n').forEach((line, n) => {
    g.direction = RTL.test(line) ? 'rtl' : 'ltr';
    g.fillText(line, i.x, i.y + n * i.size * 1.25);
  });
  g.direction = 'ltr';
}

/** Colours of the name tags, one per member (in the team's order). */
export const TAG_COLORS = ['#2a78d6', '#d9443c', '#2f9e44', '#8e4ec6', '#f08a24', '#0f9d9a', '#c2417c', '#5b6472'];
/** A member's colour (name tag, laser pointer) from their place in the team. */
export const memberColor = (ids: string[], id: string) => TAG_COLORS[Math.max(0, ids.indexOf(id)) % TAG_COLORS.length];

/** Who wrote what: names next to the writing, `active` ones (writing right now) highlighted. */
export interface TagOptions { owner: string; name: (id: string) => string | null; color: (id: string) => string; active?: (id: string) => boolean; skip?: string }

function pill(g: CanvasRenderingContext2D, label: string, x: number, y: number, color: string, active: boolean) {
  const px = 24, h = 40;
  g.font = `700 ${px}px ${FONT}`;
  g.direction = RTL.test(label) ? 'rtl' : 'ltr';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(label).width + 28;
  // Just above and after the writing, kept on the board.
  const left = Math.max(4, Math.min(BOARD_W - w - 4, x + 10)), top = Math.max(4, Math.min(BOARD_H - h - 4, y - h - 8));
  g.save();
  g.globalAlpha = active ? 1 : 0.78;
  if (active) { g.shadowColor = color; g.shadowBlur = 18; }
  g.fillStyle = color;
  g.beginPath(); g.roundRect(left, top, w, h, h / 2); g.fill();
  g.shadowBlur = 0;
  if (active) { g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke(); }
  g.fillStyle = '#ffffff';
  g.fillText(label, left + w / 2, top + h / 2 + 1);
  g.restore();
  g.direction = 'ltr'; g.textAlign = 'left'; g.textBaseline = 'top';
}

/** Name tags next to the writing on a page (see `nameTags`). */
export function drawTags(g: CanvasRenderingContext2D, items: BoardItem[], scale: number, t: TagOptions) {
  g.save();
  g.setTransform(scale, 0, 0, scale, 0, 0);
  for (const tag of nameTags(items, t.owner)) {
    if (tag.by === t.skip) continue;
    const name = t.name(tag.by);
    if (name) pill(g, (t.active?.(tag.by) ? '✎ ' : '') + name, tag.x, tag.y, t.color(tag.by), !!t.active?.(tag.by));
  }
  g.restore();
}

/** Draws `items` on a canvas whose size is the board scaled by `scale`. */
export function drawBoard(g: CanvasRenderingContext2D, items: BoardItem[], scale: number, onImage: () => void, opts: { grid?: boolean; tags?: TagOptions } = {}) {
  g.save();
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = '#fbfaf7';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  if (opts.grid) {
    g.fillStyle = '#dcd6cc';
    for (let x = 40; x < BOARD_W; x += 40) for (let y = 40; y < BOARD_H; y += 40) g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const i of items) {
    if (i.kind === 'stroke') stroke(g, i);
    else if (i.kind === 'text') text(g, i);
    else {
      const img = boardImage(i.fileId, onImage);
      if (img) g.drawImage(img, i.x, i.y, i.w, i.h);
      else { g.fillStyle = '#ece7df'; g.fillRect(i.x, i.y, i.w, i.h); }
    }
  }
  g.restore();
  if (opts.tags) drawTags(g, items, scale, opts.tags);
}
