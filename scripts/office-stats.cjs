// Draw calls, triangles and frame rate of the 3D office from a few viewpoints (demo mode). Usage: node scripts/office-stats.cjs <baseUrl>
const { chromium } = require('playwright-core');
const [base] = process.argv.slice(2);
const views = [['spawn', 0, 14.9, 0], ['corridor', 0, 8.6, 0], ['conference', 0, 3.6, 0], ['west', -8.5, 0.5, 1.57], ['office1', -11, -8.2, 0], ['entrance', 0, 9.5, Math.PI], ['game', 0, -8.6, 0], ['hall', 0, -15.6, 0], ['garden', -16.5, 0, 1.57], ['zen', -16.2, -8.2, 0.78], ['lab', -21.5, 8.2, -1.92]];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${base}/en/login`);
  await page.fill('#username', 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/en/office`);
  await page.waitForTimeout(14000);
  for (const [name, x, z, yaw] of views) {
    await page.evaluate(([x, z, yaw]) => window.__gcSetPose?.(x, z, yaw), [x, z, yaw]);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => window.__gcStats?.());
    console.log(name, JSON.stringify(s));
  }
  await browser.close();
})();
