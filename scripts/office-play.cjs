// Drives the new rooms of the 3D office (demo mode) and saves screenshots: arcade game, jukebox, map,
// game table, focus pod, coffee. Usage: node scripts/office-play.cjs <baseUrl> <outDir>   (PHONE=1 for a phone, LAND=1 held sideways)
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = !!process.env.PHONE, land = !!process.env.LAND;
  const tag = phone ? (land ? 'land-' : 'phone-') : '';
  const ctx = await browser.newContext(phone ? { viewport: land ? { width: 844, height: 390 } : { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|hydrat|caret-color|style=\{|^\s*[-+.]|react\.dev/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`${base}/${process.env.LOCALE || 'fa'}/login`);
  await page.fill('#username', 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/${process.env.LOCALE || 'fa'}/office`);
  await page.waitForTimeout(13000);
  const shot = (name) => page.screenshot({ path: `${out}/play-${tag}${name}.png` });
  const pose = async (x, z, yaw, seat = null) => { await page.evaluate(([x, z, yaw, seat]) => window.__gcSetPose?.(x, z, yaw, seat), [x, z, yaw, seat]); await page.waitForTimeout(1300); };
  const act = async () => { if (phone) await page.locator('#gc-office button.min-h-14').first().tap().catch(() => {}); else await page.keyboard.press('KeyE'); await page.waitForTimeout(900); };
  await shot('start');
  // Arcade
  await pose(-5.3, -8.7, Math.PI / 2); await shot('arcade-near');
  await act(); await shot('arcade-ready');
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  for (let i = 0; i < 40; i++) { const b = page.locator('[role=dialog] .grid button:has(span.scale-100)').first(); if (await b.count()) await b.dispatchEvent('pointerdown').catch(() => {}); await page.waitForTimeout(120); }
  await shot('arcade-play');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // Jukebox
  await pose(5.4, -12.7, -Math.PI / 2); await act(); await shot('jukebox');
  await page.locator('[role=dialog] .grid button').nth(3).click().catch(() => {}); await page.waitForTimeout(800); await shot('jukebox-on');
  await page.keyboard.press('Escape');
  // Dance floor + game table
  await pose(0.4, -12.2, 0); await page.waitForTimeout(800); await shot('dance');
  await pose(3.45, -9.6, 0, 'xo-a'); await page.waitForTimeout(1500); await shot('xo');
  for (const k of ['5', '1', '9']) { await page.keyboard.press(k); await page.waitForTimeout(250); }
  await shot('xo-moves');
  // Pod
  await pose(14, 0, 0, 'pod-0'); await page.waitForTimeout(1500); await shot('pod');
  // Coffee
  await pose(-13.4, -2.45, Math.PI / 2); await act(); await shot('coffee');
  // Map
  if (phone) await page.locator('#gc-office button[aria-pressed][title*="N"]').tap().catch(() => {}); else await page.keyboard.press('KeyN');
  await page.waitForTimeout(900); await shot('map');
  await page.locator('[role=dialog] svg g[role=button]').first().click({ force: true }).catch(() => {}); await page.waitForTimeout(1500); await shot('map-went');
  console.log('pos', JSON.stringify(await page.evaluate(() => window.__gcPos)), 'stats', JSON.stringify(await page.evaluate(() => window.__gcStats?.())));
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
