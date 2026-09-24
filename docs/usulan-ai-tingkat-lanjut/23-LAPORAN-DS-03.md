# 23 — Laporan DS-03: Cache Jawaban Terikat VERSI ISI Korpus

**Tanggal:** 24 September 2026 · **Basis:** cabang kerja `dev` (`c6db82b`), tanpa menyentuh `main` (`ff00eb8`), tanpa operasi remote
**Kriteria terima (dokumen 10):** *tag versi korpus pada setiap jawaban & cache — "angka lama tanpa penanda = risiko kebijakan"*
**Status:** ✅ kode + uji + bukti end-to-end + kontrol negatif

---

## 1. Masalah yang diselesaikan

Kunci cache jawaban berbunyi:

```
ai:v1:<hash(pertanyaan)>:<jumlah record>
```

Jumlah record adalah **ukuran yang hampir tidak pernah berubah** ketika data diperbarui. OPD
memutakhirkan **angka** pada indikator yang sudah ada — katalog tetap 2.065 record, tetapi isinya
berbeda. Akibatnya, dua kebohongan halus yang keduanya berbentuk "mengaku segar":

| Jalur | Yang terjadi sebelum DS-03 |
|---|---|
| **Cache jawaban** (TTL 15 menit) | Pertanyaan sama + jumlah record sama → kunci sama → jawaban **korpus lama** disajikan seolah baru |
| **Cache korpus di memori** (`splpCache`, TTL 10 menit) | Operator menekan "segarkan sekarang" (OPS-03) → cache Next dibatalkan, pembukuan berkata **berhasil**, tetapi proses itu masih menyajikan salinan lama sampai 10 menit |

Keduanya bertemu: pembaruan data OPD + penyegaran yang "berhasil" tetap memberi warga jawaban
dari korpus sebelumnya. Ancamannya bukan kegagalan sistem, melainkan **keyakinan yang salah** —
dan itulah yang paling mahal di layanan data pemerintahan.

Perhatikan juga bahwa jawaban SAPA sudah membawa stempel sejak FR-25 (`dataFetchedAt`,
`dataFingerprint`, `dataYears`; tampil di API dan di panel bukti UI). Sebelum DS-03, stempel itu
sering **jujur menyebut waktu tarik** sementara **isinya sudah tidak lagi segar** — stempel tanpa
kebenaran isi justru menyesatkan.

## 2. Perubahan

### 2.1 Sidik isi korpus masuk ke kunci cache (bukan jumlahnya)

`src/services/answer-compose.ts`:

```ts
// Versi `v2`: jumlah record diganti sidik isi (DS-03).
const sidik = opts.sidikKorpus ?? sidikKorpus(opts.records);
const cacheKey = `ai:v2:${hash(normalizeText(opts.query))}:${sidik}`;
```

Sidik dihitung sekali per versi korpus (FR-25) dan kini diserahkan rute (`meta.sidik`) supaya
tidak dihitung ulang. Entri lama ber-kunci `ai:v1:*` **tidak pernah cocok lagi** — tidak perlu
dibersihkan, cukup kedaluwarsa sendiri dalam 15 menit.

Satu jebakan performa ditutup di `src/lib/sapa-client.ts`: `sidikKorpus()` dipanggil **setiap
permintaan** (kunci cache), sedangkan korpus berisi ~2.000 record. Tanpa memo, setiap pertanyaan
membayar pengurutan + pencacahan ulang yang hasilnya pasti sama. Ditambahkan memo `WeakMap`
berkunci **identitas array**: array yang sama → hasil diambil dari memori; array baru (mis. hasil
tarikan SPLP baru) selalu dihitung ulang. `WeakMap` dipakai supaya korpus lama tidak tertahan
sampai proses mati.

### 2.2 "Segarkan" benar-benar melupakan korpus di memori

`lupakanKorpus()` baru di `sapa-client.ts`, dipanggil `penyegar-cache.ts` **hanya pada penyegaran
nyata**:

- penyegaran nyata → `revalidateTag(..., { expire: 0 })` **dan** `lupakanKorpus()`;
- **uji kering** (`kering: true`) → tidak mengubah apa pun, termasuk tidak melupakan.

