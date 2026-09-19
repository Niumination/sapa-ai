# Panduan Operasional (Runbook) — SAPA Smart AI

Dokumen ini untuk pengelola teknis aplikasi: melakukan pemeriksaan rutin, menyalakan atau mematikan layanan jawaban, menyegarkan cache, menangani gejala umum, dan menjalankan rollback deployment. Semua perintah di bawah sudah diuji terhadap repo `Niumination/sapa-ai` dan endpoint produksi.

- Produksi: https://sapa-smart-ai.vercel.app
- Repo: `github.com/Niumination/sapa-ai` (privat), branch produksi `main`
- Proyek Vercel: `sapa-ai`, region fungsi `sin1` (Singapura)
- Kerangka: Next.js 16, tanpa basis data, tanpa login
- Sumber data tunggal: API SPLP (`api-splp.layanan.go.id/sapa/1.0/api/daftar_data`)

Peringatan: dokumen ini tidak memuat rahasia apa pun. Nilai `AI_ADMIN_KEY`, `REVALIDATE_SECRET`, `AI_API_KEY`, dan `UPSTASH_REDIS_REST_TOKEN` hanya berada di Vercel Dashboard atau berkas lingkungan lokal yang tidak di-commit.

---

## 1. Gambaran singkat sistem

1. Aplikasi mengambil katalog dari SPLP, lalu menyimpannya di cache: LRU 10 menit per instance (`src/lib/sapa-client.ts`) ditambah cache terdistribusi 10 menit (tag `sapa-analytics`, `kpi`, `stats`, `report`).
2. Pertanyaan pengguna masuk ke `/api/query/stream` (Server-Sent Events). Model AI merangkai narasi, tetapi setiap angka pada narasi wajib berasal dari evidence hasil retrieval; angka yang tidak ada di evidence dibuang (grounding).
3. Bila model tidak dipakai atau gagal, jawaban disusun dari template deterministik.
4. Dua saklar admin menentukan mode layanan: **AI** dan **Deterministik**. Perlu dipahami secara tepat — "deterministik" berarti **jawaban template**. Mematikannya melarang jawaban template, bukan mematikan seluruh aplikasi. Mematikan keduanya membuat layanan jawaban tidak dapat diakses.
5. Keadaan saklar disimpan pada penyimpanan bersama (Upstash Redis). Bila Upstash tidak dikonfigurasi, saklar hanya berlaku per instance dan panel menampilkan peringatan.

---

## 2. Daftar periksa harian

1. Buka `https://sapa-smart-ai.vercel.app/api/status`.
   Hasil yang diharapkan: `sapa.state` bernilai `active` dengan jumlah `records` di atas nol.
2. Periksa bagian `ai` pada respons yang sama: baca `state`, `reason`, dan `toggles`.
   Hasil yang diharapkan: keadaan saklar sesuai keputusan pengelola. Ingat bahwa saat kedua saklar mati, `state` bernilai `inactive` dan itu disengaja, bukan kerusakan.
3. Buka halaman Beranda dan ajukan satu pertanyaan uji (misalnya `IPM`).
   Hasil yang diharapkan: jawaban lengkap muncul, atau pesan penonaktifan yang jelas bila saklar memang dimatikan.
4. Buka `/dashboard/status`.
   Hasil yang diharapkan: banner "Online" beserta jumlah record, OPD, indikator unik, dan latensi API.
5. Periksa status insiden platform sebelum menyimpulkan ada kerusakan aplikasi:

```bash
curl -s https://www.vercel-status.com/api/v2/incidents/unresolved.json
```

Hasil yang diharapkan: `[]` (tidak ada insiden) atau daftar insiden yang dapat dijadikan penjelasan.

---

## 3. Daftar periksa mingguan

1. Jalankan gerbang mutu lengkap di salinan lokal:

```bash
cd <salinan repo sapa-ai>
npm ci
npm run typecheck
npx vitest run
npm run build
```

