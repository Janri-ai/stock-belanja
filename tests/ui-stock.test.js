// UI: login & peran, kelola barang, catat masuk/keluar, saldo, kartu stok, stok minimum.
const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const { chromium } = require('playwright');
const { newPage, login, changePw, logout, fixedServer } = require('./uihelper.js');
const srv = fixedServer();
const ok = m => console.log('ok  ' + m);
const txt = (p, s) => p.textContent(s);
const card = name => `.scard:has(.shead b:text-is("${name}"))`;

(async () => {
  const browser = await chromium.launch();
  const page = await newPage(browser, srv, { width: 1100, height: 860 });
  await page.waitForSelector('#viewLogin:not([hidden])');
  assert.strictEqual(await page.isHidden('#viewApp'), true, 'tanpa login, isi aplikasi tidak tampil');
  assert.strictEqual(await txt(page, '#loginTitle'), 'Stock & Belanja Dapur');
  await page.screenshot({ path: P.out('shot-login.png') });
  await login(page, 'admin', 'salah');
  await page.waitForFunction(() => document.getElementById('loginMsg').textContent.includes('salah'));
  ok('belum login: hanya halaman login; password salah ditolak');

  // admin pertama kali
  await login(page, 'admin', srv.props.ADMIN_AWAL);
  await page.waitForSelector('#dlgPw[open]');
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.evaluate(() => document.getElementById('dlgPw').open), true, 'dialog wajib tidak bisa ditutup');
  await changePw(page, srv.props.ADMIN_AWAL, 'AdminBaru#2026');
  await page.waitForSelector('.scard');
  assert.strictEqual(await txt(page, '#periodLbl'), 'Oktober 2026');
  assert.strictEqual(await page.isDisabled('#btnNext'), true, 'tidak bisa maju ke bulan depan');
  assert.strictEqual(await page.locator('.scard').count(), 63);
  assert.strictEqual(await txt(page, '#stBarang'), '63');
  assert((await page.locator('.group-title').first().textContent()).includes('01Sembako'));
  assert.strictEqual(await page.locator(card('Beras Putih') + ' .kode').textContent(), '01.001');
  assert.strictEqual(await page.isVisible('#tabBarang'), true);
  assert.strictEqual(await txt(page, '#welcome'), 'Selamat Datang Admin!');
  ok('admin: wajib ganti password, lalu tampil saldo 63 barang awal berkode per Oktober 2026');

  // admin mengisi stok awal Beras & Minyak lewat tab Barang
  await page.click('#tabBarang');
  await page.waitForSelector('.brow');
  await page.click('.brow:has-text("Beras Putih")');
  await page.fill('#bStok', '25,5'); await page.fill('#bTgl', '2026-10-01'); await page.fill('#bMin', '10');
  await page.click('#btnBarangSave'); await page.waitForSelector('#dlgBarang', { state: 'hidden' });
  await page.click('.brow:has-text("Minyak Goreng")');
  await page.fill('#bStok', '3'); await page.fill('#bTgl', '2026-10-01');
  await page.click('#btnBarangSave'); await page.waitForSelector('#dlgBarang', { state: 'hidden' });
  // tambah barang baru dengan upaya XSS
  await page.click('#btnAddBarang');
  await page.fill('#bNama', '<img src=x onerror="window.__xss=1">Kecap'); await page.selectOption('#bKat', 'Bumbu');
  await page.fill('#bSatuan', 'botol'); await page.fill('#bStok', '2'); await page.fill('#bTgl', '2026-10-01');
  await page.click('#btnBarangSave'); await page.waitForSelector('#dlgBarang', { state: 'hidden' });
  await page.click('#btnAddBarang'); await page.fill('#bNama', 'beras putih'); await page.fill('#bSatuan', 'kg');
  await page.click('#btnBarangSave');
  await page.waitForFunction(() => document.getElementById('bMsg').textContent.includes('sudah ada'));
  await page.click('#dlgBarang [data-close]');
  assert.strictEqual(await page.locator('.brow').count(), 64);
  assert((await page.locator('.brow:has-text("onerror") .kode').first().textContent()) === '02.015', 'barang baru dapat kode otomatis');
  await page.screenshot({ path: P.out('shot-barang.png') });
  ok('admin: ubah stok awal & stok minimum, tambah barang baru, nama ganda ditolak');

  // tambah pengguna
  await page.click('#btnAccount'); await page.click('#btnUsers');
  await page.waitForSelector('#uList .urow'); await page.click('#btnAddUser');
  await page.fill('#uUsername', 'siti'); await page.fill('#uNama', 'Siti Aminah');
  const tempPw = await page.inputValue('#uPass');
  await page.click('#btnUserSave'); await page.waitForSelector('#uMsg .mono');
  await page.click('#btnUserSave'); await page.waitForSelector('#dlgUser', { state: 'hidden' });
  await page.click('#dlgUsers .dlg-foot .btn');
  ok('admin menambah pengguna; password sementara tampil sekali');

  // pengguna: catat belanja beras + struk
  await logout(page);
  await login(page, 'siti', tempPw); await changePw(page, tempPw, 'SitiBaru#123');
  await page.waitForSelector('.scard');
  assert.strictEqual(await page.isHidden('#tabBarang'), true, 'tab Barang hanya untuk admin');
  assert.strictEqual(await txt(page, '#welcome'), 'Selamat Datang, Siti!');
  assert.strictEqual(await page.isHidden('#btnUsers'), true);
  await page.click('#btnIn');
  await page.waitForSelector('#dlgForm[open]');
  assert.strictEqual(await txt(page, '#formTitle'), 'Catat Barang Masuk');
  await page.selectOption('#fBarang', { label: '01.001 Beras Putih (kg)' });
  assert((await txt(page, '#stokInfo')).includes('25,5 kg'));
  await page.fill('#fQty', '20'); await page.fill('#fNilai', '280000');
  assert.strictEqual(await page.inputValue('#fNilai'), '280.000', 'rupiah diberi titik ribuan otomatis');
  assert((await txt(page, '#hargaHint')).includes('Rp14.000'));
  await page.fill('#fTanggal', '2026-10-03'); await page.fill('#fKet', 'Belanja pasar');
  await page.setInputFiles('#fFiles', [{ name: 'struk.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(P.JPG) }]);
  await page.screenshot({ path: P.out('shot-form-masuk.png') });
  await page.click('#btnSave'); await page.waitForSelector('#dlgForm', { state: 'hidden' });

  // keluar terlalu banyak -> ditolak; keluar wajar -> tersimpan
  await page.click('#btnOut');
  assert.strictEqual(await page.isHidden('#nilaiWrap'), true, 'nilai Rp hanya untuk barang masuk');
  await page.selectOption('#fBarang', { label: '01.001 Beras Putih (kg)' });
  await page.fill('#fQty', '50'); await page.click('#btnSave');
  await page.waitForFunction(() => document.getElementById('formStatus').textContent.includes('tidak cukup'));
  await page.fill('#fQty', '37,5'); await page.fill('#fKet', 'Masak 2 minggu'); await page.click('#btnSave');
  await page.waitForSelector('#dlgForm', { state: 'hidden' });
  // Beras: 25,5 + 20 − 37,5 = 8 -> di bawah batas 10
  const c = card('Beras Putih');
  assert.deepStrictEqual(await page.locator(c + ' .sgrid b').allTextContents(), ['25,5', '+20', '−37,5', '8']);
  assert.strictEqual(await page.locator(c + ' .tag.low').count(), 1);
  await page.waitForSelector('#alertLow:not([hidden])');
  assert((await txt(page, '#alertLow')).includes('Beras Putih: 8 / min 10 kg'));
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.scard.low')).borderTopColor), 'rgb(229, 57, 53)', 'kartu stok minimum berwarna merah');
  assert.strictEqual(await page.locator(card('Minyak Goreng') + '.low').count(), 0, 'Minyak di atas minimum: tidak merah');
  const lowNow = srv.call('apiData', srv.call('apiLogin', 'admin', 'AdminBaru#2026').session).barang.filter(b => b.aktif && b.minStok > 0 && b.kini <= b.minStok).length;
  assert.strictEqual(await txt(page, '#stLow'), String(lowNow));
  assert.strictEqual(lowNow, 62, '61 barang awal masih 0 + Beras Putih');
  assert.strictEqual(await page.locator('#alertLow .chip').count(), 13, '12 nama + "+50 lainnya"');
  assert.strictEqual(await txt(page, '#stBelanja'), '280 rb');
  assert((await txt(page, '.total')).includes('Rp280.000'));
  assert(await page.locator('.shead b:has-text("onerror")').count() === 1);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined, 'tidak ada XSS');
  await page.screenshot({ path: P.out('shot-saldo.png'), fullPage: true });
  ok('pengguna: catat masuk (Rp, harga/satuan, struk) & keluar; saldo minus ditolak; saldo 8 kg <= minimum 10: kartu merah + peringatan');

  // kartu stok
  await page.click(c);
  await page.waitForSelector('#dlgKartu[open]');
  const saldoCol = await page.locator('#kBody .lrow:not(.head) .s').allTextContents();
  assert.deepStrictEqual(saldoCol, ['25,5', '45,5', '8', '8']);
  assert((await txt(page, '#kBody')).includes('Belanja Rp280.000'));
  await page.screenshot({ path: P.out('shot-kartu.png') });
  await page.click('#kFoot button:has-text("Tutup")');
  ok('kartu stok: saldo awal → +20 → −37,5 → saldo akhir, seperti buku kas');

  // tab transaksi + detail + filter
  await page.click('.tabs button[data-tab=mutasi]');
  await page.waitForSelector('.card');
  assert.strictEqual(await page.locator('.card').count(), 2);
  await page.selectOption('#fJenis', 'KELUAR'); assert.strictEqual(await page.locator('.card').count(), 1);
  await page.selectOption('#fJenis', '');
  await page.click('.card:has-text("Belanja pasar")');
  await page.waitForSelector('#dlgDetail[open]');
  assert((await txt(page, '#dBody')).includes('Rp14.000'));
  assert.strictEqual(await page.locator('#dBody .gallery img').count(), 1, 'struk tampil');
  await page.click('#dFoot button:has-text("Tutup")');
  await page.screenshot({ path: P.out('shot-mutasi.png') });
  ok('transaksi: daftar, filter jenis, detail dengan harga per satuan & foto struk');

  // klik chip peringatan -> form masuk terisi barangnya
  await page.click('#alertLow .chip:has-text("Beras Putih")');
  await page.waitForSelector('#dlgForm[open]');
  assert.strictEqual(await page.inputValue('#fBarang'), srv.call('apiData', srv.call('apiLogin', 'siti', 'SitiBaru#123').session).barang.find(b => b.nama === 'Beras Putih').id);
  assert.strictEqual(await txt(page, '#formTitle'), 'Catat Barang Masuk');
  await page.click('#dlgForm [data-close]');

  // bulan sebelumnya: stok awal baru per 1 Okt
  await page.click('.tabs button[data-tab=saldo]');
  await page.click('#btnPrev'); await page.waitForFunction(() => document.getElementById('periodLbl').textContent === 'September 2026');
  await page.waitForSelector('.scard');
  assert((await txt(page, card('Beras Putih') + ' .sfoot')).includes('Stok awal baru dicatat per 1 Okt 2026'));
  await page.click('#btnNext'); await page.waitForFunction(() => document.getElementById('periodLbl').textContent === 'Oktober 2026');
  ok('navigasi bulan: September belum tercatat, kembali ke Oktober');

  // pengguna lain tidak bisa mengubah transaksi siti, tapi bisa melihat
  srv.call('apiSaveUser', srv.call('apiLogin', 'admin', 'AdminBaru#2026').session, { isNew: true, username: 'budi', nama: 'Budi Santoso', peran: 'user', password: 'budi12345' });
  const pm = await newPage(browser, srv, { width: 390, height: 820 });
  await login(pm, 'budi', 'budi12345'); await changePw(pm, 'budi12345', 'BudiBaru#123');
  await pm.waitForSelector('.scard');
  await pm.screenshot({ path: P.out('shot-mobile-saldo.png') });
  await pm.click('.tabs button[data-tab=mutasi]'); await pm.waitForSelector('.card');
  await pm.screenshot({ path: P.out('shot-mobile-mutasi.png') });
  await pm.click('.card:has-text("Belanja pasar")');
  assert.strictEqual(await pm.locator('#dFoot button:has-text("Edit")').count(), 0, 'bukan pemilik: tidak ada Edit');
  await pm.click('#dFoot button:has-text("Tutup")');
  await pm.click('#btnOut'); await pm.waitForSelector('#dlgForm[open]');
  await pm.screenshot({ path: P.out('shot-mobile-form.png') });
  await pm.click('#dlgForm [data-close]');
  ok('pengguna lain: melihat semua stok & transaksi, tidak bisa mengedit milik orang lain (HP 390 px)');

  // admin bisa edit transaksi siti
  await logout(page); await login(page, 'admin', 'AdminBaru#2026');
  await page.waitForSelector('.scard');
  await page.click('.tabs button[data-tab=mutasi]'); await page.waitForSelector('.card');
  await page.click('.card:has-text("Masak 2 minggu")'); await page.click('#dFoot button:has-text("Edit")');
  await page.waitForSelector('#dlgForm[open]');
  assert.strictEqual(await page.inputValue('#fQty'), '37,5');
  assert.strictEqual(await txt(page, '#formTitle'), 'Edit Barang Keluar');
  await page.fill('#fQty', '30'); await page.click('#btnSave'); await page.waitForSelector('#dlgForm', { state: 'hidden' });
  await page.click('.tabs button[data-tab=saldo]');
  assert.strictEqual(await page.locator(card('Beras Putih') + ' .bal b').textContent(), '15,5');
  await page.waitForFunction(() => !document.getElementById('alertLow').textContent.includes('Beras Putih'));
  assert.strictEqual(await txt(page, '#stLow'), '61');
  ok('admin mengoreksi transaksi; saldo & peringatan ikut diperbarui');

  // sesi habis
  Object.keys(srv.cacheData).filter(k => k.startsWith('ses_')).forEach(k => delete srv.cacheData[k]);
  await page.click('#btnPrev');
  await page.waitForSelector('#viewLogin:not([hidden])');
  assert((await txt(page, '#loginMsg')).includes('Sesi Anda berakhir'));
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('dialog[open]').length), 0);
  ok('sesi habis: kembali ke login dengan pesan');

  const pl = await newPage(browser, srv, { width: 390, height: 800 });
  await pl.waitForSelector('#viewLogin:not([hidden])'); await pl.screenshot({ path: P.out('shot-mobile-login.png') });
  for (const p of [page, pm, pl]) assert.deepStrictEqual(p.errors, [], 'error JS: ' + p.errors.join('; '));
  await browser.close();
  console.log('\nSEMUA TES UI LULUS');
})().catch(e => { console.error('GAGAL:', e.message.split('\n').slice(0, 3).join('\n')); process.exit(1); });
