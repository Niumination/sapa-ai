# 02 — Arsitektur Sistem SAPA Smart AI

> Dokumen serah terima teknis. Semua pernyataan di bawah ini diverifikasi langsung
> dari kode di repositori `Niumination/sapa-ai` (branch `main`) dan dari pengujian
> read-only terhadap produksi `https://sapa-smart-ai.vercel.app` pada 19 September 2026.
> Jika ada hal yang tidak dapat dipastikan dari sumber tersebut, ditandai
> `(perlu dikonfirmasi)` dan bukan ditebak.

---

## 1. Ringkasan Sistem

SAPA Smart AI adalah aplikasi web tanya-jawab data statistik Kabupaten Aceh Tengah.
Pengguna mengajukan pertanyaan dalam bahasa Indonesia, sistem menarik data indikator
dari API SPLP, lalu menyusun jawaban.

Sistem ini **sengaja hanya bergantung pada satu sumber data**: API SPLP
(`api-splp.layanan.go.id/sapa`). Tidak ada salinan data, tidak ada basis data,
tidak ada penyimpanan permanen lain.

Dua mode penyusunan jawaban:

1. **Deterministik (template)** — jawaban dihitung dan dirangkai murni oleh aturan
   kode dari record SPLP. Tidak memanggil model bahasa sama sekali.
2. **AI (LLM)** — narasi dirangkai oleh model bahasa, tetapi **angka selalu diambil
   dari evidence oleh kode**, bukan ditulis oleh model. Jawaban AI yang tidak lolos
   pemeriksaan (grounding) dibuang dan diganti jawaban deterministik.

Kedua mode ini dikendalikan sakelar admin (lihat Bagian 8).

---

## 2. Identitas Teknis

| Butir | Nilai terverifikasi | Sumber bukti |
|---|---|---|
| Repositori | `Niumination/sapa-ai` (privat) | README, AGENTS.md |
| Produksi | `https://sapa-smart-ai.vercel.app` | README, hasil probe produksi |
| Framework | Next.js `16.2.10` (App Router) | `package.json` |
| React | `19.2.4` | `package.json` |
| CSS | Tailwind CSS 4 (`@tailwindcss/postcss`) | `package.json` |
| Grafik | Recharts `^3.9.2` | `package.json` |
| Peta | Leaflet `^1.9.4`, react-leaflet `^5.0.0` | `package.json` |
| Validasi skema | Zod `^4.4.3` | `package.json` |
| Pengujian | Vitest `^3.2.7` | `package.json` |
| Region fungsi | `sin1` (Singapura) | `vercel.json`; header `x-vercel-id: sin1::...` pada produksi |
| Batas durasi fungsi | `maxDuration: 60` untuk `/api/query` dan `/api/query/stream` | `vercel.json` |
| Jumlah pengujian | 169 test / 17 berkas (hijau) | `npx vitest run` lokal, 19 Sep 2026 |

---

## 3. Alur Data: dari SPLP sampai Jawaban Pengguna

Sumber data tunggal:

```
GET https://api-splp.layanan.go.id/sapa/1.0/api/daftar_data
```

Fungsi `fetchSapaData()` di `src/lib/sapa-client.ts` mengambil endpoint tersebut
tanpa kredensial (endpoint bersifat publik), dengan `AbortSignal.timeout(30000)` dan
`User-Agent` browser. Respons divalidasi: `res.ok` harus benar dan `api_status` harus
sama dengan `1`; jika tidak, fungsi melempar galat.

Hasil observasi produksi 19 Sep 2026: `sapa.records = 2065`.

### Diagram alur (teks)

