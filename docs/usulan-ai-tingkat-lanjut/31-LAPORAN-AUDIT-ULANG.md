# 31 — Laporan audit ulang menyeluruh (24 September 2026)

**Pemicu:** permintaan pemilik produk — *"periksa lagi seluruh hasil kerja dan kondisi repo
terakhir; bila masih ada kesalahan, perbaiki, lalu rapikan dokumentasi."*
**Cabang:** `dev`, tanpa menyentuh `main`, tanpa operasi remote.

## 0. Ringkas — apa yang ditemukan dan diperbaiki

| # | Temuan | Sifat | Tindakan |
|---|---|---|---|
| 1 | **Pelanggaran WCAG 2.2 AA yang belum tertangkap**: tautan "Keterbukaan penggunaan AI" pada notis transparansi bergaya tombol (`py-1.5`) **tanpa `target-min`** → tinggi sasaran < 24 px (SC 2.5.8). Cacat lahir bersama CMP-02 dan tidak pernah gagal karena harness aksesibilitas **hanya memeriksa `/dashboard`**, sedangkan komponen itu baru dirender sesudah CMP-02. | **cacat nyata pada kode** | tautan diberi kelas `target-min`; aturan dipisah menjadi fungsi `periksaSasaranTautan()` dan **diuji unit atas markup komponen yang benar-benar dirender** + sabotase (kelas dilepas) |
| 2 | Dua **temuan palsu** pada pemeriksa aksesibilitas ketika halaman publik baru ikut diperiksa: (a) tautan lompati dituntut pada halaman **tanpa satu pun tautan** sebelum `<main>`; (b) wilayah live dituntut pada halaman **statis tanpa permukaan tanya**. | aturan pemeriksa terlalu longgar artinya | aturan dipersempit sesuai bunyi SC (2.4.1 = blok berulang; wilayah live = hanya bila ada jawaban yang muncul tanpa pindah halaman), **dikunci dua uji unit baru**, dan **cakupan diperluas** ke `/keterbukaan` + `/tata-kelola-risiko` |
| 3 | Kedua halaman publik baru **tidak punya navigasi** — warga yang membukanya dari tautan notis tidak punya jalan kembali. | kekurangan nyata | ditambahkan `<nav aria-label="Navigasi halaman">` + tautan lompati + `<main id="konten">` di kedua halaman |
| 4 | `docs/usulan-ai-tingkat-lanjut/uji-terima.sh` memakai **ambang tetap 90 item** (dari set lama) — skrip uji terima bisa meluluskan diri sendiri pada set 120 item. | **cacat pada skrip penerimaan** | ambang diturunkan dari `data/eval-set.json` (`AMBANG_TOTAL`/`AMBANG_LULUS`, dapat ditimpa env); ambang uji unit 230 → 700 |
| 5 | `data/eval-set.json` masih menyebut korpus **2.055 record** (tarikan 4 Sep) padahal produksi sekarang **2.065** (38 OPD, 1.795 indikator unik) dan invarians anti-halu memakai angka itu. | data tidak selaras kenyataan | medan `korpus` diperbarui (2.065 / 38 / 1.795, 24 Sep 2026) + catatan wajib perbarui setiap tarikan; runner menampilkan konstanta **dari set**, bukan hardcode |
| 6 | `README.md` menyebut **"169 pengujian pada 17 berkas"** (basi dari sebelum cabang ini) dan tidak menyebut permukaan baru (keterbukaan, tata kelola risiko, jejak audit, kanal koreksi, dasbor celah, sitasi, a11y). | dokumentasi basi | diperbarui: **715 uji / 44 berkas**, daftar fitur baru, struktur rute baru, dan tautan ke dokumen tingkat lanjut |
| 7 | **Kegagalan pemeriksaan FR-12 yang bukan cacat kode**: `uji-terima.sh` menuntut kueri salah tulis `pendudk` memunculkan kata persis "penduduk". Pada korpus **produksi**, katalog aslinya memuat indikator bercap salah tulis **"Jumlah Pendudk Usia 13-15 Tahun"**, sehingga lapis **leksikal** (yang memang berjalan lebih dulu) menemukan baris itu dan pemeriksaan menyatakan GAGAL padahal jawabannya sah. | **temuan palsu**, tetapi menyingkap satu keterbatasan nyata | pemeriksaan dipecah dua dan diuji terhadap janji yang benar-benar dibuat: (2a) salah tulis yang ADA di katalog → cukup batang kata `pendud`; (2b) salah tulis di **luar** katalog (`panduduk`) → wajib ditangani lapis **semantik**. Keterbatasan yang tetap dicatat: lihat §5 |
| 8 | **Artefak verifikasi mendahului kode final** — `verifikasi/eval120-produksi-det.txt` dibuat sebelum perubahan terakhir; mode eksekusi 14 berkas skrip hilang akibat pemulihan snapshot; `.next` dan `node_modules` tidak ikut tersimpan sehingga harness gagal `next: not found`. | ketertelusuran & lingkungan | seluruh artefak **dijalankan ulang** pada kode final (lihat §2); mode berkas dipulihkan ke HEAD; kit diberi catatan `npm ci` + `npm run build` sebelum harness |

