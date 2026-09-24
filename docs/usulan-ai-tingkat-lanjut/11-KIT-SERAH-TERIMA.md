# 11 — Kit Serah Terima (repo lokal · hermes agent · localhost)

Dokumen ini menjawab: **"bagaimana cara memindahkan dan menguji hasil kerja ini di repo lokal saya
yang sedang dikerjakan agen lain, tanpa mengganggu `main`?"**

Semua perintah di bawah dijalankan **dari dalam klon repo lokal Anda**. Tidak ada langkah yang
menyentuh `main` sampai Anda sendiri memutuskan.

---

## 1. Apa yang diserahkan

| Aset | Letak | Isi |
|---|---|---|
| **Cabang utuh** | `dev` @ ujung cabang ruang kerja ini (43 komit di atas `main` `ff00eb8`, fast-forward; komit FR-18 = patch `0042`, lihat `git log -1`). Basis publik `origin/dev` = `86af3b5` | patch lanjutan `0038`–`0042` duduk **di atas `origin/dev`**; seri patch memuat seluruh komit kode & dokumen, sedangkan folder `seri-patch/` sendiri sengaja tidak ikut dipatch (isinya memang wadah patch) |
| **Seri patch** | `06-USULAN-KODE/seri-patch/` | **seluruh** berkas `NNNN-*.patch` di folder itu, dijalankan **urut angka** (jangan melompat), ditambah **dua** paket tunggal: `00-semua.patch` (basis `main` — seluruh riwayat cabang) dan `00-lanjutan-dev.patch` (basis `origin/dev` `86af3b5` — hanya komit `0038`–`0042`). Komit dokumen dikenali dari judulnya (`Dokumen: …`). Karena setiap ekspor mengecualikan folder ini, `git am` atas semua berkas `NNNN-*.patch` menghasilkan pohon yang **sama persis** dengan ujung cabang |
| **Skrip uji terima** | `06-USULAN-KODE/uji-terima.sh` | memutuskan LULUS/GAGAL sesuai ambang dokumen `10` |
| **Alat pengukuran** | `verifikasi/mock-llm.mjs`, `verifikasi/stub-splp.mjs`, `verifikasi/banding-ai-vs-det.py`, `verifikasi/banding-main-vs-branch.py`, `scripts/uji-sitasi.mjs`, `scripts/uji-parafrase.mjs`, `scripts/uji-sebab.mjs`, `scripts/uji-pasangan.mjs`, `scripts/buat-korpus-uji.mjs`, `scripts/uji-bersih-data.mjs`, `scripts/buat-korpus-beracun.mjs`, `scripts/uji-cache-korpus.mjs`, `scripts/uji-aksesibilitas.mjs`, `scripts/uji-bentuk-jawaban.mjs` | penyedia model & SPLP tiruan + harness pembanding + uji 50 sampel sitasi (FR-19) + uji parafrase EV-05 (FR-12) + uji penanda sebab EV-20 (FR-20) + uji 50 sampel pasangan entitas EV-24 (FR-24) + uji pembersihan data katalog EV-23 (FR-23) + pembangkit korpus uji 1.210 record + pembangkit korpus uji beracun 6 bentuk serangan + uji bentuk jawaban per niat (FR-18) |
| **Penyedia model tiruan** | `verifikasi/mock-llm.mjs` (lima kepribadian: `mock-pintar` jujur · `mock-flash` menulis digit sendiri · `mock-tukar` menukar entitas · `mock-nakal` mengarang · `mock-patuh` **menuruti perintah di dalam data**) | menguji keempat pagar: anti-halu, gerbang nilai-tambah, gerbang pasangan entitas FR-24, dan pembersih data katalog FR-23 — tanpa langganan penyedia |
| **Bukti angka** | `verifikasi/eval90-*.txt`, `banding-G.txt`, `aman-cabang-perilaku.txt`, `uji-terima-hasil.txt`, `eval-parafrase-baseline.txt`, `eval-parafrase-hash.txt`, `eval-sebab-cek.txt`, `uji-sitasi-ai.txt`, `uji-sitasi-det.txt`, `uji-pasangan-jujur.txt`, `uji-pasangan-tukar.txt`, `uji-bersih-data.txt`, `uji-bersih-data-jujur.txt`, `uji-bersih-data-korpus-bersih.txt`, `uji-bersih-data-tanpa-pembersih.txt`, `uji-bersih-data-tanpa-bukti.txt`, `uji-bersih-data-cache-hampa.txt`, `uji-bersih-data-tanpa-prompt.txt`, `uji-peringatan.txt`, `uji-peringatan-bukti.json`, `uji-telemetri.txt`, `uji-telemetri-bukti.json`, `uji-segarkan.txt`, `uji-segarkan-bukti.json`, `uji-cache-korpus.txt`, `uji-cache-korpus-tanpa-sidik.txt`, `uji-aksesibilitas.txt`, `uji-aksesibilitas-sebelum.txt`, `uji-bentuk-jawaban.txt`, `uji-bentuk-jawaban-tanpa-bentuk.txt`, `uji-regresi-fr18.txt` | semua hasil yang diklaim di dokumen `10` (termasuk A/B lapis semantik FR-12 dan kontrol negatif FR-23 yang sengaja gagal) |
| **Dua dasbor tinjauan** | `/admin/celah-pengetahuan`, `/admin/umpan-balik` | pertanyaan tak terlayani (FR-27) & laporan koreksi warga (FR-26); keduanya ber-`ADMIN_TOKEN` |
| **Spesifikasi kebutuhan** | `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` | daftar kebutuhan `FR/NFR/DS/EV/OPS/CMP` + kriteria terima |
| **Peta kerja tinggal-jalan** | `10` §11 (Fase B–D) | urutan pekerjaan berikutnya + perkiraan usaha |

