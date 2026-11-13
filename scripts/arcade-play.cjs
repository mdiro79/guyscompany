// Opens the arcade page (demo mode) and plays a game for a moment, saving screenshots and reporting page
// errors. Usage: node scripts/arcade-play.cjs <baseUrl> <outDir> <game> [steps]
//   steps: comma-separated, e.g. "start,key:ArrowLeft,wait:800,tap:0.5:0.5,shot:mid"  (PHONE=1, LOCALE=en)
const { chromium } = require('playwright-core');
const [base, out, game, steps = 'start,wait:2500,shot:play'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = !!process.env.PHONE, land = !!process.env.LAND, locale = process.env.LOCALE || 'fa';
  const ctx = await browser.newContext(phone ? { viewport: land ? { width: 844, height: 390 } : { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|hydrat|caret-color|style=\{|^\s*[-+.]|react\.dev|GL Driver|WebGL/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 400)); });
  await page.goto(`${base}/${locale}/login`);
  await page.fill('#username', process.env.USER_NAME || 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/${locale}/arcade`);
  await page.waitForSelector('[role=dialog]');
  await page.waitForTimeout(1500);
  const tag = `${game || 'hub'}${phone ? (land ? '-land' : '-phone') : ''}${locale === 'en' ? '-en' : ''}`;
  const shot = (name) => page.screenshot({ path: `${out}/arcade-${tag}-${name}.png` });
  const stage = () => page.locator('[role=dialog] canvas').first();
  if (!game) { await shot('versus'); for (const n of ['solo', 'league']) { await page.locator(`[role=dialog] button[data-tab="${n}"]`).click(); await page.waitForTimeout(400); await shot(n); } }
  else {
    // Open the game through its card (it is on the versus or the solo tab).
    const open = async () => { for (const tab of ['versus', 'solo']) { await page.locator(`[role=dialog] button[data-tab="${tab}"]`).click(); await page.waitForTimeout(250); const c = page.locator(`[role=dialog] button[data-game="${game}"]`); if (await c.count()) { await c.click(); return true; } } return false; };
    if (!(await open())) throw new Error('game card not found: ' + game);
    await page.waitForTimeout(1200);
    await shot('ready');
    for (const s of steps.split(',')) {
      const [cmd, a, b] = s.split(':');
      if (cmd === 'start') { await page.keyboard.press('Enter'); await page.waitForTimeout(700); }
      else if (cmd === 'wait') await page.waitForTimeout(Number(a));
      else if (cmd === 'key') { await page.keyboard.press(a); await page.waitForTimeout(Number(b) || 120); }
      else if (cmd === 'hold') { await page.keyboard.down(a); await page.waitForTimeout(Number(b) || 300); await page.keyboard.up(a); }
      else if (cmd === 'tap' || cmd === 'move') { const box = await stage().boundingBox(); if (box) { const x = box.x + box.width * Number(a), y = box.y + box.height * Number(b); if (cmd === 'move') await page.mouse.move(x, y); else if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); } await page.waitForTimeout(150); }
      else if (cmd === 'click') { await page.locator(`[role=dialog] button:has-text("${a}")`).first().click().catch((e) => errors.push('click failed: ' + a)); await page.waitForTimeout(500); }
      else if (cmd === 'pdrag') { const [x0, y0, x1, y1] = [a, b, ...s.split(':').slice(3)].map(Number); await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10); await page.waitForTimeout(30); } await page.mouse.up(); await page.waitForTimeout(200); }
      else if (cmd === 'shot') await shot(a);
      else if (cmd === 'eval') console.log('eval', JSON.stringify(await page.evaluate(a)));
    }
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
