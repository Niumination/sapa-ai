# Mode shadow AI

Ringkasan singkat untuk peninjau kode. Rincian terukur ada pada
`LAPORAN-MODE-SHADOW-AI.md` di luar repo ini.

## Keadaan saat ini

**AI tidak aktif secara bawaan.** `AI_ENABLED` tidak dipasang, jadi aplikasi
berjalan 100% deterministik dari data SAPA SPLP. Kode di PR ini hanya
menyiapkan **pipa**-nya: klien model, prompt, pemeriksa grounding, dan mode
shadow. Tidak ada satu pun kredensial yang dibutuhkan untuk menjalankan
aplikasi atau menjalankan test.

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
selisihnya bisa dibaca langsung.

## Provider

Klien bersifat agnostik dan mendukung tiga dialek:

| Provider | `AI_PROVIDER` | Endpoint |
|---|---|---|
| OpenCode Go | `opencode-go` | `https://opencode.ai/zen/go/v1` |
| Gemini (OpenAI-compatible) | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Sesuai OpenAI lainnya | `custom` | sesuai `AI_BASE_URL` |

Daftar 17 variabel lingkungan beserta penjelasnya ada di `.env.example`.

## Yang BELUM terbukti

Seluruh angka pada dokumen ini berasal dari **provider tiruan**, yang pada
dasarnya menyalin evidence. Itu membuktikan pipa dan jaring pengamannya sehat —
**bukan** bukti model sungguhan akan sebersih itu. Sebelum `AI_ENABLED=true`,
jalankan model sebenarnya (OpenCode Go; Gemini sebagai alternatif) dalam mode
shadow dan penuhi gerbang: `pass ≥ 90%`, `replaced ≤ 10%`, `fail = 0`.
