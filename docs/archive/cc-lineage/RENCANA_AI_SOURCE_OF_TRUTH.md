# Rencana Perbaikan AI — Source of Truth SAPA

**Status dokumen:** rencana + kontrak eksekusi. Bukan implementasi.  
**Tanggal:** 22 Agustus 2026  
**HEAD yang dianalisis:** `4b9da20`  
**Baseline fondasi yang boleh diacu:** `794b80a` (UI/table + stream), `d1228c6`/`2c8ad16` (retrieval SAPA), `5faa080` (pengaman `/api/query` — **hilang setelah rollback**), `45a81ae` (SSE).  
**Sumber kebenaran satu-satunya untuk angka, satuan, OPD, tahun:** respons API SAPA (`fetchSapaData` → Direct OAuth lalu fallback SPLP).

---

## 0. Koreksi audit sebelumnya (wajib dibaca)

Dua dokumen awal (`docs/ai/AUDIT_AI_SISTEM.md`, `docs/ai/AUDIT_AI_794b80a.md`) tetap valid untuk alur HEAD, dengan koreksi faktual berikut:

| Klaim lama | Fakta di git/kode |
|---|---|
| Filter “AND lalu OR” tidak diimplementasi | **Benar.** Kode pertama memanggil `filterByAnyKeyword(tokens)` = **OR**. Jika kosong, OR ulang dengan `tokens[0]`. Tidak ada pass “semua token harus match”. Komentar di `buildContext` **salah** terhadap kode. |
| `/api/query` tidak pernah punya rate limit | **Kurang lengkap.** `5faa080` menambah rate limit 10/menit + 60/jam, `maxDuration = 60`, parse body JSON aman, mock ikut SSE. `7cb1d0e` rollback ke `794b80a` **menghapus seluruh itu**. HEAD = kondisi pra-keamanan. |
| JWT / setup tidak relevan ke AI | Relevan secara sistem: rollback yang sama mengembalikan JWT fallback `'cc-acehtengah-secret-key-2026'` (`src/lib/auth.ts` baris 6–8) dan menghapus `/dashboard/akun` + change-password. Bukan bug model, tapi kerusakan fondasi yang menyertai cabang AI. |
| Timeout client/server pecah hanya di HEAD | **Benar.** `794b80a`: client 45s + LLM 45s. HEAD: client **tetap 45s**, LLM **90s**. Preview `liveNarasi` dihapus di `946e421` (file `dashboard/page.tsx`). |
| RAG “opsional” | **Mati.** `retrieveContext` selalu `[]`. Jangan merencanakan regulasi sebagai sumber angka. |
| `ensureRekomendasi` “murah” | **Salah.** Memakai `callLLM` yang sama: `max_tokens: 2560`, timeout 90s. |

Tidak ada perubahan file AI di `794b80a` selain `TableRenderer`. Fondasi retrieval yang “bagus” adalah `2c8ad16` + `d1228c6`, bukan prompt HEAD.

---

## 1. Prinsip yang tidak boleh dilanggar

1. **SoT = gabungan 5 sumber data terverifikasi.** LLM tidak boleh menambah angka di luar evidence berikut:
   - **SAPA** — statistik pemerintahan; field: `opds_nama_opd`, `kode_indikator_nama_indikator`, `variabel` (nilai), `satuan`, `tahun`, `jadwal_pemutakhirin`.
   - **DTSEN (Kemensos/BPS via SPLP API)** — agregat desil, bansos (PKH/BPNT/PBI), distribusi wilayah (k-anonim k≥5).
   - **Bapokting (SPLP API)** — harga beras & komoditas pangan di Aceh Tengah.
   - **Excel offline** — data STUNTING/KOMINFO/DTSEN_CSV (impor manual admin, role-gated, bukan via chat publik).
   - **Dokumen A/B/C (agregat Excel bebas-PII)** — 6 berkas pemberdayaan sosial (Dinas Pendidikan / Dinas Kesehatan / Diskominfo) yang diekstrak deterministik ke `src/data/excel`. Diambil via jalur deterministik `tryExcelDocQuery` **tanpa LLM**; tabel mengikuti format sumber asli. Lihat `src/data/excel/README.md`.
