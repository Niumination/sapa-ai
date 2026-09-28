# 35 — Rencana kerja berikutnya (untuk agen repo lokal / hermes)

Dokumen ini adalah **daftar periksa kerja yang tersisa**, disusun dari keadaan nyata per
**24 September 2026**. Berbeda dari [dokumen 32](32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md)
(yang menjelaskan *apa* yang terbuka dan *kenapa*), dokumen ini menuliskan *siapa mengerjakan apa,
dengan kriteria terima yang terukur*.

Keadaan saat dokumen ini ditulis:

| Hal | Nilai |
|---|---|
| Cabang kerja | `dev` = **66 komit** di atas `main` `ff00eb8` (per 28 Sep 2026; termasuk komit bukti & dokumen) |
| Yang sudah dipush hermes | sampai `289b02f` (pohon = komit kita `fed548b`, setara 53 komit) — lihat §0b |
| Yang **belum** dipush | `0053`–`0065` (13 patch = 13 komit: dokumen 35/36, P1–P6, P9, P10, P11, bukti klon) — lihat §0 |
| Butir §F yang **sudah selesai** | **P1 · P2 · P3 · P4 · P5 · P6 · P9 · P10 · P11** (28 Sep 2026) — sisa: P7, P8, P14; P12/P13/P15/P16 menunggu pihak luar |
| Gerbang | **794 uji / 48 berkas** · `tsc` 0 · PII-gate 0 · uji terima **exit 0** (dengan §1b kontrak, §6i kinerja, §8 kunci jawaban) |
| Sisa terbuka | 4 butir (panel penilai manusia · EV-06 model sungguhan · a11y 8 rute · *top-up* semantik) |

---

## 0. Status verifikasi — 27 September 2026 (pembaruan kedua)

Pekerjaan **dari sisi ini** (sandbox, tanpa operasi tulis ke remote) sejak verifikasi 26 Sep:

| Komit | Isi | Bukti |
|---|---|---|
| `0053` | dokumen 35: status verifikasi + peta penyempurnaan + C5 (bit eksekusi) | — |
| `0054` **P3** | alarm kesegaran data (dua sebab) di status, jawaban, dan UI | `verifikasi/uji-kesegaran.txt` **13 ✓ / 0 ✗** · 23 uji unit + 3 uji rute |
| `0055` **P5** | anggaran kinerja p95 + §6i pada gerbang uji terima | `verifikasi/uji-kinerja.txt` (p50 142-150 ms · **p95 186-200 ms**) · kontrol negatif `uji-kinerja-anggaran-terlampau.txt` **GAGAL** |
| `0056` **P2** | uji kontrak skema SPLP + deteksi pergeseran + §1b gerbang | `verifikasi/uji-kontrak-splp.txt` (3 sabotase tertangkap; pergeseran `satuan` GAGAL) · snapshot `verifikasi/kontrak-splp.json` |
| `0057` **P1** | catatan rilis `v0.2.0-dev` + CHANGELOG + versi/engines (menutup `OPS-05`) | `36-CATATAN-RILIS-0.2.0-dev.md` |
| `0058` | dokumen 10 & 35: status `OPS-05` ✅, `DS-03` +alarm, P1/P2/P3/P5 ✅ | — |

**Temuan penting saat mengerjakan (kelas yang sama dengan tiga temuan sebelumnya):** bit
eksekusi 15 berkas (`scripts/*`, `.githooks/pre-commit`, `verifikasi/uji-terima.sh`) tercopot
lagi oleh snapshot, dan **komit `0054` sempat ikut mencopotnya**. Seluruh seri ditulis ulang
(ketiga komit, isi berkas diverifikasi identik byte-per-byte) sehingga tidak satu pun patch
membawa pencopotan bit; tiga harness baru ditambahkan sebagai `100755`. Aturan **C5** di §C
lahir dari kejadian ini.

---

## 0. Status verifikasi — 27 September 2026 (pembaruan ketiga)

Pekerjaan lanjutan dari sisi ini (sandbox, **tanpa** operasi tulis ke remote):

