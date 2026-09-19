# 08 — Tata Kelola AI

**Aplikasi:** SAPA Smart AI — asisten tanya-jawab data statistik Kabupaten Aceh Tengah
**Repo:** `Niumination/sapa-ai` (privat) · **Produksi:** `https://sapa-smart-ai.vercel.app`
**Platform:** Next.js 16 di Vercel, region `sin1` (Singapura)
**Target pembaca:** Bidang Statistik dan Persandian, Diskominfo Kabupaten Aceh Tengah
**Tanggal dokumen:** 19 September 2026

> Dokumen ini disusun hanya dari apa yang dapat dibuktikan di dalam repo. Setiap
> klaim menyebut berkas sumbernya. Perkara yang belum pasti ditandai
> `(perlu dikonfirmasi)`.

---

## 1. Model dan Penyedia yang Dipakai

### 1.1 Penyedia yang didukung

Konfigurasi provider dibaca melalui satu pintu di `src/lib/ai/env.ts`. Terdapat tiga
nilai `AI_PROVIDER` (tipe `AiProviderId`, baris 14):

- `opencode-go` — bawaan. Base URL tetap: `https://opencode.ai/zen/go/v1`,
  endpoint `/chat/completions` (PRESETS, baris 54–64).
- `gemini` — endpoint OpenAI-compatible resmi Google AI Studio:
  `https://generativelanguage.googleapis.com/v1beta/openai`, endpoint
  `/chat/completions`.
- `custom` — OpenAI-compatible apa pun (Vercel AI Gateway, OpenRouter, model lokal),
  melalui `AI_BASE_URL` dan `AI_ENDPOINT_PATH`.

Hanya dialek `/chat/completions` yang didukung. Model yang memakai dialek lain
(Anthropic `/messages` atau `/responses`) ditolak dengan alasan yang jelas — daftar
pola di `NON_CHAT_MODELS` (baris 38) mencakup `minimax-`, `qwen3.x-(max|plus)`,
`grok-`, `gpt-5.6-luna`, `muse-spark`.

### 1.2 Model produksi saat ini

- Model produksi: **`deepseek-v4.1-flash`** (penyedia OpenCode Go).
- Bawaan per-provider bila `AI_MODEL` kosong pada `opencode-go` juga
  `deepseek-v4.1-flash` (`src/lib/ai/env.ts`, baris 72) — ini sengaja dipasang agar
  menghapus/mengganti `AI_MODEL` di Vercel tidak pernah meninggalkan model kosong.
- Riwayat model tercatat di `AGENTS.md`: `glm-5.3` → `deepseek-v4-flash` →
  `deepseek-v4.1-flash`. Perpindahan terakhir ke `deepseek-v4.1-flash` dilakukan
  karena kuota `glm-5.3` hampir habis, bukan karena masalah latensi (secara lokal
  keduanya setara).

### 1.3 Prinsip konfigurasi model

- **Model tidak pernah dipilih diam-diam oleh kode.** Komentar `env.ts` (baris 51–53)
  menyatakan anti-pola lama (model env ditimpa hardcode) sudah dihapus; `AI_MODEL`
  harus diisi eksplisit kecuali bawaan per-provider di atas.
- `isAiConfigured` (baris 109) mensyaratkan `baseUrl`, `apiKey`, `model`, dan dialek
  yang didukung semuanya terpenuhi sebelum model boleh dipanggil.
- `AI_ENABLED` dan `AI_SHADOW` bawaan mati (`.env.example`).

---

## 2. Dua Saklar Admin dan Matriks Akibatnya

### 2.1 Definisi saklar

Dua saklar di `/admin/ai-toggle` (`src/lib/ai/toggle.ts`):

- **Saklar AI** (`aiEnabled`) — mengizinkan narasi dihasilkan model LLM.
- **Saklar Deterministik** (`detEnabled`) — mengizinkan **jawaban template**
  (narasi deterministik dari angka evidence). Ini bukan tombol on/off layanan.

State disimpan pada kunci Redis `sapa:ai:toggle:v1` (TTL 30 hari), dengan cadangan
memori per-instance bila Redis tidak dikonfigurasi. **Saklar admin menang atas env**
`AI_ENABLED`/`AI_SHADOW` (`src/services/answer-compose.ts`, baris 254–299).

