# 26 — Laporan DS-05: Kamus Sinonim Daerah

Tanggal: 24 Sep 2026 · Cabang: `dev` (tanpa menyentuh `main`, tanpa operasi remote)
Kriteria terima dokumen 10: **≥ 50 entri** dan **tiap 3 bulan ditinjau** · Status sebelum: 🟡 (sebagian ✅)

## 1. Masalah yang diselesaikan

Pengguna SAPA menulis dengan istilah yang dipakai sehari-hari di Aceh, katalog SPLP memakai
kata baku pemerintahan. Penelusuran leksikal deterministik mencocokkan **token**, jadi istilah
daerah yang tidak ada di nama indikator berakhir sebagai "tidak ditemukan" — padahal datanya
ada. Terukur pada korpus uji sandbox (1.210 record): kueri `peukan`, `pade`, `jurong`, `lampoh`,
`keude`, `warung`, `gampong` semuanya menemukan indikator yang benar **setelah** kamus dipasang,
dan semuanya gagal **sebelum** (lihat §4.2 butir C — 8/8 berubah).

## 2. Temuan saat kurasi & verifikasi (yang membentuk desain)

### 2.1 Sebagian istilah yang diduga perlu dipetakan TIDAK boleh dipetakan

Dokumen 10 menyebut contoh `gampong, meugang, mustahik, PPKBD`. Ternyata **tiga di antaranya
sudah ada di katalog produksi**, sehingga memetakannya justru menyesatkan:

| Istilah | df di katalog produksi | Alasan tidak dipetakan (katalog) |
| --- | --- | --- |
| `meugang` | 2 | "Santunan Hari Meugang Mustahik Fakir" — pengguna yang menyebut meugang memang menunjuk ini |
| `mustahik` | 8 | banyak indikator ber-mustahik (pendidikan, santunan) |
| `ppkbd` | 7 | "Keg. Yang dilaksanakan PPKBD (KIE)" |
| `dayah` | 10 | "Jumlah Dayah dengan akreditasi B" |
| `bumdes` | 5 | "BUMDes Kondisi Baik" |
| `blang` | 3 | nama daerah irigasi "BLANG DELEM" — bukan kata umum "sawah" |

Aturan yang lahir dari temuan ini: **hanya kata yang ber-df 0 di katalog yang boleh dipetakan**,
dan 18 istilah yang gugur dicatat di `SUDAH_ADA_DI_KATALOG` beserta angka df-nya supaya tidak
"diperbaiki" lagi pada tinjauan berikutnya. Uji unit menjaga daftar itu tetap hidup.

### 2.2 Dua entri MATI ditemukan oleh uji unit (bukan oleh mata)

| Entri | Kenapa mati | Tindakan |
| --- | --- | --- |
| `padé` → padi | pembersih token membuang aksen di ujung kata, jadi token yang benar-benar diuji adalah `pad`; sedangkan `pad` sudah ada di katalog produksi (df=3) | entri dibuang; padanannya sudah tercakup entri `pade` |
| `nanggroe` → kabupaten/daerah | kedua padanannya stopword domain sehingga token hasil pemetaan langsung dibuang | entri dibuang |

Keduanya dicatat sebagai komentar di kepala modul: menambahkannya kembali tanpa mengubah
pembersih token akan mengulang kesalahan yang sama.

### 2.3 Kueri uji harus benar-benar mengisolasi kamus

Draf pertama kueri end-to-end mencampur kata katalog ("produksi pade", "panjang jurong",
"bansos"): 7 dari 8 kueri berhasil **juga** saat kamus dimatikan, karena penelusuran sudah
tertolong kata lain — jadi uji itu tidak membuktikan apa pun. Kueri dipertajam menjadi istilah
daerah murni (`pade`, `jurong`, `keude`, …) dan **8/8 kini berubah hasil** ketika kamus
dimatikan.

### 2.4 Padanan yang hanya ada di produksi tidak bisa diuji end-to-end di sandbox

Contoh: `krueng` → `['sungai','air']`. Kata `sungai` ber-df 6 di katalog produksi tetapi **0** di
korpus uji sandbox, sehingga gerbang konsep-asing menolak kueri `krueng`. Hal ini bukan cacat
kamus, melainkan batas korpus uji — dan karena itu setiap entri menyimpan dua bukti: `dfProduksi`
(ukur di katalog produksi) dan `terbuktiKorpusUji` (bisa diuji end-to-end di sandbox, **32 entri**).

## 3. Perubahan

- **`src/lib/kamus-daerah.ts` (baru)** — **57 entri** (≥ 50 ✔), masing-masing dengan `arti`,
  `sumber`, `dfProduksi`, dan `terbuktiKorpusUji`; ditambah `SUDAH_ADA_DI_KATALOG` (18 istilah
  yang sengaja tidak dipetakan), `statusTinjauan()` (tenggat 3 bulan: ditinjau 24 Sep 2026,
  berikutnya **24 Des 2026**), dan saklar negatif `SAPA_KAMUS_DAERAH=off`.
- **`src/lib/sapa-client.ts`** — `tokenizeQuery` memakai `normalkanKata` (kamus daerah → lalu
  singkatan/typo) dan frasa daerah (`tuha peut` → `lembaga desa`) diganti sebelum pemotongan
  token. Dengan kamus dimatikan, jalurnya **persis** seperti sebelum DS-05.
- **`scripts/uji-kamus-daerah.mjs` (baru)** — statis + end-to-end + kontrol negatif (lihat §4.2).
- **`scripts/ukur-df-kamus.mjs` (baru)** — alat tinjauan 3 bulan: mengukur ulang df setiap kata &
  padanan pada korpus yang diberikan, memisahkan "padanan mati" (harus diperbaiki) dari "hanya
  ada di katalog produksi" (informasi), dan mencetak baris `dfProduksi` siap salin.
