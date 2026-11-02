const P = require('./paths.js');
const fs = require('fs'), assert = require('assert');
const make = require('./gasmock.js');
const code = fs.readFileSync(P.CODE, 'utf8');
const S = make(code);
const throws = (fn, re) => { try { fn(); } catch (e) { assert(re.test(e.message), 'pesan salah: ' + e.message); return; } assert.fail('harusnya error ' + re); };
const b64 = a => Buffer.from(a).toString('base64');
const JPG = b64([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]), PDF = b64(Buffer.from('%PDF-1.4 x')), EXE = b64(Buffer.from('MZ\x90 bad'));
const ok = m => console.log('ok  ' + m);

// ---- setup
S.run('setup()');
assert(S.props.ADMIN_AWAL && S.props.FOLDER_ID, 'setup membuat admin awal & folder');
assert.strictEqual(S.sheets['Pengguna'].rows.length, 2);
assert(!S.sheets['Pengguna'].rows[1].includes(S.props.ADMIN_AWAL), 'password tidak disimpan sebagai teks asli');
S.run('setup()'); assert.strictEqual(S.sheets['Pengguna'].rows.length, 2); ok('setup: admin awal dibuat, password ter-hash, setup ulang aman');

// format lama berisi data -> ditolak
const S2 = make(code); S2.run('SpreadsheetApp.getActiveSpreadsheet().insertSheet("Mutasi")');
S2.sheets['Mutasi'].rows = [['id', 'dibuat', 'diperbarui', 'tanggal', 'judul'], ['x']];
throws(() => S2.run('setup()'), /format lama/);
const S3 = make(code); S3.run('SpreadsheetApp.getActiveSpreadsheet().insertSheet("Mutasi")');
S3.sheets['Mutasi'].rows = [['id', 'dibuat', 'diperbarui', 'tanggal', 'judul']];
S3.run('setup()'); assert.strictEqual(S3.sheets['Mutasi'].rows[0][4], 'barangId');
const S4 = make(code); S4.run('SpreadsheetApp.getActiveSpreadsheet().insertSheet("Pengguna")');
S4.sheets['Pengguna'].rows = [['username', 'nama', 'peran']];
S4.run('setup()'); assert.strictEqual(S4.sheets['Pengguna'].rows[0][7], 'dibuat'); assert.strictEqual(S4.sheets['Pengguna'].rows.length, 2);
ok('setup: tab format lama berisi data ditolak; tab kosong/kolom kurang dimigrasi tanpa hapus data');

// ---- login
throws(() => S.call('apiLogin', 'admin', 'salah'), /salah/);
throws(() => S.call('apiLogin', 'tidakada', 'x'), /Username atau password salah/);
const adm = S.call('apiLogin', 'ADMIN', S.props.ADMIN_AWAL);   // username tidak peka huruf besar
assert(adm.session.length === 64 && adm.user.peran === 'admin' && adm.user.wajibGanti === true);
assert(!JSON.stringify(adm).includes('hash'), 'tidak membocorkan hash');
const A = adm.session;
ok('login: salah ditolak (pesan sama untuk username tak ada), benar diterima, wajib ganti password');

// lockout
const SL = make(code); SL.run('setup()');
for (let i = 0; i < 5; i++) throws(() => SL.call('apiLogin', 'admin', 'salah'), /salah/);
throws(() => SL.call('apiLogin', 'admin', SL.props.ADMIN_AWAL), /dikunci/);
ok('login: akun terkunci setelah 5 kali salah (bahkan dengan password benar)');

// sesi
assert.strictEqual(S.call('apiMe', A).username, 'admin');
assert.strictEqual(S.call('apiMe', 'x'.repeat(64)), null);
throws(() => S.call('apiData', 'x'.repeat(64)), /SESI_HABIS/);
throws(() => S.call('apiData', ''), /SESI_HABIS/);
ok('sesi: valid dikenali; palsu/kosong ditolak');

