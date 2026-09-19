# Berita Acara Serah Terima

**Aplikasi:** SAPA Smart AI — Asisten Data Statistik Kabupaten Aceh Tengah
**Versi:** 0.1.0
**Tanggal serah terima:** 19 September 2026
**Nomor:** `……/BAST/SAPA-AI/……/2026` *(diisi oleh pengelola administrasi)*

## 1. Para Pihak

**Pihak yang menyerahkan (Pengembang)**

- Nama: Afrizal Munthe
- Jabatan: Pranata Komputer
- Unit kerja: Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah
- NIP: `…………………`

**Pihak yang menerima (Pemegang Kegiatan Pengembangan Aplikasi)**

- Bidang: Statistik dan Persandian
- Unit kerja: Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah
- Nama/NIP penerima: `…………………`

## 2. Ruang Lingkup yang Diserahkan

| No | Butir | Keterangan |
|---|---|---|
| 1 | Kode sumber aplikasi | Repositori **publik** `github.com/Niumination/sapa-ai`, cabang `main` |
| 2 | Hak cipta | Beralih kepada Diskominfo Aceh Tengah — lihat `LICENSE` |
| 3 | Dokumentasi teknis | Folder `docs/serah-terima/` pada repositori |
| 4 | Proyek penempatan (hosting) | Proyek Vercel `sapa-ai` pada akun Vercel `archk4lis-projects` (paket Hobby — akun pribadi pengembang). **Pengalihan kepemilikan ke akun kerja Diskominfo adalah butir yang harus diselesaikan penerima** |
| 5 | Nama domain produksi | `https://sapa-smart-ai.vercel.app` |
| 6 | Penyimpanan keadaan saklar | Basis data Upstash Redis (tier gratis) |
| 7 | Sumber data | API SPLP — `api-splp.layanan.go.id/sapa` (dikelola pihak ketiga, di luar lingkup) |
| 8 | Kredensial | Diserahkan **terpisah dari dokumen ini**, melalui kanal aman, tidak ditulis di dokumen mana pun |

## 3. Deskripsi Singkat Aplikasi

Asisten tanya-jawab berbasis web yang menyajikan data statistik Kabupaten Aceh
Tengah bersumber dari API SPLP. Pengguna mengajukan pertanyaan dalam bahasa
Indonesia, aplikasi menarik data yang relevan, lalu menyusun jawaban dengan
bantuan model bahasa. Setiap jawaban menyertakan bukti (daftar indikator, nilai,
satuan, tahun, dan OPD asal) sehingga dapat ditelusuri.

Arsitektur sengaja dibatasi: **tanpa basis data, tanpa autentikasi pengguna,
tanpa gudang data**, dan hanya memakai satu sumber data resmi. Rincian ada pada
`02-ARSITEKTUR.md`.

## 4. Keadaan pada Saat Serah Terima

Hal-hal berikut dicatat apa adanya agar penerima tidak menemukan kejutan:

1. **Layanan tanya-jawab sedang tidak aktif.** Kedua saklar admin (AI dan
   deterministik) berada pada posisi mati, sehingga permintaan tanya-jawab
   menerima kode 503 dengan pesan yang jelas. Penyebabnya: perpanjangan
   langganan penyedia model bahasa (OpenCode Go) sedang tertunda, sehingga
   pemakaian berbiaya dihindari. **Halaman dashboard, analitik, GIS, dan laporan
   tetap berfungsi normal** karena tidak memerlukan model bahasa.
2. **Model terakhir yang dipakai:** `deepseek-v4.1-flash`, diakses melalui
   OpenCode Go. Aplikasi sudah mendukung penyedia lain tanpa perubahan kode —
   termasuk Google Gemini — lihat `08-TATA-KELOLA-AI.md`.
3. **Kuota penyimpanan Vercel terlampaui** (Functions Storage). Ini tidak
   menghentikan layanan yang berjalan, tetapi dapat memblokir penempatan
   (deployment) baru. Kebijakan retensi sudah diatur pada 19 Sep 2026 (canceled
   1 hari, errored 1 hari, pre-production 1 minggu, production 30 hari), sehingga
   penyimpanan menyusut bertahap. Rincian pada `10-PEMELIHARAAN-DAN-ROADMAP.md`.
4. **Sebagian berkas dihapus pada versi ini**: arsip warisan stack lain, bank
   skill pihak ketiga, delapan dependensi yang tidak dipakai, serta sisa berkas
   milik proyek lain (`supabase/`, `references/`, `docs/VERCEL_ENV.md`). Semuanya
   masih dapat dipulihkan dari riwayat Git bila diperlukan.
5. **Repositori bersifat publik.** Seluruh isi repositori — termasuk dokumen serah
   terima ini dan daftar risiko pada `07-KEAMANAN-DAN-DATA.md` — dapat dibaca siapa
   pun. Bila Bidang Persandian mensyaratkan sebaliknya, repositori dapat dijadikan
   privat tanpa mengubah kode.
6. **Lisensi `react-leaflet` adalah Hippocratic-2.1**, bukan lisensi OSI. Perlu
   ditinjau Bidang Persandian bila disyaratkan seluruh komponen berlisensi OSI.
   Rincian pada `LICENSE` butir 5 dan `07-KEAMANAN-DAN-DATA.md`.

## 5. Kriteria Penerimaan

| No | Kriteria | Bukti | Status |
|---|---|---|---|
| 1 | Kode dapat dipasang dari repositori | `npm install && npm run build` berhasil | ☐ |
| 2 | Pemeriksaan tipe bersih | `npm run typecheck` → OK | ☐ |
| 3 | Seluruh pengujian lulus | `npx vitest run` → 169 lulus / 17 berkas | ☐ |
| 4 | Halaman dashboard, analitik, GIS, laporan dapat dibuka | Balasan HTTP 200 | ☐ |
| 5 | Dokumentasi lengkap dan dapat diikuti | `docs/serah-terima/` | ☐ |
| 6 | Kredensial diserahkan melalui kanal aman | Berita acara terpisah | ☐ |
| 7 | Penerima dapat mengoperasikan panel admin | Uji coba bersama | ☐ |

Kriteria di atas diverifikasi bersama pada saat serah terima dan hasilnya
dituangkan pada kolom Status.

## 6. Batas Tanggung Jawab

1. Jawaban yang dihasilkan fitur AI bersifat informatif dan **bukan produk hukum
   resmi**. Angka resmi tetap mengacu pada OPD sumber data.
2. Ketersediaan data sepenuhnya bergantung pada API SPLP sebagai pihak ketiga.
3. Ketersediaan model bahasa bergantung pada penyedia pihak ketiga dan biaya
   langganannya.
4. Kredensial yang telah diserahkan menjadi tanggung jawab penerima, termasuk
   rotasi berkala.

## 7. Penutup

Demikian berita acara ini dibuat untuk dipergunakan sebagaimana mestinya.

| Menyerahkan | Menerima |
|---|---|
| Pengembang | Bidang Statistik dan Persandian |
| | |
| | |
| Afrizal Munthe | `…………………` |
| Pranata Komputer | `…………………` |
| NIP. `…………………` | NIP. `…………………` |

**Mengetahui/Menyetujui**
Kepala Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah

`……………………………………`
NIP. `…………………………`
