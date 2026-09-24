# 25 — Laporan FR-18: Bentuk Jawaban per Niat

Tanggal: 24 Sep 2026 · Cabang: `dev` (tanpa menyentuh `main`, tanpa operasi remote)
Kriteria terima dokumen 10: **≥ 3 item per niat lulus** · Status sebelum: 🟡 (niat dikenali & masuk prompt ✅; template bentuk per niat ⬜)

## 1. Masalah yang diselesaikan

Niat pertanyaan sudah dikenali deterministik (`src/lib/intent-meta.ts`, 9 niat) dan sudah
masuk prompt, **tetapi niat tidak pernah mengubah bentuk jawaban**. Semua niat menghasilkan
panel yang sama: baris bukti apa adanya, urutan apa adanya, tanpa pemotongan. Akibat nyata
bagi pengguna:

| Pertanyaan | Yang seharusnya dibutuhkan pengguna | Yang terjadi sebelum FR-18 |
| --- | --- | --- |
| "tren stunting 5 tahun" | titik-titik urut waktu | baris urut skor retrieval; grafik tidak ada |
| "5 besar cakupan tertinggi" | 5 baris teratas terurut | 12+ baris tak berurut, pengguna menyortir sendiri |
| "komposisi balita" | porsi terhadap total | tidak ada kolom porsi, total pun tak ditunjuk |
| "cakupan terendah" | urutan menaik | urutan menurun (arah permintaan diabaikan) |

Ini terasa paling tajam justru pada keadaan **AI tidak aktif** (langganan berhenti): saat itu
tidak ada model yang bisa "menambal" bentuk jawaban, sehingga bentuk deterministik adalah
satu-satunya penentu mutu. Karena itu FR-18 dikerjakan sebagai lapisan deterministik murni
(tanpa model, tanpa jaringan).

## 2. Empat cacat NYATA yang ditemukan saat verifikasi

FR-18 tidak sekadar menambah fitur: verifikasi end-to-end dan uji unit membongkar empat cacat
yang selama ini tidak terlihat karena tidak ada yang memeriksa bentuk jawaban.

### 2.1 `meta.intent` hanya diisi pada jalur "panggil model"

`composeAnswer` menaruh `meta.intent = niat` **setelah** cabang status AI. Akibatnya jawaban
deterministik (AI belum dikonfigurasi / langganan berhenti / jawaban dari cache / bukti kosong)
tidak punya niat sama sekali. Terukur: aplikasi dengan `AI_BASE_URL` kosong mengembalikan
`ai.limitedBy = "unconfigured"` dan `ai.intent = undefined` untuk semua pertanyaan.
Perbaikan: deteksi niat dipindahkan ke paling awal (`answer-compose.ts`, langkah 2b tepat
setelah `meta` dibuat) sehingga **satu kali hitung untuk semua jalur keluar** — termasuk
`selesai(...)` untuk bukti kosong, rate limit, dan jawaban dari cache.

### 2.2 Baris bukti panel kehilangan `id` asli dan `tahun`

Panel (`buildExecutivePresentation`) menurunkan baris buktinya dari `visualisasi`, bukan dari
`response.evidence`. Untuk visual grafik, `toEvidenceFromChart` menghasilkan id sintetis
(`chart:3:nilai`), `satuan: ''`, dan **`tahun: null` untuk semua baris**. Akibatnya bentuk
"tren" tidak dapat membaca periode, porsi tidak dapat dipetakan ke baris, dan sitasi menunjuk
baris yang berbeda dari bukti. Ditemukan oleh uji unit FR-18 (bukan oleh harness, karena
presentasi dirakit di klien).
Perbaikan: baris panel diambil dari `response.evidence` bila ada (id, tahun, satuan, OPD apa
adanya); jalur visual tetap dipakai hanya untuk respons lama.

### 2.3 `porsi` dikirim sebagai objek KOSONG

Pada korpus 1.210 record, seluruh baris yang terambil bernama "Jumlah ..." sehingga semuanya
terbaca sebagai total: tidak ada baris bagian untuk diporsi, tetapi API tetap mengirim
`porsi: {}` — seolah menjawab "porsi 0%". Ditemukan oleh uji regresi A/B terhadap korpus
produksi-sandbox.
Perbaikan: porsi hanya dikirim bila ada **total DAN bagian**; kalau tidak, `kolomTurunan`
dimatikan dan pengguna diberi catatan ("semua baris bukti tampak sebagai total").

### 2.4 Pemotongan baris terjadi tanpa pemberitahuan

Versi pertama bentuk "5 besar" membuang baris ke-6 dan seterusnya tanpa sepatah kata — panel
terlihat seolah buktinya hanya lima. Ditemukan oleh uji unit yang gagal lebih dulu
(`baris tanpa angka diletakkan di akhir` tidak terpenuhi, ternyata karena baris itu memang
dibuang). Perbaikan: `catatan` menyebutkan jumlah baris yang tidak dipajang, dan
`provenance.evidenceCount` tetap menghitung **seluruh** bukti penopang (`evidenceDisajikan`
memisahkan jumlah baris yang dipajang).

