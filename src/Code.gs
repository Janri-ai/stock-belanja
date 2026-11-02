/**
 * STOCK & BELANJA DAPUR — Backend (Google Apps Script) dengan LOGIN
 *
 * Konsep seperti buku kas, tetapi per jenis barang:
 *   Saldo awal  +  Masuk (belanja)  −  Keluar (pemakaian)  =  Saldo akhir
 *
 * Cara pakai singkat:
 *  1. Google Sheet baru > Extensions > Apps Script. Tempel file ini ke Code.gs dan
 *     Index.html ke file HTML bernama "Index".
 *  2. Jalankan fungsi setup() SEKALI (membuat tab Barang, Mutasi, Pengguna, folder struk, akun admin).
 *  3. Lihat password awal akun "admin" di: Project Settings > Script Properties > ADMIN_AWAL
 *  4. Deploy > New deployment > Web app (Execute as: Me | Who has access: Anyone).
 *     Perubahan berikutnya: Deploy > Manage deployments > ikon pensil > Version: New version.
 *
 * Model keamanan:
 *  - Semua data hanya bisa diakses setelah login (username + password).
 *  - Peran "admin": mengelola daftar barang & stok awal, mengubah semua transaksi, mengelola akun.
 *  - Peran "user": melihat stok & semua transaksi, mencatat masuk/keluar, mengubah transaksi miliknya.
 *  - Password disimpan sebagai hash bergaram (bukan teks asli). Sesi tersimpan di cache server.
 *  - JANGAN bagikan Google Sheet-nya: tab "Pengguna" berisi hash password.
 */

var APP_TITLE = 'Stock & Belanja Dapur';   // judul di tab browser (samakan dengan APP_TITLE di Index.html)

var CONFIG = {
  SHEET_BARANG: 'Barang',
  SHEET_MUTASI: 'Mutasi',
  SHEET_USER: 'Pengguna',
  SHEET_REQUEST: 'Request',
  REQUEST_DONE_DAYS: 30,              // request yang sudah dibeli tetap tampil selama 30 hari
  FOLDER_NAME: 'Struk Belanja',
  MAX_FILES_PER_TRX: 3,
  MAX_FILE_BYTES: 5 * 1024 * 1024,    // 5 MB per file
  MAX_WRITES_PER_10_MIN: 60,          // batas tulis per pengguna
  LOGIN_MAX_FAILS: 5,                 // salah password berapa kali sebelum dikunci
  LOGIN_LOCK_SECONDS: 900,            // lama kunci akun (detik)
  SESSION_SECONDS: 21600,             // sesi 6 jam sejak aktivitas terakhir (batas maksimum cache)
  HASH_ROUNDS: 500,                   // jumlah putaran hash password
  MIN_PASSWORD: 8,
  MAX_QTY: 1000000,                   // jumlah maksimum per transaksi
  MAX_RP: 10000000000,                // nilai belanja maksimum per transaksi (Rp)
  TZ: 'Asia/Jakarta',                 // zona waktu "hari ini". Ganti 'Asia/Makassar' untuk WITA

  // Kelompok barang: [kode, nama]. Kode barang = kode kelompok + nomor urut, mis. 01.001
  KELOMPOK: [
    ['01', 'Sembako'],
    ['02', 'Bumbu'],
    ['03', 'Lauk Pauk'],
    ['04', 'Sayur-sayuran'],
    ['05', 'Buah-buahan'],
    ['06', 'Alat Kebersihan'],
    ['07', 'Perlengkapan Mandi'],
    ['08', 'Lain-lain']
  ],

  // Daftar barang awal per kelompok: [nama, satuan, stok minimum]. Stok awal 0, bisa diubah admin.
  // setup() menambahkan yang belum ada (berdasarkan nama) tanpa mengubah barang yang sudah ada.
  BARANG_AWAL: {
    'Sembako': [
      ['Beras Putih', 'kg', 10], ['Beras Merah/Coklat', 'kg', 2], ['Ubi', 'kg', 1], ['Jagung', 'kg', 1],
      ['Gula Pasir', 'kg', 2], ['Minyak Goreng', 'liter', 2], ['Susu Besar', 'kaleng', 1], ['Susu Kecil', 'kotak', 5],
      ['Air Galon', 'galon', 2], ['Gas Elpiji', 'tabung', 1]
    ],
    'Bumbu': [
      ['Garam', 'bungkus', 1], ['Bawang Merah', 'kg', 0.5], ['Bawang Putih', 'kg', 0.5], ['Bawang Bombay', 'kg', 0.25],
      ['Jahe', 'kg', 0.25], ['Cabe', 'kg', 0.25], ['Merica', 'bungkus', 1], ['Ketumbar', 'bungkus', 1],
      ['Cabe Merah', 'kg', 0.25], ['Cabe Hijau', 'kg', 0.25], ['Cabe Rawit', 'kg', 0.25],
      ['Kecap Asin', 'botol', 1], ['Kecap Manis', 'botol', 1], ['Margarin/Mentega', 'pcs', 1]
    ],
    'Lauk Pauk': [
      ['Daging Babi', 'kg', 1], ['Daging Sapi', 'kg', 1], ['Daging Ayam', 'kg', 1], ['Ikan Teri', 'kg', 0.25],
      ['Ikan Kembung', 'kg', 1], ['Ikan Gabus', 'kg', 1], ['Tempe', 'papan', 2], ['Tahu', 'pcs', 5],
      ['Telur Ayam', 'butir', 10], ['Telur Bebek', 'butir', 5], ['Telur Puyuh', 'butir', 10]
    ],
    'Sayur-sayuran': [
      ['Tomat', 'kg', 0.5], ['Kangkung', 'ikat', 2], ['Pare', 'kg', 0.5], ['Bayam', 'ikat', 2],
      ['Sawi Putih', 'kg', 0.5], ['Kol', 'kg', 0.5], ['Daun Bawang', 'ikat', 1]
    ],
    'Buah-buahan': [
      ['Alpukat', 'kg', 0.5], ['Apel', 'kg', 0.5], ['Mangga', 'kg', 0.5], ['Pir', 'kg', 0.5],
      ['Salak', 'kg', 0.5], ['Lemon', 'buah', 2]
    ],
    'Alat Kebersihan': [
      ['Sabun Cuci Piring', 'pcs', 2], ['Spons Cuci Piring', 'pcs', 2], ['Sikat Lantai', 'pcs', 1],
      ['Pewangi Pakaian', 'pcs', 1], ['Deterjen', 'bungkus', 1], ['Pembersih Lantai', 'botol', 1], ['Tisu', 'pak', 2]
    ],
    'Perlengkapan Mandi': [
      ['Sabun Mandi', 'pcs', 3], ['Shampo', 'botol', 1], ['Sikat Gigi', 'pcs', 2], ['Pasta Gigi', 'pcs', 2],
      ['Pembersih Wajah', 'pcs', 1]
    ],
    'Lain-lain': [
      ['Sapu', 'pcs', 1], ['Serokan', 'pcs', 1], ['Plastik Sampah', 'pak', 1]
    ]
  }
};
CONFIG.KATEGORI = CONFIG.KELOMPOK.map(function (k) { return k[1]; });

