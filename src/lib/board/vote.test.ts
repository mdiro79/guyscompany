import { describe, it, expect, vi } from 'vitest';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';

// Two members, each with their own copy of the module, joined by a pretend mesh.
type Handler = (from: PeerInfo, msg: Record<string, unknown>) => void;
function pair() {
  const handlers: Record<string, Handler[]> = { a: [], b: [] };
  const peerCbs: Record<string, (() => void)[]> = { a: [], b: [] };
  const side = (me: 'a' | 'b', other: 'a' | 'b') => ({
    onEvent(cb: Handler) { handlers[me].push(cb); return () => {}; },
    onPeers(cb: () => void) { peerCbs[me].push(cb); return () => {}; },
    sendEvent(msg: Record<string, unknown>) { const copy = JSON.parse(JSON.stringify(msg)); handlers[other].forEach((h) => h({ userId: me, tabId: me, device: 'computer' }, copy)); },
  }) as unknown as Mesh;
  return { a: side('a', 'b'), b: side('b', 'a'), join: () => [...peerCbs.a, ...peerCbs.b].forEach((cb) => cb()) };
}
const load = async () => { vi.resetModules(); return import('./vote'); };

describe('quick vote', () => {
  it('reaches the other member and counts answers from both', async () => {
    const net = pair();
    const A = await load(), B = await load();
    A.connectQuickVote(net.a, 'a'); B.connectQuickVote(net.b, 'b');
    A.quickVote.start('  Ship it on Friday?  ');
    expect(B.quickVote.get()?.question).toBe('Ship it on Friday?');
    B.quickVote.cast('yes'); A.quickVote.cast('no'); B.quickVote.cast('unsure');
    expect(A.tally(A.quickVote.get()!)).toEqual({ yes: 0, no: 1, unsure: 1 });
    expect(B.quickVote.get()!.votes).toEqual({ a: 'no', b: 'unsure' });
  });
  it('stops counting once closed and can be cleared for everyone', async () => {
    const net = pair();
    const A = await load(), B = await load();
    A.connectQuickVote(net.a, 'a'); B.connectQuickVote(net.b, 'b');
    A.quickVote.start('Lunch?');
    B.quickVote.end();
    expect(A.quickVote.get()!.open).toBe(false);
    A.quickVote.cast('yes');
    expect(B.tally(B.quickVote.get()!).yes).toBe(0);
    A.quickVote.clear();
    expect(B.quickVote.get()).toBeNull();
  });
  it('tells a late joiner the question and the answers', async () => {
    vi.useFakeTimers();
    const net = pair();
    const A = await load();
    A.connectQuickVote(net.a, 'a');
    A.quickVote.start('Late?'); A.quickVote.cast('yes');
    const B = await load();
    B.connectQuickVote(net.b, 'b');
    net.join();
    vi.advanceTimersByTime(2000);
    expect(B.quickVote.get()?.question).toBe('Late?');
    expect(B.quickVote.get()?.votes).toEqual({ a: 'yes' });
    vi.useRealTimers();
  });
  it('ignores malformed messages', async () => {
    const net = pair();
    const A = await load();
    A.connectQuickVote(net.a, 'a');
    net.b.sendEvent({ type: 'qvote', op: 'state', id: 5, question: 'x' });
    net.b.sendEvent({ type: 'qvote', op: 'cast', id: 'nope', choice: 'maybe' });
    expect(A.quickVote.get()).toBeNull();
  });
});