| Komit | Isi | Bukti |
|---|---|---|
| `0059` **P4** | pagar kuota & anggaran harian → blok `kuota` + `kuotaCatatan` di `/api/admin/telemetri` | `verifikasi/uji-kuota.txt`: 35 permintaan dari satu IP = 30×200 + 5×429 (pembatas 30/menit); `ai-harian` 0/2000; `teguran-laju` 5/200 = 2,5 % (di bawah 80 %, jadi **aman** — bukan "perhatian"); baca #1 = baca #2 (peek, tidak menambah hitungan); tanpa token → 401 · **14 uji unit** |
| `0060` **P6** | `FR-03` lanjutan: "tahun lalu / tahun ini / tahun depan / N tahun terakhir / sejak–sampai XXXX" → tahun konkret | `verifikasi/uji-waktu-relatif.txt` (**A/B build lama vs baru**, 7 pertanyaan): "IPM tahun lalu" → bukti 2025×4 + kalimat pemetaan; "target stunting tahun depan" → **jujur**: "Tidak ada data untuk tahun 2027"; kontrol "IPM 2025" & "berapa jumlah ASN" **tidak berubah** · **21 uji unit** · eval 120/120 · dok 10 `FR-03` → ✅ |
| `0061` **P9** | kunci anti-mundur jawaban 120 item + langkah **opsional** §8 pada `uji-terima.sh` | `verifikasi/uji-kunci-jawaban.txt`: (1) kunci ditulis (120 sidik); (2) uji ulang **IDENTIK** (keluar 0); (3) kontrol sintetis (2 sidik dirusak + item palsu) → terdeteksi, keluar 1; (4) **kontrol nyata**: instance kedua dengan `SAPA_BENTUK_NIAT=off` → **eval 120/120 keluar 0 (buta)**, kunci P9 melaporkan **120 berubah, keluar 1** · `verifikasi/gerbang-putaran-26.txt` = gerbang penuh dengan §8 aktif → **LULUS** |
| `0062` | dokumen 35 & 10: `P4`/`P6`/`P9` ✅, angka gelombang, aturan C5 memakai daftar eksplisit 20 berkas `100755` | — |
| `0063` | bukti klon bersih bundel (64/26 komit): pohon = `dev`, 20 berkas `100755`, 0 pencopotan bit, 780 uji lulus — **dengan catatan jujurnya** (`npm ci` penuh tidak selesai di sandbox) | `verifikasi/klon-bundel.txt` |
| `0064` **P10** | `FR-05` kausal bersitasi: niat `sebab` diperluas hubungan/kaitan/memengaruhi/dampak/korelasi, filter domain ketat menghilangkan "Perguruan Tinggi", narasi kausal bersitasi + batas kesimpulan, 0 klaim tanpa rujukan | `verifikasi/uji-kausal.txt` (K1–K4/N4/E24–E27 10/10, 120/120, sitasi 0 tanpa) + `src/lib/__tests__/kausal.test.ts` 14 uji |
| `0065` **P11** | OWASP LLM Top 10 2025: korpus beracun 6→10 (eksfiltrasi URL, BEGIN SYSTEM, DoW 10000 paragraf, PII NIK), bersih-data perluasan 8 pola + NIK [data-pii] + anti-sarang, mock-patuh 4 vektor baru, harness `uji-merah-owasp.mjs` | `verifikasi/uji-merah-owasp.txt` (10 katalog + 5 langsung LULUS, 0 PATUH, prompt bersih, umpan balik bersih) |

