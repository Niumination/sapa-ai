# Rencana Anggaran Biaya (RAB)

**Nama Kegiatan:** Pengembangan Aplikasi SAPA Smart AI — Asisten Data Statistik Kabupaten Aceh Tengah
**Nomor:** `[DIISI: nomor dokumen]`
**Tahun Anggaran:** `[DIISI: tahun anggaran]`
**Unit Kerja:** Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah — Bidang Statistik dan Persandian
**Sumber Dana:** `[DIISI: DPA/APBK/dana lain]`

> **Penting — batas dokumen ini.** Seluruh **nilai rupiah** dalam dokumen ini sengaja
> dikosongkan dan bertanda `[DIISI: …]`. Pengembang tidak memiliki data harga satuan,
> standar biaya, atau pagu anggaran, sehingga **tidak mengisi angka apa pun**. Harga
> satuan wajib mengacu pada Standar Biaya Umum (SBU) yang berlaku atau penawaran resmi
> penyedia jasa. Yang sudah terisi hanyalah **keadaan biaya yang dapat dibuktikan**
> (layanan mana yang sekarang gratis dan batasnya), sehingga penyusun anggaran tahu
> pos mana yang benar-benar mengeluarkan uang dan pos mana yang tidak.

---

## 1. Ringkasan Komponen Biaya

| Kelompok | Sifat | Kondisi saat ini |
|---|---|---|
| A. Pengembangan aplikasi | Sekali (satu tahun anggaran) | Sudah terlaksana |
| B. Operasional tahunan | Berulang setiap tahun | Sebagian berbiaya nol |
| C. Pengembangan lanjutan | Opsional, sesuai prioritas | Belum terlaksana |

## A. Biaya Pengembangan Aplikasi

| No | Uraian | Satuan | Volume | Harga Satuan (Rp) | Jumlah (Rp) |
|---|---|---|---|---|---|
| A1 | Analisis kebutuhan dan penelusuran katalog data SAPA | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A2 | Perancangan arsitektur dan alur penyusunan jawaban | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A3 | Pengembangan antarmuka lima halaman aplikasi | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A4 | Pengembangan layanan tanya-jawab (pencarian, penyusunan jawaban, penyaring) | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A5 | Integrasi sumber data SPLP | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A6 | Pengujian otomatis dan gerbang evaluasi 78 butir | OB | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| A7 | Penyusunan dokumentasi serah terima (14 berkas) | Dokumen | 14 | `[DIISI]` | `[DIISI]` |
| A8 | Pendampingan alih pengetahuan | OH | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| | **Subtotal A** | | | | **`[DIISI]`** |

## B. Biaya Operasional Tahunan

| No | Uraian | Perhitungan | Kondisi terverifikasi 19 Sep 2026 | Jumlah (Rp/tahun) |
|---|---|---|---|---|
| B1 | Penempatan aplikasi (hosting) | 12 bulan | **Paket Hobby Vercel — biaya Rp0.** Biaya muncul hanya bila dinaikkan ke paket berbayar | `[DIISI: 0 atau biaya paket berbayar]` |
| B2 | Penyimpanan keadaan saklar admin | 12 bulan | **Upstash Redis tier gratis — Rp0** (dipakai sejak 19 Sep 2026) | `[DIISI: 0 atau biaya jika naik tier]` |
| B3 | Pemakaian model bahasa (API) | lihat rumus di bawah | **Berbiaya, berbasis pemakaian.** Saat ini dinonaktifkan sementara | `[DIISI]` |
| B4 | Nama domain | 1 tahun | Memakai domain bawaan Vercel — Rp0. Berbiaya bila memakai domain kustom | `[DIISI]` |
| B5 | Pemeliharaan rutin oleh SDM | `[DIISI]` jam/bulan × 12 | Kegiatan: pemeriksaan berkala, penyegaran cache, penanganan gangguan (lihat runbook) | `[DIISI]` |
| B6 | Cadangan (biaya tak terduga) | `[DIISI]`% dari subtotal | | `[DIISI]` |
| | **Subtotal B** | | | **`[DIISI]`** |

