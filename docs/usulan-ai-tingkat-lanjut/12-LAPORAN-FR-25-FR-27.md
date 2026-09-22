# 12 — Laporan FR-25 & FR-27: cap kesegaran data · dasbor celah pengetahuan

**Tanggal:** 22 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` @ `03313a1` (di atas `main` `ff00eb8`)
**Sifat pekerjaan:** dua butir termurah dari dokumen `10`, dikerjakan lebih dulu atas permintaan Anda
("kerjakan yang lebih murah dulu"), dengan syarat **tidak ada kesalahan**.

---

## 1. Ringkas

| Butir | Sebelum | Sesudah |
|---|---|---|
| **FR-25** tahun & kesegaran data | tahun data kadang muncul di dalam narasi; tanggal pengambilan tidak pernah dilaporkan | setiap jawaban membawa `dataFetchedAt`, `dataFingerprint`, `dataYears`; UI menampilkannya sebagai provenance |
| **FR-27** celah pengetahuan | pertanyaan yang tak terlayani hilang begitu saja | setiap kegagalan dicatat per minggu (teks disanitasi), dapat ditinjau lewat dasbor admin ber-token |
| Uji | 237 uji / 20 berkas | **289 uji / 24 berkas** |
| Gerbang uji terima | 4 pemeriksaan | 8 pemeriksaan (FR-25 & FR-27 kini bergerbang otomatis) |

Yang **tidak** berubah: kontrak balasan lama (tidak ada kunci yang dihapus), perilaku retrieval, angka eval,
dan pagar invarians (`INV-01`…`INV-07`). Semua tambahan bersifat **aditif**.

---

## 2. FR-25 — setiap jawaban membawa asal-usulnya

### Yang ditambahkan

1. `fetchSapaData()` (`src/lib/sapa-client.ts`) kini mengembalikan `meta: { diambilPada, sidik }` di samping
   `records` & `origin`. Panggilan lama tetap bekerja karena bentuknya tetap objek yang sama.
2. **Sidik korpus** (`dataFingerprint`) — FNV-1a 32-bit atas **isi** record (id, indikator, OPD, tahun,
   satuan, nilai) yang **diurutkan** lebih dahulu. Konsekuensinya, dan inilah yang diinginkan:
   - dua proses yang menarik data **sama** menghasilkan sidik **sama**, walau waktu tariknya berbeda;
   - perubahan isi sekecil apa pun (nilai/tahun/satuan) mengubah sidik, **termasuk bila jumlah record tetap**;
   - urutan balasan SPLP tidak mempengaruhi sidik (yang diukur isi, bukan urutan baris).
3. **Tahun data** (`dataYears`) — `tahunPadaBukti()` mengambil tahun 4-digit dari bukti, mengembalikan
   rentang sebagai dua tahun (`2022–2026` → `['2026','2022']`), urut menurun dan tanpa duplikat.
   Bila bukti tidak memuat tahun, hasilnya daftar kosong — **tidak ada tahun yang ditebak**.
4. **Provenance di UI** (`ExecutiveAnswerRenderer`): "Data SPLP ditarik … · jawaban disusun …", baris
   "Tahun data: …", dan "Sidik korpus: …" (semuanya ikut tersalin di tombol salin/Copy).
5. **Jalur streaming** (`/api/query/stream`) membawa ketiga bidang yang sama pada peristiwa `result`.

### Contoh balasan nyata (server lokal, data stub 10 record)

```json
{ "dataFetchedAt": "2026-09-22T10:26:43.355Z",
  "dataFingerprint": "33c96113",
  "dataYears": ["2026"],
  "timestamp": "2026-09-22T10:26:43.612Z" }
```

### Dua kejujuran semantik yang sengaja dituliskan

- `diambilPada` adalah waktu **korpus ditarik dari SPLP**, bukan waktu pengguna mengakses. Karena ada cache
  10 menit, nilainya bisa lebih tua dari `timestamp` jawaban — dan label UI memang berbunyi "data SPLP ditarik",
  bukan "diakses".
- Sidik ini **penanda versi, bukan penanda keamanan**: 32-bit, tabrakan mungkin secara teori. Cukup untuk
  "angka ini dari korpus versi mana" dan untuk membandingkan mode AI vs deterministik — tidak untuk tanda tangan kriptografis.

---

## 3. FR-27 — dasbor celah pengetahuan

### Alur

```
pertanyaan pengguna ──► jawaban tanpa bukti (atau AI ditolak gerbang)
                             │
                             ▼
             tentukanSebabCelah()  ← satu-satunya tempat aturan sebab (dipakai JSON & streaming)
                             │  'tanpa-bukti' | 'ai-ditolak'
                             ▼
             bersihkanPertanyaan() ← SELURUH digit, surel, tautan, nomor telepon dibuang
                             │
                             ▼
        catatCelah()  →  celah:pengetahuan:<YYYY-Www>   (TTL 8 minggu, maks 300 entri/minggu, teks ≤ 140 aksara)
                             │
                             ▼
   GET /api/admin/celah?minggu=…  (token)  →  halaman /admin/celah-pengetahuan