**Temuan penting (kelas yang sama dengan temuan sebelumnya — jangan salah baca):** uji parafrase
**penuh** (`SAPA_PARAFRASE_PENUH=1`, opt-in) menyala merah pada korpus produksi 2.065 record
(18/20 = 90 %, set negatif 3/5), padahal bukti saat `FR-12` dikerjakan mencatat 20/20 & 5/5.
Sebabnya **korpus**, bukan kode: bukti lama diukur pada stub **1.210 record** (sidik `0db47884`),
hari ini **2.065** (sidik `9e372412`). Katalog produksi memang memuat indikator salah tulis
"Jumlah Pendudk Usia 13-15 Tahun" (persis kasus angkatan `0051`), 3 record "Sepak Bola", dan
frasa "harga cabai" yang cocok leksikal dengan "PDRB … atas dasar Harga Konsisten". Harness itu
**tidak sah dipakai sebagai ambang pada korpus produksi** sebelum harapannya disesuaikan per
korpus. Butir merah kedua (FR-23 "balasan mode AI") sama sifatnya: `AI_URL` diarahkan ke instance
yang AI-mati, jadi tidak ada "mode AI" untuk diperiksa. Rincian: `verifikasi/gerbang-putaran-26.txt`
bagian catatan.

**Bit eksekusi (C5) — daftar bertambah:** sekarang **20 berkas** `100755` (18 sebelumnya +
`scripts/uji-kunci-jawaban.mjs` + `docs/usulan-ai-tingkat-lanjut/uji-terima.sh`, yang sebelumnya
644 — selalu dijalankan lewat `bash`, jadi tidak pernah ketahuan). Bukti klon bersih:
`git ls-files -s | awk '$1=="100755"'` = 20 berkas, daftar identik dengan repo induk, dan
0 `755 => 644` di seluruh 64 komit bundel.

---

## 0b. Status verifikasi — 26 September 2026

Diperiksa ulang dari luar (baca publik GitHub, **tanpa** operasi tulis dari sisi ini):

| Yang diperiksa | Hasil |
|---|---|
| Ujung `dev` di GitHub | `289b02f` — "Dokumen: 35 rencana kerja berikutnya…" (kaitan: `0052`) |
| **Pohon `dev` GitHub** | `b5a9625de5acd6a320ecc1ce0bcad165a41a4c67` |
| **Pohon `dev` lokal** | `b5a9625de5acd6a320ecc1ce0bcad165a41a4c67` — **identik 40/40 karakter** |
| Selisih terhadap `main` | `ahead_by 53` · `behind_by 0` · basis `ff00eb8` **tidak tersentuh** |
| Berkas kunci dari sisi GitHub | `scripts/lingkungan-uji.mjs` **ada** pada `289b02f` → `0051` benar-benar terpasang |
| Tag rilis | **0 tag** (lihat §F-P1 — satu-satunya sisa `OPS-05`) |

**Kesimpulan §0:** T1 **SELESAI & TERVERIFIKASI**. Karena pohon Git mencakup seluruh berkas beserta
jalurnya, kesamaan pohon = kesamaan isi **byte per byte** untuk semua berkas — bukan sekadar
kemiripan uji. Tidak ada lagi pekerjaan yang menggantung di sisi penerapan.

> **Catatan metode:** SHA komit lokal dan SHA hasil penerapan agen berbeda (identitas & tanggal
> berbeda), jadi yang dibandingkan **selalu pohon (`tree`)**, bukan SHA komit. Diuji juga: klon bersih
> `main` + `00-semua.patch` (53 komit) menghasilkan pohon `b5a9625de5ac…` — sama.

---

## A. Wajib dikerjakan hermes berikutnya

### T1 — Terapkan & push komit `0051` (harness hermetik) · **✅ SELESAI 25 Sep 2026** *(terverifikasi 26 Sep, §0)*

| | |
|---|---|
| Berkas patch | `06-USULAN-KODE/seri-patch/0051-Harness-hermetik-…patch` |
| Perintah | `git switch dev && git am <patch>` → `npm ci && npx vitest run` → `npm run typecheck && npm run build` |
| **Kriteria terima** | ① `npx vitest run` = **719 lulus / 44 berkas**; ② `REVALIDATE_SECRET=apa-saja node scripts/uji-segarkan.mjs` mencetak **"1 variabel shell dinetralkan … REVALIDATE_SECRET"** dan berakhir **45 ✓ / 0 ✗ LULUS**; ③ gerbang penuh `bash verifikasi/uji-terima.sh` **exit 0** dijalankan **dengan rahasia tetap diekspor**; ④ `git push` — lalu `main` masih `ff00eb8` |
| Bukti yang disimpan | keluaran ② dan ③ (mis. `verifikasi/uji-segarkan-lingkungan.txt`, `verifikasi/uji-terima.txt`) |
| Catatan | Ini menutup temuan ketiga Anda. Tanpa `0051`, siapa pun yang punya `REVALIDATE_SECRET` di lingkungannya akan melihat kegagalan palsu pada §6h — dan itu melatih orang mengabaikan gerbang. |

