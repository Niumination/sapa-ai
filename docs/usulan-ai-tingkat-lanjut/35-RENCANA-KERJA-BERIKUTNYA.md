# 35 — Rencana kerja berikutnya (untuk agen repo lokal / hermes)

Dokumen ini adalah **daftar periksa kerja yang tersisa**, disusun dari keadaan nyata per
**24 September 2026**. Berbeda dari [dokumen 32](32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md)
(yang menjelaskan *apa* yang terbuka dan *kenapa*), dokumen ini menuliskan *siapa mengerjakan apa,
dengan kriteria terima yang terukur*.

Keadaan saat dokumen ini ditulis:

| Hal | Nilai |
|---|---|
| Cabang kerja | `dev` = **52 komit** di atas `main` `ff00eb8` (14 komit di atas `origin/dev` `86af3b5`) |
| Yang sudah dipush hermes | komit `b9696f8` (0050) — **byte-identik** dengan kit; `main` tetap `ff00eb8` |
| Yang **belum** dipush | komit `0051` (harness hermetik) |
| Gerbang | 719 uji / 44 berkas · `tsc` 0 · build 0 · PII-gate 0 · uji terima **exit 0** |
| Sisa terbuka | 4 butir (panel penilai manusia · EV-06 model sungguhan · a11y 8 rute · *top-up* semantik) |

---

## A. Wajib dikerjakan hermes berikutnya

### T1 — Terapkan & push komit `0051` (harness hermetik) · **±30 menit**

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
