# sapa-ai — SAPA Smart AI Aceh Tengah (SPLP-only, publik)

> **Next.js 16 + SPLP API langsung (tanpa DB, tanpa auth/login, tanpa DTSEN, tanpa warehouse)**
> **Path:** `services/sapa-ai/` · **Repo:** `Niumination/sapa-ai` (`main`)
> **Produksi:** https://sapa-smart-ai.vercel.app — AI `deepseek-v4.1-flash` (OpenCode Go) + jawaban deterministik, keduanya dikendalikan toggle admin (`/admin/ai-toggle`, state di Upstash Redis)
> **Status:** 🟢 Active — Perf RSC+ISR 10m (analytics/dashboard server-fetch, kpi/stats/report/sapa cache terdistribusi, revalidate endpoint)
> **Backlog priority:** P2 — rencana berikut: `docs/RENCANA-TAHAP-BERIKUTNYA.md`

## Arsitektur

```
SPLP API (api-splp.layanan.go.id/sapa) ──→ sapa-client.ts (fetch + LRU 10 mnt per-instance)
  ├── services/analytics-data.ts → unstable_cache 600s tags sapa-analytics (terdistribusi)
  ├── services/kpi-data.ts → unstable_cache 600s tags kpi
  ├── /api/query  → retrieval + intent + narasi AI (`answer-compose`: model → grounding/eject → fallback deterministik) (ƒ Dynamic)
  ├── /api/query/stream → SSE narasi AI (status → token → result/error)
  ├── /api/kpi    → KPI deterministik (○ 10m, revalidate 600)
  ├── /api/report → narasi "belum aktif" jujur (○ 10m)
  ├── /api/sapa   → agregat dashboard/gis/analytics (○ 10m)
  ├── /api/stats  → agregat ringan (○ 10m)
  ├── /api/revalidate → POST {tag|tags|all} → revalidateTag() (ƒ Dynamic, REVALIDATE_SECRET opsional)
  └── /api/status → status jujur SPLP (ƒ Dynamic, tidak di-cache)
```

Halaman: `/` (QueryBar chip SAPA-only) · `/dashboard` (RSC revalidate 600 → DashboardClient + KpiPanel initialData) ·
`/dashboard/analytics` (RSC revalidate 600 → AnalyticsClient → ChartsView ssr:false + OpdDrilldown lazy) · `/dashboard/gis` (leaflet, dynamic) ·
`/dashboard/laporan` (ExecutiveReport + riwayat localStorage) · `/dashboard/status` (gabungan konten akun) ·
`error.tsx` + `not-found.tsx` boundaries.

## Aturan repo ini

- **SAPA-only.** Tidak ada DTSEN, Bapokting, Excel, Prisma, JWT, login, cron, warehouse/EWS. File mati terkait
  sudah dihapus (`prisma.ts`, `auth.ts`, `splp-bridge.ts`, `data-source.ts`, `audit-log.ts`,
  `EwsPanel`, `BreakdownExplorer`, `TrendChart`). Jangan reintroduce tanpa diskusi.
- **SPLP mati → 503 graceful** (`{error ID, stage:'splp'}`), bukan 500. Dijaga `route.test.ts` (vitest 4/4, mock `fetchSapaData`).
- **Charts dynamic ssr:false** (`analytics/ChartsView` via `AnalyticsClient`, `dashboard` via `DashboardClient`) — recharts tidak masuk bundle awal analytics; `ChartsView` derivasi via `useMemo`, `OpdDrilldown` lazy.
  `KpiPanel` tanpa recharts, boleh RSC (`initialData`).
- **Cache 10m terdistribusi:** `sapa-client.ts` LRU per-instance 10 mnt + `unstable_cache` 600s (`sapa-analytics|kpi|stats|report`) terdistribusi (ISR `revalidate 600` untuk `/api/sapa|kpi|stats|report` & `/dashboard|/dashboard/analytics`). Bust via `POST /api/revalidate` (tag `all` atau spesifik). `/api/query|status|revalidate` & `/api/analytics/opd/[slug]` tetap `force-dynamic`.
- **localStorage hanya di client:** init `useState([])` + load di `useEffect` (laporan), atau event handler (dashboard).
- **Chip QueryBar wajib `matched>0`** terhadap SPLP sebelum merge (cek via `/api/query`).
- **Rollback UI eksekutif:** `NEXT_PUBLIC_AI_EXECUTIVE_UI=false`.
- **Deploy:** `vercel.json` hanya `maxDuration: 60` (aman di Hobby, maks 300) — tanpa cron, tanpa env wajib.
  `.env.example` ter-track & terdokumentasi penuh (17 var, semua opsional/komentar; pengecualian `!.env.example` di `.gitignore`). Env produksi (`AI_*`, `REVALIDATE_SECRET`) hanya via Vercel Dashboard, tidak pernah di-commit.
  (Upstash opsional → fallback memori).

