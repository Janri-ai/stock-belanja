// Backend: request belanja (nama bahan/barang saja).
const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const make = require('./gasmock.js');
const S = make(fs.readFileSync(P.CODE, 'utf8'));
const throws = (fn, re) => { try { fn(); } catch (e) { assert(re.test(e.message), 'pesan salah: ' + e.message); return; } assert.fail('harusnya error ' + re); };
const ok = m => console.log('ok  ' + m);
let now = '2026-10-15T03:00:00Z';
S.ctx.__now = () => new Date(now);
S.run('nowDate_ = function () { return __now(); }');
S.run('setup()');
assert.deepStrictEqual(S.sheets['Request'].rows[0], ['id', 'dibuat', 'nama', 'pembuat', 'namaPembuat', 'dibeli', 'dibeliOleh', 'dibeliPada', 'dihapus']);
const A = S.call('apiLogin', 'admin', S.props.ADMIN_AWAL).session;
S.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Siti Aminah', peran: 'user', password: 'sementara1' });
S.call('apiSaveUser', A, { isNew: true, username: 'budi', nama: 'Budi Santoso', peran: 'user', password: 'sementara2' });
const SS = S.call('apiLogin', 'siti', 'sementara1').session, BS = S.call('apiLogin', 'budi', 'sementara2').session;
const J = x => JSON.parse(JSON.stringify(x));

throws(() => S.call('apiAddRequest', SS, '   '), /Isi nama/);
throws(() => S.call('apiAddRequest', 'x'.repeat(64), 'Garam'), /SESI_HABIS/);
let list = J(S.call('apiAddRequest', SS, 'Bawang Merah'));
assert.strictEqual(list.length, 1); assert.strictEqual(list[0].namaPembuat, 'Siti Aminah'); assert.strictEqual(list[0].dibeli, false);
throws(() => S.call('apiAddRequest', BS, 'bawang merah'), /sudah ada di daftar request \(oleh Siti Aminah\)/);
S.call('apiAddRequest', BS, '=Kerupuk()');     // di luar daftar barang boleh
assert(S.sheets['Request'].rows.some(r => r[2] === '=Kerupuk()'), 'disimpan sebagai teks');
list = J(S.call('apiData', BS, '2026-10').requests);
assert.strictEqual(list.length, 2, 'semua pengguna melihat semua request (ikut apiData)');
assert(!JSON.stringify(list).match(/salt|hash/));
ok('tambah request: nama saja, nama pembuat dari akun, nama dobel yang belum dibeli ditolak, terlihat semua pengguna');

const bm = list.find(r => r.nama === 'Bawang Merah');
list = J(S.call('apiSetRequest', BS, bm.id, true));
const done = list.find(r => r.id === bm.id);
assert.strictEqual(done.dibeli, true); assert.strictEqual(done.dibeliOleh, 'Budi Santoso');
assert.strictEqual(list[list.length - 1].id, bm.id, 'yang sudah dibeli di bawah');
S.call('apiAddRequest', SS, 'Bawang Merah');   // sudah dibeli -> boleh diminta lagi
list = J(S.call('apiSetRequest', SS, bm.id, false));
assert.strictEqual(list.find(r => r.id === bm.id).dibeli, false);
S.call('apiSetRequest', SS, bm.id, true);
ok('centang sudah dibeli oleh siapa pun (mencatat pembeli), bisa dibatalkan; setelah dibeli boleh diminta lagi');

throws(() => S.call('apiDeleteRequest', BS, bm.id), /tidak berhak/);
const kr = J(S.call('apiData', A).requests).find(r => r.nama === '=Kerupuk()');
S.call('apiDeleteRequest', A, kr.id);
assert(!J(S.call('apiData', A).requests).some(r => r.id === kr.id));
throws(() => S.call('apiSetRequest', SS, kr.id, true), /tidak ditemukan/);
ok('hapus: hanya pembuat atau admin; yang terhapus tidak bisa diubah');

now = '2026-11-20T03:00:00Z';
list = J(S.call('apiData', SS).requests);
assert(!list.some(r => r.id === bm.id), 'sudah dibeli > 30 hari disembunyikan');
assert.strictEqual(list.filter(r => !r.dibeli).length, 1, 'yang belum dibeli tetap tampil');
ok('request yang sudah dibeli lebih dari 30 hari tidak ditampilkan lagi');
console.log('\nSEMUA TES REQUEST LULUS');