// ---- ganti password
throws(() => S.call('apiChangePassword', A, 'salah', 'passwordbaru1'), /lama salah/);
throws(() => S.call('apiChangePassword', A, S.props.ADMIN_AWAL, 'pendek'), /minimal 8/);
const awal = S.props.ADMIN_AWAL;
S.call('apiChangePassword', A, awal, 'AdminBaru#2026');
assert(!S.props.ADMIN_AWAL, 'ADMIN_AWAL dihapus setelah diganti');
throws(() => S.call('apiLogin', 'admin', awal), /salah/);
assert.strictEqual(S.call('apiLogin', 'admin', 'AdminBaru#2026').user.wajibGanti, false);
ok('ganti password: validasi, password lama tidak lagi berlaku, ADMIN_AWAL dihapus');

// ---- kelola pengguna
throws(() => S.call('apiUsers', A) && 0 || S.call('apiSaveUser', A, { isNew: true, username: 'Bad Name', nama: 'x', password: '12345678' }), /Username 3-30/);
throws(() => S.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Siti', password: 'pendek' }), /minimal 8/);
S.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Siti Aminah', peran: 'user', password: 'sementara1' });
S.call('apiSaveUser', A, { isNew: true, username: 'budi', nama: 'Budi Santoso', peran: 'user', password: 'sementara2' });
throws(() => S.call('apiSaveUser', A, { isNew: true, username: 'siti', nama: 'Dobel', password: 'sementara1' }), /sudah dipakai/);
const users = S.call('apiUsers', A); assert.strictEqual(users.length, 3);
assert(!JSON.stringify(users).includes('salt') && !JSON.stringify(users).includes('hash'));
const siti = S.call('apiLogin', 'siti', 'sementara1'), budi = S.call('apiLogin', 'budi', 'sementara2');
assert.strictEqual(siti.user.wajibGanti, true);
throws(() => S.call('apiUsers', siti.session), /Hanya admin/);
throws(() => S.call('apiSaveUser', siti.session, { isNew: true, username: 'hack', nama: 'H', password: 'xxxxxxxx' }), /Hanya admin/);
throws(() => S.call('apiSaveUser', A, { username: 'admin', nama: 'Administrator', peran: 'user', aktif: true }), /tidak dapat/);
throws(() => S.call('apiSaveUser', A, { username: 'admin', nama: 'Administrator', peran: 'admin', aktif: false }), /tidak dapat/);
assert(!JSON.stringify(users).includes('hp'));
ok('kelola pengguna: validasi, duplikat, hanya admin, admin tak bisa menonaktifkan/menurunkan diri sendiri');
const SS = siti.session, BS = budi.session;

// ---- reset password & nonaktif
S.call('apiSaveUser', A, { username: 'budi', nama: 'Budi Santoso', peran: 'user', aktif: true, password: 'reset12345' });
assert.strictEqual(S.call('apiLogin', 'budi', 'reset12345').user.wajibGanti, true);
throws(() => S.call('apiLogin', 'budi', 'sementara2'), /salah/);
S.call('apiSaveUser', A, { username: 'budi', nama: 'Budi Santoso', peran: 'user', aktif: false });
throws(() => S.call('apiData', BS), /SESI_HABIS/);
throws(() => S.call('apiLogin', 'budi', 'reset12345'), /salah/);
ok('reset password & nonaktifkan akun: sesi lama langsung tidak berlaku, tidak bisa login');

// logout
S.call('apiLogout', SS); throws(() => S.call('apiData', SS), /SESI_HABIS/);
ok('logout menghapus sesi');

// throttle
const brg = S.call('apiData', A).barang[0];
S.cacheData['w_admin'] = '60';
throws(() => S.call('apiSaveMutasi', A, { tanggal: S.call('apiData', A).hariIni, barangId: brg.id, jenis: 'MASUK', qty: '1' }), /Terlalu banyak/);
ok('batas aktivitas per pengguna');
console.log('\nSEMUA TES BACKEND AKUN LULUS');