Hasil yang diharapkan: typecheck `[typecheck] OK`, seluruh berkas uji lulus (jumlah lulus terkini tercatat pada dokumen `09-PENGUJIAN-DAN-MUTU.md`), dan build selesai dengan status compiled successfully.
2. Periksa cakupan cache dan penyimpanan: pastikan `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` terisi bila saklar admin dipakai, agar status saklar konsisten lintas instance. Buka panel admin dan pastikan baris "Penyimpanan" menampilkan **Redis (global)**, bukan **Memori (per-instance)**.
3. Periksa retensi deployment pada Vercel (kuota Hobby). Hapus deployment lama yang tidak diperlukan bila mendekati batas penyimpanan. Catatan: menangguhkan proyek tidak menambah dan tidak mengurangi pemakaian penyimpanan.
4. Tinjau log fungsi `/api/query` dan `/api/query/stream` untuk baris `[ai-error]`.
   Hasil yang diharapkan: tidak ada lonjakan galat; bila ada, catat tahap yang dilaporkan (`panggil`, `parse`, `parse-ulang`).

---

## 4. Memeriksa kesehatan aplikasi

### 4.1 Endpoint utama: `/api/status`

```bash
curl -s https://sapa-smart-ai.vercel.app/api/status
```

Bentuk respons dan cara membacanya:

```json
{
  "sapa": { "state": "active", "records": 2065 },
  "ai": {
    "state": "inactive",
    "provider": "opencode-go",
    "model": "deepseek-v4.1-flash",
    "reason": "AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses",
    "dailyUsed": 6,
    "toggles": { "aiEnabled": false, "detEnabled": false, "backend": "redis", "updatedAt": "..." },
    "metrics": { "deterministicToday": 0, "llmToday": 0, "ratio": { "deterministic": 0, "llm": 0 } }
  }
}
```

Panduan membaca:

- `sapa.state`: `active` berarti katalog SPLP berhasil dibaca; `down` berarti gagal (lihat bagian 7.6). `records` adalah jumlah baris katalog.
- `ai.state`: `active` (narasi AI dikirim ke pengguna), `shadow` (model dievaluasi saja, pengguna menerima jawaban deterministik), atau `inactive`.
- `ai.reason`: alasan jujur mengapa AI tidak aktif. Teks ini juga yang ditampilkan sebagai pesan kepada pengguna.
- `ai.toggles`: keadaan saklar admin. **Saklar admin menang atas variabel lingkungan.** Bila `aiEnabled` bernilai `false`, model tidak akan dipanggil meskipun `AI_ENABLED=true` pada Vercel.
- `ai.toggles.backend`: `redis` berarti status global dan konsisten; `memory` berarti status hanya per instance sehingga panel dapat tampak tidak berefek.
- `ai.dailyUsed` dan `ai.metrics`: pemakaian hari ini. `metrics` memisahkan jawaban deterministik dan jawaban hasil model.

Catatan penting: `state: inactive` tidak otomatis berarti rusak. Periksa `toggles` lebih dahulu.

### 4.2 Endpoint status saklar: `/api/admin/status`

```bash
curl -s https://sapa-smart-ai.vercel.app/api/admin/status
```

Hasil yang diharapkan: `{"aiEnabled":..., "detEnabled":..., "backend":"redis|memory", "updatedAt":"..."}`. Endpoint ini publik dan tidak memuat rahasia; ia hanya menyatakan keadaan saklar.

### 4.3 Verifikasi region fungsi

```bash
curl -sI https://sapa-smart-ai.vercel.app/api/status | grep -i x-vercel-id
```

Hasil yang diharapkan: nilai diawali `sin1::`. Bila tertulis `iad1` (Virginia), fungsi berjalan di region yang salah dan latensi akan jauh lebih tinggi; pastikan `"regions": ["sin1"]` ada pada `vercel.json` lalu deploy ulang.

---

## 5. Menyalakan dan mematikan layanan melalui panel admin

Panel: `/admin/ai-toggle`. Autentikasi memakai header `x-admin-key` yang nilainya sama dengan variabel lingkungan `AI_ADMIN_KEY`. Bila `AI_ADMIN_KEY` kosong, semua permintaan ke endpoint toggle selalu dibalas `401 unauthorized` dan panel tidak dapat dipakai.