## 2. Prasyarat

| Hal | Nilai yang diuji | Catatan |
|---|---|---|
| Node.js | 20.20.2 (dipakai saat pengujian) | Node 20 EOL 30 Apr 2026 — jadwalkan naik versi |
| Next.js | 16.2.10 | tidak ada perubahan dependensi di cabang ini |
| Uji | 37 berkas / **636 uji** | `npm test` |
| Variabel lingkungan baru | `REVALIDATE_ALLOW_UNSIGNED` (opsional) | **`REVALIDATE_SECRET` kini wajib** agar penyegaran cache tidak tertolak (fail-closed) |
| Variabel lingkungan baru (OPS-03, penjadwal) | `SAPA_BASE_URL`, `SAPA_SEGARKAN_TAG`, `SAPA_SEGARKAN_SUMBER`, `SAPA_SEGARKAN_ULANG` (opsional) | dipakai `scripts/segarkan-cache.mjs` dan `.github/workflows/segarkan-cache.yml` (harian 05:00 WIB). Tanpa `SAPA_URL`/`REVALIDATE_SECRET` di rahasia GitHub, workflow itu **dorman** (bukan gagal) |
| Variabel lingkungan baru (FR-27 & FR-26) | `ADMIN_TOKEN` | menjaga **dua** dasbor admin: `/api/admin/celah` dan `/api/admin/umpan-balik`. Tanpa ini keduanya menjawab **503 fail-closed** |
| Variabel lingkungan opsional | `SAPA_SPLP_BASE_URL` | mengarahkan pengambilan data ke SPLP lain/stub; dibaca **saat runtime**, jadi cukup diset di proses (lihat §7a) |
| Variabel lingkungan baru (FR-12) | `SAPA_SEMANTIK` (`hash`/`remote`/`off`), `SAPA_SEMANTIK_AMBANG`, `SAPA_SEMANTIK_AMBANG_KUAT`, `SAPA_SEMANTIK_SELISIH`, `SAPA_SEMANTIK_DIM` | lapis semantik menyala secara bawaan dengan penyedia `hash` (tanpa jaringan). `SAPA_SEMANTIK=off` untuk mematikan (pembanding A/B). Ambang bawaan 0,27 hasil kalibrasi korpus uji — setel bila korpus Anda berbeda |
| Variabel lingkungan baru (FR-12, penyedia jarak jauh) | `SAPA_EMBED_BASE_URL`, `SAPA_EMBED_MODEL`, `SAPA_EMBED_API_KEY`, `SAPA_EMBED_TIMEOUT_MS` | mengaktifkan embedding kelas e5 (OpenAI-compatible). Bila gagal, sistem otomatis kembali ke `hash` dan mencatat alasannya di `/api/status` — jawaban tidak pernah gagal karena ini |
| Variabel lingkungan baru (OPS-04, opsional) | `SAPA_ALERT_TELEGRAM_BOT_TOKEN` + `SAPA_ALERT_TELEGRAM_CHAT_ID`, `SAPA_ALERT_WEBHOOK_URL` (+ `SAPA_ALERT_WEBHOOK_TOKEN`), `SAPA_ALERT_PANEL_URL`, `SAPA_ALERT_ESKALASI_MENIT` (15), `SAPA_ALERT_JEDA_ULANG_MENIT` (60) | tanpa saluran, aplikasi tetap berjalan normal — `/api/admin/peringatan` melaporkan `siap:false` apa adanya. Telegram dipasang hanya bila token **dan** chat id terisi |
| Variabel lingkungan baru (OPS-04, rahasia penjadwal) | `SAPA_URL`, `ADMIN_TOKEN` (rahasia GitHub Actions) | dipakai `.github/workflows/peringatan.yml` (tiap 10 menit). Bila tidak diisi, workflow itu **dorman** (bukan gagal) |
| Variabel lingkungan baru (NFR-07, opsional) | `SAPA_TELEMETRI` (`off` mematikan), `SAPA_TELEMETRI_JENDELA` (200), `SAPA_TELEMETRI_REKAP_N` (20), `SAPA_TELEMETRI_SIMPAN` | telemetri menyala secara bawaan; mematikannya tidak mengubah jawaban, hanya menghilangkan baris log `[gen_ai]` dan agregat |
| Penyimpanan | memori proses (tanpa Redis) atau Upstash | tanpa Redis, sirkuit & saklar hidup per-instance (tetap benar, hanya perlu belajar sekali) |

