# 22 — Laporan Koreksi Pasca-`dev`: Penyelarasan, Reproduksi, dan Perbaikan 8 Kegagalan

**Tanggal:** 23 September 2026 · **Cabang:** `dev` (lokal) — `main` **tidak disentuh** (`ff00eb8`)
**Pemicu:** agen di sisi klien (hermes) selesai menerapkan seri 37 patch pada cabang `dev` klien
dan melaporkan hasilnya: **88/90 (mode AI)** dan **82/90 (deterministik)** dengan 5 celah yang
dianggap berakar pada data/lingkungan. Laporan ini memeriksa klaim itu, mereproduksinya, mencari
akar masalahnya, dan menutupnya.

**Status akhir sesi ini:** uji **584/584 lulus** · `typecheck` OK · `build` OK ·
eval deterministik produksi **90/90** · eval AI produksi **90/90** · EV-23 lulus dengan
kontrol negatif yang ikut gagal · patch **`0038`** diekspor.

---

## 1. Penyelarasan dengan cabang `dev` klien

| Hal | Kenyataan |
|---|---|
| `dev` di remote publik | Saat pemeriksaan pertama: **belum ada** — `git ls-remote` hanya memuat `main` (`ff00eb8`) dan `feat/perf-rsc-cache` (`af93476`) karena hermes baru meng-commit secara lokal. **Setelah pemilik repo mem-push**, `origin/dev` = `86af3b5` (**38 komit** di atas `main`) dan seluruh isinya diperiksa ulang pada laporan ini (§3.2 + §4 "H.2b" pada `07-BUKTI-VERIFIKASI.md`). |
| Cara menyelaraskan ruang kerja ini | Dua langkah: (a) sebelum push — `git checkout -b dev main` → `git am` 37 patch → perbaikan hermes diterapkan ulang; (b) setelah push — cabang kerja di-`reset --hard origin/dev`, lalu patch `0038` & `0039` diterapkan di atasnya. Hasil akhir: **40 komit di atas `main`** (38 milik seri terpasang + 2 patch Arena). |
| Bukti kesetaraan | `git diff` antara `dev` hasil rekonstruksi dan cabang `usulan/perbaikan-ai-2026-09-21` (tanpa folder `seri-patch/`) **hanya** berbeda pada dua berkas: `.gitignore` dan `verifikasi/mock-llm.mjs` — tepat perbaikan hermes, tidak ada perbedaan lain. |
| Klaim hermes soal jumlah komit | Dikonfirmasi: **38 komit di atas `main`** (SHA lokal `86c7ea2` vs klaim `86af3b5`; SHA berbeda karena commit ditulis ulang, isi pohon sama). |
| `main` | Utuh: `main` = `origin/main` = `ff00eb8`, 0 perbedaan. Tidak ada deploy ke produksi. |

**Konsekuensi penting:** karena hermes memverifikasi terhadap **data produksi SPLP (2.065 record)**
dan ruang uji ini sebelumnya memakai korpus tiruan 1.216 record, semua verifikasi dalam laporan ini
dijalankan terhadap **korpus produksi** (`verifikasi/korpus-produksi.json`, diambil 23 Sep 2026).

## 2. Reproduksi: klaim hermes benar, dan celahnya nyata

| Pemeriksaan | Klaim hermes | Hasil di sini |
|---|---|---|
| `vitest` | 35 berkas / 566 uji lulus | **35 / 566 lulus** ✅ |
| `typecheck` | OK | `[typecheck] OK` ✅ |
| `build` | OK | keluar 0 ✅ |
| Eval deterministik produksi | 82/90 | **82/90, keluar 1** ✅ — kegagalannya **identik**: Q06, T2, T5, D1, U4, U5, U6, F3 |
| Eval AI produksi | 88/90 | tidak dapat direproduksi apa adanya (model `mock-pintar` di sini memberi **90/90**); lihat §5 |

Jadi bukan salah paham data: dengan korpus produksi, jalur deterministik memang gagal 8 kali.

### 2.1 Akar masalahnya (diukur, bukan diduga)