```
                 ┌──────────────────────────────────────────────┐
                 │  API SPLP  api-splp.layanan.go.id/sapa       │
                 │  /1.0/api/daftar_data   (publik)             │
                 └───────────────────────┬──────────────────────┘
                                         │ fetchSapaData()
                                         │ timeout 30 s, LRU 10 menit per-instance
                                         ▼
        ┌────────────────────────────────────────────────────────────┐
        │  src/lib/sapa-client.ts                                    │
        │  • cache LRU dalam memori proses, TTL 10 menit             │
        │  • normalisasi teks, tokenisasi, retrieval v2              │
        └───────────────┬────────────────────────────────────────────┘
                        │
      ┌─────────────────┼──────────────────────────────┬─────────────────────┐
      ▼                 ▼                              ▼                     ▼
 /api/query        /api/kpi · /api/stats        /api/sapa            /api/analytics/
 /api/query/stream /api/report                  /api/status          opd/[slug]
 (force-dynamic)   unstable_cache 600 s         force-dynamic        cache memori 10 mnt
      │            (terdistribusi, tag)         (tidak di-cache)
      ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  src/services/answer-compose.ts  — composeAnswer()           │
 │                                                              │
 │  0. Pagar data pribadi (NIK / permintaan data per-orang)      │
 │  1. buildDeterministicAnswer() → evidence + jawaban template │
 │  2. Toggle admin dibaca (menang atas env)                    │
 │  3. Evidence kosong? → JANGAN panggil model, jawab template  │
 │  4. Guard query → rate limit → cache jawaban → batas harian  │
 │  5. Panggil model (stream / non-stream)                      │
 │  6. parseLlmAnswer() — gagal skema → 1 percobaan ulang       │
 │  7. ejectTokens() — penanda {{id}} diganti nilai evidence    │
 │  8. isGrounded() — angka fiktif → groundOutput() / buang     │
 │  9. formatAngkaPresentasi() → kirim ke pengguna              │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
                    Jawaban (JSON atau SSE) ke pengguna
```

### Urutan langkah yang tidak boleh diubah

Komentar di berkas `src/services/answer-compose.ts` menetapkan urutan berikut:

```
retrieval → (evidence kosong? JANGAN panggil model) → cache → batas harian
→ model → parse skema → eject token {{id}} → GROUNDING → fallback deterministik
```

Prinsip kuncinya: **model tidak pernah menulis angka sendiri.** Model menulis narasi
dengan penanda `{{id}}`; kode menggantinya dengan nilai asli dari evidence
(`ejectTokens`). Pemeriksaan `isGrounded()` kemudian memastikan tidak ada angka di
narasi (atau di rekomendasi/follow-up) yang tidak berasal dari evidence atau dari
pertanyaan pengguna. Jika pemeriksaan gagal, `groundOutput()` mengganti narasi dan
`ai.grounded` bernilai `"replaced"`.

---

## 4. Daftar Komponen dan Tanggung Jawab