### 2.2 Matriks akibat

| Saklar AI | Saklar Deterministik | Perilaku layanan | Kode status | Pesan/alasan (dari kode) |
|---|---|---|---|---|
| AKTIF | AKTIF | Normal. Model menjawab; bila model gagal/tidak grounded/tanpa evidence, jatuh ke jawaban template. | 200 | – |
| AKTIF | OFF | Jawaban AI saja, tanpa jaring pengaman template. Bila model gagal skema/timeout atau tidak ada evidence, permintaan gagal. | 503 pada kegagalan | "Deterministik dinonaktifkan oleh admin — jawaban AI saja, tanpa fallback template" |
| OFF | AKTIF | Deterministik saja. Tidak ada panggilan model sama sekali. | 200 | "AI dinonaktifkan oleh admin — jawaban deterministik saja" |
| OFF | OFF | Layanan tidak dapat diakses. Setiap permintaan jatuh ke jalur `service-unavailable`. | 503 | "AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses" |

Catatan teknis penting (agar tidak salah tafsir):

- Pagar "deterministik OFF" berada di fungsi `selesai()` — satu-satunya funnel tempat
  **jawaban template** keluar (`answer-compose.ts`, baris 262–285), ditambah jalur
  shadow (baris 494–496). Jalur cache dan jalur sukses LLM memakai `selengkap()` dan
  **tidak** terpagar, sehingga mematikan deterministik tidak membungkam jawaban AI
  yang sebenarnya berhasil.
- API `/api/query` menerjemahkan keadaan OFF+OFF menjadi HTTP 503 dengan `stage:
  'service-unavailable'` (`src/app/api/query/route.ts`, baris 54–59).
- Bila Redis tidak dikonfigurasi, state toggle hanya berlaku per-instance dan panel
  menampilkan peringatan "Memori (per-instance)"; keadaan toggle bisa tidak konsisten
  antar permintaan.

### 2.3 Kondisi saat ini (19 September 2026)

- **Kedua saklar dimatikan admin**, sehingga layanan membalas **503**.
- Penyebabnya adalah **perpanjangan langganan OpenCode Go yang mandek**, bukan
  kerusakan sistem.
- Model terakhir yang dipakai: `deepseek-v4.1-flash`.
- Catatan operasional dari `AGENTS.md`: `state: inactive` di `/api/status` belum
  berarti rusak — periksa `toggles` lebih dulu, karena toggle admin menang atas env.

---

## 3. Jaminan Agar Model Tidak Mengarang Angka (Grounding / Eject)

Prinsipnya: **model adalah perumus bahasa, bukan sumber angka.** Angka hanya boleh
masuk narasi melalui token `{{id}}` yang nilainya diisi oleh kode dari evidence.

### 3.1 Urutan yang tidak boleh diubah

Ditegaskan di komentar kepala `src/services/answer-compose.ts` (baris 3–5):

    retrieval → (evidence kosong? JANGAN panggil model) → cache → batas harian
    → model → parse skema → eject token {{id}} → GROUNDING → fallback deterministik

### 3.2 Eject token

- Model menulis narasi dengan token `{{id}}` (nilai saja) atau `{{id|t}}` (nilai
  beserta tahun); aturan ini ada di `SYSTEM_PROMPT` (`src/lib/ai/prompt.ts`).
- `ejectTokens()` dan `createStreamEjector()` (`src/lib/ai/tokens.ts`) mengganti token
  tersebut dengan nilai asli dari evidence. Pada jalur streaming, ejector menahan
  potongan token yang belum lengkap agar tidak bocor ke layar.
- `meta.unknownTokens` mencatat berapa banyak token yang tidak dapat dipetakan —
  metrik jujur untuk mendeteksi model yang mengarang id.

### 3.3 Grounding lapis kedua

Berkas `src/services/grounding.ts`:

- `isGrounded` / `isGroundedText` memeriksa seluruh teks keluaran:
  - **Angka** — setiap angka harus cocok dengan nilai evidence (dibandingkan sebagai
    nilai numerik, sehingga desimal tidak tertukar), dengan pengecualian angka
    statistik yang memang diberikan sistem (`extraAllowedNumbers`).
  - **Tahun** — setiap tahun plausibel (1900–2100) harus ada di evidence; bila tidak,
    dicatat sebagai `tahun halu`.
  - **OPD** — nama OPD yang muncul harus subset evidence; bila tidak, `opd halu`.
