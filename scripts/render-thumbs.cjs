// Renders a portrait per character to public/models/thumbs/<id>.webp (used as 2D avatars).
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const routes = { '/three/': path.join(root, 'node_modules/three/'), '/models/': path.join(root, 'public/models/'), '/characters.json': path.join(root, 'assets/characters.json'), '/': path.join(__dirname, 'thumbs/index.html') };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = Object.keys(routes).find((p) => (p.endsWith('/') ? url.startsWith(p) : url === p)) ?? '/';
  const file = prefix.endsWith('/') && prefix !== '/' ? path.join(routes[prefix], url.slice(prefix.length)) : routes[prefix];
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0, async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__thumbs, null, { timeout: 180000 });
  const thumbs = await page.evaluate(() => window.__thumbs);
  const out = path.join(root, 'public/models/thumbs');
  fs.mkdirSync(out, { recursive: true });
  for (const [id, url] of Object.entries(thumbs)) {
    await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(128, 128).webp({ quality: 82 }).toFile(path.join(out, `${id}.webp`));
  }
  console.log(`wrote ${Object.keys(thumbs).length} thumbs`);
  await browser.close();
  server.close();
});
