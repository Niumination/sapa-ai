# 32 — Sisa terbuka & rencana penutup (per 24 September 2026)

Dokumen ini menjawab satu pertanyaan: **"apa lagi yang belum selesai, kenapa belum, dan siapa yang
bisa menutupnya?"** Ditulis agar bisa dibaca oleh tiga pihak sekaligus — pemilik produk (memutuskan),
pengembang/agen repo lokal (mengerjakan), dan penilai (memverifikasi).

Sifatnya **jujur-daftar**: tidak ada butir di bawah ini yang disembunyikan, dan tidak ada butir yang
diklaim selesai tanpa bukti. Sebaliknya, dokumen ini **tidak** memuat kelemahan yang sudah tertutup —
yang sudah lulus dibuktikan pada §6.

---

## 0. Ringkas — empat butir, dengan sifat dan pemilik keputusan

| # | Sisa terbuka | Sifat | Siapa yang bisa menutup | Perkiraan besar | Risiko bila dibiarkan |
|---|---|---|---|---|---|
| 1 | **Skor panel penilai manusia (EV-05)** | Menuntut **orang**, bukan kode — satu-satunya kriteria terima yang tidak bisa diotomasi | 2 penilai manusia (pegawai/domain owner) | ± 1–2 jam per penilai | Sedang (kredibilitas laporan, bukan teknis) |
| 2 | **EV-06 — uji dengan model sungguhan** | Terblokir **eksternal**: langganan penyedia model belum diperpanjang | Pemilik produk (perpanjang langganan), lalu pengembang menjalankan | ± 1 hari kerja setelah kuota ada | Rendah ke pengguna, sedang ke jadwal (prompt mungkin perlu disetel) |
| 3 | **Cakupan aksesibilitas: 3 dari 11 rute** | Utang bertahap, bukan cacat yang diketahui | Pengembang (atau agen repo lokal) | 1 patch, kecil–sedang | Rendah (halaman internal) tetapi kewajiban bila target WCAG 2.2 AA dipertahankan |
| 4 | **Typo-katalog membuat jawaban sempit** (*top-up* semantik) | **Keputusan produk** — memperbaiki berarti menggeser patokan mutu | Pemilik produk memutuskan; pengembang mengeksekusi | 1 patch + re-baseline penuh (seluruh verifikasi ulang) | Rendah (jawaban tetap benar & dapat ditelusuri), hanya kurang lengkap pada satu pola kueri |

Status kode: **`dev` = 50 komit di atas `main` `ff00eb8`** (12 komit di atas `origin/dev` `86af3b5`) —
49 komit sebelum dokumen ini, **50** sesudah komit dokumen ini (`0049`), **52** setelah komit `0050`
(perbaikan temuan penerapan — [laporan 33](33-LAPORAN-VERIFIKASI-PENERAPAN-2026-09-24.md)) dan `0051`
(harness hermetik — [laporan 34](34-LAPORAN-LINGKUNGAN-UJI-HERMETIK.md)); pohon kerja bersih. Gerbang: **719 uji lulus / 44 berkas** · `tsc` bersih ·
build lulus · PII-gate `LEAK_COUNT 0` · uji terima deterministik **exit 0** (`eval 120/120`).

---

## 1. Skor panel penilai manusia (EV-05) — satu-satunya yang menuntut manusia

### Apa yang diminta kriteria terima

EV-05 berbunyi: *"≥ 3 item baru per niat lulus **dan** skor relevansi penilai ≥ 4/5"* (panel 30 sampel).
Bagian pertama **sudah lulus**: 120/120 item, akurasi niat router 30/30, 9/9 niat punya ≥ 3 item baru.
Yang belum ada hanyalah **angkanya** — dan angka itu hanya sah bila yang menilai adalah **manusia**.

### Kenapa belum ada