- Bila pemeriksaan gagal, `groundOutput()` **mengganti seluruh narasi dengan template
  deterministik** yang dibangun dari evidence (`buildDeterministicNarasi`) dan
  menandai `grounded: 'replaced'`. Dengan kata lain, jawaban yang mengandung angka
  karangan tidak ditampilkan — ia diganti.
- Bila lolos, `meta.grounded = 'pass'`.

### 3.4 Tanpa evidence, model tidak dipanggil

`answer-compose.ts` langkah 1 (baris 287–288): bila evidence kosong, model **tidak
pernah dipanggil** dan statusnya `limitedBy: 'no-evidence'`. Ini menghemat 100%
panggilan model sekaligus menghilangkan sumber halusinasi terbesar.

### 3.5 Retry skema (bukan pembiaran kesalahan)

Bila keluaran tidak sesuai skema JSON, aplikasi melakukan **satu percobaan ulang
non-stream** (batas: hanya bila waktu terpakai < 15 detik, percobaan kedua dibatasi
25 detik) — baris 387–428. Percobaan ulang ini menggantikan hasil pertama lewat
event `result`, bukan menampilkan dua jawaban. Dasar keputusannya terdokumentasi:
kegagalan skema bersifat *sampling* (2 dari 8 query gagal parse dan keduanya berhasil
saat diulang).

---

## 4. Pagar Anti-Halusinasi dari Aturan Prompt

Berkas: `src/lib/ai/prompt.ts`. `SYSTEM_PROMPT` memuat delapan aturan mutlak:

1. Angka **hanya** boleh ditulis sebagai token `{{id}}`/`{{id|t}}` dari evidence;
   menulis digit sendiri dilarang kecuali angka pada bagian "statistik".
2. Jangan menyebut tahun, satuan, atau nama OPD yang tidak ada di evidence; jangan
   menggabungkan tahun dari satu indikator ke indikator lain.
3. Bila evidence kosong atau tidak menjawab, katakan tidak tersedia dengan sopan dan
   sarankan kata kunci lain — **jangan mengarang**.
4. Pertanyaan sebab-akibat ("kenapa", "mengapa", "apa penyebab") **tidak boleh**
   dijawab dengan dugaan; cukup jelaskan bahwa SAPA menyimpan angka.
5. Jangan memberi nasihat medis, hukum, atau politik. Rekomendasi hanya soal tata
   kelola data/koordinasi antar-OPD, maksimal 3 butir, tanpa angka baru.
6. Bahasa Indonesia baku (EYD), 2–4 kalimat, tanpa kata berlebihan.
7. Jangan menulis satuan setelah token — satuan sudah ditambahkan sistem (mencegah
   satuan ganda).
8. Keluarkan **hanya satu objek JSON** sesuai skema, tanpa teks lain.

Selain itu, `prompt.ts` secara eksplisit menyatakan **tidak ada few-shot fiktif**
(anti-pola lama: contoh "84 pegawai" mengajari model mengarang). Payload juga
membungkus pertanyaan pengguna sebagai data (`pertanyaan_pengguna`), bukan sebagai
instruksi.

Pagar pendukung lain:

- `filter` rekomendasi dan `followUps` melalui `isGroundedText` sebelum ditampilkan
  (`answer-compose.ts`, baris 445–446); yang tidak lolos dibuang.
- Visualisasi **selalu** ditentukan aturan deterministik, bukan oleh model
  (`answer-compose.ts`, baris 450) — model tidak dapat memanipulasi angka grafik.
- Uji anti-halusinasi tersedia di `src/services/__tests__/grounding.test.ts` dan
  `src/lib/ai/__tests__/prompt-dan-guard.test.ts`.

---

## 5. Metrik Pemakaian

Semua metrik dicatat melalui `src/lib/store.ts` (Redis, dengan cadangan memori).

- **Rasio jawaban** — `recordMetrics('deterministic' | 'llm')` menyimpan pencacah pada
  kunci `metrics:query:deterministic:<tanggal>` dan `metrics:query:llm:<tanggal>`
  (TTL 24 jam). `answer-compose.ts`, baris 34–38 dan 35.
