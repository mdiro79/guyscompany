// Renders the dashboard hero banner from the 3D office (owner decision): public/hero/office.webp
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const fs = require('fs');
const base = process.argv[2] || 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/en/login`);
  await page.fill('#username', 'mehdi'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/en/office`);
  await page.waitForTimeout(12000);
  await page.evaluate(() => {
    window.__gcSetPose(-2.2, 9.6, -0.42);
    window.__gcRemote('00000000-0000-4000-8000-000000000002', -0.7, 5.6, Math.PI - 0.6, 0);
    window.__gcRemote('00000000-0000-4000-8000-000000000003', 1.2, 6.1, Math.PI + 0.9, 0);
    window.__gcRemote('00000000-0000-4000-8000-000000000004', 0.6, -1.3, 0, 0, 'conf-3');
  });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      if (el.tagName !== 'CANVAS' && !el.querySelector('canvas') && !el.closest('canvas')) el.style.visibility = 'hidden';
    });
  });
  await page.waitForTimeout(500);
  const png = await page.screenshot({ clip: { x: 0, y: 200, width: 1800, height: 560 } });
  fs.mkdirSync('public/hero', { recursive: true });
  await sharp(png).resize(1600).webp({ quality: 78 }).toFile('public/hero/office.webp');
  console.log('wrote public/hero/office.webp');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
