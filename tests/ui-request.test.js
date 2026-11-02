// UI: tab Request Belanja (tambah nama bahan/barang, centang sudah dibeli, hapus).
const P = require('./paths.js');
const assert = require('assert');
const { chromium } = require('playwright');
const { newPage, fixedServer } = require('./uihelper.js');
const srv = fixedServer();
const ok = m => console.log('ok  ' + m);
const adm = srv.call('apiLogin', 'admin', srv.props.ADMIN_AWAL);
srv.call('apiChangePassword', adm.session, srv.props.ADMIN_AWAL, 'AdminBaru#2026');
const A = srv.call('apiLogin', 'admin', 'AdminBaru#2026').session;
srv.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Siti Aminah', peran: 'user', password: 'sementara1' });
const S0 = srv.call('apiLogin', 'siti', 'sementara1').session;
srv.call('apiChangePassword', S0, 'sementara1', 'SitiBaru#123');
const SS = srv.call('apiLogin', 'siti', 'SitiBaru#123').session;

(async () => {
  const b = await chromium.launch();
  const p = await newPage(b, srv, { width: 390, height: 860 }, SS);
  await p.waitForSelector('.scard');
  assert.strictEqual(await p.isHidden('#reqCount'), true, 'belum ada request: tanpa angka');
  await p.click('#tabRequest');
  await p.waitForSelector('#reqPanel:not([hidden])');
  assert.strictEqual(await p.isHidden('#fKat'), true);
  assert.strictEqual(await p.isHidden('#btnRusak'), true);
  assert((await p.textContent('#list')).includes('Belum ada request belanja'));
  await p.click('#btnReqAdd');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('Isi nama'));
  await p.fill('#rNama', 'Bawang Merah'); await p.press('#rNama', 'Enter');
  await p.waitForSelector('.rrow');
  await p.fill('#rNama', '<img src=x onerror="window.__xss=1">Kerupuk'); await p.click('#btnReqAdd');
  await p.waitForFunction(() => document.querySelectorAll('.rrow').length === 2);
  assert.strictEqual(await p.inputValue('#rNama'), '', 'kolom dikosongkan setelah ditambah');
  assert.strictEqual(await p.textContent('#reqCount'), '2');
  assert((await p.textContent('.rrow')).includes('Diminta Siti Aminah'));
  assert.strictEqual(await p.evaluate(() => window.__xss), undefined, 'tidak ada XSS');
  assert(await p.locator('#barangNames option[value="Bawang Merah"]').count() === 1, 'saran nama dari daftar barang');
  await p.fill('#rNama', 'bawang merah'); await p.click('#btnReqAdd');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('sudah ada di daftar'));
  await p.fill('#rNama', '');
  await p.screenshot({ path: P.out('shot-mobile-request.png') });
  ok('tambah request (nama saja), Enter juga bisa, nama dobel ditolak, angka di tab, XSS tidak jalan');

  await p.click('.rrow:has-text("Bawang Merah") .rcheck');
  await p.waitForSelector('.rrow.done');
  assert((await p.textContent('.rrow.done')).includes('Dibeli oleh Siti Aminah'));
  assert.strictEqual(await p.textContent('#reqCount'), '1');
  assert((await p.locator('.req-title').allTextContents()).join('|').includes('Sudah dibeli'));
  await p.screenshot({ path: P.out('shot-mobile-request-done.png') });
  await p.click('.rrow.done .rcheck');
  await p.waitForFunction(() => !document.querySelector('.rrow.done'));
  assert.strictEqual(await p.textContent('#reqCount'), '2');
  ok('centang sudah dibeli: pindah ke bawah, dicoret, angka berkurang; bisa dibatalkan');

  // pengguna lain (admin) melihat request & boleh menghapus; siti hanya miliknya
  const pa = await newPage(b, srv, { width: 1100, height: 800 }, A);
  await pa.waitForSelector('.scard');
  assert.strictEqual(await pa.textContent('#reqCount'), '2');
  await pa.click('#tabRequest'); await pa.waitForSelector('.rrow');
  assert.strictEqual(await pa.locator('.rdel').count(), 2, 'admin boleh hapus semua');
  await pa.screenshot({ path: P.out('shot-request.png') });
  await pa.click('.rrow:has-text("Kerupuk") .rdel');
  await pa.click('#cYes');
  await pa.waitForFunction(() => document.querySelectorAll('.rrow').length === 1);
  srv.call('apiAddRequest', A, 'Gas Elpiji');
  await p.click('.tabs button[data-tab=saldo]'); await p.click('#btnPrev'); await p.click('#btnNext');
  await p.waitForFunction(() => document.getElementById('reqCount').textContent === '2');
  await p.click('#tabRequest'); await p.waitForSelector('.rrow:has-text("Gas Elpiji")');
  assert.strictEqual(await p.locator('.rrow:has-text("Gas Elpiji") .rdel').count(), 0, 'siti tidak bisa hapus request admin');
  assert.strictEqual(await p.locator('.rrow:has-text("Bawang Merah") .rdel').count(), 1);
  ok('admin melihat & menghapus request; pengguna hanya bisa hapus miliknya');

  for (const x of [p, pa]) assert.deepStrictEqual(x.errors, [], x.errors.join('; '));
  await b.close();
  console.log('\nSEMUA TES UI REQUEST LULUS');
})().catch(e => { console.error('GAGAL:', e.message.split('\n').slice(0, 3).join('\n')); process.exit(1); });