### T2 — Tarik ulang korpus produksi & segarkan konstanta katalog · **±1 jam**

| | |
|---|---|
| Kenapa | Semua angka kit bertanggal: korpus **2.065 record / 38 OPD / 1.795 indikator** (tarikan 24 Sep). Bila SPLP sudah menambah data, konstanta di set evaluasi jadi basi — dan itu kelas kesalahan yang sudah pernah kita perbaiki (v1: 2.055 vs 2.065) |
| Cara | tarik dari SPLP produksi → simpan sebagai `verifikasi/korpus-produksi.json` → perbarui medan `korpus` di `data/eval-set.json` (jumlah record/OPD/indikator **dan** tanggal tarik) |
| **Kriteria terima** | ① `node scripts/eval-run.mjs` mencetak `Konstanta katalog: …` **sesuai data baru**; ② eval **120/120** (mode det & AI); ③ bila ada item eval yang gagal karena data berubah → laporkan, **jangan** ubah ambang; ④ baseline diregenerasi dengan `--baseline-dari`, dan selisihnya dicatat |
| Jangan | mengubah `data/eval-baseline.json` secara manual — selalu lewat `--baseline-dari` agar jejaknya terlihat |

### T3 — Perluas cakupan aksesibilitas ke 8 rute sisa · **±2–4 jam**

| | |
|---|---|
| Rute yang belum masuk | `/` · `/dashboard/analytics` · `/dashboard/gis` · `/dashboard/laporan` · `/dashboard/status` · `/admin/ai-toggle` · `/admin/celah-pengetahuan` · `/admin/umpan-balik` |
| Berkas | `scripts/uji-aksesibilitas.mjs` (`JALUR`) |
| **Kriteria terima** | ① `JALUR` memuat **11 rute**; ② `node scripts/uji-aksesibilitas.mjs` **exit 0** (semua rute); ③ temuan nyata yang muncul **diperbaiki**, bukan dikecualikan; ④ artefak `verifikasi/uji-aksesibilitas.txt` diperbarui; ⑤ sabotase tetap 9/9 (HTML) + 3/3 (CSS) tertangkap |
| Aturan tetap | permukaan publik **baru** wajib masuk `JALUR` pada komit yang sama. Halaman statis hanya boleh menghasilkan **catatan** (bukan pelanggaran) bila tidak memuat permukaan tanya |
| Bonus (opsional, butir baru) | uji dengan peramban sungguhan (Playwright) untuk urutan fokus & perangkap fokus — pemeriksa sekarang bekerja tanpa peramban |

### T4 — Panel penilai manusia EV-05 · **±1–2 jam × 2 orang** (butuh manusia)

| | |
|---|---|
| Alat siap pakai | `verifikasi/panel-penilai-30.html` (lembar mandiri, tanpa aset luar) + `.csv` + `scripts/hitung-panel.mjs` |
| Yang harus dilakukan | **dua orang** mengisi 30 sampel × 3 dimensi (relevansi · bukti · jujur) |
| **Kriteria terima** | ① `verifikasi/panel-penilai-hasil.csv` memuat **≥ 2 penilai**; ② `node scripts/hitung-panel.mjs --berkas=…` → **relevansi ≥ 4,0** dan mencetak kesepakatan antar-penilai; ③ keluarannya disimpan sebagai `verifikasi/panel-penilai-hasil.txt`; ④ status EV-05 di dokumen 10 diubah 🟡 → ✅ **memakai angka manusia** |
| Jangan | memakai praskor mesin (4,93/5) sebagai skor kriteria terima — itu penyaring awal, bukan penilaian |

