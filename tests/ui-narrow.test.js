// UI: tidak ada elemen yang melebar keluar layar pada lebar HP 300–390 px (semua tab + dialog form).
const P = require('./paths.js');
const { chromium } = require('playwright');
const { newPage, fixedServer } = require('./uihelper.js');
const srv = fixedServer();
const adm = srv.call('apiLogin', 'admin', srv.props.ADMIN_AWAL);
srv.call('apiChangePassword', adm.session, srv.props.ADMIN_AWAL, 'AdminBaru#2026');
const sess = srv.call('apiLogin', 'admin', 'AdminBaru#2026').session;
const brg = srv.call('apiData', sess).barang;
const id = n => brg.find(b => b.nama === n).id;
srv.call('apiSaveMutasi', sess, { tanggal: '2026-10-15', barangId: id('Sabun Cuci Piring'), jenis: 'MASUK', qty: '123456,789', nilai: '9876543210', keterangan: 'Nama-toko-yang-sangat-panjang-sekali-tanpa-spasi-untuk-uji-lebar-layar' });
srv.call('apiSaveMutasi', sess, { tanggal: '2026-10-15', barangId: id('Beras Putih'), jenis: 'MASUK', qty: '50', nilai: '700000' });
srv.call('apiSaveMutasi', sess, { tanggal: '2026-10-15', barangId: id('Beras Putih'), jenis: 'KELUAR', qty: '12,5' });
srv.call('apiAddRequest', sess, 'Nama-bahan-yang-sangat-panjang-sekali-tanpa-spasi-untuk-uji-lebar');

(async () => {
  const b = await chromium.launch();
  const check = p => p.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    document.querySelectorAll('#viewApp *, dialog[open] *').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width && (r.left < -0.5 || r.right > W + 0.5)) bad.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    });
    return { W, scrollW: document.documentElement.scrollWidth, bad: [...new Set(bad)].slice(0, 6) };
  });
  for (const w of [390, 360, 340, 320, 300]) {
    const p = await newPage(b, srv, { width: w, height: 760 }, sess);
    await p.waitForSelector('.scard');
    const out = [];
    for (const tab of ['saldo', 'mutasi', 'request', 'barang']) {
      await p.click('.tabs button[data-tab=' + tab + ']');
      await p.waitForSelector(tab === 'saldo' ? '.scard' : tab === 'mutasi' ? '.card' : tab === 'request' ? '.rrow' : '.brow');
      out.push([tab, await check(p)]);
    }
    await p.click('.tabs button[data-tab=saldo]');
    await p.click('.scard:has(.shead b:text-is("Beras Putih"))'); await p.waitForSelector('#dlgKartu[open]');
    out.push(['kartu', await check(p)]);
    if (w === 320) await p.screenshot({ path: P.out('shot-narrow-kartu.png') });
    await p.click('#kFoot button:has-text("Tutup")');
    await p.click('#btnIn'); await p.waitForSelector('#dlgForm[open]');
    out.push(['form', await check(p)]);
    await p.click('.seg button[data-j=RUSAK]'); out.push(['rusak', await check(p)]);
    if (w === 300) await p.screenshot({ path: P.out('shot-narrow-rusak.png') });
    await p.click('#dlgForm [data-close]');
    for (const [name, r] of out) {
      const bad = r.scrollW > r.W || r.bad.length;
      if (bad) process.exitCode = 1;
      console.log(w + 'px ' + name.padEnd(6) + ' scrollWidth=' + r.scrollW + (bad ? ' MELEBAR ' + r.bad.join(', ') : ' ok'));
    }
    if (w === 320) await p.screenshot({ path: P.out('shot-narrow.png'), fullPage: true });
    if (p.errors.length) { console.log('error JS: ' + p.errors.join('; ')); process.exitCode = 1; }
    await p.context().close();
  }
  await b.close();
})();