## 3. Tiga cara menerapkan

**Cara A — ambil cabangnya (paling utuh, disarankan bila agen Anda bekerja di cabang lain):**

```bash
git fetch origin usulan/perbaikan-ai-2026-09-21     # atau impor bundel/zip bila offline
git switch -c kerja/ai-tingkat-lanjut origin/usulan/perbaikan-ai-2026-09-21
```

**Cara B — seri patch (paling terkendali; satu komit = satu alasan):**

```bash
git switch -c kerja/ai-tingkat-lanjut main
git am 06-USULAN-KODE/seri-patch/0001-*.patch
# … ulangi untuk SEMUA berkas NNNN-*.patch, urut angka — atau sekaligus:
git am 06-USULAN-KODE/seri-patch/[0-9][0-9][0-9][0-9]-*.patch
```

**Cara C — paket tunggal (paling cepat, riwayat menjadi satu komit):**

```bash
# Dari `main` — memuat SELURUH riwayat cabang (40 komit):
git switch -c kerja/ai-tingkat-lanjut main
git am 06-USULAN-KODE/seri-patch/00-semua.patch

# ATAU dari repo yang sudah memuat `origin/dev` (`86af3b5`) — hanya komit lanjutan:
git switch -c kerja/ai-tingkat-lanjut dev
git am 06-USULAN-KODE/seri-patch/00-lanjutan-dev.patch
```

> **Penting — pilih bundel sesuai basis Anda.** `00-semua.patch` berbasis `main`; menjalankannya di
> atas `dev` akan berbenturan. `00-lanjutan-dev.patch` berbasis `origin/dev` (`86af3b5`); menjalankannya
> di atas `main` juga akan berbenturan. Kalau ragu, pakai **Cara B** (berkas `NNNN-*.patch` urut angka)
> dan berhenti pada berkas yang komit basisnya belum ada di repo Anda.