2. **LLM adalah perumus bahasa + pemilih tampilan**, bukan sumber data. Jika semua sumber kosong: jawab "tidak tersedia (SAPA/DTSEN/Bapokting/Dokumen)", jangan isi.
3. **Rekomendasi bukan fakta.** Jika diminta/ditampilkan, harus ditandai normatif dan hanya merujuk indikator yang **sudah dikutip** dari evidence. Dilarang menambah angka baru.
4. **Konteks pertanyaan = token + intent + filter yang dipakai**, harus ikut ke prompt dan ke metadata log. Jangan buang token hanya karena OPD terdeteksi.
5. **Jangan merusak yang sudah benar:** SSE, `TableRenderer` dual-format (`794b80a`), prioritas indikator di depan payload (`d1228c6`), Direct API + fallback SPLP (`2c8ad16`), strip thinking, parser yang menolak dump JSON mentah (`41d7386`).
6. **Satu PR = satu lapisan.** Jangan campur theme, rebrand, GIS, EWS, dan AI SoT.

---

## 2. Diagnosis sistem (bukan hanya file AI)

### 2.1 Yang sudah benar (pertahankan)

- Alur: UI → `POST /api/query` → SSE → `processAIQueryStreaming` → `buildContext` → LLM → parse → event `result`.
- SAPA Direct OAuth + cache 10 menit + fallback SPLP.
- Agregasi per `id_kode_indikator` (bukan 50 record mentah).
- Prioritas nama indikator yang mengandung token query di awal `data_ditemukan`.
- Extract JSON brace-balanced + larangan menampilkan JSON mentah (HEAD).
- Auto-viz by shape (HEAD) — ide benar; sumber datanya yang salah lebar.
- Table renderer menerima `columns` string atau `{key,name}` (`794b80a`).

### 2.2 Kerusakan fondasi karena riwayat commit

Urutan yang merusak (faktual):

1. `5faa080` mengunci `/api/query` (rate limit, body JSON, mock=SSE, `maxDuration`).
2. `8cda938` mengubah default model/base URL dan menyentuh banyak file di luar AI.
3. `7cb1d0e` **hard reset ke `794b80a`** — membuang keamanan `5faa080` **bersama** percobaan `8cda938`. Ini penyebab “fondasi bagus hilang”, bukan HEAD semata.
4. `67fa030`+ UI: rebrand, hapus sidebar, ganti model Ox Alpha, lalu `946e421` menghapus live stream.
5. `41d7386` memperpanjang timeout server tanpa client.
6. `a0cbc6f` / `4b9da20` menambah prompt fiktif + LLM kedua untuk rekomendasi.

Pola: perbaikan gejala (field kosong, thinking, theme) tanpa tes regresi terhadap kontrak SoT.

### 2.3 Cacat yang membuat halusinasi / hilang konteks

| Titik | Perilaku faktual | Dampak |
|---|---|---|
| Intent OPD XOR token | Jika keyword OPD match, filter indikator dilewati | Konteks “stunting di dinkes” jadi seluruh Dinkes |
| OR vs komentar AND | Payload melebar | Model melihat indikator tidak relevan |
| `aggregateByIndicator` | Jika dua record ber-tahun, **yang pertama di map menang**, bukan tahun terbesar | Angka bisa salah tahun |
| Tahun `''` → `"terbaru"` | Prompt menyuruh anggap “data terkini” | Klaim waktu tanpa bukti API |
| Prompt contoh ASN | Menyebut PNS/PPPK dan “84 pegawai” yang tidak ada di data contoh | Model meniru mengarang |
| Aturan 4 prompt | “Jika spesifik tidak ada, tampilkan terkait dari indikator_relevan” | Izin menjawab di luar pertanyaan |
| `ensureRekomendasi` | LLM ke-2 tanpa dataset angka | Rekomendasi + angka baru; latensi ganda |
| `generateAutoChart(filteredData)` | Seluruh hasil filter, bukan subset yang dijawab | Viz tidak sekonteks pertanyaan |
| Potong JSON 15.000 char | Putus di tengah objek | Model baca data rusak |
| Cache key = string mentah | Variasi spasi/kapital miss; tidak terikat versi cache SAPA | Jawaban basi atau miss |
| Client 45s / server 90s | Abort di UI | Konteks “gagal” padahal server sukses |
| Live narasi tidak dirender | Event sia-sia | Hilang umpan balik |
| `sessionId` di schema, tidak dipakai | Tidak multi-turn | Pertanyaan lanjutan kehilangan acuan |
| `/api/query` publik + tanpa `maxDuration` | Abuse + potong di platform | Output putus / biaya |
| RAG kosong + AGENTS.md masih menyebut RAG | Ekspektasi palsu | Jangan dihidupkan untuk angka SAPA |