### Rumus perhitungan B3 (pemakaian model bahasa)

Angka masukan diambil dari metrik aplikasi, sehingga tidak perlu dikira-kira:

```
biaya bulanan = jumlah pertanyaan/bulan
              × rata-rata token keluaran (batas anggaran aplikasi: 3.000 token)
              × harga per token penyedia yang dipakai
```

- Jumlah pertanyaan diukur aplikasi: metrik harian tersedia pada `GET /api/status`
  (bidang `ai.metrics`) dan dibatasi `AI_DAILY_CALL_LIMIT` (bawaan 2.000 panggilan/hari).
- Harga per token **wajib diisi dari daftar harga resmi penyedia** pada saat penyusunan.
- Bila penyedia diganti (aplikasi mendukung penggantian tanpa perubahan kode — lihat
  `08-TATA-KELOLA-AI.md`), angka ini harus dihitung ulang.

## C. Pengembangan Lanjutan (Opsional)

Diambil dari rencana pada `10-PEMELIHARAAN-DAN-ROADMAP.md`. Dibiayakan hanya bila
menjadi prioritas kegiatan.

| No | Uraian | Manfaat | Volume | Harga Satuan | Jumlah |
|---|---|---|---|---|---|
| C1 | Pengujian antarmuka (peramban) otomatis | Perilaku halaman teruji, bukan hanya manual | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| C2 | Pemasangan kunci penyegaran cache dan rotasi kunci admin | Menutup dua risiko pada `07-KEAMANAN-DAN-DATA.md` | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| C3 | Penambahan header keamanan | Pengerasan respons web | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| C4 | Pelatihan pengguna lanjutan | Percepatan adopsi di OPD | `[DIISI]` | `[DIISI]` | `[DIISI]` |
| | **Subtotal C** | | | | **`[DIISI]`** |

## D. Rekapitulasi

| Kelompok | Jumlah (Rp) |
|---|---|
| A. Pengembangan aplikasi | `[DIISI]` |
| B. Operasional tahunan | `[DIISI]` |
| C. Pengembangan lanjutan (opsional) | `[DIISI]` |
| **Total (A+B)** | **`[DIISI]`** |
| **Total (A+B+C)** | **`[DIISI]`** |

## E. Catatan Penyusunan

1. **Tidak ada biaya lisensi perangkat lunak** untuk komponen utama: Next.js, React,
   dan TypeScript berlisensi MIT; komponen peta memakai lisensi **Hippocratic-2.1**
   (bukan OSI) — perlu ditinjau Bidang Persandian bila disyaratkan seluruh komponen
   berlisensi OSI. Rincian pada `LICENSE`.
2. **Penghematan yang sudah melekat:** aplikasi dirancang tanpa basis data dan tanpa
   penyimpanan permanen, sehingga tidak ada pos biaya server basis data, pencadangan,
   maupun pemeliharaan skema.
3. **Pos yang paling mudah membengkak adalah B3** (pemakaian model bahasa), karena
   mengikuti jumlah pertanyaan. Batas harian `AI_DAILY_CALL_LIMIT` adalah pengendali
   utamanya; nilainya dapat diturunkan tanpa mengubah kode.
4. **Waktu penyusunan:** harga satuan dan pagu wajib diverifikasi ulang pada saat
   dokumen diajukan, karena angka pada dokumen ini tidak boleh disalin dari tahun
   sebelumnya tanpa pemeriksaan.

| Disusun oleh | Diperiksa oleh | Disetujui oleh |
|---|---|---|
| `…………………` | `…………………` | `…………………` |
| `[DIISI: jabatan]` | `[DIISI: jabatan]` | `[DIISI: jabatan]` |
| NIP. `…………………` | NIP. `…………………` | NIP. `…………………` |
