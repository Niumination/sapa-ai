# 21 — Laporan OPS-03: Penyegaran Cache Terjadwal

**Tanggal:** 23 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` (tidak menyentuh `main`)
**Kriteria terima (dokumen 10):** *cache segar harian; endpoint tetap fail-closed* — keduanya
dibuktikan dengan pengukuran, bukan klaim (lihat §5).

---

## 1. Masalah yang diselesaikan

Cache SAPA berlapis: LRU 10 menit di tiap instance + `unstable_cache` 600 detik bertag
(`sapa-analytics` · `kpi` · `stats` · `report`). Endpoint pembatalnya, `/api/revalidate`, sudah ada
sejak awal, dan sejak perbaikan 21 September 2026 ia sudah **fail-closed** — tanpa
`REVALIDATE_SECRET` ia menolak dengan 503, tidak lagi diam-diam terbuka.

Tetapi **tidak ada yang memanggilnya secara berkala**. Itu meninggalkan dua lubang:

| Lubang | Akibat nyata |
|---|---|
| Tidak ada penyegaran terjadwal | "segar harian" tidak pernah terjadi; kesegaran hanya bergantung TTL 600 detik. Bila agregat SPLP berubah dan tidak ada warga membuka halaman, angka lama terus disajikan tanpa batas |
| Tidak ada cara melihat kapan terakhir disegarkan | Bila penjadwal mati (rahasia salah, cron dimatikan, alamat berubah), **tidak ada satu pun sinyal**. Situs menyajikan data basi dengan tenang — kelas kegagalan senyap yang sama dengan sirkuit penyedia AI sebelum OPS-04 |

Lubang kedua itu yang paling berbahaya, dan ia yang paling sering diabaikan: memperbaiki "tidak ada
penjadwal" tanpa menambahkan bukti kesegaran hanya memindahkan masalah satu langkah lebih jauh dari
mata.

---

## 2. Apa yang dikerjakan

### 2.1 Satu jalur, tiga pemakai

Sebelumnya logika pembatal cache hanya hidup di dalam route `/api/revalidate`. OPS-03 memindahkannya
ke satu fungsi (`jalankanPenyegaran` di `src/lib/penyegar-cache.ts`) yang dipakai **tiga** pemakai —
sehingga tidak mungkin ada dua jalur yang menyimpang:

| Pemakai | Kegunaan |
|---|---|
| `POST /api/revalidate` (rahasia) | penjadwal luar: GitHub Actions, cron server, Task Scheduler |
| `GET /api/admin/segarkan` (token admin) | operator: melihat kesegaran, menyegarkan sekarang, uji kering |
| `scripts/segarkan-cache.mjs` | transport + percobaan ulang + **bukti kesegaran** untuk semua penjadwal |

### 2.2 Kegagalan berbicara dengan kategori, bukan "error"

Penjadwal yang hanya tahu "gagal" memaksa operator menebak. Sekarang setiap balasan diterjemahkan
menjadi kategori yang langsung menunjuk perbaikan yang tepat:

| Kategori | Arti | Tindakan | Kode keluar skrip |
|---|---|---|---|
| `ok` | cache disegarkan | — | 0 |
| `rahasia-salah` | 401: rahasia tidak cocok/tidak dikirim | samakan `REVALIDATE_SECRET` di rahasia repo dan Vercel | 2 |
| `tag-salah` | 400: nama tag salah ketik | pakai salah satu dari empat tag yang sah | 2 |
| `endpoint-tertutup` | 503 fail-closed: rahasia belum diset di produksi | set `REVALIDATE_SECRET` di Vercel | 3 |
| `dibatasi` | 429: terlalu sering | turunkan frekuensi (batas 20/menit per IP) | 4 |
| `galat-server` | 5xx atau gangguan jaringan | dicoba ulang otomatis (jeda 2 s → 4 s → 8 s, batas 60 s) | 4 |
| kesegaran tak terkonfirmasi | penyegaran berhasil tetapi `/api/status` belum melihatnya | periksa penyimpanan bersama | 5 |

Perhatikan: **`endpoint-tertutup` diberi kode keluar tersendiri (3)**. Itu kegagalan konfigurasi yang
paling mudah terjadi saat pemasangan pertama — dan paling membingungkan bila hanya tampak sebagai
"gagal".

### 2.3 Bukti kesegaran: penjadwal tidak boleh melaporkan sukses tanpa itu

Setelah setiap penyegaran yang berhasil, skrip membaca `/api/status` dan memeriksa
`segarkanCache.segar`. Bila tidak terkonfirmasi, skrip keluar dengan **kode 5**, bukan 0. Prinsipnya
sederhana: *penjadwal yang "berhasil" tanpa bukti kesegaran tidak menjaga apa pun.*

### 2.4 Pembukuan: menjawab "sejak kapan?" tanpa membuka log

`/api/status` (publik) kini memuat `segarkanCache`; `/api/admin/segarkan` (token) menampilkan riwayat
30 penyegaran terakhir + backend penyimpanan. Yang dicatat: waktu, tag, mode (`bertanda`/`admin`),
sumber (`jadwal-github`, `jadwal-lokal`, `admin`, `uji-*`), kategori, dan durasi.

Dua keputusan yang perlu dijelaskan:

* **Yang menghitung kesegaran hanya penyegaran BERHASIL.** Kegagalan tercatat untuk diagnosis, tetapi
  tidak boleh membuat sistem tampak "baru saja disegarkan" padahal tidak.
* **`terlewat` bukan sekadar "data tua".** Ia bernilai true bila jadwal harian sudah lewat lebih dari
  satu jam tanpa penyegaran berhasil — itu bukti **penjadwal berhenti**, bukan sekadar data lama. Ini
  sinyal yang sebelumnya tidak ada sama sekali.
* **Percobaan 401 (rahasia salah) sengaja TIDAK ditulis ke penyimpanan bersama.** Jalur itu dapat
  dipanggil siapa saja; menulis untuk setiap percobaan akan menjadikan endpoint ini alat pemborosan
  kuota Redis (pola *unbounded consumption*). Percobaan itu tetap tampak di log aplikasi.

### 2.5 Penjadwal yang dapat dipasang di mana saja

`.github/workflows/segarkan-cache.yml` (cron `0 22 * * *` = **05:00 WIB**, sebelum jam kerja;
`workflow_dispatch` untuk uji manual dengan isian tag) menjalankan skrip yang **sama** dengan yang
dipakai operator di mesinnya sendiri:

```bash
# cron server (05:00 WIB tiap hari)
0 22 * * *  cd /opt/sapa-ai && SAPA_BASE_URL=https://sapa-smart-ai.vercel.app \
            REVALIDATE_SECRET=... SAPA_SEGARKAN_SUMBER=jadwal-lokal \
            node scripts/segarkan-cache.mjs --tag=all --simpan=/var/log/sapa-segarkan.json