---

## 3. Target perilaku (kontrak produk)

### 3.1 Input

- Teks 3–2000 karakter, di-trim.
- Body non-JSON → 400 (pola `5faa080`).
- Rate limit per IP (nilai awal sama `5faa080`: 10/menit, 60/jam) sampai ada auth khusus AI.
- Timeout klien = timeout LLM + buffer (usulan: abort klien 100s jika LLM 90s; atau keduanya 60s + `maxDuration` 60). **Harus sama arah.**

### 3.2 Analisis (deterministik, sebelum LLM)

Pipeline wajib berurutan:

1. `normalizeText` + `tokenizeQuery` (stopword tetap; jangan buang token domain).
2. `detectIntent` → `{kategori, opdFilter}` **hanya sebagai hint**, bukan satu-satunya filter.
3. Ambil SAPA (cache). Setiap record simpan `tahunRaw` (null jika kosong). **Jangan** menulis `"terbaru"` ke nilai tahun.
4. Bangun kandidat:
   - `byOpd` jika ada hint OPD;
   - `byAnd` = semua token di nama indikator (dan/atau nama OPD);
   - `byOr` = salah satu token;
   - `byOrFirst` = token pertama (cadangan).
5. Pilih himpunan **tersempit yang tidak kosong**: `byOpd ∩ byAnd` → `byAnd` → `byOpd ∩ byOr` → `byOr` → `byOpd` → kosong.
6. Agregasi: per `id_kode_indikator` pilih record dengan **tahun numerik maksimum**; jika semua tahun null, satu nilai + flag `tahun_tidak_tersedia: true`.
7. Susun `evidence[]` (maks. 30, prioritas match token): objek datar, JSON compact.

Jika `evidence.length === 0`: **jangan panggil LLM**. SSE `result` tetap:

```json
{
  "narasi": "Data untuk pertanyaan ini tidak ditemukan di SAPA.",
  "visualisasi": { "tipe": "none", "konfigurasi": {} },
  "rekomendasi": [],
  "dataSource": "<asal fetch: direct|splp>",
  "timestamp": "<iso>",
  "evidenceCount": 0
}
```

### 3.3 Olah (LLM)

Satu kali panggilan. Dilarang `ensureRekomendasi`.

System prompt hanya:

- Peran: merumuskan `evidence` dalam Bahasa Indonesia.
- **Dilarang** menambah angka, pecahan, tahun, nama OPD, atau entitas yang tidak ada di `evidence`.
- Jika `evidence` tidak menjawab pertanyaan: katakan tidak tersedia; boleh sebut jumlah evidence terkait tanpa mengarang.
- `rekomendasi`: 0–3 kalimat **tanpa angka baru**; boleh kosong.
- `visualisasi` hanya dari `evidence` (metric 1, table 2–8+, chart 2–8 pembanding).
- Tidak ada contoh fiktif. Jika perlu few-shot: kutip **hanya** field yang sama dengan evidence dummy yang juga dikirim, atau tanpa contoh.

Payload user: `{ query, intent, filterDipakai, evidence }`.