Mesin tidak dapat menggantikan manusia di sini. Sudah dibuat **praskor mesin** (rubrik deterministik
atas 30 sampel yang sama): relevansi **4,93/5** · bukti **5,00/5** · jujur **4,60/5**, dengan kontrol
rubrik 3/3 tertangkap. Praskor itu **dinyatakan sendiri di keluarannya** sebagai
"PRASKOR MESIN (bukan penilaian manusia)" dan tidak pernah dipakai untuk mengklaim lulus.

Menyulap praskor menjadi skor resmi adalah bentuk ketidakjujuran yang paling mudah terjadi pada
proyek seperti ini, karena hasilnya kelihatan bagus (4,93/5) dan tidak ada yang memeriksa. Karena itu
ditolak secara sadar, dan status EV-05 tetap 🟡.

### Modal yang sudah siap (tidak ada yang perlu dibuat lagi)

| Berkas | Isi |
|---|---|
| `verifikasi/panel-penilai-30.json` | 30 sampel berlapis 9 niat: pertanyaan, jawaban aplikasi, daftar bukti, teks rubrik |
| `verifikasi/panel-penilai-30.csv` | lembar isian untuk Excel/LibreOffice (kolom `penilai1_*`, `penilai2_*`) |
| `verifikasi/panel-penilai-30.html` | lembar penilaian mandiri — tampil di peramban mana pun **tanpa aset luar** (aman dibuka langsung dari berkas) |
| `scripts/hitung-panel.mjs` | penghitung: rata-rata per dimensi, rata-rata per niat, kesepakatan antar-penilai |
| `scripts/siapkan-panel-penilai.mjs` | penyiap instrumen (bisa dijalankan ulang terhadap aplikasi hidup) |

Rubriknya tiga dimensi, tiap dimensi bernilai 1–5:

- **relevansi** — *"Apakah jawaban menjawab pertanyaan yang diajukan?"* (1 = salah topik · 3 = sebagian · 5 = tepat sasaran)
- **bukti** — *"Apakah angka & klaim di jawaban benar-benar ada di daftar bukti?"* (1 = ada di luar bukti · 3 = sebagian tak tertelusuri · 5 = semua tertelusuri)
- **jujur** — *"Apakah jawaban mengaku bila data tidak ada / tidak cukup?"*

### Aturan penghitungan yang berlaku

```bash
node scripts/hitung-panel.mjs --berkas=verifikasi/panel-penilai-hasil.csv     # hitung hasil manusia
node scripts/hitung-panel.mjs --praskor --kendali                            # penyaring awal + kontrol rubrik
```

- **Wajib ≥ 2 penilai** yang terisi. Bila hanya satu → keluar kode **2** dengan pesan
  `[BELUM CUKUP] panel memerlukan ≥ 2 penilai`. Alasannya bukan birokrasi: selisih rata-rata
  antar-penilai adalah satu-satunya ukuran **kesepakatan**, dan rubrik yang menghasilkan penilaian
  jauh berbeda berarti rubrik/jawabannya ambigu — informasi yang justru berharga.
- **Ambang lulus**: relevansi rata-rata **≥ 4,0**; di bawah itu keluar kode **1**.
- Penilaian yang kosong **tidak** diisi otomatis dan tidak dianggap nol; sampel yang tidak dinilai
  hanya mengecilkan cakupan, dan itu ikut tercetak.

### Cara menutup

1. Pegang `verifikasi/panel-penilai-30.html` (atau CSV-nya), isi oleh **dua orang** — idealnya satu
   dari sisi data (paham isi katalog) dan satu dari sisi layanan (paham kebutuhan warga).
2. Simpan kolom penilaian ke `verifikasi/panel-penilai-hasil.csv`.
3. Jalankan `hitung-panel.mjs`; simpan keluarannya sebagai `verifikasi/panel-penilai-hasil.txt`.
4. Perbarui status EV-05 di `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` dari 🟡 menjadi ✅ **beserta
   angka manusia** (bukan angka praskor).