# memeriksa saja (tanpa rahasia, tanpa mengubah apa pun)
node scripts/segarkan-cache.mjs --periksa=1
```

Skrip ditulis sebagai `.mjs` polos supaya dapat dijalankan `node` tanpa build di mesin mana pun.
Logika kategorinya adalah **cermin** dari modul TypeScript; keselarasan keduanya diuji
ujung-ke-ujung (setiap kategori dibangkitkan sungguhan, lalu kode keluarnya dicocokkan).

### 2.6 Ditambah ke kit uji terima (§6h)

`verifikasi/uji-terima.sh` dan salinannya di `docs/usulan-ai-tingkat-lanjut/` (byte-identical) kini
memuat §6h yang menjalankan harness OPS-03 — atau dilewati dengan `SAPA_SKIP_SEGARKAN=1`.

---

## 3. Berkas

| Berkas | Isi |
|---|---|
| `src/lib/penyegar-cache.ts` **(baru)** | allowlist tag, kategori balasan, kebijakan mundur, pembukuan + penilaian kesegaran, jalur tunggal `jalankanPenyegaran` |
| `src/lib/__tests__/penyegar-cache.test.ts` **(baru)** | 33 uji: tag asing ditolak, kategori 503 vs 503-fail-closed, batas riwayat, ekor kegagalan beruntun, ambang basi dari dua sisi, `{ expire: 0 }`, penyimpanan rusak, kerahasiaan baris log |
| `src/app/api/admin/segarkan/route.ts` **(baru)** | `?periksa` (bawaan) · `?sekarang=1&tag=…` · `&kering=1`; fail-closed via `ADMIN_TOKEN` |
| `scripts/segarkan-cache.mjs` **(baru)** | penjadwal: percobaan ulang berjeda berlipat, kategori + kode keluar, bukti kesegaran, notifikasi kegagalan, `--periksa`, `--kering`, `--simpan` |
| `scripts/uji-segarkan.mjs` **(baru)** | harness ujung-ke-ujung: 45 pemeriksaan, dua aplikasi (dengan/tanpa rahasia) |
| `.github/workflows/segarkan-cache.yml` **(baru)** | cron harian 05:00 WIB + uji manual; dorman rapi bila rahasia belum diisi |
| `src/app/api/revalidate/route.ts` | memakai jalur tunggal; kategori pada balasan; baris log `[segarkan]` |
| `src/app/api/status/route.ts` | bagian `segarkanCache` |
| `verifikasi/uji-terima.sh` ⇄ `docs/…/uji-terima.sh` | §6h baru (byte-identical) |
| `verifikasi/uji-segarkan.txt`, `uji-segarkan-bukti.json`, `uji-terima-hasil.txt` | bukti mentah |

---

## 4. Yang TIDAK berubah (dan itu disengaja)

* **Pagar akses `/api/revalidate` tidak dilonggarkan sedikit pun** — fail-closed tanpa rahasia di
  produksi tetap seperti perbaikan 21 September 2026. OPS-03 hanya menambah pembukuan dan kategori.
* **`{ expire: 0 }` tetap dipakai**, bukan profil bawaan `max`: profil itu hanya *menandai* basi dan
  masih menyajikan entri lama sampai 30 hari — bertentangan dengan kontrak cache 10 menit repo ini.
* **Rahasia tidak pernah dicatat.** Rahasia dikirim sebagai header, tidak pernah dicetak, tidak masuk
  artefak, tidak masuk notifikasi; diuji dengan pencarian harfiah pada log aplikasi dan keluaran
  penjadwal.
* **Perilaku dev tidak dikunci.** Tanpa `REVALIDATE_SECRET` di non-produksi, jalur tetap terbuka
  (`mode: terbuka-dev`) agar `npm run dev` tidak terganggu — sudah ada sebelum OPS-03.

---

## 5. Bukti terukur

### 5.1 Unit & statis

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run` | **35 berkas / 566 uji lulus** (naik dari 34/533 — 33 uji baru) |
| `npm run typecheck` · `npm run build` | bersih · sukses |
| lint berkas OPS-03 | 0 error, 0 warning |

