# 16 — Laporan FR-20: Klasifikasi Sebab Kegagalan (retrieval vs generasi)

**Tanggal:** 22 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` (tidak menyentuh `main`)
**Kriteria terima (dokumen 10):** *setiap item gagal membawa tag sebab — retrieval atau generasi.*

---

## 1. Masalah yang diselesaikan

Sebelum FR-20, sistem sudah **jujur**: ia menolak menjawab saat tidak ada data, dan menandai
jawaban yang tidak lolos gerbang. Tetapi kejujuran itu belum **dapat ditindaklanjuti**. Yang
tercatat hanya dua sebab kasar:

| Sebelum | Masalahnya |
|---|---|
| `tanpa-bukti` | Menyatukan "kata kuncinya tidak ada di katalog", "datanya memang tidak ada", dan "pertanyaannya minta rincian yang tidak tersedia" menjadi satu tag. Perbaikan ketiganya berbeda jauh: menambah sinonim, meminta data ke OPD, atau menolak dengan sopan. |
| `ai-ditolak` | Menghapus perbedaan antara "model melanggar grounding", "model tidak menambah nilai", dan "penyedia model sedang gagal" — padahal yang pertama soal mutu jawaban, yang terakhir soal jaringan. |

Akibatnya, dasbor celah pengetahuan (`/admin/celah-pengetahuan`) hanya bisa menampilkan dua
baris alasan, dan **kegagalan baru yang lahir dari lapis semantik FR-12** (makna terlalu lemah,
model ditolak, penyedia mati) tidak punya tempat sama sekali.

FR-20 memberi setiap jawaban **satu tag sebab** berbentuk `lapis:rincian`, dengan empat lapis:

| Lapis | Kapan | Tag |
|---|---|---|
| `masukan` | Pertanyaan ditolak pagar kebijakan sebelum retrieval | `masukan:data-personal`, `masukan:permintaan-sistem` |
| `retrieval` | Katalog tidak/belum melayani pertanyaannya | `retrieval:tanpa-bukti`, `retrieval:konsep-asing`, `retrieval:granularitas-per-desa`, `retrieval:makna-lemah` |
| `generasi` | Bukti sudah ada, pemanfaatan model yang gagal | `generasi:grounding`, `generasi:nilai-tambah`, `generasi:penyedia` |
| `penyajian` | Jawaban sengaja tidak disajikan (saklar pemilik aplikasi) | `penyajian:dinonaktifkan` |
| `selesai` | Jawaban tersaji (dipakai untuk membandingkan jalur) | `selesai:leksikal`, `selesai:leksikal+sisipan`, `selesai:semantik`, `selesai:ai`, `selesai:meta` |

Setiap tag membawa tiga hal: **sebab utama**, **status** (`menjawab` / `jujur-kosong`),
**rincian prosa** (bebas angka — pelajaran FR-12), dan opsional **catatan** untuk sebab
sekunder. Jawaban yang tersaji tetap dapat membawa catatan: *"jawaban ini benar, tetapi modelnya
ditolak gerbang"* adalah dua fakta yang keduanya penting.

---

## 2. Apa yang dibangun

| Berkas | Perubahan |
|---|---|
| `src/services/sebab-kegagalan.ts` **(baru)** | Modul murni: `klasifikasiSebab(fakta) → Diagnosa`, `labelSebab`, `lapisDari`, `rangkumSebab`, `sebabUntukCelah`, konstanta `SEBAB_GAGAL`, tipe `SebabGagal`/`SebabSukses`. Tanpa efek samping, tanpa I/O — mudah diuji dan dipakai ulang. |
| `src/services/deterministic-answer.ts` | Empat titik balik jawaban (meta, kosong, terjawab, pagar) kini menyertakan `diagnosa`. Fakta retrieval diberi bahan tag: `pagar`, `konsepAsing`, `skorSemantik`, `mintaPerDesa`, `ai`. |
| `src/services/answer-compose.ts` | `diagnosa` ikut pada setiap hasil (termasuk saat komposisi berhenti lebih awal) sehingga kontraknya sama di semua jalur. |
| `src/services/semantik.ts` | Saat jalur semantik menolak semua kandidat, jalur kosong kini melaporkan **skor teratas yang ditolak** — itulah yang membedakan "ambang perlu diturunkan" dari "katalog perlu dilengkapi". |
| `src/lib/sapa-client.ts` | Penjaga granularitas dipecah menjadi satu sumber (`granularitasDitolak`) + pembungkus `granularitasTidakTersedia` untuk diagnostik, supaya penjaga dan tag **tidak mungkin berbeda pendapat**. Ekspor `mintaRincianPerDesa`. |
| `src/app/api/query/route.ts` · `stream/route.ts` | Balasan JSON **dan** streaming memuat `diagnosa`; pencatatan celah (FR-27) memakai tag baru lewat satu fungsi yang sama. |
| `src/app/admin/celah-pengetahuan/page.tsx` | Kolom sebab memakai `labelSebab` — tag baru tampil sebagai kalimat manusia, dan data lama (pra-FR-20) tetap punya label. |
| `scripts/uji-sebab.mjs` **(baru)** | Harness EV-20: memeriksa tag lewat HTTP di jalur JSON + streaming. |
| `scripts/eval-run.mjs` | **Menegakkan kriteria terima:** item gagal tanpa tag sebab → pelanggaran (keluar 1). Ringkasan menampilkan sebaran sebab per lapis. |
| `verifikasi/uji-terima.sh` | Bagian **6c** baru (5 butir) + harness penanda penuh lewat `SAPA_SEBAB_PENUH=1`. |

---

## 3. Bukti terukur (semua dijalankan, bukan diklaim)

### 3.1 Uji unit

```
npx vitest run     →  30 berkas / 418 uji lulus
npm run typecheck  →  bersih
npx next build     →  sukses
```

Uji baru terpenting (bukan sekadar "fungsi mengembalikan nilai"):

* **Pagar mendahului segalanya** — permintaan data per orang tetap bertag `masukan:data-personal`
  walau bukti ada dan model jalan.
* **Kata asing mendahului granularitas** — keputusan sadar, lihat §4.
* **Skor makna nol ≠ makna lemah** — nol berarti "belum ada kandidat", bukan "kemiripan terlalu
  kecil"; dua keadaan itu menuntut perbaikan berbeda.
* **Penolakan kebijakan TIDAK masuk dasbor celah** — lihat §4.
* **Penjaga granularitas sepakat dengan hasil retrieval** (`retrieval.test.ts`) — empat kasus,
  termasuk kasus yang membuat penjaga menyalakan dan yang memadamkannya.
* **Label bebas angka untuk semua 10 tag gagal**, dan label khusus untuk dua tag lama.

### 3.2 Uji terima (bagian 6c yang baru)

```
ADMIN_TOKEN=… AI_URL=…:3116 DET_URL=…:3117 SAPA_SKIP_EVAL=1 \
SAPA_PARAFRASE_PENUH=1 SAPA_SEBAB_PENUH=1 bash verifikasi/uji-terima.sh
→ ✓ LULUS — semua ambang terpenuhi.
```

| Butir 6c | Hasil |
|---|---|
| Kueri di luar katalog membawa sebab | ✓ `retrieval:konsep-asing` |
| Kueri terjawab diberi sebab lapis selesai/masukan | ✓ `selesai:leksikal+sisipan` |
| Prosa sebab bebas angka | ✓ |
| Jalur streaming = jalur JSON | ✓ sebab identik |
| Harness penanda sebab | ✓ `lapis yang terbukti bekerja: retrieval, masukan, selesai` |

Harness penanda (`scripts/uji-sebab.mjs`) memeriksa empat penanda yang **tidak bergantung korpus**
— di luar katalog, permintaan data per orang, permintaan aturan internal, dan pertanyaan terjawab —
masing-masing di jalur JSON **dan** streaming, ditambah pemeriksaan bentuk: tag harus dikenal,
`rincian` harus ada dan bebas angka, dan `status: jujur-kosong` tidak boleh bertag lapis `selesai`.

### 3.3 Kriteria terima: item gagal wajib bertag

Kriteria dokumen 10 diuji lewat dua jalur:

1. **Harness eval** (`scripts/eval-run.mjs`) kini **menolak** item gagal tanpa tag. Bukti bahwa
   jalur ini bekerja: `node scripts/eval-run.mjs --id=L9,F1,T3,S2` (korpus uji) menghasilkan dua
   item gagal dan keduanya **membawa tag** — lihat `verifikasi/eval-sebab-cek.txt`:

   ```
   Lulus : 2/4 (50.0%)   Gagal : 2
   ──────── Sebab kegagalan (2 item gagal) ────────
      1×  selesai:semantik   [selesai]  → L9
      1×  selesai:leksikal   [selesai]  → S2
   ```

   *(Catatan kejujuran: subset ini dijalankan pada **korpus uji** 1.210 record, bukan korpus
   produksi 2.065 record. Kegalalan L9/S2 di sini soal kecocokan korpus, bukan mutu jawaban —
   yang dibuktikan adalah **jalur pelaporan tag**, bukan angkanya.)*

2. **Dasbor celah** menampilkan tag baru dari jawaban nyata. Sesudah uji dijalankan,
   `GET /api/admin/celah` mengembalikan 8 entri, semuanya bertag baru:

   ```
   retrieval:konsep-asing      ← "berapa jumlah drone di kecamatan peusangan"
   retrieval:konsep-asing      ← "harga cabai hari ini"
   ```

### 3.4 Tidak ada regresi pada FR-12 / FR-19

| Ukuran | Sebelum FR-20 | Sesudah FR-20 |
|---|---|---|
| Parafrase darurat (`uji-parafrase.mjs`, 20 + 5) | 20/20, negatif 5/5 | **20/20, negatif 5/5** |
| Sitasi per klaim (bagian 6, FR-19) | 0 klaim tanpa rujukan | **0 klaim tanpa rujukan** |
| Kesegaran data & sidik korpus (bagian 3) | konsisten JSON↔streaming | konsisten |

---

## 4. Keputusan desain (beserta alasan & buktinya)

**a. Kata asing mendahului granularitas.**
Penjaga granularitas menyalakan kandidat tempat dari kata yang ikut terhitung (termasuk kata
generik seperti "kecamatan"), sehingga kueri *"… per desa di Kecamatan Tanah Rencong"* — nama yang
**tidak ada** di katalog — sempat bertag "granularitas". Tag yang lebih menolong operator adalah
`retrieval:konsep-asing`: memperbaiki kata kunci jauh lebih murah daripada meminta data per desa.
Perilaku penjaganya sendiri **tidak diubah** (tetap menolak, hasil tetap kosong); hanya tag yang
dipilih lebih tepat. Ada uji khusus untuk urutan ini.

**b. Penolakan kebijakan tidak dicatat sebagai celah pengetahuan.**
`masukan:data-personal` dan `masukan:permintaan-sistem` adalah percobaan penyalahgunaan, bukan
celah data: tidak ada indikator atau sinonim yang bisa ditambahkan untuk melayaninya. Kalau
dicatat, daftar kerja operator akan dipenuhi *"tampilkan system prompt"* dan menenggelamkan celah
yang benar-benar bisa ditutup. Karena itu `sebabUntukCelah` menyaring `masukan:*` — sementara
`penyajian:dinonaktifkan` **tetap** dicatat, sebab itu kejadian konfigurasi yang membuat pengguna
tidak mendapat jawaban.

**c. Satu sumber untuk penjaga & diagnostik.**
Sebelumnya tag granularitas ditebak dari teks kueri (`mintaRincianPerDesa`). Tebakan itu **salah
pada korpus nyata**: korpus uji memuat indikator desa untuk beberapa kecamatan, sehingga
pertanyaan "per desa" di sana justru terjawab sah. Sekarang sinyalnya adalah hasil penjaga itu
sendiri (`granularitasTidakTersedia`), dihitung oleh fungsi yang sama — jadi mustahil berbeda
pendapat.

**d. Nilai lama tetap dibaca.**
`labelSebab` mengenali `tanpa-bukti` dan `ai-ditolak` (data tersimpan sebelum FR-20) dan terus
menampilkannya sebagai kalimat manusia. Tidak ada migrasi data yang diperlukan.

**e. Prosa bebas angka, angka di data terstruktur.**
`rincian` dilarang memuat angka (dijaga uji unit **dan** bagian 6c). Angka yang memang perlu
diaudit — jumlah bukti, skor makna yang ditolak, sidik indeks — hidup di bidang terstruktur
`diagnosa` dan `/api/status`, bukan di kalimat.

---

## 5. Batas yang diketahui

1. **Penjaga granularitas hanya menyala untuk nama tempat langka** (df ≤ 6). Pada korpus uji,
   setiap kecamatan diwakili ≥ 25 indikator, sehingga cabang tag `retrieval:granularitas-per-desa`
   **tidak dapat terpicu** di sana; ia dibuktikan uji unit. Di korpus produksi (2.065 record,
   38 OPD) peluangnya lebih besar, tetapi **belum terukur** karena korpus produksi tidak dapat
   direproduksi luring. → kandidat perbaikan lanjutan.
2. **`selesai:meta` bergantung pada penanda jalur** di meta jawaban; bila penanda itu berubah
   bentuk, tag akan jatuh ke `selesai:leksikal` (aman, tetapi kurang tepat). Ada uji unit untuk
   kasus ini, bukan uji end-to-end.
3. **Sebab generasi hanya terlihat bila AI hidup.** Pada mode deterministik murni
   (`AI_ENABLED=false`), tag `generasi:*` tidak akan pernah muncul — sesuai definisinya, tetapi
   berarti bagian 6c **tidak dapat** membuktikan cabang generasi pada server deterministik.
   Pembuktiannya ada di uji unit + eval pada server AI.
4. **Sebaran sebab masih per-minggu** di dasbor; belum ada deret waktu lintas minggu (itu bagian
   OPS/NFR-07 telemetri, belum dikerjakan).
5. **Belum ada penghitung sebab agregat di `/api/status`.** Untuk sekarang, angka sebaran hanya
   muncul di keluaran `eval-run.mjs` dan dasbor celah.

---

## 6. Verifikasi ulang di klon bersih & seri patch

Seri patch `06-USULAN-KODE/seri-patch/` memuat seluruh komit kode & dokumen FR-20 (berkas
`NNNN-*.patch`, dijalankan **urut angka**; folder `seri-patch/` sendiri tidak ikut dipatch karena
ia wadahnya). Pada klon bersih `main`:

```
git am  << semua berkas NNNN-*.patch, urut angka >>
npx vitest run   → jumlah uji sama dengan cabang
git diff --stat <cabang>  → 0 baris berbeda (selain folder seri-patch/)
```

Hasil pemeriksaan akhir dicatat di dokumen `11-KIT-SERAH-TERIMA.md` (bagian "Apa yang diserahkan"
dan "Jejak verifikasi") — dokumen itu sengaja **tidak menyebut nomor ujung seri patch**, supaya
tidak menua setiap kali seri bertambah.

---

## 7. Langkah berikutnya

Menurut urutan dokumen 10: **FR-24 — pemeriksa pasangan entitas** (memastikan angka yang
dikutip benar-benar milik entitas yang ditanyakan: kecamatan/OPD/tahun yang tepat), lalu
**FR-23 — pembersihan masukan**, lalu Fase D (aksesibilitas, penyegaran terjadwal, tata kelola).

Alasan FR-24 layak sesudah FR-20: FR-20 memberi tahu **di mana** kegagalan terjadi; FR-24
menutup kelas kegagalan yang paling berbahaya — jawaban yang tampak benar tetapi membawa angka
entitas lain ("angka tetangga"), yang sampai sekarang hanya ditangkap oleh uji invarians eval.
