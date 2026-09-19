# 03 — Panduan Instalasi dan Deployment

> Dokumen serah terima teknis. Setiap langkah disertai **hasil yang diharapkan**.
> Semua fakta diverifikasi langsung dari repositori `Niumination/sapa-ai` (branch `main`)
> dan dari pengujian read-only terhadap produksi `https://sapa-smart-ai.vercel.app`
> pada 19 September 2026. Hal yang tidak dapat dipastikan ditandai `(perlu dikonfirmasi)`.
>
> Dokumen ini **tidak memuat rahasia apa pun**. Semua nilai rahasia (API key, token,
> kunci admin) hanya diisi di tempat yang aman: berkas `.env.local` yang di-`gitignore`
> pada mesin lokal, atau Environment Variables di Vercel Dashboard.

---

## 1. Prasyarat

### 1.1 Versi Node.js

| Sumber | Isi |
|---|---|
| `.nvmrc` | `22` |
| `package.json` → `engines.node` | `>=20` |
| `.github/workflows/ci.yml` | Memakai `node-version-file: .nvmrc`, sehingga CI berjalan di Node 22 |

**Kesimpulan:** gunakan **Node.js 22** (varian LTS) agar identik dengan lingkungan
integrasi berkelanjutan dan produksi. Node 20 masih memenuhi `engines`, tetapi tidak
identik dengan CI.

### 1.2 Perangkat lain

| Kebutuhan | Keterangan |
|---|---|
| npm | Proyek memakai `package-lock.json`, sehingga `npm ci` dapat dipakai |
| git | Akses ke `github.com/Niumination/sapa-ai` (repositori privat, perlu hak akses) |
| Akun Vercel | Diperlukan hanya untuk men-deploy |
| Vercel CLI (`npm i -g vercel`) | Opsional, untuk deploy dan diagnosis dari terminal |
| Akses jaringan ke `api-splp.layanan.go.id` | Wajib; tanpa ini aplikasi tidak punya data |

### 1.3 Verifikasi prasyarat

```bash
node -v
```

**Hasil yang diharapkan:** `v22.x.x`

```bash
npm -v
```

**Hasil yang diharapkan:** nomor versi npm (bawaan Node 22 adalah npm 10.x).

---

## 2. Instalasi Lokal

### 2.1 Ambil kode

```bash
git clone git@github.com:Niumination/sapa-ai.git
cd sapa-ai
```

**Hasil yang diharapkan:** direktori `sapa-ai/` berisi `package.json`, `vercel.json`,
`src/`, `docs/`.

Bila akses SSH belum siap, gunakan HTTPS:

```bash
git clone https://github.com/Niumination/sapa-ai.git
```

### 2.2 Pasang dependensi

```bash
npm ci
```

Bila `npm ci` gagal karena ketidakcocokan lockfile, gunakan:

```bash
npm install
```

**Hasil yang diharapkan:** direktori `node_modules/` terbentuk, proses selesai tanpa
pesan `ERR!`. Skrip `prepare` akan menjalankan
`git config core.hooksPath .githooks`, sehingga git hook pra-commit repositori ini aktif.

### 2.3 Tidak ada langkah basis data

Tidak ada migrasi, tidak ada seed, tidak ada penyiapan basis data. Aplikasi berjalan
penuh tanpa basis data. Langkah ini **sengaja kosong** — bila ada panduan lama yang
meminta membuat database, panduan itu sudah tidak berlaku.

---

## 3. Variabel Lingkungan

Berkas acuan: `.env.example`. Berkas itu ter-commit ke repositori (`.gitignore`
memuat pengecualian `!.env.example`) dan seluruh barisnya **dikomentari**. Isinya
adalah dokumentasi, bukan anjuran untuk diisi.

Jumlah variabel di `.env.example`: **18**.

### 3.1 Ringkasan wajib/opsional