## Perintah

```bash
npm run build && npx vitest run   # wajib hijau sebelum commit
npm run start -- -p 3104          # serve lokal (setelah build)
```

## Known drift (follow-up, bukan blokir)

- `package.json` kini bernama `sapa-ai`; deps `prisma/bcryptjs/jose/next-auth` + `postinstall prisma generate`
  masih menganggur (tak ada importer). Prune = task terpisah (butuh `npm install` ulang).
- `rekons.md` (untracked, scratch lama) belum dibuang — di luar scope task ini.
- `.agents/skills/` autoskills v0.3.6 (20 skill generik, 1.4M); 3 duplikat bank pusat
  (frontend-design, accessibility, seo) — drop bila single-home ditegakkan.

## Riwayat sesi 2026-09-03 (ringkas)

Chip SAPA-only 10 chip terverifikasi → LRU SPLP 10 mnt + error boundary → label stunting hanya bila
evidence stunting → smoke test + 503 SPLP → cron mati + `.env.example` minimal + dead code −284 baris →
header DOX diluruskan → push SSH pulih (rotasi ed25519) → recharts dynamic + hapus 5 file mati →
perf audit (recharts memo/lazy) → RSC analytics/dashboard (server-fetch 600s) → ISR 10m kpi/stats/report/sapa + revalidate endpoint → merge ke main (af93476).

## Riwayat sesi 2026-09-05 (ringkas)

Integrasi arena.ai dev-2 di branch `integrasi-arena-ai` (3 patch `git am` bersih, tree identik `df21ab4`) → verifikasi hijau (typecheck, 145 test, build) → push branch → merge FF ke main → eval deterministik 74/78 regresi 0 → shadow `glm-5.3` OpenCode Go: throttle 403/1010 + budget reasoning → perbaiki (retry 403 + backoff 10 dtk, log `[ai-error]`, flag `ai.attempted`, metrik gagal jujur, `SAPA_EVAL_LLM_GAP_MS`, default budget 800→3000, test retry 5 butir, 150/150) → gerbang model-sungguhan **lolos** (47/52 = 90,4% pass, 5 replaced = 9,6%, 0 fail; jaring tangkap `tahun halu: 2020/1990`) → restu Disdukcapil/Dinsos AMAN → aktivasi produksi `AI_ENABLED=true` + `glm-5.3`.

## Riwayat sesi 2026-09-06 (ringkas)

Default budget 800→1600→**3000** (titik manis terukur 6/6, ~12 dtk) → docs sinkron-penuh (README, AGENTS, AI_MODE_SHADOW, VERCEL_ENV benar, `docs/RENCANA-TAHAP-BERIKUTNYA.md` baru) → proyek Vercel `sapa-ai` (`sapa-smart-ai.vercel.app`), env AI + `REVALIDATE_SECRET` → push `main`, redeploy → `/api/status` produksi `ai: active, glm-5.3` + smoke query grounded. Wart terbuka: duplikasi satuan narasi AI (Tahap A1). Kuota: `glm-5.3` boros ($1,99/$3 per 5 jam) — kandidat `deepseek-v4-flash`, ganti hanya atas perintah eksplisit.

## Riwayat sesi 2026-09-19 (ringkas)

Toggle admin AI/Deterministik lahir di sesi ini dan tiga kali salah diperbaiki sebelum benar — pelajaran utamanya bukan kodenya, tapi urutan pembuktiannya.

**Toggle admin (`/admin/ai-toggle`).** Panel on/off untuk AI dan jawaban deterministik, auth `AI_ADMIN_KEY` (header `x-admin-key`), state global.

