const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const { chromium } = require('playwright');
const html = fs.readFileSync(P.WRAPPER, 'utf8');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));

  // 1) link belum diganti -> petunjuk, tanpa iframe
  await p.route('https://pages.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await p.goto('https://pages.test/');
  assert((await p.textContent('#loadText')).includes('belum diatur'));
  assert.strictEqual(await p.locator('iframe').count(), 0);
  await p.screenshot({ path: P.out('shot-wrap-placeholder.png') });
  console.log('ok  link belum diatur: tampil petunjuk, tidak memuat apa pun');

  // 2) link valid -> iframe dimuat, layar loading hilang
  const URL_OK = 'https://script.google.com/macros/s/AKfycbTESTexample1234567890/exec';
  const html2 = html.replace('GANTI_DENGAN_LINK_EXEC_ANDA', URL_OK);
  await p.route('https://pages2.test/**', r => r.fulfill({ contentType: 'text/html', body: html2 }));
  await p.route(URL_OK, r => r.fulfill({ contentType: 'text/html', body: '<body style="font-family:sans-serif"><h2>Aplikasi dimuat di iframe</h2></body>' }));
  await p.goto('https://pages2.test/');
  await p.waitForSelector('#loading.done', { state: 'attached' });
  assert.strictEqual(await p.locator('iframe#app').getAttribute('src'), URL_OK);
  assert((await p.frameLocator('#app').locator('h2').textContent()).includes('dimuat'));
  const box = await p.locator('iframe#app').boundingBox();
  assert(box.width === 390 && box.height >= 700, 'iframe memenuhi layar: ' + JSON.stringify(box));
  console.log('ok  link valid: iframe layar penuh dimuat, layar loading hilang');

  // 3) link berbahaya ditolak
  for (const bad of ['javascript:alert(1)', 'https://evil.example/macros/s/abc/exec', 'https://script.google.com/macros/s/abc/exec"><script>x']) {
    const h3 = html.replace('GANTI_DENGAN_LINK_EXEC_ANDA', bad.replace(/"/g, '\\"'));
    await p.route('https://pages3.test/**', r => r.fulfill({ contentType: 'text/html', body: h3 }));
    await p.goto('https://pages3.test/'); assert.strictEqual(await p.locator('iframe').count(), 0, 'ditolak: ' + bad);
  }
  console.log('ok  link selain script.google.com/macros/.../exec ditolak');
  assert.deepStrictEqual(errs, [], errs.join(';'));
  await b.close(); console.log('\nSEMUA TES PEMBUNGKUS LULUS');
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
