# Paket Dokumen Serah Terima — SAPA Smart AI

Dokumen ini adalah pintu masuk paket serah terima aplikasi **SAPA Smart AI**
(Asisten Data Statistik Kabupaten Aceh Tengah) dari pengembang kepada pemegang
kegiatan pengembangan aplikasi: **Bidang Statistik dan Persandian, Dinas
Komunikasi dan Informatika Kabupaten Aceh Tengah**.

- **Versi aplikasi:** 0.1.0 · **Tanggal:** 19 September 2026
- **Repositori:** `github.com/Niumination/sapa-ai` (publik)
- **Produksi:** https://sapa-smart-ai.vercel.app

## Cara membaca paket ini

Sesuaikan dengan peran Anda — tidak perlu membaca semuanya berurutan.

**Pimpinan / pengambil keputusan**
1. `00-BERITA-ACARA-SERAH-TERIMA.md` — apa yang diserahkan, keadaan saat ini, kriteria penerimaan
2. `01-RINGKASAN-APLIKASI.md` — aplikasi ini apa dan untuk apa

**Pengelola teknis (yang akan merawat aplikasi)**
1. `02-ARSITEKTUR.md` — bagaimana sistemnya bekerja
2. `03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md` — memasang dan menempatkan aplikasi
3. `04-PANDUAN-OPERASIONAL-RUNBOOK.md` — operasi harian dan penanganan gangguan
4. `10-PEMELIHARAAN-DAN-ROADMAP.md` — yang perlu dikerjakan penerima dan rencana lanjutan

**Bidang Persandian**
1. `07-KEAMANAN-DAN-DATA.md` — data yang diproses, kredensial, kontrol akses, risiko terbuka
2. `08-TATA-KELOLA-AI.md` — model bahasa, dua saklar pengendali, jaminan anti-halusinasi
3. `LICENSE` (di akar repositori) — kepemilikan dan catatan lisensi pihak ketiga

**Pengguna (pegawai OPD)**
1. `05-PANDUAN-PENGGUNA.md` — cara bertanya dan membaca jawaban

**Pengelola administrasi dan penyusun anggaran**
1. `11-KERANGKA-ACUAN-KERJA.md` — dasar kegiatan: latar belakang, tujuan, ruang lingkup, keluaran, jadwal
2. `12-RENCANA-ANGGARAN-BIAYA.md` — kerangka biaya pengembangan dan operasional (nilai rupiah diisi penyusun anggaran)
3. `00-BERITA-ACARA-SERAH-TERIMA.md` — butir yang diserahkan dan blok tanda tangan

**Pemeriksa mutu**
1. `09-PENGUJIAN-DAN-MUTU.md` — apa yang diuji dan apa yang belum
2. `06-DOKUMENTASI-API.md` — rincian tiap layanan data

## Daftar berkas

| Berkas | Isi |
|---|---|
| `00-BERITA-ACARA-SERAH-TERIMA.md` | Berita acara resmi, ruang lingkup, keadaan saat serah terima, kriteria penerimaan, batas tanggung jawab |
| `01-RINGKASAN-APLIKASI.md` | Ringkasan untuk semua pembaca: kegunaan, sumber data, isi, matriks dua saklar, batasan |
| `02-ARSITEKTUR.md` | Rancangan sistem, alur data, komponen, pilihan teknologi, batasan desain |
| `03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md` | Prasyarat, pemasangan lokal, seluruh variabel lingkungan, penempatan ke Vercel, verifikasi |
| `04-PANDUAN-OPERASIONAL-RUNBOOK.md` | Periksa harian/mingguan, menyalakan & mematikan layanan, penyegaran cache, penanganan gangguan, rollback, eskalasi |
| `05-PANDUAN-PENGGUNA.md` | Untuk pegawai: cara bertanya, arti jawaban, arti pesan galat, fungsi tiap halaman |
| `06-DOKUMENTASI-API.md` | Tiap endpoint: metode, parameter, contoh, kode status, arti galat |
| `07-KEAMANAN-DAN-DATA.md` | Klasifikasi data, alur data ke pihak ketiga, daftar kredensial, kontrol akses, risiko terbuka |
| `08-TATA-KELOLA-AI.md` | Model dan penyedia, dua saklar, jaminan angka tidak dikarang, kendali biaya, prosedur ganti model |
| `09-PENGUJIAN-DAN-MUTU.md` | Cakupan pengujian, perintah menjalankannya, gerbang CI, batas yang belum tercakup |
| `10-PEMELIHARAAN-DAN-ROADMAP.md` | Kegiatan rutin, definisi layanan sehat, utang yang harus diselesaikan penerima, risiko, rencana lanjutan |
| `11-KERANGKA-ACUAN-KERJA.md` | Kerangka Acuan Kerja (KAK): latar belakang, maksud dan tujuan, sasaran, ruang lingkup, keluaran, kriteria penerimaan, metode, jadwal, pembiayaan |
| `12-RENCANA-ANGGARAN-BIAYA.md` | Rencana Anggaran Biaya (RAB): komponen pengembangan, operasional tahunan, pengembangan lanjutan, rekapitulasi — nilai rupiah dikosongkan untuk diisi penyusun anggaran |

Berkas di luar paket ini yang tetap relevan: `LICENSE` dan `CHANGELOG.md` di akar
repositori, `AGENTS.md` (aturan kerja agen pemrograman), serta `docs/AI_MODE_SHADOW.md`
dan `docs/DESAIN-PIPELINE-DETERMINISTIK.md`.

## Konvensi dokumen

- Bahasa Indonesia; nama berkas, perintah, dan variabel lingkungan tetap dalam bahasa Inggris.
- **Tidak ada rahasia di dalam dokumen mana pun.** Kredensial diserahkan melalui
  kanal aman secara terpisah; dokumen hanya menyebut nama variabelnya.
- Klaim teknis di dokumen ini dapat diperiksa sendiri dari repositori. Bila ada yang
  belum pasti, dituliskan apa adanya sebagai "perlu dikonfirmasi" — bukan ditebak.
- Keadaan aplikasi yang belum selesai **ditulis terbuka** pada `00` butir 4 dan `10`,
  agar penerima tidak menemukannya setelah tanda tangan.

## Menjaga dokumen ini tetap benar

Setiap perubahan perilaku aplikasi wajib disertai pembaruan dokumen terkait, dan
setiap rilis wajib dicatat di `CHANGELOG.md`. Dokumen yang tidak diperbarui lebih
berbahaya daripada tidak ada dokumen — penerima berikutnya akan mempercayainya.
