// Logs in (demo account) and captures pages at desktop and phone sizes.
// Usage: node scripts/screenshot.cjs <baseUrl> <outDir> <path...>   e.g. /fa /en/tasks
const { chromium } = require('playwright-core');
const fs = require('fs');

const [base, out, ...paths] = process.argv.slice(2);
const all = { desktop: { width: 1440, height: 1000 }, phone: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
// SIZES=landscape,phone limits the sizes.
const sizes = Object.fromEntries(Object.entries(all).filter(([k]) => !process.env.SIZES || process.env.SIZES.split(',').includes(k)));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, viewport] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
    if (process.env.DARK) await ctx.addCookies([{ name: 'gc_theme', value: 'dark', url: base }]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console:`, m.text()); });
    await page.goto(`${base}/fa/login`);
    await page.fill('#username', process.env.SHOT_USER || 'mehdi');
    await page.fill('#password', 'guys1234');
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('button[type=submit], form button')]);
    for (const p of paths) {
      const [route, wait] = p.split('@');
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(Number(wait || 800));
      const file = `${out}/${route.replace(/\//g, '_').replace(/^_/, '') || 'root'}-${name}.png`;
      await page.screenshot({ path: file, fullPage: !process.env.NO_FULL });
      console.log('saved', file);
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