| Kebutuhan | Variabel yang harus diisi |
|---|---|
| Aplikasi berjalan (mode deterministik penuh) | **Tidak ada.** Tanpa satu pun env, aplikasi tetap melayani halaman dan menjawab dari data SPLP |
| AI menjawab pengguna | `AI_API_KEY`, `AI_ENABLED=true`, dan `AI_MODEL` (atau andalkan default per-provider). `AI_PROVIDER` bila bukan bawaan |
| Mengukur model tanpa menampilkan ke pengguna | `AI_SHADOW=true` (dan `AI_ENABLED` tetap `false`) |
| Sakelar admin berlaku global (lintas-instance) | `AI_ADMIN_KEY` + `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| `/api/revalidate` tidak terbuka untuk umum | `REVALIDATE_SECRET` |

### 3.2 Daftar lengkap 18 variabel

#### Sumber data

| Variabel | Fungsi | Wajib? | Bawaan bila kosong |
|---|---|---|---|
| `SAPA_CLIENT_ID` | ID klien untuk jalur OAuth SAPA | **Tidak** | Kode memakai `'3'` bila kosong |
| `SAPA_CLIENT_SECRET` | Rahasia klien untuk jalur OAuth SAPA | **Tidak** | — |

Catatan penting: `fetchSapaData()` mengambil endpoint publik
`/sapa/1.0/api/daftar_data` **tanpa kredensial**. Fungsi `getSapaAccessToken()` ada di
kode tetapi tidak dipanggil. Komentar `.env.example` menyatakan: "Nilai di bawah hanya
dipakai bila kelak diperlukan jalur OAuth — saat ini tidak ada kode yang memanggilnya."

#### Model AI

| Variabel | Fungsi | Wajib? | Bawaan bila kosong |
|---|---|---|---|
| `AI_ENABLED` | `true` = narasi AI dikirim ke pengguna | Wajib bila ingin AI aktif | `false` (mode deterministik) |
| `AI_SHADOW` | `true` = model dipanggil untuk evaluasi, pengguna tetap menerima jawaban deterministik | Tidak | `false` |
| `AI_PROVIDER` | Pilihan penyedia: `opencode-go`, `gemini`, atau `custom` | Tidak | `opencode-go` |
| `AI_BASE_URL` | Alamat dasar API penyedia | Tidak | Bawaan penyedia: `opencode-go` → `https://opencode.ai/zen/go/v1`; `gemini` → `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_ENDPOINT_PATH` | Jalur endpoint pada `AI_BASE_URL` | Tidak | `/chat/completions` |
| `AI_MODEL` | Nama model | **Ya, bila penyedia bukan `opencode-go`** | Untuk `opencode-go` kode memakai `deepseek-v4.1-flash`; untuk penyedia lain default kosong sehingga AI dianggap belum siap |
| `AI_API_KEY` | Kunci API penyedia | **Ya, bila AI diaktifkan** | Tanpa kunci, `isAiConfigured()` bernilai salah dan AI tidak dipanggil |
| `AI_TIMEOUT_MS` | Batas satu panggilan model (ms) | Tidak | `48000` |
| `AI_MAX_OUTPUT_TOKENS` | Batas token keluaran model | Tidak | `3000` |
| `AI_TEMPERATURE` | Suhu sampling | Tidak | `0.2` |
| `AI_JSON_MODE` | Meminta keluaran JSON (`response_format`) | Tidak | `true` |
| `AI_DAILY_CALL_LIMIT` | Batas panggilan model per hari (pengaman biaya); `0` = tanpa batas | Tidak | `2000` |

Catatan: nilai `AI_MODEL` **wajib diisi eksplisit** bagi penyedia selain
`opencode-go`. Komentar di `src/lib/ai/env.ts` menyatakan kode tidak pernah memilihkan
model secara diam-diam, kecuali default per-penyedia yang disebut di atas.

