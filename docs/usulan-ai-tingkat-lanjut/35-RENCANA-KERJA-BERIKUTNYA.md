# 35 — Rencana kerja berikutnya (untuk agen repo lokal / hermes)

Dokumen ini adalah **daftar periksa kerja yang tersisa**, disusun dari keadaan nyata per
**24 September 2026**. Berbeda dari [dokumen 32](32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md)
(yang menjelaskan *apa* yang terbuka dan *kenapa*), dokumen ini menuliskan *siapa mengerjakan apa,
dengan kriteria terima yang terukur*.

Keadaan saat dokumen ini ditulis:

| Hal | Nilai |
|---|---|
| Cabang kerja | `dev` = **53 komit** di atas `main` `ff00eb8` |
| Yang sudah dipush hermes | **seluruhnya** — termasuk `0051` (harness hermetik) & `0052` (dokumen ini) |
| Yang **belum** dipush | tidak ada (per verifikasi 26 Sep 2026, §0) |
| Gerbang | 719 uji / 44 berkas · `tsc` 0 · build 0 · PII-gate 0 · uji terima **exit 0** |
| Sisa terbuka | 4 butir (panel penilai manusia · EV-06 model sungguhan · a11y 8 rute · *top-up* semantik) |

---

## 0. Status verifikasi — 26 September 2026 (pembaruan)

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
| **C5** | **Jaga bit eksekusi**: hook `.githooks/pre-commit` adalah pagar PII + typecheck; snapshot yang kehilangan mode 755 membuat git **melewatinya tanpa suara** (pernah terjadi dua kali, termasuk 26 Sep 2026). Setiap kali menarik kiriman baru: `git ls-files -s .githooks/pre-commit scripts/*.sh scripts/*.mjs | awk '$1!="100755"'` → bila ada, `chmod +x` lalu periksa ulang. |
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
| **P1** | **Catatan rilis + tag untuk gelombang 53 komit** (menutup `OPS-05` yang masih 🟡) | `git tag` = **0**; `CHANGELOG.md` masih berhenti di `0.1.0` (19 Sep) sementara `dev` sudah 53 komit | 1–2 jam | `CHANGELOG` punya entri gelombang ini (isi · bukti · **cara mundur**); tag `v0.2.0-dev` dibuat; `OPS-05` → ✅ |
| **P2** | **Uji kontrak skema SPLP + deteksi pergeseran** | Bila SPLP mengganti/menghapus nama bidang, aplikasi bisa menjawab salah **tanpa** uji apa pun gagal — 719 uji memakai korpus tarikan, bukan SPLP hidup | ±1 hari | Skrip membandingkan **bidang wajib** korpus tarikan terakhir vs tarikan baru; pergeseran ⇒ GAGAL dengan daftar bidang; ikut dijalankan di `uji-terima.sh` |
| **P3** | **Ambang kesegaran data + alarm** (`DS-03` lanjutan) | Stempel kesegaran **tampil**, tetapi tidak ada yang **berbunyi** bila korpus basi berhari-hari | ±4 jam | `dataFetchedAt` lebih tua dari N hari ⇒ banner + entri peringatan operator; uji unit + tampil di `/admin/status`; N dapat diatur |
| **P4** | **Pagar kuota & anggaran harian** (`NFR-04` lanjutan) | Batas harian panggilan model sudah ada; kuota penyimpanan (mis. Upstash) & volume cache belum terpantau | ±4 jam | `/api/admin/telemetri` menampilkan pemakaian & sisa per hari (model + cache); alarm bila > 80 % |
| **P5** | **Regresi kinerja (anggaran p95)** | p95 deterministik kini **107 ms** — bagus, tetapi tidak ada uji yang gagal bila ia mundur 10× | ±4 jam | Harness mencatat p95 dan **GAGAL** bila melewati anggaran (mis. 3× nilai rujukan) pada lingkungan yang sama |
| **P6** | **`FR-03` lanjutan: "tahun lalu / sekarang" → tahun konkret** | Status dok 10: 🟡 — rentang tahun dasar ✅, tetapi "tahun lalu" belum dipetakan | ±4 jam | Kueri "tahun lalu", "sekarang", "dua tahun terakhir" memetakan ke tahun data nyata; item eval `W*` lulus; A/B bukti tidak berubah |

### F2 — Menengah (±1 minggu; masih tanpa langganan berbayar)

| # | Butir | Dasar (terukur) | Usaha | Kriteria terima |
|---|---|---|---|---|
| **P7** | **Aksesibilitas 11 rute + uji fokus berperamban** | Pemeriksa bekerja **tanpa peramban** (dok 32 §5.3): urutan fokus & perangkap fokus belum terukur; cakupan 3/11 rute | ±2–4 hari | 11 rute lulus; Playwright memeriksa urutan fokus, perangkap fokus, dan `skip-link` pada 3 rute utama; artefak diperbarui |
| **P8** | **Aktivasi penyedia semantik sungguhan → tutup `FR-13`/`FR-14`** | Penyedia `remote` kelas e5 **sudah siap dipakai**; `fusiRRF` k=60 sudah ada, tetapi penerimaan `FR-14` (recall@10 ≥ 90 % pada kueri sulit) belum diukur dengan embedding nyata; `FR-13` (indeksasi berkonteks) belum dimulai | ±1 minggu | Dengan **set tahan** lebih dahulu: recall@10 ≥ 90 % pada kueri sulit; presisi kueri panjang naik tanpa menurunkan presisi; A/B penuh; baseline disahkan pemilik |
| **P9** | **Kunci anti-mundur (regression lock) 120 item** | Baseline membandingkan **skor**, bukan **isi jawaban** — perubahan teks yang tetap "lulus" bisa lolos tanpa disadari | ±1 hari | Sidik jawaban 120 item disimpan; patch yang mengubah jawaban tanpa alasan ⇒ peringatan eksplisit di `uji-terima.sh` |
| **P10** | **`FR-05` lanjutan: bentuk jawaban kausal bersitasi** | Status dok 10: 🟡 — pagu kejujuran ✅, bentuk bersitasi ⬜ | ±2 hari | Pertanyaan "kenapa" menjawab dengan bukti terdekat + **batas kesimpulan** tertulis; item `K*`/`N4` lulus dengan bentuk baru; 0 klaim tanpa rujukan |
| **P11** | **Perluasan uji merah (OWASP LLM Top 10 2025)** | Korpus beracun menutup 6 bentuk serangan; belum ada: injeksi **tidak langsung** (via umpan balik/katalog), kebocoran *system prompt*, *denial-of-wallet*, eksfiltrasi PII lewat ringkasan | ±3 hari | Tiap vektor punya uji yang **wajib gagal-aman** (tanpa `[PATUH:]`, tanpa rahasia, tanpa kuota terbakar); kontrol negatif ikut gagal |

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
| `FR-03` 🟡 · `FR-05` 🟡 | teknis, murah | **P6** · **P10** |
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
P1 (tag + changelog)      ← menutup satu-satunya sisa rumah tangga rilis, ±2 jam
P3 + P5 (kesegaran, kinerja)   ← murah, menutup dua kelas kebutaan operasional
P2 (kontrak SPLP)         ← risiko terbesar yang belum terjaga
P7 (a11y 11 rute)         ← kewajiban yang sudah tertulis
P6 + P10 (FR-03/FR-05)    ← menutup dua sisa teknis dok 10
P8 (semantik + FR-13/14)  ← paling besar; butuh set tahan lebih dahulu
```
