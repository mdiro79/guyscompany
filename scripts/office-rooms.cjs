// Screenshots of the second office expansion (demo mode): the archway, the arcade hall, a cabinet opening
// its game, the zen deck, the idea lab and the map. Usage: node scripts/office-rooms.cjs <baseUrl> <outDir> (PHONE=1)
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = !!process.env.PHONE;
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|hydrat|caret-color|style=\{|^\s*[-+.]|react\.dev|GL Driver|WebGL/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  const locale = process.env.LOCALE || 'fa';
  await page.goto(`${base}/${locale}/login`);
  await page.fill('#username', 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/${locale}/office`);
  await page.waitForTimeout(14000);
  const tag = phone ? 'phone-' : '';
  const shot = (name) => page.screenshot({ path: `${out}/rooms-${tag}${name}.png` });
  const pose = async (x, z, yaw, wait = 1500) => { await page.evaluate(([x, z, yaw]) => window.__gcSetPose?.(x, z, yaw, null), [x, z, yaw]); await page.waitForTimeout(wait); };
  await pose(0, -8.6, 0); await shot('archway');
  await pose(0, -15.6, 0); await shot('hall');
  await pose(4.6, -16.4, -Math.PI / 2 - 0.5); await shot('hall-east');
  await pose(-5.6, -16.4, Math.PI / 2); await shot('cabinet');
  if (phone) await page.locator('#gc-office button.min-h-14').first().tap().catch(() => {}); else await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500); await shot('cabinet-open');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await pose(-21.2, -3.5, 0); await shot('zen-gate');
  await pose(-16.2, -8.2, Math.PI / 4); await shot('zen');
  await pose(-21.5, 8.2, -Math.PI / 2 - 0.35); await shot('lab');
  if (!phone) { await page.keyboard.press('KeyN'); await page.waitForTimeout(900); await shot('map'); }
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__gcStats?.())));
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