// Migrasi dari versi pertama (kategori Beras/Minyak/Ikan/... dan 9 barang contoh)
var KATEGORI_LAMA_ = { 'Beras': 'Sembako', 'Minyak': 'Sembako', 'Ikan': 'Lauk Pauk', 'Sayuran': 'Sayur-sayuran',
                       'Sabun': 'Alat Kebersihan', 'Lainnya': 'Lain-lain' };
var NAMA_LAMA_ = { 'beras': 'Beras Putih', 'cabai': 'Cabe' };
var CONTOH_UMUM_ = ['ikan', 'sayuran'];   // barang contoh lama yang terlalu umum: dihapus bila belum dipakai

var H_BRG = ['id', 'dibuat', 'diperbarui', 'nama', 'kategori', 'satuan', 'stokAwal', 'tglAwal', 'minStok', 'aktif', 'dihapus', 'kode'];
var H_MUT = ['id', 'dibuat', 'diperbarui', 'tanggal', 'barangId', 'jenis', 'qty', 'nilai',
             'keterangan', 'pembuat', 'nama', 'lampiran', 'dihapus', 'alasan'];
var H_USR = ['username', 'nama', 'peran', 'salt', 'hash', 'aktif', 'wajibGanti', 'dibuat'];
var H_REQ = ['id', 'dibuat', 'nama', 'pembuat', 'namaPembuat', 'dibeli', 'dibeliOleh', 'dibeliPada', 'dihapus'];

/* ------------------------------------------------------------------ */
/*  SETUP (jalankan sekali dari editor)                                */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Buka Apps Script lewat menu Extensions > Apps Script dari dalam Google Sheet.');
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());

  var bs = prepSheet_(ss, CONFIG.SHEET_BARANG, H_BRG);
  prepSheet_(ss, CONFIG.SHEET_MUTASI, H_MUT);
  prepSheet_(ss, CONFIG.SHEET_REQUEST, H_REQ);
  var us = prepSheet_(ss, CONFIG.SHEET_USER, H_USR);

  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder(CONFIG.FOLDER_NAME).getId());
  }

  syncBarang_(bs);

  if (us.getLastRow() < 2) {
    var pw = randomToken_(12);
    appendUser_(us, 'admin', 'Administrator', 'admin', pw, true);
    props.setProperty('ADMIN_AWAL', pw);
  }
  Logger.log('Setup selesai. Password awal akun "admin": Project Settings > Script Properties > ADMIN_AWAL');
}

/**
 * Rapikan daftar barang (aman dijalankan berulang, tidak menghapus transaksi):
 *  1. kategori lama dipetakan ke kelompok baru; nama contoh lama diganti (Beras -> Beras Putih);
 *  2. barang contoh lama yang terlalu umum (Ikan, Sayuran) dihapus bila belum punya transaksi & stok awal 0;
 *  3. barang di BARANG_AWAL yang belum ada ditambahkan;
 *  4. barang tanpa kode (atau kodenya bukan dari kelompoknya) diberi kode baru.
 */
function syncBarang_(bs) {
  var now = nowIso_(), tgl = today_();
  var rows = readAll_(bs, H_BRG).filter(function (o) { return o.id; });
  var used = {};
  readMutasi_().forEach(function (m) { used[m.barangId] = true; });
  var names = {};
  rows.forEach(function (b) { names[b.nama.toLowerCase()] = true; });

  rows.forEach(function (b) {
    if (b.dihapus === 'TRUE') return;
    var key = b.nama.toLowerCase(), nama = b.nama, kat = b.kategori;
    var hapus = CONTOH_UMUM_.indexOf(key) !== -1 && !used[b.id] && num_(b.stokAwal) === 0;
    if (NAMA_LAMA_[key] && !names[NAMA_LAMA_[key].toLowerCase()]) {
      nama = NAMA_LAMA_[key];
      names[nama.toLowerCase()] = true;
    }
    if (CONFIG.KATEGORI.indexOf(kat) === -1) kat = KATEGORI_LAMA_[kat] || 'Lain-lain';
    if (nama !== b.nama || kat !== b.kategori) {
      bs.getRange(b._row, 4, 1, 2).setNumberFormat('@').setValues([[nama, kat]]);
      b.nama = nama; b.kategori = kat;
    }
    if (hapus) { bs.getRange(b._row, 11).setNumberFormat('@').setValue('TRUE'); b.dihapus = 'TRUE'; }
  });

  var add = [], urut = {}, n = 0;
  CONFIG.KELOMPOK.forEach(function (k) {
    (CONFIG.BARANG_AWAL[k[1]] || []).forEach(function (a) {
      urut[a[0].toLowerCase()] = n++;
      if (names[a[0].toLowerCase()]) return;
      names[a[0].toLowerCase()] = true;
      add.push([Utilities.getUuid(), now, now, a[0], k[1], a[1], '0', tgl, String(a[2]), 'TRUE', '', '']);
    });
  });
  if (add.length) bs.getRange(bs.getLastRow() + 1, 1, add.length, H_BRG.length).setNumberFormat('@').setValues(add);

  // kode: barang awal mengikuti urutan daftar, barang lain sesudahnya (urut nama)
  var all = readAll_(bs, H_BRG).filter(function (o) { return o.id; });
  var live = all.filter(function (o) { return o.dihapus !== 'TRUE'; });
  live.sort(function (a, b) {
    var ua = urut[a.nama.toLowerCase()], ub = urut[b.nama.toLowerCase()];
    return (ua === undefined ? 1e6 : ua) - (ub === undefined ? 1e6 : ub) || a.nama.localeCompare(b.nama);
  });
  live.forEach(function (b) {
    if (kodeCocok_(b.kode, b.kategori)) return;
    b.kode = nextKode_(b.kategori, all);
    bs.getRange(b._row, 12).setNumberFormat('@').setValue(b.kode);
  });
}

