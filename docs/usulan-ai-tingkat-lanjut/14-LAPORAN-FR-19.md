# 14 — Laporan FR-19: sitasi per klaim (setiap kalimat klaim menunjuk baris buktinya)

**Tanggal:** 22 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` @ `6adf81d`
**Sifat pekerjaan:** butir berikutnya sesuai urutan dokumen `10` — "menaikkan kepercayaan paling tinggi
per satuan usaha". Usaha sebenarnya **lebih kecil** dari perkiraan awal (dokumen menyebut `L`).

---

## 1. Masalah yang ditutup

| Sebelum | Sesudah |
|---|---|
| Pembaca melihat narasi berisi angka dan daftar bukti — tetapi harus membandingkan keduanya sendiri untuk memverifikasi satu angka | Setiap kalimat yang menyatakan angka diberi penanda `[n]`; baris bukti ke-n pada tabel diberi nomor yang sama |
| Tidak ada cara mesin memeriksa "apakah ada klaim tanpa dasar" | Balasan API memuat `sitasi { totalKlaim, bersitasi, tanpaSitasi[] }`; `tanpaSitasi` harus kosong |
| Verifikasi hanya bisa "dipercaya" | Verifikasi bisa diukur: `scripts/uji-sitasi.mjs` menjalankan 50 keluaran sampel lalu **memeriksa sendiri** tiap penanda |

Contoh nyata (mode deterministik, korpus stub):

```
sebelum : …ditemukan 1 indikator terkait: Jumlah ASN 9.610 Pegawai (BKPSDM, 2026).
sesudah : …ditemukan 1 indikator terkait: Jumlah ASN 9.610 Pegawai (BKPSDM, 2026) [1].
          [1] = baris bukti #1 · Jumlah ASN · 9610 · Pegawai · BKPSDM · 2026