Tambahan: **satu tes unit gagal** sebagai akibat langsung perbaikan #2 dan sudah diperbaiki
berikut dua uji baru — uji lama menuntut wilayah live pada potongan tanpa permukaan tanya,
yaitu perilaku yang justru salah.

## 1. Keadaan repo diperiksa

| Diperiksa | Hasil |
| --- | --- |
| Cabang & komit | `dev` = **`03ffeae`** sebelum audit; 48 komit di atas `main` `ff00eb8`, 10 di atas `origin/dev` `86af3b5` |
| Pohon kerja | **bersih** setelah mode berkas dipulihkan (sebelumnya 14 berkas tampak "berubah" padahal hanya mode 755 → 644) |
| Bundel patch | `00-semua.patch` **48 komit** (basis `main`) dan `00-lanjutan-dev.patch` **10 komit** (basis `86af3b5`) — keduanya menghasilkan **pohon byte-identik** dengan cabang kerja |
| Uji & build | **715 uji lulus** (44 berkas) · `tsc` 0 · `next build` 0 |
| Port sisa | dibersihkan dengan `ss -ltnp` + pid eksak (bukan `pkill -f`) |

## 2. Seluruh gerbang dijalankan ulang pada kode final

| Harness | Hasil |
| --- | --- |
| `uji-eval-120.mjs` (korpus produksi 2.065) | **exit 0 — 32 pemeriksaan** · 120/120 lulus · akurasi niat 30/30 |
| `uji-eval-120.mjs --sabotase` | **exit 1** — dump rusak buatan terdeteksi |
| `uji-keterbukaan.mjs` / `--sabotase` | **0** / **1** |
| `uji-tata-kelola.mjs` / `--sabotase` | **0** / **1** |
| `uji-jejak-audit.mjs` / `--sabotase` | **0** / **1** |
| `uji-bentuk-jawaban.mjs` | **0** — 6 niat berbentuk sendiri + kontrol negatif gagal seperti seharusnya |
| `uji-kamus-daerah.mjs` | **0** — kamus aktif menemukan, saat dimatikan hasil berubah |
| `uji-sitasi.mjs` · `uji-sebab.mjs` · `uji-pasangan.mjs` | **0** · **0** · **0** |
| `uji-aksesibilitas.mjs` | **0** — 3 halaman (`/dashboard`, `/keterbukaan`, `/tata-kelola-risiko`) · 9/9 sabotase HTML · 3/3 sabotase CSS · 25/25 pasangan kontras |
| **`uji-terima.sh` mode deterministik** (aplikasi korpus produksi) | **exit 0 — semua ambang terpenuhi** · eval **120/120 (ambang 120, diturunkan dari set)** · invarians bersih · telemetri 19 ✓/0 ✗ · penyegaran cache 45 ✓/0 ✗ · lapis semantik & sebab & pasangan entitas OK · artefak: `verifikasi/uji-terima-det.txt` |
| A/B regresi 12 kueri (sebelum `03ffeae` vs sesudah perbaikan) | **12/12 identik · 0 berbeda** (`verifikasi/uji-regresi-ev05.txt`) |
| `eval-run.mjs` penuh | 120/120 · invarians 0 · menyesatkan 0 · regresi baseline 0 |

> Catatan cara menjalankan: harness perlu **`npm ci` + `npm run build`** lebih dulu (kedua
> direktori itu tidak ikut tersimpan antar-sesi), dan sebagian memakai port bawaan —
> jalankan `uji-bentuk-jawaban.mjs` dengan `--port=` bila port bawaan sedang dipakai.

## 3. Perubahan kode pada audit ini

| Berkas | Perubahan |
| --- | --- |
| `src/components/NotisTransparansi.tsx` | tautan bergaya tombol diberi kelas `target-min` (SC 2.5.8) |
| `src/app/keterbukaan/page.tsx`, `src/app/tata-kelola-risiko/page.tsx` | navigasi `<nav aria-label>`, tautan lompati, `<main id="konten">` |
| `verifikasi/aksesibilitas.mjs` | aturan (13) dipisah menjadi `periksaSasaranTautan()` (satu sumber aturan untuk halaman & komponen); aturan (5) & (11) dipersempit sesuai bunyi SC + catatan temuan yang jelas |
| `src/lib/__tests__/aksesibilitas.test.tsx` | +3 uji (notis harus punya sasaran 24 px; sabotase kelas dilepas harus tertangkap; halaman statis tidak dituntut wilayah live; tautan lompati hanya bila ada tautan sebelum `<main>`) |
| `scripts/uji-aksesibilitas.mjs` | cakupan halaman: `['/dashboard', '/keterbukaan', '/tata-kelola-risiko']` |
| `docs/usulan-ai-tingkat-lanjut/uji-terima.sh` | ambang eval diturunkan dari set (120), ambang uji unit 700, judul bagian mengikuti jumlah item |
| `data/eval-set.json` | metadata `korpus` → 2.065 record / 38 OPD / 1.795 indikator (24 Sep 2026); teks `antiHalu` ikut |
| `scripts/eval-run.mjs` | konstanta katalog dibaca dari set dan dicetak dalam keluaran |
| `README.md` | jumlah uji, fitur baru, struktur rute, tautan dokumen tingkat lanjut |