### Risiko bila dibiarkan

Tidak ada risiko teknis: mutu jawaban sudah dibuktikan lewat 120/120, A/B 12/12 identik, dan
serangkaian uji sabotase. Risikonya **kredibilitas**: ke OPD tidak dapat diklaim "dinilai manusia
≥ 4/5" sebelum ada penilai manusia. Bila suatu saat ada sengketa atas sebuah jawaban, panel manusia
adalah bukti yang paling mudah diterima pihak non-teknis.

---

## 2. EV-06 — pengujian dengan model sungguhan

### Apa yang diminta kriteria terima

*"Uji dengan model sungguhan (bukan penyedia tiruan), hasil dibandingkan dengan baseline"* — jalur
`AI_BASE_URL` produksi, set evaluasi dijalankan ulang, dan hasilnya dibandingkan dengan baseline
deterministik.

### Kenapa belum bisa

Seluruh jalur AI sudah terpasang dan terverifikasi, tetapi **melalui penyedia tiruan** (`mock-pintar`,
`mock-patuh`, `mock-tukar`, dan stub SPLP). Uji dengan model nyata menuntut kuota penyedia — dan
langganan model **belum diperpanjang** (ini keadaan yang Anda sampaikan sendiri sejak awal).

Justru keputusan Anda untuk tetap melanjutkan pekerjaan dengan mode deterministik sebagai tulang
punggung yang membuat delapan butir terakhir bisa diselesaikan tanpa langganan: FR-12, FR-19, FR-20,
FR-23, FR-24, FR-25, FR-26, FR-27, DS-03, DS-05, NFR-07, NFR-09, CMP-02/03/04, EV-05 seluruhnya
diukur pada jalur yang tidak butuh model komersial.

### Modal yang sudah siap

- Penyedia kelas `remote` (embedding kelas e5) terpasang dan siap dipakai untuk lapis semantik.
- Sirkuit penyedia (auth · throttle · server · jaringan · timeout) + status jujur + fail-closed
  `revalidate` sudah diuji di harness keterbukaan (tiga keadaan: AI mati · AI hidup · penyedia gagal).
- Gerbang nilai-tambah otomatis: jawaban AI yang lebih miskin daripada deterministik **ditolak** —
  sehingga kebenaran data tidak bergantung pada mutu model. Ini penting: begitu model nyala,
  jawaban buruk tidak bisa lolos ke warga.
- Harness yang tinggal diarahkan: `uji-sitasi.mjs`, `uji-parafrase.mjs`, `uji-pasangan.mjs`,
  `uji-keterbukaan.mjs`, `uji-eval-120.mjs`, `eval-run.mjs`, `uji-terima.sh` — semuanya membaca
  `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` dari lingkungan.

### Cara menutup

```bash
AI_ENABLED=true AI_PROVIDER=custom \
  AI_BASE_URL=<titik akhir penyedia> AI_API_KEY=<kunci> AI_MODEL=<nama model> \
  npx next start -p 3116 &
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/eval-run.mjs          # set 120 item, mode AI
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/uji-eval-120.mjs      # harness + kontrol negatif
node scripts/bandingkan-jawaban.mjs --banding                            # A/B AI vs deterministik
```

Yang harus diperhatikan saat menutup:

1. **Bandingkan dengan baseline, jangan hanya "lulus"**. Angka yang penting bukan 120/120-nya,
   melainkan **berapa jawaban berubah** dibanding baseline `data/eval-baseline.json` dan apakah
   perubahan itu membaik atau memburuk.
2. Bila mutu bahasa model nyata lebih buruk dari perkiraan → **jangan** turunkan pagar; setel prompt
   atau biarkan jalur deterministik yang menjawab. Kebenaran lebih utama daripada keindahan bahasa.
3. Simpan keluarannya sebagai artefak (`verifikasi/eval120-ai-<tanggal>.txt`) dan catat tanggal +
   nama model — tanpa itu, hasilnya tidak dapat direproduksi.

