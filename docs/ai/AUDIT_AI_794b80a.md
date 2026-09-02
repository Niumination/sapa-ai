# Studi AI: `794b80a` dan parent, vs HEAD

> **Errata:** `7cb1d0e` mengembalikan tree ke `794b80a` dan ikut menghapus pengaman `5faa080` (rate limit query, `maxDuration`, JWT fail-closed). `794b80a` stabil untuk table/stream, bukan untuk keamanan atau SoT. Rencana: `docs/ai/RENCANA_AI_SOURCE_OF_TRUTH.md`.

## Identitas

| Ref | SHA | Tanggal | Peran |
|---|---|---|---|
| Parent langsung `794b80a` | `d1228c6` | sebelum 12 Agu 2026 | Retrieval: indikator match query diprioritaskan di payload LLM |
| **Base stabil** | **`794b80a`** | 12 Agu 2026 | Fix crash TableRenderer; dianggap “versi stabil” (rollback `7cb1d0e` kembali ke sini) |
| HEAD sesi | `4b9da20` | 22 Agu 2026 | Patch rekomendasi + viz shape + tipe wajib |

Antara `794b80a` dan HEAD: 21 commit. **File AI yang berubah hanya** `ai-orchestrator.ts`, `llm-client.ts`, plus tipe `rekomendasi` dan UI dashboard (preview stream dihapus).  
`intent-detector.ts`, `rag-retriever.ts`, `/api/query` **identik** dengan `794b80a`.

---

## 1. Parent `d1228c6` — apa yang sudah ada sebelum “stabil”

Fokus AI di parent: **retrieval**, bukan renderer.

- Token query dinormalisasi; indikator yang namanya mengandung token diletakkan **di depan** `data_ditemukan`.
- Alasan: model free-tier tidak teliti membaca payload panjang; stunting/ASN harus terlihat di awal.
- Pipeline sudah lengkap: intent keyword → SAPA cache → filter OPD/token → agregasi → LLM JSON → auto-chart (bar atau kosong) → cache 5 menit.

`794b80a` **tidak menyentuh** retrieval/orchestrator. Hanya UI table.

---

## 2. Commit `794b80a` sendiri

**Bug:** model/backend mengirim `columns: [{key, name}, …]`. `TableRenderer` merender `{col}` sebagai child React → crash *Objects are not valid as a React child*. Terjadi pada chip “Tenaga Kerja” (tipe table); “ASN” (metric) aman.

**Perbaikan:** normalisasi `colMeta` — string atau object `{key,name}`; cell baca `row[ci]` / `row[key]` / `row[name]`.

Ini perbaikan **kontrak viz di frontend**, bukan kualitas generasi AI. Pipeline server di `794b80a` = pipeline `d1228c6`.

### Perilaku AI di `794b80a` (baseline stabil)

- Model default env: `gpt-4o-mini` jika `AI_MODEL` kosong (belum hardcode Ox Alpha).
- `temperature` 0.1, `max_tokens` 4096, timeout LLM **45s** (selaras timeout client 45s).
- `parseHybridResponse`: jika JSON gagal, **narasi = raw string** (JSON/thinking bisa tampil ke user).
- `rekomendasi` opsional; tidak diisi ulang jika model skip.
- `generateAutoChart`: hanya bar; `<2` entri → chart kosong (`data: []`).
- Dashboard **menampilkan `liveNarasi`** saat stream (kursor pulse).
- `stripReasoningPrefix` internal, prefix terbatas; belum eat-all sebelum `{"narasi"`.

---

## 3. Apa yang berubah dari `794b80a` → HEAD (mekanisme AI saja)

### 3.1 LLM client — lebih tahan, kurang selaras UI