Setelah salah satu cara: `npm ci` (walaupun dependensi tidak berubah, ini memastikan `node_modules`
selaras) lalu jalankan uji terima (§7).

> **Terbukti pada 22 Sep 2026:** ketiga cara diuji pada klon bersih `main`. Cara B (`git am` seluruh seri)
> dan Cara C (`git apply --3way 00-semua.patch`) sama-sama berhasil; hasil pohon **identik dengan cabang**
> (kecuali folder `seri-patch/` yang memang hanya wadah patch), `npm run typecheck` bersih, dan **494 uji lulus**
> di pohon hasil patch.
>
> **Diperbarui 24 Sep 2026:** verifikasi diulang dari basis **GitHub**: `origin/dev` + `0038` + `0039` → pohon identik dengan cabang kerja (`584` uji lulus), dan `00-lanjutan-dev.patch` (3 komit: `0038`+`0039`+`0040`) diverifikasi ulang pada klon bersih (`590` uji lulus). `00-semua.patch` sekarang 40 komit di atas `main`.

> **Diperbarui lagi 24 Sep 2026 (FR-18):** `00-semua.patch` = **43 komit** di atas `main`; `00-lanjutan-dev.patch` = **5 komit** (`0038`–`0042`, basis `origin/dev` `86af3b5`); uji unit menjadi **636 lulus**. Bukti FR-18: `verifikasi/uji-bentuk-jawaban.txt` (122 pemeriksaan, 6/6 niat ≥ 3 item), kontrol negatif `verifikasi/uji-bentuk-jawaban-tanpa-bentuk.txt` (exit 1, 61 pelanggaran), dan uji regresi A/B `verifikasi/uji-regresi-fr18.txt` (12/12 balasan lama identik).

> **Catatan tentang bit eksekusi:** komit `0003`/`0004` hanya memulihkan bit eksekusi
> `.githooks/pre-commit` & `scripts/pii-gate.sh` yang hilang saat pemindahan berkas. Bila Anda
> memakai Cara C dan hook tidak dipakai, dua komit itu boleh dilewati.

## 4. Titik yang perlu perhatian saat menerapkan

| Berkas | Mengapa berpotensi bertabrakan | Saran |
|---|---|---|
| `src/lib/sapa-client.ts` | pusat retrieval — paling banyak disentuh gelombang ini (entitas, satuan, sinonim, granularitas) | terapkan **setelah** patch lain; jalankan `retrieval.test.ts` segera |
| `src/services/grounding.ts` | pagar mutu; `groundOutput()` **dihapus** | bila agen Anda masih memanggil `groundOutput`, alihkan ke `dasar.response` (jawaban deterministik lengkap) |
| `src/services/answer-compose.ts` | orkestrasi AI + gerbang nilai-tambah + penjaga permintaan sistem | jangan sisipkan logika sebelum tahap 9 (gerbang) tanpa membaca komentarnya |
| `data/eval-set.json` | naik dari 78 → **90 item** (`versi: 2`) | bila agen Anda menambah item, tambahkan **setelah** item `F1–F4, N1–N4, W1, S1–S3` |
| `data/eval-baseline.json` | baseline kini **90/90, setVersi 2** | jangan timpa dengan baseline lama; bila perlu, `node scripts/eval-run.mjs --baseline` |
| `scripts/eval-run.mjs` | pemindaian invarians memakai teks tanpa kutipan pertanyaan | perubahan ini **wajib** agar item `S1`/`S3` adil |

## 5. Batas kepemilikan berkas (agar tidak bertabrakan dengan agen lain)