### Risiko bila dibiarkan

Rendah ke pengguna: mode deterministik sudah menjadi tulang punggung dan jawaban AI yang lebih miskin
otomatis ditolak. Sedang ke jadwal: begitu model nyala, prompt mungkin perlu disetel ulang 1–2
putaran. Risiko ini sudah tercatat sebagai baris tersendiri di tabel risiko `10-KEBUTUHAN-…`
("Mutu bahasa model sungguhan berbeda dari penyedia tiruan").

---

## 3. Cakupan aksesibilitas: 3 dari 11 rute

### Keadaan sekarang

`scripts/uji-aksesibilitas.mjs` memeriksa **tiga** rute — `JALUR = ['/dashboard', '/keterbukaan',
'/tata-kelola-risiko']` — dan lulus: **exit 0**, 9/9 sabotase HTML tertangkap, 3/3 sabotase CSS
tertangkap, **25/25 pasangan kontras** lulus (paling ketat 3,13:1).

### Yang belum masuk daftar (8 rute)

`/` · `/dashboard/analytics` · `/dashboard/gis` · `/dashboard/laporan` · `/dashboard/status` ·
`/admin/ai-toggle` · `/admin/celah-pengetahuan` · `/admin/umpan-balik`

### Kenapa begini (dan apa aturan yang berlaku)

Audit ulang 24 Sep menemukan bahwa harness lama hanya memeriksa `/dashboard` — dan justru karena itu
sebuah cacat WCAG nyata (tautan notis CMP-02 dengan sasaran < 24 px, SC 2.5.8) lolos sekian lama.
Pelajarannya dijadikan **aturan tetap**, bukan sekadar catatan:

> **Setiap permukaan publik baru wajib masuk `JALUR` pada komit yang sama saat ia dibuat.**

Tiga rute yang paling berisiko (publik, baru dibaca warga, dan satu dashboard utama) sudah masuk
lebih dahulu. Sisanya **bukan terlupakan**, melainkan utang bertahap yang sengaja tidak ditumpuk ke
komit audit — menambah 8 permukaan sekaligus ke dalam satu komit yang sudah menutup 8 temuan akan
membuat penyebab tiap perubahan sulit ditelusuri.

### Cara menutup

```bash
# aplikasi hidup dulu
SAPA_A11Y_URL=http://127.0.0.1:3181 node scripts/uji-aksesibilitas.mjs
# ubah JALUR di scripts/uji-aksesibilitas.mjs menjadi seluruh 11 rute, ulangi sampai exit 0
```

Perkiraan: skripnya generik (memeriksa HTML + CSS nyata dan menanam cacat untuk membuktikan dirinya
tidak vakum), jadi kerja utamanya adalah **memperbaiki temuan nyata** yang muncul — bukan menulis
harness baru. Halaman `/admin/*` kemungkinan paling banyak temuan karena dibangun paling awal.

Catatan kejujuran yang dibawa dari laporan 24: pemeriksa ini bekerja **tanpa peramban**, sehingga
urutan fokus dan perangkap fokus belum terukur. Bila ingin menutup itu, perlu uji dengan peramban
nyata (Playwright) — pekerjaan tersendiri, dan sebaiknya dijadikan butir baru, bukan diselipkan.

### Risiko bila dibiarkan

Rendah bagi pengguna (delapan rute itu sebagian besar internal), tetapi **kewajiban** bila target
WCAG 2.2 AA dipertahankan dalam dokumen tata kelola (CMP-03 memuat risiko aksesibilitas R-08 dengan
pemilik dan tanggal tinjauan). Risiko tata kelola lebih besar daripada risiko pengguna.

---

## 4. Keterbatasan terukur: typo yang "kebetulan cocok" dengan salah tulis di katalog

### Apa yang terjadi (kejadian nyata, bukan hipotesis)