### 4.1 Lapisan data

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/sapa-client.ts` | Klien SPLP: `fetchSapaData()` (LRU 10 menit), tipe `SapaRecord`, normalisasi teks, tokenisasi query, retrieval v2 (pencocokan kata utuh, stemming ringan, sinonim), agregasi per indikator, label sumber data |
| `src/lib/parse-numeric.ts` | Satu pintu parser angka dan nilai mentah dari SPLP |
| `src/services/analytics-data.ts` | Agregat untuk dashboard/analytics/GIS, dibungkus `unstable_cache` 600 s, tag `sapa-analytics` |
| `src/services/kpi-data.ts` | Data 8 KPI terkurasi, `unstable_cache` 600 s, tag `kpi` |
| `src/services/opd-drilldown.ts` | Logika drill-down per OPD (murni, teruji unit) |

### 4.2 Lapisan penyusunan jawaban

| Berkas | Tanggung jawab |
|---|---|
| `src/services/answer-compose.ts` | Orkestrasi: pagar PII, toggle admin, retrieval, cache, batas harian, panggilan model, grounding, fallback deterministik |
| `src/services/deterministic-answer.ts` | Membangun jawaban template dari data SPLP tanpa bantuan model |
| `src/services/grounding.ts` | `isGrounded()`, `isGroundedText()`, `groundOutput()`, `formatAngkaPresentasi()`, tipe `EvidenceItem` |
| `src/services/executive-presentation.ts` | Penyusunan lapisan presentasi eksekutif |
| `src/services/kpi.ts` | `computeKpis()` — perhitungan KPI dari record |
| `src/services/report-generator.ts` | `buildReport()` — laporan eksekutif |

### 4.3 Lapisan AI

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/ai/env.ts` | Satu pintu pembacaan env AI. Menentukan provider, model, anggaran waktu/token, batas harian, dan apakah AI aktif/nonaktif |
| `src/lib/ai/llm-client.ts` | Klien HTTP OpenAI-compatible `/chat/completions`, jalur non-stream (`callLlmText`) dan stream (`streamLlm`), logika retry, watchdog sambungan mandek |
| `src/lib/ai/prompt.ts` | `buildPrompt()` — menyusun system+user prompt dari query dan evidence |
| `src/lib/ai/schema.ts` | `parseLlmAnswer()` — memvalidasi keluaran model terhadap skema |
| `src/lib/ai/tokens.ts` | `ejectTokens()`, `createStreamEjector()`, `dedupUnits()` — penggantian penanda `{{id}}` dan pembersihan duplikasi satuan |
| `src/lib/ai/guard.ts` | `guardQuery()`, `cekDataPribadi()`, `cekPermintaanPerOrang()` — pagar panjang query dan data pribadi |
| `src/lib/ai/toggle.ts` | Sakelar admin: `readToggleState()`, `writeToggleState()`, `toggleBackend()` |

