// Two members at once (demo mode, two browser profiles): checks that the WebRTC mesh links them, measures the
// round trip and delivers events both ways. In demo mode the room is a BroadcastChannel, which does not cross
// profiles, so it is relayed between the pages here. Usage: node scripts/multi-test.cjs [baseUrl]
const { chromium } = require('playwright-core');
const base = process.argv[2] || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pages = [];
  const open = async (user) => {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 560 } });
    await ctx.exposeFunction('__bcSend', (name, json) => { for (const p of pages) if (p.context() !== ctx) p.evaluate(([n, j]) => window.__bcReceive?.(n, j), [name, json]).catch(() => {}); });
    await ctx.addInitScript(() => {
      const chans = new Map();
      class Relay extends EventTarget {
        constructor(name) { super(); this.name = name; if (!chans.has(name)) chans.set(name, new Set()); chans.get(name).add(this); }
        postMessage(data) { window.__bcSend(this.name, JSON.stringify(data)); }
        close() { chans.get(this.name)?.delete(this); }
      }
      window.__bcReceive = (name, json) => { for (const c of chans.get(name) ?? []) c.dispatchEvent(new MessageEvent('message', { data: JSON.parse(json) })); };
      window.BroadcastChannel = Relay;
    });
    const page = await ctx.newPage(); pages.push(page);
    page.on('pageerror', (e) => console.log(`[${user}] pageerror:`, e.message));
    await page.goto(base + '/en/login');
    await page.fill('#username', user); await page.fill('#password', 'guys1234');
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
    await page.goto(base + '/en/tasks'); // a light page: the mesh runs everywhere in the app
    await page.waitForTimeout(5000);
    return page;
  };
  const a = await open('mehdi'), b = await open('sara');
  await a.waitForTimeout(6000);
  for (const [n, p] of [['a', a], ['b', b]]) console.log(n, JSON.stringify(await p.evaluate(() => ({ links: window.__gcMesh?.links(), dbg: window.__gcMesh?.debugLinks(), presence: window.__gcMesh?.presenceList?.length }))));
  await b.evaluate(() => { window.__got = []; window.__gcMesh.onEvent((f, m) => window.__got.push(m.type)); });
  await a.evaluate(() => { window.__got = []; window.__gcMesh.onEvent((f, m) => window.__got.push(m.type)); });
  await a.evaluate(() => window.__gcMesh.sendEvent({ type: 'test-a' }));
  await b.evaluate(() => window.__gcMesh.sendEvent({ type: 'test-b' }));
  await a.waitForTimeout(3500);
  console.log('b got', JSON.stringify(await b.evaluate(() => window.__got)), 'a got', JSON.stringify(await a.evaluate(() => window.__got)));
  for (const [n, p] of [['a', a], ['b', b]]) console.log(n, JSON.stringify(await p.evaluate(() => window.__gcMesh?.links())));
  await browser.close();
})();