Model OpenCode Go yang tidak memakai `/chat/completions` (misalnya keluarga
`minimax-`, `qwen3.x-max/plus`, `grok-`) ditolak dengan alasan jelas dan otomatis jatuh
ke jawaban deterministik.

#### Lainnya

| Variabel | Fungsi | Wajib? | Bawaan bila kosong |
|---|---|---|---|
| `REVALIDATE_SECRET` | Kunci untuk `POST /api/revalidate` | **Disarankan di produksi** (komentar `.env.example`: "Wajib diisi di produksi: kalau kosong, `/api/revalidate` bisa dipanggil siapa saja") | Kosong = endpoint tidak memeriksa kunci apa pun |
| `UPSTASH_REDIS_REST_URL` | Alamat REST Upstash Redis | Tidak | Jatuh ke memori proses |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST Upstash Redis | Tidak | Jatuh ke memori proses |
| `AI_ADMIN_KEY` | Kunci panel admin `/admin/ai-toggle` | **Ya, bila panel admin ingin dipakai** | Kosong = endpoint toggle **selalu** membalas 401 |

Catatan: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` **wajib bila memakai
sakelar admin**. Tanpanya, state sakelar hanya hidup per-instance fungsi serverless,
sehingga panel admin dapat tampak tidak berefek. Panel admin menampilkan backend yang
sedang dipakai (`Redis (global)` atau `Memori (per-instance)`) dan memberi peringatan
bila backend memori.

### 3.3 Variabel tambahan yang dibaca kode (tidak ada di `.env.example`)

Variabel berikut ditemukan dipakai di `src/` tetapi tidak didokumentasikan di
`.env.example`. Semuanya opsional dan hanya untuk penyetelan lanjutan:

| Variabel | Dipakai di | Fungsi |
|---|---|---|
| `AI_FIRST_TOKEN_MS` | `src/lib/ai/llm-client.ts` | Batas "tidak ada data" pada jalur stream; bawaan `15000` ms |
| `AI_RETRY_BACKOFF_MS` | `src/lib/ai/llm-client.ts` | Jeda retry saat throttle (403/429); bawaan `10000` ms |
| `AI_CUSTOM_HEADERS` | `src/lib/ai/llm-client.ts` | Header tambahan dalam bentuk JSON |
| `NEXT_PUBLIC_AI_EXECUTIVE_UI` | `src/components/AIResponseRenderer.tsx` | Bila bernilai `false`, tampilan eksekutif dinonaktifkan (jalur rollback UI) |

### 3.4 Mengisi variabel di lingkungan lokal

Buat berkas `.env.local` di akar proyek (berkas ini di-`gitignore`):

```bash
printf '%s\n' \
  'AI_ENABLED=false' \
  'AI_SHADOW=false' \
  > .env.local
```

**Hasil yang diharapkan:** berkas `.env.local` terbentuk. Konfigurasi di atas adalah
keadaan deterministik penuh: tidak ada panggilan model, tidak ada biaya.

Untuk menguji AI secara lokal tanpa biaya, jalankan penyedia tiruan yang sudah
disediakan repositori (lihat `docs/AI_MODE_SHADOW.md`):

```bash
node scripts/mock-llm-server.mjs
```

**Hasil yang diharapkan:** proses berjalan sebagai penyedia LLM tiruan; biarkan
terminal ini terbuka.

### 3.5 Mengisi variabel di produksi (Vercel)

1. Buka Vercel Dashboard → proyek **sapa-ai** → **Settings** → **Environment Variables**.
2. Tambahkan variabel yang dibutuhkan (misalnya `AI_ENABLED`, `AI_API_KEY`,
   `AI_MODEL`, `AI_PROVIDER`, `REVALIDATE_SECRET`, `AI_ADMIN_KEY`, pasangan Upstash).
3. Pilih cakupan **Production** (dan **Preview** bila ingin sama).
4. Simpan, lalu lakukan **Redeploy** agar nilai baru terbaca. Fungsi membaca env saat
   permintaan masuk, tetapi redeploy memastikan konfigurasi diterapkan seragam.

**Hasil yang diharapkan:** setelah redeploy, `GET /api/status` menampilkan `ai.reason`
yang sesuai dengan konfigurasi baru (atau `null` bila AI siap).

Rahasia **tidak boleh** ditulis ke berkas yang ter-commit. `.gitignore` memuat `.env`,
`.env*`, dan hanya mengecualikan `.env.example`.

---

## 4. Menjalankan Lokal

### 4.1 Mode pengembangan

```bash
npm run dev
```

**Hasil yang diharapkan:** pesan Next.js siap pada `http://localhost:3000`.
Buka `http://localhost:3000` — akan dialihkan ke `/dashboard`.