| Wilayah | Pemilik yang disarankan | Aturan |
|---|---|---|
| `src/lib/sapa-client.ts`, `src/services/*` | pekerjaan AI/retrieval (cabang ini) | ubah satu per satu, selalu jalankan eval 90 sebelum menutup pekerjaan |
| `src/app/dashboard/**`, `src/components/**` | pekerjaan tampilan | **tidak disentuh** cabang ini; perubahan UI baru aman dari konflik |
| `data/eval-set.json`, `scripts/eval-run.mjs` | mutu/evaluasi | menambah item = menaikkan bar; **jangan** melonggarkan invarians |
| `README.md`, `docs/**`, `AGENTS.md` | dokumentasi repo | cabang ini tidak mengubah isinya (hanya satu berkas berubah **mode**, bukan isi) |
| `src/lib/penyegar-cache.ts`, `src/app/api/admin/segarkan/route.ts`, `scripts/segarkan-cache.mjs`, `scripts/uji-segarkan.mjs`, `.github/workflows/segarkan-cache.yml` | penyegaran cache (OPS-03) | kebijakan harian (jam jadwal, ambang basi, batas laju) terpusat di modul ini — ubah bersama `21-LAPORAN-OPS-03.md`; `JAM_JADWAL_UTC` harus sama dengan cron di workflow |
| `src/lib/ai/telemetri.ts`, `src/app/api/admin/telemetri/route.ts`, `scripts/uji-telemetri.mjs` | observabilitas (NFR-07) | wilayah baru; kontrak perilakunya (satu baris per permintaan, nama medan `gen_ai.*`, tanpa isi pertanyaan) dijaga uji unit 19 butir — ubah bersama `20-LAPORAN-NFR-07.md` |
| `src/lib/ai/notifikasi.ts`, `src/app/api/admin/peringatan/route.ts`, `scripts/uji-peringatan.mjs`, `.github/workflows/peringatan.yml` | operasi/notifikasi (OPS-04) | wilayah baru; ubah hanya bersama-sama dengan `19-LAPORAN-OPS-04.md` karena kontrak perilakunya (episode, antispam, penyaringan rahasia) dijaga uji unit 20 butir |
| `src/app/globals.css` (aturan `.target-min`/`:focus-visible`/`--text-on-dark-muted`), `src/app/dashboard/layout.tsx`, `src/components/{Sidebar,QueryBar,ExecutiveAnswerRenderer}.tsx`, `src/app/dashboard/DashboardClient.tsx`, `verifikasi/aksesibilitas.mjs`, `scripts/uji-aksesibilitas.mjs` | aksesibilitas (NFR-09) | janji WCAG 2.2 AA hidup di TIGA aturan CSS + satu wilayah live + satu tautan lompati; menghapusnya membuat harness GAGAL (sabotase). Ubah bersama `24-LAPORAN-NFR-09.md` |
| `src/services/answer-compose.ts` (kunci `ai:v2:<hash>:<sidik>`), `src/lib/sapa-client.ts` (`sidikKorpus` + memo, `lupakanKorpus`), `src/lib/penyegar-cache.ts`, `scripts/uji-cache-korpus.mjs` | kesegaran cache korpus (DS-03) | kunci cache jawaban **wajib** memuat sidik isi korpus, bukan jumlah record — mengubahnya kembali ke `records.length` membuat jawaban korpus lama disajikan; `lupakanKorpus()` hanya pada penyegaran nyata (uji kering tidak boleh mengubah apa pun). Ubah bersama `23-LAPORAN-DS-03.md` |
| `src/services/bentuk-jawaban.ts`, `src/services/answer-compose.ts` (blok niat), `src/app/api/query/{route,stream/route}.ts` (`niat`/`bentuk`/`urutanBukti`/`porsi`), `src/services/executive-presentation.ts`, `src/components/ExecutiveAnswerRenderer.tsx` (badge bentuk, kolom porsi), `scripts/uji-bentuk-jawaban.mjs`, `verifikasi/korpus-bentuk.json` | bentuk jawaban per niat (FR-18) | kontrak bentuk per niat hidup di `KONTRAK_BENTUK`; **jangan** menyusun ulang baris di tempat lain — semua jalur lewat `terapkanBentuk`. Menghapus catatan kejujuran atau memotong baris tanpa pemberitahuan = cacat yang harus ditolak. Ubah bersama `25-LAPORAN-FR-18.md` |
| `vercel.json`, `package.json`, `middleware.ts` | rilis/keamanan | **tidak disentuh**; perubahan di sini butuh persetujuan pemilik |

## 6. Daftar centang serah terima

