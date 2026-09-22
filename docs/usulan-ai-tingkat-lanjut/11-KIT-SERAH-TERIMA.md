# 11 — Kit Serah Terima (repo lokal · hermes agent · localhost)

Dokumen ini menjawab: **"bagaimana cara memindahkan dan menguji hasil kerja ini di repo lokal saya
yang sedang dikerjakan agen lain, tanpa mengganggu `main`?"**

Semua perintah di bawah dijalankan **dari dalam klon repo lokal Anda**. Tidak ada langkah yang
menyentuh `main` sampai Anda sendiri memutuskan.

---

## 1. Apa yang diserahkan

| Aset | Letak | Isi |
|---|---|---|
| **Cabang utuh** | `usulan/perbaikan-ai-2026-09-21` @ `e7258ca` (komit kode FR-12 terakhir) | 0 divergensi dari `main` (fast-forward); seri patch memuat seluruh komit kode & dokumen, sedangkan folder `seri-patch/` sendiri sengaja tidak ikut dipatch (isinya memang wadah patch) |
| **Seri patch** | `06-USULAN-KODE/seri-patch/` | `0001`…`0018` (urutan wajib; komit dokumen: `0008`, `0010`, `0012`, `0015`, `0017`) + `00-semua.patch` (paket tunggal). Komit terakhir (pembawa patch) tidak diekspor karena isinya **hanya** berkas di folder ini — sehingga hasil `git am 0001`…`0018` sama persis dengan ujung cabang |
| **Skrip uji terima** | `06-USULAN-KODE/uji-terima.sh` | memutuskan LULUS/GAGAL sesuai ambang dokumen `10` |
| **Alat pengukuran** | `verifikasi/mock-llm.mjs`, `verifikasi/stub-splp.mjs`, `verifikasi/banding-ai-vs-det.py`, `verifikasi/banding-main-vs-branch.py`, `scripts/uji-sitasi.mjs`, `scripts/uji-parafrase.mjs`, `scripts/buat-korpus-uji.mjs` | penyedia model & SPLP tiruan + harness pembanding + uji 50 sampel sitasi (FR-19) + uji parafrase EV-05 (FR-12) & pembangkit korpus uji 1.210 record |
| **Bukti angka** | `verifikasi/eval90-*.txt`, `banding-G.txt`, `aman-cabang-perilaku.txt`, `uji-terima-hasil.txt`, `eval-parafrase-baseline.txt`, `eval-parafrase-hash.txt` | semua hasil yang diklaim di dokumen `10` (termasuk A/B lapis semantik FR-12) |
| **Dua dasbor tinjauan** | `/admin/celah-pengetahuan`, `/admin/umpan-balik` | pertanyaan tak terlayani (FR-27) & laporan koreksi warga (FR-26); keduanya ber-`ADMIN_TOKEN` |
| **Spesifikasi kebutuhan** | `10-KEBUTUHAN-UPGRADE-TINGKAT-LANJUT.md` | daftar kebutuhan `FR/NFR/DS/EV/OPS/CMP` + kriteria terima |
| **Peta kerja tinggal-jalan** | `10` §11 (Fase B–D) | urutan pekerjaan berikutnya + perkiraan usaha |

## 2. Prasyarat

