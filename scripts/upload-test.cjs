// Uploads a file on the Files page (demo mode) and checks it is listed and downloadable.
const { chromium } = require('playwright-core');
const base = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${base}/en/login`);
  await page.fill('#username', 'sara'); await page.fill('#password', 'guys1234');
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('/login')), page.click('form button')]);
  await page.goto(`${base}/en/files`);
  await page.setInputFiles('input[type=file]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForSelector('text=notes.txt', { timeout: 10000 });
  const href = await page.getAttribute('a[aria-label="Download"]', 'href');
  const body = await page.evaluate(async (h) => (await fetch(h)).text(), href);
  console.log(body === 'hello' ? 'UPLOAD OK' : `UPLOAD FAILED: ${body}`);
  await browser.close();
  process.exit(body === 'hello' ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
