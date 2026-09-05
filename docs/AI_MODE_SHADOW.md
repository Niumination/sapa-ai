# Mode shadow AI

Ringkasan singkat untuk peninjau kode. Rincian terukur ada pada
`LAPORAN-MODE-SHADOW-AI.md` di luar repo ini.

## Keadaan saat ini (diperbarui 2026-09-06: AKTIF produksi)

**AI aktif di produksi** (`sapa-smart-ai.vercel.app`, `glm-5.3` OpenCode Go,
`AI_ENABLED=true`). Tanpa env (`AI_API_KEY` kosong) aplikasi tetap 100%
deterministik — bawaan kode tidak berubah: yang berubah hanya env produksi.

Jejak validasi: gerbang model-sungguhan lolos 2026-09-05 — 78 item, served
74/78, **47/52 panggilan model (90,4% pass, 9,6% replaced, 0 fail)**; jaring
pengaman menangkap halusinasi asli (`tahun halu: 2020`, `tahun halu: 1990`).

## Cara membaca sisa dokumen ini

Bagian §§berikut ditulis saat AI masih nonaktif (mode shadow sebagai jalan
menuju aktivasi). Prosedur shadow-nya tetap berlaku untuk model/pengaturan
baru; angka-angka mock di bawah adalah **sejarah pra-aktivasi**, bukan klaim
berjalan. Keadaan aktif kini: lihat "Keadaan saat ini" di atas.

| Mode | `AI_ENABLED` | `AI_SHADOW` | Yang terjadi |
|---|---|---|---|
| Nonaktif (bawaan) | false | false | narasi deterministik, model tidak dipanggil |
| **Shadow** | false | **true** | model dipanggil & diukur, **yang ditampilkan tetap narasi deterministik** |
| Aktif | true | — | narasi AI ditampilkan bila lolos pemeriksa grounding |

## Mengapa mode shadow ada

Model bisa menulis angka yang tidak ada di data. Karena itu narasi AI tidak
pernah dipercaya begitu saja:

1. Angka pada narasi AI harus ada di evidence (atau dikutip dari pertanyaan).
2. Penanda templat (`{{id}}`) yang belum tersubstitusi menggagalkan jawaban.
3. Bila pemeriksaan gagal → narasi AI **dibuang**, narasi deterministik yang
   disajikan (`grounded: "replaced"`).

Pada pengukuran terakhir dengan provider tiruan: 50 dari 52 lolos (96,2%),
2 dibuang karena **angka halu** (`246` dan `3`), 0 tembus ke layar.

## Menjalankan

```bash
# 1. Provider tiruan (untuk menguji pipa tanpa biaya & tanpa kunci)
node scripts/mock-llm-server.mjs

# 2. Server dalam mode shadow
AI_SHADOW=true AI_PROVIDER=custom \
AI_BASE_URL=http://127.0.0.1:8787/v1 \
AI_MODEL=mock-model AI_API_KEY=uji-lokal \
npm start -- -p 3104

# 3. Ukur 78 butir terhadap server itu
SAPA_EVAL_URL=http://127.0.0.1:3104 npm run eval
```

Setiap pemanggilan mencatat satu baris `[ai-shadow]` berisi pertanyaan, model,
status grounding, alasan, latensi, **dan kedua narasi berdampingan** — sehingga
selisihnya bisa dibaca langsung. Kegagalan panggil/parse dicatat `[ai-error]`
(query 120 karakter + tahap + galat, tanpa kredensial).

## Throttle gateway (temuan 2026-09-05)

OpenCode Go men-throttle traffic beruntun (HTTP 403 `error code: 1010`, pulih
setelah cooldown). Klien me-retry 1x (jeda 10 dtk, `AI_RETRY_BACKOFF_MS`) dan
kegagalan tercatat jujur di metrik eval sebagai `panggilan model gagal` —
gerbang dinyatakan **tidak dapat dinilai** bila >0. Untuk pengukuran gerbang,
beri jeda antar-item ber-evidence:

```bash
SAPA_EVAL_LLM_GAP_MS=15000 SAPA_EVAL_URL=http://127.0.0.1:3104 npm run eval
```
`AI_TIMEOUT_MS` bawaan 20 dtk melindungi UX produksi (lambat → fallback
deterministik, tercatat `panggilan model gagal: timeout`). Untuk pengukuran
gerbang yang valid, longgarkan via env (runtime saja, bukan default kode):

```bash
AI_MAX_OUTPUT_TOKENS=4000 AI_TIMEOUT_MS=60000 \
AI_SHADOW=true AI_PROVIDER=opencode-go \
AI_MODEL=glm-5.3 AI_API_KEY=<kunci> \
npx next start -p 3104
SAPA_EVAL_LLM_GAP_MS=15000 SAPA_EVAL_URL=http://127.0.0.1:3104 npm run eval
```

## Provider

Klien bersifat agnostik dan mendukung tiga dialek:

| Provider | `AI_PROVIDER` | Endpoint |
|---|---|---|
| OpenCode Go | `opencode-go` | `https://opencode.ai/zen/go/v1` |
| Gemini (OpenAI-compatible) | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Sesuai OpenAI lainnya | `custom` | sesuai `AI_BASE_URL` |

Daftar 17 variabel lingkungan beserta penjelasnya ada di `.env.example`.

## Yang BELUM terbukti (status 2026-09-06: SEBAGIAN TERBUKTI — lihat bawah)

Seluruh angka pada dokumen ini berasal dari **provider tiruan**, yang pada
dasarnya menyalin evidence. Itu membuktikan pipa dan jaring pengamannya sehat —
**bukan** bukti model sungguhan akan sebersih itu. Sebelum `AI_ENABLED=true`,
jalankan model sebenarnya (OpenCode Go; Gemini sebagai alternatif) dalam mode
shadow dan penuhi gerbang: `pass ≥ 90%`, `replaced ≤ 10%`, `fail = 0`.

> **5 Sep 2026 — TERBUKTI dengan `glm-5.3` OpenCode Go** (78 item,
> korpus SPLP hidup): served 74/78, **47/52 panggilan (90,4% pass, 9,6%
> replaced, 0 fail, 0 unknown token)**, regresi 0. Jaring menangkap halusinasi
> asli (`tahun halu: 2020`, `tahun halu: 1990`). Atas dasar ini + restu
> Disdukcapil/Dinsos, `AI_ENABLED=true` dipasang di produksi 2026-09-06.
> Yang TETAP terbuka: kualitas model lain (mis. kandidat hemat
> `deepseek-v4-flash` — uji shadow sendiri sebelum pakai) dan 4 gagal konsep
> (C9, D4, D5, M1) ranah Fase 3.