- [ ] `git status` bersih pada cabang kerja; `main` belum tersentuh.
- [ ] `npm ci` selesai; `npm test` → **636 uji lulus** (≥ 550).
- [ ] `bash verifikasi/uji-terima.sh` → **LULUS** (statis + pagar). Bagian §6f (notifikasi sirkuit) butuh server uji khusus — lihat `19 §2`; tanpa itu ia dilaporkan **dilewati**, bukan gagal. Bagian §6g (telemetri) dan §6h (penyegaran cache) **menjalankan servernya sendiri** — cukup `node scripts/uji-telemetri.mjs` / `node scripts/uji-segarkan.mjs`; lewati dengan `SAPA_SKIP_TELEMETRI=1` / `SAPA_SKIP_SEGARKAN=1`. §6h sengaja menjalankan **dua** aplikasi (satu tanpa rahasia) karena hanya itu yang membuktikan fail-closed.
- [ ] `SAPA_A11Y_URL=http://127.0.0.1:3131 node scripts/uji-aksesibilitas.mjs` → **LULUS** (butuh aplikasi hidup; memeriksa HTML + CSS nyata dan menanam 12 cacat untuk membuktikan dirinya tidak vakum).
- [ ] `node scripts/uji-bentuk-jawaban.mjs` → **LULUS** (menyalakan stub SPLP + aplikasi sendiri; 18 pertanyaan = 3 per niat). Kontrol negatifnya: `SAPA_BENTUK_NIAT=off node scripts/uji-bentuk-jawaban.mjs` → wajib **GAGAL** dengan ≥ 60 pelanggaran.
- [ ] `node scripts/uji-cache-korpus.mjs` → **LULUS** (menyalakan stub SPLP sendiri, ± 2 detik; butuh aplikasi + penyedia tiruan hidup). Kontrol negatifnya: kembalikan kunci cache ke `ai:v1:...:${opts.records.length}`, `npm run build`, jalankan ulang → wajib **GAGAL**.
- [ ] Eval dua mode → **90/90** masing-masing, invarians 0, hasil tersimpan di `verifikasi/`.
- [ ] A/B AI vs deterministik → sitasi AI **≥** deterministik.
- [ ] `REVALIDATE_SECRET` disiapkan pada lingkungan non-lokal (Vercel/preview).
- [ ] Rencana mundur diketahui (revert komit / promosi ulang deployment).
- [ ] Satu orang ditunjuk sebagai **pemilik risiko** (ISO 42001) untuk laporan mingguan.

## 7. Menguji di lokal (tanpa biaya, tanpa langganan)

> Sejak 22 Sep 2026, `uji-terima.sh` memeriksa tiga butir murah yang sudah selesai: **FR-25** (waktu
> tarik, sidik korpus, tahun data, konsistensi jalur JSON↔streaming, kesamaan versi korpus antar-mode),
> **FR-27** (endpoint celah fail-closed + pagar privasi), **FR-26** (notis transparansi benar-benar
> tampil pada HTML dasbor, kanal koreksi menerima laporan sah, menolak jenis liar, dan menyimpan tanpa
> digit), **FR-19** (0 klaim tanpa rujukan; uji 50 sampel dijalankan penuh dengan `SAPA_SITASI_PENUH=1`), **FR-20**
> (setiap balasan punya blok `diagnosa` bertag `lapis:rincian`; prosa sebab bebas angka; jalur JSON = streaming;
> harness penanda penuh dengan `SAPA_SEBAB_PENUH=1`), **FR-24** (balasan memuat `pemeriksaan`; jawaban yang
> disajikan bebas temuan keras; narasi model penukar entitas ditolak gerbang — set `SAPA_TUKAR_URL` ke
> server ber-`AI_MODEL=mock-tukar` dan `SAPA_PASANGAN_PENUH=1` untuk menjalankan uji 50 sampel), dan **FR-23**
> (balasan mode AI memuat `ai.pembersihan`; korpus bersih tidak disentuh sama sekali; korpus beracun lolos
> dan baris sumbernya ditandai `ai.penandaData`; serta model yang menuruti perintah data tidak lagi bisa
> menuruti — set `SAPA_BERACUN_URL` ke server ber-`AI_MODEL=mock-patuh` + korpus beracun, dan
> `SAPA_BERACUN_JURU_URL` ke server ber-model biasa + korpus beracun).
>
> **Keharusan bukti (24 Sep 2026).** Kedua jalur beracun di atas kini memakai
> `SAPA_WAJIB_PROMPT=1` (tangkapan prompt **wajib ada**) dan harnessnya sendiri menolak:
> log penyedia tiruan yang tidak ada/kosong, dan **balasan dari cache aplikasi**. Alasannya
> ditemukan saat pemeriksaan klien: dengan berkas log atau tangkapan prompt yang hilang,
> harness dulu keluar **0 (LULUS)** sambil mencetak "mode model patuh diperiksa: ya" —
> lulus tanpa memeriksa apa pun. Karena itu **jalankan jalur ini terhadap aplikasi yang
> baru dinyalakan** (cache jawaban disimpan di memori; kueri yang sama dalam ±1 jam akan
> dijawab dari cache sehingga model tidak dipanggil). Bukti kontrolnya:
> `verifikasi/uji-bersih-data-tanpa-bukti.txt`, `uji-bersih-data-cache-hampa.txt`,
> `uji-bersih-data-tanpa-prompt.txt` (ketiganya sengaja GAGAL).
> Untuk memeriksa isi kedua daftar, sertakan `ADMIN_TOKEN` — tanpa itu pemeriksaan itu
> dilewati, bukan gagal.