### 5.1 Melalui panel (cara utama)

1. Buka `https://sapa-smart-ai.vercel.app/admin/ai-toggle`.
   Hasil yang diharapkan: panel menampilkan keadaan AI, Deterministik, dan baris Penyimpanan.
2. Periksa baris **Penyimpanan**. Bila tertulis "Memori (per-instance)", status saklar tidak dijamin konsisten antar permintaan; set `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` lebih dahulu bila hal ini mengganggu.
3. Isi kolom **Admin Key** dengan nilai `AI_ADMIN_KEY`.
   Hasil yang diharapkan: kedua tombol menjadi aktif setelah kolom terisi.
4. Tekan **Aktifkan AI** atau **Matikan AI** sesuai kebutuhan. Langkah yang sama berlaku untuk **Aktifkan Deterministik** / **Matikan Deterministik**.
   Hasil yang diharapkan: panel menampilkan pesan hasil, misalnya "AI & Deterministik AKTIF", "AI dimatikan — hanya jawaban deterministik", atau "AI & Deterministik DIMATIKAN — layanan tidak dapat diakses". Panel juga membaca ulang keadaan dari server untuk membuktikan perubahan benar-benar tersimpan.
5. Bila key salah, panel menampilkan "Key salah — unauthorized".
   Hasil yang diharapkan: perbaiki key lalu ulangi; jangan menyimpan key di catatan publik.

Tabel arti setiap kombinasi saklar:

| AI | Deterministik | Perilaku layanan jawaban |
|---|---|---|
| Aktif | Aktif | Narasi AI disajikan; bila model gagal, jawaban template dipakai sebagai jaring pengaman. |
| Aktif | Mati | Hanya jawaban AI. Bila model gagal, tidak ada fallback template sehingga permintaan tersebut gagal dengan pesan sebabnya. |
| Mati | Aktif | Model tidak dipanggil. Semua jawaban dari template deterministik. |
| Mati | Mati | Layanan jawaban tidak dapat diakses; pengguna menerima pesan `AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban`. |

### 5.2 Melalui baris perintah

```bash
# Lihat keadaan saklar (memerlukan key)
curl -s -H "x-admin-key: <AI_ADMIN_KEY>" https://sapa-smart-ai.vercel.app/api/admin/toggle-ai

# Matikan AI, biarkan deterministik aktif
curl -s -X POST https://sapa-smart-ai.vercel.app/api/admin/toggle-ai \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <AI_ADMIN_KEY>" \
  -d '{"aiEnabled":false,"detEnabled":true}'

# Aktifkan keduanya
curl -s -X POST https://sapa-smart-ai.vercel.app/api/admin/toggle-ai \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <AI_ADMIN_KEY>" \
  -d '{"aiEnabled":true,"detEnabled":true}'
```

Hasil yang diharapkan: respons berisi keadaan terbaru beserta `backend`. Sebaiknya selalu sertakan kedua properti agar tidak ada bidang yang tertinggal pada nilai lama.

Catatan penting tentang semantik: mematikan **Deterministik** tidak mematikan aplikasi. Selama AI masih hidup, jawaban AI tetap disajikan. Yang dilarang adalah jawaban template.

---

## 6. Memaksa penyegaran cache

Cache berlaku 10 menit. Untuk memaksa pembacaan baru tanpa menunggu, gunakan `POST /api/revalidate`. Bila `REVALIDATE_SECRET` diisi di lingkungan produksi, permintaan wajib menyertakan header `x-revalidate-secret` (atau properti `secret` pada badan permintaan). Bila kosong, siapa pun dapat memanggil endpoint ini.

Tag yang sah: `sapa-analytics`, `kpi`, `stats`, `report`, dan `all`.

```bash
# Segarkan semua tag
curl -s -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H "Content-Type: application/json" \
  -H "x-revalidate-secret: <REVALIDATE_SECRET>" \
  -d '{"tags":["all"]}'

# Segarkan satu tag saja
curl -s -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H "Content-Type: application/json" \
  -H "x-revalidate-secret: <REVALIDATE_SECRET>" \
  -d '{"tag":"kpi"}'
```

