// Backend: barang, transaksi masuk/keluar, saldo per periode, struk.
const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const make = require('./gasmock.js');
const code = fs.readFileSync(P.CODE, 'utf8');
const S = make(code);
const throws = (fn, re) => { try { fn(); } catch (e) { assert(re.test(e.message), 'pesan salah: ' + e.message); return; } assert.fail('harusnya error ' + re); };
const b64 = a => Buffer.from(a).toString('base64');
const JPG = b64([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]), EXE = b64(Buffer.from('MZ\x90 bad'));
const ok = m => console.log('ok  ' + m);

// Waktu dipalsukan: 15 Okt 2026 10.00 WIB
S.run('nowDate_ = function () { return new Date("2026-10-15T03:00:00Z"); }');
S.run('setup()');
const A = S.call('apiLogin', 'admin', S.props.ADMIN_AWAL).session;
S.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Siti Aminah', peran: 'user', password: 'sementara1' });
S.call('apiSaveUser', A, { isNew: true, username: 'budi', nama: 'Budi Santoso', peran: 'user', password: 'sementara2' });
const SS = S.call('apiLogin', 'siti', 'sementara1').session, BS = S.call('apiLogin', 'budi', 'sementara2').session;

// ---- setup: kelompok berkode & daftar barang awal
let d = S.call('apiData', A, '2026-10');
assert.strictEqual(d.barang.length, 63);
assert.deepStrictEqual(JSON.parse(JSON.stringify(d.kelompok)), [['01', 'Sembako'], ['02', 'Bumbu'], ['03', 'Lauk Pauk'], ['04', 'Sayur-sayuran'],
  ['05', 'Buah-buahan'], ['06', 'Alat Kebersihan'], ['07', 'Perlengkapan Mandi'], ['08', 'Lain-lain']]);
assert(d.barang.every(b => b.tglAwal === '2026-10-15' && b.stokAwal === 0));
assert.strictEqual(d.barang[0].kode + ' ' + d.barang[0].nama, '01.001 Beras Putih');
assert.strictEqual(d.barang.find(b => b.nama === 'Gas Elpiji').kode, '01.010');
assert.strictEqual(d.barang.find(b => b.nama === 'Margarin/Mentega').kode, '02.014');
assert.strictEqual(d.barang.find(b => b.nama === 'Telur Puyuh').kode, '03.011');
assert.strictEqual(d.barang.find(b => b.nama === 'Plastik Sampah').kode, '08.003');
const jumlah = {}; d.barang.forEach(b => { jumlah[b.kategori] = (jumlah[b.kategori] || 0) + 1; });
assert.deepStrictEqual(jumlah, { 'Sembako': 10, 'Bumbu': 14, 'Lauk Pauk': 11, 'Sayur-sayuran': 7, 'Buah-buahan': 6, 'Alat Kebersihan': 7, 'Perlengkapan Mandi': 5, 'Lain-lain': 3 });
assert.strictEqual(new Set(d.barang.map(b => b.kode)).size, 63, 'kode unik');
assert.strictEqual(d.hariIni, '2026-10-15');
S.run('setup()'); assert.strictEqual(S.call('apiData', A, '2026-10').barang.length, 63);
ok('setup: 8 kelompok berkode 01–08, 63 barang awal berkode 01.001 dst., setup ulang tidak menggandakan');