```

---

## 2. Definisi yang dipakai (sengaja sempit & dapat diuji)

**KLAIM** = kalimat yang memuat sekurang-kurangnya satu **angka nilai** (besaran data).

Bukan klaim:
- kalimat tanpa angka;
- kalimat yang hanya memuat **tahun** ("berlaku sejak 2026") — keterangan waktu, bukan nilai;
- kalimat yang hanya memuat **jumlah meta**: "ditemukan 1 indikator", "3 OPD", "12 record" —
  angka itu menyebut ukuran sistem, bukan data, sehingga tidak punya baris bukti yang bisa dirujuk.

Aturan ini dituliskan di dalam kode (`src/services/sitasi-per-klaim.ts`) dan diuji satu per satu.

### Pencocokan angka yang jujur, bukan "kira-kira cocok"

| Kasus | Perlakuan |
|---|---|
| `9.610` vs `9610` (pemisah ribuan) | cocok |
| `31,4` vs `31,4` (desimal koma) | cocok |
| `1,44 Triliun` vs nilai penuh `1.438.857.592.538,6` | cocok — toleransi 0,6% setara pembulatan 2 desimal pada skala |
| `31,9` vs `31,4` | **tidak** cocok (selisih 1,6% > toleransi) |
| angka apa pun di luar daftar bukti | **tidak diberi penanda**, dilaporkan ke `tanpaSitasi` |
| satu kalimat memuat dua nilai | dua penanda, urut menaik (`[1][2]`) |
| satu nilai cocok ke beberapa baris (mis. dua baris bernilai 159) | baris yang nama indikator/OPD-nya disebut di kalimat dipilih lebih dahulu |

Modul juga **idempoten**: penanda yang sudah ada dibersihkan lebih dahulu, sehingga riwayat jawaban
lama yang sudah bersitasi tidak akan menumpuk penanda.

---

## 3. Di mana penanda dipasang (dan mengapa di situ)

| Tempat | Isi | Alasan |
|---|---|---|
| `presentation.narrative` | penanda `[n]` dihitung dari **urutan bukti final** presentasi | tampilan boleh mengurutkan ulang bukti (mis. menaikkan baris paling relevan); nomor penanda harus cocok dengan tabel yang dilihat pembaca |
| balasan API | `narasiBersitasi` + `sitasi` | supaya pemeriksaan dapat dilakukan mesin (gerbang uji terima & skrip 50 sampel) — indeks di sini menunjuk urutan `evidence` pada balasan |
| tombol salin/ekspor brief | ikut memuat penanda (teks narasi apa adanya) | dokumen yang dibagikan tetap dapat diverifikasi |

Kolom **"Rujukan"** pada tabel "Evidence yang dipakai" menampilkan nomor baris 1..n, dan kepala tabel
menampilkan ringkasan `x/y klaim bersitasi`. Bila ada klaim yang tidak dapat dirujuk, UI menampilkan
peringatan eksplisit (bukan menyembunyikannya).

---

## 4. Bukti

### 4.1 Kriteria terima dokumen 10: "0 klaim tanpa rujukan pada 50 keluaran sampel"

Dijalankan dengan `node scripts/uji-sitasi.mjs` (50 pertanyaan: 45 dari katalog + 5 di luar katalog):

| Mode | Keluaran sampel | Kalimat klaim | Klaim bersitasi | Klaim tanpa rujukan | Penunjukan salah |
|---|---|---|---|---|---|
| **AI** (`verifikasi/uji-sitasi-ai.txt`) | 50 | 42 | **42** | **0** | **0** |
| **Deterministik** (`verifikasi/uji-sitasi-det.txt`) | 50 | 42 | **42** | **0** | **0** |

8 dari 50 jawaban tidak memiliki bukti — itu pertanyaan di luar katalog (mis. "berapa jumlah drone di
Kecamatan Peusangan"); narasinya tidak diberi penanda palsu, dan justru **itulah** ujian "tidak mengarang".

Skrip ini tidak sekadar mempercayai ringkasan server: ia **memeriksa sendiri** setiap penanda `[n]`
dan menuntut nilai baris bukti ke-n benar-benar muncul pada kalimat itu — inilah yang membuat angka
"0 penunjukan salah" bermakna.

### 4.2 Uji & gerbang

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | bersih |
| `npx vitest run` | **28 berkas / 343 uji lulus** (dari 317) |
| `npx next build` | sukses |
| `verifikasi/uji-terima.sh` (dengan `SAPA_SITASI_PENUH=1`) | **LULUS** — 24 centang, termasuk `uji 50 sampel: 42/42 klaim bersitasi` |
| Seri patch di klon bersih `main` | seluruh seri `0001`…`0015` → **0 baris berbeda** dengan cabang (diperiksa ulang di akhir) |

Uji baru: 18 uji modul (termasuk kasus "tidak mengarang", toleransi, idempotensi, batas penanda),
8 uji presentasi (termasuk pemeriksaan bahwa setiap penanda menunjuk baris yang nilainya ada pada
kalimat itu), 3 uji rute API.

---

## 5. Batas yang dinyatakan terbuka

1. **Cakupan**: FR-19 berlaku pada **narasi**. Angka pada kartu metrik, tabel, dan grafik tidak diberi
   penanda karena tidak mengandung kalimat; keabsahannya sudah dijamin pagar grounding (INV-01) dan
   tabel/grafik memang berasal langsung dari baris bukti.
2. **Klaim non-angka** (mis. "kualitas udara membaik") tidak dihitung sebagai klaim dan tidak dirujuk.
   Ini disengaja: mendeteksi klaim kualitatif butuh penilaian makna, bukan pencocokan angka — dan
   mengklaim bisa mendeteksinya tanpa dasar justru melanggar semangat "tidak menyesatkan".
3. **Satu angka bisa cocok ke beberapa baris** (kebetulan nilai sama, mis. 159 pada dua indikator
   berbeda). Urutan prioritas memakai nama indikator/OPD yang disebut di kalimat; bila tidak ada
   petunjuk, penanda bisa menunjuk baris pertama yang cocok. Pembaca tetap bisa menelusuri lewat tabel.
4. **Evaluasi 90 item belum dijalankan ulang** hari ini (sandbox tanpa akses SPLP). Perubahan FR-19
   hanya menambahkan penanda pada teks narasi dan bidang baru pada balasan; gerbang invarians dan
   seluruh 343 uji tetap hijau.
5. **Uji 50 sampel memakai korpus stub** (10 indikator). Mekanismenya teruji penuh; angka produksi
   perlu dijalankan saat daring dengan perintah yang sama.

---

## 6. Cara memakai

```bash
# cepat (3 pemeriksaan) — bagian otomatis dari uji terima
bash verifikasi/uji-terima.sh

# lengkap: 50 sampel + evaluasi
SAPA_SITASI_PENUH=1 AI_URL=http://127.0.0.1:3000 bash verifikasi/uji-terima.sh

# hanya uji sitasi (server apa pun yang hidup)
SAPA_EVAL_URL=http://127.0.0.1:3000 node scripts/uji-sitasi.mjs
```

Bagi tim data: "0 klaim tanpa rujukan" kini menjadi **salah satu ambang lulus** — bila kelak muncul
(umpananya angka yang dihitung sendiri oleh AI di luar bukti), gerbang akan menolak dan
`tanpaSitasi` menunjuk kalimatnya secara persis.

---

## 7. Langkah berikutnya

Sisa urutan dokumen `10`: **FR-12** (lapis semantik berbahasa Indonesia: embedding prakomputasi +
fusi RRF — paling mahal, lompatan mutu terbesar) → lalu kelompok C yang tersisa (FR-20 tag sebab,
FR-23 pembersihan masukan, FR-24 pemeriksa pasangan entitas) dan sisa kelompok D (NFR-09 aksesibilitas,
OPS-03 penyegaran terjadwal, CMP-02/03/04 kepatuhan).