```bash
# 1) Penyedia model tiruan (menjawab gaya model nyata, mencatat tiap panggilan)
node verifikasi/mock-llm.mjs 8899 &

# 2) Aplikasi — mode AI (memakai penyedia tiruan)
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:8899/v1 \
  AI_API_KEY=mock-uji AI_MODEL=mock-pintar npx next start -p 3116 &

# 3) Aplikasi — mode deterministik (pembanding)
AI_ENABLED=false npx next start -p 3117 &

# 4) Uji terima lengkap (dua mode, ambang dari dokumen 10)
AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh

# 5) Pada repo lokal, `next start` memakai hasil build: jalankan `npm run build` lebih dahulu
```

Hasil yang diharapkan pada cabang ini (terukur 22 Sep 2026): eval **90/90** dua mode ·
grounded pass **100%** · fallback **0%** · invarians **0** · uji unit **590** ·
A/B sitasi **4,50 vs 3,00** · pertanyaan ber-bukti saat penyedia mati **0,14–0,56 dtk**.

## 7a. Menguji tanpa internet (stub SPLP) — berguna untuk agen lokal & CI

Aplikasi menarik data dari `api-splp.layanan.go.id`. Bila jaringan sandbox/CI tidak boleh keluar,
seluruh pengujian (termasuk evaluasi 90 item dan uji terima) menjadi buntu. Solusinya dua berkas:

```bash
# 1. penyedia SPLP tiruan — balasannya berformat sama dengan SPLP asli
node verifikasi/stub-splp.mjs 9911                      # korpus bawaan 10 record
node verifikasi/stub-splp.mjs 9911 /path/korpus.json    # atau korpus Anda sendiri

# 2. arahkan aplikasi ke stub itu (dibaca saat runtime, tidak perlu build ulang)
SAPA_SPLP_BASE_URL=http://127.0.0.1:9911/sapa/1.0/api npm run dev
# lalu, di terminal lain:
AI_URL=http://127.0.0.1:3000 ADMIN_TOKEN=rahasia-uji bash verifikasi/uji-terima.sh
```

> **Jebakan yang sudah ditemui (jangan diulang):** bila alamat SPLP dibaca lewat `process.env.X` biasa,
> bundler Next **menanam nilainya saat BUILD** sehingga variabel yang diset saat `next start` diabaikan —
> aplikasi tetap menghubungi SPLP produksi dan gagal di jaringan tertutup. Karena itu `sapa-client.ts`
> memakai akses `process.env['SAPA_SPLP_BASE_URL']` (dinamis) dan membacanya per panggilan.
> **Catatan evaluasi:** evaluasi 90 item hanya bermakna bila korpus stubnya lengkap; angka 90/90 yang
> tercatat di `verifikasi/eval90-*.txt` dihasilkan dari data SPLP sungguhan.

