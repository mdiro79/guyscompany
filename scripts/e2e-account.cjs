// Demo-mode end-to-end: admin creates a member, member logs in, must change password, sees the tutorial.
const { chromium } = require('playwright-core');
const [base, out] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await admin.goto(`${base}/en/login`);
  await admin.fill('#username', 'mehdi'); await admin.fill('#password', 'guys1234');
  await Promise.all([admin.waitForURL((u) => !u.pathname.endsWith('/login')), admin.click('form button')]);
  // Free a seat (max 4 members): delete reza, then create tina.
  await admin.goto(`${base}/en/admin`);
  admin.on('dialog', (d) => d.accept());
  await admin.locator('li', { hasText: '@reza' }).locator('button[aria-label="Delete"]').click();
  await admin.waitForTimeout(1500);
  await admin.fill('input[name=username]', 'tina');
  await admin.fill('input[name=displayName]', 'Tina');
  await admin.click('form button:has-text("Create")');
  await admin.waitForSelector('[role=status]');
  const note = await admin.textContent('[role=status]');
  const temp = /password: (\S+)/i.exec(note)[1];
  console.log('created, temp password', temp);

  const tina = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await tina.goto(`${base}/en/login`);
  await tina.fill('#username', 'tina'); await tina.fill('#password', temp);
  await Promise.all([tina.waitForURL(/change-password/), tina.click('form button')]);
  console.log('forced to', new URL(tina.url()).pathname);
  await tina.fill('#password', 'newpass123'); await tina.fill('#confirm', 'newpass123');
  await Promise.all([tina.waitForURL((u) => !u.pathname.includes('change-password')), tina.click('form button')]);
  console.log('after change', new URL(tina.url()).pathname);
  await tina.goto(`${base}/en/office`);
  await tina.waitForTimeout(9000);
  const tutorial = await tina.isVisible('#gc-tour-bubble');
  console.log('tutorial visible', tutorial);
  await tina.screenshot({ path: `${out}/e2e-tutorial-phone.png` });
  await browser.close();
  process.exit(tutorial ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