- **Pemakaian harian model** — pencacah `ai:llm:<tanggal>`, dibandingkan dengan
  `AI_DAILY_CALL_LIMIT` (`cekBatasHarian`, baris 92–96).
- **Laporan status** — `GET /api/status` mengembalikan antara lain `state`
  (`active`/`shadow`/`inactive`), `provider`, `model`, `dailyUsed`, `toggles`
  (aiEnabled, detEnabled, backend, updatedAt), dan `metrics` (deterministicToday,
  llmToday, ratio).
- **Metadata per jawaban** (`AiMeta`): `used`, `shadow`, `model`, `provider`,
  `latencyMs`, `grounded` (`pass`/`replaced`/`skipped`), `cached`, `limitedBy`,
  `unknownTokens`, `finishReason`, `usage` (promptTokens/completionTokens),
  `attempted`, `error`.
- **Log operasional** (console): `[ai-error]` untuk kegagalan panggil/parse,
  `[ai-shadow]` untuk mode shadow, `[ai-retry]` untuk percobaan ulang throttle.

Catatan jujur: metrik disimpan di Redis/memori dengan TTL 24 jam dan **tidak**
disimpan permanen sebagai deret waktu; tidak ada dasbor retensi jangka panjang di
dalam repo ini.

---

## 6. Kendali Biaya

Kendali biaya yang benar-benar ada di kode:

- `AI_DAILY_CALL_LIMIT` — batas panggilan model per hari, bawaan **2000**
  (`0` = tanpa batas). Bila terlampaui, permintaan beralih ke deterministik dengan
  alasan `batas harian ... tercapai` (bukan error).
- `AI_MAX_OUTPUT_TOKENS` — bawaan **3000**; dipilih sebagai "titik manis" karena pada
  1500 model kehabisan ruang sebelum JSON selesai (3 dari 4 jawaban terpotong).
- `AI_TIMEOUT_MS` — bawaan **48000 ms**, dijaga di bawah anggaran platform 60 detik.
- **Cache jawaban** — hasil AI disimpan pada kunci `ai:v1:<hash>:<jumlah record>`
  dengan TTL **15 menit** (`CACHE_TTL_MS`), sehingga pertanyaan yang sama tidak
  memanggil model berulang.
- **Tanpa evidence, tanpa panggilan** — menghemat panggilan secara langsung.
- **Rate limit per IP** — 30 permintaan/menit dan 300/jam (`RATE_PER_MINUTE`,
  `RATE_PER_HOUR`), mencegah penyalahgunaan volume.
- **Default AI mati** — `.env.example` menekankan AI bawaan nonaktif; AI hanya
  dihidupkan setelah lulus gerbang promosi.
- Rate limit dan cache hanya lintas-instance bila Redis dikonfigurasi; tanpa Redis,
  batas efektif melemah (limit × jumlah instance) dan cache tidak konsisten — ini
  fakta yang jujur harus disampaikan dalam kendali biaya.

---

## 7. Prosedur Mengganti Model atau Penyedia

Seluruh perubahan dilakukan melalui environment Vercel; tidak perlu mengubah kode.

### 7.1 Langkah umum

1. Buka Vercel Dashboard → proyek `sapa-ai` → Settings → Environment Variables →
   environment **Production**.
2. Tetapkan `AI_PROVIDER` (`opencode-go` | `gemini` | `custom`).
3. Tetapkan `AI_MODEL` secara eksplisit (kode tidak akan memilihkan model secara
   diam-diam).
4. Tetapkan `AI_API_KEY` untuk penyedia tersebut.
5. Untuk `custom` saja: tetapkan `AI_BASE_URL` (dan `AI_ENDPOINT_PATH` bila bukan
   `/chat/completions`). Untuk `opencode-go`/`gemini`, base URL preset berlaku
   otomatis.
6. Sesuaikan opsional bila perlu: `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`,
   `AI_TEMPERATURE`, `AI_JSON_MODE`, `AI_DAILY_CALL_LIMIT`.
7. **Redeploy** agar fungsi membaca nilai baru.
8. Verifikasi `GET /api/status` menampilkan `state: active` dan `model` yang benar.
9. Uji satu pertanyaan nyata dan pastikan `ai.grounded = 'pass'`.