### 4.4 Lapisan infrastruktur

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/store.ts` | Penyimpanan bersama: Upstash Redis bila dikonfigurasi, jatuh ke memori proses bila tidak. Dipakai cache jawaban, penghitung, rate limit, dan state toggle |
| `src/lib/rate-limit.ts` | Rate limiter per-IP, pengambilan IP dari `x-forwarded-for` (entri paling kanan), header `Retry-After` / `X-RateLimit-*` |
| `src/lib/format-singkat.ts` | Satu sumber format angka singkat agar seluruh tampilan selaras |

### 4.5 Lapisan halaman (App Router)

| Rute halaman | Berkas | Keterangan |
|---|---|---|
| `/` | `src/app/page.tsx` | Mengalihkan ke `/dashboard` |
| `/dashboard` | `src/app/dashboard/page.tsx` | Beranda RSC, `revalidate 600`, memakai `KpiPanel` dengan `initialData` |
| `/dashboard/analytics` | `src/app/dashboard/analytics/page.tsx` | RSC, `revalidate 600`; grafik Recharts dimuat dinamis (`ssr: false`), drill-down OPD dimuat malas |
| `/dashboard/gis` | `src/app/dashboard/gis/page.tsx` | Peta Leaflet, dimuat dinamis |
| `/dashboard/laporan` | `src/app/dashboard/laporan/page.tsx` | Laporan eksekutif + riwayat tersimpan di `localStorage` peramban |
| `/dashboard/status` | `src/app/dashboard/status/page.tsx` | Status sistem |
| `/admin/ai-toggle` | `src/app/admin/ai-toggle/page.tsx` | Panel admin sakelar AI/Deterministik (komponen klien) |

---

## 5. Daftar Endpoint API

Seluruh handler berada di `src/app/api/**/route.ts`. Terverifikasi 11 endpoint.

| Endpoint | Metode | Sifat cache |
|---|---|---|
| `/api/query` | POST | `force-dynamic` |
| `/api/query/stream` | POST | `force-dynamic` (Server-Sent Events) |
| `/api/kpi` | GET | `revalidate 600` + `unstable_cache` tag `kpi` |
| `/api/report` | GET | `revalidate 600` + `unstable_cache` tag `report` |
| `/api/sapa` | GET | `revalidate 600` + `unstable_cache` tag `sapa-analytics` |
| `/api/stats` | GET | `revalidate 600` + `unstable_cache` tag `stats` |
| `/api/status` | GET | `force-dynamic`, tidak di-cache |
| `/api/revalidate` | POST | `force-dynamic` |
| `/api/analytics/opd/[slug]` | GET | Cache memori 10 menit per nama OPD |
| `/api/admin/status` | GET | `force-dynamic`, publik, tanpa rahasia |
| `/api/admin/toggle-ai` | GET, POST | `force-dynamic`, memerlukan header `x-admin-key` |

Rincian parameter, contoh permintaan, dan kode status ada di dokumen
`06-DOKUMENTASI-API.md`.

---

## 6. Pilihan Teknologi dan Alasan Singkat

| Pilihan | Alasan yang dapat dibaca dari repositori |
|---|---|
| Next.js 16 App Router | Satu proyek memuat halaman (RSC) dan API dalam satu basis kode; ISR/`revalidate` dan `unstable_cache` memberi kesegaran data tanpa basis data |
| React Server Components + ISR 600 s | Halaman `/dashboard` dan `/dashboard/analytics` mengambil data di server lalu di-cache 10 menit, sehingga kunjungan berulang tidak membebani SPLP |
| `unstable_cache` bertag | Pembatalan cache terdistribusi dan terarah lewat `POST /api/revalidate`, tanpa mengubah kode |
| Tailwind CSS 4 | Utilitas CSS tanpa berkas gaya terpisah |
| Recharts dimuat dinamis (`ssr: false`) | Pustaka grafik tidak masuk bundel awal halaman analytics |
| Leaflet dimuat dinamis | Pustaka peta hanya dimuat pada halaman GIS |
| Zod | Validasi keluaran model AI terhadap skema sebelum dipakai |
| Vitest | Pengujian unit untuk grounding, parser, skema/guard AI, route 503 |
| Upstash Redis (opsional) | State lintas-instance di lingkungan serverless. Tanpa Redis, penyimpanan jatuh ke memori proses — state menjadi per-instance |
| Tanpa ORM/basis data | Sumber data tunggal sudah menyediakan seluruh yang dibutuhkan; tidak ada data yang perlu disimpan |
| Klien LLM agnostik-provider | Satu dialek `/chat/completions` untuk OpenCode Go, Gemini (endpoint OpenAI-compatible), atau gateway OpenAI-compatible lain |

---

## 7. Struktur Folder Penting

```
sapa-ai/
├── .env.example              # 18 variabel, semuanya dikomentari (dokumentasi, bukan anjuran)
├── .nvmrc                    # berisi: 22
├── AGENTS.md                 # kontrak kerja repositori + riwayat sesi
├── README.md                 # gambaran fitur dan tech stack
├── next.config.ts            # type checking aktif; build gagal bila ada error TypeScript
├── package.json              # name: sapa-ai; engines.node: >=20
├── vercel.json               # regions: ["sin1"]; maxDuration 60 untuk /api/query dan stream
├── data/
│   └── eval-set.json         # 78 butir uji evaluasi + baseline
├── docs/
│   ├── AI_MODE_SHADOW.md
│   ├── DESAIN-PIPELINE-DETERMINISTIK.md
│   ├── RENCANA-TAHAP-BERIKUTNYA.md
│   ├── VERCEL_ENV.md         # isi berkas ini masih bertema proyek lain (lihat Bagian 11)
│   ├── archive/              # dokumentasi era stack lama (auth/DB/DTSEN) — sejarah
│   └── serah-terima/         # dokumen serah terima
├── scripts/
│   ├── typecheck.sh          # npx tsc --noEmit
│   ├── eval-run.mjs          # runner evaluasi 78 butir + pembanding baseline
│   ├── mock-llm-server.mjs   # penyedia LLM tiruan untuk uji tanpa biaya
│   └── pii-gate.sh
├── src/
│   ├── app/
│   │   ├── api/              # 11 route (lihat Bagian 5)
│   │   ├── admin/ai-toggle/  # panel admin
│   │   └── dashboard/        # dashboard, analytics, gis, laporan, status
│   ├── components/           # QueryBar, KpiPanel, OpdDrilldown, AIResponseRenderer, dll.
│   ├── lib/
│   │   ├── ai/               # env, llm-client, prompt, schema, tokens, guard, toggle
│   │   ├── sapa-client.ts    # klien SPLP + retrieval
│   │   ├── store.ts          # Upstash Redis / memori
│   │   └── rate-limit.ts
│   ├── services/             # answer-compose, deterministic-answer, grounding, kpi, dll.
│   └── types/index.ts        # HybridResponse dan tipe lain
└── supabase/                 # sisa era stack lama, tidak dipakai
```

---

## 8. Kendali Jawaban: Dua Sakelar Admin

State sakelar disimpan melalui `src/lib/ai/toggle.ts` dengan kunci
`sapa:ai:toggle:v1`, masa hidup 30 hari, di `src/lib/store.ts`
(Upstash Redis bila `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` diisi,
atau memori proses bila tidak).

Nilai bawaan bila belum pernah diubah: **keduanya aktif** (`aiEnabled: true`,
`detEnabled: true`).

Semantik yang benar (dikoreksi pemilik 19 Sep 2026, tercatat di komentar kode):

- **AI** = apakah narasi model boleh dikirim ke pengguna.
- **Deterministik** = apakah **jawaban template** boleh disajikan. Mematikannya
  melarang balasan template, bukan mematikan seluruh layanan. Selama AI masih hidup,
  jawaban AI tetap disajikan.

### Matriks empat keadaan

| AI | Deterministik | Yang terjadi | Kode respons `/api/query` |
|---|---|---|---|
| ON | ON | Jawaban AI, dengan fallback template bila model gagal/ditolak grounding | 200 |
| ON | OFF | Jawaban AI saja; tanpa jaring pengaman template. Bila AI gagal, layanan menolak | 200 (sukses AI) atau 503 |
| OFF | ON | Jawaban template saja; model tidak dipanggil | 200 |
| OFF | OFF | Layanan tidak dapat diakses | **503** |

Pagar "deterministik OFF" dipasang di fungsi `selesai()`, yaitu satu-satunya tempat
jawaban template keluar, ditambah jalur mode shadow. Jalur cache dan jalur sukses
model memakai `selengkap()` dan sengaja tidak dipagari.

Sakelar admin **menang atas variabel lingkungan**. Fungsi `getAiRuntimeStatus()`
menghitung status dari `AI_ENABLED`/`AI_SHADOW` yang nyata, lalu mengalikannya dengan
`aiEnabled` milik sakelar.

---

## 9. Diagram Alur Jawaban (rinci)

```
Pengguna mengirim pertanyaan
        │
        ▼