- **`src/lib/__tests__/kamus-daerah.test.ts` (baru)** — 12 uji: jumlah & kelengkapan, keamanan
  (tidak ada kata kamus di katalog), klaim `terbuktiKorpusUji` tidak boleh berbohong, tidak ada
  entri mati, kontrol negatif, tenggat tinjauan, dan uji dampak samping (§4.4).

## 4. Bukti

### 4.1 Uji unit, tipe, build

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | **38 berkas / 648 lulus** (dari 636 sebelum DS-05) |
| `npx tsc --noEmit` | 0 kesalahan |
| `npm run build` | 0 kesalahan |

### 4.2 Harness `scripts/uji-kamus-daerah.mjs` — `verifikasi/uji-kamus-daerah.txt`

```
A. Statis    : 57 entri · kata kunci unik · setiap entri ber-df > 0 ·
               tenggat tinjauan 2026-12-24 BELUM lewat ·
               0 kata kamus yang sudah ada di katalog korpus uji
B. End-to-end: 8/8 kueri beristilah daerah menemukan indikator katalog
C. Negatif   : 8/8 kueri berubah hasil ketika SAPA_KAMUS_DAERAH=off
pemeriksaan lulus 13 · LULUS (exit 0)
```

Cuplikan kontrol negatif (verbatim dari berkas bukti):

```
     · "jumlah gampong": kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "peukan":        kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "pade":          kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "jurong":        kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "keude":         kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "jumlah ureung": kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "lampoh":        kamus AKTIF menemukan · kamus MATI tidak menemukan
     · "warung":        kamus AKTIF menemukan · kamus MATI tidak menemukan
```

### 4.3 Alat tinjauan — `verifikasi/ukur-df-kamus-produksi.txt` & `-uji.txt`

| Korpus | Hasil |
| --- | --- |
| Katalog **produksi** 2.065 record / 1.790 nama unik | 57 entri · **0** kata kamus yang mulai ada di katalog · **0** padanan mati → LULUS |
| Korpus uji **sandbox** 1.210 record / 395 nama unik | 57 entri · 0 kata menyusup · 0 mati · **27** entri "hanya terbukti di katalog produksi" (informasi, bukan cacat) |

### 4.4 Nol dampak samping pada kueri yang tidak memakai istilah daerah

Uji unit membandingkan `tokenizeQuery` dengan dan tanpa kamus untuk **seluruh 90 item**
`data/eval-set.json`: token wajib identik untuk setiap item yang tidak memuat kata kamus
(terukur: ≤ 3 item yang memang menyentuh kamus, dan hanya item itulah yang boleh berbeda).
Ini pengganti A/B HTTP untuk DS-05: satu-satunya permukaan yang berubah adalah pemotongan token.

## 5. Batas & hal yang tidak dikerjakan

- **27 entri** tidak dapat dibuktikan end-to-end di sandbox karena padanannya hanya ada di
  katalog produksi; buktinya adalah angka `dfProduksi` terukur + alat tinjauan, bukan uji harness.
- Kamus **tidak** memperbaiki kesalahan makna: `meunasah → masjid` dan `mukim/sagoe → kecamatan`
  adalah pendekatan terdekat, dan hal itu dinyatakan di medan `arti`.
- Tinjauan 3 bulan dijalankan oleh **manusia + alat** (tanggal + harness yang menolak lewat
  tenggat), bukan penyelarasan otomatis ke katalog: SAPA tidak menyediakan daftar istilah resmi
  yang bisa disinkronkan mesin.
- Entri yang tidak punya padanan ber-df > 0 **tidak** dipaksakan masuk demi memenuhi angka 50 —
  dua entri justru dibuang karena itu (§2.2).

## 6. Cara mengulang bukti

```bash
npx vitest run                                   # 38 berkas / 648 lulus
npx tsc --noEmit                                 # 0
npm run build                                    # 0
node scripts/uji-kamus-daerah.mjs                # exit 0 (menyalakan stub SPLP + 2 aplikasi)

# kontrol negatif: 8/8 kueri wajib berubah hasil
SAPA_KAMUS_DAERAH=off node scripts/uji-kamus-daerah.mjs   # bagian B wajib GAGAL

# tinjauan 3 bulan (dokumen 10): ukur ulang terhadap korpus terbaru
node scripts/ukur-df-kamus.mjs verifikasi/korpus-produksi.json
```

## 7. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
| --- | --- | --- |
| DS-05 (dok 10 h.185) | 🟡 sebagian ✅ | ✅ **selesai** — 57 entri (≥ 50), tinjauan 3 bulan berjalan mekanis (tenggat 24 Des 2026; harness menolak bila lewat), keamanan "hanya kata ber-df 0" diuji, 8/8 kueri daerah terbukti dan 8/8 berubah saat kamus dimatikan |
| 3 contoh dok 10 (meugang, mustahik, PPKBD) | diduga perlu dipetakan | terukur **sudah ada di katalog** → sengaja TIDAK dipetakan, alasannya dicatat di kode |

## 8. Berikutnya

Urutan yang disetujui 24 Sep 2026 sudah tuntas (DS-03 → NFR-09 → FR-18 → DS-05). Sisa dokumen 10
yang masih terbuka: **CMP-02/03/04** (perbandingan antarwilayah/kecamatan), **EV-05** (eval
parafrase lanjutan), serta butir yang tidak dapat dikerjakan dari ruang kerja ini (EV-06/NFR-01,
DS-04, OPS-05, Fase B).
