# 17 — Laporan FR-24: Pemeriksa Pasangan Entitas (melawan *deceptive grounding*)

**Tanggal:** 23 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` (tidak menyentuh `main`)
**Kriteria terima (dokumen 10):** *0 kesalahan pasangan pada 50 keluaran sampel.*

---

## 1. Masalah yang diselesaikan

Gerbang yang sudah ada memeriksa satu hal: **apakah setiap angka di narasi ada di daftar bukti.**
Itu menutup halusinasi angka. Yang belum tertutup adalah kebalikannya — angka yang **benar** tetapi
**dipasangkan salah**:

> "Jumlah produksi komoditas perkebunan Kopi Arabika **29.019 Jiwa** menurut **Dinas Kesehatan**
> pada **2026**."

Semua angka di kalimat itu ada di daftar bukti. Kenyataannya: 29.019 adalah produksi kopi
**Ton/Tahun**, dihasilkan **Dinas Pertanian**, tahun **2025**. Jawaban seperti ini lolos grounding,
lolos anti-halu, dan **tampak paling meyakinkan** justru karena angkanya benar — inilah
*deceptive grounding*, kelas salah yang paling berbahaya bagi portal data publik.

FR-24 memasang pemeriksa yang berjalan **setiap kali narasi akan disajikan**.

---

## 2. Apa yang diperiksa

Pemeriksaan bersifat **lokal per klausa** — pasangan entitas selalu berdekatan di dalam teks.

| # | Jenis temuan | Isi | Sifat |
|---|---|---|---|
| 1 | `nilai-tak-ada` | angka tidak dimiliki baris bukti mana pun | **keras** (narasi ditolak) |
| 2 | `entitas-bertabrakan` | klausa menyebut kecamatan X, angka milik baris bukan-X (termasuk baris tingkat kabupaten) | **keras** |
| 3 | `opd-bertabrakan` | klausa mengaitkan angka ke OPD yang bukan penghasilnya | **keras** |
| 4 | `satuan-bertabrakan` | satuan yang tertulis tepat setelah angka adalah satuan baris lain di katalog | **keras** |
| 5 | `tahun-bertabrakan` | tahun di klausa milik baris lain | lunak (dilaporkan) |
| 6 | `nilai-ambigu` | angka dipakai banyak baris dan klausa tidak menunjuk entitas mana pun | lunak |

**Keras** ⇒ narasi model tidak disajikan; pengguna menerima narasi katalog lengkap, dan sebabnya
dilaporkan lewat tag FR-20 `generasi:pasangan-entitas`. **Lunak** ⇒ hanya dilaporkan, jawaban tetap
disajikan (mis. tahun bisa memang disebut pengguna).

### Wajib bebas angka

Prosa penjelas (`ai.reason`) **tidak boleh memuat angka** — pelajaran FR-12 yang kini dijaga butir
uji terima 6d. Angka hidup di data terstruktur: `pemeriksaan.temuan[].nilai`, `ai.alasanPasangan`,
dan `/api/status`. Alasannya bukan estetika: prosa berangka pernah membuat enam item eval gagal
karena angka yang muncul di narasi tidak ada di daftar bukti.

---

## 3. Berkas

| Berkas | Perubahan |
|---|---|
| `src/services/pemeriksa-entitas.ts` **(baru)** | Modul murni: `periksaPasanganEntitas`, `pemilikAngka`, `kecamatanIndikator`, `daftarKecamatanDariIndikator`, `kunciOpd`, `atribusiOpd`, `satuanSetelahAngka`, `bersihkanNarasi`, `pecahKalimat`, `ringkasPemeriksaan`, `penjelasanPemeriksaan`. |
| `src/lib/sapa-client.ts` | `daftarKecamatan(records)` — kosakata wilayah tertutup dari katalog; logikanya **satu sumber** di modul pemeriksa (tidak ditulis ulang). |
| `src/services/answer-compose.ts` | Gerbang FR-24 setelah penolakan grounding, sebelum format presentasi; `pemeriksaan` pada **semua** hasil (termasuk jalur pagar & cache); `AiMeta.pasanganEntitas` + `alasanPasangan`. |
| `src/services/sebab-kegagalan.ts` | Tag sebab baru `generasi:pasangan-entitas` + label manusia. |
| `src/app/api/query/route.ts` · `stream/route.ts` | `pemeriksaan` ikut di balasan JSON **dan** streaming. |
| `scripts/uji-pasangan.mjs` **(baru)** | EV-24: 50 keluaran sampel diperiksa **oleh pemeriksa independen** (tidak memakai modul yang sedang diuji). |
| `scripts/eval-run.mjs` | Invarians baru: temuan keras pada jawaban yang disajikan = pelanggaran; rekap pasangan entitas per run. |
| `verifikasi/mock-llm.mjs` **(baru di repo)** | Penyedia tiruan dengan empat kepribadian, termasuk **`mock-tukar`** (menukar entitas) — kit serah terima kini swasembada untuk uji jalur AI. |
| `scripts/mock-llm-server.mjs` | Mode `MOCK_MODE=tukar` untuk pengujian lokal tanpa berkas tambahan. |
| `verifikasi/uji-terima.sh` | Bagian **6d** (5 butir) + harness 50 sampel lewat `SAPA_PASANGAN_PENUH=1`. |

---

## 4. Bukti terukur

### 4.1 Uji unit & statis

```
npx vitest run     →  31 berkas / 452 uji lulus
npm run typecheck  →  bersih
npx next build     →  sukses
```

### 4.2 Kriteria terima: 50 keluaran sampel

Dijalankan pada **dua** server: model yang jujur, dan model yang sengaja menukar entitas.

| Server | Keluaran diperiksa | Kesalahan pasangan | Narasi model ditolak | Temuan keras disajikan |
|---|---|---|---|---|
| `mock-pintar` (jujur) — `verifikasi/uji-pasangan-jujur.txt` | 50 | **0** | 0 | 0 |
| `mock-tukar` (menukar entitas) — `verifikasi/uji-pasangan-tukar.txt` | 50 | **0** | **8** | 0 |

Bacaan angkanya: pada model yang jujur, gerbang **tidak menolak apa pun** (bukan gerbang yang
menolak semuanya); pada model yang menukar entitas, gerbang menolak 8 narasi — dan yang sampai ke
pengguna tetap bersih di kedua kasus.

### 4.3 Uji terima otomatis

```
ADMIN_TOKEN=… AI_URL=:3116 DET_URL=:3117 SAPA_TUKAR_URL=:3119 SAPA_SKIP_EVAL=1 \
SAPA_PARAFRASE_PENUH=1 SAPA_SEBAB_PENUH=1 SAPA_PASANGAN_PENUH=1 bash verifikasi/uji-terima.sh
→ ✓ LULUS — semua ambang terpenuhi (37 centang)
```

Bagian 6d yang baru:

| Butir | Hasil |
|---|---|
| Balasan memuat `pemeriksaan` | ✓ (2 nilai diperiksa) |
| Jawaban tersaji bebas temuan keras | ✓ |
| Narasi model penukar entitas ditolak gerbang | ✓ |
| Prosa penolakan bebas angka & jawaban pengganti bersih | ✓ |
| Uji 50 sampel (EV-24) | ✓ 0 kesalahan pasangan |

### 4.4 Tidak ada regresi

Parafrase FR-12 **20/20** (negatif 5/5), sebab FR-20 tetap konsisten di kedua jalur, sitasi FR-19
tetap 0 klaim tanpa rujukan, dan eval tidak menunjukkan regresi pada snapshot baseline.

---

## 5. Tiga penuduhan palsu yang ditemukan verifikasi — dan diperbaiki di sumbernya

Ini bagian terpenting laporan ini. Pemeriksa entitas mudah menjadi **terlalu galak**, dan pemeriksa
yang menolak jawaban benar lebih buruk daripada tidak ada pemeriksa. Ketiganya ditemukan oleh
harness EV-24 (yang memakai pemeriksa independen, bukan modul yang diuji):

1. **Konstanta sistem dituduh angka karangan.**
   Narasi deterministik menulis "ditemukan **15** indikator terkait" dan "dari **1.210** record
   SAPA" — keduanya bukan klaim nilai. Perbaikan: daftar angka sah disamakan dengan yang dipakai uji
   invarians eval (jumlah record, jumlah OPD, jumlah bukti, OPD/indikator unik dalam bukti, jumlah
   kecocokan, tahun yang diminta pengguna).

2. **Kata dalam nama indikator dituduh nama OPD.**
   "Jumlah produksi komoditas **perkebunan**…" memuat kata "perkebunan", kata yang juga ada di nama
   OPD "Dinas Perkebunan"; 8 dari 50 keluaran model jujur ikut tertolak. Perbaikan: penyebutan OPD
   baru dihitung bila ada **penanda atribusi** di sekitarnya (tanda kurung, "menurut/dari/oleh",
   atau kata kerja pelaporan).

3. **Dua klausa dalam satu kalimat dianggap satu pernyataan.**
   "…di Kecamatan Celala tercatat 892,26 Orang**, dengan rincian terbesar pada** 8313 Orang" —
   angka klausa kedua dituduh milik Celala. Perbaikan: pemeriksaan dilakukan **per klausa** (titik,
   titik koma, dan koma yang diikuti spasi — koma desimal Indonesia tetap utuh karena tidak diikuti
   spasi).

Sesudah ketiganya diperbaiki, urutan pengujiannya diulang: `mock-pintar` → 0 penolakan;
`mock-tukar` → 8 penolakan. Keduanya 0 kesalahan pasangan.

Di sisi tata kelola, satu butir uji terima juga menangkap **kekeliruan pemeriksaannya sendiri**:
butir 6d semula menuntut `ai.alasanPasangan` bebas angka, padahal itu data audit terstruktur (angka
justru penunjuk baris yang salah). Yang wajib bebas angka adalah **prosa** `ai.reason`.

---

## 6. Keputusan desain

1. **Lokal per klausa, bukan per narasi.** Pasangan entitas selalu berdekatan; memeriksa jarak jauh
   memaksa pemeriksa menebak maksud kalimat, dan tebakan itulah sumber penuduhan palsu.
2. **Aturan OPD hanya menyala bila klausa menyebut TEPAT SATU OPD.** Bila klausa menyebut beberapa
   OPD (perbandingan, daftar), angka mana milik siapa tidak dapat dipastikan dari teks.
3. **Beberapa temuan sekaligus boleh muncul untuk satu angka** (nilai benar + OPD salah + satuan
   salah). Operator perlu gambaran penuh; aturan **lunak** saja yang dilewati bila sudah ada temuan
   keras.
4. **Penolakan mengganti seluruh narasi, bukan menambal kalimatnya.** Sama seperti gerbang grounding:
   pengguna menerima narasi katalog lengkap, bukan hasil tambalan.
5. **Wilayah memakai daftar tertutup dari katalog** (`daftarKecamatan`), bukan daftar kecamatan yang
   ditulis di kode — kalau OPD menambah kecamatan baru, pemeriksa ikut tahu tanpa perubahan kode.
6. **Kata asing dipisahkan dari pasangan.** `nilai-tak-ada` menangani angka karangan; itu sudah
   ditangani grounding, jadi temuan FR-24 dihitung **hanya** bila angkanya benar. Dua kelas ini
   dilaporkan terpisah supaya operator tahu mana yang perlu memperbaiki prompt dan mana yang perlu
   memperbaiki data.

---

## 7. Batas yang diketahui

1. **Klausa panjang masih bisa menipu.** Penolakan berbasis teks tidak memahami makna; kalimat yang
   sangat panjang dengan banyak anak kalimat dapat menyembunyikan pasangan salah dari aturan
   "tepat satu OPD". Vektor uji nyata berikutnya: model yang menulis paragraf padat tanpa pemisah.
2. **Nama OPD yang ditulis singkat** ("Dinas Pertanian" → "Pertanian") tidak dikenali sebagai
   atribusi, sehingga aturan OPD dilewati (arahnya aman: tidak menuduh, tetapi juga tidak menangkap).
3. **Tahun hanya diuji sebagai temuan lunak.** Jawaban dengan tahun salah tetap disajikan; menaikkan
   ini menjadi keras butuh bukti lebih dulu bahwa narasi pengguna tidak sah mengutip tahun lain.
4. **Pemeriksa hanya berjalan untuk narasi AI pada jalur penyajian.** Narasi katalog juga diperiksa
   (dilaporkan di `pemeriksaan`), tetapi **tidak pernah ditolak** — katalog adalah sumber kebenaran,
   jadi temuan keras di sana berarti bug katalog yang harus diperbaiki manusia, bukan disembunyikan.
5. **Belum ada ambang agregat di `/api/status`** (berapa kali gerbang FR-24 menyala per minggu).
   Untuk sekarang angkanya ada di keluaran eval dan di balasan tiap permintaan.
6. **Eval 90 item tidak dapat dijalankan luring** (korpus produksi butuh kredensial SPLP) — sama
   seperti batas FR-12; gerbang eval dijalankan tim Anda dengan perintah di dokumen 11.

---

## 8. Langkah berikutnya

Menurut urutan dokumen 10: **FR-23 — pembersihan masukan** (normalisasi masukan kotor/derau sebelum
retrieval: tanda baca berlebih, huruf acak, bahasa campur, singkatan tak dikenal), lalu Fase D
(NFR-09 aksesibilitas WCAG 2.2 AA, OPS-03 penyegaran terjadwal, NFR-07 telemetri `gen_ai.*`,
CMP-02/03/04 tata kelola).

Alasan FR-23 sesudah FR-24: FR-20 memberi **tag sebab**, FR-24 menutup **kelas salah paling
berbahaya**. Yang tersisa pada mutu jawaban adalah **masukan kotor** — pertanyaan dengan salah tulis
berat, tanda baca, atau campuran bahasa — yang sekarang hanya tertangani sebagian oleh lapis semantik
FR-12 dan sering berakhir sebagai `retrieval:tanpa-bukti` padahal datanya ada.