// ---- kelola barang
throws(() => S.call('apiSaveBarang', SS, { nama: 'X', kategori: 'Sembako', satuan: 'kg', tglAwal: '2026-10-01' }), /Hanya admin/);
throws(() => S.call('apiSaveBarang', A, { nama: 'beras putih', kategori: 'Sembako', satuan: 'kg', tglAwal: '2026-10-01' }), /sudah ada/);
throws(() => S.call('apiSaveBarang', A, { nama: 'Kecap', kategori: 'Bebas', satuan: 'botol', tglAwal: '2026-10-01' }), /Kategori/);
throws(() => S.call('apiSaveBarang', A, { nama: 'Kecap', kategori: 'Bumbu', satuan: 'botol', tglAwal: '2026-10-16' }), /melebihi hari ini/);
throws(() => S.call('apiSaveBarang', A, { nama: 'Kecap', kategori: 'Bumbu', satuan: 'botol', stokAwal: '-1', tglAwal: '2026-10-01' }), /harus angka/);
const beras = d.barang.find(b => b.nama === 'Beras Putih');
S.call('apiSaveBarang', A, { id: beras.id, nama: 'Beras Putih', kategori: 'Sembako', satuan: 'kg', stokAwal: '25,5', tglAwal: '2026-09-01', minStok: '10' });
const kecap = S.call('apiSaveBarang', A, { nama: '=Kecap()', kategori: 'Bumbu', satuan: 'botol', stokAwal: '2', tglAwal: '2026-09-01', minStok: '1' }).id;
assert(S.sheets['Barang'].rows.some(r => r[3] === '=Kecap()'), 'rumus disimpan sebagai teks');
const kecapRow = S.call('apiData', A, '2026-10').barang.find(b => b.id === kecap);
assert.strictEqual(kecapRow.kode, '02.015', 'barang baru: kode berikutnya di kelompoknya');
const kopi = S.call('apiSaveBarang', A, { nama: 'Kopi', kategori: 'Lain-lain', satuan: 'bungkus', tglAwal: '2026-10-01' });
assert.strictEqual(kopi.kode, '08.004');
assert.strictEqual(S.call('apiSaveBarang', A, { id: kopi.id, nama: 'Kopi', kategori: 'Sembako', satuan: 'bungkus', tglAwal: '2026-10-01' }).kode, '01.011', 'pindah kelompok: kode baru');
assert.strictEqual(S.call('apiSaveBarang', A, { id: kopi.id, nama: 'Kopi Bubuk', kategori: 'Sembako', satuan: 'bungkus', tglAwal: '2026-10-01' }).kode, '01.011', 'ubah nama: kode tetap');
S.call('apiDeleteBarang', A, kopi.id);
assert.strictEqual(S.call('apiSaveBarang', A, { nama: 'Teh', kategori: 'Sembako', satuan: 'kotak', tglAwal: '2026-10-01' }).kode, '01.012', 'kode barang terhapus tidak dipakai ulang');
ok('barang: hanya admin, validasi nama ganda/kelompok/tanggal/angka; kode otomatis, berganti saat pindah kelompok, tidak dipakai ulang');

// ---- transaksi
const tx = (s, o) => S.call('apiSaveMutasi', s, Object.assign({ tanggal: '2026-09-10', barangId: beras.id, jenis: 'MASUK', qty: '1', nilai: '' }, o)).mutasi;
const m1 = tx(SS, { jenis: 'MASUK', qty: '50', nilai: '650000', keterangan: 'Belanja pasar' });
assert.strictEqual(m1.nama, 'Siti Aminah'); assert.strictEqual(m1.barang, 'Beras Putih'); assert.strictEqual(m1.kode, '01.001'); assert.strictEqual(m1.nilai, 650000);
const m2 = tx(BS, { tanggal: '2026-09-20', jenis: 'KELUAR', qty: '30,25' });
tx(SS, { tanggal: '2026-10-02', jenis: 'KELUAR', qty: '20' });
tx(SS, { tanggal: '2026-10-05', jenis: 'MASUK', qty: '10', nilai: '140000' });
tx(BS, { tanggal: '2026-10-05', jenis: 'KELUAR', qty: '5' });
throws(() => tx(SS, { jenis: 'KELUAR', qty: '0' }), /lebih dari 0/);
throws(() => tx(SS, { jenis: 'BELI', qty: '1' }), /jenis/);
throws(() => tx(SS, { tanggal: '2026-10-16' }), /melebihi hari ini/);
throws(() => tx(SS, { tanggal: '2026-08-31' }), /sebelum tanggal stok awal/);
throws(() => tx(SS, { nilai: '65.000' }), /tanpa titik/);
throws(() => tx(SS, { barangId: 'tidak-ada' }), /Pilih barang/);
// saldo Beras: 25,5 +50 -30,25 = 45,25 (akhir Sep); Okt: -20 +10 -5 = 30,25
throws(() => tx(SS, { tanggal: '2026-10-06', jenis: 'KELUAR', qty: '30,3' }), /Beras Putih tidak cukup.*-0,05 kg/);
throws(() => tx(SS, { tanggal: '2026-09-11', jenis: 'KELUAR', qty: '76' }), /tidak cukup/);   // minus di masa lalu
ok('transaksi: nama dari akun, validasi jumlah/jenis/tanggal/rupiah, saldo minus ditolak (termasuk tanggal lampau)');

