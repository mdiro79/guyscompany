// Screenshots of the 3D office from a few viewpoints (demo mode). Usage: node scripts/office-shots.cjs <baseUrl> <outDir>
// Env: SIT=1 also captures sitting (conference chair, desk monitor, fullscreen); TOUR=1 captures the receptionist tour;
// PHONE=1 uses a phone in landscape.
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
const views = [
  ['spawn', 0, 14.9, 0], ['reception', 0.6, 13.4, 0.1], ['corridor', 0, 8.6, 0], ['conference', 0, 3.6, 0], ['office1', -11, -8.2, 0],
  ['office1-door', -11, -4.4, 0], ['west', -8.5, 0.5, 1.57], ['east', 8.5, -0.5, -1.57], ['office4', 11, 8.2, Math.PI], ['entrance', 0, 9.5, Math.PI], ['desk-side', 1.7, 11.0, 1.39], ['recept-front', 0.7, 12.3, 0.5], ['top-conf', 0, 6.4, 0],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = !!process.env.PHONE;
  const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console:', m.text()); });
  await page.goto(`${base}/en/login`);
  await page.fill('#username', 'mehdi');
  await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/en/office`);
  await page.waitForTimeout(12000);
  const shot = (name) => page.screenshot({ path: `${out}/office-${phone ? 'phone-' : ''}${name}.png` });
  for (const [name, x, z, yaw] of process.env.ONLY ? views.filter((v) => process.env.ONLY.split(',').includes(v[0])) : views) {
    await page.evaluate(([x, z, yaw]) => window.__gcSetPose?.(x, z, yaw), [x, z, yaw]);
    await page.waitForTimeout(1500);
    await shot(name);
    console.log('saved', name);
  }
  if (process.env.SIT) {
    await page.evaluate(() => window.__gcSetPose?.(1.1, 1.9, 0, 'conf-0'));
    await page.waitForTimeout(2000);
    await shot('sit-conference');
    await page.evaluate(() => window.__gcSetPose?.(-11, -12.65, 0, 'office-1'));
    await page.waitForTimeout(6000);
    await shot('sit');
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(3000);
    await shot('sit-fullscreen');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1000);
  }
  if (process.env.TOUR) {
    await page.evaluate(() => window.__gcSetPose?.(0, 12.7, 0));
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyE');
    for (let i = 0; i < 7; i++) {
      await page.waitForTimeout(i === 0 ? 2500 : 12000);
      await shot(`tour-${i}`);
      console.log('saved tour', i);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(9000);
    await shot('tour-after');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
