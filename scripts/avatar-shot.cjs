// Injects the other demo users as remote avatars and captures the view.
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${base}/fa/login`);
  await page.fill('#username', 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/fa/office`);
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    window.__gcSetPose(0, 7.2, 0);
    window.__gcRemote('00000000-0000-4000-8000-000000000002', -1.2, 4.6, Math.PI, 0, null, 'party');
    window.__gcRemote('00000000-0000-4000-8000-000000000003', 1.3, 4.8, Math.PI + 0.4, 1);
    window.__gcRemote('00000000-0000-4000-8000-000000000004', 0.2, 1.4, 0, 0, 'conf-0');
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/office-avatars.png` });
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-avatar-label]')].map((e) => [e.textContent, JSON.stringify(e.getBoundingClientRect())]))));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
