# 29 — Laporan CMP-04: jejak audit jawaban (tanpa data pribadi) + retensi & ekspor

**Tanggal:** 24 September 2026 · **Cabang:** `dev` (tanpa menyentuh `main`, tanpa operasi remote)
**Rujukan:** kebutuhan internal & pemeriksaan · UU 27/2022 (data pribadi)
**Status dokumen 10:** `🟡 (metadata AI ✅; retensi & ekspor ⬜)` → **✅**

## 1. Ringkas

| Sebelum | Sesudah |
|---|---|
| Hanya metadata AI pada respons; tidak ada catatan yang bertahan untuk pemeriksaan | Setiap jawaban (jalur **JSON & streaming**) meninggalkan **jejak audit**: pertanyaan tersamar, niat, mode, jumlah & id bukti, hasil gerbang, sebab (FR-20), status, durasi |
| Tidak ada retensi — atau retensi hanya di tampilan | **Retensi 30 hari** ditegakkan lapisan penyimpanan (TTL): hari di luar jendela tidak dibaca dan ditandai `diluarRetensi` |
| Tidak ada jalan mengambil data untuk pemeriksaan | Endpoint **`GET /api/admin/jejak-audit`** (fail-closed) dengan format `json`/`csv`/`ndjson`, plus skrip ekspor **`scripts/ekspor-jejak-audit.mjs`** |
| Data pribadi pada pertanyaan berisiko tersimpan apa adanya | **Penyamaran** NIK (padat & berkelompok), telepon, surel, tautan → `[NIK]`/`[nomor]`/`[surel]`/`[tautan]`, dengan penanda `piiDisamarkan` + **jaring terakhir** sebelum ekspor keluar |
| Batas penyimpanan tidak jelas | Batas `500` catatan/hari; bila penuh, **jumlah yang dilewati dicatat** (`dilewati`) — bukan hilang diam-diam |

Uji: **686 → 708** (22 uji baru). Harness baru: `scripts/uji-jejak-audit.mjs` (**18 pemeriksaan** + mode sabotase).

## 2. Temuan yang mengubah desain

### 2.1 Daftar id bukti pernah dituduh "NIK" — positif palsu yang membahayakan kepercayaan

Ekspor CSV menulis id bukti sebagai `1411 1493 1001 1370 …`. Pola NIK berkelompok
(`\b\d{4} \d{4} \d{4} \d{4}\b`) menuduh **data yang bersih** sebagai data pribadi, sehingga
pemeriksaan PII gagal dan (di skrip ekspor) **berkas sah ditolak tulis**. Perbaikan yang dipilih —
sekaligus sejalan dengan pagar masukan `ai/guard.ts`:

1. pola hanya berlaku untuk **tepat empat kelompok** (bukan bagian dari daftar panjang), dan
2. bila semua kelompok adalah **tahun** (1900–2100), itu rentang tahun — bukan NIK;
3. pemisah daftar id pada CSV diganti `;` (tetap terbaca di lembar kerja, tidak lagi berbentuk 4-4-4-4).

Ketiganya dikunci uji: daftar id 10 kelompok **tidak** dianggap PII, sedangkan `1234 5678 9012 3456`
tetap ditangkap.

### 2.2 Durasi jejak ≠ durasi model

Jejak mencatat durasi **permintaan penuh** (termasuk pengambilan data SPLP), bukan hanya lama model
menulis token — supaya pemeriksaan dapat membedakan "jawaban lambat karena data" dari "lambat karena
model". Pada jalur streaming, pencatatan dilakukan **setelah** aliran selesai dikirim.

### 2.3 Retensi harus ditegakkan penyimpanan, bukan tampilan

Karena TTL ditetapkan saat menulis (30 hari), data memang kedaluwarsa di backend; permintaan untuk
hari lama **tidak membaca apa pun** dan menjawab `diluarRetensi: true` — bukan kosong tanpa
penjelasan. Pilihan ini juga menghemat kuota penyimpanan gratis (Upstash 500 ribu perintah/bulan).

## 3. Bukti

### 3.1 Uji & build

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | **708 lulus** (44 berkas; dari 686) |
| `npx tsc --noEmit` | 0 kesalahan |
| `npm run build` | 0 kesalahan |