function kodeKelompok_(kat) {
  for (var i = 0; i < CONFIG.KELOMPOK.length; i++) if (CONFIG.KELOMPOK[i][1] === kat) return CONFIG.KELOMPOK[i][0];
  return '99';
}
function kodeCocok_(kode, kat) { return new RegExp('^' + kodeKelompok_(kat) + '\\.\\d{3}$').test(String(kode || '')); }

/** Kode berikutnya dalam kelompok, mis. 01.011. `all` = semua baris barang (termasuk yang dihapus, agar kode tidak dipakai ulang). */
function nextKode_(kat, all) {
  var pre = kodeKelompok_(kat), max = 0;
  all.forEach(function (b) {
    var m = /^(\d{2})\.(\d{3})$/.exec(String(b.kode || ''));
    if (m && m[1] === pre) max = Math.max(max, Number(m[2]));
  });
  return pre + '.' + ('00' + (max + 1)).slice(-3);
}

function prepSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var last = sh.getLastRow();
  var cur = last >= 1 ? sh.getRange(1, 1, 1, headers.length).getValues()[0].map(String) : [];
  var same = true, additive = cur.length > 0 && cur[0] === headers[0];
  for (var i = 0; i < headers.length; i++) {
    if (cur[i] !== headers[i]) same = false;
    if (cur[i] !== headers[i] && cur[i] !== '') additive = false;   // kolom lama sama, kolom baru masih kosong
  }
  // Migrasi aditif: data TIDAK dihapus, hanya judul kolom baru ditambahkan.
  if (!same && !additive) {
    if (last > 1) {
      throw new Error('Tab "' + name + '" berisi data dengan format lama. Hapus tab itu, lalu jalankan setup() lagi.');
    }
    sh.clear();
    sh.showColumns(1, sh.getMaxColumns());
  }
  // Format teks agar isi sel tidak pernah dianggap rumus (cegah formula injection)
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* ------------------------------------------------------------------ */
/*  Halaman                                                            */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) // izinkan dimuat di halaman pembungkus (menyembunyikan banner Google)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/*  API: akun & sesi                                                   */
/* ------------------------------------------------------------------ */

function apiLogin(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  var GENERIC = 'Username atau password salah.';
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || !password || password.length > 200) throw new Error(GENERIC);

  var cache = CacheService.getScriptCache();
  var key = 'lf_' + username;
  var fails = Number(cache.get(key) || 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILS) {
    throw new Error('Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi sekitar 15 menit lagi.');
  }
  var rec = findUser_(username);
  var calc = hashPw_(rec ? rec.salt : 'garam-palsu-agar-waktu-sama', password); // selalu dihitung
  var good = !!rec && rec.aktif === 'TRUE' && safeEqual_(calc, rec.hash);
  if (!good) {
    cache.put(key, String(fails + 1), CONFIG.LOGIN_LOCK_SECONDS);
    throw new Error(GENERIC);
  }
  cache.remove(key);
  return { session: newSession_(rec.username), user: publicUser_(rec) };
}

function apiLogout(session) {
  if (session) CacheService.getScriptCache().remove('ses_' + String(session));
  return true;
}

/** Cek sesi tersimpan di browser. Mengembalikan data pengguna atau null (tidak melempar error). */
function apiMe(session) {
  try { return publicUser_(requireUser_(session)); } catch (e) { return null; }
}

function apiChangePassword(session, oldPw, newPw) {
  var u = requireUser_(session);
  oldPw = String(oldPw || '');
  newPw = String(newPw || '');
  var cache = CacheService.getScriptCache();
  var key = 'lf_' + u.username;
  var fails = Number(cache.get(key) || 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILS) {
    throw new Error('Terlalu banyak percobaan. Coba lagi sekitar 15 menit lagi.');
  }
  if (!safeEqual_(hashPw_(u.salt, oldPw), u.hash)) {
    cache.put(key, String(fails + 1), CONFIG.LOGIN_LOCK_SECONDS);
    throw new Error('Password lama salah.');
  }
  cache.remove(key);
  checkPw_(newPw);
  if (newPw === oldPw) throw new Error('Password baru harus berbeda dari password lama.');

  withLock_(function () {
    var sh = sheetUsr_();
    var cur = findUser_(u.username);
    var salt = randomToken_(32);
    // kolom 4..7 = salt, hash, aktif, wajibGanti
    sh.getRange(cur._row, 4, 1, 4).setNumberFormat('@')
      .setValues([[salt, hashPw_(salt, newPw), cur.aktif, 'FALSE']]);
  });
  if (u.username === 'admin') PropertiesService.getScriptProperties().deleteProperty('ADMIN_AWAL');
  return true;
}

/* ------------------------------------------------------------------ */
/*  API: kelola pengguna (khusus admin)                                */
/* ------------------------------------------------------------------ */

function apiUsers(session) {
  requireAdmin_(session);
  return listUsers_();
}

/**
 * Tambah pengguna (data.isNew = true) atau ubah pengguna.
 * data = { username, nama, peran: 'admin'|'user', aktif: bool, password?, isNew? }
 * Password yang diisi admin bersifat sementara: pengguna wajib menggantinya saat login pertama.
 */