- **Salah 1:** state disimpan di `/tmp/sapa-ai-toggle.json`. Di Vercel `/tmp` itu per-instance dan mati saat idle, jadi instance yang melayani `/api/query` tidak menemukan berkas dan jatuh ke default ON. Gejalanya menipu: panel melaporkan OFF, jawaban tetap keluar. Pindah ke `@/lib/store` (Upstash Redis; fallback memori). **Tanpa Upstash, toggle TIDAK bisa global** — panel kini menampilkan backend dan memperingatkan bila `memory`.
- **Salah 2:** pagar "deterministik OFF" dipasang di pintu masuk `composeAnswer`, sehingga mematikan SELURUH layanan — AI yang sebenarnya mampu menjawab ikut dibungkam. **Semantik yang benar (dikoreksi pemilik): deterministik = JAWABAN TEMPLATE.** Mematikannya melarang balasan template, bukan mematikan layanan. Pagar harus di `selesai()` — satu-satunya funnel tempat jawaban template keluar — plus jalur shadow yang juga mengirim template. Jalur cache dan jalur sukses LLM memakai `selengkap()` dan memang TIDAK boleh terpagar.
- **Salah 3:** timeout panggilan model diulang. `callLlmText` me-retry apa pun yang bukan `LlmError`, termasuk timeout — menggandakan waktu tunggu tanpa menambah peluang berhasil (terukur 42,6 dtk untuk jawaban yang sudah pasti gagal). Timeout/pembatalan kini tidak diulang; hanya 403/429/5xx.

**Anggaran waktu (terukur 2026-09-19).** `AI_TIMEOUT_MS` default 20 dtk terlalu ketat: jawaban sukses terukur 33,5 dtk, banyak query menembus 20 dtk lalu gagal. Anggaran lama "20+10+20 < 60" hanya berlaku karena timeout di-retry — begitu retry dimatikan, batas per percobaan adalah batas atas. Default kini **48 dtk**; klien dashboard 45→**55 dtk** (klien adalah jaring terakhir, bukan pertama: server 43-49 dtk < klien 55 dtk < platform 60 dtk), dan `vercel.json` menyertakan `maxDuration: 60` untuk `/api/query/stream` yang sebelumnya tidak punya entri.

**AKAR MASALAH LATENSI: fungsi berjalan di iad1 (AS), bukan sin1.** Header produksi `x-vercel-id: sin1::iad1::...` — Vercel menaruh fungsi di Washington DC secara default untuk proyek baru, sementara sumber data (SPLP, Indonesia) dan pengguna (Aceh) jauh dari sana. Setelah `"regions": ["sin1"]` di `vercel.json`, latensi turun dari 38,7-41,9 dtk menjadi 15,6-29,9 dtk. **Cek `x-vercel-id` lebih dulu sebelum menuduh model lambat** — `curl -sI <url> | grep x-vercel-id`.

**Yang diuji dan ditolak (jangan ulangi tanpa data baru).**
- *Ganti model:* diukur lokal lewat pipeline yang sama, 4 query identik — `glm-5.3` 13,7-23,4 dtk (rata 19,0) vs `deepseek-v4-flash` 10,6-27,6 dtk (rata 21,4); keduanya 4/4 `grounded=pass`. Latensi bukan alasan mengganti model.
- *Pangkas `AI_MAX_OUTPUT_TOKENS` 3000→1500:* 3 dari 4 jawaban terpotong sebelum JSON selesai (`used=false`, jatuh ke template). 3000 adalah titik manisnya.
- *Retry timeout:* dihapus — dulu timeout diulang karena bukan `LlmError`, menggandakan tunggu tanpa peluang berhasil.

Hasil akhir: 5/5 query produksi `used=true, grounded=pass` (latensi 18,0-40,3 dtk; 2 sisanya cache <3 dtk).

**Pelajaran DOX.** Dua test A1 (`b9a038f`) masuk dalam keadaan GAGAL karena vitest terblokir saat commit dan tidak pernah dijalankan ulang — satu test menuntut perilaku yang tidak pernah diimplementasikan, satu lagi melanggar test anti-few-shot-fiktif. Repo ini mewajibkan `npm run build && npx vitest run` hijau sebelum commit; jangan commit saat runner tidak bisa dijalankan.

Status akhir sesi: 162 test hijau, `backend: redis`, toggle global terbukti lintas-instance (6/6 permintaan konsisten), metrik deterministik/LLM akurat.

**Wart terbuka:** ekor latensi penyedia (`glm-5.3`) masih bisa menyentuh 40 dtk pada query tertentu; dengan deterministik OFF tidak ada jaring pengaman, jadi panggilan di atas 48 dtk tetap menjadi error. Jika ini mengganggu, opsi berikutnya adalah gerbang kualitas shadow penuh (`npm run eval`, 52 item) untuk `deepseek-v4-flash` — bukan sekadar perbandingan latensi.

## Riwayat sesi 2026-09-19 (lanjutan) — stall, model, retry skema, insiden deploy