### 4.2 Mode produksi lokal (meniru produksi)

```bash
npm run build
npm run start -- -p 3104
```

**Hasil yang diharapkan:** pada langkah `build`, keluaran berakhir dengan
`✓ Compiled successfully` dan daftar rute. Pada langkah `start`, server siap pada
`http://localhost:3104`.

### 4.3 Pemeriksaan wajib sebelum commit

Aturan repositori: `npm run build && npx vitest run` wajib hijau sebelum commit.

```bash
npm run typecheck
```

**Hasil yang diharapkan:** keluaran berakhir dengan `[typecheck] OK`.
Skrip ini menjalankan `bash scripts/typecheck.sh`, yang lebih dahulu menghapus
`.next/types` dan `.next/dev/types`, lalu menjalankan `npx tsc --noEmit`.

```bash
npx vitest run
```

**Hasil yang diharapkan:** seluruh pengujian lulus. Jumlah terverifikasi pada
19 September 2026: **17 berkas uji, 169 test, semuanya lulus**.

```bash
npm run build
```

**Hasil yang diharapkan:** `✓ Compiled successfully`. Konfigurasi `next.config.ts`
sengaja membiarkan pemeriksaan TypeScript aktif, sehingga build Vercel **gagal** bila
ada error TypeScript.

### 4.4 Uji fungsional lokal

```bash
curl -s http://127.0.0.1:3104/api/status
```

**Hasil yang diharapkan:** JSON dengan `sapa.state` bernilai `"active"` dan
`sapa.records` berupa angka (hasil observasi produksi: `2065`).
Bila `sapa.state` bernilai `"down"`, berarti mesin tidak dapat menjangkau
`api-splp.layanan.go.id`.

```bash
curl -s -X POST http://127.0.0.1:3104/api/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"jumlah penduduk"}'
```

**Hasil yang diharapkan (sakelar deterministik aktif):** JSON jawaban dengan kode 200.
**Hasil yang diharapkan (kedua sakelar mati):** `{"error":"...","stage":"service-unavailable"}` dengan kode 503.

### 4.5 Uji evaluasi (opsional)

Repositori menyediakan harness evaluasi 78 butir dengan pembanding baseline:

```bash
SAPA_EVAL_URL=http://127.0.0.1:3104 npm run eval
```

**Hasil yang diharapkan:** ringkasan lulus/gagal per item, dibandingkan dengan
`data/eval-baseline.json`. Keluar dengan kode 0 bila tidak ada regresi dan tidak ada
pelanggaran invarians; kode 1 bila ada.

Untuk mengukur model sungguhan dalam mode shadow, beri jeda antar-item agar gateway
tidak men-throttle (tercatat di `docs/AI_MODE_SHADOW.md`):

```bash
SAPA_EVAL_LLM_GAP_MS=15000 SAPA_EVAL_URL=http://127.0.0.1:3104 npm run eval
```

---

## 5. Build

```bash
npm run build
```

Perintah di balik layar: `next build`.

Fakta penting dari repositori:

- `next.config.ts` tidak menonaktifkan pemeriksaan tipe. Build gagal bila ada error
  TypeScript.