### 5.2 Harness ujung-ke-ujung: **45 ✓ / 0 ✗, exit 0**

Setiap butir bisa gagal. Yang paling penting:

| Bukti | Keluaran nyata |
|---|---|
| Prasyarat: cache memang bekerja | dua bacaan `/api/stats` → cap waktu **sama** (`2026-09-23T07:43:19.738Z`) |
| **"Segar" dibuktikan pada DATA** | setelah penyegaran, `lastFetched` **berubah**: `07:43:19.738Z → 07:45:52.308Z` (bukan sekadar catatan pembukuan) |
| Fail-closed tetap berlaku | aplikasi tanpa rahasia → POST anonim **503** + kategori `endpoint-tertutup` |
| Penjadwal gagal **berbicara** | skrip pada aplikasi itu keluar **kode 3**, laporan `endpoint-tertutup`, tanpa percobaan ulang sia-sia |
| Rahasia salah | **401**, kategori `rahasia-salah`, skrip keluar **kode 2**, cache **tidak** disentuh, **tidak** menulis pembukuan (anti pemborosan kuota) |
| Kesegaran terlihat dari aplikasi | `/api/status` → `segar: true`, `umurJam: 0`, `terlewat: false`, `gagalBerturut: 0` |
| Sinyal "penjadwal mati" nyata | aplikasi yang belum pernah disegarkan → `segar: false`; `--periksa` keluar **kode 5** |
| Endpoint admin | tanpa token ditolak; dengan token menampilkan riwayat bersumber `uji-jadwal`; **uji kering tidak membatalkan cache**; tag asing → 400 |
| Batas laju | 429 setelah 20 permintaan/menit, balasan membawa kategori `dibatasi` |
| Kerahasiaan | rahasia **tidak muncul** di log aplikasi maupun keluaran penjadwal |
| Kesehatan akhir | aplikasi tetap menjawab 200 setelah seluruh penolakan di atas |

