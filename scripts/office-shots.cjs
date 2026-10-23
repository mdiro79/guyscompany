// Screenshots of the 3D office from a few viewpoints (demo mode). Usage: node scripts/office-shots.cjs <baseUrl> <outDir>
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
const views = [
  ['spawn', 0, 11.6, 0], ['corridor', 0, 6.2, 0.35], ['conference', 0, 2.2, 0], ['office1', -8.5, -6.5, 0.4],
  ['office2', 8.6, -6.2, -0.3], ['west', -7, 1, -1.2], ['east', 7, 1, 1.9], ['office4', 8.8, 6.4, Math.PI - 0.2],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console:', m.text()); });
  await page.goto(`${base}/en/login`);
  await page.fill('#username', 'mehdi');
  await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/en/office`);
  await page.waitForTimeout(12000);
  for (const [name, x, z, yaw] of views) {
    await page.evaluate(([x, z, yaw]) => window.__gcSetPose?.(x, z, yaw), [x, z, yaw]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/office-${name}.png` });
    console.log('saved', name);
  }
  if (process.env.SIT) {
    await page.evaluate(() => window.__gcSetPose?.(-8.5, -9.65, 0, 'office-1'));
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/office-sit.png` });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