- Tidak ada langkah pasca-build khusus. `package.json` **tidak** memuat
  `postinstall prisma generate`, sehingga tidak ada pembuatan klien basis data.

**Hasil yang diharapkan:** direktori `.next/` terisi, keluaran berakhir dengan
`✓ Compiled successfully`.

---

## 6. Deployment ke Vercel

### 6.1 Konfigurasi deployment di repositori

Berkas `vercel.json` seluruhnya berisi:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "functions": {
    "src/app/api/query/route.ts": { "maxDuration": 60 },
    "src/app/api/query/stream/route.ts": { "maxDuration": 60 }
  }
}
```

Arti setiap butir:

| Butir | Arti |
|---|---|
| `"regions": ["sin1"]` | Seluruh fungsi dijalankan di region **Singapura**. Ini penting: sumber data (SPLP, Indonesia) dan pengguna (Aceh) jauh lebih dekat ke Singapura daripada ke region bawaan Vercel (Washington DC). Dokumentasi repositori mencatat bahwa pemindahan ke `sin1` menurunkan latensi jawaban dari 38,7–41,9 detik menjadi 15,6–29,9 detik |
| `functions[...].maxDuration: 60` | Batas 60 detik untuk `/api/query` dan `/api/query/stream`. Nilai 60 aman di paket Hobby (batas maksimum 300) |
| Tidak ada `crons` | **Sengaja.** Penyegaran data lewat ISR `revalidate 600` dan `POST /api/revalidate`, bukan penjadwal |

### 6.2 Cara A — melalui integrasi Git (cara biasa)

1. Pastikan kode sudah ada di branch `main` repositori `Niumination/sapa-ai`.
2. Vercel membangun otomatis setiap push ke `main`.
3. Pantau proses di Vercel Dashboard → proyek **sapa-ai** → **Deployments**.

**Hasil yang diharapkan:** muncul entri deployment baru dengan status `Ready`, dan
commit hash-nya sama dengan commit yang baru di-push.

Catatan: proyek Vercel terhubung ke `main`. CI GitHub
(`.github/workflows/ci.yml`) menjalankan dua job: **fondasi** (typecheck, test, build —
wajib) dan **eval** (78 item terhadap SPLP hidup — sengaja `continue-on-error`, karena
bergantung pada API eksternal).

### 6.3 Cara B — melalui Vercel CLI

```bash
npm i -g vercel
vercel link
vercel --prod --yes
```

**Hasil yang diharapkan (Cara B):** perintah `vercel --prod --yes` mencetak URL
deployment. Namun **deploy CLI tidak otomatis mengambil alih domain produksi**. Karena
itu, lanjutkan dengan:

```bash
vercel promote <URL_DEPLOYMENT>
```

**Hasil yang diharapkan:** domain `sapa-smart-ai.vercel.app` melayani deployment
tersebut.

### 6.4 Pelajaran deployment yang tercatat di `AGENTS.md`

Bagian ini bukan teori, melainkan catatan insiden yang sudah pernah terjadi pada
proyek ini. Berguna saat deployment tampak "tidak berefek".

1. **Periksa status platform lebih dulu, jangan menuduh kode.**

   ```bash
   curl -s https://www.vercel-status.com/api/v2/incidents/unresolved.json
   ```

2. **Deployment yang macet di status `INITIALIZING` menahan satu-satunya slot build
   paket Hobby.** Selama itu, push berikutnya tidak pernah dibangun. Bebaskan slot:

   ```bash
   vercel api -X PATCH "/v12/deployments/<ID_DEPLOYMENT>/cancel"
   ```

3. **Bila integrasi Git tidak membuat deployment sama sekali**, deploy dari direktori
   proyek: `vercel --prod --yes`.

4. **Verifikasi commit yang benar-benar melayani produksi**, jangan berasumsi
   "deployment terbaru = kode terbaru":

   ```bash
   vercel api "/v13/deployments/sapa-smart-ai.vercel.app"
   ```

   Periksa nilai `meta.githubCommitSha` pada keluaran.

### 6.5 Environment Variables di produksi

Lihat Bagian 3.5. Variabel produksi (`AI_*`, `REVALIDATE_SECRET`, `AI_ADMIN_KEY`,
pasangan Upstash) hanya diisi lewat Vercel Dashboard dan tidak pernah di-commit.

---

## 7. Pengaturan Domain

### 7.1 Keadaan domain saat ini

Domain produksi yang terverifikasi melayani aplikasi: **`https://sapa-smart-ai.vercel.app`**.
Apakah ada domain kustom lain yang terpasang: `(perlu dikonfirmasi)` — pengujian hanya
membuktikan domain Vercel tersebut.

