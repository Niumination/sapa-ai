# Dokumentasi API

Seluruh layanan data SAPA Smart AI. Tidak ada autentikasi untuk endpoint publik;
dua endpoint pengelola dilindungi kunci pada header.

**Alamat produksi:** `https://sapa-smart-ai.vercel.app`

## Ketentuan umum

- Semua respons berformat **JSON** (kecuali endpoint aliran yang mengirim SSE).
- Bentuk galat: `{ "error": "<pesan yang bisa dibaca pengguna>", "stage": "<tahap>" }`.
  `stage` menandai asal masalah: `splp` (sumber data), `rate-limit`, atau
  `service-unavailable` (layanan tanya-jawab dinonaktifkan).
- Endpoint agregat di-cache 10 menit (`revalidate 600`). Endpoint tanya-jawab,
  status, dan revalidate selalu dihitung ulang.
- Batas laju berlaku pada endpoint tanya-jawab per alamat IP.

## Kode status yang mungkin muncul

| Kode | Arti | Yang harus dilakukan |
|---|---|---|
| 200 | Berhasil | — |
| 307 | Pengalihan halaman akar ke `/dashboard` | Ikuti pengalihan |
| 400 | Permintaan tidak sah: badan bukan JSON, pertanyaan kurang dari 3 karakter, atau parameter OPD tidak valid | Perbaiki permintaan |
| 401 | Kunci pengelola tidak cocok atau tidak dikirim | Kirim header `x-admin-key` yang benar |
| 404 | OPD tidak ditemukan pada data SAPA | Periksa ejaan nama OPD |
| 429 | Terlalu banyak permintaan dari satu alamat | Tunggu beberapa saat |
| 500 | Kegagalan tak terduga di sisi aplikasi | Laporkan beserta waktunya |
| 503 | Sumber data SAPA (SPLP) tidak dapat dijangkau, atau layanan tanya-jawab sedang dinonaktifkan admin | Lihat pesan `error`; periksa `/api/status` |

## 1. Tanya-jawab (JSON)

**`POST /api/query`**

| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `query` | string | ya | Pertanyaan bahasa Indonesia, minimal 3 karakter |

```bash
curl -s -X POST https://sapa-smart-ai.vercel.app/api/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"berapa jumlah fasilitas kesehatan"}' | head -c 400
```

Contoh respons ringkas (respons sebenarnya jauh lebih panjang):

```json
{
  "narasi": "Jumlah fasilitas pelayanan kesehatan ... tercatat sebanyak 26 Unit (2025). ...",
  "visualisasi": { "tipe": "table", "konfigurasi": { "columns": ["Indikator","Nilai","Satuan","OPD","Tahun"], "rows": [["...","27","unit","Dinas Kesehatan","-"]] } },
  "rekomendasi": ["..."],
  "followUps": ["Berapa jumlah puskesmas di Kabupaten Aceh Tengah?"],
  "evidence": [ { "opd": "Dinas Kesehatan", "indikator": "...", "nilai": "26", "satuan": "Unit", "tahun": "2025", "id": 71 } ],
  "count": 2065,
  "matched": 80,
  "dataSource": "SAPA Aceh Tengah (api-splp.layanan.go.id)",
  "timestamp": "2026-09-19T04:10:00.000Z",
  "ai": {
    "used": true, "shadow": false, "model": "deepseek-v4.1-flash",
    "provider": "opencode-go", "latencyMs": 3397, "grounded": "pass",
    "cached": false, "attempted": true, "unknownTokens": 0,
    "finishReason": "stop", "usage": { "promptTokens": 1518, "completionTokens": 421 }
  },
  "query": "berapa jumlah fasilitas kesehatan"
}
```

Arti beberapa bidang penting:

- `evidence` — data mentah yang menjadi dasar jawaban. Periksa daftar ini untuk memverifikasi angka.
- `ai.used` — `true` bila jawaban disusun model bahasa; `false` berarti jawaban deterministik.
- `ai.grounded` — `pass` berarti seluruh angka pada jawaban ada di `evidence`.
- `ai.limitedBy` — bila berisi `service-unavailable`, layanan tanya-jawab dinonaktifkan admin (kode 503).

**Galat yang khas**

```bash
# Pertanyaan terlalu pendek
curl -s -X POST https://sapa-smart-ai.vercel.app/api/query \
  -H 'Content-Type: application/json' -d '{"query":"a"}'
# → 400 {"error":"Query tidak valid (minimal 3 karakter)"}

# Layanan tanya-jawab dinonaktifkan admin (keadaan 19 Sep 2026)
# → 503 {"error":"AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban","stage":"service-unavailable"}

# Sumber data SAPA tidak dapat dijangkau
# → 503 {"error":"Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.","stage":"splp"}
```