## 4. Pelajaran yang dicatat (agar tidak terulang)

1. **Harness yang memeriksa sedikithalaman memberi rasa aman yang salah.** Cacat CMP-02 lolos
   bukan karena pemeriksanya buta, melainkan karena permukaan yang baru lahir tidak masuk
   daftar halaman yang diperiksa. Aturan: *setiap permukaan publik baru wajib masuk daftar
   halaman harness aksesibilitas pada komit yang sama.*
2. **Komponen yang hanya muncul setelah interaksi tidak terjangkau harness halaman.** Karena itu
   aturan sasaran tautan sekarang punya uji unit atas markup komponen yang benar-benar dirender.
3. **Ambang penerimaan tidak boleh berupa angka tetap.** Set tumbuh (90 → 120); ambang yang
   dipatok akan meluluskan diri sendiri. Diturunkan dari data set.
4. **Artefak bukti harus berasal dari kode final.** Bila kode berubah setelah artefak dibuat,
   artefak itu harus dijalankan ulang — bukan dipertahankan karena "hasilnya sama".
5. **Angka katalog berubah.** 2.055 (4 Sep) → 2.065 (24 Sep). Setiap tarikan korpus wajib
   memperbarui `data/eval-set.json` sekaligus; item meta memakai placeholder, bukan angka tetap.

## 5. Sisa yang masih terbuka (dinyatakan jujur)

> Rincian keempat butir di bawah — beserta modal yang sudah siap, langkah penutupan, dan risiko bila
> dibiarkan — ada di **`32-SISA-TERBUKA-DAN-RENCANA-PENUTUP.md`**.

- **Skor panel penilai manusia (EV-05) belum ada** — instrumennya siap (30 sampel, lembar HTML/CSV,
  alat hitung); hanya orang yang dapat mengisinya. Praskor mesin 4,93/5 adalah penyaring awal.
- Harness aksesibilitas memeriksa **tiga halaman**: `/dashboard` dan dua halaman publik baru.
  Halaman lain (`/`, `/dashboard/analytics`, `/dashboard/gis`, `/dashboard/laporan`,
  `/admin/*`) belum masuk daftar — kandidat berikutnya, dan aturan §4.1 diberlakukan untuk itu.
- **Keterbatasan baru yang terukur (bukan cacat, tetapi perlu diketahui):** bila kueri salah tulis
  **kebetulan cocok** dengan nama indikator yang memang salah tulis di katalog (mis. `pendudk`),
  lapis leksikal berhenti di baris itu dan jawaban menjadi **sempit** — satu bukti
  ("Jumlah Pendudk Usia 13-15 Tahun") padahal katalog punya 22 baris penduduk. Lapis semantik
  **tidak** menambah baris selama leksikal masih menemukan sesuatu (invarian "leksikal-dulu"
  yang disengaja agar jawaban benar tidak berubah). Kandidat perbaikan: *top-up* bukti semantik
  bila leksikal menghasilkan bukti lebih sedikit dari ambang kecil. **Sengaja belum dikerjakan**
  dalam audit ini karena mengubah urutan/bukti jawaban berarti membatalkan baseline 120/120 dan
  seluruh A/B yang baru diverifikasi — itu keputusan pemilik produk, bukan perbaikan senyap.
- **Catatan lanjutan (setelah audit ini):** cabang ini diterapkan hermes agent ke repo klien dan
  dipush ke GitHub; verifikasi penerapannya menemukan **satu cacat nyata yang belum tertangkap audit
  ini** — laporan pembersihan data (`ai.pembersihan`) menghitung kerapian spasi sebagai "sel
  dibersihkan" pada jalur prompt, sehingga pemeriksaan FR-23 salah-tuntut pada korpus produksi. Sudah
  diperbaiki pada komit `0050` beserta 4 uji baru; rincian di
  [laporan 33](33-LAPORAN-VERIFIKASI-PENERAPAN-2026-09-24.md).
- Uji ulang ini memakai **korpus produksi tiruan** (2.065 record hasil tarikan) dan penyedia
  model **dimatikan** — konsisten dengan keadaan produksi (langganan model belum diperpanjang);
  jalur AI diverifikasi lewat penyedia tiruan pada harness yang memang membutuhkannya.