// ---- rekap per periode
d = S.call('apiData', SS, '2026-10');
let b = d.barang.find(x => x.id === beras.id);
assert.deepStrictEqual([b.awal, b.masuk, b.keluar, b.saldo, b.kini, b.belanja, b.trx], [45.25, 10, 25, 30.25, 30.25, 140000, 3]);
assert.strictEqual(d.mutasi.length, 3); assert.strictEqual(d.totalBelanja, 140000);
assert(d.mutasi[0].tanggal >= d.mutasi[2].tanggal, 'urut terbaru dulu');
const sep = S.call('apiData', SS, '2026-09'); b = sep.barang.find(x => x.id === beras.id);
assert.deepStrictEqual([b.awal, b.masuk, b.keluar, b.saldo, b.kini], [25.5, 50, 30.25, 45.25, 30.25]);
assert.strictEqual(sep.totalBelanja, 650000);
const ags = S.call('apiData', SS, '2026-08'); b = ags.barang.find(x => x.id === beras.id);
assert.strictEqual(b.mulai, false); assert.strictEqual(b.saldo, 0);
assert.strictEqual(ags.barang.find(x => x.nama === 'Garam').mulai, false);
assert.strictEqual(S.call('apiData', SS, 'ngawur').periode, '2026-10');
assert.strictEqual(S.call('apiData', BS, '2026-10').mutasi.length, 3, 'semua pengguna melihat semua transaksi dapur');
ok('rekap: awal + masuk − keluar = saldo per bulan; bulan sebelum stok awal = belum tercatat; belanja Rp per bulan');

// ---- hak ubah
throws(() => S.call('apiSaveMutasi', BS, { id: m1.id, tanggal: '2026-09-10', barangId: beras.id, jenis: 'MASUK', qty: '1' }), /tidak berhak/);
throws(() => S.call('apiDelete', BS, m1.id), /tidak berhak/);
throws(() => S.call('apiUploadFile', BS, m1.id, { name: 'a.jpg', data: JPG }), /tidak berhak/);
// mengurangi masuk 50 -> 10 membuat saldo minus -> ditolak; hapus juga ditolak
throws(() => S.call('apiSaveMutasi', SS, { id: m1.id, tanggal: '2026-09-10', barangId: beras.id, jenis: 'MASUK', qty: '10' }), /tidak cukup/);
throws(() => S.call('apiDelete', SS, m1.id), /tidak cukup/);
const e1 = S.call('apiSaveMutasi', A, { id: m2.id, tanggal: '2026-09-20', barangId: beras.id, jenis: 'KELUAR', qty: '30,25', keterangan: 'koreksi admin' }).mutasi;
assert.strictEqual(e1.pembuat, 'budi', 'admin mengubah tanpa mengganti pembuat');
// pindah barang: keluar 30 dari Beras ke Kecap (stok 2) -> ditolak
throws(() => S.call('apiSaveMutasi', A, { id: m2.id, tanggal: '2026-09-20', barangId: kecap, jenis: 'KELUAR', qty: '30,25' }), /Kecap.*tidak cukup/);
ok('hak ubah: hanya pemilik/admin; ubah & hapus yang membuat saldo minus ditolak; pindah barang dicek');

// ---- tanggal / stok awal barang yang sudah punya transaksi
throws(() => S.call('apiSaveBarang', A, { id: beras.id, nama: 'Beras Putih', kategori: 'Sembako', satuan: 'kg', stokAwal: '25,5', tglAwal: '2026-09-15', minStok: '10' }), /transaksi pertama/);
throws(() => S.call('apiSaveBarang', A, { id: beras.id, nama: 'Beras Putih', kategori: 'Sembako', satuan: 'kg', stokAwal: '0', tglAwal: '2026-09-01', minStok: '10' }), /tidak cukup/);
throws(() => S.call('apiDeleteBarang', A, beras.id), /sudah punya transaksi/);
S.call('apiDeleteBarang', A, kecap);
assert(!S.call('apiData', A, '2026-10').barang.some(x => x.id === kecap));
S.call('apiSaveBarang', A, { id: beras.id, nama: 'Beras Putih', kategori: 'Sembako', satuan: 'kg', stokAwal: '25,5', tglAwal: '2026-09-01', minStok: '10', aktif: false });
throws(() => tx(SS, { tanggal: '2026-10-10', jenis: 'MASUK', qty: '1' }), /tidak aktif/);
assert.strictEqual(S.call('apiData', A, '2026-10').barang.find(x => x.id === beras.id).aktif, false);
S.call('apiSaveBarang', A, { id: beras.id, nama: 'Beras Putih', kategori: 'Sembako', satuan: 'kg', stokAwal: '25,5', tglAwal: '2026-09-01', minStok: '10', aktif: true });
ok('barang: stok awal/tanggal dijaga terhadap transaksi; hapus hanya bila belum ada transaksi; nonaktif menolak transaksi baru');