Hasil yang diharapkan: `{"status":"ok","revalidated":["sapa-analytics","kpi","stats","report"]}` untuk `all`.

- Tanpa tag: `400` dengan pesan `tag/tags required (sapa-analytics|kpi|stats|report|all)`.
- Tag tidak dikenal: `400` dengan pesan `unknown tag. allowed: ...`.
- Secret salah: `401` dengan pesan `Unauthorized`.

Pembatalan bersifat keras dan seketika (entri langsung kedaluwarsa), sehingga permintaan berikutnya mengambil data baru dari SPLP. Tag `sapa-analytics` memengaruhi agregat dashboard/analitik; `kpi` memengaruhi kartu KPI; `stats` memengaruhi agregat ringan; `report` memengaruhi laporan eksekutif.

---

## 7. Gejala umum dan langkah penanganan

### 7.1 Semua pembaca jawaban menerima 503

Gejala: `/api/query` dan `/api/query/stream` membalas status 503. Dua penyebab yang mungkin dan tidak boleh tertukar.

1. Periksa saklar.

```bash
curl -s https://sapa-smart-ai.vercel.app/api/admin/status
```

Bila `aiEnabled` dan `detEnabled` keduanya `false`: ini keadaan penonaktifan sengaja. Nyalakan minimal satu saklar melalui panel admin (bagian 5). Perlu dicatat bahwa pesan pada `/api/status` juga akan menyatakan hal yang sama.
2. Periksa sumber data.

```bash
curl -s https://sapa-smart-ai.vercel.app/api/status
```

Bila `sapa.state` bernilai `down`: penyebabnya adalah SPLP, bukan saklar. Lanjut ke bagian 7.6.

Catatan: halaman Beranda (KPI), Analitik, Peta GIS, Laporan, dan Status tidak memakai saklar tersebut, sehingga halaman tetap dapat dibuka walaupun layanan jawaban dimatikan.

### 7.2 Jawaban tidak muncul (proses memuat berjalan lalu berhenti tanpa hasil)

1. Ulangi pertanyaan satu kali. Bila berhasil, catat sebagai gangguan sementara penyedia model.
2. Periksa `/api/status`. Bila `ai.dailyUsed` sudah mencapai `AI_DAILY_CALL_LIMIT` (bawaan 2000), tindak lanjutnya ada pada bagian 7.5.
3. Periksa log fungsi untuk baris `[ai-error]`. Tahap `panggil` menandakan kegagalan pemanggilan model; tahap `parse` menandakan keluaran model tidak sesuai skema (sistem sudah mengulang sekali secara otomatis). Tahap `parse-ulang-dilewati` dengan `terpakaiMs` menandakan percobaan kedua tidak dijalankan karena anggaran waktu tidak cukup.
4. Bila pesan yang muncul adalah `Permintaan melewati batas 55 detik`, lanjut ke bagian 8.
5. Bila tidak ada jawaban dan tidak ada pesan galat, periksa apakah aliran SSE terputus (misalnya karena proxy jaringan kantor). Uji dari jaringan lain.

### 7.3 Jawaban muncul tetapi tidak sesuai pertanyaan

1. Periksa tabel evidence pada jawaban. Nama indikator pada baris pertama harus sejalan dengan topik pertanyaan. Bila tidak, permasalahannya ada pada pencocokan kata kunci, bukan pada model.
2. Tanyakan ulang dengan istilah yang ada pada katalog (lihat daftar pada panduan pengguna).
3. Periksa apakah jawaban memuat peringatan "Tidak ada data SAPA yang memuat seluruh kata kunci sekaligus". Bila ya, aplikasi sudah menyatakan keterbatasan itu secara jujur; pecah pertanyaan menjadi satu topik.
4. Periksa lencana narasi. Bila lencana kuning ("diganti template deterministik"), berarti model telah terbukti menulis angka di luar evidence dan narasinya dibuang — perilaku ini benar dan bukan kerusakan.
5. Bila penyimpangan tetap terjadi pada pertanyaan agregat yang lazim, catat pertanyaan persisnya, waktu, dan sertakan tangkapan layar tabel evidence, lalu laporkan melalui jalur eskalasi (bagian 9). Jangan mengubah kode produksi langsung tanpa prosedur mutu pada dokumen `09-PENGUJIAN-DAN-MUTU.md`.

