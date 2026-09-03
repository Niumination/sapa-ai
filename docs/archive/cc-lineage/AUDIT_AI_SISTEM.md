# Audit Mekanisme Sistem AI — SAPA Smart AI (cc-acehtengah)

> **Errata (22 Agu 2026):** rate limit `/api/query` sempat ada di `5faa080` lalu hilang saat `7cb1d0e` rollback ke `794b80a`. Klaim “AND lalu OR tidak diimplementasi” tetap benar (kode = OR). Rencana perbaikan resmi: `docs/ai/RENCANA_AI_SOURCE_OF_TRUTH.md`. Brief agent: `docs/ai/AGENT_BRIEF_PR_AI_SOT.md`.

**Lingkup:** hanya pipeline AI (input → output).  
**Baseline commit:** `4b9da20` (HEAD).  
**Pembanding:** `a0cbc6f`, `41d7386`, `946e421`, `67fa030`, `8cda938`, `d1228c6`, `2c8ad16`.  
**Repo history:** clone sempat shallow (1 commit); audit memakai history penuh setelah unshallow.

---

## 1. Peta alur (saat ini)

```
QueryBar (dashboard) ──POST /api/query──► Zod (3–2000 char)
        │                                      │
        │                              USE_MOCK_DATA? ──► JSON mock
        │                                      │
        │                                      ▼
        │                         SSE (status / narasi / result / error)
        │                                      │
        │                         processAIQueryStreaming
        │                                      │
        ├─ cache query (Map, exact string, TTL 5 menit, evict FIFO, max 50)
        ├─ buildContext
        │     ├─ detectIntent (keyword OPD + regex kategori)
        │     ├─ getCachedSapaData (TTL 10 menit, in-memory process)
        │     ├─ tahun kosong → "terbaru"
        │     ├─ filter: OPD XOR token indikator (OR, fallback token[0])
        │     ├─ aggregateByIndicator + prioritaskan token di depan
        │     ├─ dataForLLM (slice 150 indikator, JSON)
        │     └─ retrieveContext → SELALU []
        ├─ streamLLM (OpenAI-compatible, temp 0.3, max_tokens 2560, timeout 90s, retry 5xx 1x)
        ├─ parseHybridResponse (strip thinking → extract JSON seimbang)
        ├─ jika rekomendasi kosong → ensureRekomendasi (LLM ke-2 + heuristic)
        ├─ jika visualisasi none → generateAutoChart (metric/table/bar by shape)
        ├─ saveChatSession (fire-and-forget Prisma)
        └─ setCache + kirim event result
```

Jalur non-stream `processAIQuery` ada, **tidak dipakai** oleh `/api/query`.

---

## 2. Detail tiap tahap

### 2.1 Input UI

- **Jalur produksi:** `QueryBar` → `dashboard/page.tsx` `handleQuery`.
- Client memakai **SSE reader** (benar untuk API saat ini).
- `liveNarasi` di-update dari event `narasi`, **tidak pernah dirender**. Loading hanya spinner + `statusText`.
- **Timeout client 45 detik** (`setTimeout(..., 45000)`), sementara LLM server **90 detik**. Permintaan yang masih jalan di server dipotong di browser.
- `sessionId` di schema API **tidak dikirim** dan **tidak dipakai**. Tidak ada riwayat percakapan ke model.

**Komponen mati / inkonsisten:**

- `AiChatPanel` memanggil `/api/query` lalu `res.json()`. API sekarang SSE → panel ini **rusak** jika dipakai.
- `QueryInput` / `HybridRenderer` tidak terpasang di dashboard.

### 2.2 API `/api/query`

- Validasi Zod: `query` min 3, max 2000.
- **Tidak ada auth.** Middleware hanya melindungi `/dashboard/laporan` dan `/api/chat-logs`. Siapa pun yang bisa hit endpoint bisa membakar kuota LLM.
- Tidak ada rate limit, idempotency key, atau ukuran body selain Zod.
- Event `narasi` di-parse dengan regex lokal yang **tidak** `stripReasoningPrefix` — thinking di depan `{` menunda/mengosongkan preview.

### 2.3 Intent

`detectIntent` **bukan LLM**: peta keyword → nama OPD + regex kategori (`tren`, `perbandingan`, `ews`, `rekomendasi`, default `nilai_saat_ini`).

Masalah:

- **Kategori tidak masuk system prompt.** Model tidak tahu user minta tren vs angka saat ini.
- Keyword pertama yang match menang. `"rs"` sudah di-word-boundary; keyword ≥3 huruf substring (`"gizi"` di dalam kata lain).
- Jika `opdFilter` ada, **filter indikator by token dilewati**. Query “stunting dinas kesehatan” membuang seluruh data Dinkes ke LLM (hingga 150 agregat), bukan indikator stunting.
- `lokasi` selalu `undefined`.

### 2.4 Retrieval data SAPA

- Cache proses 10 menit. Multi-instance (Vercel) = cache terpecah; data bisa stale antar instance.
- Tokenisasi membuang stopword termasuk `jumlah`, `total`, `data`, `aceh`, `tengah`. Umumnya cukup; query sangat generik (“berapa data”) hampir tanpa token → `filteredData` = seluruh dataset.
- `filterByAnyKeyword` adalah OR. Komentar “AND dulu lalu OR” **tidak diimplementasi** — tidak ada pass AND.
- `aggregateByIndicator`: Map `id_kode_indikator` — prefer record bertahun (`existing.tahun==null && r.tahun` upgrade), antar record ber-tahun **first-win** tanpa banding `tahun` numerik max. Jika urutan SAPA berubah, angka tahun salah bisa terpilih.
- Tahun kosong dinormalisasi `"terbaru"` lalu disebut “data terkini” di prompt — **klaim waktu tanpa bukti**.

### 2.5 RAG

`retrieveContext` selalu `return []` (Qdrant dan embed dihapus). Field `konteks` di pesan LLM kosong. Nama “RAG” menyesatkan.

### 2.6 LLM

- Config: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Jika model `nemotron-3-ultra-free` atau kosong → **hardcode** `x-preview-f-free`.
- Data JSON di-pretty-print lalu dipotong 15.000 karakter. Prioritas token di depan membantu, tetapi 150 objek pretty-print mudah terpotong di tengah.
- Komentar masih menulis `max_tokens` 4096; nilai aktual **2560**. Reasoning model bisa habis budget di `reasoning_content`.
- Retry hanya HTTP ≥500 sebelum body; timeout/abort tidak di-retry.
- `temperature` 0.3 untuk output JSON — masih cukup untuk mengarang angka.
- Tidak ada `response_format: json_object` / tool/schema.

### 2.7 Parse & post-process

- Extract brace-balanced JSON + fallback regex `"narasi"`.
- `stripReasoningPrefix` agresif: regex “apa pun sebelum `{"narasi"`” bisa memotong prosa sah.
- `ensureRekomendasi` (commit `4b9da20`): **panggilan LLM kedua** setelah stream selesai. User merasakan jeda sunyi setelah token berhenti. `callLLM` memakai `max_tokens: 2560` lagi — komentar “murah” **salah**.
- Heuristic rekomendasi generik, tidak terikat temuan narasi.
- `generateAutoChart` memakai **seluruh `filteredData`**, bukan subset yang disebut model. Jika filter OPD lebar, chart/tabel tidak relevan ke pertanyaan.
- Contoh di system prompt (ASN 9.610 + “84 pegawai” + pecahan PNS/PPPK) **mengajarkan mengarang** detail yang tidak ada di `data_ditemukan`.

### 2.8 Persistensi

- `chatSession` non-blocking. Gagal DB tidak ke user (baik).
- Metadata latency/steps/model ada.
- Tidak ada user-id; audit tidak menautkan pelaku.

---

## 3. Perubahan vs commit sebelumnya (hanya AI)

| Commit | Perubahan AI | Efek |
|---|---|---|
| `2c8ad16` | Direct SAPA OAuth + agregasi penuh | Fondasi retrieval. |
| `d1228c6` | Indikator match query diletakkan di depan payload | Perbaikan grounding untuk model lemah. |
| `8cda938` | Default model Nemotron free, bukan OpenAI berbayar | Biaya turun; kualitas/latensi tidak stabil. |
| `67fa030` | Model Ox Alpha `x-preview-f-free`; rebrand | Fallback hardcode masih di `getConfig()`. |
| `946e421` | `stripReasoningPrefix` | Mengurangi thinking bocor; regex greedy berisiko. |
| `41d7386` | JSON robust (jangan dump mentah); timeout 45→**90s** server; retry `callLLM` | Server lebih tahan; **client tetap 45s**. |
| `a0cbc6f` | Prompt wajib rekomendasi + panduan viz; auto-chart by shape (1=metric, >8=table, else bar) | UX viz lebih tepat; model tetap sering skip field. |
| **`4b9da20` (HEAD)** | `ensureRekomendasi` LLM+heuristic; `rekomendasi` wajib di tipe; `lines` viz harus array | Rekomendasi tidak kosong; **+1 RTT LLM**; latency naik. |

