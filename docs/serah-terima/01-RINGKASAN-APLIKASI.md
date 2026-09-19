# Ringkasan Aplikasi

## Apa ini

**SAPA Smart AI** adalah asisten tanya-jawab berbasis web untuk data statistik
Kabupaten Aceh Tengah. Pengguna menuliskan pertanyaan dalam bahasa Indonesia
sehari-hari, dan aplikasi menyusun jawaban beserta bukti datanya.

Aplikasi ini **bukan** pengganti sistem pelaporan resmi dan **bukan** sumber angka
hukum. Ia adalah lapisan pencarian dan penyajian data agar indikator daerah dapat
ditemukan cepat tanpa harus menelusuri berkas satu per satu.

## Untuk siapa

| Pengguna | Keperluan |
|---|---|
| Pegawai OPD | Mencari angka indikator daerah beserta OPD pemiliknya |
| Bidang Statistik | Menyiapkan bahan analisis dan pemantauan indikator |
| Pimpinan | Membaca ringkasan eksekutif dan sebaran wilayah |
| Pengelola teknis | Menyalakan/mematikan layanan, menyegarkan cache, memantau kesehatan |

## Dari mana datanya

**Satu sumber saja:** API SPLP Kementerian Dalam Negeri —
`api-splp.layanan.go.id/sapa`. Pada 19 September 2026 tersedia 2.065 catatan
indikator. Aplikasi **tidak** menyimpan basis data sendiri; data ditarik saat
diminta dan disimpan sementara selama 10 menit untuk menghemat permintaan.

Konsekuensi yang perlu dipahami: bila API SPLP tidak dapat dihubungi, aplikasi
tidak memiliki data cadangan. Sistem akan menjawab dengan pesan yang jelas, bukan
angka kosong.

## Apa saja isinya

**Halaman**

- `/` — kotak pertanyaan beserta contoh pertanyaan siap pakai
- `/dashboard` — indikator utama dan narasi ringkas
- `/dashboard/analytics` — grafik per OPD dengan penelusuran rinci
- `/dashboard/gis` — peta sebaran indikator
- `/dashboard/laporan` — laporan eksekutif, riwayat tersimpan di peramban pengguna
- `/dashboard/status` — kesehatan sumber data dan keadaan fitur AI
- `/admin/ai-toggle` — panel pengelola: dua saklar layanan (terbatas)

**Layanan data (API)**

- `/api/query` dan `/api/query/stream` — tanya-jawab (yang kedua mengalir bertahap)
- `/api/kpi`, `/api/stats`, `/api/sapa`, `/api/report` — agregat untuk dashboard
- `/api/status` — kesehatan sumber data dan AI
- `/api/revalidate` — penyegaran cache
- `/api/admin/status`, `/api/admin/toggle-ai` — pengendali saklar

Rincian lengkap: `06-DOKUMENTASI-API.md`.

## Bagaimana jawaban disusun

1. Pertanyaan disaring lebih dahulu — pola yang mengandung data pribadi ditolak.
2. Sistem menarik indikator yang relevan dari SPLP.
3. Bila model bahasa diaktifkan, model menyusun narasi dari bukti tersebut.
4. **Angka yang tidak ada dalam bukti dibuang.** Model tidak boleh menambah angka
   yang tidak berasal dari data.
5. Bila model tidak dipakai atau gagal, jawaban dapat disusun dari aturan
   deterministik (template) — tergantung setelan saklar admin.

## Dua saklar yang mengatur layanan

| AI | Deterministik | Akibat bagi pengguna |
|---|---|---|
| Aktif | Aktif | Jawaban AI, dengan cadangan template bila model gagal |
| Aktif | Mati | Jawaban AI saja; template dilarang; bila model gagal muncul pesan error |
| Mati | Aktif | Jawaban template saja |
| Mati | Mati | **Layanan tanya-jawab tidak dapat diakses** (kode 503) |

Saklar ini bersifat global — berlaku untuk semua pengguna, diatur dari
`/admin/ai-toggle`.

## Batasan yang perlu diketahui sejak awal

1. Jawaban AI bersifat informatif; angka resmi tetap dari OPD sumber.
2. Kualitas jawaban bergantung pada kelengkapan data SPLP.
3. Pertanyaan dikirim ke penyedia model bahasa pihak ketiga untuk disusun
   narasinya. Rincian pada `07-KEAMANAN-DAN-DATA.md`.
4. Layanan bergantung pada dua pihak ketiga: API SPLP dan penyedia model bahasa.
5. Tidak ada akun pengguna — halaman bersifat terbuka, panel admin dilindungi
   satu kunci.

## Keadaan saat ini (19 September 2026)

Versi **0.1.0**, tahap awal produksi. Halaman informasi (dashboard, analitik, GIS,
laporan) berjalan normal. **Layanan tanya-jawab sedang dimatikan** melalui kedua
saklar karena perpanjangan langganan penyedia model bahasa tertunda — ini pilihan
pengelola, bukan kerusakan.

## Dokumen lain dalam paket ini

- `00-BERITA-ACARA-SERAH-TERIMA.md` — berita acara
- `02-ARSITEKTUR.md` — rancangan sistem
- `03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md` — memasang dan menempatkan aplikasi
- `04-PANDUAN-OPERASIONAL-RUNBOOK.md` — operasi harian dan penanganan gangguan
- `05-PANDUAN-PENGGUNA.md` — untuk pegawai pengguna
- `06-DOKUMENTASI-API.md` — rincian layanan data
- `07-KEAMANAN-DAN-DATA.md` — keamanan, data, dan kredensial
- `08-TATA-KELOLA-AI.md` — tata kelola model bahasa
- `09-PENGUJIAN-DAN-MUTU.md` — pengujian dan jaminan mutu
- `10-PEMELIHARAAN-DAN-ROADMAP.md` — pemeliharaan dan rencana lanjutan