### 7.2 Contoh peralihan ke Gemini (sudah didukung kode)

Karena provider `gemini` sudah ada di PRESETS (`src/lib/ai/env.ts`, baris 59–63),
peralihan tidak memerlukan perubahan kode:

- `AI_PROVIDER=gemini`
- `AI_MODEL=<model Gemini yang tersedia, mis. gemini-2.5-flash-lite>` (nilai contoh
  juga tercantum di `.env.example` baris 44)
- `AI_API_KEY=<kunci Google AI Studio>`
- Base URL akan otomatis memakai
  `https://generativelanguage.googleapis.com/v1beta/openai`.

### 7.3 Sebelum promosi ke produksi

- Tersedia harness evaluasi: `npm run eval` (`scripts/eval-run.mjs`) dan
  `npm run eval:baseline`.
- Gerbang promosi yang tercatat di `.env.example` dan `AGENTS.md`: AI boleh
  dihidupkan hanya setelah lulus mode shadow dengan model sungguhan (pass >= 90%,
  replaced <= 10%, fail = 0, tanpa regresi dari 74/78) dan atas persetujuan pemilik
  aplikasi.
- Mode shadow (`AI_SHADOW=true`, `AI_ENABLED=false`) memanggil model untuk evaluasi
  sementara pengguna tetap menerima jawaban deterministik — inilah cara mengukur
  model baru tanpa risiko ke pengguna.

### 7.4 Hal yang membatalkan promosi secara otomatis

- Model dengan dialek bukan `/chat/completions` ditolak dan sistem jatuh ke
  deterministik dengan alasan jelas (bukan gagal diam-diam).
- Bila `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` kosong, `aiStatusReason()` mengembalikan
  alasan spesifik yang tampil di `/api/status`.

---

## 8. Batas Tanggung Jawab Jawaban AI

- **Jawaban AI bukan produk hukum resmi.** Narasi model adalah rangkuman bahasa atas
  angka evidence; yang berlaku resmi adalah data dan dokumen pada OPD sumber. Setiap
  jawaban wajib diverifikasi ke OPD pemilik indikator sebelum dipakai sebagai dasar
  kebijakan.
- **Sumber tunggal dan label sumber.** Setiap jawaban membawa `dataSource` =
  "SAPA Aceh Tengah (api-splp.layanan.go.id)".
- **Tanpa nasihat profesi.** Aturan prompt melarang nasihat medis, hukum, dan
  politik; rekomendasi dibatasi pada tata kelola data/koordinasi antar-OPD.
- **Bukan data per-orang.** Palang guard menolak pertanyaan yang memuat NIK atau
  meminta data per-orang, dan mengarahkan pemohon ke jalur resmi (Disdukcapil/Dinas
  Sosial) sesuai UU No. 27/2022.
- **Keterbatasan yang diakui terbuka.** Bila data tidak ada, sistem mengaku tidak
  menemukan dan menyebut kata kunci yang tidak dikenal — bukan menebak.
- **Risiko kontinuitas.** Ketika saklar admin mematikan AI dan deterministik, layanan
  mengembalikan 503 secara jujur; ini keadaan operasional, bukan kegagalan yang
  disembunyikan.

---

## 9. Rujukan Berkas

| Pokok | Berkas |
|---|---|
| Konfigurasi provider & model | `src/lib/ai/env.ts` |
| Prompt & aturan anti-halusinasi | `src/lib/ai/prompt.ts` |
| Klien LLM (retry, timeout, streaming) | `src/lib/ai/llm-client.ts` |
| Skema keluaran | `src/lib/ai/schema.ts` |
| Eject token | `src/lib/ai/tokens.ts` |
| Guard data pribadi | `src/lib/ai/guard.ts` |
| Orkestrasi jawaban & metrik | `src/services/answer-compose.ts` |
| Grounding / eject | `src/services/grounding.ts` |
| Jawaban deterministik | `src/services/deterministic-answer.ts` |
| State saklar admin | `src/lib/ai/toggle.ts` |
| Panel admin | `src/app/admin/ai-toggle/page.tsx` |
| Status runtime | `src/app/api/status/route.ts` |
| Daftar env contoh | `.env.example` |
| Harness evaluasi | `scripts/eval-run.mjs` (`npm run eval`) |