**Pembatasan yang jujur:** `lupakanKorpus()` hanya berlaku pada **proses yang menjalankan**
penyegaran. Instance lain (mis. beberapa lambda Vercel) tetap memakai salinannya sampai TTL-nya
habis. Yang membuat hal itu tidak berbahaya bukan fungsi ini, melainkan **sidik pada kunci cache
jawaban**: begitu instance itu menarik data baru, sidik berubah dan jawaban lama tidak disajikan.
Fungsi ini bekerja untuk kasus paling umum di SAPA (satu proses Node di Vercel Pro/self-host),
sidik bekerja untuk sisanya.

### 2.3 Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `src/services/answer-compose.ts` | opsi `sidikKorpus?`; kunci `ai:v2:<hash(pertanyaan)>:<sidik>` |
| `src/lib/sapa-client.ts` | memo `WeakMap` pada `sidikKorpus()`; fungsi baru `lupakanKorpus()` |
| `src/lib/penyegar-cache.ts` | panggil `lupakanKorpus()` pada penyegaran nyata saja |
| `src/app/api/query/route.ts`, `.../stream/route.ts` | teruskan `meta.sidik` ke penyusun jawaban |
| `src/lib/__tests__/meta-korpus.test.ts` (+2), `src/services/__tests__/answer-compose.test.ts` (+3), `src/lib/__tests__/penyegar-cache.test.ts` (+1) | 6 uji baru |
| `scripts/uji-cache-korpus.mjs` (baru) | harness end-to-end + kontrol negatif mandiri |

## 3. Bukti

### 3.1 Uji unit, tipe, build

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run` | **590/590 lulus**, 35 berkas |
| `npx tsc --noEmit` | **0 galat** |
| `npm run build` | **exit 0** |

Enam uji baru, intinya bukan "fungsi dipanggil" melainkan "jawaban salah tidak mungkin lolos":

1. `ISI berubah dengan JUMLAH record sama ⇒ sidik berbeda` — inti DS-03.
2. `lupakanKorpus: tarikan berikutnya benar-benar mengambil ulang, sidik ikut versi baru`.
3. `penyegaran nyata melupakan korpus di memori; uji kering TIDAK`.
4. `isi korpus berubah dengan jumlah record SAMA ⇒ kunci cache berbeda`.
5. `jawaban tersimpan untuk korpus LAMA tidak disajikan setelah isi korpus berubah`.
6. `sidik dari rute dipakai apa adanya (tidak dihitung ulang) — kunci tetap stabil`.

### 3.2 Harness end-to-end — `scripts/uji-cache-korpus.mjs`

Harness menyalakan **stub SPLP** sendiri (`verifikasi/stub-splp.mjs`, port 9955) berisi korpus A
(6 record), melewati jalur permintaan yang sebenarnya, lalu menukar korpus jadi B dengan **jumlah
record tetap 6** dan angka berbeda. Hermetis: penanda angka diacak setiap jalan
(`NILAI_A = 9000 + acak`, `NILAI_B = NILAI_A + 7`), status dibaca **setelah** stub hidup, dan
`POST /api/revalidate` dijalankan di awal supaya tidak membaca korpus sisa.

**Lulus** — `verifikasi/uji-cache-korpus.txt` (exit 0):

```
query 1 (dingin)   : nilai 9577 · cached=false
query 2 (korpus A) : nilai 9577 · cached=true     ← cache memang hidup
query 3 (korpus B) : nilai 9584 · cached=false    ← dihitung ULANG, bukan dari cache
```

### 3.3 Kontrol negatif — harness harus GAGAL pada build yang cacat

Kunci cache dikembalikan ke bentuk lama (`ai:v1:<hash>:${records.length}`), dibangun ulang, lalu
harness dijalankan. **Gagal, exit 1** — `verifikasi/uji-cache-korpus-tanpa-sidik.txt`:

```
cache-hit: bukti=9446 · narasi="Jumlah ASN tercatat 9.439 pegawai (2026)…"
✗ GAGAL — 2 pelanggaran:
  · jawaban korpus BARU dilaporkan berasal dari cache (cached=true)
  · narasi menyebut angka korpus LAMA (9439) sementara bukti sudah 9446
    — pembaca melihat campuran yang menyesatkan
