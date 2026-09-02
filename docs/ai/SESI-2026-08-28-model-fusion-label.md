# Catatan Sesi — 28 Agu 2026: Model AI, Fusion v2, Label DTSEN

> Status: live di Vercel (PROD = `2257349`, branch `hotfix/meeting-ready`)
> Konteks: uji manual user di live site → 3 temuan → 3 keputusan + 2 fix kode.

## 1. Model AI live: `huancheng auto` (menggantikan opencode zen)

**Latar:** opencode zen (`nemotron-3-ultra-free`) sering gagal di live —
`502 Upstream error from Nvidia: Service temporarily overloaded`, kadang
`Internal server error`. Uji langsung 28 Agu:

| Provider/Model | JSON valid | Data besar (30 evidence) | Latensi | Stabil |
|---|---|---|---|---|
| **huancheng `auto`** | ✅ 3/3 finish=stop | ✅ 2/3 (30 rows penuh) | 3.6–4.5s | ✅ |
| opencode `laguna-s-2.1-free` | ⚠️ 1/3 | ❌ truncate | 11.5s | ❌ 503 intermiten |
| opencode `nemotron-3-ultra-free` | ⚠️ | ❌ truncate | 39s | ❌ 502 |
| agentrouter (glm-5.3, deepseek-v4, gpt-5.6) | ❌ content-blocked | — | — | ❌ WAF blokir |
| huancheng glm-4.5-air / DeepSeek-Pro / sensenova | ❌ timeout 60s+ | — | — | ❌ |
| huancheng kimi-k3 / MiniMax-M3 | ❌ 429 rate limit | — | — | ❌ |
| step-3.7-flash | ❌ EOL (28 Agu 08:00 UTC) | — | — | ❌ |

**Keputusan:** `AI_BASE_URL=https://api.hcnsec.cn/v1`, `AI_MODEL=auto`,
`AI_API_KEY=HUANCHENG_API_KEY` (Vercel env Production + `.env.local`).

**Catatan konsistensi `auto`:** `auto` resolve → `agnes-2.5-flash` (dikonfirmasi),
tapi TIDAK bisa dipin langsung (`model_not_found` — bukan model publik list).
Routing bisa berubah kapan saja di sisi provider. Lapisan pengaman pipeline
(extractJsonObject / sanitizeParsed / groundOutput / buildVizFromEvidence)
menjamin format & kejujuran output tetap konsisten; yang berubah hanya gaya narasi.

## 2. Fix: crash streaming "AI sibuk" untuk query bansos/DTSEN

**Root cause:** `ai-orchestrator.ts` — `dtsenResult = fetchDtsenDemoData({...})`
dipanggil TANPA `await` (fungsi async) → `dtsenResult` = Promise → field DTSEN
`undefined` → `TypeError: Cannot read properties of undefined (reading 'length')`
di jalur streaming → fallback `Maaf, layanan AI sedang sibuk...`.

**Fix (`916cb9a`):** tambah `await`. Verifikasi live: PKH (12.234 KK, Rp8.8M) ✅,
DTSEN desil 1 ✅, stunting fusion ✅.

## 3. Fix: tabel Fusi Multi-Sumber v2 — gabungan nyata

**Laporan user:** chip stunting (kategori SAPA) memberi output berdasarkan
Dokumen saja — padahal klaim "penggabungan beberapa sumber". Benar: tabel fusion
sebelumnya hanya berisi baris Dokumen (654 balita); angka SAPA (730) hanya
disebut di narasi.

**Fix (`2257349`):** `buildFusedMultiSourceResponse` kini menghasilkan tabel
dengan kolom seragam `['Indikator / Area', 'Nilai', 'Satuan', 'Sumber']`:
- baris Dokumen (otoritatif, format sumber, maks 14)
- + baris evidence SAPA/DTSEN (maks 8) dengan kolom Sumber eksplisit

Verifikasi live stunting: 17 rows = 14 Dokumen + 3 SAPA (730 Orang, 4,9%),
`_multiSource: true`, `_sources: [Dokumen B, SAPA Aceh Tengah]`.

## 4. Fix: label DTSEN jujur — demo ≠ live

**Laporan user:** jawaban "bersumber dari DTSEN" muncul padahal API DTSEN
diklaim kadaluarsa. Investigasi:
- SPLP DTSEN API **masih 401** (`Invalid Credentials`) — key Vercel & lokal sama.
- Yang tampil = **data demo** (`fetchDtsenDemoData`: 48.200 jiwa desil 1 dst),
  yang SEBELUMNYA salah label: `dataSourceFromEvidence` memberi label
  `DTSEN (Kemensos/BPS via SPLP API)` untuk SEMUA evidence ber-opd DTSEN —
  termasuk demo. User tertipu mengira data live.

**Fix (`2257349`):**
- `ai-orchestrator.ts`: deteksi demo via `provenance.label` mengandung "demo" →
  opd evidence `DTSEN (Demo — simulasi)`.
- `sapa-client.ts dataSourceFromEvidence`: cabang label baru
  `DTSEN (data demo — simulasi)` untuk opd demo; `via SPLP API` hanya untuk
  DTSEN non-demo (live/DB).

Verifikasi live PKH: `SRC: SAPA Aceh Tengah + DTSEN (data demo — simulasi)` ✅

## 5. Status SPLP DTSEN API

- Endpoint: `api-splp.layanan.go.id/dtsen-aceh-tengah/1.0/api/dtsen-aceh-tengah?tb=data_aset&s=kecamatan&f=desil`
- Auth: `AuthorizationSPLP: Bearer <SPLP_API_KEY>` (JWT).
- **MASIH 401** — butuh JWT baru dari tim SPLP. Setelah ganti env Vercel,
  label otomatis `DTSEN (Kemensos/BPS via SPLP API)` dan data live masuk.
- Bapokting (fetch harga komoditas) memakai SPLP juga — ikut terdampak.

## Commit terkait

- `916cb9a` fix(ai): await fetchDtsenDemoData + switch AI ke huancheng auto
- `2257349` fix(ai): tabel fusion multi-sumber gabungan + label DTSEN demo jujur