Parameter: `temperature` ≤ 0.1; `max_tokens` cukup untuk JSON (usulan 1200, bukan 2560/4096 kecuali terbukti potong); `response_format: json_object` jika provider mendukung — jika 4xx, fallback tanpa format (satu cabang, teruji).

### 3.4 Validasi (wajib, setelah LLM)

Fungsi murni `groundOutput(parsed, evidence)`:

- Kumpulkan literal angka di `narasi` + `rekomendasi` + `visualisasi` (regex angka + pemisah ribuan).
- Setiap angka harus match `variabel` / `nilaiNumber` di evidence (izinkan format `9610` vs `9.610`).
- Tahun di teks harus subset tahun evidence.
- Jika gagal: **buang teks model**. Ganti narasi deterministik dari evidence (template: indikator, nilai, satuan, OPD, tahun atau “tahun tidak tercantum di SAPA”). Viz dari evidence. Rekomendasi `[]`.
- Jika JSON rusak: template yang sama, bukan pesan generik saja.

### 3.5 Output UI

- Kembalikan preview `liveNarasi` seperti `794b80a` **hanya setelah** karakter JSON `"narasi"` ter-parse; jangan tampilkan thinking.
- Setelah `result`, renderer yang sudah ada (`AIResponseRenderer`) cukup; chart/table dari objek tervalidasi.
- Sumber: tampilkan Direct vs SPLP sesuai fetch aktual (sekarang string selalu SPLP — **salah** jika Direct sukses).

---

## 4. Rencana bertahap (agar tidak mengulang rollback)

### Fase A — Kontrak & regresi (tidak mengubah model)

- Tes unit murni (tanpa jaringan): tokenizer, pemilihan filter (matriks OPD×AND×OR), agregasi tahun max, `groundOutput` (angka halu ditolak), extract JSON, timeout helper.
- Fixture JSON SAPA mini (5–10 record) di `src/services/__fixtures__/sapa-mini.json`.
- Kriteria lolos: tes merah untuk perilaku HEAD yang salah (tahun first-win, XOR OPD, angka di luar evidence lolos).

### Fase B — Retrieval + agregasi + evidence

- Hanya `sapa-client.ts` + `buildContext`.
- Hapus relabel `"terbaru"`.
- Perbaiki komentar agar = kode.
- Compact JSON, tanpa pretty-print 15k putus tengah; hard cap N evidence utuh.
- Cache query: `normalizeText(query) + hash(evidence ids + tahun)` ; evict saat cache SAPA refresh.

### Fase C — Satu LLM + grounding + hapus LLM ke-2

- Prompt SoT; hapus contoh 84 pegawai / PNS-PPPK.
- `ensureRekomendasi` dihapus.
- `generateAutoChart` hanya dari `evidence`, bukan seluruh filter.
- Intent kategori dimasukkan ke payload, tidak mengubah SoT.

### Fase D — Transport (cherry-pick) — Selesai `2132855`

Ambil hanya dari `5faa080` yang terkait query: rate-limit + store + maxDuration=60 + try/catch req.json + mock SSE berlabel. Timeout UI 65s >= LLM 60s, liveNarasi dipulihkan.

### Fase E — Observabilitas — Selesai `a7c2281`

- fetchSapaData -> {records, origin} + dataSourceLabel(origin): dataSource di UI kini benar (direct vs splp), dataOrigin di chatSession.metadata.
- callLLM/streamLLM -> LLMResult {text, finishReason, model}: finish_reason + model tercatat.
- buildObservabilityMeta() pure teruji: opdFilter/filterDipakai/evidenceCount/evidenceIds(<=30)/grounding/groundingReason/totalData/filteredCount/matchedCount/latencyMs/stepsMs/model/finish_reason/dataOrigin/dataSource/streamed.
- parseHybridResponse(..., dataOrigin) tidak lagi hardcode SPLP.
- Jangan log isi lengkap evidence jika besar; evidenceIds + evidenceCount cukup.

---

## 5. Kondisi tepi (wajib ditangani)

