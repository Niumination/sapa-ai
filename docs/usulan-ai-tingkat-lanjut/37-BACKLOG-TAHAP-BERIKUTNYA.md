# 37 — Backlog Tahap Berikutnya (7 butir, diputuskan pemilik 1 Oktober 2026)

Dokumen ini adalah **daftar kerja yang harus kita kerjakan semuanya di repo ini**, bukan
sandbox pihak ketiga. Arena menyatakan tahap pertama selesai; tujuh butir di bawah adalah
sisa yang sengaja ditinggalkan karena membutuhkan lingkungan,langganan, atau manusia —
dan ketujuhnya kini **sudah tidak lagi terblokir**.

Menimpa peran §B (menunggu pemicu) dan §F3 (butuh keputusan/pemicu eksternal) pada
[dokumen 35](35-RENCANA-KERJA-BERIKUTNYA.md). Dokumen 35 tetap jadi rujukan sejarah;
backlog aktif ada di sini.

| | |
|---|---|
| Tanggal | 1 Oktober 2026 |
| Keputusan pemilik | "sisa 7 item tersebut harus kita kerjakan semuanya di sini" |
| Cabang | `dev` `052f2f0` · tag `v0.2.0-dev` · 67 komit di atas `main` `ff00eb8` |
| Pohon | `2b8d13500e7a` (sinkron lokal & `origin/dev`) |
| Gerbang terverifikasi | 794 uji/48 berkas · `tsc` 0 · uji terima **exit 0** · eval 120/120 dua mode · P7 a11y 11 rute · P11 OWASP 10 vektor 0 PATUH |
| `main` | `ff00eb8` — **tidak disentuh** sampai pemilik memutuskan promosi |

---

## 0. Tiga klaim lama yang sekarang usang

Dokumen 35 §0b dan §F menulis tiga hal yang **tidak lagi benar**. Dibetulkan di sini supaya
backlog ini tidak mewarisi asumsi basi.

| Klaim lama | Kenyataan terverifikasi 1 Okt 2026 | Bukti |
|---|---|---|
| "Tag rilis **0 tag**" (dok 35 §0b, §F1-P1 "tag dibuat di repo pemilik") | Tag **sudah ada**: `v0.2.0-dev` → `052f2f0` | `git tag -l` = `v0.2.0-dev`; `git ls-remote --tags origin` = `refs/tags/v0.2.0-dev^{}` → `052f2f0` |
| "`0053`–`0065` belum dipush" (dok 35 §0) | Sudah ter-push: `origin/dev` = `052f2f0`, lokal identik | `git rev-parse --short origin/dev` = `052f2f0` |
| "P12/EV-06 terblokir: **butuh langganan**" (dok 35 §B-T5) | **Langganan AKTIF.** Produksi menjawab `ai: active`, `deepseek-v4.1-flash`, 2 query nyata HTTP 200 dalam 11,8–12,1 dtk | `curl /api/status` → `toggles: {aiEnabled: true, detEnabled: true}`; `POST /api/query` dua kueri → 200 |

**Konsekuensi:** P12 dan P13 turun dari "menunggu pihak luar" menjadi pekerjaan biasa.

---

## 1. Tujuh butir — semuanya untuk dikerjakan di sini

Tanda ⬜ belum dikerjakan. Each butir punya kriteria terima yang bisa diperiksa dengan
perintah, bukan dengan klaim.

### P8 — Fokus berperamban (WCAG 2.2 AA) · ⬜

**Dasar:** pemeriksa a11y (P7) bekerja tanpa peramban. Struktur HTML sudah 11 rute LULUS,
tapi **urutan fokus keyboard** dan **perangkap fokus** belum pernah terukur.

| | |
|---|---|
| Alasan | Lolos a11y statis ≠ bisa dipakai keyboard. Dua kelas cacat (focus order, focus trap) mustahil terlihat tanpa browser sungguhan. |
| Prasyarat | Playwright. `~/Library/Caches/ms-playwright` **sudah ada (1.3 GB)** di mesin ini — tidak perlu unduh. |
| Pekerjaan | ① `scripts/uji-fokus-peramban.mjs` baru; ② jalankan pada 3 rute utama (`/`, `/dashboard`, `/keterbukaan`); ③ ukur urutan fokus (`Tab`/`Shift+Tab`), perangkap fokus di dialog/modal, dan `skip-link`; ④ cacat nyata yang ditemukan **diperbaiki di komponen**, bukan dikecualikan di harness |
| Kriteria terima | ① skrip exit 0; ② urutan fokus pada 3 rute tercatat di artefak `verifikasi/uji-fokus-peramban.txt`; ③ minimal 1 sabotase (mis. `tabindex` positif) **tertangkap** — membuktikan harness bukan vakum; ④ `npm run build && npx vitest run` tetap hijau |
| Risiko |_render client-side_; butuh tunggu hydration, bukan sekadar `load` |