function apiSaveUser(session, data) {
  var me = requireAdmin_(session);
  data = data || {};
  var username = String(data.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('Username 3-30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.');
  }
  var nama = clean_(data.nama, 60);
  if (!nama) throw new Error('Nama wajib diisi.');
  var peran = data.peran === 'admin' ? 'admin' : 'user';
  var pw = String(data.password || '');

  return withLock_(function () {
    var sh = sheetUsr_();
    var cur = findUser_(username);
    if (data.isNew) {
      if (cur) throw new Error('Username sudah dipakai.');
      checkPw_(pw);
      appendUser_(sh, username, nama, peran, pw, true);
    } else {
      if (!cur) throw new Error('Pengguna tidak ditemukan.');
      var aktif = data.aktif === false ? 'FALSE' : 'TRUE';
      if (username === me.username && (aktif !== 'TRUE' || peran !== 'admin')) {
        throw new Error('Anda tidak dapat menonaktifkan akun sendiri atau menurunkan peran sendiri.');
      }
      var salt = cur.salt, hash = cur.hash, ganti = cur.wajibGanti;
      if (pw) {
        checkPw_(pw);
        salt = randomToken_(32);
        hash = hashPw_(salt, pw);
        ganti = 'TRUE';
      }
      // kolom 2..7 = nama, peran, salt, hash, aktif, wajibGanti
      sh.getRange(cur._row, 2, 1, 6).setNumberFormat('@')
        .setValues([[nama, peran, salt, hash, aktif, ganti]]);
    }
    return listUsers_();
  });
}

/* ------------------------------------------------------------------ */
/*  API: stok (rekap per periode)                                      */
/* ------------------------------------------------------------------ */

/**
 * Semua data untuk satu layar: rekap stok per barang dan daftar transaksi pada bulan `ym` (yyyy-MM).
 * Per barang:  awal = stokAwal + (masuk − keluar sebelum bulan ini)
 *              saldo = awal + masuk bulan ini − keluar bulan ini
 *              kini  = saldo per hari ini (dipakai untuk peringatan stok minimum)
 * Barang yang tanggal stok awalnya sesudah bulan itu ditandai `mulai: false` (belum tercatat).
 */
function apiData(session, ym) {
  requireUser_(session);
  var hariIni = today_();
  ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || '')) ? String(ym) : hariIni.slice(0, 7);
  var start = ym + '-01', end = ym + '-31';   // perbandingan teks yyyy-MM-dd

  var brg = readBarang_();
  var byId = {};
  brg.forEach(function (b) { byId[b.id] = b; });
  var mut = readMutasi_();

  var sum = {};
  brg.forEach(function (b) { sum[b.id] = { sebelum: 0, masuk: 0, keluar: 0, rusak: 0, semua: 0, belanja: 0, trx: 0 }; });
  var list = [], totalRusak = 0;
  mut.forEach(function (m) {
    var s = sum[m.barangId];
    if (!s) return;
    var q = num_(m.qty), sign = m.jenis === 'MASUK' ? 1 : -1;
    s.semua += sign * q;
    if (m.tanggal < start) s.sebelum += sign * q;
    else if (m.tanggal <= end) {
      s.trx++;
      if (sign > 0) { s.masuk += q; s.belanja += num_(m.nilai); } else s.keluar += q;
      if (m.alasan) { s.rusak += q; totalRusak++; }
      list.push(mutPublic_(m, byId[m.barangId]));
    }
  });

  var totalBelanja = 0;
  var barang = brg.map(function (b) {
    var s = sum[b.id], awal0 = num_(b.stokAwal), mulai = b.tglAwal <= end;
    var awal = mulai ? r3_(awal0 + s.sebelum) : 0;
    totalBelanja += s.belanja;
    return {
      id: b.id, kode: b.kode, nama: b.nama, kategori: b.kategori, satuan: b.satuan,
      stokAwal: awal0, tglAwal: b.tglAwal, minStok: num_(b.minStok), aktif: b.aktif === 'TRUE',
      mulai: mulai, awal: awal, masuk: r3_(s.masuk), keluar: r3_(s.keluar),
      saldo: mulai ? r3_(awal + s.masuk - s.keluar) : 0,
      kini: r3_(awal0 + s.semua), belanja: s.belanja, trx: s.trx, rusak: r3_(s.rusak)
    };
  });
  barang.sort(function (a, b) {
    return kategoriIdx_(a.kategori) - kategoriIdx_(b.kategori) || String(a.kode).localeCompare(String(b.kode)) || a.nama.localeCompare(b.nama);
  });
  list.sort(function (a, b) {
    return b.tanggal.localeCompare(a.tanggal) || String(b.dibuat).localeCompare(String(a.dibuat));
  });

  return { periode: ym, hariIni: hariIni, kategori: CONFIG.KATEGORI, kelompok: CONFIG.KELOMPOK, barang: barang, totalRusak: totalRusak, mutasi: list, totalBelanja: totalBelanja,
           requests: listRequests_() };
}

/* ------------------------------------------------------------------ */
/*  API: daftar barang (khusus admin)                                  */
/* ------------------------------------------------------------------ */

/**
 * Tambah barang (data.id kosong) atau ubah barang.
 * data = { id?, nama, kategori, satuan, stokAwal, tglAwal (yyyy-MM-dd), minStok, aktif }
 * Kode barang dibuat otomatis (kode kelompok + nomor urut) dan berganti bila kelompoknya diubah.
 */