## 8. Memvalidasi dengan model sungguhan (setelah langganan aktif)

```bash
AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=<penyedia asli> AI_API_KEY=<kunci> \
  AI_MODEL=<model> npx next start -p 3116 &
SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/eval-run.mjs          # bandingkan dengan 90/90
python3 verifikasi/banding-ai-vs-det.py verifikasi/uji-pertanyaan.txt   # A/B vs deterministik
curl -s http://127.0.0.1:3116/api/status | python3 -m json.tool          # cek reachable & health
```

Yang dinilai: (a) apakah set 90 tetap lulus, (b) apakah sitasi AI masih ≥ deterministik,
(c) apakah `ai.nilaiTambah` didominasi `dipakai` (bukan `ditolak-*`). Bila (c) buruk, prompt
perlu disetel — **bukan** gerbangnya dilonggarkan.

## 9. Cara mundur (rollback)

| Keadaan | Tindakan | Waktu |
|---|---|---|
| Baru di cabang kerja | `git switch main` (cabang kerja ditinggalkan) | detik |
| Sudah digabung ke cabang kerja | `git revert <komit>` atau `git reset --hard <komit sebelum>` | detik |
| Sudah naik produksi | Vercel → Deployments → promosikan deployment sebelumnya | < 5 menit |
| Butuh membalik satu gelombang saja | revert komit gelombang tersebut (pesan komit memuat daftar berkas) | menit |

## 10. Setelan lingkungan di Vercel setelah penggabungan

| Variabel | Nilai | Wajib? |
|---|---|---|
| `REVALIDATE_SECRET` | rahasia acak panjang | **wajib** (atau penyegaran cache akan ditolak — fail-closed) |
| `REVALIDATE_ALLOW_UNSIGNED` | `true` hanya bila benar-benar ingin endpoint terbuka | opsional (tidak disarankan) |
| `AI_ENABLED`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | tidak berubah dari setelan sekarang | — |
| `AI_CIRCUIT_FAIL_THRESHOLD` | bawaan 3 (kegagalan berturut) | opsional |
| `AI_DAILY_CALL_LIMIT` | tetap seperti sekarang | — |

## 11. Instruksi siap-tempel untuk agen di repo lokal

> **Tugas:** menerapkan versi "AI tingkat lanjut" pada repo ini tanpa menyentuh `main`.
> Sumber: cabang/seri patch dari Arena (`06-USULAN-KODE/seri-patch/`, seluruh berkas `NNNN-*.patch`, urut angka).
> Langkah:
> 1. `git switch -c kerja/ai-tingkat-lanjut main`
> 2. `git am 06-USULAN-KODE/seri-patch/[0-9][0-9][0-9][0-9]-*.patch`
> 3. `npm ci && npm test` → wajib **636 uji lulus**; `npm run typecheck` → bersih.
> 4. `bash verifikasi/uji-terima.sh` → wajib **LULUS**.
> 5. Jalankan eval dua mode (lihat `11 §7`) → wajib **90/90** masing-masing, **0 regresi**.
> 6. Bila ada konflik, jangan menimpa; laporkan berkas konflik beserta keputusan yang diambil.
> 7. **Jangan** mengubah `data/eval-baseline.json` kecuali setelah eval 90/90 terbukti;
>    **jangan** melonggarkan invarians di `scripts/eval-run.mjs`; **jangan** menghapus pagar
>    grounding/penjaga permintaan sistem (`INV-01`…`INV-07` pada dokumen `10`).
> 8. Laporkan: daftar komit, keluaran `uji-terima.sh`, angka eval, dan berkas yang sempat konflik.

**Kalimat kunci untuk agen:** *"Kebenaran angka tidak bisa dinegosiasikan; kehalusan bahasa bisa."*
Bila ragu antara menambah fitur dan menjaga pagar, **pagar yang menang**.
