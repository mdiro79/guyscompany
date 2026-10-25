import { describe, expect, it } from 'vitest';
import { addPoint, applyOp, cleanItem, cleanOp, inverseOps, itemAt, moveItem, fitImage, MAX_ITEMS, type BoardItem } from './model';

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
});