### P12 — `EV-06` + `NFR-01`: uji & latensi model sungguhan · ⬜ **tidak lagi terblokir**

**Dasar:** semua bukti mutu selama ini diukur terhadap `mock-patuh`, bukan model nyata.
Angka produksi (11,8–12,1 dtk) sudah ada, tapi **belum pernah masuk gerbang**.

| | |
|---|---|
| Pekerjaan | ① jalankan `node scripts/eval-run.mjs` dan `scripts/uji-eval-120.mjs` **dengan `AI_BASE_URL`/`AI_API_KEY` produksi**; ② `bandingkan-jawaban.mjs` sebelum↔sesudah vs baseline; ③ catat **nama model** di artefak, bukan hanya skor; ④ ukur p95 latensi jalur AI dan bandingkan dengan anggaran §6i |
| Kriteria terima | ① artefak `verifikasi/eval120-ai-<tanggal>.txt` memuat **nama model** + jumlah item lulus; ② **dibandingkan dengan baseline**, bukan hanya "lulus" — berapa jawaban berubah dan ke arah mana; ③ bila mutu bahasa lebih buruk, **jangan turunkan pagar** — setel prompt atau biarkan jalur deterministik yang menjawab (dok 35 §B-T5) |
| Catatan | Produksi memakai `opencode-go` / `deepseek-v4.1-flash` (OpenCode Go), **bukan** OpenAI-compatible. `AI_PROVIDER=custom` + `AI_BASE_URL` perlu disesuaikan dengan titik akhir yang sebenarnya. |

### P13 — Panel penilai manusia `EV-05` · ⬜

**Dasar:** praskor mesin 4,93/5 bukan penilaian manusia. EV-05 masih 🟡 karena belum ada
skor manusia.

| | |
|---|---|
| Alat siap | `verifikasi/panel-penilai-30.html` (lembar mandiri, tanpa aset luar) + `.csv` + `scripts/hitung-panel.mjs` |
| Pekerjaan | ① sediakan **30 sampel real** dari produksi (query + jawaban + bukti, tanpa PII); ② dua penilai mengisi 30 × 3 dimensi (relevansi · bukti · jujur); ③ `node scripts/hitung-panel.mjs --berkas=…` |
| Kriteria terima | ① `verifikasi/panel-penilai-hasil.csv` memuat **≥ 2 penilai**; ② relevansi **≥ 4,0**; ③ kesepakatan antar-penilai tercetak; ④ artefak `verifikasi/panel-penilai-hasil.txt` tersimpan; ⑤ status EV-05 🟡 → ✅ **memakai angka manusia** |
| Jangan | memakai praskor mesin sebagai skor kriteria terima |
| Catatan | Kalau 2 penilai tidak tersedia, **tulis terus terang** bahwa EV-05 belum tertutup — jangan menutupnya dengan angka mesin |

### P14 — Latihan mundur produksi ≤ 5 menit · ⬜

**Dasar:** `NFR-10` baru tertulis di dokumen. Rollback produsksi **belum pernah dilatih**.

| | |
|---|---|
| Pekerjaan | ① di lingkungan uji (Vercel preview), promote deployment sebelumnya lalu promote kembali; ② catat durasi tiap langkah; ③ tulis runbook mundur yang bisa diikuti orang lain |
| Kriteria terima | ① rollback **dilakukan sekali** di lingkungan uji; ② durasi total **≤ 5 menit** tercatat di runbook; ③ runbook menyebut deployment mana yang jadi target (tidak "yang terakhir") |
| Peringatan dari `AGENTS.md` | `git checkout main` bukan rollback produksi. Produksi = branch `main` di Vercel; `dev` belum dipromosikan. **Jangan** melakukan latihan di produksi tanpa jendela pemeliharaan. |

### P15 — *Top-up* semantik typo-katalog · ⬜

**Dasar:** kueri `pendudk` menemukan indikator yang memang salah tulis di katalog
(`"Jumlah Pendudk Usia 13-15 Tahun"`), sehingga jawaban benar tapi **sempit** — padahal
katalog punya 20 nama indikator unik memuat "Penduduk".

| | |
|---|---|
| Urutan wajib | ① siapkan **set tahan** (hold-out) lebih dahulu — tanpa ini tidak boleh dikerjakan; ② A/B sebelum↔sesudah atas seluruh set; ③ baru izinkan semantik menambah baris bila leksikal menghasilkan bukti di bawah ambang kecil; ④ re-baseline + A/B ulang |
| Kriteria terima | ① tidak ada jawaban lain yang **memburuk**; ② perubahan bukti terdokumentasi; ③ baseline baru disahkan pemilik |
| Jangan | mengerjakan ini sebagai "perbaikan kecil" — ia membatalkan baseline & seluruh A/B yang ada |