### 7.4 Cache basi (angka tidak berubah setelah sumber diperbarui)

1. Segarkan seluruh tag melalui `/api/revalidate` (bagian 6).
2. Muat ulang halaman dengan pengosongan cache peramban (Ctrl/Cmd + Shift + R).
3. Periksa `/api/status`: bila `sapa.state` aktif namun angka tetap tidak berubah setelah beberapa menit, periksa juga halaman Status & Tentang untuk waktu "Terakhir diperbarui".
4. Perlu dipahami: pembaruan maksimal 10 menit adalah perilaku rancangan. Angka yang tertinggal beberapa menit saat sumber baru saja diperbarui bukan kerusakan.

### 7.5 Kuota model habis

1. Periksa `/api/status`, baca `ai.dailyUsed` dan `ai.reason`.
2. Bila batas harian tercapai, jawaban otomatis memakai deterministik selama saklar Deterministik masih aktif. Pastikan saklar Deterministik AKTIF agar layanan tetap tersedia.
3. Bila penyebabnya adalah kuota langganan penyedia model (bukan batas harian aplikasi), matikan saklar AI dan pertahankan Deterministik agar pengguna tetap menerima jawaban template. Ini keadaan yang berlaku pada 19 September 2026.
4. Setelah kuota pulih, nyalakan kembali saklar AI melalui panel admin dan uji satu pertanyaan ber-evidence.
5. Bila anggaran harian perlu diubah, ubah `AI_DAILY_CALL_LIMIT` di Vercel Dashboard (bawaan 2000; nilai 0 berarti tanpa batas) dan deploy ulang. Catat perubahan pada catatan operasional (perlu dikonfirmasi: lokasi catatan resmi).

### 7.6 Sumber data SPLP mati

Gejala: `/api/query` membalas 503 dengan `stage: "splp"` dan pesan `Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.`; `/api/status` menunjukkan `sapa.state: "down"`; halaman Status & Tentang menampilkan Offline; halaman Analitik dapat menampilkan pesan gagal memuat.