### 7.2 Menambahkan domain kustom

1. Vercel Dashboard → proyek **sapa-ai** → **Settings** → **Domains**.
2. Klik **Add**, masukkan nama domain (misalnya `sapa.acehtengahkab.go.id`), lalu
   simpan.
3. Vercel akan menampilkan instruksi DNS. Untuk domain utama (apex) biasanya berupa
   record `A` ke `76.76.21.21`; untuk subdomain biasanya berupa record `CNAME` ke
   `cname.vercel-dns.com`. **Ikuti nilai yang ditampilkan Vercel saat itu**, karena
   nilai dapat berubah.
4. Tambahkan record tersebut pada pengelola DNS domain instansi.
5. Tunggu propagasi DNS dan status domain di Vercel berubah menjadi **Valid
   Configuration**. Sertifikat TLS diterbitkan otomatis oleh Vercel.

**Hasil yang diharapkan:** halaman domain baru membalas 200 dan dialihkan ke
`/dashboard`, sama seperti `sapa-smart-ai.vercel.app`.

Bila domain instansi harus memakai HTTPS sejak awal, pastikan pendaftaran domain pada
pengelola DNS instansi (Diskominfo) selesai sebelum DNS diarahkan.

### 7.3 Bila domain kustom dipasang

Setelah domain kustom aktif, ganti alamat pada seluruh perintah verifikasi dan
`SAPA_EVAL_URL` pada dokumen ini, dan konfirmasi ulang bahwa fungsi tetap berjalan di
region `sin1` (lihat Bagian 8.1).

---

## 8. Verifikasi Pasca-Deploy

Seluruh perintah di bawah dapat disalin langsung. Ganti `B` bila memakai domain lain.

### 8.1 Region fungsi harus `sin1`

```bash
B=https://sapa-smart-ai.vercel.app
curl -sI "$B/dashboard" | grep -i x-vercel-id
```

**Hasil yang diharapkan:** header berawalan `sin1::`, contoh nyata dari produksi:

```
x-vercel-id: sin1::z68dv-1789802842517-0e08c2a23291
```

Bila muncul `iad1::` pada bagian pertama, berarti fungsi berjalan di Washington DC dan
`vercel.json` belum diterapkan. Ini penyebab latensi tinggi yang paling sering
terjadi — periksa ini **sebelum** menuduh model AI lambat.

### 8.2 Halaman utama dialihkan ke dashboard

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "$B/"
```

**Hasil yang diharapkan:** `307 -> https://sapa-smart-ai.vercel.app/dashboard`

### 8.3 Status sistem

```bash
curl -s "$B/api/status"
```

