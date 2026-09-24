# 27 — Laporan CMP-02: keterbukaan penggunaan AI pada layanan publik

**Tanggal:** 24 September 2026 · **Cabang:** `dev` (tanpa menyentuh `main`, tanpa operasi remote)
**Rujukan:** SE Menteri Kominfo No. 9 Tahun 2023 tentang Etika Kecerdasan Artifisial
**Status dokumen 10:** `⬜ (teks notis belum ada)` → **✅**

## 0. Catatan lanjutan (audit ulang 24 Sep 2026)

Komponen notis dari butir ini (`src/components/NotisTransparansi.tsx`) sempat membawa **cacat
aksesibilitas**: tautan "Keterbukaan penggunaan AI" bergaya tombol `py-1.5` tanpa kelas
`target-min` sehingga tinggi sasarannya < 24 px (WCAG 2.2 SC 2.5.8). Cacat ini **tidak**
tertangkap saat butir ini selesai karena harness aksesibilitas waktu itu hanya memeriksa
`/dashboard` sementara komponen ini muncul di sana **sesudah** CMP-02 dipasang. Sudah diperbaiki
(tautan diberi `target-min`, ditambah uji unit + sabotase, cakupan harness diperluas ke
`/keterbukaan` dan `/tata-kelola-risiko`). Rinci: [laporan 31](31-LAPORAN-AUDIT-ULANG.md).

## 1. Ringkas

| Sebelum | Sesudah |
|---|---|
| Keterbukaan AI bergantung pada satu notis di bawah jawaban (FR-26) | Teks keterbukaan lengkap 7 bagian pada halaman publik `/keterbukaan`, sekaligus tersedia untuk mesin di `/api/keterbukaan` |
| Tidak ada tempat yang menyatakan **keadaan layanan AI** kepada pengguna sebelum ia bertanya | Halaman menyatakan keadaan yang **sebenarnya saat dibuka** (aktif / bayangan / mati), termasuk bila penyedia gagal menjawab |
| Penjelasan "siapa bertanggung jawab" tidak ada | Bagian kendali manusia: penanggung jawab isi = pengelola data, saklar operator di `/admin/ai-toggle`, laporan warga ditinjau manusia |
| Klaim privasi tersebar di kode | Bagian data & privasi: apa yang dikirim ke penyedia, dan pagar NIK sebelum panggilan model |
| Tidak ada tenggat peninjauan teks | Tenggat tinjauan **6 bulan** (berikutnya 24 Mar 2027), diperiksa harness dari tanggal |

Uji: **648 → 669** (21 uji baru). Harness baru: `scripts/uji-keterbukaan.mjs` (**24 pemeriksaan**, tiga keadaan aplikasi).

## 2. Yang dibangun

- **`src/lib/keterbukaan-ai.ts`** — satu-satunya sumber teks keterbukaan (halaman + endpoint + notis per jawaban). Fungsi murni: estado diterima sebagai data, sehingga bisa diuji tanpa server.
  - `pengungkapanAi(runtime)` → 7 bagian: peran AI · keadaan sekarang · kendali manusia · data & privasi · keterbatasan · hak & koreksi · versi/riwayat.
  - `kalimatKeadaan()` — mengikuti keadaan nyata, termasuk tiga tingkat kegagalan penyedia.
  - `KLAIM_TERLARANG` + `klaimTerlarang()` — daftar klaim mutlak yang dilarang muncul di teks publik.
  - `notisPerJawaban` — kalimat notis per jawaban (dari `teksNotis()` FR-26) **dipublikasikan** supaya dapat diperiksa mesin.
- **`/keterbukaan`** (halaman server) & **`/api/keterbukaan`** (mesin) — keduanya memanggil fungsi yang sama; harness membandingkan kalimat keadaan halaman dengan endpoint (satu sumber teks).
- **`src/components/NotisTransparansi.tsx`** — tautan "Keterbukaan penggunaan AI (CMP-02)" pada notis jawaban (jalur temuan dari jawaban → keterbukaan).
- **`scripts/uji-keterbukaan.mjs`** — uji ujung-ke-ujung tiga keadaan + mode `--sabotase`.
- **`scripts/bandingkan-jawaban.mjs`** — alat regresi A/B (lihat §4.4); dipakai juga untuk butir berikutnya.

## 3. Temuan yang mengubah desain

### 3.1 "Satu kegagalan ≠ penyedia mati" — dan teks harus jujur pada keduanya

Draf pertama harness menuntut: setelah satu panggilan model gagal, keterbukaan wajib menyatakan penyedia tidak terjangkau. Harness menolak — dan **harness yang benar**: `ringkasKesehatan()` membuka pemutus sirkuit setelah **3** kegagalan berturut (2 untuk galat auth), jadi menyebut "penyedia mati" setelah satu kegagalan justru **melebih-lebihkan**.

Perbaikan yang lahir dari temuan itu: keterbukaan kini punya **tiga** pernyataan kegagalan:

| Keadaan terukur | Kalimat yang wajib muncul |
|---|---|
| 1 kegagalan (`gagalBerturut ≥ 1`, sirkuit masih tertutup) | "Panggilan model terakhir gagal (sebab: jaringan) … jawaban pada saat itu disusun dari data; sistem mencoba lagi pada permintaan berikutnya." |
| ≥ 3 kegagalan / galat auth (sirkuit terbuka) | "Penyedia model sedang tidak menjawab (sebab: …), sehingga jawaban yang keluar saat ini berasal dari data, bukan dari model." |
| tanpa kegagalan | tidak ada kalimat kegagalan sama sekali (diuji: kalimat itu bukan basa-basi) |