function apiSaveBarang(session, data) {
  requireAdmin_(session);
  data = data || {};
  var rec = {
    nama: clean_(data.nama, 60),
    kategori: String(data.kategori || ''),
    satuan: clean_(data.satuan, 15),
    stokAwal: parseQty_(data.stokAwal, 'Stok awal', true),
    tglAwal: clean_(data.tglAwal, 10),
    minStok: parseQty_(data.minStok, 'Stok minimum', true),
    aktif: data.aktif === false ? 'FALSE' : 'TRUE'
  };
  if (!rec.nama) throw new Error('Nama barang wajib diisi.');
  if (CONFIG.KATEGORI.indexOf(rec.kategori) === -1) throw new Error('Kategori tidak valid.');
  if (!rec.satuan) throw new Error('Satuan wajib diisi (mis. kg, liter, pcs).');
  if (!isDate_(rec.tglAwal)) throw new Error('Tanggal stok awal tidak valid.');
  if (rec.tglAwal > today_()) throw new Error('Tanggal stok awal tidak boleh melebihi hari ini.');

  return withLock_(function () {
    var sh = sheetBrg_();
    var all = readBarang_();
    var key = rec.nama.toLowerCase();
    var dup = all.filter(function (b) { return b.nama.toLowerCase() === key && b.id !== String(data.id || ''); });
    if (dup.length) throw new Error('Barang "' + rec.nama + '" sudah ada.');
    var now = nowIso_();

    if (!data.id) {
      var kode = nextKode_(rec.kategori, readAll_(sh, H_BRG));
      var row = [Utilities.getUuid(), now, now, rec.nama, rec.kategori, rec.satuan, String(rec.stokAwal),
                 rec.tglAwal, String(rec.minStok), 'TRUE', '', kode];
      sh.getRange(sh.getLastRow() + 1, 1, 1, H_BRG.length).setNumberFormat('@').setValues([row]);
      return { id: row[0], kode: kode };
    }

    var cur = findById_(all, data.id);
    if (!cur) throw new Error('Barang tidak ditemukan.');
    var mine = readMutasi_().filter(function (m) { return m.barangId === cur.id; });
    var early = mine.filter(function (m) { return m.tanggal < rec.tglAwal; })[0];
    if (early) {
      throw new Error('Sudah ada transaksi tanggal ' + early.tanggal + '. Tanggal stok awal harus sama atau sebelum transaksi pertama.');
    }
    var test = { nama: rec.nama, satuan: rec.satuan, stokAwal: String(rec.stokAwal) };
    checkSaldo_(test, mine);
    // kolom 3..10 = diperbarui, nama, kategori, satuan, stokAwal, tglAwal, minStok, aktif
    sh.getRange(cur._row, 3, 1, 8).setNumberFormat('@').setValues([[now, rec.nama, rec.kategori, rec.satuan,
      String(rec.stokAwal), rec.tglAwal, String(rec.minStok), rec.aktif]]);
    // pindah kelompok -> kode baru di kelompok tujuan
    var kodeBaru = kodeCocok_(cur.kode, rec.kategori) ? cur.kode : nextKode_(rec.kategori, readAll_(sh, H_BRG));
    if (kodeBaru !== cur.kode) sh.getRange(cur._row, 12).setNumberFormat('@').setValue(kodeBaru);
    return { id: cur.id, kode: kodeBaru };
  });
}

