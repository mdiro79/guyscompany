import { describe, expect, it, vi } from 'vitest';

// The direct Supabase socket never connects (as on networks that cut it with 1006): the room must
// switch to the server relay, keep presence and signaling working, and rotate streams without gaps.

type Listener = (e: { data: string }) => void;
class FakeEventSource {
  static all: FakeEventSource[] = [];
  static CLOSED = 2;
  readyState = 1;
  listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeEventSource.all.push(this); }
  addEventListener(type: string, cb: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]); }
  fire(type: string, data: unknown) { this.listeners.get(type)?.forEach((cb) => cb({ data: JSON.stringify(data) })); }
  close() { this.readyState = FakeEventSource.CLOSED; }
}

let subscribeCb: ((status: string, err?: Error) => void) | null = null;
const channel = {
  on: () => channel,
  subscribe: (cb: typeof subscribeCb) => { subscribeCb = cb; return channel; },
  presenceState: () => ({}),
  track: vi.fn(),
  send: vi.fn(),
};
const removeChannel = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ supabaseBrowser: () => ({ channel: () => channel, removeChannel }) }));

describe('room relay fallback', () => {
  it('switches to the relay when the direct socket fails', async () => {
    vi.useFakeTimers();
    const store = new Map<string, string>();
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      if (url === '/api/room') posts.push(JSON.parse(init!.body!));
      return { json: async () => ({ now: Date.now() }) };
    }));

    const { getRoom, realtimeStatus } = await import('./room');
    const room = getRoom();
    const presence = vi.fn();
    const rtc = vi.fn();
    room.onPresence(presence);
    room.on('rtc', rtc);
    room.track({ userId: 'u1', device: 'computer', micActive: false });

    subscribeCb!('CHANNEL_ERROR', new Error('socket closed: 1006'));
    subscribeCb!('TIMED_OUT');
    expect(FakeEventSource.all).toHaveLength(0);
    vi.advanceTimersByTime(8000);

    expect(removeChannel).toHaveBeenCalled();
    expect(store.has('gc-room-relay')).toBe(true);
    expect(FakeEventSource.all).toHaveLength(1);
    const first = FakeEventSource.all[0];
    expect(first.url).toContain(`tab=${room.tabId}`);
    expect(first.url).toContain('mic=0');

    first.fire('status', { status: 'SUBSCRIBED', error: null });
    expect(realtimeStatus.value).toBe('relay SUBSCRIBED');
    first.fire('presence', [{ userId: 'u1', tabId: room.tabId }, { userId: 'u2', tabId: 'other-tab-1' }]);
    expect(presence).toHaveBeenLastCalledWith([{ userId: 'u1', tabId: room.tabId }, { userId: 'u2', tabId: 'other-tab-1' }]);
    first.fire('msg', { event: 'rtc', payload: { to: room.tabId, type: 'ice' } });
    expect(rtc).toHaveBeenCalledWith({ to: room.tabId, type: 'ice' });

    // A burst of signals leaves in one request; presence changes go out at once.
    room.send('rtc', { n: 1 });
    room.send('rtc', { n: 2 });
    vi.advanceTimersByTime(50);
    room.track({ userId: 'u1', device: 'computer', micActive: true });
    await vi.runAllTimersAsync();
    expect(posts).toContainEqual({ tab: room.tabId, messages: [{ event: 'rtc', payload: { n: 1 } }, { event: 'rtc', payload: { n: 2 } }] });
    expect(posts).toContainEqual({ tab: room.tabId, track: { device: 'computer', micActive: true } });

    // Rotation: the new stream takes over only once it is in the room.
    first.fire('rotate', {});
    expect(FakeEventSource.all).toHaveLength(2);
    const second = FakeEventSource.all[1];
    expect(second.url).toContain('mic=1');
    rtc.mockClear();
    second.fire('msg', { event: 'rtc', payload: { n: 3 } });
    expect(rtc).not.toHaveBeenCalled();
    second.fire('status', { status: 'SUBSCRIBED', error: null });
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    first.fire('msg', { event: 'rtc', payload: { n: 4 } });
    second.fire('msg', { event: 'rtc', payload: { n: 5 } });
    expect(rtc.mock.calls).toEqual([[{ n: 5 }]]);
    vi.useRealTimers();
  });
});