**Hasil yang diharapkan:** JSON dengan bentuk berikut (nilai dapat berbeda sesuai
keadaan):

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
    },
    "metrics": {
      "deterministicToday": 0,
      "llmToday": 0,
      "ratio": { "deterministic": 0, "llm": 0 }
    }
  }
}
```

Yang harus diperiksa:

| Kolom | Nilai yang benar | Arti bila tidak sesuai |
|---|---|---|
| `sapa.state` | `"active"` | `"down"` berarti server tidak dapat menjangkau SPLP |
| `sapa.records` | Angka > 0 | `0` berarti tidak ada data terbaca |
| `ai.state` | `"active"`, `"shadow"`, atau `"inactive"` | `"inactive"` berarti AI tidak dikirim ke pengguna |
| `ai.toggles.backend` | `"redis"` | `"memory"` berarti `UPSTASH_REDIS_REST_URL`/`_TOKEN` belum diisi, sehingga sakelar admin tidak global |

Catatan operasional: `ai.state: "inactive"` **belum berarti rusak**. Bila
`ai.toggles.aiEnabled` dan `detEnabled` bernilai `false`, AI memang dimatikan oleh
admin melalui sakelar, dan sakelar menang atas variabel lingkungan.

### 8.4 Endpoint agregat

```bash
for p in kpi report sapa stats; do
  printf '%s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/$p")"
done
```

**Hasil yang diharapkan:**

```
kpi -> 200
report -> 200
sapa -> 200
stats -> 200
```

### 8.5 Jalur tanya-jawab

```bash
curl -s -w "\n[%{http_code}]\n" -X POST "$B/api/query" \
  -H 'Content-Type: application/json' \
  -d '{"query":"jumlah penduduk"}'
```

**Hasil yang diharapkan bila layanan aktif:**

```
{ "narasi": "...", "answer": "...", "source": "SAPA Aceh Tengah (api-splp.layanan.go.id)", "...": "..." }
[200]
```

**Hasil yang diharapkan bila kedua sakelar dimatikan:**

```
{"error":"AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban","stage":"service-unavailable"}
[503]
```

### 8.6 Aliran SSE

```bash
curl -s -N -m 30 -X POST "$B/api/query/stream" \
  -H 'Content-Type: application/json' \
  -d '{"query":"jumlah penduduk"}'
```

**Hasil yang diharapkan (kedua sakelar dimatikan)** — persis seperti yang terukur pada
produksi 19 Sep 2026:

```
event: status
data: {"status":"Mengambil data SAPA…"}

event: status
data: {"status":"Menganalisis pertanyaan…"}

event: error
data: {"error":"AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban","stage":"service-unavailable"}
```

### 8.7 Panel dan kunci admin

```bash
curl -s "$B/api/admin/status"
```

**Hasil yang diharapkan:** `{"aiEnabled":false,"detEnabled":false,"backend":"redis","updatedAt":"..."}`.

```bash
curl -s -w "\n[%{http_code}]\n" "$B/api/admin/toggle-ai"
```

**Hasil yang diharapkan:** `{"error":"unauthorized"}` dengan kode `401`, karena header
`x-admin-key` tidak dikirim. Ini tanda bahwa `AI_ADMIN_KEY` sudah terpasang.

### 8.8 Verifikasi PDF/UI manual

Buka di peramban: `https://sapa-smart-ai.vercel.app/dashboard`, `/dashboard/analytics`,
`/dashboard/gis`, `/dashboard/laporan`, `/dashboard/status`, dan `/admin/ai-toggle`.

**Hasil yang diharapkan:** seluruh halaman terbuka tanpa galat JavaScript, dan panel
admin menampilkan keadaan sakelar beserta backend penyimpanan.

### 8.9 Mengaktifkan kembali layanan (bila sedang dimatikan admin)

Halaman: `https://sapa-smart-ai.vercel.app/admin/ai-toggle`

1. Isi kolom **Admin Key** dengan nilai `AI_ADMIN_KEY`.
2. Klik **Aktifkan AI** atau **Aktifkan Deterministik** sesuai kebutuhan.
3. Panel menampilkan pesan hasil, lalu membaca ulang state dari server untuk membuktikan
   perubahan benar-benar tersimpan.

