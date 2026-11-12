import { describe, expect, it } from 'vitest';
import { addPoint, applyOp, cleanItem, cleanOp, inverseOps, itemAt, moveItem, fitImage, mayEdit, nameTags, onPage, MAX_ITEMS, type BoardItem } from './model';

const stroke = (id: string, points: number[]): BoardItem => ({ id, kind: 'stroke', color: '#1f2328', size: 4, points });

describe('board model', () => {
  it('puts, replaces, deletes and clears', () => {
    let b = applyOp([], { t: 'put', item: stroke('a', [0, 0, 10, 10]) });
    b = applyOp(b, { t: 'put', item: stroke('b', [5, 5, 6, 6]) });
    b = applyOp(b, { t: 'put', item: stroke('a', [1, 1, 2, 2]) });
    expect(b.map((i) => i.id)).toEqual(['a', 'b']);
    expect((b[0] as Extract<BoardItem, { kind: 'stroke' }>).points).toEqual([1, 1, 2, 2]);
    expect(applyOp(b, { t: 'del', id: 'a' }).map((i) => i.id)).toEqual(['b']);
    expect(applyOp(b, { t: 'clear' })).toEqual([]);
  });

  it('caps the number of items', () => {
    let b: BoardItem[] = [];
    for (let i = 0; i < MAX_ITEMS + 5; i++) b = applyOp(b, { t: 'put', item: stroke(`s${i}`, [0, 0]) });
    expect(b).toHaveLength(MAX_ITEMS);
  });

  it('undoes a new item, an edit, a delete and a clear', () => {
    const before = [stroke('a', [0, 0, 1, 1]), stroke('b', [2, 2])];
    const undo = (op: Parameters<typeof applyOp>[1]) => inverseOps(before, op).reduce(applyOp, applyOp(before, op));
    expect(undo({ t: 'put', item: stroke('c', [3, 3]) })).toEqual(before);
    expect(undo({ t: 'put', item: stroke('a', [9, 9]) })).toEqual(before);
    expect(undo({ t: 'del', id: 'b' }).map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(undo({ t: 'clear' })).toEqual(before);
  });

  it('drops malformed items from the network and clamps the rest', () => {
    expect(cleanItem({ id: 'x', kind: 'stroke', color: 'red', size: 4, points: [0, 0] })).toBeNull();
    expect(cleanItem({ id: 'x', kind: 'stroke', color: '#ff0000', size: 4, points: ['a', 1] })).toBeNull();
    expect(cleanItem({ id: 'x', kind: 'image', x: 0, y: 0, w: 100, h: 100, fileId: '../etc' })).toBeNull();
    expect(cleanItem({ id: 'x', kind: 'text', x: 99999, y: 10.6, text: 'سلام', color: '#123456', size: 40 }))
      .toEqual({ id: 'x', kind: 'text', x: 1600, y: 11, text: 'سلام', color: '#123456', size: 40 });
    expect(cleanOp({ t: 'put', item: { id: 'y', kind: 'nope' } })).toBeNull();
    expect(cleanOp({ t: 'del', id: 'y' })).toEqual({ t: 'del', id: 'y' });
  });

  it('skips points closer than the gap', () => {
    let p: number[] = [];
    p = addPoint(p, 10, 10); p = addPoint(p, 11, 10); p = addPoint(p, 20, 10);
    expect(p).toEqual([10, 10, 20, 10]);
  });

  it('finds the item under the pointer, top-most first, and moves it', () => {
    const items: BoardItem[] = [
      stroke('line', [0, 100, 200, 100]),
      { id: 'img', kind: 'image', x: 150, y: 50, w: 100, h: 100, fileId: 'f1' },
    ];
    expect(itemAt(items, 100, 104)?.id).toBe('line');
    expect(itemAt(items, 180, 100)?.id).toBe('img');
    expect(itemAt(items, 500, 500)).toBeNull();
    expect(moveItem(items[0], 5, -5)).toMatchObject({ points: [5, 95, 205, 95] });
  });

  it('fits a large image into the board keeping its shape', () => {
    expect(fitImage(4000, 2000)).toEqual({ w: 960, h: 480 });
    expect(fitImage(300, 200)).toEqual({ w: 300, h: 200 });
  });

  it('keeps pages apart: clears one page, removes a page and moves later ones up', () => {
    const b: BoardItem[] = [stroke('a', [0, 0]), { ...stroke('b', [1, 1]), pg: 1 }, { ...stroke('c', [2, 2]), pg: 2 }];
    expect(applyOp(b, { t: 'clear', pg: 1 }).map((i) => i.id)).toEqual(['a', 'c']);
    const after = applyOp(b, { t: 'delpage', pg: 1 });
    expect(after.map((i) => [i.id, i.pg ?? 0])).toEqual([['a', 0], ['c', 1]]);
    expect(onPage(b, 0).map((i) => i.id)).toEqual(['a']);
    const undone = inverseOps(b, { t: 'clear', pg: 2 }).reduce(applyOp, applyOp(b, { t: 'clear', pg: 2 }));
    expect(undone.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('carries author, page and highlighter over the network', () => {
    expect(cleanItem({ id: 'h', kind: 'stroke', color: '#ff0000', size: 4, points: [1, 1], by: 'u2', pg: 3, hl: true }))
      .toEqual({ id: 'h', kind: 'stroke', color: '#ff0000', size: 4, points: [1, 1], by: 'u2', pg: 3, hl: true });
    expect(cleanOp({ t: 'clear', pg: 2 })).toEqual({ t: 'clear', pg: 2 });
    expect(cleanOp({ t: 'delpage' })).toBeNull();
  });

  it('lets others draw on a shared board but change only their own items', () => {
    const items: BoardItem[] = [stroke('own', [0, 0]), { ...stroke('theirs', [1, 1]), by: 'guest' }];
    const put = (id: string, by?: string) => ({ t: 'put' as const, item: { ...stroke(id, [5, 5]), ...(by ? { by } : {}) } });
    expect(mayEdit(items, { t: 'clear' }, 'owner', 'owner', false)).toBe(true);
    expect(mayEdit(items, put('new', 'guest'), 'guest', 'owner', false)).toBe(false);
    expect(mayEdit(items, put('new', 'guest'), 'guest', 'owner', true)).toBe(true);
    expect(mayEdit(items, put('new'), 'guest', 'owner', true)).toBe(false);
    expect(mayEdit(items, put('theirs', 'guest'), 'guest', 'owner', true)).toBe(true);
    expect(mayEdit(items, { t: 'del', id: 'theirs' }, 'guest', 'owner', true)).toBe(true);
    expect(mayEdit(items, { t: 'del', id: 'own' }, 'guest', 'owner', true)).toBe(false);
    expect(mayEdit(items, put('own', 'guest'), 'guest', 'owner', true)).toBe(false);
    expect(mayEdit(items, { t: 'clear', pg: 0 }, 'guest', 'owner', true)).toBe(false);
  });

  it('puts one name tag per author for each group of nearby writing, at the newest item', () => {
    const items: BoardItem[] = [
      stroke('a1', [100, 100, 120, 100]), stroke('a2', [130, 110, 150, 110]),
      { ...stroke('b1', [140, 120]), by: 'sara' },
      stroke('a3', [1200, 700, 1250, 700]),
    ];
    const tags = nameTags(items, 'mehdi');
    expect(tags.map((t) => [t.by, t.itemId])).toEqual([['mehdi', 'a3'], ['sara', 'b1'], ['mehdi', 'a2']]);
    expect(tags[2]).toMatchObject({ x: 150, y: 110 });
  });
});

describe('live stroke points', () => {
  const pts = (b: BoardItem[]) => (b[0] as Extract<BoardItem, { kind: 'stroke' }>).points;
  it('adds only the new points, ignoring ones already there', () => {
    let b = applyOp([], { t: 'put', item: stroke('a', [0, 0, 1, 1]) });
    b = applyOp(b, { t: 'pts', id: 'a', from: 4, points: [2, 2, 3, 3] });
    expect(pts(b)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // Sent again (overlap): nothing doubles.
    b = applyOp(b, { t: 'pts', id: 'a', from: 6, points: [3, 3, 4, 4] });
    expect(pts(b)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('skips points after a gap and unknown strokes (the whole stroke follows at the end)', () => {
    const b = applyOp([], { t: 'put', item: stroke('a', [0, 0]) });
    expect(applyOp(b, { t: 'pts', id: 'a', from: 6, points: [9, 9] })).toBe(b);
    expect(applyOp(b, { t: 'pts', id: 'x', from: 0, points: [9, 9] })).toBe(b);
  });
  it('cleans points from the network and lets others extend only their own strokes', () => {
    expect(cleanOp({ t: 'pts', id: 'a', from: 2, points: [1, 2, 3] })).toEqual({ t: 'pts', id: 'a', from: 2, points: [1, 2] });
    expect(cleanOp({ t: 'pts', id: 'a', from: 3, points: [1, 2] })).toBeNull();
    expect(cleanOp({ t: 'pts', id: 'a', from: 2, points: ['x', 2] })).toBeNull();
    const items = [{ ...stroke('mine', [0, 0]), by: 'u2' }, stroke('owners', [0, 0])];
    const op = (id: string) => ({ t: 'pts' as const, id, from: 2, points: [1, 1] });
    expect(mayEdit(items, op('mine'), 'u2', 'owner', true)).toBe(true);
    expect(mayEdit(items, op('owners'), 'u2', 'owner', true)).toBe(false);
    expect(mayEdit(items, op('mine'), 'u2', 'owner', false)).toBe(false);
  });
});
