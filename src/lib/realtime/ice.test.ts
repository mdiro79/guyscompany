import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iceConfig, parseCloudflareIce, resetIceCache, staticIce } from './ice';

const CF_ANSWER = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'user', credential: 'secret',
    },
  ],
};

describe('TURN settings', () => {
  beforeEach(() => { resetIceCache(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reads Cloudflare's answer and drops port 53, which browsers refuse", () => {
    expect(parseCloudflareIce(CF_ANSWER)).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'user', credential: 'secret' },
    ]);
    // Older API: a single object.
    expect(parseCloudflareIce({ iceServers: { urls: 'turn:a:3478', username: 'u', credential: 'c' } })).toEqual([{ urls: ['turn:a:3478'], username: 'u', credential: 'c' }]);
    expect(parseCloudflareIce(null)).toEqual([]);
    expect(parseCloudflareIce({ iceServers: [{ urls: [42] }] })).toEqual([]);
  });

  it('reads fixed credentials of any provider', () => {
    expect(staticIce({ TURN_URLS: 'turn:a:80, turns:a:443 ,', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' })).toEqual([{ urls: ['turn:a:80', 'turns:a:443'], username: 'u', credential: 'c' }]);
    expect(staticIce({})).toEqual([]);
  });

  it('generates Cloudflare credentials once and reuses them', async () => {
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', 'key-1');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', 'token-1');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => CF_ANSWER }));
    vi.stubGlobal('fetch', fetchMock);
    const [one, two] = await Promise.all([iceConfig(), iceConfig()]);
    const third = await iceConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(String(init.body))).toEqual({ ttl: 86400 });
    for (const c of [one, two, third]) {
      expect(c.source).toBe('cloudflare');
      expect(c.servers[1].username).toBe('user');
      expect(c.ttl).toBeGreaterThan(11 * 3600);
    }
  });

  it('falls back to fixed credentials when Cloudflare fails', async () => {
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', 'key-1');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', 'bad');
    vi.stubEnv('TURN_URLS', 'turn:backup:3478');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await iceConfig()).toEqual({ servers: [{ urls: ['turn:backup:3478'], username: undefined, credential: undefined }], ttl: null, source: 'static' });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('reports no relay when nothing is set', async () => {
    expect(await iceConfig()).toEqual({ servers: [], ttl: null, source: 'none' });
  });
});