### 3.2 Mode bayangan bukan mode aktif

Uji pertama saya memakai `AI_ENABLED=true` + `AI_SHADOW=true` dan gagal. Setelah membaca `isAiShadow()`: mode bayangan = **`AI_ENABLED=false` + `AI_SHADOW=true`**. Ditemukan bukan di kode baru, tetapi lewat uji yang memaksa membedakan "dipanggil untuk diukur" dari "ditampilkan ke pengguna" — dan keterbukaan harus mengikuti yang **ditampilkan**. Env uji diperbaiki, bukan kodenya (kode sudah benar).

### 3.3 Klaim privasi harus diuji, bukan ditulis

Bagian "data & privasi" mengklaim pertanyaan ber-NIK tidak pernah sampai ke penyedia model. Harness membuktikannya dengan pertanyaan berisi NIK 16 digit: jawaban yang keluar adalah kalimat penolakan pagar masuk dengan `ai.used=false` (tidak ada panggilan model).

## 4. Bukti

### 4.1 Uji

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | **669 lulus** (39 berkas; dari 648) |
| `npx tsc --noEmit` | 0 kesalahan |
| `npm run build` | 0 kesalahan |

### 4.2 Harness `scripts/uji-keterbukaan.mjs` — `verifikasi/uji-keterbukaan.txt` (exit 0, 24 pemeriksaan)

```
A. Statis        : 7 bagian · unsur SE 9/2023 lengkap · bebas klaim mutlak (endpoint & halaman) ·
                   kalimat keadaan halaman = endpoint · tenggat 2027-03-24 belum lewat ·
                   kanal koreksi & saklar dicantumkan · tidak ada kunci API bocor
B. AI mati       : endpoint "mati" + teks "TIDAK aktif"; jawaban ai.used=false dan notis yang
                   disiapkan = notis "tanpa AI"; pertanyaan ber-NIK ditolak pagar masuk
C. AI hidup      : endpoint "aktif" (custom · mock-uji · terjangkau); jawaban ai.used=true
                   (grounded=pass) dan notis = "disusun oleh model bahasa AI"
D. Penyedia gagal: 1 kegagalan ⇒ "panggilan model terakhir gagal" (dan BELUM mengklaim mati);
                   3 kegagalan ⇒ "sedang tidak menjawab"; /api/status sependapat (reachable=false)
```

Kontrol negatif (harness diuji bisa gagal): `node scripts/uji-keterbukaan.mjs --sabotase` → **exit 1**,
1 pemeriksaan gugur (`verifikasi/uji-keterbukaan-sabotase.txt`).

### 4.3 Uji unit yang menjaga kejujuran (`keterbukaan-ai.test.tsx`, 18 uji)

Lima keadaan runtime diuji satu per satu — mati, aktif, bayangan, penyedia gagal, status tidak
terbaca — ditambah uji bahwa penyedia/model yang tidak diketahui ditulis "tidak dicantumkan"
(bukan ditebak), uji SABOTASE yang membuktikan pemeriksa klaim tidak vakum, dan uji bahwa
pemetaan notis sama persis dengan keluaran `teksNotis()` milik FR-26.

### 4.4 Regresi nol — A/B 12 kueri sebelum vs sesudah (`verifikasi/uji-regresi-cmp02.txt`)

Dua build dijalankan berurutan (sebelum: `7b1cae2`; sesudah: pohon kerja CMP-02) di atas korpus
uji sandbox yang sama; 12 jawaban dibandingkan setelah membuang bidang **waktu** dan bidang
**baru** milik CMP-02/FR-18:

```
  kueri diperiksa : 12
  kueri berbeda   : 0
```

Artinya: halaman/endpoint keterbukaan tidak mengubah satu pun jawaban yang sudah ada — jalur
jawaban tetap persis seperti sebelumnya.

## 5. Batas yang dinyatakan

- Keterbukaan menjelaskan **peran** AI, bukan **kinerja** AI: angka mutu jawaban (mis. skor model
  pada set evaluasi) tidak dipublikasikan di halaman ini — bila diinginkan, itu butir terpisah.
- Tenggat tinjauan **6 bulan** adalah pilihan pengelola, bukan tuntutan surat edaran; yang dituntut
  adalah peninjauan berkala, dan itu kini terjaga mekanis (harness menolak bila terlambat).
- Konten halaman belum ditinjau secara hukum oleh bagian hukum pemda; isinya pernyataan teknis
  keadaan sistem.
- Angka pada §4.4 berasal dari korpus uji sandbox (1.210 record), **bukan** katalog produksi; yang
  diuji adalah kesamaan perilaku, bukan mutu jawaban.

## 6. Cara mengulang

```bash
npx vitest run src/lib/__tests__/keterbukaan-ai.test.tsx src/app/api/keterbukaan/route.test.ts
node scripts/uji-keterbukaan.mjs            # exit 0 — tiga keadaan aplikasi
node scripts/uji-keterbukaan.mjs --sabotase # exit 1 — bukti harness bisa gagal
node scripts/bandingkan-jawaban.mjs 3201 /tmp/sebelum.json                 # tangkap
node scripts/bandingkan-jawaban.mjs --banding /tmp/sebelum.json /tmp/sesudah.json
```

## 7. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| CMP-02 (keterbukaan penggunaan AI) | ⬜ teks notis belum ada | ✅ teks keterbukaan 7 bagian (halaman + mesin), pernyataan keadaan nyata termasuk kegagalan penyedia, tenggat tinjauan 6 bulan terjaga mekanis |