// ---- struk
const up = S.call('apiUploadFile', SS, m1.id, { name: 'struk.jpg', data: JPG }); assert.strictEqual(up.tipe, 'jpg');
throws(() => S.call('apiUploadFile', SS, m1.id, { name: 'x.pdf', data: EXE }), /JPG.*PDF/);
S.call('apiUploadFile', SS, m1.id, { name: 'b.jpg', data: JPG }); S.call('apiUploadFile', SS, m1.id, { name: 'c.jpg', data: JPG });
throws(() => S.call('apiUploadFile', SS, m1.id, { name: 'd.jpg', data: JPG }), /Maksimal 3/);
S.call('apiRemoveFile', SS, m1.id, up.id); assert(S.files[up.id].trashed);
const keluar5 = S.call('apiData', SS, '2026-10').mutasi.find(m => m.qty === 5);
S.call('apiDelete', BS, keluar5.id);
assert.strictEqual(S.call('apiData', SS, '2026-10').barang.find(x => x.id === beras.id).saldo, 35.25);
ok('struk: cek isi file, maks 3, hapus -> trash; hapus transaksi keluar menaikkan saldo');

// ---- barang rusak / expired (keluar dengan alasan)
throws(() => tx(SS, { tanggal: '2026-10-10', jenis: 'KELUAR', qty: '1', alasan: 'HILANG' }), /Rusak atau Expired/);
throws(() => tx(SS, { tanggal: '2026-10-10', jenis: 'MASUK', qty: '1', alasan: 'RUSAK' }), /Rusak atau Expired/);
throws(() => tx(SS, { tanggal: '2026-10-10', jenis: 'KELUAR', qty: '40', alasan: 'EXPIRED' }), /tidak cukup/);
const rk = tx(SS, { tanggal: '2026-10-10', jenis: 'KELUAR', qty: '1,25', alasan: 'RUSAK', keterangan: 'Berkutu' });
assert.strictEqual(rk.alasan, 'RUSAK');
assert.strictEqual(S.sheets['Mutasi'].rows[0][13], 'alasan', 'kolom alasan ditambahkan');
let rb = S.call('apiData', SS, '2026-10');
let bb = rb.barang.find(x => x.id === beras.id);
assert.deepStrictEqual([bb.rusak, bb.saldo, rb.totalRusak], [1.25, 34, 1], 'rusak mengurangi saldo dan dihitung terpisah');
assert.strictEqual(rb.mutasi.find(m => m.id === rk.id).alasan, 'RUSAK');
assert.strictEqual(S.call('apiSaveMutasi', SS, { id: rk.id, tanggal: '2026-10-10', barangId: beras.id, jenis: 'KELUAR', qty: '1,25', alasan: 'EXPIRED' }).mutasi.alasan, 'EXPIRED');
throws(() => S.call('apiSaveMutasi', BS, { id: rk.id, tanggal: '2026-10-10', barangId: beras.id, jenis: 'KELUAR', qty: '1', alasan: 'RUSAK' }), /tidak berhak/);
S.call('apiSaveMutasi', SS, { id: rk.id, tanggal: '2026-10-10', barangId: beras.id, jenis: 'KELUAR', qty: '1,25', alasan: '' });
rb = S.call('apiData', SS, '2026-10'); bb = rb.barang.find(x => x.id === beras.id);
assert.deepStrictEqual([bb.rusak, bb.saldo, rb.totalRusak], [0, 34, 0], 'alasan dihapus -> keluar biasa');
assert.strictEqual(S.call('apiData', SS, '2026-09').totalRusak, 0);
ok('rusak/expired: hanya untuk keluar, alasan valid, mengurangi saldo, dihitung terpisah, bisa diubah pemilik');

