# Stock & Belanja Dapur — konteks proyek untuk Claude Code

Aplikasi web internal untuk memantau stok dapur (beras, minyak, ikan, sayuran, sabun, bumbu, dll.) dan belanja,
dibuat di **Google Apps Script** (data di Google Sheets, foto struk di Google Drive). Pemilik: Janri.
Dikloning dari proyek `laporan-cash-count` (login, peran, sesi, keamanan, pembungkus GitHub Pages, tes sama).
**Komunikasi dengan pemilik: Bahasa Indonesia.** Pemilik non-teknis: beri langkah pendek, bernomor, sebut nama
tombol persis seperti di layar, dan minta tangkapan layar setelah langkah yang berisiko.

## Konsep (seperti buku kas, per jenis barang)
`Saldo awal + Masuk (belanja) − Keluar (pemakaian) = Saldo akhir`, dihitung per bulan.
- Tab Sheet **Barang**: nama, kategori, satuan, `stokAwal` per `tglAwal` (hasil hitung fisik), `minStok`, aktif.
- Tab Sheet **Mutasi**: tanggal, barangId, jenis `MASUK|KELUAR`, qty (desimal 3 angka), `nilai` Rp (hanya MASUK), keterangan, pembuat, lampiran (struk).
- Saldo awal bulan = stokAwal + mutasi sebelum bulan itu. Bulan sebelum `tglAwal` = "belum tercatat".
- **Saldo tidak boleh minus** pada tanggal mana pun (dicek per akhir hari) saat tambah/ubah/hapus transaksi atau ubah stok awal.
- **Rusak/Expired**: transaksi KELUAR dengan kolom `alasan` = RUSAK|EXPIRED (kosong = dipakai biasa). Mengurangi saldo, dihitung terpisah (`rusak`, `totalRusak`). Foto wajib dicek di klien saja (unggah terjadi setelah simpan).
- **Request Belanja** (tab Sheet `Request`): isinya hanya nama bahan/barang (bebas, ada saran dari daftar Barang). Semua pengguna boleh menambah & mencentang sudah dibeli; hapus hanya pembuat/admin; nama sama yang belum dibeli ditolak; yang sudah dibeli tampil 30 hari. Ikut dikirim di `apiData`.
- Tanggal transaksi tidak boleh di masa depan atau sebelum `tglAwal` barang.
- Stok menipis: barang aktif dengan `minStok > 0` dan saldo hari ini ≤ minStok → banner kuning untuk semua pengguna.
- Kelompok berkode di `CONFIG.KELOMPOK` (01 Sembako … 08 Lain-lain); daftar barang awal di `CONFIG.BARANG_AWAL` (63 barang).
- Kode barang = kode kelompok + nomor urut (01.001). Dibuat otomatis, berganti bila kelompok diubah, tidak dipakai ulang.
- `setup()` (`syncBarang_`) idempotent: memetakan kategori versi pertama, menambah barang awal yang belum ada, memberi kode. Tidak menghapus transaksi.

## Struktur
- `src/Code.gs` — backend. Fungsi publik `api*(session, ...)`; pembantu berakhiran `_`.
  API: `apiData(ym)` (rekap + transaksi sebulan), `apiSaveBarang`/`apiDeleteBarang` (admin), `apiSaveMutasi`, `apiDelete`, `apiUploadFile`, `apiRemoveFile`, plus akun.
- `src/Index.html` — tampilan (satu file, JS murni, tanpa CDN). Tab: Saldo Stok, Transaksi, Barang (admin). Kartu Stok = buku kas per barang.
- `docs/index.html` — halaman GitHub Pages (Settings → Pages → branch main, folder /docs) yang membungkus link `/exec` dalam iframe. Isi `APP_URL`.
- `tests/` — tes otomatis (Node `vm` + Playwright). `npm test`.

## Keputusan produk
- Login sendiri; admin membuat akun; password sementara wajib diganti. Akun awal `admin`, password di Script Properties `ADMIN_AWAL`.
- Peran: `admin` kelola barang/stok awal, ubah semua transaksi, kelola pengguna. `user` melihat semua stok & transaksi (dapur bersama), mencatat masuk/keluar, mengubah/menghapus transaksi miliknya.
- Barang yang sudah punya transaksi tidak bisa dihapus — dinonaktifkan saja.
- Struk: JPG/PDF, maks 3 per transaksi, 5 MB.
- Tampilan: hijau gradasi (#0E9F6E), ikon keranjang (`#ico-stock`), mobile-first 300–390 px tanpa melebar.

## Aturan keamanan (sama dengan Cash Count, wajib dipertahankan)
Hash bergaram, sesi di CacheService, kunci setelah 5 salah, izin dicek di server, sel format teks `@`, LockService,
hapus lembut, batas tulis per pengguna, cek byte awal file, tidak ada `innerHTML` untuk data pengguna, tidak mengirim hash/token.
Setiap perubahan kode: Deploy → Manage deployments → pensil → Version: New version.

## Cara menguji
`npm install`, `npx playwright install chromium`, `npm test`. Tangkapan layar di `tests/out/` — lihat hasilnya.
Tanggal dipalsukan lewat `nowDate_()` (lihat `tests/uihelper.js`, 15 Okt 2026).
**Belum teruji di Google asli** (kecepatan, cache sesi, iPhone/Safari dalam iframe).

## Ide berikutnya (BELUM dikerjakan — tanyakan dulu)
1. Unduh rekap bulanan ke Excel/CSV atau cetak.
2. Nilai persediaan (Rp) per barang dengan harga rata-rata.
3. Stock opname: input hitung fisik → transaksi penyesuaian otomatis.
4. Grafik belanja per kategori per bulan.