## 3. Perubahan

### 3.1 Modul baru `src/services/bentuk-jawaban.ts` (murni, tanpa I/O)

| Niat | Bentuk | Visual | Urutan | Batas |
| --- | --- | --- | --- | --- |
| `tren` | Tren antarperiode | garis | kronologis | semua |
| `peringkat` | Peringkat 5 besar | batang | menurun (atau **menaik** bila "terendah") | 5 |
| `komposisi` | Komposisi & porsi | komposisi | menurun | 10 |
| `distribusi` | Sebaran per kelompok | batang | menurun | 10 |
| `perbandingan` | Perbandingan berdampingan | tabel | tetap | 5 |
| `nilai_saat_ini` | Nilai saat ini | metric | tetap | 5 |
| `meta_katalog` | Keterangan katalog | teks | tetap | semua |
| `sebab` | Angka terdekat (bukan sebab) | teks | tetap | 5 |
| `personal` | Tidak tersedia (data per orang) | teks | tetap | 0 |

Isi modul: `bentukUntukNiat` (kontrak di atas + catatan kejujuran), `susunBaris` (urut + potong),
`angkaDari` (nilai SAPA "1.234,56" → 1234.56), `tampakTotal`, `hitungPorsi` (memakai total yang
ADA di bukti, tidak menjumlahkan sendiri), `terapkanBentuk` (satu pintu untuk rute API **dan**
panel), `SAPA_BENTUK_NIAT=off` (saklar kontrol negatif).

### 3.2 Jalur jawaban & tampilan

- `answer-compose.ts`: niat dihitung paling awal, satu kali, untuk semua jalur keluar.
- `api/query/route.ts` + `api/query/stream/route.ts`: balasan bertambah `niat`, `bentuk`,
  `urutanBukti` (id baris urut sajian), dan `porsi` — semuanya **aditif**.
- `executive-presentation.ts`: baris bukti dari `response.evidence`; urutan & potongan bentuk;
  grafik dibangun ulang mengikuti bentuk (grafik tidak boleh berbeda urutan dari tabel);
  `porsi`; `provenance.evidenceCount`/`evidenceDisajikan`.
- `ExecutiveAnswerRenderer.tsx`: badge bentuk pada kepala panel, catatan kejujuran di atas tabel
  bukti, kolom **Porsi**, keterangan "N baris dipajang dari M item terstruktur".

### 3.3 Berkas

| Berkas | Status |
| --- | --- |
| `src/services/bentuk-jawaban.ts` | baru |
| `src/services/__tests__/bentuk-jawaban.test.ts` | baru (29 uji) |
| `scripts/uji-bentuk-jawaban.mjs` | baru (harness end-to-end + pagar port) |
| `verifikasi/korpus-bentuk.json` | baru (25 record: 6 tahun tren, 7 cakupan, total+bagian, 5 kecamatan) |
| `src/services/answer-compose.ts`, `src/app/api/query/route.ts`, `src/app/api/query/stream/route.ts` | diubah |
| `src/services/executive-presentation.ts` (+ uji), `src/components/ExecutiveAnswerRenderer.tsx`, `src/types/index.ts` | diubah |

## 4. Bukti

### 4.1 Uji unit, tipe, build

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | **37 berkas / 636 lulus** (dari 599 sebelum FR-18: +29 bentuk-jawaban, +8 presentasi) |
| `npx tsc --noEmit` | 0 kesalahan |
| `npm run build` | 0 kesalahan |

### 4.2 Harness end-to-end `scripts/uji-bentuk-jawaban.mjs` — `verifikasi/uji-bentuk-jawaban.txt`

Harness menyalakan penyedia SPLP tiruan (`verifikasi/korpus-bentuk.json`) + aplikasi sendiri,
mengajukan **18 pertanyaan (3 per niat)** dan memeriksa niat, kontrak bentuk, urutan baris
sajian, pemotongan, porsi, serta catatan kejujuran.

```
niat diuji          : tren 3/3 · peringkat 3/3 · komposisi 3/3 · distribusi 3/3 ·
                      perbandingan 3/3 · nilai_saat_ini 3/3
kriteria dok 10     : ≥ 3 item per niat lulus → 6/6 niat terpenuhi
item diperiksa      : 18
pemeriksaan lulus   : 122
kontrol negatif     : 9/9 item menyimpang (harus semuanya)
LULUS (exit 0)
```

Kasus kejujuran yang ikut diperiksa: tren dengan satu tahun → catatan "satu titik data";
komposisi tanpa total → porsi tidak dikarang + catatan; peringkat dengan satuan bercampur →
catatan bahwa peringkat lintas satuan tidak sebanding.