[0] Pagar data pribadi (cekDataPribadi / cekPermintaanPerOrang)
    │  memuat NIK atau meminta data per-orang?
    │  ya → tolak dengan narasi tetap + saran; ai.limitedBy = 'guard'
    ▼ tidak
[1] buildDeterministicAnswer() → dasar.evidence + dasar.response
        │
        ▼
[2] Baca sakelar admin (readToggleState)
        │
        ▼
[3] dasar.evidence.length === 0 ?
        │  ya → selesai('evidence kosong — model tidak dipanggil', 'no-evidence')
        │        (model TIDAK dipanggil — menghemat 100% panggilan)
        ▼ tidak
[4] AI aktif atau shadow? (isAiEnabled/isAiShadow DAN sakelar AI)
        │  tidak → selesai(alasan, 'unconfigured') → jawaban template
        ▼ ya
[5] guardQuery() → rate limit per-IP → cache jawaban → batas harian
        │  lewat batas → selesai(..., 'rate-limit' | 'daily-limit') → jawaban template
        ▼
[6] Panggil model (streamLlm atau callLlmText)
        │  galat panggil → dicatat di console.error('[ai-error]'), lalu
        │  selesai('panggilan model gagal: ...') → jawaban template
        ▼
[7] parseLlmAnswer() — keluaran harus sesuai skema
        │  gagal → 1 percobaan ulang NON-stream, hanya bila waktu terpakai < 15 dtk
        │          dan percobaan kedua dibatasi 25 dtk
        │  tetap gagal → selesai(error) → jawaban template
        ▼