```

### Contoh sanitasi nyata

| Masuk | Tersimpan |
|---|---|
| `Berapa jumlah keluarga miskin per desa tahun 2026 dengan NIK 1171••••••••0003 hub 0812••••7890?` | `berapa jumlah keluarga miskin per desa tahun dengan nik hub?` |

Digit **tidak pernah** masuk penyimpanan, jadi NIK, nomor telepon, dan tahun pun hilang dari teks celah —
pagar privasi berlapis: sanitasi sebelum simpan, ditambah gerbang otomatis yang menolak bila ada digit
pada teks celah tersimpan.

### Pagar akses (fail-closed)

| Keadaan | Balasan |
|---|---|
| `ADMIN_TOKEN` tidak diset | **503** + penjelasan bahwa fail-closed (bukan membuka data) |
| token kosong/salah | **401** |
| token benar (header `x-admin-token` atau `?token=`) | 200 + daftar celah |

Perbandingan token memakai waktu tetap; balasan galat tidak pernah memuat token yang benar.

### Catatan operasi yang perlu diketahui

- **Tanpa Redis, penyimpanan hidup per-instance.** Di Vercel, tiap instance punya daftar celahnya sendiri
  sampai cache-nya didaur. Dengan Upstash terpasang, daftarnya menyatu. Ini keterbatasan bawaan, bukan cacat:
  dasbor tetap benar, hanya bisa "belum melihat" celah dari instance lain.
- Pencatatan hanya untuk **kegagalan**. Jawaban normal tidak memakan penyimpanan (diuji).
- Halaman admin menyimpan token di `sessionStorage` (`sapa-admin-token`) — tidak ada token di kode.

---

## 4. Bukti

### 4.1 Uji & build (repo ini)

| Perintah | Hasil |
|---|---|
| `npm run typecheck` | bersih |
| `npx vitest run` | **24 berkas / 289 uji lulus** (sebelumnya 237) |
| `npx next build` | sukses |

Uji baru yang menjaga invarians kedua butir:

- `src/lib/__tests__/meta-korpus.test.ts` (9 uji): bentuk meta, sidik stabil dalam cache, sidik sama antar
  proses untuk data sama, sidik berubah saat isi berubah, urutan balasan tidak mengubah sidik,
  kegagalan SPLP tidak menghasilkan versi palsu, opsi `SAPA_SPLP_BASE_URL`.
- `src/lib/__tests__/insight-celah.test.ts` (10 uji): privasi (tidak ada digit/NIK/telepon/surel tersimpan),
  kunci minggu ISO, dedupe, batas 300, teks kosong dilewati, kerapian teks.
- `src/lib/__tests__/admin-guard.test.ts` (8 uji) + `src/app/api/admin/celah/route.test.ts` (6 uji):
  503 saat token tak diset, 401 saat salah, 200 saat benar, kunci balasan persis empat bidang, tidak ada kebocoran.
- `src/app/api/query/route.test.ts` (+5 uji): ketiga bidang FR-25 terisi, kunci lama tetap ada (kontrak aditif),
  aturan sebab celah, pencatatan + sanitasi.
- `src/services/__tests__/grounding.test.ts` (+4 uji): `tahunPadaBukti()` menangani tahun kosong/`-`/rentang.

### 4.2 Uji terima otomatis (`verifikasi/uji-terima.sh`)

Keluaran lengkap: `verifikasi/uji-terima-hasil.txt` — **LULUS**, dengan dua bagian baru:

```
── 3. Kesegaran data & sidik korpus (FR-25) ──
  ✓ waktu tarik data dilaporkan (2026-09-22T10:26:43.355Z)
  ✓ sidik korpus dilaporkan (33c96113)
  ✓ daftar tahun data disertakan (dataYears)
  ✓ sidik konsisten antara jalur JSON & streaming
  ✓ mode AI & deterministik melaporkan versi korpus yang sama (33c96113)

── 4. Dasbor celah pengetahuan (FR-27) ──
  ✓ endpoint celah menolak tanpa token (HTTP 401, fail-closed)
  ✓ dasbor celah hidup untuk admin (minggu 2026-W39)
  ✓ pagar privasi celah: tidak ada digit pada pertanyaan tersimpan