## 2. Tanya-jawab mengalir (SSE)

**`POST /api/query/stream`** — parameter sama dengan `/api/query`.

Jawaban dikirim bertahap sehingga pengguna melihat narasi terbentuk. Urutan
peristiwanya:

```
event: status    → tahap pemrosesan (mis. pencarian data)
event: token     → potongan narasi, dikirim berkali-kali sampai selesai
event: result    → jawaban akhir lengkap (bentuk sama dengan /api/query)
atau
event: error     → {"error": "..."} bila gagal
```

```bash
curl -N -X POST https://sapa-smart-ai.vercel.app/api/query/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"berapa jumlah puskesmas"}'
```

Catatan penting bagi pengembang yang menulis klien:

1. Peristiwa `error` dikirim setelah sambungan terbuka, sehingga **kode status HTTP
   tetap 200**. Klien harus memeriksa `event: error`, bukan hanya kode status.
2. Bila `event: error` diterima setelah sebagian token terkirim, buang narasi yang
   sudah tampil — jawaban akhir hanya sah bila datang lewat `event: result`.
3. Antarmuka dashboard memakai batas tunggu 55 detik untuk sambungan ini.

## 3. Agregat dashboard

Semua endpoint di bawah ini hanya membaca (GET), tanpa parameter, dan di-cache 10 menit.

**`GET /api/kpi`** — indikator prioritas daerah.
```bash
curl -s https://sapa-smart-ai.vercel.app/api/kpi | head -c 200
# → {"status":"...","source":"...","kpis":[{...}]}
```

**`GET /api/stats`** — agregat ringan untuk dashboard.
```bash
# → {"overview":{...},"opds":[...],"topIndicators":[...],"dataByYear":[...],"kategoriDistribusi":[...],"sampleRecords":[...]}
```

**`GET /api/sapa`** — agregat lengkap untuk dashboard, analitik, dan GIS.
```bash
# → {"status":"...","source":"...","lastFetched":"...","overview":{...},"opdBreakdown":[...],
#    "completeness":{...},"indicatorFrequency":[...],"satuanDistribusi":[...]}
```

**`GET /api/report`** — bahan laporan eksekutif.
```bash
# → {"report":{...}}
```

Ketiganya membalas **500** bila terjadi kegagalan tak terduga saat menyusun agregat.

## 4. Rincian per OPD

**`GET /api/analytics/opd/{nama-opd}`** — `{nama-opd}` adalah nama OPD, disandikan URL.

```bash
curl -s "https://sapa-smart-ai.vercel.app/api/analytics/opd/Dinas%20Kesehatan" | head -c 200
```

```json
{ "nama": "Dinas Kesehatan", "totalRecords": 0, "uniqueIndicators": 0,
  "recordsWithoutYear": 0, "trends": [], "indicatorsWithoutTrend": [],
  "topIndicators": [], "origin": "splp" }
```

Nama OPD diambil dari `/api/sapa` bidang `opdBreakdown` (38 OPD pada 19 Sep 2026).
Pencocokan dilakukan **persis** (fallback tanpa membedakan huruf besar/kecil), sehingga
nama yang salah ejaan menghasilkan **404**:

```json
{ "error": "OPD \"Dinas Kesehatan dan KB\" tidak ditemukan di data SAPA" }
```

Parameter lebih dari 200 karakter atau kosong → **400**.

## 5. Status sistem

**`GET /api/status`** — tidak di-cache, selalu dihitung ulang. Ini endpoint pertama
yang diperiksa saat ada laporan gangguan.

```bash
curl -s https://sapa-smart-ai.vercel.app/api/status
```

```json
{
  "sapa": { "state": "active", "records": 2065 },
  "ai": {
    "state": "inactive",
    "model": "deepseek-v4.1-flash",
    "provider": "opencode-go",
    "reason": "AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses",
    "toggles": { "aiEnabled": false, "detEnabled": false, "backend": "redis", "updatedAt": "2026-09-19T06:52:09.977Z" },
    "metrics": { "deterministicToday": 0, "llmToday": 0, "ratio": { "deterministic": 0, "llm": 0 } }
  }
}
```

- `sapa.state` — `active` bila data terambil dari SPLP; `down` bila tidak.
- `ai.state` — `active` atau `inactive`. **`inactive` belum tentu kerusakan** —
  periksa `toggles` lebih dahulu.
