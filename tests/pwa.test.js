// Halaman GitHub Pages bisa dipasang sebagai aplikasi di HP (manifest, ikon, service worker, tombol Pasang).
const P = require('./paths.js');
const fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium, devices } = require('playwright');
const docs = path.dirname(P.WRAPPER);
const ok = m => console.log('ok  ' + m);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const pngSize = f => { const b = fs.readFileSync(path.join(docs, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// manifest & ikon
const man = JSON.parse(fs.readFileSync(path.join(docs, 'manifest.webmanifest'), 'utf8'));
assert.strictEqual(man.display, 'standalone'); assert.strictEqual(man.start_url, './');
for (const ic of man.icons) {
  const [w, h] = pngSize(ic.src);
  assert.strictEqual(w + 'x' + h, ic.sizes, ic.src + ' ukuran sesuai manifest');
}
assert(man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
assert.deepStrictEqual(pngSize('apple-touch-icon.png'), [180, 180]);
ok('manifest: standalone, ikon 192 & 512 (termasuk maskable) dan ikon iPhone 180 tersedia dengan ukuran benar');

(async () => {
  const b = await chromium.launch();
  async function open(ctxOpts) {
    const ctx = await b.newContext(ctxOpts);
    await ctx.route('https://pages.test/**', r => {
      let f = new URL(r.request().url()).pathname.replace(/^\//, '') || 'index.html';
      const file = path.join(docs, f);
      if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: 'x' });
      r.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'text/html', body: '<h2>aplikasi</h2>' }));
    const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
    await p.goto('https://pages.test/');
    return p;
  }

  // Android / Chrome
  const a = await open({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow' });
  assert.strictEqual(await a.getAttribute('link[rel=manifest]', 'href'), 'manifest.webmanifest');
  const sw = await a.evaluate(() => navigator.serviceWorker.ready.then(r => r.active && r.active.scriptURL));
  assert(sw.endsWith('/sw.js'), 'service worker aktif: ' + sw);
  assert.strictEqual(await a.isHidden('#install'), true, 'tanpa dukungan pasang: tombol tidak muncul');
  await a.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await a.waitForSelector('#install:not([hidden])');
  await a.waitForSelector('#loading.done', { state: 'attached' });
  await a.screenshot({ path: P.out('shot-pwa-android.png') });
  await a.click('#btnInstall');
  assert.strictEqual(await a.evaluate(() => window.__prompted), true, 'jendela pasang bawaan browser dibuka');
  await a.waitForSelector('#install', { state: 'hidden' });
  ok('Android/Chrome: service worker aktif, tombol "Pasang aplikasi" muncul saat browser siap, membuka jendela pasang');

  // iPhone
  const i = await open({ ...devices['iPhone 13'] });
  await i.waitForSelector('#install:not([hidden])');
  await i.click('#btnInstall');
  await i.waitForSelector('#iosHelp:not([hidden])');
  assert((await i.textContent('#iosHelp')).includes('Tambahkan ke Layar Utama'));
  await i.screenshot({ path: P.out('shot-pwa-iphone.png') });
  await i.click('#iosHelpOk');
  await i.click('#btnInstallX');
  await i.reload();
  await i.waitForSelector('#loading.done', { state: 'attached' });
  assert.strictEqual(await i.isHidden('#install'), true, 'setelah ditutup tidak muncul lagi (7 hari)');
  ok('iPhone: tombol membuka petunjuk "Tambahkan ke Layar Utama"; bisa ditutup dan tidak mengganggu lagi');

  // sudah terpasang (mode standalone): tombol tidak muncul
  const s = await open({ ...devices['iPhone 13'] });
  await s.close();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await ctx.route('https://pages.test/**', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(P.WRAPPER) }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'text/html', body: '<h2>aplikasi</h2>' }));
  const st = await ctx.newPage(); await st.goto('https://pages.test/');
  await st.waitForSelector('#loading.done', { state: 'attached' });
  assert.strictEqual(await st.isHidden('#install'), true);
  ok('dibuka dari ikon di layar utama: tombol pasang tidak tampil');

  for (const p of [a, i, st]) assert.deepStrictEqual(p.errors || [], [], (p.errors || []).join('; '));
  await b.close();
  console.log('\nSEMUA TES PWA LULUS');
})().catch(e => { console.error('GAGAL:', e.message.split('\n').slice(0, 3).join('\n')); process.exit(1); });