1. Pastikan endpoint sumber memang tidak dapat dijangkau, bukan hanya lambat:

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" --max-time 30 https://api-splp.layanan.go.id/sapa/1.0/api/daftar_data
```

Hasil yang diharapkan: `200` dengan waktu tunggu beberapa detik. Bila bukan 200, penyebab berada di sisi SPLP.
2. Periksa apakah ada gangguan jaringan dari sisi Vercel dengan memeriksa log fungsi. Ingat bahwa jawaban 503 adalah perilaku yang disengaja (aplikasi memilih menolak menjawab daripada menyajikan angka basi).
3. Bila SPLP yang bermasalah, catat waktu mulai dan hubungi pengelola SPLP/SAPA sesuai jalur eskalasi (bagian 9). Tidak ada tindakan di sisi aplikasi yang dapat memulihkan sumber data.
4. Bila SPLP kembali normal, jalankan `/api/revalidate` dengan `{"tags":["all"]}` agar cache segera terisi ulang.

---

## 8. Batas anggaran waktu dan artinya bila terlampaui

Tiga batas berikut berlaku berurutan. Angka ini terverifikasi dari `vercel.json`, `src/lib/ai/env.ts`, `src/lib/ai/llm-client.ts`, dan `src/app/dashboard/DashboardClient.tsx`.

| Batas | Nilai | Sumber | Arti bila terlampaui |
|---|---|---|---|
| Anggaran panggilan model | 48 detik (`AI_TIMEOUT_MS`, bawaan 48000) | `src/lib/ai/env.ts` | Panggilan model dibatalkan dengan pesan `timeout setelah 48000 ms`. Bila Deterministik aktif, pengguna tetap menerima jawaban template; bila Deterministik mati, permintaan itu gagal dengan pesan sebabnya. Timeout tidak pernah diulang. |
| Batas sisi klien | 55 detik (`CLIENT_TIMEOUT_MS`) | `src/app/dashboard/DashboardClient.tsx` | Peramban membatalkan permintaan dan menampilkan pesan `Permintaan melewati batas 55 detik. Coba pertanyaan yang lebih singkat.` Klien adalah jaring terakhir, bukan pertama: server seharusnya sudah menyerah lebih dahulu. |
| Batas platform | 60 detik (`maxDuration` pada `vercel.json`, entri `/api/query` dan `/api/query/stream`) | `vercel.json` | Fungsi dihentikan oleh Vercel dan aliran jawaban terputus tanpa pesan yang rapi. Inilah sebabnya batas server dipertahankan di bawah 55 detik. |

Ketentuan tambahan yang perlu diketahui operator:

- Ada pengawas sambungan mandek `AI_FIRST_TOKEN_MS` (bawaan 15 detik). Bila tidak ada satu pun potongan keluaran pada rentang itu, sambungan diputus lalu dicoba ulang sekali dengan anggaran 30 detik; kasus terburuk 15 + 1 + 30 detik. Percobaan ulang hanya sah bila belum ada keluar. Perbedaan mendasar: sambungan mandek tidak akan pulih dan sebaiknya diputus, sedangkan model yang lambat masih dapat diselesaikan.
- Bila keluaran model tidak sesuai skema, sistem mengulang sekali secara non-streaming, hanya bila waktu terpakai masih di bawah 15 detik, dengan batas percobaan kedua 25 detik.
- Bila permintaan pengguna menembus 48 detik sementara saklar Deterministik mati, tidak ada jaring pengaman, sehingga panggilan tersebut menjadi galat. Bila sampai 60 detik, platform memutus fungsi. Menurunkan `AI_MAX_OUTPUT_TOKENS` bukan jalan keluar: pada nilai 1500, sebagian jawaban terpotong sebelum JSON selesai.
- Sebelum menuduh model lambat, pastikan fungsi benar-benar berjalan di region `sin1` (bagian 4.3).

---

## 9. Rollback deployment

Rollback dipakai bila versi yang sedang melayani produksi terbukti bermasalah. Lakukan melalui Vercel Dashboard karena itu jalur yang paling dapat diaudit.

1. Tentukan versi sehat terakhir.
   Hasil yang diharapkan: pada Vercel, buka proyek `sapa-ai` lalu tab Deployments, dan pilih deployment dengan status Ready yang dibuat sebelum perubahan bermasalah.
2. Jalankan Rollback pada deployment tersebut (menu titik tiga pada baris deployment, pilihan Rollback).
   Hasil yang diharapkan: domain produksi diarahkan kembali ke deployment tersebut.
3. Verifikasi versi yang benar-benar melayani produksi, bukan sekadar "deployment terbaru":

```bash
vercel api "/v13/deployments/<domain-produksi>"
```

Hasil yang diharapkan: pada `meta.githubCommitSha` tertulis hash commit yang Anda maksud. Jangan berasumsi deployment terbaru berarti kode terbaru.
4. Verifikasi kesehatan setelah rollback:

```bash
curl -s https://sapa-smart-ai.vercel.app/api/status
curl -s https://sapa-smart-ai.vercel.app/api/admin/status
```

Hasil yang diharapkan: `sapa.state: active` dan keadaan saklar sesuai harapan. Lalu uji satu pertanyaan dari halaman Beranda.
5. Catat kejadian: waktu, commit yang bermasalah, commit yang dipulihkan, dan gejala yang terlihat.

Catatan dari insiden sebelumnya (jangan diulang):

- Deployment yang macet pada status `INITIALIZING` menahan satu-satunya slot build pada paket Hobby, sehingga push berikutnya tidak pernah dibangun. Bebaskan dengan:

```bash
vercel api -X PATCH "/v12/deployments/<id-deployment>/cancel"
```

- Bila integrasi Git tidak membuat deployment sama sekali, jalankan dari direktori proyek: `vercel --prod --yes`.
- Deploy melalui CLI tidak otomatis mengarahkan domain produksi ke hasil build baru; gunakan `vercel promote <url>`.
- Periksa insiden platform Vercel sebelum menuduh kode (bagian 2 langkah 5).

---

## 10. Prosedur pemulihan lokal (uji sebelum menyentuh produksi)

1. Siapkan salinan lokal: `npm ci` (hanya bila `node_modules` belum ada).
2. Bangun dan uji:

```bash
npm run build
npx vitest run
npm run typecheck
```

Hasil yang diharapkan: build selesai, seluruh uji lulus, typecheck `[typecheck] OK`.
3. Jalankan server lokal: `npm run start -- -p 3104`.
   Hasil yang diharapkan: server siap pada `http://127.0.0.1:3104`.