```

### 4.3 Pemeriksaan pada server yang hidup (bukan hanya uji unit)

| Uji | Hasil |
|---|---|
| `POST /api/query` "Berapa jumlah penduduk?" | `dataYears: []` (record penduduk memang tanpa tahun — tidak ditebak) |
| `POST /api/query` "Berapa jumlah ASN?" | `dataYears: ["2026"]` |
| `POST /api/query` "Berapa panjang jalan kabupaten?" | `dataYears: ["2026","2022"]` (rentang → dua tahun) |
| `/api/query/stream` | peristiwa `result` memuat ketiga bidang, sidik **sama** dengan jalur JSON |
| server mode determinantik | melaporkan sidik **sama** (`33c96113`) → kedua mode melayani versi korpus yang sama |
| `/api/admin/celah` tanpa token / salah / benar | 401 / 401 / 200 |
| celah dari pertanyaan ber-NIK | tersimpan tanpa digit; NIK & nomor telepon tidak muncul di balasan mana pun |

### 4.4 Bukti bahwa serah terima aman (seri patch)

Dijalankan pada **klon bersih** `main` (bukan di cabang):

```
git am seri-patch/000[1-9]-*.patch   → 9 komit terpasang, tanpa konflik
git diff <cabang> HEAD               → 0 baris berbeda (kecuali folder seri-patch)
npm run typecheck                    → bersih di pohon hasil patch
npx vitest run                       → 289 uji lulus di pohon hasil patch
```

Cara C (`git apply --3way 00-semua.patch`) juga diuji: 57 berkas berubah bersih, menyisakan perubahan tanpa komit.

---

## 5. Yang **belum** diverifikasi (dinyatakan terbuka, bukan disembunyikan)

1. **Evaluasi 90 item tidak dijalankan ulang pada hari ini.** Sandbox kehilangan akses ke
   `api-splp.layanan.go.id`, sehingga korpus sungguhan tidak tersedia. Angka yang sahih tetap yang terakhir:
   `verifikasi/eval90-ai-run2.txt` (90/90, grounded 61/61, fallback 0) dan `eval90-det.txt` (90/90), keduanya
   pada komit `b64231d`. Yang membuat keduanya tetap berlaku: perubahan FR-25/FR-27 bersifat aditif
   (tidak menyentuh retrieval, penyusunan jawaban, maupun gerbang AI), dan hal ini **diuji** —
   uji kontrak memastikan semua kunci balasan lama masih ada dengan bentuk yang sama.
2. **Korpus stub bukan korpus produksi.** `verifikasi/stub-splp.mjs` hanya alat agar pengujian bisa jalan
   luring; 10 record bawaannya tidak mewakili 2.065 record dashboard. Jangan mengutip angka darinya.
3. **Penyimpanan celah tanpa Redis bersifat per-instance** (lihat §3).

Cara menutup butir 1 begitu internet tersedia (atau dari repo lokal Anda):

```bash
AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh
# tanpa SAPA_SKIP_EVAL, dua mode dinilai terhadap 90 item dan harus 90/90
```

---

## 6. Perubahan berkas (agar mudah ditinjau)

| Berkas | Sifat |
|---|---|
| `src/lib/sapa-client.ts` | `meta` + `sidikKorpus(records)` + `alamatSplp()` (runtime) |
| `src/services/grounding.ts` | `tahunPadaBukti()` |
| `src/types/index.ts` | bidang `dataFetchedAt`/`dataFingerprint`/`dataYears` + provenance |
| `src/app/api/query/route.ts`, `.../stream/route.ts` | menempelkan bidang FR-25; ekspor aturan celah (satu sumber) |
| `src/services/executive-presentation.ts`, `src/components/ExecutiveAnswerRenderer.tsx`, `src/app/dashboard/DashboardClient.tsx` | provenance & pelabelan |
| `src/lib/insight-celah.ts`, `src/lib/admin-guard.ts`, `src/app/api/admin/celah/route.ts`, `src/app/admin/celah-pengetahuan/page.tsx` | FR-27 (baru) |
| 6 berkas uji | 52 uji baru (237 → 289) |
| `verifikasi/uji-terima.sh`, `verifikasi/stub-splp.mjs` | gerbang FR-25/FR-27 + alat uji luring |

---

## 7. Langkah berikutnya (tidak berubah dari dokumen `10`)

Dengan FR-25 & FR-27 selesai, urutan yang disarankan tinggal: **FR-19** (semantic layer / perluasan
leksikal terarah) → **FR-12** → **FR-26** (notis transparansi + kanal koreksi) — dan Fase B penuh
(hashing semantik + perluasan korpus) bila anggaran waktu sudah ada. Perhatikan bahwa dasbor celah
kini **memberi data** untuk memilih sinonim mana yang layak dikejar lebih dulu: kerjakan FR-19
berdasarkan 20 pertanyaan teratas yang benar-benar muncul, bukan berdasarkan dugaan.