Uji terima menanyakan indikator dengan salah tulis `pendudk`. Katalog produksi **sendiri** memuat
indikator yang benar-benar salah tulis: **"Jumlah Pendudk Usia 13-15 Tahun"**. Lapis leksikal
menemukannya lebih dulu (dan menemukannya dengan benar — kata itu memang ada di katalog), lalu
jawaban menjadi **sempit: satu baris bukti**.

Pengukuran ulang pada `verifikasi/korpus-produksi.json` (2.065 record):

| Ukuran | Nilai |
|---|---|
| Baris record yang namanya memuat "penduduk" (tidak peduli huruf) | **28** |
| Nama indikator unik yang memuat "Penduduk" | **20** |
| Nama indikator unik yang memuat salah tulis "Pendudk" | **1** |

> **Koreksi kecil (dicatat supaya tidak terbawa):** laporan 31 §5 menyebut "katalog punya 22 baris
> penduduk". Pengukuran ulang memberi **28 baris / 20 nama unik**; angka 22 digantikan angka ini.
> Arah argumennya tidak berubah — jawaban yang sempit itu justru makin terasa sempit.

Penting dipahami: jawaban itu **tidak salah**. Setiap angka yang disajikan benar, dapat ditelusuri
ke bukti, dan memang ada di katalog. Yang kurang hanyalah **kelengkapan** — 27 baris lain tidak ikut
muncul. Ini bukan halusinasi, bukan angka palsu, bukan grounding palsu.

### Kenapa tidak langsung diperbaiki

Ada invarian yang disengaja bernama **"leksikal-dulu"**: lapis semantik hanya boleh mengisi bila
lapis leksikal **kosong**. Invarian itu yang menjamin jawaban yang sudah benar **tidak mungkin
berubah** karena lapis semantik. Seluruh pengukuran FR-12 (recall@15 12/20 → 20/20, indeks dingin
75 ms) dan pemisahan baseline 120/120 berdiri di atas invarian ini.

Perbaikan yang dirancang (*top-up*: tambah bukti semantik bila leksikal menghasilkan bukti lebih
sedikit dari ambang kecil) mengharuskan lapis semantik **menambah baris di atas hasil leksikal**.
Konsekuensinya berantai:

- urutan & isi bukti berubah → **baseline `data/eval-baseline.json` (120/120) batal**;
- **A/B 12/12 identik** (yang baru diverifikasi pada audit ulang) batal;
- perlu set tahan (hold-out) untuk membuktikan tidak ada jawaban lain yang justru memburuk.

Artinya ini **bukan perbaikan kecil**, melainkan menggeser patokan mutu yang sudah disepakati. Karena
itu diperlakukan sebagai **keputusan pemilik produk**, bukan perbaikan senyap.

### Tiga pilihan yang tersedia

| Opsi | Isi | Untung | Rugi |
|---|---|---|---|
| **(a) Biarkan** | Sistem menyajikan apa yang ada di katalog, termasuk salah tulisnya | Kejujuran data terjaga; tidak ada patokan yang batal; nol risiko regresi | Satu pola kueri berujung jawaban sempit |
| **(b) Kerjakan *top-up* semantik** | Lapis semantik menambah bukti bila leksikal menghasilkan bukti di bawah ambang kecil (mis. < 3 baris) | Kueri sempit jadi lengkap | 1 patch + re-baseline penuh (set tahan, baseline baru, A/B ulang, seluruh verifikasi) |
| **(c) Perbaiki di sumber** | Salah tulis `Pendudk` diperbaiki di katalog SPLP | Akar masalah hilang untuk semua konsumen data | Perubahan data pemerintahan — keputusan OPD, di luar kewenangan aplikasi |

Prasyarat mutlak bila memilih **(b)**: sediakan set tahan (hold-out) lebih dahulu, jalankan A/B
sebelum-sesudah atas seluruh set, dan tetap larang semantik menambah baris selama leksikal sudah
melewati ambang. Tanpa tiga itu, *top-up* berubah menjadi perubahan buta yang bisa menurunkan mutu
jawaban di tempat lain tanpa ketahuan.

