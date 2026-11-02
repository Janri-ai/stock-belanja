# Stock & Belanja Dapur

Aplikasi web pemantauan stok dapur dan belanja dengan konsep buku kas per jenis barang:
**Saldo awal + Masuk − Keluar = Saldo akhir**. Login, peran admin/pengguna, foto struk, peringatan stok menipis.
Berjalan gratis di Google Apps Script (Sheets + Drive).

## Isi paket
| Folder/berkas | Fungsi |
|---|---|
| `src/Code.gs` | Backend (Apps Script) |
| `src/Index.html` | Tampilan (satu file) |
| `docs/index.html` | Halaman GitHub Pages yang membuka aplikasi (isi `APP_URL`) |
| `tests/` | Tes otomatis (backend + tampilan) |
| `CLAUDE.md` | Konteks dan aturan proyek untuk Claude Code |

## Pasang pertama kali di Google
1. Buat **Google Sheet baru** → menu **Ekstensi → Apps Script**.
2. Hapus isi `Code.gs`, tempel isi `src/Code.gs`, tekan **Ctrl+S**.
3. Klik **+** di samping "Files" → **HTML** → beri nama persis `Index` → tempel isi `src/Index.html` → **Ctrl+S**.
4. Pilih fungsi `setup` di toolbar → **Run** → izinkan akses (Advanced → Go to … → Allow).
5. **Project Settings** (ikon gerigi) → **Script Properties** → salin nilai `ADMIN_AWAL` (password awal akun `admin`).
6. **Deploy → New deployment** → jenis **Web app** → *Execute as: Me*, *Who has access: Anyone* → **Deploy**. Salin link `/exec`.
7. Buka link, masuk sebagai `admin`, ganti password.
8. Tab **Barang**: isi **stok awal** tiap barang (hasil hitung fisik) dan tanggalnya, batas stok menipis; tambah barang lain bila perlu.
9. Ikon akun → **Kelola pengguna** → tambah akun petugas dapur.

Perubahan kode berikutnya: tempel ulang, lalu **Deploy → Manage deployments → pensil → Version: New version** (link tetap sama).

## Cara pakai harian
- **+ Masuk**: barang dibeli/diterima — isi jumlah, total belanja (Rp), foto struk.
- **− Keluar**: barang dipakai — isi jumlah dan keterangan.
- **Saldo Stok**: rekap per bulan (Awal, Masuk, Keluar, Saldo). Ketuk barang → **Kartu Stok** (seperti buku kas).
- Saldo tidak bisa minus: pengeluaran melebihi stok akan ditolak.

## Menjalankan tes
```
npm install
npx playwright install chromium
npm test
```

## Catatan
- Jangan bagikan Google Sheet-nya (tab Pengguna berisi hash password).
- Zona waktu "hari ini" diatur di `CONFIG.TZ` pada `Code.gs` (default WIB).