| | `794b80a` | HEAD |
|---|---|---|
| Default model | `AI_MODEL` atau `gpt-4o-mini` | `nemotron-3-ultra-free` / kosong → **`x-preview-f-free`** |
| temperature | 0.1 | 0.3 |
| max_tokens | 4096 | 2560 (komentar masih 4096) |
| timeout fetch | 45s | 90s |
| retry 5xx | tidak (stream sudah ada) | `callLLM` juga 1× |
| strip thinking | sempit | + fence thinking + **semua teks sebelum `{"narasi"`** |

**Regresi vs baseline:** timeout **client dashboard tetap 45s**. Di `794b80a` client=server. HEAD memperpanjang server tanpa client → abort palsu lebih sering.

**Regresi UX:** preview `liveNarasi` dihapus (`946e421` / layout). SSE masih mengirim event `narasi`, UI tidak memakainya.

### 3.2 Orchestrator — parse lebih aman, post-process lebih berat

**Prompt:** rebrand SAPA Smart AI; aturan 8–9 wajib rekomendasi + panduan metric/table/chart; contoh JSON lengkap ASN 2026.

Masalah baru di contoh: narasi menyebut “terdiri dari PNS dan PPPK” dan rekomendasi “84 pegawai” — **tidak ada di `data_ditemukan` contoh**. Baseline hanya mencontohkan satu kalimat angka + OPD.

**Parse (`41d7386`):** strip reasoning → extract object → narasi wajib string non-kosong; else `extractReadableNarasi` (regex / pesan ramah). Tidak lagi dump JSON mentah. Ini perbaikan nyata terhadap `794b80a`.

**Auto-chart (`a0cbc6f`):** 1 baris → metric; >8 → table; 2–8 → bar. Baseline: 1 baris = chart kosong (viz “none” efektif). Perbaikan bentuk; sumber data tetap seluruh `filteredData`.

**`ensureRekomendasi` (`4b9da20`):** jika array kosong, **call LLM kedua** (`callLLM` 90s / 2560 token) lalu heuristic 3 kalimat generik. Tidak ada di `794b80a`. Tipe `rekomendasi` jadi required; fallback stream di dashboard mengisi `[]`.

**`normalizeVisualization`:** `lines` hanya dipakai jika array (hindari crash jika model kirim string).

### 3.3 Yang **tidak** berubah sejak `794b80a`

Retrieval, intent, RAG kosong, filter OPD meniadakan token, agregasi bukan tahun terbaru, cache exact-string, `/api/query` tanpa auth, tidak ada grounding angka, `sessionId` mati.

Artinya “stabil” `794b80a` = **tidak crash table**, bukan “jawaban benar”.

---

## 4. Penilaian relatif

`794b80a` layak jadi baseline UI karena:

- kontrak table longgar (string | `{key,name}`);
- timeout client/server sama;
- user melihat token stream.

HEAD lebih baik pada:

- tidak menampilkan JSON/thinking sebagai jawaban;
- viz fallback sesuai jumlah data;
- rekomendasi jarang kosong.

HEAD lebih buruk pada:

- timeout tidak selaras + LLM kedua (latensi);
- hilangnya live narasi;
- contoh prompt yang mengajari halusinasi;
- temperature naik (0.1 → 0.3) tanpa schema JSON.

---

## 5. Rekomendasi berangkat dari `794b80a` (bukan menumpuk patch)

1. Pertahankan parser HEAD (`extractReadableNarasi` + jangan dump raw) di atas orchestrator `794b80a`.
2. Kembalikan **live narasi** dashboard seperti `794b80a`.
3. Samakan timeout (45/45 atau 90/90), jangan 45/90.
4. Jangan `ensureRekomendasi` via LLM penuh; isi heuristic dari indikator prioritas query, atau schema output sekali jalan.
5. Kembalikan contoh prompt ke gaya `794b80a` (satu angka + OPD, tanpa fiksi 84 pegawai).
6. Temperature 0.1 + `max_tokens` eksplisit konsisten dengan komentar.
7. Baru kemudian sentuh retrieval (AND∩OPD, tahun max) — itu utang `d1228c6`, belum tersentuh sampai HEAD.