Uji baru: `src/lib/__tests__/jejak-audit.test.ts` (13), `src/app/api/admin/jejak-audit/route.test.ts` (6),
dan 3 uji jejak pada `src/app/api/query/route.test.ts` (skema, tanpa-bukti, NIK tersamar).

### 3.2 Harness — `verifikasi/uji-jejak-audit.txt` (exit 0, 18 pemeriksaan)

```
A. Empat pertanyaan   : 3 lewat jalur JSON + 1 lewat jalur streaming (SSE) — semua terjawab
B. Jejak tersimpan    : ≥ 4 catatan; kedua jalur tercatat; setiap catatan memuat pertanyaan,
                        sebab, status, mode, daftar bukti; pertanyaan ber-NIK tersimpan
                        "tampilkan daftar NIK [NIK] milik warga"; TIDAK ada 16 digit tersimpan;
                        pemeriksaanPii bersih; retensi 30 hari
C. Ekspor & penjagaan : CSV (kepala + 4 baris, tanpa PII) · NDJSON 4 baris terurai ·
                        tanpa token 401 · token salah 401 · hari 60 hari lalu ⇒ 0 catatan +
                        diluarRetensi · pemeriksa independen menyatakan bersih
```

Kontrol negatif (harness diuji bisa gagal): `node scripts/uji-jejak-audit.mjs --sabotase` →
**exit 1** dengan 1 pemeriksaan gugur (`verifikasi/uji-jejak-audit-sabotase.txt`).

### 3.3 Nol dampak pada jawaban — A/B 12 kueri (`verifikasi/uji-regresi-cmp04.txt`)

Dua build dijalankan berurutan (sebelum: `a9b00f6`, sesudah: pohon kerja CMP-04) di atas korpus uji
sandbox yang sama, 12 jawaban dibandingkan setelah membuang bidang waktu:

```
  kueri diperiksa : 12
  kueri berbeda   : 0
```

Pencatatan jejak **tidak mengubah satu pun jawaban** — termasuk pertanyaan ber-NIK yang ditolak pagar.

## 4. Batas yang dinyatakan

- Jejak menyimpan **pertanyaan tersamar**, bukan narasi jawaban penuh. Untuk merekonstruksi jawaban
  saat pemeriksaan, dipakai id bukti + katalog SPLP pada tanggal itu (narasi penuh tidak disimpan —
  itu pilihan sadar demi ukuran penyimpanan dan privasi).
- Penyamaran bersifat **pola** (NIK/telepon/surel/tautan). Nama orang yang ditulis bebas dalam
  pertanyaan (mis. "berapa produksi kopi Pak Budi") **tidak** tersamar — pagar per-orang menolaknya
  lebih dulu, dan itulah lapis pertahanannya. Ini dicatat sebagai risiko sisa.
- Retensi 30 hari & batas 500 catatan/hari adalah **kebijakan pengelola**, bukan tuntutan hukum;
  keduanya dapat diubah di satu tempat (`src/lib/jejak-audit.ts`).
- Belum ada halaman dasbor khusus jejak audit (operator memakai endpoint/skrip); ini kandidat
  butir berikutnya bila diinginkan.

## 5. Cara mengulang

```bash
npx vitest run src/lib/__tests__/jejak-audit.test.ts src/app/api/admin/jejak-audit/route.test.ts
node scripts/uji-jejak-audit.mjs              # exit 0 — 18 pemeriksaan
node scripts/uji-jejak-audit.mjs --sabotase   # exit 1 — bukti harness bisa gagal

# ekspor dari luar aplikasi (petugas pemeriksaan):
ADMIN_TOKEN=... node scripts/ekspor-jejak-audit.mjs --url=http://127.0.0.1:3000 --format=csv
```

## 6. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| CMP-04 (jejak audit jawaban) | 🟡 metadata AI ✅; retensi & ekspor ⬜ | ✅ jejak lengkap pada kedua jalur jawaban, tanpa data pribadi (disamarkan + jaring terakhir), retensi 30 hari ditegakkan penyimpanan, ekspor JSON/CSV/NDJSON lewat endpoint fail-closed & skrip; 12/12 jawaban tidak berubah |