| Kelompok | Kasus | Akar masalah terukur |
|---|---|---|
| **A. Angka struktural dibaca sebagai klaim** (5 dari 8) | Q06, T5, D1, U4, T2 | Pengambil klaim pada `pemeriksa-entitas` menganggap angka pada kalimat **struktural** sebagai klaim data: pola `"… dari 8 OPD (Dinas A, Dinas B, …)"` dan `"kelas 7"` yang berada **di dalam nama indikator**. Angka itu lalu dituntut ada di bukti, padahal ia bukan klaim. |
| **B. Kemiripan makna tanpa jangkar topik** (2 dari 8) | U5, U6 | Pertanyaan yang **tidak punya data di katalog** tetap dijawab lewat jalur semantik karena skor kemiripan tinggi dari kata generik: U6 skor **0,487** — kata `"bulan"` cocok dengan `"6 bulan"`/`"Bulanan"`, sementara `"inflasi"` tidak ada di katalog. Ambang makna 0,27 jauh di bawah itu. |
| **C. Penggabungan bukti pada niat "sebab"** (1 dari 8) | U5 | Pertanyaan sebab dijawab dengan bukti bertopik apa pun yang lolos ambang → jawaban tampak menjawab, padahal katalog SAPA menyimpan capaian, bukan sebab. |

### 2.2 Perbaikan yang ditulis (semuanya di `dev`, patch `0038`)

| # | Berkas | Perbaikan | Uji |
|---|---|---|---|
| 1 | `src/services/pemeriksa-entitas.ts` | `angkaBukanKlaim(kalimat, bukti)`: angka katalog (`"N OPD"`, `"N indikator"`, `"N record"`) dan angka **di dalam tanda kutip nama indikator** tidak dihitung sebagai klaim. Nama OPD **sengaja tetap** dihitung (itu justru penuduhan palsu yang ingin dicegah). | 37 lulus |
| 2 | `src/services/semantik.ts` | `KATA_GENERIK_JANGKAR` + `tokenIsi` + `punyaJangkarIsi` + `labelRecord`: kandidat jalur makna hanya lolos bila ada **jangkar isi** (kata topik pertanyaan yang benar-benar ada di record), kecuali skor ≥ `AMBANG_KUAT` 0,55. Ambang makna **tidak** diturunkan. | 38 lulus |
| 3 | `src/services/sebab-kegagalan.ts` | Sebab baru `retrieval:makna-tanpa-jangkar` (diperiksa **sebelum** `makna-lemah`): skor tinggi tanpa jangkar bukan "makna lemah" — menurunkannya ke "makna lemah" menyesatkan operator. | 35 lulus |
| 4 | `src/services/deterministic-answer.ts` | Niat **sebab**: bukti disaring dengan `punyaJangkarIsi`, dibatasi ≤3, dan **peringatan jujur wajib** ditambahkan (`daftarPeringatan` + awalan narasi) yang tetap bertahan walau AI aktif (`catatanWajib`). | 25 lulus |

Bukti: 5 berkas uji terkait = **180 uji lulus**; seluruh suite **584/584**.

## 3. FR-23: kalibrasi dari data produksi (koreksi terhadap ukuran sebelumnya)

Pengukuran ulang pada korpus produksi **2.065 record / 9.530 sel** menemukan dua cacat yang tidak
terlihat pada korpus tiruan 1.216 record:

| Cacat | Sebelum | Sesudah (dikalibrasi) |
|---|---|---|
| `BATAS_SEL.satuan = 28` **memotong satuan nyata** | `Bimbingan Teknis/JP (Jam Pelajaran)` (35) dan `Kepala Keluarga (SP.1,SP.2,SP.3)` (35) terpotong → model menerima satuan cacat | `satuan = 64` |
| `BATAS_SEL.indikator = 180` **memotong nama indikator** | 2 nama terpotong (terpanjang **242** karakter) | `indikator = 320` |
| `opd = 90` | aman, tetapi tanpa ruang | `opd = 96` (terpanjang produksi 54) |
| `selDibersihkan` menghitung **kerapian spasi** | 194 sel "dibersihkan" pada korpus bersih → sinyal tenggelam dalam derau | medan baru `dinormalkan`: **191 dirapikan, 0 dibersihkan, 0 dipotong** |

Semua batas baru tetap menahan serangan: sel 5.000 karakter tetap dipotong (diuji), dan batas baru
diberi ruang ≥1,2× di atas maksimum produksi — diuji **otomatis** dari berkas korpus bila ada.