### P16 — Permintaan data tingkat desa ke OPD · ⬜

**Dasar:** `DS-04` ⬜. Aplikasi tidak punya data tingkat desa; jawaban untuk pertanyaan desa
hanya bisa jujur kosong.

| | |
|---|---|
| Pekerjaan | ① susun surat/permintaan data resmi ke ≥ 1 OPD; ② terima & validasi bentuk data; ③ muat ke korpus + perbarui item eval jujur-kosong; ④ jalankan kontrak skema (P2) pada data baru |
| Kriteria terima | ① ≥ 1 OPD **sudah memberikan** data tingkat desa; ② kontrak skema SPLP tetap hijau pada bentuk data baru; ③ item eval jujur-kosong diperbarui; ④ ini bukan kode — **proses administratif** |
| Status | Ini butir **administratif**, bukan teknis. Butuh kesiapan institute |

### FR-13 / FR-14 — Embeddings & aktivasi penyedia semantik · ⬜

**Dasar:** penyedia `remote` e5 sudah siap dipakai, `fusiRRF` k=60 sudah ada, tapi
penerimaan `FR-14` (recall@10 ≥ 90 % pada kueri sulit) belum diukur dengan embedding
nyata, dan `FR-13` (indeksasi berkonteks) belum dimulai.

| | |
|---|---|
| Pekerjaan | ① set tahan lebih dahulu; ② aktifkan penyedia `remote` (e5); ③ ukur recall@10 pada kueri sulit; ④ A/B penuh; ⑤ baseline disahkan pemilik |
| Kriteria terima | ① recall@10 **≥ 90 %** pada kueri sulit; ② presisi kueri panjang naik **tanpa** menurunkan presisi; ③ A/B penuh terdokumentasi; ④ baseline disahkan |
| Catatan | Butir ini **paling besar** dari tujuh. Butuh API key penyedia semantik. |

---

## 2. Urutan yang saya sarankan

```
P8   (fokus peramban)     ← murah, Playwright sudah ada, tidak menggeser basis data
P12  (eval model nyata)   ← tidak lagi terblokir, cukup_isolasi env produksi
P14  (latihan mundur)     ← di lingkungan uji, JANGAN di produksi
P13  (panel manusia)      ← butuh 2 penilai; jalan di paralel, tidak mengunci yang lain
P15  (top-up semantik)    ← membatalkan baseline; setelah P12 jadi acuan
FR-13/14 (embeddings)     ← paling besar, butuh API key
P16  (data desa)          ← administratif, mulai suratnya sekarang, kode belakangan
```

**P16 sebenarnya yang paling cepat dimulai** — yang perlu cuma keputusan untuk mengirim
surat, bukan izin teknis.

## 3. Aturan yang tetap berlaku

1. **`main` tidak disentuh** sampai pemilik memutuskan promosi (`C1`).
2. **Ambang uji tidak boleh dilonggarkan.** Kalau gerbang gagal, perbaiki kode atau perbaiki
   alat ujinya — dan tulis yang mana.
3. **Perubahan bukti wajib** re-baseline + A/B.
4. **`git checkout -- .` dilarang** saat pohon kotor.
5. **Bit eksekusi 21 berkas `100755`** — periksa dengan daftar eksplisit (dok 35 §C5),
   bukan glob.
6. Gerbang wajib hijau sebelum commit: `npm run build && npx vitest run`.

## 4. Pelajaran dari tahap yang baru selesai

- **Korpus harness adalah prasyarat, bukan opsional.** `verifikasi/stub-splp.mjs` tanpa
  argumen hanya melayani 10 record bawaan; eval 120 item butuh
  `verifikasi/korpus-produksi.json` (2.065 record). Tanpa itu hasilnya 102/120 dan
  **terlihat seperti regresi kode** — satu jam terbuang untuk chase masalah yang tidak ada.
- **Satu check gagal belum berarti regresi.** `scripts/uji-segarkan.mjs` flaky 1 dari 5 run
  karena membandingkan `lastFetched` lewat cache 10 menit (44/45 sekali, 45/45 empat kali).
  Ulangi 3–5× sebelum menyimpulkan.
- **Angka di dokumen arena bisa meleset** meski repo benar: klaim "21 berkas `100755`"
  dengan daftar eksplisit hanya berisi 20 (`scripts/uji-keterbukaan.mjs` tidak masuk).
  Rekonsiliasi dengan `git ls-files -s`, laporkan selisihnya, jangan memaksa repo
  menyesuaikan dokumen.