// UI: catat barang rusak/expired (jenis barang, jumlah, kondisi, foto wajib) dan tampilannya.
const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const { chromium } = require('playwright');
const { newPage, fixedServer } = require('./uihelper.js');
const srv = fixedServer();
const ok = m => console.log('ok  ' + m);
const adm = srv.call('apiLogin', 'admin', srv.props.ADMIN_AWAL);
srv.call('apiChangePassword', adm.session, srv.props.ADMIN_AWAL, 'AdminBaru#2026');
const A = srv.call('apiLogin', 'admin', 'AdminBaru#2026').session;
const telur = srv.call('apiData', A).barang.find(b => b.nama === 'Telur Ayam');
srv.call('apiSaveBarang', A, { id: telur.id, nama: 'Telur Ayam', kategori: 'Lauk Pauk', satuan: 'butir', stokAwal: '30', tglAwal: '2026-10-01', minStok: '10' });

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1100, height: 860 }, { width: 390, height: 860 }]) {
    const page = await newPage(b, srv, vp, A);
    await page.waitForSelector('.scard');
    const mobile = vp.width < 500;
    await page.click('#btnRusak');
    await page.waitForSelector('#dlgForm[open]');
    assert.strictEqual(await page.textContent('#formTitle'), 'Catat Barang Rusak/Expired');
    assert.strictEqual(await page.isVisible('#kondisiWrap'), true);
    assert.strictEqual(await page.isHidden('#nilaiWrap'), true, 'tanpa nilai Rp');
    assert.strictEqual(await page.textContent('#filesLbl'), 'Foto barang rusak/expired *');
    await page.selectOption('#fBarang', { label: telur.kode + ' Telur Ayam (butir)' });
    await page.fill('#fQty', mobile ? '2' : '4');
    await page.click('.seg button[data-k=EXPIRED]');
    await page.fill('#fKet', 'Lewat tanggal');
    await page.click('#btnSave');
    await page.waitForFunction(() => document.getElementById('formStatus').textContent.includes('Lampirkan foto'));
    await page.setInputFiles('#fFiles', [{ name: 'telur.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(P.JPG) }]);
    await page.screenshot({ path: P.out(mobile ? 'shot-mobile-rusak-form.png' : 'shot-rusak-form.png') });
    await page.click('#btnSave');
    await page.waitForSelector('#dlgForm', { state: 'hidden' });
    if (!mobile) ok('form rusak/expired: kondisi, tanpa Rp, foto wajib (ditolak tanpa foto), lalu tersimpan');

    // saldo
    const card = '.scard:has(.shead b:text-is("Telur Ayam"))';
    await page.locator(card + ' .sfoot .rusak').waitFor();
    assert.strictEqual(await page.locator(card + ' .bal b').textContent(), mobile ? '24' : '26');
    assert((await page.textContent(card + ' .sfoot .rusak')).includes('Rusak/expired ' + (mobile ? '6' : '4') + ' butir'));
    // transaksi
    await page.click('.tabs button[data-tab=mutasi]');
    await page.waitForSelector('.card');
    await page.selectOption('#fJenis', 'RUSAK');
    assert.strictEqual(await page.locator('.card').count(), mobile ? 2 : 1);
    assert((await page.locator('.card .chip.bad').first().textContent()).includes('Expired'));
    if (mobile) await page.screenshot({ path: P.out('shot-mobile-rusak-list.png') });
    await page.locator('.card').first().click();
    await page.waitForSelector('#dlgDetail[open]');
    assert((await page.textContent('#dTitle')).startsWith('Expired · Telur Ayam'));
    assert((await page.textContent('#dBody')).includes('Expired (kedaluwarsa)'));
    assert.strictEqual(await page.locator('#dBody .gallery img').count(), 1, 'foto tampil');
    // edit: kondisi terbaca kembali
    await page.click('#dFoot button:has-text("Edit")');
    await page.waitForSelector('#dlgForm[open]');
    assert.strictEqual(await page.getAttribute('.seg button[data-j=RUSAK]', 'aria-checked'), 'true');
    assert.strictEqual(await page.getAttribute('.seg button[data-k=EXPIRED]', 'aria-checked'), 'true');
    await page.click('#dlgForm [data-close]');
    assert.deepStrictEqual(page.errors, [], page.errors.join('; '));
    if (!mobile) ok('tampilan: saldo berkurang, catatan rusak di kartu saldo, filter "Rusak/expired", detail & edit');
    await page.context().close();
  }
  const m = srv.call('apiData', A).mutasi.filter(x => x.alasan === 'EXPIRED');
  assert.strictEqual(m.length, 2); assert(m.every(x => x.lampiran.length === 1));
  ok('HP 390 px: alur sama berjalan; data tersimpan dengan alasan & foto');
  await b.close();
  console.log('\nSEMUA TES RUSAK/EXPIRED LULUS');
})().catch(e => { console.error('GAGAL:', e.message.split('\n').slice(0, 3).join('\n')); process.exit(1); });