/** Hapus barang hanya bila belum punya transaksi. Yang sudah punya transaksi: nonaktifkan saja. */
function apiDeleteBarang(session, id) {
  requireAdmin_(session);
  return withLock_(function () {
    var cur = findById_(readBarang_(), id);
    if (!cur) throw new Error('Barang tidak ditemukan.');
    var used = readMutasi_().some(function (m) { return m.barangId === cur.id; });
    if (used) throw new Error('Barang ini sudah punya transaksi sehingga tidak bisa dihapus. Hilangkan centang "Aktif" untuk menyembunyikannya dari pilihan.');
    sheetBrg_().getRange(cur._row, 11).setNumberFormat('@').setValue('TRUE');
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  API: transaksi masuk / keluar                                      */
/* ------------------------------------------------------------------ */

/**
 * Catat transaksi (data.id kosong) atau ubah transaksi (data.id terisi).
 * data = { id?, tanggal, barangId, jenis: 'MASUK'|'KELUAR', qty, nilai (Rp, hanya MASUK), keterangan,
 *          alasan: ''|'RUSAK'|'EXPIRED' (hanya KELUAR; barang rusak/expired) }
 * Ditolak bila membuat saldo barang menjadi minus pada tanggal mana pun.
 */
function apiSaveMutasi(session, data) {
  var u = requireUser_(session);
  data = data || {};
  var jenis = data.jenis === 'MASUK' ? 'MASUK' : data.jenis === 'KELUAR' ? 'KELUAR' : '';
  if (!jenis) throw new Error('Pilih jenis transaksi: Masuk atau Keluar.');
  // Barang keluar karena rusak/expired: jenis KELUAR dengan alasan RUSAK atau EXPIRED (kosong = dipakai biasa)
  var alasan = String(data.alasan || '');
  if (alasan && (jenis !== 'KELUAR' || ['RUSAK', 'EXPIRED'].indexOf(alasan) === -1)) {
    throw new Error('Pilih kondisi barang: Rusak atau Expired.');
  }
  var rec = {
    tanggal: clean_(data.tanggal, 10),
    barangId: String(data.barangId || ''),
    jenis: jenis,
    qty: parseQty_(data.qty, 'Jumlah', false),
    nilai: jenis === 'MASUK' ? parseRp_(data.nilai) : 0,
    keterangan: clean_(data.keterangan, 300),
    alasan: alasan
  };
  if (!isDate_(rec.tanggal)) throw new Error('Tanggal tidak valid.');
  if (rec.tanggal > today_()) throw new Error('Tanggal tidak boleh melebihi hari ini.');

  return withLock_(function () {
    var sh = sheetMut_();
    var brg = readBarang_();
    var b = findById_(brg, rec.barangId);
    if (!b) throw new Error('Pilih barang.');
    if (rec.tanggal < b.tglAwal) {
      throw new Error('Tanggal sebelum tanggal stok awal ' + b.nama + ' (' + b.tglAwal + ').');
    }
    var all = readMutasi_();
    var now = nowIso_();

    if (!data.id) {
      if (b.aktif !== 'TRUE') throw new Error('Barang ' + b.nama + ' sudah tidak aktif.');
      throttle_(u.username);
      var row = [Utilities.getUuid(), now, now, rec.tanggal, b.id, rec.jenis, String(rec.qty), String(rec.nilai),
                 rec.keterangan, u.username, u.nama, '[]', '', rec.alasan];
      var obj = toObj_(row, 0, H_MUT);
      checkSaldo_(b, all.filter(function (m) { return m.barangId === b.id; }).concat([obj]));
      var r = sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, H_MUT.length).setNumberFormat('@').setValues([row]);
      return { mutasi: mutPublic_(obj, b) };
    }

    var found = findById_(all, data.id);
    if (!found || !canEdit_(u, found)) {
      throw new Error('Transaksi tidak ditemukan atau Anda tidak berhak mengubahnya.');
    }
    if (found.barangId !== b.id && b.aktif !== 'TRUE') throw new Error('Barang ' + b.nama + ' sudah tidak aktif.');
    var next = {};
    Object.keys(found).forEach(function (k) { next[k] = found[k]; });
    next.tanggal = rec.tanggal; next.barangId = b.id; next.jenis = rec.jenis;
    next.qty = String(rec.qty); next.nilai = String(rec.nilai); next.keterangan = rec.keterangan; next.alasan = rec.alasan; next.diperbarui = now;
    var others = all.filter(function (m) { return m.id !== found.id; });
    checkSaldo_(b, others.filter(function (m) { return m.barangId === b.id; }).concat([next]));
    if (found.barangId !== b.id) {
      var old = findById_(brg, found.barangId);
      if (old) checkSaldo_(old, others.filter(function (m) { return m.barangId === old.id; }));
    }
    // kolom 3..9 = diperbarui, tanggal, barangId, jenis, qty, nilai, keterangan
    sh.getRange(found._row, 3, 1, 7).setNumberFormat('@')
      .setValues([[now, next.tanggal, next.barangId, next.jenis, next.qty, next.nilai, next.keterangan]]);
    sh.getRange(found._row, 14).setNumberFormat('@').setValue(next.alasan);   // kolom 14 = alasan
    return { mutasi: mutPublic_(next, b) };
  });
}

/** Hapus lembut: baris tetap ada di Sheet (dihapus=TRUE), struk dipindah ke Trash Drive. */
function apiDelete(session, id) {
  var u = requireUser_(session);
  return withLock_(function () {
    var all = readMutasi_();
    var cur = findById_(all, id);
    if (!cur || !canEdit_(u, cur)) {
      throw new Error('Transaksi tidak ditemukan atau Anda tidak berhak menghapusnya.');
    }
    var b = findById_(readBarang_(), cur.barangId);
    if (b) checkSaldo_(b, all.filter(function (m) { return m.barangId === b.id && m.id !== cur.id; }));
    sheetMut_().getRange(cur._row, 13).setNumberFormat('@').setValue('TRUE');
    parseFiles_(cur.lampiran).forEach(function (f) {
      try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) { /* abaikan */ }
    });
    return true;
  });
}

/**
 * Unggah satu struk/foto. file = { name, data (base64 tanpa prefix) }.
 * Server memeriksa ukuran dan jenis file dari isinya (bukan dari nama/ekstensi).
 */
function apiUploadFile(session, mutasiId, file) {
  var u = requireUser_(session);
  file = file || {};
  var pre = findById_(readMutasi_(), mutasiId);
  if (!pre || !canEdit_(u, pre)) {
    throw new Error('Transaksi tidak ditemukan atau Anda tidak berhak menambah lampiran.');
  }
  if (parseFiles_(pre.lampiran).length >= CONFIG.MAX_FILES_PER_TRX) {
    throw new Error('Maksimal ' + CONFIG.MAX_FILES_PER_TRX + ' lampiran per transaksi.');
  }
  throttle_(u.username);

  var bytes = Utilities.base64Decode(String(file.data || ''));
  if (!bytes.length) throw new Error('File kosong.');
  if (bytes.length > CONFIG.MAX_FILE_BYTES) throw new Error('Ukuran file melebihi 5 MB.');
  var kind = sniff_(bytes);
  if (!kind) throw new Error('Hanya foto (JPG) dan PDF yang diizinkan.');

  var base = clean_(file.name, 80).replace(/\.[^.]*$/, '').replace(/[\\\/:*?"<>|]/g, '_') || 'struk';
  var ext = kind === 'pdf' ? '.pdf' : '.jpg';
  var mime = kind === 'pdf' ? 'application/pdf' : 'image/jpeg';

  var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var df = folder.createFile(Utilities.newBlob(bytes, mime, base + ext));
  df.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  try {
    return withLock_(function () {
      var cur = findById_(readMutasi_(), mutasiId);
      if (!cur) throw new Error('Transaksi tidak ditemukan.');
      var list = parseFiles_(cur.lampiran);
      if (list.length >= CONFIG.MAX_FILES_PER_TRX) {
        throw new Error('Maksimal ' + CONFIG.MAX_FILES_PER_TRX + ' lampiran per transaksi.');
      }
      var item = { id: df.getId(), nama: base + ext, tipe: kind };
      list.push(item);
      var sh = sheetMut_();
      sh.getRange(cur._row, 12).setNumberFormat('@').setValue(JSON.stringify(list));
      sh.getRange(cur._row, 3).setNumberFormat('@').setValue(nowIso_());
      return item;
    });
  } catch (e) {
    df.setTrashed(true); // jangan tinggalkan file yatim di Drive
    throw e;
  }
}

function apiRemoveFile(session, mutasiId, fileId) {
  var u = requireUser_(session);
  return withLock_(function () {
    var cur = findById_(readMutasi_(), mutasiId);
    if (!cur || !canEdit_(u, cur)) {
      throw new Error('Transaksi tidak ditemukan atau Anda tidak berhak menghapus lampiran.');
    }
    var list = parseFiles_(cur.lampiran);
    var keep = list.filter(function (f) { return f.id !== fileId; });
    if (keep.length === list.length) throw new Error('Lampiran tidak ditemukan.');
    var sh = sheetMut_();
    sh.getRange(cur._row, 12).setNumberFormat('@').setValue(JSON.stringify(keep));
    sh.getRange(cur._row, 3).setNumberFormat('@').setValue(nowIso_());
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* sudah hilang */ }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  Request belanja: daftar bahan/barang yang perlu dibeli             */
/* ------------------------------------------------------------------ */

/**
 * Tambah request belanja. Isinya hanya nama bahan/barang (boleh di luar daftar Barang).
 * Semua pengguna boleh menambah; nama yang sama dan belum dibeli tidak boleh dobel.
 */
function apiAddRequest(session, nama) {
  var u = requireUser_(session);
  nama = clean_(nama, 80);
  if (!nama) throw new Error('Isi nama bahan/barang.');
  return withLock_(function () {
    var dup = readRequests_().filter(function (r) { return r.dibeli !== 'TRUE' && r.nama.toLowerCase() === nama.toLowerCase(); })[0];
    if (dup) throw new Error('"' + dup.nama + '" sudah ada di daftar request (oleh ' + dup.namaPembuat + ').');
    throttle_(u.username);
    var sh = sheetReq_();
    var row = [Utilities.getUuid(), nowIso_(), nama, u.username, u.nama, 'FALSE', '', '', ''];
    sh.getRange(sh.getLastRow() + 1, 1, 1, H_REQ.length).setNumberFormat('@').setValues([row]);
    return listRequests_();
  });
}

/** Tandai sudah/belum dibeli. Siapa pun yang login boleh (yang berbelanja bisa siapa saja). */
function apiSetRequest(session, id, dibeli) {
  var u = requireUser_(session);
  return withLock_(function () {
    var cur = findById_(readRequests_(), id);
    if (!cur) throw new Error('Request tidak ditemukan.');
    var row = dibeli ? ['TRUE', u.nama, nowIso_()] : ['FALSE', '', ''];
    sheetReq_().getRange(cur._row, 6, 1, 3).setNumberFormat('@').setValues([row]);   // kolom 6..8
    return listRequests_();
  });
}

/** Hapus lembut. Hanya pembuat request atau admin. */
function apiDeleteRequest(session, id) {
  var u = requireUser_(session);
  return withLock_(function () {
    var cur = findById_(readRequests_(), id);
    if (!cur || !(u.peran === 'admin' || cur.pembuat === u.username)) {
      throw new Error('Request tidak ditemukan atau Anda tidak berhak menghapusnya.');
    }
    sheetReq_().getRange(cur._row, 9).setNumberFormat('@').setValue('TRUE');
    return listRequests_();
  });
}

function readRequests_() {
  return readAll_(sheetReq_(), H_REQ).filter(function (o) { return o.id && o.dihapus !== 'TRUE'; });
}

/** Semua request yang belum dibeli + yang dibeli dalam REQUEST_DONE_DAYS hari terakhir. */
function listRequests_() {
  var batas = Utilities.formatDate(new Date(nowDate_().getTime() - CONFIG.REQUEST_DONE_DAYS * 864e5),
                                   Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  return readRequests_().filter(function (r) { return r.dibeli !== 'TRUE' || r.dibeliPada >= batas; })
    .map(function (r) {
      return { id: r.id, dibuat: r.dibuat, nama: r.nama, pembuat: r.pembuat, namaPembuat: r.namaPembuat,
               dibeli: r.dibeli === 'TRUE', dibeliOleh: r.dibeliOleh, dibeliPada: r.dibeliPada };
    })
    .sort(function (a, b) {
      return (a.dibeli - b.dibeli) || (a.dibeli ? b.dibeliPada.localeCompare(a.dibeliPada) : b.dibuat.localeCompare(a.dibuat));
    });
}

/* ------------------------------------------------------------------ */
/*  Perhitungan stok                                                   */
/* ------------------------------------------------------------------ */

/**
 * Pastikan saldo barang tidak pernah minus. Dihitung per akhir hari (masuk & keluar
 * pada tanggal yang sama saling mengimbangi), mulai dari stok awal.
 */
function checkSaldo_(barang, mutasi) {
  var perHari = {};
  mutasi.forEach(function (m) {
    var q = num_(m.qty) * (m.jenis === 'MASUK' ? 1 : -1);
    perHari[m.tanggal] = (perHari[m.tanggal] || 0) + q;
  });
  var saldo = num_(barang.stokAwal);
  Object.keys(perHari).sort().forEach(function (tgl) {
    saldo = r3_(saldo + perHari[tgl]);
    if (saldo < 0) {
      throw new Error('Stok ' + barang.nama + ' tidak cukup: saldo pada ' + tgl + ' menjadi ' +
        String(saldo).replace('.', ',') + ' ' + barang.satuan + '.');
    }
  });
}

function parseQty_(v, label, allowZero) {
  var s = String(v == null ? '' : v).trim().replace(',', '.');
  if (s === '' && allowZero) return 0;
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) throw new Error(label + ' harus angka (boleh desimal, mis. 1,5).');
  var n = r3_(Number(s));
  if (!allowZero && n <= 0) throw new Error(label + ' harus lebih dari 0.');
  if (n > CONFIG.MAX_QTY) throw new Error(label + ' terlalu besar.');
  return n;
}

function parseRp_(v) {
  var s = String(v == null ? '' : v).trim();
  if (s === '') return 0;
  if (!/^\d{1,11}$/.test(s)) throw new Error('Nilai belanja harus angka rupiah tanpa titik/koma.');
  var n = Number(s);
  if (n > CONFIG.MAX_RP) throw new Error('Nilai belanja terlalu besar.');
  return n;
}

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function r3_(n) { return Math.round(n * 1000) / 1000; }
function isDate_(s) { return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s || '')); }
function kategoriIdx_(k) { var i = CONFIG.KATEGORI.indexOf(k); return i === -1 ? 99 : i; }
function today_() { return Utilities.formatDate(nowDate_(), CONFIG.TZ, 'yyyy-MM-dd'); }

/* ------------------------------------------------------------------ */
/*  Sesi & otorisasi                                                   */
/* ------------------------------------------------------------------ */

function newSession_(username) {
  var token = randomToken_(64);
  CacheService.getScriptCache().put('ses_' + token, username, CONFIG.SESSION_SECONDS);
  return token;
}

/** Pastikan sesi valid dan akun masih aktif. Melempar 'SESI_HABIS' jika tidak. */
function requireUser_(session) {
  if (!session || typeof session !== 'string' || session.length !== 64) throw new Error('SESI_HABIS');
  var cache = CacheService.getScriptCache();
  var name = cache.get('ses_' + session);
  if (!name) throw new Error('SESI_HABIS');
  var rec = findUser_(name);
  if (!rec || rec.aktif !== 'TRUE') {
    cache.remove('ses_' + session);
    throw new Error('SESI_HABIS');
  }
  cache.put('ses_' + session, name, CONFIG.SESSION_SECONDS); // perpanjang sesi
  return rec;
}

function requireAdmin_(session) {
  var u = requireUser_(session);
  if (u.peran !== 'admin') throw new Error('Hanya admin yang dapat melakukan ini.');
  return u;
}

function canEdit_(user, mutasi) {
  return user.peran === 'admin' || mutasi.pembuat === user.username;
}

function throttle_(username) {
  var cache = CacheService.getScriptCache();
  var key = 'w_' + username;
  var n = Number(cache.get(key) || 0);
  if (n >= CONFIG.MAX_WRITES_PER_10_MIN) {
    throw new Error('Terlalu banyak aktivitas dalam waktu singkat. Coba lagi beberapa menit lagi.');
  }
  cache.put(key, String(n + 1), 600);
}

/* ------------------------------------------------------------------ */
/*  Password                                                           */
/* ------------------------------------------------------------------ */

function checkPw_(pw) {
  if (pw.length < CONFIG.MIN_PASSWORD) throw new Error('Password minimal ' + CONFIG.MIN_PASSWORD + ' karakter.');
  if (pw.length > 200) throw new Error('Password terlalu panjang.');
}

/** Hash bergaram dengan beberapa putaran SHA-256. */
function hashPw_(salt, pw) {
  var saltBytes = Utilities.newBlob(String(salt)).getBytes();
  var bytes = Utilities.newBlob(String(salt) + '|' + String(pw)).getBytes();
  for (var i = 0; i < CONFIG.HASH_ROUNDS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(saltBytes));
  }
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function randomToken_(n) {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, n);
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  Sheet & util                                                       */
/* ------------------------------------------------------------------ */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheetByName_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Aplikasi belum di-setup. Jalankan fungsi setup() dari editor Apps Script.');
  var sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tidak ditemukan. Jalankan setup() lagi.');
  return sh;
}
function sheetBrg_() { return sheetByName_(CONFIG.SHEET_BARANG); }
function sheetMut_() { return sheetByName_(CONFIG.SHEET_MUTASI); }
function sheetUsr_() { return sheetByName_(CONFIG.SHEET_USER); }
function sheetReq_() { return sheetByName_(CONFIG.SHEET_REQUEST); }

function toObj_(arr, rowNum, headers) {
  var o = { _row: rowNum };
  for (var j = 0; j < headers.length; j++) o[headers[j]] = arr[j] == null ? '' : String(arr[j]);
  return o;
}

function readAll_(sh, headers) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues()
    .map(function (r, i) { return toObj_(r, i + 2, headers); });
}

/** Barang & transaksi yang tidak dihapus. */
function readBarang_() {
  return readAll_(sheetBrg_(), H_BRG).filter(function (o) { return o.id && o.dihapus !== 'TRUE'; });
}
function readMutasi_() {
  return readAll_(sheetMut_(), H_MUT).filter(function (o) { return o.id && o.dihapus !== 'TRUE'; });
}

function findById_(list, id) {
  if (!id) return null;
  for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  return null;
}

function findUser_(username) {
  var name = String(username || '').toLowerCase();
  if (!name) return null;
  var all = readAll_(sheetUsr_(), H_USR);
  for (var i = 0; i < all.length; i++) if (all[i].username === name) return all[i];
  return null;
}

function listUsers_() {
  return readAll_(sheetUsr_(), H_USR).map(function (o) {
    return { username: o.username, nama: o.nama, peran: o.peran,
             aktif: o.aktif === 'TRUE', wajibGanti: o.wajibGanti === 'TRUE', dibuat: o.dibuat };
  });
}

function appendUser_(sh, username, nama, peran, pw, wajibGanti) {
  var salt = randomToken_(32);
  var row = [username, nama, peran, salt, hashPw_(salt, pw), 'TRUE', wajibGanti ? 'TRUE' : 'FALSE', nowIso_()];
  sh.getRange(sh.getLastRow() + 1, 1, 1, H_USR.length).setNumberFormat('@').setValues([row]);
}

function publicUser_(rec) {
  return { username: rec.username, nama: rec.nama, peran: rec.peran, wajibGanti: rec.wajibGanti === 'TRUE' };
}

function parseFiles_(s) {
  try {
    var a = JSON.parse(s || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

function mutPublic_(m, b) {
  return {
    id: m.id, dibuat: m.dibuat, diperbarui: m.diperbarui, tanggal: m.tanggal,
    barangId: m.barangId, barang: b ? b.nama : '?', kode: b ? b.kode : '', satuan: b ? b.satuan : '',
    jenis: m.jenis, alasan: m.alasan || '', qty: num_(m.qty), nilai: num_(m.nilai), keterangan: m.keterangan,
    pembuat: m.pembuat, nama: m.nama, lampiran: parseFiles_(m.lampiran)
  };
}

function clean_(v, max) {
  var s = String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

function nowDate_() { return new Date(); }

function nowIso_() {
  return Utilities.formatDate(nowDate_(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

/** Kenali jenis file dari byte awalnya. Hanya JPEG dan PDF yang diterima. */
function sniff_(b) {
  function x(i) { return b[i] & 0xFF; }
  if (b.length > 4 && x(0) === 0xFF && x(1) === 0xD8 && x(2) === 0xFF) return 'jpg';
  if (b.length > 5 && x(0) === 0x25 && x(1) === 0x50 && x(2) === 0x44 && x(3) === 0x46 && x(4) === 0x2D) return 'pdf';
  return null;
}
