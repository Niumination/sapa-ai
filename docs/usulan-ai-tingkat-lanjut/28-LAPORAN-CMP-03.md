# 28 — Laporan CMP-03: tata kelola risiko AI (daftar risiko, pemilik, tindak lanjut)

**Tanggal:** 24 September 2026 · **Cabang:** `dev` (tanpa menyentuh `main`, tanpa operasi remote)
**Rujukan:** ISO/IEC 42001 · NIST AI RMF (Govern · Map · Measure · Manage)
**Status dokumen 10:** `🟡 (dokumen 10 §13 ✅; pemilik risiko ⬜)` → **✅**

## 1. Ringkas

| Sebelum | Sesudah |
|---|---|
| Daftar risiko hanya ada sebagai tabel di dokumen 10 §13 | Register **9 risiko** dalam kode (`src/lib/tata-kelola-risiko.ts`), tersedia sebagai halaman publik `/tata-kelola-risiko` dan bentuk mesin `/api/tata-kelola-risiko` |
| **Tidak ada pemilik** — risiko tanpa pemilik tidak pernah ditindaklanjuti | Setiap risiko punya **pemilik berupa PERAN** + tanggung jawab yang jelas (sengaja bukan nama orang, supaya tidak basi saat pegawai mutasi) |
| Kendali tidak diperiksa | Setiap risiko punya kendali nyata **dan bukti** yang menunjuk berkas di repositori; harness memeriksa berkas itu **ada** |
| Tidak ada tindak lanjut bertanggal | Setiap risiko punya riwayat tindak lanjut (selesai/jalan/rencana) + **tenggat tinjauan per risiko** (harness menolak bila lewat) |
| Tingkat risiko = penilaian verbal | Tingkat dihitung dari matriks kemungkinan × dampak, dan kecocokannya **diperiksa** (tidak bisa diedit asal) |

Uji: **669 → 686** (17 uji baru). Harness baru: `scripts/uji-tata-kelola.mjs` (**13 pemeriksaan** + mode sabotase).

## 2. Register: 9 risiko, semuanya bertuan

| ID | Risiko | Tingkat | Pemilik (peran) |
|---|---|---|---|
| R-01 | Angka keliru dikutip karena model mengarang nilai | tinggi | Pengelola Mutu Jawaban (tim data) |
| R-02 | Data pribadi masuk log / terkirim ke penyedia model | tinggi | Petugas Perlindungan Data (DPO internal) |
| R-03 | Jawaban AI tidak dapat ditelusuri saat diperiksa | sedang | Operator Layanan (admin) |
| R-04 | Biaya token membengkak / kuota harian habis | sedang | Operator Layanan (admin) |
| R-05 | Penyedia model tidak dapat dihubungi | tinggi | Operator Layanan (admin) |
| R-06 | Istilah daerah menimpa kata katalog sehingga pencarian salah | sedang | Pengelola Kosakata & Katalog (tim data) |
| R-07 | Teks keterbukaan menyimpang dari perilaku layanan | tinggi | Pengelola Keterbukaan & Komunikasi Publik |
| R-08 | Data tingkat desa tidak tersedia dari OPD | tinggi | Koordinator Data OPD (Sekretariat) |
| R-09 | Perubahan kode antar agen bertabrakan | sedang | Penanggung Jawab Teknis (pengelola repositori) |

Catatan penting: **R-01 s.d. R-07 semuanya lahir dari pekerjaan nyata di cabang ini** (FR-18, FR-23, FR-24,
DS-03, DS-05, CMP-02), bukan daftar teoretis. Tiga risiko yang sebelumnya hanya ada di dokumen 10 §13
(mutu bahasa model berbeda, biaya token, perubahan antar agen) kini punya pemilik dan bukti.

## 3. Temuan saat mengerjakan

### 3.1 Bukti yang menunjuk berkas tidak ada = kendali tanpa bukti

Aturan yang dipilih: setiap kendali harus menunjuk **bukti yang benar-benar ada** — berkas uji,
harness, artefak verifikasi, laporan, modul, atau endpoint yang dijawab aplikasi. Harness memeriksa
**27 berkas** dan **2 endpoint**; satu rujukan yang salah tulis akan langsung menggagalkan uji.

### 3.2 Pemeriksaan endpoint tidak boleh menyamakan "berpenjaga" dengan "tidak ada"