**Diagnosis stall (keluhan: `timeout setelah 48000 ms`).** Pada jalur SSE diukur **nol token selama 48 dtk**, sementara query yang sama selesai **12,1 dtk** di lokal dengan prompt hanya 995 token. Sambungannya MANDEK, bukan model lambat menulis — dan keduanya butuh penanganan berbeda: menunggu itu benar untuk yang lambat, sia-sia untuk yang mandek.

Perbaikan (`e172c66`): watchdog "tidak ada data" (`AI_FIRST_TOKEN_MS`, default 15 dtk) memutus sambungan mandek lalu mencoba ulang sekali dengan anggaran 30 dtk (terburuk 15+1+30 = 46 dtk). Percobaan ulang HANYA sah bila belum ada satu delta pun keluar ke pemanggil — setelah ada output, memulai ulang menggandakan teks. Dijaga `src/lib/ai/__tests__/stream-stall.test.ts`; **mock uji WAJIB menghormati AbortSignal**, kalau tidak watchdog tidak akan pernah terpicu di uji (jebakan yang sudah kena sekali).

**Pergantian model produksi ke `deepseek-v4.1-flash`** (keputusan pemilik — kuota `glm-5.3` hampir habis, bukan karena latensi: lokal keduanya setara). Terukur pada 8 query jalur stream: latensi **3,6-8,5 dtk** (rata 5,4) melawan `glm-5.3` 15-40+ dtk. 6/8 langsung berhasil; 2 gagal "keluaran tidak sesuai skema" dan **keduanya berhasil saat diulang** → kegagalan skema bersifat sampling.

Perbaikan (`8ce5950`): skema gagal → satu percobaan ulang NON-stream (token percobaan pertama digantikan hasil percobaan kedua lewat event `result`). Batas anggaran: hanya bila waktu terpakai <15 dtk, percobaan kedua dibatasi 25 dtk. Ditambah **default model per-provider** (`opencode-go` → `deepseek-v4.1-flash`) supaya menghapus/mengganti `AI_MODEL` di Vercel tidak pernah meninggalkan model kosong.

**Pesan layanan nonaktif (`6c8078e`).** `AI dinonaktifkan oleh admin — jawaban deterministik dinonaktifkan admin dan AI tidak menghasilkan jawaban` → **`AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban`**. Frasa "dinonaktifkan admin" muncul dua kali untuk satu sebab. Pesan sebab-spesifik lain sengaja dipertahankan (mis. kegagalan model tetap membawa alasannya) supaya diagnosis tidak hilang.

**Pelajaran deploy (mahal — jangan diulang).**
1. Periksa insiden platform sebelum menuduh kode: `curl -s https://www.vercel-status.com/api/v2/incidents/unresolved.json`.
2. **Deployment macet di `INITIALIZING` menahan satu-satunya slot build Hobby.** Selama itu semua push berikutnya tidak pernah dibangun — commit perbaikan pesan tertinggal di produksi tanpa gejala yang jelas. Bebaskan: `vercel api -X PATCH "/v12/deployments/<id>/cancel"`.
3. Bila integrasi Git tidak membuat deployment sama sekali: `vercel --prod --yes` dari direktori proyek.
4. **Deploy CLI tidak otomatis mengambil domain produksi** — perlu `vercel promote <url>`.
5. Verifikasi commit yang BENAR-BENAR melayani produksi: `vercel api "/v13/deployments/<domain>"` lalu baca `meta.githubCommitSha`. Jangan berasumsi "deploy terbaru = kode terbaru" — pernah tertinggal satu commit.
6. `state: inactive` di `/api/status` belum berarti rusak — periksa `toggles` dulu; toggle admin menang atas env.

**Storage Vercel (Hobby 10 GB).** Functions Storage = bundel fungsi yang disimpan **di setiap region**, dan tumbuh dari jumlah deployment tersimpan × ukuran output × retensi; diukur **GB-bulan** (maksimum harian per proyek, dijumlahkan sepanjang siklus). Akun ini: 12 proyek, ≥228 deployment tersimpan (cc-acehtengah >100). **Pause tidak menambah dan tidak mengurangi storage** — ia hanya menghentikan layanan. Pengungkitnya Deployment Retention Policy; proyek Hobby yang melewati batas kini penghapusannya dipercepat sendiri oleh Vercel.

Status akhir sesi: 169 test hijau, model produksi `deepseek-v4.1-flash`, region `sin1`, jawaban AI terukur 3,4 dtk dengan `grounded=pass`. Saat pengecekan terakhir toggle admin berada di **AI OFF + deterministik OFF** (pilihan pemilik) sehingga layanan membalas 503 dengan pesan baru — bukan kerusakan.