---

## B. Menunggu pemicu dari luar (bukan pekerjaan yang bisa dimulai sekarang)

### T5 — EV-06: uji dengan model sungguhan · **±1 hari**, pemicu: langganan penyedia diperpanjang

```bash
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=<titik akhir> AI_API_KEY=<kunci> AI_MODEL=<model> npx next start -p 3116
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/eval-run.mjs
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/uji-eval-120.mjs
node scripts/bandingkan-jawaban.mjs --banding <sebelum.json> <sesudah.json>
```

**Kriteria terima:** ① eval 120 item dijalankan **dengan model nyata**; ② dibandingkan dengan
baseline (bukan hanya "lulus") — **berapa jawaban berubah** dan ke arah mana; ③ artefak disimpan
sebagai `verifikasi/eval120-ai-<tanggal>.txt` **beserta nama model**; ④ bila mutu bahasa lebih buruk,
**jangan** turunkan pagar — setel prompt atau biarkan jalur deterministik yang menjawab.

### T6 — *Top-up* semantik untuk typo-katalog · pemicu: **keputusan pemilik produk**

Masalahnya (terukur): kueri `pendudk` menemukan indikator yang memang salah tulis di katalog
(`"Jumlah Pendudk Usia 13-15 Tahun"`), sehingga jawaban benar tetapi **sempit** (1 bukti), padahal
katalog punya **20 nama indikator unik** memuat "Penduduk".

Bila diputuskan **dikerjakan**, urutannya **wajib**:
1. siapkan **set tahan** (hold-out) lebih dahulu — tanpa ini, perubahan tidak boleh dikerjakan;
2. jalankan A/B sebelum↔sesudah atas **seluruh** set;
3. baru izinkan semantik menambah baris bila leksikal menghasilkan bukti di bawah ambang kecil;
4. re-baseline `data/eval-baseline.json` dan ulangi eval 120/120 + A/B.

**Kriteria terima:** tidak ada satu pun jawaban lain yang **memburuk**; perubahan bukti terdokumentasi;
baseline baru disahkan pemilik produk.
**Jangan** mengerjakan ini sebagai "perbaikan kecil" — ia membatalkan baseline & seluruh A/B yang ada.

---

## C. Perawatan & kebersihan (kapan saja, murah)

| Butir | Isi |
|---|---|
| **C1** | Setelah patch `0051` dipush: perbarui `main` **hanya bila** pemilik produk memutuskan promosi. Sampai itu, `main` tetap `ff00eb8` |
| **C2** | Perbarui skill DOX Anda (`arena-patch-adoption`) dengan **tiga pitfall baru**: (a) salinan skrip kedua → wajib penunjuk/satu sumber; (b) aturan yang dihitung di dua tempat → wajib satu fungsi; (c) lingkungan anak diwarisi `process.env` → wajib hermetik. Ketiganya sudah menggigit berturut-turut |
| **C3** | Jalankan `sha256sum -c SHA256SUMS.txt` pada kit setiap kali menerima kiriman baru — bila ada berkas tidak cocok, minta kirim ulang sebelum `git am` |
| **C5** | **Jaga bit eksekusi** — **20 berkas** `100755` per 27 Sep 2026: `.githooks/pre-commit` (pagar PII + typecheck), 16 skrip `scripts/*.mjs` (`buat-korpus-beracun`, `ekspor-jejak-audit`, `hitung-panel`, `siapkan-panel-penilai`, `uji-bentuk-jawaban`, `uji-bersih-data`, `uji-cache-korpus`, `uji-eval-120`, `uji-jejak-audit`, `uji-kamus-daerah`, `uji-kesegaran`, `uji-keterbukaan`, `uji-kinerja`, `uji-kontrak-splp`, `uji-kunci-jawaban`, `uji-tata-kelola`), `scripts/pii-gate.sh`, `verifikasi/uji-terima.sh`, dan `docs/usulan-ai-tingkat-lanjut/uji-terima.sh`. Snapshot yang kehilangan mode 755 membuat git **melewati hook tanpa suara** (terjadi 3×, termasuk 26 Sep 2026). Periksa dengan **daftar eksplisit ini**, BUKAN glob: 15 berkas `scripts/*.mjs` memang `100644` sehingga glob melaporkan "masalah" palsu. Bila ada yang bukan 100755: `chmod +x`, periksa ulang lewat `git diff-tree -r --summary <komit>` (harus 0 `755 => 644`), dan jangan `git checkout -- .`. |
| **C4** | Bila RAM terbatas (< 2 GB): jalankan harness **bertahap** (satu per satu), jangan empat server sekaligus — pernah memicu swap berat dan mengubah waktu tunggu |