| Kondisi | Perilaku wajib |
|---|---|
| SAPA Direct gagal, SPLP sukses | Lanjut; `dataOrigin=splp` |
| Keduanya gagal | Tanpa LLM; narasi error infrastruktur; HTTP 200 SSE `error` atau `result` error terstruktur |
| Cache SAPA stale | TTL 10 menit OK; jangan jawab seolah real-time detik ini |
| Query “semua OPD” | Evidence = ringkasan hitung OPD/indikator dari agregat, **bukan** 150 nilai acak |
| Query tren / “3 bulan” | Jika SAPA tidak punya deret waktu: katakan tidak tersedia; jangan interpolasi |
| Query perbandingan kecamatan | SAPA record tidak punya kecamatan (`lokasi` selalu undefined) → tidak tersedia |
| Query regulasi / hukum | Bukan SoT; tolak atau “di luar data SAPA” |
| Model mengembalikan thinking + JSON | Strip; ground |
| Model mengembalikan reasoning saja | Template dari evidence |
| Provider 5xx | 1 retry seperti sekarang; lalu error infrastruktur |
| Abort klien | Hentikan kerja; jangan `ensure*` setelah abort |
| `USE_MOCK_DATA=true` | SSE; disclaimer mock; jangan label “SAPA real-time” |
| Dua tab / query baru | Abort request lama (sudah ada `abortRef`) |
| Evidence 1 nilai | Metric; narasi 1–2 kalimat template jika ground gagal |
| Nama indikator sama, id beda | Jangan merge |
| `variabel` non-numerik | Jangan `Number` paksa jadi 0; kirim sebagai string; jangan masuk chart numerik |
| Rekomendasi diminta eksplisit tapi evidence kosong | `[]` + narasi tidak tersedia |

---

## 6. Yang dilarang saat eksekusi

- Menghidupkan Qdrant/RAG untuk “memperkaya” angka.
- Few-shot dengan fakta fiktif.
- LLM kedua “supaya kolom tidak kosong”.
- Default model hardcode yang menimpa `AI_MODEL` tanpa alasan SoT (override Nemotron→Ox Alpha adalah kebijakan produk; jangan campur di PR retrieval kecuali didokumentasikan terpisah).
- Mengganti seluruh dashboard/theme.
- Menyalin `8cda938` utuh.
- Menurunkan `TableRenderer` ke string-only (regresi `794b80a`).
- Mengembalikan `parseHybridResponse` yang men-set `narasi = raw`.

---

## 7. Definisi selesai

AI SoT dianggap selesai jika semua benar:

1. Tes unit Fase A hijau di CI lokal (`npx tsc --noEmit` + runner tes yang dipilih repo; jika belum ada runner, tambah `node:test` atau vitest **hanya untuk layanan AI**).
2. Query tanpa match → tidak ada panggilan LLM (bisa diuji dengan stub).
3. Angka di luar evidence tidak pernah tampil ke UI (kasus uji ground).
4. Tahun di jawaban = tahun record terpilih atau eksplisit “tidak tercantum”.
5. Timeout UI ≥ timeout fetch LLM; live narasi terlihat lagi.
6. Rate limit + body JSON dari pola `5faa080` kembali di `/api/query`.
7. Tidak ada `ensureRekomendasi`.
8. Diff tidak menyentuh GIS/theme/auth kecuali file rate-limit yang memang baru.

---

## 8. Urutan PR yang disarankan

| PR | Isi | Risiko |
|---|---|---|
| PR-1 (dokumen ini) | Rencana + brief agent + errata | Tidak ada runtime |
| PR-2 | Fase A tes + fixture | Rendah |
| PR-3 | Fase B retrieval | Sedang — ubah jawaban |
| PR-4 | Fase C prompt + ground + hapus LLM-2 | Sedang |
| PR-5 | Fase D transport/timeout/rate limit/live UI — Selesai 2132855 | Selesai |
| PR-6 | Fase E observabilitas (dataOrigin/finish_reason/metadata) | Selesai |

Jangan gabung PR-3–5 dalam satu commit “god fix”. Itu pola yang sudah memaksa `7cb1d0e`.