### 5.3 Kit uji terima (§6h)

```
── 6h. Penyegaran cache terjadwal (OPS-03) ──
  ✓ penyegaran cache terjadwal: 45 ✓ / 0 ✗
  ✓ cache benar-benar dihitung ulang (cap waktu data) — 2026-09-23T07:43:19.738Z → 2026-09-23T07:45:52.308Z
```

Seluruh kit: **41 ✓**, `exit 0` (`verifikasi/uji-terima-hasil.txt`). §6e (FR-23) 4/4, §6f (OPS-04)
LULUS, §6g (NFR-07) 19 ✓ / 0 ✗ — tidak ada regresi.

---

## 6. Empat temuan dari pengujian nyata

1. **Urutan uji bisa menipu.** Pemeriksaan "penyegaran seluruh tag" awalnya diletakkan setelah uji
   batas laju — hasilnya 429, bukan 200, dan laporan tampak seperti cacat fitur. Batas laju
   menghitung **semua** permintaan bertanda rahasia yang sah, termasuk pemeriksaan sebelumnya. Uji
   itu kini dijalankan sebelum batas laju dipicu, dan urutannya diberi komentar di harness supaya
   tidak "diperbaiki" balik oleh orang berikutnya.
2. **Aplikasi tanpa rahasia adalah satu-satunya bukti fail-closed yang sah.** Menguji fail-closed
   pada aplikasi yang *punya* rahasia hanya membuktikan 401 bekerja. Harness karena itu menjalankan
   **dua** aplikasi; tanpa aplikasi kedua, "fail-closed" tetap klaim.
3. **`/api/revalidate` tidak menerima daftar tag berkoma** — dan itu ternyata benar. Salah ketik
   harus gagal, bukan menghasilkan "sukses" yang tidak menyentuh apa pun. Skrip penjadwal kini
   menerjemahkan daftar menjadi `tags` (array) atau `all`, dan terjemahan itu ikut diuji.
4. **Kategori 503 perlu dipisah dari 503.** Pesan fail-closed (`REVALIDATE_SECRET belum diset`)
   adalah kegagalan konfigurasi yang perbaikannya satu langkah; 503 dari gangguan platform adalah hal
   lain. Tanpa pemisahan ini, operator akan mencari masalah di tempat yang salah.

---

## 7. Batas yang diketahui

* **Tanpa penyimpanan bersama, riwayat bersifat per-instance.** Di Vercel tanpa Redis, dua instance
  dapat menulis riwayat masing-masing (saling menimpa). Kesegaran tetap benar untuk instance yang
  menjawab, dan `/api/status` melaporkan `backend` apa adanya. Setelah Upstash dipasang, riwayat
  menjadi global tanpa perubahan kode.