// ---- tidak membocorkan data akun
const all = JSON.stringify(S.call('apiData', SS, '2026-10'));
assert(!/salt|hash|session/.test(all));
throws(() => S.call('apiData', 'x'.repeat(64), '2026-10'), /SESI_HABIS/);
ok('data stok tidak memuat hash/sesi; sesi palsu ditolak');
// ---- migrasi dari versi pertama (9 barang contoh, kategori lama, tanpa kolom kode)
const M = make(code);
M.run('nowDate_ = function () { return new Date("2026-10-15T03:00:00Z"); }');
M.run('SpreadsheetApp.getActiveSpreadsheet().insertSheet("Barang"); SpreadsheetApp.getActiveSpreadsheet().insertSheet("Mutasi")');
const H11 = ['id', 'dibuat', 'diperbarui', 'nama', 'kategori', 'satuan', 'stokAwal', 'tglAwal', 'minStok', 'aktif', 'dihapus'];
const lama = [['b1', 'Beras', 'Beras', 'kg', '20'], ['b2', 'Minyak Goreng', 'Minyak', 'liter', '0'], ['b3', 'Ikan', 'Ikan', 'kg', '0'],
  ['b4', 'Sayuran', 'Sayuran', 'kg', '3'], ['b5', 'Sabun Cuci Piring', 'Sabun', 'pcs', '0'], ['b6', 'Cabai', 'Bumbu', 'kg', '0'], ['b7', 'Tepung', 'Lainnya', 'kg', '0']];
M.sheets['Barang'].rows = [H11].concat(lama.map(r => [r[0], 't', 't', r[1], r[2], r[3], r[4], '2026-10-01', '1', 'TRUE', '']));
M.sheets['Mutasi'].rows = [['id', 'dibuat', 'diperbarui', 'tanggal', 'barangId', 'jenis', 'qty', 'nilai', 'keterangan', 'pembuat', 'nama', 'lampiran', 'dihapus'],
  ['m1', 't', 't', '2026-10-02', 'b3', 'MASUK', '2', '50000', '', 'admin', 'Admin', '[]', '']];
M.run('setup()');
const MA = M.call('apiLogin', 'admin', M.props.ADMIN_AWAL).session;
const md = M.call('apiData', MA, '2026-10'), by = id => md.barang.find(b => b.id === id);
assert.strictEqual(by('b1').nama, 'Beras Putih'); assert.strictEqual(by('b1').kode, '01.001'); assert.strictEqual(by('b1').stokAwal, 20);
assert.strictEqual(by('b2').kategori, 'Sembako'); assert.strictEqual(by('b2').kode, '01.006');
assert.strictEqual(by('b3').kategori, 'Lauk Pauk', 'Ikan sudah punya transaksi: tetap ada'); assert.strictEqual(by('b3').saldo, 2);
assert.strictEqual(by('b4').kategori, 'Sayur-sayuran', 'Sayuran punya stok awal: tetap ada');
assert.strictEqual(by('b5').kategori, 'Alat Kebersihan'); assert.strictEqual(by('b6').nama, 'Cabe');
assert.strictEqual(by('b7').kategori, 'Lain-lain'); assert.strictEqual(by('b7').kode, '08.004', 'barang tambahan sendiri: kode sesudah barang awal');
assert.strictEqual(md.barang.filter(b => b.nama === 'Beras Putih').length, 1, 'tidak dobel');
assert.strictEqual(md.barang.length, 63 + 3, '63 barang awal + Ikan, Sayuran, Tepung');
const M2 = make(code); M2.run('nowDate_ = function () { return new Date("2026-10-15T03:00:00Z"); }');
M2.run('SpreadsheetApp.getActiveSpreadsheet().insertSheet("Barang")');
M2.sheets['Barang'].rows = [H11, ['x1', 't', 't', 'Ikan', 'Ikan', 'kg', '0', '2026-10-01', '1', 'TRUE', '']];
M2.run('setup()');
assert(!M2.call('apiData', M2.call('apiLogin', 'admin', M2.props.ADMIN_AWAL).session).barang.some(b => b.nama === 'Ikan'), 'contoh umum yang belum dipakai dihapus');
M.run('setup()'); assert.strictEqual(M.call('apiData', MA, '2026-10').barang.length, 66);
ok('migrasi versi pertama: kategori dipetakan, Beras->Beras Putih, Cabai->Cabe, kode diberikan, transaksi & stok tidak hilang');
console.log('\nSEMUA TES STOK LULUS');