[8] ejectTokens(narasi) → {{id}} diganti nilai evidence asli
[9] Saring rekomendasi & follow-up dengan isGroundedText()
[10] isGrounded() — pemeriksaan menyeluruh
        │  gagal → groundOutput() mengganti narasi; ai.grounded = 'replaced'
        │  lolos → ai.grounded = 'pass'
        ▼
[11] formatAngkaPresentasi()
[12] Mode shadow? → yang dikirim tetap jawaban deterministik, hasil model dicatat
                     di log '[ai-shadow]'
[13] Simpan di cache 15 menit, catat metrik 'llm', kirim jawaban AI
```

---

## 10. Perilaku saat SPLP Tidak Dapat Dihubungi (503, bukan 500)

Ini perilaku yang dijaga pengujian. Berkas `src/app/api/query/route.test.ts`
memverifikasi jalur ini dengan memalsukan (`mock`) `fetchSapaData`.

### 10.1 Jalur JSON (`POST /api/query`)

```ts
const fetched = await fetchSapaData().catch((err) => ({ splpError: err }));
if ('splpError' in fetched) {
  return Response.json(
    { error: 'Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.',
      stage: 'splp', detail },
    { status: 503 },
  );
}
```

Yang perlu dicatat:

- Galat SPLP **ditangkap**, bukan dibiarkan menjadi 500.
- `stage: 'splp'` menandai sebabnya, dan `detail` memuat pesan galat asli untuk
  keperluan diagnosis.
- Kode status adalah **503 Service Unavailable**, yang secara semantik benar
  (layanan sementara tidak siap), bukan 500 Internal Server Error.

### 10.2 Jalur SSE (`POST /api/query/stream`)

Jika SPLP tidak dapat dijangkau, aliran SSE tetap dibuka dengan status HTTP 200,
lalu mengirim satu event berikut dan menutup aliran:

```
event: error
data: {"error":"Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.","stage":"splp","detail":"..."}
```

Catatan penting untuk teknisi: pada jalur SSE, **kode status HTTP pada header adalah
200** (karena aliran sudah dimulai), dan kegagalan disampaikan lewat isi event
`error`. Klien harus membaca isi event, bukan hanya kode status HTTP.

### 10.3 Jalur lain

Endpoint agregat (`/api/kpi`, `/api/report`, `/api/sapa`, `/api/stats`) membalas
**500** dengan isi `{ error, ... }` bila pengambilan data gagal. Endpoint
`/api/status` sengaja **tidak** membalas galat: kegagalan SPLP dilaporkan sebagai
`sapa.state: "down"` dengan `records: 0` di dalam respons 200, supaya halaman status
tetap dapat menampilkan keadaan sebenarnya.

---

## 11. Batasan Desain: yang Sengaja TIDAK Ada

Daftar ini adalah keputusan sadar, bukan kekurangan yang belum dikerjakan. Aturan
repositori di `AGENTS.md` menyatakan komponen-komponen berikut tidak boleh
diperkenalkan kembali tanpa diskusi.

| Yang tidak ada | Keterangan |
|---|---|
| **Tanpa basis data** | Tidak ada PostgreSQL, MySQL, SQLite, Supabase, atau penyimpanan permanen. Sumber data tunggal adalah SPLP. Cache hanya di memori proses dan cache Next.js |
| **Tanpa ORM / Prisma** | Tidak ada skema, migrasi, atau klien ORM yang dipakai. Direktori `supabase/` ada tetapi tidak dipakai |
| **Tanpa autentikasi pengguna** | Tidak ada login, sesi, JWT, atau peran pengguna. Aplikasi sepenuhnya publik. Panel admin `/admin/ai-toggle` dilindungi **kunci bersama** melalui header `x-admin-key` (`AI_ADMIN_KEY`), bukan sistem akun |
| **Tanpa DTSEN** | Tidak ada data DTSEN/BAPPEDA. Berkas mentah DTSEN dikecualikan di `.gitignore` (`data/dtsen-raw/`) atas dasar UU PDP |
| **Tanpa warehouse / EWS** | Tidak ada gudang data, tabel fakta, atau sistem peringatan dini. Berkas mati terkait telah dihapus (`prisma.ts`, `auth.ts`, `splp-bridge.ts`, `data-source.ts`, `audit-log.ts`, `EwsPanel`, `BreakdownExplorer`, `TrendChart`) |
| **Tanpa cron / penjadwal** | `vercel.json` tidak memuat satu pun entri `crons`. Penyegaran data bergantung pada ISR `revalidate 600` dan pemanggilan `POST /api/revalidate` secara manual |
| **Tanpa pencarian vektor / embedding** | Pencarian memakai pencocokan kata utuh, stemming ringan, dan daftar sinonim di kode |

### Sisa yang diketahui (known drift, bukan cacat fungsi)

- Dependensi menganggur **sudah dibuang pada versi 0.1.0** (19 Sep 2026): `prisma`,
  `@prisma/client`, `bcryptjs`, `jose`, `next-auth`, `nanoid`, `uuid`, `date-fns`,
  beserta `postinstall prisma generate`. Sebelumnya delapan paket itu ada di
  `package.json` tanpa satu pun pengimpor di kode. Verifikasi pasca-penghapusan:
  pemeriksaan tipe bersih, 169 pengujian lulus, build berhasil.
- Fungsi `getSapaAccessToken()` masih ada di `src/lib/sapa-client.ts` untuk jalur
  OAuth SAPA, tetapi **tidak dipanggil** oleh `fetchSapaData()`. Komentar di
  `.env.example` menyatakan jalur OAuth belum dipakai saat ini.
- `docs/VERCEL_ENV.md` di dalam repositori ini isinya masih bertema proyek lain
  (menyebut `DATABASE_URL`, Supabase, `JWT_SECRET`). **Jangan dipakai sebagai acuan
  konfigurasi sapa-ai.** (perlu dikonfirmasi apakah berkas ini memang tertinggal.)

---

## 12. Cache dan Kesegaran Data

| Lapisan | Masa berlaku | Sifat |
|---|---|---|
| LRU `splpCache` di `sapa-client.ts` | 10 menit | Per-instance fungsi (memori proses) |
| `unstable_cache` untuk `kpi`, `stats`, `report`, `sapa-analytics` | 600 detik | Terdistribusi, bertag |
| ISR halaman `/dashboard`, `/dashboard/analytics` | 600 detik | Tanggapan statis yang diperbarui berkala |
| Cache jawaban AI (`ai:v1:<hash>:<jumlah record>`) | 15 menit | Per-instance lewat `src/lib/store.ts` |
| Cache drill-down OPD | 10 menit | Per-instance, satu entri per nama OPD |

Pembatalan cache dilakukan dengan:

```bash
curl -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H 'Content-Type: application/json' \
  -d '{"tag":"all"}'