**Bukti uji tidak hampa (kontrol negatif):** batas lama dikembalikan sementara → uji kalibrasi
**GAGAL** (`expected false to be true`); batas baru → lulus.

### 3.1 Jalur penyedia tiruan: perbaikan hermes belum lengkap

Perbaikan hermes menyentuh **penulis** log (`verifikasi/mock-llm.mjs`) tetapi tidak **pembacanya**.
Akibatnya di mesin lain (mis. macOS, klien) uji keamanan membaca berkas yang tidak pernah ditulis
dan **tampak lulus tanpa memeriksa apa pun**:

| Berkas | Sebelum | Sesudah |
|---|---|---|
| `scripts/uji-bersih-data.mjs:48` | `/home/user/verifikasi/mock-llm-log.jsonl` (absolut, env `SAPA_MOCK_LOG`) | `MOCK_LLM_LOG` → `SAPA_MOCK_LOG` → `cwd/verifikasi/mock-llm-log.jsonl` |
| `verifikasi/uji-terima.sh:551,563` + salinan kit | `${SAPA_MOCK_LOG:-/home/user/…}` | `${SAPA_MOCK_LOG:-$PWD/verifikasi/mock-llm-log.jsonl}` |

Nama env penulis dan pembaca sekarang **sama** (`MOCK_LLM_LOG`), dengan fallback yang kompatibel.

### 3.2 Cacat KEDUA pada jalur log: uji bisa LULUS TANPA BUKTI

Setelah `dev` dipush ke publik dan isinya diperiksa ulang, ditemukan bahwa perbaikan hermes
menyentuh **penulis** log (`verifikasi/mock-llm.mjs`) tetapi **pembacanya tidak** — dan harness
EV-23 sendiri punya tiga jalan menuju "lulus palsu". Ketiganya dibuktikan dengan kontrol, lalu ditutup:

| Jalan lulus palsu | Bukti sebelum ditutup | Sesudah ditutup |
|---|---|---|
| Berkas log penyedia tiruan **tidak ada** | keluar **0 (LULUS)** sambil mencetak `mode model patuh diperiksa: ya` | **GAGAL**, keluar 1: *"uji keamanan TIDAK SAH (lulus tanpa bukti)"* |
| Berkas log **ada tetapi kosong** pada jendela waktu uji | sama, 0 jawaban diperiksa | **GAGAL** (aturan yang sama) |
| Balasan berasal dari **cache aplikasi** | kueri tidak memanggil model; ringkasan "0 jawaban diperiksa" tetapi tetap lulus | **GAGAL** per kueri: *"balasan berasal dari CACHE aplikasi — uji tidak sah"* |
| Tangkapan prompt **tidak ada** | bagian pemeriksaan ISI PROMPT (bukti terpenting FR-23) dilewati diam-diam | **GAGAL** bila `SAPA_WAJIB_PROMPT=1` (kini dipakai kit) |

Karena itu prosedur kit diubah: jalur beracun dijalankan terhadap **aplikasi yang baru dinyalakan**
(dengan `SAPA_HARAP_PATUH=1 SAPA_WAJIB_PROMPT=1`), dan harness menolak semua bentuk "bukti hilang"
di atas. Bukti kontrol yang disengaja gagal:
`verifikasi/uji-bersih-data-tanpa-bukti.txt`, `uji-bersih-data-cache-hampa.txt`,
`uji-bersih-data-tanpa-prompt.txt`, `uji-bersih-data-tanpa-pembersih.txt`.

## 4. Hasil akhir yang diukur (korpus produksi 2.065 record)