---

## D. Yang **tidak** boleh dilakukan (agar tidak merusak bukti)

1. **Jangan** menyentuh `main` sampai pemilik produk memutuskan promosi.
2. **Jangan** melonggarkan ambang uji untuk membuat gerbang hijau — kalau gagal, perbaiki kode atau
   perbaiki alat ujinya, dan **tulis yang mana** (itulah yang terjadi tiga kali terakhir).
3. **Jangan** memakai praskor mesin sebagai skor kriteria terima EV-05.
4. **Jangan** mengubah bukti jawaban (urutan/isi `evidence`) tanpa re-baseline + A/B.
5. **Jangan** memakai kembali `verifikasi/uji-terima.sh` sebagai salinan terpisah — ia **penunjuk**
   ke skrip kanonik `docs/usulan-ai-tingkat-lanjut/uji-terima.sh`.
6. **Jangan** menjalankan `git checkout -- .` saat pohon kotor (pernah menghapus satu putaran kerja).

---

## E. Urutan yang disarankan

```
T1 (0051: terapkan → buktikan → push)      ← sekarang, wajib
T2 (tarik ulang korpus + konstanta)        ← setelah T1, ±1 jam
T3 (a11y 8 rute)                           ← mandiri, tidak menggeser bukti
T4 (panel manusia)                         ← paralel, butuh 2 orang
C2 (perbarui skill DOX)                    ← murah, bisa kapan saja
T5 (EV-06)                                 ← begitu langganan aktif
T6 (top-up semantik)                       ← terakhir, butuh keputusan produk
```

**Definisi "selesai penuh"** (semuanya harus benar-benar ada, bukan klaim):

1. `0051` dipush, dan `main` tetap `ff00eb8` (kecuali promosi diputuskan).
2. Uji terima **exit 0** dijalankan dari shell apa adanya (tanpa `env -u`).
3. `verifikasi/panel-penilai-hasil.txt` memuat skor **≥ 2 penilai manusia** dengan relevansi ≥ 4,0.
4. `scripts/uji-aksesibilitas.mjs` memeriksa **11 rute**, exit 0, artefaknya diperbarui.
5. `verifikasi/eval120-ai-<tanggal>.txt` ada, memuat nama model, dan dibandingkan dengan baseline.
6. Keputusan tertulis atas §B-T6 (dikerjakan / dibiarkan / diperbaiki di sumber) tercatat.


---

## F. Peta penyempurnaan lanjutan (kandidat `P1`–`P15`)

Ditulis karena pertanyaan sah berikutnya: *"setelah seluruh urutan yang disetujui tuntas, apa lagi
yang benar-benar menaikkan mutu?"* Butir di bawah disusun dari **kelemahan yang sudah terukur** —
bukan daftar keinginan. Tiap butir punya pemicu, usaha, dan kriteria terima yang bisa diperiksa.

### F1 — Cepat & murah (tanpa biaya, tanpa keputusan; bisa dikerjakan berurutan)