* **Penjadwal GitHub Actions tidak dijamin tepat waktu** (cron GitHub dapat tertunda beberapa menit,
  bahkan lebih saat beban tinggi). Karena itu toleransi `terlewat` diberi satu jam, dan penjadwal
  lokal didukung penuh sebagai alternatif.
* **Repository tidak otomatis menyala.** Workflow baru **dorman** (keluar dengan sukses, mencetak
  pesan) sampai `SAPA_URL` dan `REVALIDATE_SECRET` diisi di rahasia GitHub — mengikuti pola OPS-04,
  supaya repositori yang belum siap tidak menyalakan alarm palsu setiap hari. Karena itu pula langkah
  pemasangan berikut ini penting.
* **Yang disegarkan adalah cache, bukan data.** Bila SPLP sendiri menolak atau kosong, penyegaran
  tetap "berhasil" — dan itu benar: tugasnya mengosongkan cache, bukan memvalidasi isi. Validasi data
  ada di jalur jawaban (FR-23/FR-24) dan di laporan status SPLP.
* **Belum ada notifikasi ambang basi dari sisi server.** Skrip penjadwal mengabari operator saat
  gagal (webhook yang sama dengan OPS-04), tetapi bila penjadwal **tidak berjalan sama sekali**
  (mis. cron dimatikan), hanya `/api/status` dan `--periksa` yang menunjukkan `terlewat`. Pola
  "penjadwal memeriksa penjadwal" itu sengaja dihindari agar tidak ada satu titik gagal tunggal;
  pemantauan eksternal (uptime monitor yang memanggil `--periksa`) adalah jawaban yang tepat.

---

## 8. Langkah pemasangan (untuk operator)

1. **Vercel** → set `REVALIDATE_SECRET` (rahasia acak panjang). Selama belum diset, endpoint menolak
   semua permintaan (fail-closed) — itu disengaja.
2. **GitHub** → *Settings → Variables*: `SAPA_URL = https://sapa-smart-ai.vercel.app`;
   *Settings → Secrets*: `REVALIDATE_SECRET` (nilai sama), opsional `SAPA_ALERT_WEBHOOK_URL` +
   `SAPA_ALERT_WEBHOOK_TOKEN` (saluran yang sama dengan OPS-04).
3. **Uji manual:** Actions → *Penyegaran cache harian* → *Run workflow* (tag boleh dikosongkan).
   Ringkasan langkah menampilkan artefak JSON berisi tag, durasi, dan kesegaran.
4. **Verifikasi:** buka `<SAPA_URL>/api/status` → `segarkanCache.segar` harus `true` dan `umurJam` < 1.
   Rincian riwayat: `<SAPA_URL>/api/admin/segarkan?token=<ADMIN_TOKEN>`.
5. **Penjadwal alternatif** (bila tidak memakai GitHub Actions): pasang baris cron di §2.5 pada
   server yang menyala 24 jam.

**Bila gagal:**

| Gejala | Penyebab paling mungkin | Perbaikan |
|---|---|---|
| Kode keluar 3 / `endpoint-tertutup` | `REVALIDATE_SECRET` belum diset di Vercel | set di Vercel, tunggu deploy, jalankan ulang |
| Kode keluar 2 / `rahasia-salah` | nilai di GitHub ≠ nilai di Vercel | samakan keduanya |
| Kode keluar 4 berulang | gangguan jaringan / 5xx | periksa status platform; penjadwal sudah mencoba ulang sendiri |
| Kode keluar 5 | penyegaran berhasil, kesegaran belum terlihat | periksa penyimpanan bersama (`/api/status` → `backend`), lalu periksa jam server |
| `/api/status` → `terlewat: true` | penjadwal tidak berjalan | periksa tab Actions (workflow aktif?) atau cron lokal |