| Ukuran | Sebelum sesi ini | Sesudah |
|---|---|---|
| Eval deterministik (90 butir) | **82/90, keluar 1** | **90/90, keluar 0** (diulang di atas dasar `origin/dev` + `0038`) |
| — menyesatkan / invarians | 8 gagal | **0 / 0** |
| — peringkat-1 tepat | — | 89/90 |
| — pasangan entitas (FR-24) | 0 temuan keras | **0 keras, 0 lunak** (210 nilai diperiksa) |
| Eval mode AI (90 butir, `mock-pintar`) | 88/90 (klaim hermes) | **90/90**, grounded 76/76, fallback 0, token tak dikenal 0 |
| FR-23 pada korpus produksi | 194 sel "dibersihkan" (2 pemotongan nyata) | **0 dibersihkan, 191 dirapikan, 0 dipotong** |
| EV-23 (korpus beracun, model `mock-patuh`) | lulus | **lulus dengan bukti penuh**: 6/6 kueri, prompt diperiksa, `[PATUH:]` **0**, sel dibersihkan 12 (semua sel: 2 penanda + perintah terdampingan) |
| — kontrol: pembersih dimatikan | gagal seperti diharapkan | **gagal: 14 pelanggaran, `[PATUH:]` 5×** |
| — kontrol: log/prompt hilang, balasan cache | lulus palsu | **gagal: 1–7 pelanggaran** (§3.2) |
| `vitest` | 566 lulus | **584 lulus** (35 berkas) |
| `typecheck` / `build` | OK | OK |

Artefak: `verifikasi/eval90-produksi-det.txt`, `verifikasi/eval90-produksi-ai.txt`,
`verifikasi/uji-bersih-data.txt`, `verifikasi/uji-bersih-data-tanpa-pembersih.txt`.

### 4.1 Isi `origin/dev` yang diperiksa (pasca-push)

| Pemeriksaan | Hasil |
|---|---|
| Tip & jumlah komit | `86af3b5`, **38** di atas `main` (`ff00eb8` utuh, `main` = `origin/main`) |
| Sama dengan rekonstruksi Arena? | Ya — pohon `origin/dev` berbeda dari cabang `usulan/…` **hanya** pada `.gitignore` + `verifikasi/mock-llm.mjs`, yaitu tepat perbaikan hermes |
| Perbaikan hermes: penulis log | `verifikasi/mock-llm.mjs` memakai `path.join(process.cwd(), …)` + `MOCK_LLM_LOG` ✅ |
| Perbaikan hermes: **pembaca** log | ❌ masih `/home/user/verifikasi/mock-llm-log.jsonl` dan env `SAPA_MOCK_LOG` (baris 48; `uji-terima.sh` baris 551, 563) → ditutup patch `0038` |
| Hasil ulang di atas `origin/dev` + `0038` | eval deterministik **90/90**, eval AI **90/90**, vitest **584/584**, `typecheck` OK |
| Dua jalur pemasangan (basis GitHub) | `git am 0038 + 0039` dan `git am 00-semua.patch` → keduanya menghasilkan **pohon identik** |

## 5. Yang TIDAK diklaim

- **88/90 AI milik hermes tidak direproduksi apa adanya.** Di sini model tiruan `mock-pintar`
  memberi 90/90 pada build sebelum maupun sesudah perbaikan. Angka 88/90 hermes berasal dari
  model/lingkungan berbeda; yang dapat dibandingkan setara adalah jalur deterministik (82/90 → 90/90).
  Untuk menguji mutu narasi AI sungguhan tetap diperlukan uji dengan penyedia nyata.
- **Perbaikan ini tidak menambah data.** U5/U6 sekarang dijawab dengan peringatan jujur, bukan
  dengan angka karangan; katalog tetap tidak punya `inflasi` dan `sebab`.
- **`korpus-beracun.json` dan `korpus-produksi.json` sengaja tidak dilacak git** (kebijakan doc 18).
  Uji kalibrasi membaca korpus bila ada; pada klon bersih ia memakai nilai maksimum tercatat.
- **Utang lama tetap terbuka:** keputusan defleksi S2, medan tak terpakai (`CounterResult`,
  `AMBANG_MANDEK_MS`), dan garis dasar lint pra-ada.

## 6. Langkah berikutnya

1. Tinjau patch `0038` di klien (perbaikan 4 berkas kode + 5 berkas uji + 1 harness + 1 kit).
2. Uji penerimaan klien di repo mereka: `npm ci` → `npx vitest run` → `bash verifikasi/uji-terima.sh`
   → eval 90 butir terhadap korpus produksi.
3. Bila disetujui, `dev` dapat dijadikan dasar tingkat lanjut dari `main`; urutan butir Fase
   lanjutan mengikuti dokumen 10.