| # | Butir | Dasar (terukur) | Usaha | Kriteria terima |
|---|---|---|---|---|
| ~~**P1**~~ ✅ | **Catatan rilis + tag untuk gelombang ini** (menutup `OPS-05`) | `git tag` kosong; `CHANGELOG` berhenti di `0.1.0` | selesai 27 Sep | ✅ `CHANGELOG` entri `0.2.0-dev` (isi · bukti · cara mundur) + dok **36**; **tag dibuat di repo pemilik** (patch tidak membawa tag) |
| ~~**P2**~~ ✅ | **Uji kontrak skema SPLP + deteksi pergeseran** | 745 uji memakai korpus tarikan, bukan SPLP hidup | selesai 27 Sep | ✅ `scripts/uji-kontrak-splp.mjs` + §1b gerbang; 3 sabotase tertangkap; snapshot `verifikasi/kontrak-splp.json`; bukti `verifikasi/uji-kontrak-splp.txt` |
| ~~**P3**~~ ✅ | **Ambang kesegaran data + alarm** (`DS-03` lanjutan) | stempel tampil tetapi tidak ada yang berbunyi | selesai 27 Sep | ✅ DUA sebab (tarikan lama & tahun katalog tertinggal) di `/api/status` + setiap jawaban + lencana UI; `verifikasi/uji-kesegaran.txt` 13 ✓ / 0 ✗ |
| ~~**P5**~~ ✅ | **Regresi kinerja (anggaran p95)** | p95 hanya angka di dokumen | selesai 27 Sep | ✅ `scripts/uji-kinerja.mjs` + §6i gerbang; p95 186-200 ms vs anggaran 1000 ms; kontrol negatif anggaran 1 ms **GAGAL** |
| ~~**P4**~~ ✅ | **Pagar kuota & anggaran harian** (`NFR-04` lanjutan) | kuota penyimpanan & volume cache tak terpantau | selesai 27 Sep (`0059`) | ✅ `src/lib/kuota.ts` + blok `kuota`/`kuotaCatatan` di `/api/admin/telemetri`; dua kuota yang memang tak terukur (penyimpanan & biaya penyedia) **dinyatakan**, bukan dibiarkan kosong; teguran laju ikut dicatat; bukti `verifikasi/uji-kuota.txt`; 14 uji |
| ~~**P6**~~ ✅ | **`FR-03` lanjutan: "tahun lalu / tahun ini" → tahun konkret** | Status dok 10: 🟡 | selesai 27 Sep (`0060`) | ✅ `src/lib/waktu-relatif.ts` (+21 uji); bukti A/B `verifikasi/uji-waktu-relatif.txt`; kontrol "IPM 2025" & "berapa jumlah ASN" tidak berubah; eval 120/120; dok 10 `FR-03` → ✅ |

### F2 — Menengah (±1 minggu; masih tanpa langganan berbayar)

| # | Butir | Dasar (terukur) | Usaha | Kriteria terima |
|---|---|---|---|---|
| **P7** | **Aksesibilitas 11 rute + uji fokus berperamban** | Pemeriksa bekerja **tanpa peramban** (dok 32 §5.3): urutan fokus & perangkap fokus belum terukur; cakupan 3/11 rute | ±2–4 hari | 11 rute lulus; Playwright memeriksa urutan fokus, perangkap fokus, dan `skip-link` pada 3 rute utama; artefak diperbarui |
| **P8** | **Aktivasi penyedia semantik sungguhan → tutup `FR-13`/`FR-14`** | Penyedia `remote` kelas e5 **sudah siap dipakai**; `fusiRRF` k=60 sudah ada, tetapi penerimaan `FR-14` (recall@10 ≥ 90 % pada kueri sulit) belum diukur dengan embedding nyata; `FR-13` (indeksasi berkonteks) belum dimulai | ±1 minggu | Dengan **set tahan** lebih dahulu: recall@10 ≥ 90 % pada kueri sulit; presisi kueri panjang naik tanpa menurunkan presisi; A/B penuh; baseline disahkan pemilik |
| ~~**P9**~~ ✅ | **Kunci anti-mundur (regression lock) 120 item** | baseline membandingkan **skor**, bukan **isi jawaban** | selesai 27 Sep (`0061`) | ✅ `scripts/uji-kunci-jawaban.mjs` + `verifikasi/kunci-jawaban.json` + langkah **§8 opsional** (`SAPA_UJI_KUNCI=1`) pada `uji-terima.sh`; kontrol nyata: eval **buta** (120/120, keluar 0) sementara kunci menangkap **120 perubahan** |
| ~~**P10**~~ ✅ | **`FR-05` lanjutan: bentuk jawaban kausal bersitasi** | Status dok 10: ✅ (27 Sep 2026) — 7 intent korelasi baru, filter domain ketat, narasi kausal bersitasi | selesai 27 Sep (`0064`) | ✅ K1–K4/N4/E24–E27 10/10 & 120/120 (0 regresi) + sitasi 0 tanpa rujukan + 14 uji baru; bukti `verifikasi/uji-kausal.txt` |
| ~~**P11**~~ ✅ | **Perluasan uji merah (OWASP LLM Top 10 2025)** | Korpus beracun 6→10 + 4 langsung (URL, system prompt, DoW, PII) + umpan balik | selesai 28 Sep (`0065`) | ✅ 10 katalog + 5 langsung LULUS, 0 PATUH, prompt bersih, umpan balik bersih, kontrol negatif tetap gagal (4 PATUH tambahan bila tanpa bersih); bukti `verifikasi/uji-merah-owasp.txt` |