4. Jalankan gerbang regresi terhadap server lokal (lihat dokumen `09-PENGUJIAN-DAN-MUTU.md` untuk seluruh pilihan perintah).
5. Commit hanya bila seluruh gerbang hijau. Repo mewajibkan `npm run build` dan `npx vitest run` hijau sebelum commit; jangan commit saat runner uji tidak dapat dijalankan.

---

## 11. Rambu operasional

1. Jangan matikan kedua saklar sekaligus tanpa alasan yang dicatat, karena hal itu melumpuhkan layanan jawaban.
2. Jangan menyalakan AI apabila gerbang mutu (mode shadow dengan model sungguhan) belum lulus, dan jangan mengganti model produksi tanpa pengukuran.
3. Jangan mengubah `vercel.json`, variabel lingkungan, atau saklar di tengah jam kerja tanpa memberi tahu pengguna aplikasi.
4. Jangan menuliskan nilai rahasia pada tiket, grup percakapan, atau dokumen serah terima.
5. Bila perubahan menyentuh perilaku jawaban, jalankan ulang `npm run build` dan `npx vitest run`. Pernah terjadi test masuk dalam keadaan gagal karena tidak dijalankan ulang setelah commit.

---

## 12. Jalur eskalasi

Isi tempat kosong berikut sebelum serah terima final. Format yang disarankan: nama, jabatan, nomor telepon/WhatsApp, surel.

### 12.1 Tingkat 1 — Pengguna melaporkan masalah

- Penanggung jawab penerimaan laporan: [ISI: nama — jabatan — nomor — surel]
- Kanal pelaporan: [ISI: kanal resmi, mis. surel/WhatsApp grup OPD]
- Target tanggapan awal: [ISI: contoh "1 jam kerja"]

### 12.2 Tingkat 2 — Pengelola aplikasi (teknis)

- Pengelola aplikasi (pemilik proyek Vercel `sapa-ai`): [ISI: nama — jabatan — nomor — surel]
- Pendamping teknis (pranata komputer Diskominfo): [ISI: nama — jabatan — nomor — surel]
- Tanggung jawab: menyalakan/mematikan saklar, menyegarkan cache, menjalankan rollback, mengelola variabel lingkungan.

### 12.3 Tingkat 3 — Pihak ketiga

- Penyedia model AI (akun langganan `opencode-go`): [ISI: akun pemilik langganan — kanal dukungan]
- Pengelola sumber data SPLP/SAPA: [ISI: unit — nomor — surel]
- Dukungan platform Vercel: [ISI: akun pemilik proyek — kanal dukungan]
- Pengelola penyimpanan status saklar (Upstash Redis): [ISI: akun pemilik — kanal dukungan]

### 12.4 Kriteria kapan naik tingkat

| Keadaan | Naik ke |
|---|---|
| Pengguna tidak dapat membuka halaman atau hasil tidak sesuai | Tingkat 2 |
| Saklar perlu diubah, cache perlu disegarkan, atau rollback diperlukan | Tingkat 2 |
| `sapa.state` bernilai `down` selama lebih dari 30 menit | Tingkat 3 (pengelola SPLP) |
| Kuota langganan model habis atau akun ditangguhkan | Tingkat 3 (penyedia model) |
| Insiden platform Vercel | Tingkat 3 (dukungan Vercel) |