Draf pertama harness menuntut setiap rujukan endpoint menjawab < 500; `/api/admin/celah` menjawab
**503 fail-closed** (rahasia admin belum diset) — dan harness menolak. Yang benar: `404` berarti rute
tidak ada (bukti karangan), sedangkan `401/403/503` justru **bukti rute itu nyata** dan memang
berpenjaga. Pemeriksaannya diperbaiki, bukan datanya.

### 3.3 Pemilik berupa peran, bukan nama orang

Nama orang di register risiko akan basi setiap kali pegawai mutasi; risiko yang pemiliknya sudah
pindah tugas tidak akan pernah ditindaklanjuti. Karena itu uji menegakkan **kata peran**
(`Pengelola`, `Operator`, `Petugas`, `Koordinator`, `Penanggung jawab`, `Kepala`, `Sekretariat`, `Tim`)
dan menolak pemilik yang tampak seperti nama orang.

## 4. Bukti

### 4.1 Uji & build

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | **686 lulus** (41 berkas; dari 669) |
| `npx tsc --noEmit` | 0 kesalahan |
| `npm run build` | 0 kesalahan |

Uji baru: `src/lib/__tests__/tata-kelola-risiko.test.ts` (15) dan
`src/app/api/tata-kelola-risiko/route.test.ts` (2).

### 4.2 Harness — `verifikasi/uji-tata-kelola.txt` (exit 0, 13 pemeriksaan)

```
A. Register        : 9 risiko · tidak ada pelanggaran · 4 fungsi NIST terwakili ·
                     setiap risiko punya pemilik berupa PERAN
B. Bukti nyata     : 27 berkas bukti ADA di repositori · 2 endpoint dijawab aplikasi
                     (/api/status→200 · /api/admin/celah→503 fail-closed = rute nyata)
C. Halaman publik  : memuat judul, ringkasan, SETIAP id risiko, pemilik setiap risiko,
                     dan rujukan NIST AI RMF
D. Uji diri        : data yang dirusak di memori WAJIB menghasilkan pelanggaran
```

### 4.3 Mode sabotase — `verifikasi/uji-tata-kelola-sabotase.txt` (exit 1)

Register dirusak dengan lima cara yang paling mungkin terjadi di dunia nyata: pemilik dihapus,
bukti menunjuk berkas tidak ada, tenggat tinjauan dilewatkan, jenis bukti diganti menjadi asing, dan
tingkat risiko diubah agar tidak cocok dengan matriks. Hasil: **6 pelanggaran terdeteksi**, tiga
pemeriksaan utama gugur (exit 1) — jadi pemeriksa ini bukan hiasan.

## 5. Batas yang dinyatakan

- Register ini **bukan** penilaian risiko formal bersertifikat ISO 42001: tidak ada audit pihak
  ketiga, dan skalanya (3×3) disederhanakan supaya bisa diperiksa mesin.
- **Tingkat risiko** adalah penilaian pengelola, bukan hasil pengukuran; yang diukur mesin adalah
  konsistensinya dengan matriks dan kelengkapan pemilik/bukti/tindak lanjut.
- Tindak lanjut bertanggal **"rencana"** belum tentu terlaksana (mis. permintaan data desa ke OPD);
  yang dijamin adalah bahwa rencana itu tercatat, bertanggal, dan terlihat publik.
- Halaman ini memuat **peran**, bukan nama pejabat: pertanyaan "siapa orangnya" dijawab lewat
  dokumen kepegawaian, bukan lewat portal data.

## 6. Cara mengulang

```bash
npx vitest run src/lib/__tests__/tata-kelola-risiko.test.ts src/app/api/tata-kelola-risiko/route.test.ts
node scripts/uji-tata-kelola.mjs             # exit 0 — 13 pemeriksaan
node scripts/uji-tata-kelola.mjs --sabotase  # exit 1 — bukti pemeriksa bukan hiasan
```

## 7. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| CMP-03 (tata kelola risiko AI) | 🟡 dokumen 10 §13 ✅; pemilik risiko ⬜ | ✅ register 9 risiko berbasis kode: pemilik **peran** + tanggung jawab, kendali berbukti (berkas nyata + endpoint), tindak lanjut bertanggal, tenggat tinjauan per risiko yang dijaga harness |