Tidak ada perubahan arsitektur retrieval/intent/RAG di HEAD — hanya patch gejala (field kosong, tipe viz).

---

## 4. Temuan (severity)

### Kritis

1. **Timeout client 45s vs server/LLM 90s** — jawaban valid sering muncul sebagai “terlalu lama”.
2. **`/api/query` publik tanpa auth/rate-limit** — abuse biaya API.
3. **Tidak ada grounding angka** — model bebas menulis angka di luar `data_ditemukan`; contoh prompt mendorong halusinasi.
4. **Agregasi bukan “tahun terbaru”** — nilai salah bisa masuk keputusan.

### Tinggi

5. Intent kategori dan filter token **diabaikan** begitu OPD terdeteksi.
6. Filter “AND lalu OR” **tidak ada**; OR melebar.
7. `ensureRekomendasi` menambah latency + biaya; tidak streaming; `max_tokens` tidak dikecilkan.
8. RAG mati; regulasi tidak pernah masuk.
9. Preview streaming tidak ditampilkan; `AiChatPanel` tidak kompatibel SSE.
10. Cache query **exact string** — “ASN” vs “asn” vs spasi = miss; tidak invalidate saat SAPA refresh.

### Sedang

11. Potong payload 15k di tengah JSON.
12. `tahun: terbaru` menyesatkan.
13. `sessionId` mati; tidak multi-turn.
14. Error user bisa memuat pesan internal API.
15. Komentar `max_tokens` 4096 vs 2560.
16. `generateAutoChart` pada dataset lebar menyesatkan.
17. Keyword OPD first-match, tidak scoring.

### Rendah

18. `HybridRenderer` / `QueryInput` / `AiChatPanel` dead code, dua kontrak viz.
19. Evict cache FIFO, bukan LRU/TTL sweep.
20. Nama sumber tetap “api-splp…” meski data dari Direct API.

---

## 5. Rekomendasi (prioritas implementasi)

1. **Samakan timeout:** client ≥ server (mis. 100s) atau batalkan server saat `AbortSignal` client; tampilkan sisa waktu.
2. **Lindungi `/api/query`:** auth session + rate limit (IP + user) + kuota harian.
3. **Jangan LLM kedua untuk rekomendasi sebagai default.** Pakai JSON schema / `response_format` + perbaikan prompt. Heuristik **dari indikator yang sama dengan narasi**, bukan top-3 global. Jika tetap ada call ke-2: `max_tokens` 256, timeout pendek, status SSE “Menyusun rekomendasi…”.
4. **Grounding:** setelah parse, validasi angka di `narasi` terhadap `data_ditemukan`; strip/tandai angka yang tidak match. Hapus contoh prompt yang mengarang “84 pegawai” / pecahan PNS.
5. **Perbaiki agregasi:** pilih `tahun` numerik maksimum per indikator; jangan label “terbaru” tanpa tahun.
6. **Retrieval:** jika ada OPD **dan** token, iriskan (OPD ∩ indikator). Implementasikan AND lalu fallback OR seperti komentar. Masukkan `intent.kategori` ke prompt.
7. **Render `liveNarasi`** selama stream; satukan klien (`AiChatPanel` SSE atau hapus).
8. **Cache:** normalisasi key (`normalizeText`); ikat ke versi cache SAPA; LRU.
9. **Payload LLM:** compact JSON (tanpa pretty), hard cap N indikator prioritas, jangan potong di tengah objek.
10. **RAG:** hapus stub atau implement embed + Qdrant; jangan klaim konteks regulasi.
11. **Observabilitas:** log token in/out, finish_reason, apakah JSON parse gagal, apakah fallback rekomendasi/viz dipakai.
12. **Hapus dead path** atau satu renderer resmi.

---

## 6. Verdict

Pipeline sudah lengkap secara bentuk (intent → SAPA → LLM JSON → viz/rekomendasi → log), dan commit `41d7386`–`4b9da20` memperbaiki gejala output (JSON mentah, thinking, rekomendasi kosong, viz salah bentuk).

Inti kualitas jawaban **belum** berubah: retrieval kasar, intent tidak dipakai model, RAG kosong, tidak ada verifikasi angka, timeout UI memotong jawaban, dan HEAD menambah RTT LLM yang memperburuk latensi.

Perbaikan yang benar adalah **kontrak output + retrieval + grounding + timeout/auth**, bukan patch field kosong dengan pemanggilan model kedua.