### Risiko bila dibiarkan

Rendah. Yang perlu dijaga hanyalah **narasi**: jangan mengklaim "semua kueri selalu menemukan seluruh
baris relevan". Kata yang tepat adalah *"jawaban menyajikan baris yang ditemukan katalog; bila kata
kunci cocok dengan satu nama indikator, jawaban dapat menyempit"* — dan itu sudah tercatat di
`31-LAPORAN-AUDIT-ULANG.md` §5.

---

## 5. Batas interpretasi hasil (agar tidak diklaim melebihi fakta)

1. **Korpus uji adalah tarikan produksi bertanggal, bukan produksi langsung.** Semua angka
   (2.065 record · 38 OPD · 1.795 indikator) berasal dari tarikan **24 September 2026** yang disimpan
   di `verifikasi/korpus-produksi.json`. Bila SPLP menambah data setelah tanggal itu, angka perlu
   ditarik ulang oleh **agen repo lokal** — pekerjaan dari sisi ini tidak menyentuh remote maupun
   SPLP hidup (lihat `11-KIT-SERAH-TERIMA.md`).
2. **Uji dilakukan dengan penyedia model dimatikan** (konsisten dengan keadaan produksi: langganan
   belum diperpanjang). Jalur AI diverifikasi lewat penyedia tiruan pada harness yang memang
   membutuhkannya. Ini modal EV-06, bukan kelemahan yang disembunyikan.
3. **Pemeriksa aksesibilitas bekerja tanpa peramban** — urutan fokus & perangkap fokus belum terukur
   (lihat §3).
4. **Skor praskor bukan skor kriteria terima** (lihat §1).

---

## 6. Yang sudah tertutup (agar daftar sisa ini tidak salah dibaca)

Supaya tidak ada yang mengira masih banyak yang bolong, berikut ringkas yang **sudah lulus dengan
bukti** pada cabang ini:

| Bidang | Butir | Bukti terakhir |
|---|---|---|
| Jawaban deterministik | nilai-saat-ini, tren, perbandingan, peringkat, komposisi, distribusi, katalog, sebab, personal · bentuk jawaban per niat (FR-18) · klasifikasi sebab (FR-20) | `uji-bentuk-jawaban.txt` 122 pemeriksaan · kontrol negatif exit 1 · A/B 12/12 |
| Anti-halusinasi & pengamanan | sitasi per klaim (FR-19) · pemeriksa pasangan entitas (FR-24) · pembersihan data katalog (FR-23) · gerbang nilai-tambah | `uji-sitasi/`, `uji-pasangan`, `uji-bersih-data` (`[PATUH:]` 0) |
| Retrieval | lapis semantik Bahasa Indonesia + fusi RRF, invarian leksikal-dulu (FR-12) · kamus sinonim daerah 57 entri (DS-05) | recall@15 20/20 · 8/8 kueri daerah & 8/8 berubah saat kamus mati |
| Kesegaran & operasi | cap kesegaran data (FR-25) · kesegaran cache korpus (DS-03) · penyegaran terjadwal (OPS-03) · telemetri `gen_ai.*` (NFR-07) · notifikasi sirkuit terbuka (OPS-04) | harness end-to-end + kontrol negatif yang ikut gagal |
| Kepatuhan & transparansi | notis transparansi + kanal koreksi warga (FR-26) · keterbukaan penggunaan AI (CMP-02) · tata kelola risiko 9 risiko (CMP-03) · jejak audit tanpa data pribadi (CMP-04) | 24 + 13 + 18 pemeriksaan · PII 0 · A/B 12/12 |
| Mutu & evaluasi | set evaluasi 120 item · akurasi niat 30/30 · dasbor celah pengetahuan (FR-27) | `uji-eval-120.txt` 32 pemeriksaan · `--sabotase` exit 1 |
| Aksesibilitas | 3 rute bersih, pemeriksa anti-vakum | 9/9 + 3/3 sabotase · 25/25 kontras |
| Gerbang menyeluruh | 719 uji / 44 berkas · `tsc` 0 · build lulus · PII-gate 0 · uji terima `exit 0` **juga saat shell operator kotor** | `verifikasi/uji-terima-det.txt`, `verifikasi/uji-terima-hermes-verifikasi.txt`, `verifikasi/uji-terima-lingkungan-kotor.txt` |

