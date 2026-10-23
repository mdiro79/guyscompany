// Two tabs of the same user (demo mode): moving in tab A must move tab B (WebRTC data channel, last command wins).
const { chromium } = require('playwright-core');
const base = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const a = await ctx.newPage();
  await a.goto(`${base}/en/login`);
  await a.fill('#username', 'mehdi'); await a.fill('#password', 'guys1234');
  await Promise.all([a.waitForURL((u) => !u.pathname.endsWith('/login')), a.click('form button')]);
  const b = await ctx.newPage();
  await a.goto(`${base}/en/office`); await b.goto(`${base}/en/office`);
  await a.waitForTimeout(12000);
  const before = await b.evaluate(() => window.__gcPos);
  await a.bringToFront();
  await a.keyboard.down('KeyW'); await a.waitForTimeout(1500); await a.keyboard.up('KeyW');
  await a.waitForTimeout(1500);
  const posA = await a.evaluate(() => window.__gcPos);
  const posB = await b.evaluate(() => window.__gcPos);
  console.log(JSON.stringify({ before, posA, posB }));
  const ok = Math.abs(posA.z - posB.z) < 0.3 && posA.z < before.z - 0.5;
  console.log(ok ? 'SYNC OK' : 'SYNC FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