**Hasil yang diharapkan:** `GET /api/status` menunjukkan `ai.toggles` yang berubah, dan
`POST /api/query` kembali membalas 200. Bila panel menampilkan backend `Memori
(per-instance)`, perubahan dapat tampak tidak konsisten antar permintaan — isi
`UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.

Atau melalui API langsung:

```bash
curl -s -X POST "$B/api/admin/toggle-ai" \
  -H 'Content-Type: application/json' \
  -H 'x-admin-key: <AI_ADMIN_KEY>' \
  -d '{"aiEnabled":false,"detEnabled":true}'
```

**Hasil yang diharapkan:** JSON state sakelar yang baru beserta `backend`.

---

## 9. Pemecahan Masalah Singkat

| Gejala | Pemeriksaan pertama | Tindakan |
|---|---|---|
| Jawaban sangat lambat | `curl -sI "$B/dashboard" \| grep x-vercel-id` | Pastikan berawalan `sin1::`. Bila `iad1::`, `vercel.json` belum diterapkan |
| `/api/query` membalas 503 dengan `stage: service-unavailable` | `curl -s "$B/api/admin/status"` | Sakelar admin dimatikan. Nyalakan lewat panel atau API (Bagian 8.9) |
| `/api/query` membalas 503 dengan `stage: splp` | `curl -s "$B/api/status"` lihat `sapa.state` | SPLP tidak dapat dijangkau dari server. Bukan galat aplikasi |
| Panel admin tampak tidak berefek | `curl -s "$B/api/admin/status"` lihat `backend` | Bila `memory`, isi `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| `/api/admin/toggle-ai` selalu 401 | Pastikan `AI_ADMIN_KEY` terisi di Vercel | Kosong = endpoint selalu 401 |
| Data terlihat basi (> 10 menit) | `curl -X POST "$B/api/revalidate" -H 'Content-Type: application/json' -d '{"tag":"all"}'` | Paksa pembatalan cache |
| Push tidak memicu build | Vercel Dashboard → Deployments | Cari deployment yang macet di `INITIALIZING`; batalkan (Bagian 6.4) |
| Build gagal karena TypeScript | `npm run typecheck` lokal | Perbaiki tipe; build Vercel memang tidak mengabaikan error tipe |

---

## 10. Catatan Keamanan yang Perlu Diketahui Operator

1. **`POST /api/revalidate` dapat dipanggil tanpa kunci pada produksi saat ini.**
   Pengujian 19 September 2026:

   ```bash
   curl -s -w "\n[%{http_code}]\n" -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
     -H 'Content-Type: application/json' -d '{"tag":"kpi"}'
   ```

   Hasil nyata: `{"status":"ok","revalidated":["kpi"]}` dengan kode **200**, tanpa
   mengirim kunci apa pun. Ini berarti `REVALIDATE_SECRET` belum diisi di produksi.
   Dampaknya terbatas (seseorang dapat memaksa penyegaran cache), tetapi sebaiknya
   diisi. Setelah diisi, endpoint mewajibkan header `x-revalidate-secret` atau field
   `secret` di badan permintaan, dan membalas 401 bila tidak cocok.
   Status ini `(perlu dikonfirmasi)` apakah memang disengaja.

2. **`GET /api/admin/status` bersifat publik** dan sengaja tidak membocorkan rahasia:
   hanya mengembalikan keadaan sakelar, backend penyimpanan, dan waktu pembaruan.

3. **`GET`/`POST /api/admin/toggle-ai` memerlukan `x-admin-key`.** Bila `AI_ADMIN_KEY`
   kosong, endpoint selalu membalas 401 sehingga panel tidak dapat dipakai sama sekali.

4. **Rate limit bersifat per-instance tanpa Redis.** Tanpa Upstash, batas berlaku
   dikalikan jumlah instance fungsi yang aktif.

5. **Jangan pernah menulis rahasia ke berkas yang ter-commit.** `.gitignore` memuat
   `.env`, `.env*`, dan hanya mengecualikan `.env.example`.