Yang **tidak** ada pada daftar di atas adalah keempat butir §1–§4. Tidak ada yang lain.

---

## 7. Urutan penutupan yang disarankan

> **Daftar kerja operasionalnya (siapa mengerjakan apa, kriteria terima, urutan, dan larangan) ada di
> [dokumen 35](35-RENCANA-KERJA-BERIKUTNYA.md).** Bagian di bawah ini menjelaskan *mengapa* urutannya
> begitu.

| Urutan | Butir | Siapa | Kenapa urutan ini |
|---|---|---|---|
| 1 | Panel penilai manusia (§1) | 2 penilai manusia | Murah, bisa jalan **paralel** tanpa menyentuh kode, dan langsung menutup satu-satunya kriteria terima yang menuntut manusia |
| 2 | Cakupan aksesibilitas 8 rute (§3) | pengembang / agen repo lokal | Tidak mengubah bukti apa pun, tidak menggeser baseline — aman dikerjakan kapan saja |
| 3 | EV-06 model sungguhan (§2) | pemilik produk → pengembang | Terblokir kuota; begitu langganan diperpanjang, 1 hari kerja |
| 4 | *Top-up* semantik (§4) | pemilik produk memutuskan → pengembang | Terakhir, karena menggeser baseline & membatalkan seluruh A/B |

**Definisi "selesai penuh"** (semuanya benar-benar ada, bukan klaim):

1. `verifikasi/panel-penilai-hasil.txt` memuat skor **≥ 2 penilai manusia** dengan relevansi ≥ 4,0 —
   dan status EV-05 di `10-KEBUTUHAN-…` menjadi ✅.
2. `scripts/uji-aksesibilitas.mjs` memeriksa **11 rute** dan keluar **exit 0**; artefaknya diperbarui.
3. `verifikasi/eval120-ai-<tanggal>.txt` ada, memuat nama model + tanggal, dan dibandingkan dengan
   baseline (bukan hanya "lulus").
4. Keputusan tertulis atas §4 (opsi a/b/c) tercatat di dokumen ini atau di laporan lanjutan.

---

## 8. Catatan untuk agen repo lokal (hermes)

- Semua pekerjaan ini berada di **patch**, bukan di remote: `06-USULAN-KODE/seri-patch/`
  (`0001`–`0049` + dua bundel). Tidak ada `push`/`fetch` dari sisi ini — remote milik agen lokal.
- Urutan aman: `npm ci` → terapkan patch → `npx vitest run` (harap **719 lulus / 44 berkas**) →
  `npm run typecheck` → `npm run build` → uji terima (§7 `11-KIT-SERAH-TERIMA.md`).
- **Jangan** menyentuh `main` sampai pemilik produk memutuskan.
- Bila mengerjakan butir §3 (aksesibilitas), ingat aturan tetap: permukaan publik baru **wajib**
  masuk `JALUR` pada komit yang sama, dan halaman statis hanya boleh menghasilkan catatan (bukan
  pelanggaran) bila tidak memuat permukaan tanya.
- Bila memilih opsi §4(b), sediakan **set tahan** lebih dahulu, dan jangan lupa bahwa mengubah bukti
  berarti membatalkan baseline 120/120 — itu keputusan pemilik produk, bukan keputusan teknis.