```

Setelah itu kode asli dipulihkan (`diff` identik dengan arsip), dibangun ulang, dan harness
dijalankan lagi → lulus. Jadi bukti di §3.2 bukan sekadar "harness hijau", melainkan harness yang
**terbukti menangkap cacat yang sebenarnya**.

### 3.4 Temuan yang wajib dicatat (jangan salah tafsir)

Pada **cache-hit**, bagian `evidence` **selalu dihitung ulang** dari korpus yang berlaku — jadi
angka pada bukti tetap baru. Yang **basi adalah narasi model** (disajikan apa adanya dari
`tersimpan.response`). Konsekuensinya untuk siapa pun yang menguji hal ini:

- ❌ Jangan memakai "angka pada bukti" sebagai kriteria. Bukti segar + narasi basi justru
  **lebih berbahaya** karena tampak terverifikasi.
- ✅ Kriteria yang benar: `ai.cached` harus `false` untuk korpus baru, **dan** narasi tidak
  menyebut angka korpus lama. Narasi disajikan terformat (`9.439`) sementara korpus mentah
  (`9439`) — perbandingan harus menormalkan dulu, kalau tidak pemeriksaannya selalu lolos palsu.

Temuan inilah yang membuat versi pertama harness **lolos-palsu** dan langsung diperbaiki di jalan
yang sama.

## 4. Batas & hal yang tidak dikerjakan di sini

- **TTL tidak diubah**: jawaban 15 menit, korpus 10 menit. DS-03 menyelesaikan *kebenaran*, bukan
  *kecepatan* penyebaran. Batas 15 menit kini hanya berlaku untuk korpus yang isinya memang tidak
  berubah — yang memang tidak apa-apa.
- **Entri `ai:v1:*` lama** di Redis dibiarkan kedaluwarsa sendiri (≤15 menit); tidak ada sapuan
  paksa agar perubahan ini tetap murni tambahan (aditif) dan tidak menyentuh kunci milik jalur lain.
- **Multi-instance**: lihat §2.2 — keselamatan lintas instance berasal dari sidik, bukan dari
  `lupakanKorpus()`.
- Jarak antar-wilayah tetap tanda koma; normalisasi angka pada pembandingan di harness **tidak**
  mengubah penyajian ke pengguna.

## 5. Cara mengulang bukti

```bash
# 1. siapkan aplikasi & penyedia tiruan (lihat 11-KIT-SERAH-TERIMA.md)
node verifikasi/mock-llm.mjs &                    # :8899
ADMIN_TOKEN=token-uji-123 REVALIDATE_SECRET=rahasia-uji \
SAPA_SPLP_BASE_URL=http://127.0.0.1:9955/sapa/1.0/api \
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3131 &

# 2. harness (menyalakan stub SPLP sendiri)
SAPA_EVAL_URL=http://127.0.0.1:3131 REVALIDATE_SECRET=rahasia-uji node scripts/uji-cache-korpus.mjs

# 3. kontrol negatif: ubah kunci kembali ke `ai:v1:...:${opts.records.length}`,
#    `npm run build`, jalankan ulang harness → WAJIB exit 1.
```

**Catatan:** cache jawaban membuat uji ini tidak hermetis antar-jalan bila penanda tidak diacak.
Harness sudah menangani itu (`NILAI_A` acak per jalan) — jangan dihapus.

## 6. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| **DS-03** Kesegaran: stempel waktu pengambilan + tag versi korpus pada setiap jawaban & cache | ⬜ | ✅ stempel & sidik tampil di API/UI (FR-25) **dan** kini benar-benar menentukan cache |

Tidak ada perubahan perilaku bagi pemanggil API: semua bidang tambahan tetap **aditif**, kontrak
`ai.answer`/`source`/`count`/`matched`/`evidence` tidak berubah.

## 7. Berikutnya

Urutan yang disetujui: **DS-03 ✅ → NFR-09** (aksesibilitas WCAG 2.2 AA, belum ada dasar uji) →
**FR-18** (bentuk jawaban per niat) → **DS-05** (kamus sinonim daerah ≥50 entri).