```

Tag yang diizinkan: `sapa-analytics`, `kpi`, `stats`, `report`, atau `all`.
Pembatalan memakai `revalidateTag(tag, { expire: 0 })` supaya entri benar-benar
kedaluwarsa seketika, bukan sekadar ditandai basi.

---

## 13. Pengaman Operasional yang Ada di Kode

| Pengaman | Nilai | Berkas |
|---|---|---|
| Batas harian panggilan model | `AI_DAILY_CALL_LIMIT`, bawaan 2000 (0 = tanpa batas) | `src/lib/ai/env.ts` |
| Anggaran waktu model | `AI_TIMEOUT_MS`, bawaan 48 000 ms | `src/lib/ai/env.ts` |
| Watchdog sambungan mandek (jalur stream) | `AI_FIRST_TOKEN_MS`, bawaan 15 000 ms | `src/lib/ai/llm-client.ts` |
| Anggaran token keluaran | `AI_MAX_OUTPUT_TOKENS`, bawaan 3000 | `src/lib/ai/env.ts` |
| Jeda retry throttle | `AI_RETRY_BACKOFF_MS`, bawaan 10 000 ms | `src/lib/ai/llm-client.ts` |
| Rate limit di route `/api/query` | 30 permintaan / 60 detik per IP | `src/app/api/query/route.ts` |
| Rate limit di dalam `composeAnswer` | 30 / menit dan 300 / jam per IP | `src/services/answer-compose.ts` |
| Pagar NIK & permintaan data per-orang | Berlaku di semua mode | `src/lib/ai/guard.ts` |

Prinsip kegagalan: **kegagalan model tidak pernah menjadi galat bagi pengguna.**
Selama jawaban deterministik masih diizinkan, pengguna menerima jawaban template yang
dihitung dari data SPLP.

---

## 14. Keadaan Sistem Saat Dokumen Ini Ditulis (19 Sep 2026)

Hasil pembacaan produksi `https://sapa-smart-ai.vercel.app`:

```json
{
  "sapa": { "state": "active", "records": 2065 },
  "ai": {
    "state": "inactive",
    "provider": "opencode-go",
    "model": "deepseek-v4.1-flash",
    "reason": "AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses",
    "dailyUsed": 8,
    "toggles": {
      "aiEnabled": false,
      "detEnabled": false,
      "backend": "redis",
      "updatedAt": "2026-09-19T06:52:09.977Z"
    }
  }
}
```

Keterangan:

- Halaman dashboard, analytics, GIS, laporan, dan status **tetap dilayani normal**
  (semuanya membalas 200).
- Kedua sakelar **sengaja dimatikan** oleh admin. Alasan operasional: perpanjangan
  langganan penyedia model (OpenCode Go) sedang mandek, sehingga biaya pemanggilan
  model dihindari.
- Akibatnya `POST /api/query` membalas **503** dengan
  `stage: "service-unavailable"`. Ini **keadaan yang disengaja, bukan kerusakan**.
- Model terakhir yang dipakai: `deepseek-v4.1-flash`.
- Backend state sakelar: `redis` — artinya Upstash terkonfigurasi dan sakelar
  berlaku lintas-instance.

Untuk menghidupkan kembali layanan ketika langganan penyedia sudah tersedia: aktifkan
sekurang-kurangnya satu sakelar di `https://sapa-smart-ai.vercel.app/admin/ai-toggle`
dengan mengisi "Admin Key" (`AI_ADMIN_KEY`). Prosedur lengkap ada di
`03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md` dan `06-DOKUMENTASI-API.md`.

---

## 15. Hal yang Perlu Dikonfirmasi

1. Apakah `docs/VERCEL_ENV.md` memang berkas tertinggal dari proyek lain, atau
   seharusnya berisi konfigurasi sapa-ai. (Saat ini isinya menyesatkan.)
2. Apakah `REVALIDATE_SECRET` memang sengaja tidak diisi di produksi. Pengujian
   19 Sep 2026 menunjukkan `POST /api/revalidate` berhasil tanpa kunci apa pun
   (membalas 200). Lihat catatan keamanan di `06-DOKUMENTASI-API.md` bagian akhir.
3. Apakah ada domain kustom yang terpasang selain `sapa-smart-ai.vercel.app`.
   Pengujian hanya membuktikan domain Vercel tersebut melayani aplikasi.
4. Rencana jangka panjang penyedia model AI (bergantung pada status langganan
   OpenCode Go).
