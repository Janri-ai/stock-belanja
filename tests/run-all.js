// Menjalankan semua tes berurutan. Pakai: npm test
const { spawnSync } = require('child_process');
const path = require('path');
const tests = [
  ['Backend: akun, sesi, peran', 'server.test.js'],
  ['Backend: barang, masuk/keluar, saldo, struk', 'stock.test.js'],
  ['Backend: request belanja', 'request.test.js'],
  ['Halaman pembungkus GitHub Pages', 'wrapper.test.js'],
  ['Pasang sebagai aplikasi HP (PWA)', 'pwa.test.js'],
  ['UI: login, barang, transaksi, kartu stok', 'ui-stock.test.js'],
  ['UI: barang rusak/expired', 'ui-rusak.test.js'],
  ['UI: request belanja', 'ui-request.test.js'],
  ['UI: tata letak lebar sempit', 'ui-narrow.test.js']
];
let failed = 0;
for (const [name, file] of tests) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: 300000 });
  const good = r.status === 0;
  console.log((good ? 'LULUS  ' : 'GAGAL  ') + name);
  if (!good) { failed++; console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n')); }
}
console.log(failed ? `\n${failed} kelompok tes GAGAL` : '\nSEMUA TES LULUS');
process.exit(failed ? 1 : 0);