- `toggles.backend` — `redis` berarti keadaan saklar tersimpan global dan konsisten
  lintas-instance; `memory` berarti hanya berlaku pada satu instance (saklar menjadi
  tidak andal).

## 6. Penyegaran cache

**`POST /api/revalidate`** — memaksa agregat dihitung ulang tanpa menunggu 10 menit.

| Parameter | Tipe | Keterangan |
|---|---|---|
| `tag` | string | Satu tag: `kpi`, `stats`, `report`, `sapa-analytics`, atau `all` (semua tag) |
| `tags` | string[] | Beberapa tag sekaligus |
| `secret` | string | Alternatif header `x-revalidate-secret` (kurang dianjurkan — lihat catatan) |

```bash
# Segarkan semua cache
curl -s -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H 'Content-Type: application/json' \
  -H 'x-revalidate-secret: <RAHASIA_REVALIDATE>' \
  -d '{"tag":"all"}'

# Segarkan satu tag saja
curl -s -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H 'Content-Type: application/json' \
  -H 'x-revalidate-secret: <RAHASIA_REVALIDATE>' \
  -d '{"tag":"kpi"}'

# → {"status":"revalidated","tags":["kpi","stats","report","sapa-analytics"]}
```

Bila variabel `REVALIDATE_SECRET` dipasang, kunci **wajib** dikirim lewat header
`x-revalidate-secret` atau bidang `secret` pada badan permintaan; keduanya salah →
**401 Unauthorized**.

Bila variabel itu **tidak dipasang**, pemeriksaan kunci dilewati seluruhnya sehingga
endpoint ini terbuka bagi siapa pun yang mengetahui alamatnya. Saat ini di produksi
variabel tersebut belum dipasang — permintaan tanpa kunci dijawab 400 hanya karena
tag belum diisi, bukan karena ditolak. **Memasang `REVALIDATE_SECRET` dianjurkan**,
dan hal ini dicatat sebagai risiko pada `07-KEAMANAN-DAN-DATA.md`.

Gunakan header, bukan bidang `secret` pada badan permintaan: badan permintaan lebih
berisiko tercatat pada log perantara. Tag yang tidak dikenal akan ditolak, dan
permintaan tanpa `tag`/`tags` juga ditolak dengan kode 400.

## 7. Endpoint pengelola

Keduanya memerlukan header **`x-admin-key`** yang nilainya sama dengan variabel
lingkungan `AI_ADMIN_KEY`. Bila variabel itu tidak dipasang, seluruh permintaan
ditolak (fail-closed).

**`GET /api/admin/status`** — keadaan kedua saklar.

```bash
curl -s https://sapa-smart-ai.vercel.app/api/admin/status
# → {"aiEnabled":true,"detEnabled":false,"backend":"redis","updatedAt":"2026-09-19T06:52:09.977Z"}
```

**`POST /api/admin/toggle-ai`** — mengubah kedua saklar sekaligus.

```bash
curl -s -X POST https://sapa-smart-ai.vercel.app/api/admin/toggle-ai \
  -H 'Content-Type: application/json' \
  -H 'x-admin-key: <KUNCI_ADMIN>' \
  -d '{"aiEnabled":true,"detEnabled":false}'

# → {"aiEnabled":true,"detEnabled":false,"updatedAt":"...","updatedBy":"admin","backend":"redis"}
# → 401 {"error":"unauthorized"} bila kunci salah atau tidak dikirim
```

Arti kombinasi saklar (berlaku untuk seluruh pengguna):

| AI | Deterministik | Akibat |
|---|---|---|
| aktif | aktif | Jawaban AI, dengan cadangan template bila model gagal |
| aktif | mati | Jawaban AI saja; bila model gagal muncul galat |
| mati | aktif | Jawaban template saja |
| mati | mati | Layanan tanya-jawab tidak dapat diakses (503) |

## 8. Sumber data di luar kendali aplikasi

Aplikasi mengambil data dari API SPLP pihak ketiga:

```
https://api-splp.layanan.go.id/sapa/1.0/api/daftar_data
```

Ketersediaan dan isinya di luar kendali Diskominfo. Bila endpoint ini berubah atau
tidak lagi dapat diakses, aplikasi akan membalas 503 dengan tahap `splp` untuk
seluruh endpoint data — dan `README.md` serta `03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md`
mencatat hal ini sebagai ketergantungan yang harus dipantau.