### F3 — Butuh keputusan / pemicu eksternal (tidak bisa dimulai sendiri)

| # | Butir | Pemicu | Kriteria terima |
|---|---|---|---|
| **P12** | **`EV-06` + `NFR-01`** (uji & latensi dengan model sungguhan) | langganan penyedia | dokumen 35 §B-T5 |
| **P13** | **Panel penilai manusia `EV-05`** | 2 penilai manusia | dokumen 35 §A-T4 |
| **P14** | **Latihan mundur produksi ≤ 5 menit** (`NFR-10` sungguhan) | kesediaan jendela pemeliharaan | Rollback dilakukan **sekali** di lingkungan uji (promosikan deployment sebelumnya), durasi dicatat ≤ 5 menit |
| **P15** | ***Top-up* semantik typo-katalog** | keputusan pemilik produk | dokumen 35 §B-T6 |
| **P16** | **Permintaan data tingkat desa ke OPD** (`DS-04`) | tindakan administratif, bukan kode | ≥ 1 OPD menyediakan data tingkat desa; item eval jujur-kosong diperbarui |

### F4 — Peta sisa dok-10 → siapa menutup

| Sisa dok 10 | Sifat | Ditutup oleh |
|---|---|---|
| `FR-03` ✅ · `FR-05` ✅ | teknis, murah | **P6** · **P10** (selesai 27 Sep) |
| `FR-13` ⬜ · `FR-14` ⬜ | teknis, menengah | **P8** |
| `NFR-01` 🟡 · `EV-06` ⬜ | terblokir eksternal | **P12** |
| `EV-05` 🟡 | butuh manusia | **P13** |
| `OPS-05` 🟡 | rumah tangga rilis | **P1** |
| `DS-02` 🟡 (peta tingkat lengkap) | teknis, kecil | gabung ke **P2**/**P3** (metadata tingkat ikut dibaca) |
| `DS-04` ⬜ | administratif | **P16** |

**Aturan tetap berlaku untuk semua `P*`:** ambang uji tidak boleh dilonggarkan; perubahan bukti wajib
re-baseline + A/B; `main` tidak disentuh sampai pemilik produk memutuskan promosi (`C1`).

### F5 — Urutan yang saya sarankan bila hanya ada satu minggu

```
✅ SELESAI 28 Sep 2026 (dari sandbox, patch 0053-0065):
   P1 + P3 + P5 + P2 (murah lebih dahulu) → P4 (kuota) → P6 (FR-03) → P9 (kunci jawaban) → P10 (FR-05 kausal bersitasi) → P11 (uji merah OWASP)

SISA (urutan tetap disarankan):
P7 (a11y 11 rute)              ← butuh peramban (Playwright) di lingkungan hermes
P8 (semantik + FR-13/14)       ← paling besar; butuh set tahan + embeddings sungguhan
P14 (latihan mundur ≤ 5 mnt)   ← butuh jendela pemeliharaan (pemilik produk)
```