| Hal | Nilai yang diuji | Catatan |
|---|---|---|
| Node.js | 20.20.2 (dipakai saat pengujian) | Node 20 EOL 30 Apr 2026 — jadwalkan naik versi |
| Next.js | 16.2.10 | tidak ada perubahan dependensi di cabang ini |
| Uji | 29 berkas / **379 uji** | `npm test` |
| Variabel lingkungan baru | `REVALIDATE_ALLOW_UNSIGNED` (opsional) | **`REVALIDATE_SECRET` kini wajib** agar penyegaran cache tidak tertolak (fail-closed) |
| Variabel lingkungan baru (FR-27 & FR-26) | `ADMIN_TOKEN` | menjaga **dua** dasbor admin: `/api/admin/celah` dan `/api/admin/umpan-balik`. Tanpa ini keduanya menjawab **503 fail-closed** |
| Variabel lingkungan opsional | `SAPA_SPLP_BASE_URL` | mengarahkan pengambilan data ke SPLP lain/stub; dibaca **saat runtime**, jadi cukup diset di proses (lihat §7a) |
| Variabel lingkungan baru (FR-12) | `SAPA_SEMANTIK` (`hash`/`remote`/`off`), `SAPA_SEMANTIK_AMBANG`, `SAPA_SEMANTIK_AMBANG_KUAT`, `SAPA_SEMANTIK_SELISIH`, `SAPA_SEMANTIK_DIM` | lapis semantik menyala secara bawaan dengan penyedia `hash` (tanpa jaringan). `SAPA_SEMANTIK=off` untuk mematikan (pembanding A/B). Ambang bawaan 0,27 hasil kalibrasi korpus uji — setel bila korpus Anda berbeda |
| Variabel lingkungan baru (FR-12, penyedia jarak jauh) | `SAPA_EMBED_BASE_URL`, `SAPA_EMBED_MODEL`, `SAPA_EMBED_API_KEY`, `SAPA_EMBED_TIMEOUT_MS` | mengaktifkan embedding kelas e5 (OpenAI-compatible). Bila gagal, sistem otomatis kembali ke `hash` dan mencatat alasannya di `/api/status` — jawaban tidak pernah gagal karena ini |
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
# … ulangi 0002 … 0015 (urutan wajib) — atau sekaligus:
git am 06-USULAN-KODE/seri-patch/[0-9][0-9][0-9][0-9]-*.patch
```

**Cara C — paket tunggal (paling cepat, riwayat menjadi satu komit):**

```bash
git switch -c kerja/ai-tingkat-lanjut main
git apply --3way 06-USULAN-KODE/seri-patch/00-semua.patch
git add -A && git commit -m "AI tingkat lanjut: gelombang 1-3 (set 90 item)"
```

Setelah salah satu cara: `npm ci` (walaupun dependensi tidak berubah, ini memastikan `node_modules`
selaras) lalu jalankan uji terima (§7).

> **Terbukti pada 22 Sep 2026:** ketiga cara diuji pada klon bersih `main`. Cara B (`git am` seluruh seri)
> dan Cara C (`git apply --3way 00-semua.patch`) sama-sama berhasil; hasil pohon **identik dengan cabang**
> (kecuali folder `seri-patch/` yang memang hanya wadah patch), `npm run typecheck` bersih, dan **343 uji lulus**
> di pohon hasil patch. Cara C menyisakan perubahan tanpa komit — jalankan `git add -A && git commit` sesudahnya.

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
| `vercel.json`, `package.json`, `middleware.ts` | rilis/keamanan | **tidak disentuh**; perubahan di sini butuh persetujuan pemilik |

## 6. Daftar centang serah terima

- [ ] `git status` bersih pada cabang kerja; `main` belum tersentuh.
- [ ] `npm ci` selesai; `npm test` → **237 uji lulus** (≥ 230).
- [ ] `bash verifikasi/uji-terima.sh` → **LULUS** (statis + pagar).
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
> digit), dan **FR-19** (0 klaim tanpa rujukan; uji 50 sampel dijalankan penuh dengan `SAPA_SITASI_PENUH=1`). Untuk memeriksa isi kedua daftar, sertakan `ADMIN_TOKEN` — tanpa itu pemeriksaan itu
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
grounded pass **100%** · fallback **0%** · invarians **0** · uji unit **237** ·
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
> Sumber: cabang/seri patch dari Arena (`06-USULAN-KODE/seri-patch/`, 15 patch, urut).
> Langkah:
> 1. `git switch -c kerja/ai-tingkat-lanjut main`
> 2. `git am 06-USULAN-KODE/seri-patch/[0-9][0-9][0-9][0-9]-*.patch`
> 3. `npm ci && npm test` → wajib **343 uji lulus**; `npm run typecheck` → bersih.
> 4. `bash verifikasi/uji-terima.sh` → wajib **LULUS**.
> 5. Jalankan eval dua mode (lihat `11 §7`) → wajib **90/90** masing-masing, **0 regresi**.
> 6. Bila ada konflik, jangan menimpa; laporkan berkas konflik beserta keputusan yang diambil.
> 7. **Jangan** mengubah `data/eval-baseline.json` kecuali setelah eval 90/90 terbukti;
>    **jangan** melonggarkan invarians di `scripts/eval-run.mjs`; **jangan** menghapus pagar
>    grounding/penjaga permintaan sistem (`INV-01`…`INV-07` pada dokumen `10`).
> 8. Laporkan: daftar komit, keluaran `uji-terima.sh`, angka eval, dan berkas yang sempat konflik.

**Kalimat kunci untuk agen:** *"Kebenaran angka tidak bisa dinegosiasikan; kehalusan bahasa bisa."*
Bila ragu antara menambah fitur dan menjaga pagar, **pagar yang menang**.