### 4.3 Kontrol negatif — pemeriksa tidak vakum

| Kendali | Hasil |
| --- | --- |
| `SAPA_BENTUK_NIAT=off` (semua niat jadi bentuk netral) | `verifikasi/uji-bentuk-jawaban-tanpa-bentuk.txt` → **exit 1, 61 pelanggaran** |
| Kontrol internal harness (aplikasi kedua dengan bentuk dimatikan) | 9/9 item menyimpang dari kontrak → lulus sebagai kegagalan yang diharapkan |
| Pagar port: aplikasi/sisa proses yang sudah hidup | harness berhenti exit 2, tidak menabrak server basi |

### 4.4 Uji regresi A/B — `verifikasi/uji-regresi-fr18.txt`

Dua aplikasi dibangun dari korpus yang sama (1.210 record): pohon **sebelum FR-18** (`0bc661e`)
dan pohon kerja. 12 pertanyaan mewakili semua niat + pertanyaan kosong + permintaan data pribadi.

```
Ringkasan: 12 pertanyaan · 12 identik · 0 berbeda
KESIMPULAN: tidak ada regresi — seluruh bidang lama identik.
```

Bidang FR-18 muncul **hanya** pada balasan sesudah (`niat`, `bentuk`, `urutanBukti`, `porsi`,
`ai.intent`) — bukti penambahan bersifat aditif, bukan penggantian.

### 4.5 Temuan yang wajib dicatat (jangan salah tafsir)

1. **Sidik regresi bukan laporan mutu.** Korpusnya korpus uji sandbox (1.210 record), bukan
   produksi (2.065). Angka ini membuktikan *kesamaan perilaku lama*, bukan mutu jawaban.
2. **Porsi hanya sekuat datanya.** SAPA tidak menyimpan total untuk semua topik; ketika total
   tidak ada, porsi memang tidak ditampilkan dan itu dinyatakan terus terang. Porsi juga tidak
   pernah menjumlahkan baris bagian menjadi total sendiri.
3. **Peringkat lintas satuan.** Bila bukti memuat satuan berbeda (Jiwa + Persen), bentuk
   peringkat tetap memakai urutan nilai apa adanya dan **menyebutkan** bahwa lintas satuan tidak
   selalu sebanding.
4. **Pemotongan baris tetap ada** (5 untuk peringkat/perbandingan, 10 untuk komposisi/sebaran).
   Yang berubah: pemotongan selalu disebutkan, dan jumlah bukti penopang tetap utuh pada
   keterangan sumber.

## 5. Batas & hal yang tidak dikerjakan

- Bentuk tidak menyentuh **angka**: tidak ada pembulatan, penjumlahan, rata-rata, atau proyeksi
  baru. Semua nilai berasal dari baris bukti.
- Visual "komposisi" memakai jalur tabel + kolom porsi (bukan diagram lingkaran); menambah tipe
  visual baru berarti menyentuh perender grafik — di luar cakupan FR-18.
- Bentuk hanya menata **sajian**; urutan audit `evidence` pada balasan API sengaja dibiarkan
  urut retrieval (dipakai pemeriksa grounding FR-24 dan operator).
- Porsi memakai nilai total **terbesar** bila ada lebih dari satu baris total.

## 6. Cara mengulang bukti

```bash
# 1. uji + tipe + build
npx vitest run            # harapan 37 berkas / 636 lulus
npx tsc --noEmit          # harapan 0
npm run build             # harapan 0

# 2. harness end-to-end (menyalakan stub SPLP + aplikasi sendiri; port 3164/3181/3182 bebas)
node scripts/uji-bentuk-jawaban.mjs        # harapan exit 0, 122 pemeriksaan lulus

# 3. kontrol negatif: matikan bentuk untuk SEMUA niat → harness WAJIB exit 1
SAPA_BENTUK_NIAT=off node scripts/uji-bentuk-jawaban.mjs

# 4. uji regresi A/B (opsional, ±2 menit)
#    bangun pohon 0bc661e (mis. git stash → build → start), lalu bandingkan balasan
#    /api/query pada korpus yang sama; semua bidang lama wajib identik.
```

## 7. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
| --- | --- | --- |
| FR-18 (dok 10 h.137) | 🟡 niat dikenali & masuk prompt; bentuk per niat ⬜ | ✅ **selesai** — 6 niat berbentuk × 3 item lulus, 2 niat jawaban-terarah, catatan kejujuran, kontrol negatif terbukti gagal |
| Peta fase | FR-18 🟡 | FR-18 ✅ |

## 8. Berikutnya

**DS-05** — kamus sinonim daerah (≥ 50 entri) untuk retrieval leksikal deterministik; urutan
yang disetujui: DS-03 → NFR-09 → FR-18 → **DS-05**.
