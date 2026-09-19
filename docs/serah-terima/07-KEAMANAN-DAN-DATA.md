# 07 — Keamanan dan Data

**Aplikasi:** SAPA Smart AI — asisten tanya-jawab data statistik Kabupaten Aceh Tengah
**Repo:** `Niumination/sapa-ai` (privat) · **Produksi:** `https://sapa-smart-ai.vercel.app`
**Platform:** Next.js 16 di Vercel, region `sin1` (Singapura)
**Target pembaca:** Bidang Statistik dan Persandian, Diskominfo Kabupaten Aceh Tengah
**Tanggal dokumen:** 19 September 2026

> Dokumen ini disusun hanya dari apa yang dapat dibuktikan di dalam repo. Setiap
> klaim menyebut berkas sumbernya. Perkara yang belum dapat dipastikan ditandai
> `(perlu dikonfirmasi)`.

---

## 1. Klasifikasi Data yang Diproses

### 1.1 Sumber data tunggal

Aplikasi ini **hanya** memakai satu sumber data: API SPLP SAPA.

- Berkas: `src/lib/sapa-client.ts`, baris 6 — `SPLP_BASE = 'https://api-splp.layanan.go.id/sapa/1.0/api'`.
- Endpoint yang dipanggil: `GET /daftar_data` (baris 86).
- Wilayah data: **agregat tingkat kabupaten**, bukan per-desa dan bukan per-orang.

### 1.2 Bentuk data yang diambil

Berdasarkan tipe `SapaRecord` (`src/lib/sapa-client.ts`, baris 48–59), satu record
memuat: `id`, `id_kode_indikator`, `kode_indikator_kode_indikator`,
`kode_indikator_nama_indikator`, `id_opds`, `opds_nama_opd`, `jadwal_pemutakhiran`,
`satuan`, `tahun`, `variabel`.

**Kesimpulan klasifikasi: data terbuka/agregat, bukan data pribadi.**

- Tidak ada satu pun field berupa NIK, nama orang, alamat, nomor telepon, atau
  identitas perorangan.
- Yang tersedia adalah angka indikator pembangunan beserta nama indikator, nama
  OPD pengampu, satuan, dan tahun — semuanya sudah dipublikasikan melalui portal
  SPLP/SAPA.
- Karena itu, dari sisi UU No. 27/2022 tentang Pelindungan Data Pribadi, data yang
  diproses **bukan** objek pelindungan data pribadi. Yang tetap perlu dijaga adalah
  kredensial sistem dan integritas jawaban, bukan kerahasiaan data statistiknya.

### 1.3 Data pribadi yang sengaja TIDAK diproses

Repo pernah menyiapkan jalur DTSEN (data kependudukan mentah berisi NIK/nama/alamat),
tetapi jalur itu sudah tidak dipakai. Bukti:

- `.gitignore` baris 9–11 memuat:
  `# Data DTSEN mentah BAPPEDA — PII (NIK/nama/alamat). JANGAN commit (UU PDP).`
  disusul `data/dtsen-raw/`.
- `AGENTS.md` menegaskan aturan "SAPA-only": tidak ada DTSEN, Bapokting, Excel,
  Prisma, JWT, login, cron, atau warehouse.
- Berkas mati terkait (`prisma.ts`, `auth.ts`, `splp-bridge.ts`, `data-source.ts`,
  `audit-log.ts`) sudah dihapus.

### 1.4 Batas yang jujur

- Aplikasi **tidak menyimpan** riwayat pertanyaan pengguna ke basis data. Riwayat
  laporan di sisi pengguna hanya hidup di `localStorage` peramban (di luar kendali
  server).
- Data statistik yang tersaji tetap bergantung pada mutu dan kemutakhiran SPLP;
  kekeliruan data sumber bukan kekeliruan keamanan, tetapi tetap menjadi risiko
  reputasi jawaban.

---

## 2. Aliran Data Lengkap

### 2.1 Dari pengguna ke penyimpanan sementara

1. Pengguna mengetik pertanyaan di halaman utama (`QueryBar`).
2. Peramban mengirim `POST` ke `/api/query` (JSON) atau `/api/query/stream` (SSE).
3. Fungsi server berjalan di region Vercel `sin1` (`vercel.json` baris 3).
4. `fetchSapaData()` mengambil katalog SAPA dari SPLP, dengan cache LRU di memori
   selama 10 menit (`src/lib/sapa-client.ts`, `SPLP_TTL_MS`).
5. Retrieval mencocokkan kata kunci pertanyaan dengan nama indikator
   (`retrieveRelevant`), lalu membangun daftar *evidence*.

### 2.2 Dari pengguna ke penyedia model pihak ketiga (fakta terpenting)

Bila narasi AI aktif, aplikasi mengirim permintaan ke penyedia model LLM eksternal
melalui HTTP `POST` ke `{baseUrl}{endpointPath}` — bawaannya
`https://opencode.ai/zen/go/v1/chat/completions` (`src/lib/ai/env.ts`, PRESETS
baris 54–64; pengiriman di `src/lib/ai/llm-client.ts`, fungsi `kirim` baris 113).
Header menyertakan `Authorization: Bearer <AI_API_KEY>`.

**Yang DIKIRIM ke penyedia model** (dibentuk di `src/lib/ai/prompt.ts`,
`buildPrompt` baris 32–54):

- `pertanyaan_pengguna` — teks pertanyaan pengguna, dipotong maksimum 500 karakter.
- `intent` — label maksud pertanyaan (bawaan `nilai_saat_ini`).
- `evidence` — maksimum 20 butir, tiap butir berisi: `id` (id indikator SAPA),
  `indikator`, `nilai`, `satuan`, `opd`, `tahun`.
- `statistik` — tiga angka ringkas: `totalRecord`, `totalOpd`, `evidenceDihitung`.
- `cara_menulis_angka` — instruksi teknis penulisan token `{{id}}`.
- Plus `system prompt` statis (aturan penulisan) dan `SCHEMA_HINT` (skema JSON).

**Yang TIDAK dikirim:**

- Kredensial apa pun (`AI_API_KEY` hanya dipakai sebagai header otorisasi ke
  penyedia, bukan dimasukkan ke isi prompt), `AI_ADMIN_KEY`, kredensial Redis,
  `REVALIDATE_SECRET`.
- Data pribadi: diblokir lebih dulu oleh palang guard sebelum panggilan model
  (lihat Bagian 5).
- Data mentah SPLP di luar potongan evidence yang relevan (aplikasi tidak mengirim
  seluruh katalog).

**Implikasi bagi Bidang Persandian:**

- Karena pertanyaan pengguna ikut keluar, isi pertanyaan — walau sudah melalui pagar
  data pribadi — secara teknis berpindah ke penyedia model pihak ketiga di luar
  infrastruktur Pemerintah Kabupaten. Kebijakan retensi dan lokasi pemrosesan di
  sisi penyedia **tidak berada dalam kendali repo ini** `(perlu dikonfirmasi)`.
- Potongan evidence (nama indikator, angka agregat, nama OPD) juga ikut terkirim.
  Karena data tersebut sudah publik melalui SPLP, risikonya rendah, tetapi tetap
  tercatat sebagai aliran keluar.
- Tidak ada kewajiban kontraktual yang terbukti dari repo terhadap penyedia model;
  hal ini perlu diatur pada tingkat kebijakan, bukan kode `(perlu dikonfirmasi)`.

### 2.3 Ringkasan aliran data

    Pengguna (peramban)
        │  POST /api/query | /api/query/stream
        ▼
    Fungsi Vercel (region sin1)
        │  GET /daftar_data (tanpa kredensial untuk endpoint publik)
        ▼
    API SPLP SAPA (api-splp.layanan.go.id/sapa/1.0/api)
        │  katalog agregat
        ▼
    Retrieval + deterministik (di server)
        │  guard → buildPrompt → POST /chat/completions (Bearer AI_API_KEY)
        ▼
    Penyedia model LLM pihak ketiga (OpenCode Go)
        │  JSON narasi ber-token {{id}}
        ▼
    Eject token → grounding → sajian ke pengguna

---

## 3. Daftar Rahasia Aplikasi

Seluruh rahasia dibaca melalui `process.env`. **Nilai rahasia tidak pernah
dituliskan di dokumen ini** — hanya nama variabelnya.

### 3.1 Daftar variabel

| Variabel | Kegunaan | Sumber di kode | Wajib? |
|---|---|---|---|
| `AI_API_KEY` | Kunci akses penyedia model LLM | `src/lib/ai/env.ts` | Ya, bila AI dihidupkan |
| `AI_ADMIN_KEY` | Kunci header `x-admin-key` panel admin | `src/app/api/admin/toggle-ai/route.ts` | Ya, agar panel bisa dipakai |
| `UPSTASH_REDIS_REST_URL` | Alamat REST Upstash Redis | `src/lib/store.ts` | Opsional (fallback memori) |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST Upstash Redis | `src/lib/store.ts` | Opsional |
| `REVALIDATE_SECRET` | Rahasia pembatal cache `/api/revalidate` | `src/app/api/revalidate/route.ts` | Opsional (lihat Bagian 6) |
| `SAPA_CLIENT_ID` | Client id OAuth SPLP | `src/lib/sapa-client.ts` | Tidak wajib saat ini |
| `SAPA_CLIENT_SECRET` | Client secret OAuth SPLP | `src/lib/sapa-client.ts` | Tidak wajib saat ini |

Catatan `SAPA_CLIENT_ID`/`SAPA_CLIENT_SECRET`: fungsi `getSapaAccessToken()` memang
ada, tetapi **tidak pernah dipanggil** oleh kode mana pun (diverifikasi dengan
pencarian di seluruh `src/`; hanya definisi di `src/lib/sapa-client.ts` yang
ditemukan). Endpoint `daftar_data` yang benar-benar dipakai bersifat publik dan
tidak memerlukan kredensial. Nilai bawaannya `SAPA_CLIENT_ID ?? '3'`.

### 3.2 Tempat penyimpanan

- **Produksi:** Vercel Dashboard → proyek `sapa-ai` → Settings → Environment
  Variables. Rahasia hanya hidup di sana, tidak pernah di-commit (`AGENTS.md`).
- **Lokal (workstation):** berkas `.env` dan `.env.local`. Bukti perlindungan:
  - `.gitignore` baris 13 (`.env*`) dan baris 4 (`.env.local`) mengabaikan keduanya.
  - Izin berkas `.env` di workstation adalah `-rw-------` (hanya pemilik).
- **Contoh yang boleh di-commit:** `.env.example` (`.gitignore` baris 20:
  `!.env.example`). Berkas ini sengaja hanya memuat placeholder dan komentar.

### 3.3 Siapa yang boleh memegang

- Sesuai `AGENTS.md` dan `.env.example`: `AI_ADMIN_KEY` — "hanya pemilik aplikasi
  yang tahu". Rahasia model dan Redis juga terbatas pada pemilik aplikasi/pengelola
  teknis.
- `SAPA_CLIENT_ID`/`SAPA_CLIENT_SECRET` hanya akan relevan bila kelak jalur OAuth
  SPLP dipakai; sampai saat itu tidak perlu disebar.
- Belum ada pembagian peran formal (lihat Bagian 8) `(perlu dikonfirmasi)` apakah
  ada pihak lain di Diskominfo yang resmi diberi akses.

### 3.4 Bukti bahwa `.env` tidak pernah masuk riwayat commit

- `git log --all -- .env .env.local` → kosong (tidak ada satu commit pun).
- `git ls-files` untuk pola `env` hanya menemukan: `.env.example` dan
  `src/lib/ai/env.ts` — tidak ada berkas rahasia.
- `.gitignore` memuat `.env*` dengan pengecualian tunggal `!.env.example`.

---

## 4. Kontrol Akses Panel Admin

### 4.1 Halaman

- Halaman: `/admin/ai-toggle` (`src/app/admin/ai-toggle/page.tsx`).
- Halaman meminta "Admin Key" pada kolom bertipe `password` dan mengirimkannya
  sebagai header `x-admin-key` pada setiap permintaan tulis.

### 4.2 Endpoint

- `POST /api/admin/toggle-ai` (`src/app/api/admin/toggle-ai/route.ts`) — mengubah
  state dua saklar.
- `GET /api/admin/toggle-ai` — membaca state (juga butuh kunci).
- `GET /api/admin/status` (`src/app/api/admin/status/route.ts`) — **publik, tanpa
  autentikasi**. Hanya mengembalikan `aiEnabled`, `detEnabled`, `backend`,
  `updatedAt`. Tidak membocorkan kunci apa pun.

### 4.3 Mekanisme otentikasi

- Kunci dicocokkan persis dengan `process.env.AI_ADMIN_KEY`:
  `if (!ADMIN_KEY || key !== ADMIN_KEY) return unauthorized();` (baris 12 dan 19).
- **Bila `AI_ADMIN_KEY` kosong, seluruh endpoint toggle selalu membalas 401** — panel
  tidak dapat dipakai. Ini perilaku yang aman secara bawaan (fail-closed).

### 4.4 Keterbatasan yang harus dinyatakan jujur

- **Kunci tunggal bersama.** Tidak ada peran pengguna, tidak ada sesi, tidak ada
  MFA. Siapa pun yang memegang satu kunci itu memegang seluruh kendali toggle.
- **Tanpa jejak audit per aksi.** State hanya menyimpan `updatedAt` dan `updatedBy`.
  Route penulis memanggil `writeToggleState({ aiEnabled, detEnabled })` tanpa
  argumen identitas, sehingga `updatedBy` selalu bernilai bawaan `'admin'`
  (`src/lib/ai/toggle.ts`, baris 48). Artinya tidak dapat diketahui **siapa** yang
  mengubah, hanya **kapan** terakhir diubah.
- **Perbandingan kunci tidak constant-time** (`!==` biasa). Ini risiko praktis yang
  sangat kecil namun secara teori rentan analisis waktu.
- **`/api/admin/status` terbuka untuk umum** — mengungkap keadaan layanan
  (aktif/nonaktif) dan backend penyimpanan kepada siapa pun yang menebak URL-nya.

---

## 5. Perlindungan Endpoint Revalidate

Berkas: `src/app/api/revalidate/route.ts`.

- Endpoint: `POST /api/revalidate`, menerima `tag`, `tags`, atau `all`.
- Tag yang diizinkan dibatasi daftar putih: `sapa-analytics`, `kpi`, `stats`,
  `report` (`ALLOWED_TAGS`). Tag lain ditolak dengan status 400.
- **Bila `REVALIDATE_SECRET` terpasang**, permintaan wajib menyertakan header
  `x-revalidate-secret` atau field `secret` di body yang sama persis dengan env.
  Ketidakcocokan → 401.
- **Bila `REVALIDATE_SECRET` TIDAK terpasang**, seluruh blok pemeriksaan dilewati
  (`if (secretEnv) { ... }`) — artinya **siapa pun dapat memanggil endpoint ini** dan
  memaksa pembatalan cache seluruh tag. Dampaknya adalah beban berulang ke API SPLP
  dan hilangnya manfaat cache, bukan kebocoran data. `.env.example` baris 56 sudah
  memperingatkan hal ini secara eksplisit.

---

## 6. Palang Penyaring Data Pribadi

### 6.1 Palang pada permintaan pengguna

Berkas: `src/lib/ai/guard.ts` dan pemanggilannya di
`src/services/answer-compose.ts`.

- `sanitizeQuery` — merapikan spasi, menolak query lebih pendek dari 3 karakter,
  memotong pada 500 karakter.
- `cekDataPribadi` — menolak pola NIK:
  - 16 digit berurutan (setelah menghapus titik/koma/apostrof); atau
  - pola berkelompok 4-4-4-4 dengan spasi, **kecuali** semua kelompoknya adalah
    tahun yang wajar (1900–2100) — supaya "2020 2021 2022 2023" (rentang tahun)
    tidak salah tertolak sebagai NIK.
- `cekPermintaanPerOrang` — menolak permintaan data per-orang dalam berbagai
  rumusan: "siapa nama penerima", "nama warga/orang/penduduk/mustahik",
  "identitas penerima/warga/penduduk/mustahik", "daftar/data warga/nama/orang/
  individu", atau "nama ... penerima/pkh/bansos/mustahik".
- **Pagarnya dipasang paling awal** di `composeAnswer` (langkah 0), sehingga berlaku
  di semua mode — deterministik, shadow, maupun AI aktif. Komentar kode mencatat
  bahwa dulu pagar ini hanya hidup di `guardQuery` dan praktis mati saat AI nonaktif,
  sehingga NIK ikut ke retrieval lalu ter-echo kembali ke layar; kesalahan itu sudah
  dikoreksi.
- Penanda upaya prompt-injection (`abaikan`, `ignore`, `bypass`, `system prompt`)
  **ditandai** untuk observabilitas, tetapi tidak langsung ditolak — keluaran tetap
  diground terhadap evidence.
- Query yang dikirim ke model **dibungkus sebagai data**, bukan sebagai instruksi.

### 6.2 Pesan penolakan yang diterima pengguna

Pesan didefinisikan di `src/services/answer-compose.ts` (baris 176–193):

- Untuk NIK: "Permintaan ini tidak dilayani karena memuat nomor identitas
  kependudukan (NIK). Portal SAPA Aceh Tengah hanya menyajikan data agregat
  indikator pembangunan dan tidak menyimpan data per-orang. Untuk data kependudukan
  per-orang, ajukan permohonan ke Dinas Kependudukan dan Pencatatan Sipil Kabupaten
  Aceh Tengah sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi."
- Untuk permintaan per-orang: "Permintaan ini tidak dilayani karena meminta data
  per-orang (nama atau identitas penerima). Portal SAPA Aceh Tengah hanya menyajikan
  indikator agregat per OPD dan tidak menyimpan daftar bernama orang. Untuk data
  penerima per-orang, ajukan permohonan ke OPD pengampu (Dinas Sosial atau
  Disdukcapil) sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi."
- Keduanya disertai saran pengajuan ulang sebagai pertanyaan agregat.

### 6.3 Gerbang otomatis sebelum commit

Berkas: `scripts/pii-gate.sh`, dipanggil oleh `.githooks/pre-commit`.

- `pii-gate.sh` memindai **seluruh pohon repo** (bukan hanya `src/`) untuk:
  - NIK 16 digit utuh; NIK yang sudah disensor berbentuk `[NIK...]`/`[REDACTED...]`
    tidak dihitung; berkas uji sintetis wajib mendeklarasikan penanda
    `pii-gate: izinkan NIK sintetis uji` agar dilewati secara terlihat;
  - pola kredensial: `sk-...`, `ghp_...`, `AKIA...`, dan blok
    `-----BEGIN ... PRIVATE KEY-----`.
- `.githooks/pre-commit` menjalankan `pii-gate.sh` lalu `typecheck.sh`; bila gate
  gagal, commit ditolak (exit 1).
- Hook aktif per-clone via `git config core.hooksPath .githooks`; di repo ini
  konfigurasi tersebut **sudah terpasang**, dan `package.json` script `prepare`
  memasangnya otomatis.

### 6.4 Gerbang kredensial (temuan penting yang jujur)

Skrip `scripts/secret-scan-staged.py` yang disebut sebagai palang otomatis
ekosistem **berada di repo induk `Niumination`, bukan di dalam repo `sapa-ai`.**
Verifikasi:

- `scripts/` di repo `sapa-ai` hanya berisi: `eval-run.mjs`, `mock-llm-server.mjs`,
  `pii-gate.sh`, `typecheck.sh` — **tidak ada** `secret-scan-staged.py`.
- Pencarian di `.githooks/pre-commit` dan folder `scripts/` repo `sapa-ai` **tidak
  menemukan** rujukan apa pun ke `secret-scan-staged.py`.
- Skrip itu hidup di `/Users/zaryu/Desktop/Niumination/scripts/secret-scan-staged.py`
  dan dipanggil oleh `/Users/zaryu/Desktop/Niumination/.githooks/pre-commit` (repo
  induk).

**Konsekuensinya:** gerbang `sapa-ai` (`pii-gate.sh`) memang menangkap NIK dan pola
kredensial umum yang tercantum di atas, **tetapi tidak menangkap** pola kredensial
lain yang justru ada di `secret-scan-staged.py` — antara lain token Telegram, JWT,
pola `PI_API_KEY`, dan penetapan rahasia generik (`api_key=...`), serta nama berkas
terlarang (`.env`, `*.pem`, `credentials.json`). Repo `sapa-ai` saat ini hanya
dilindungi oleh gerbang `secret-scan-staged.py` secara tidak langsung melalui hook
repo induk, dan hanya ketika commit dilakukan dari dalam struktur repo induk. Ini
adalah **celah pertahanan yang perlu ditutup** (lihat Bagian 8).

---

## 7. Header Keamanan

Hasil pemeriksaan berkas konfigurasi:

- `next.config.ts` — hanya berisi konfigurasi default; tidak ada blok `headers()`.
  Tidak ada `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`,
  atau header keamanan lain yang dipasang di tingkat aplikasi.
- `vercel.json` — hanya memuat `regions: ["sin1"]` dan `maxDuration: 60` untuk dua
  fungsi. Tidak ada `headers`.
- `src/middleware.ts` — **tidak ada** berkas middleware.

**Kesimpulan jujur:** aplikasi ini **tidak mengonfigurasi header keamanan khusus**
di dalam repo. Header yang mungkin ditambahkan otomatis oleh platform Vercel tidak
dapat diverifikasi dari repo ini `(perlu dikonfirmasi)` dan sebaiknya diuji langsung
ke produksi dengan `curl -sI https://sapa-smart-ai.vercel.app`.

---

## 8. Prosedur Rotasi Kredensial

Saat ini **tidak ada rotasi otomatis**; seluruh rotasi bersifat manual. Langkah
umum untuk setiap rahasia:

1. Terbitkan nilai baru pada penyedia terkait (penyedia model untuk `AI_API_KEY`;
   Upstash untuk kredensial Redis; SPLP untuk kredensial OAuth).
2. Buka Vercel Dashboard → proyek `sapa-ai` → Settings → Environment Variables.
3. Perbarui nilai pada environment produksi. Untuk `AI_ADMIN_KEY` dan
   `REVALIDATE_SECRET`, nilai barunya dibuat acak di luar repo.
4. Lakukan redeploy agar fungsi membaca nilai baru.
5. Verifikasi melalui `/api/status` (kondisi AI) dan uji panel admin dengan kunci
   baru agar dipastikan kunci lama sudah tidak berlaku.
6. Cabut/ajukan penghapusan nilai lama di sisi penyedia.
7. Bila rahasia juga tersimpan di workstation, perbarui `.env`/`.env.local` lokal
   dan pastikan tidak pernah di-commit.

Kadensi rotasi: **belum ditetapkan** `(perlu dikonfirmasi)`. Rekomendasi: minimal
setiap kali terjadi perubahan personel pengelola, dan berkala (mis. per semester).

---

## 9. Prosedur Bila Rahasia Diduga Bocor

1. **Anggap bocor.** Cabut segera rahasia terkait di sisi penyedia (revoke), jangan
   menunggu investigasi selesai.
2. **Ganti dengan nilai baru** (rujuk Bagian 8) dan redeploy.
3. **Bila `AI_ADMIN_KEY` yang bocor:** ganti kunci, lalu periksa state toggle di
   `/api/admin/status` dan panel admin untuk memastikan tidak ada perubahan tak sah.
4. **Bila `REVALIDATE_SECRET` bocor:** ganti nilainya; ingat bila dibiarkan kosong
   endpoint terbuka bagi siapa pun.
5. **Bila `UPSTASH_REDIS_REST_URL`/`_TOKEN` bocor:** rotasi token di Upstash. Karena
   state toggle dan seluruh cache/pencacah berada di sana, anggap isinya dapat
   diubah pihak lain sampai token diganti.
6. **Bila `AI_API_KEY` bocor:** cabut kunci di penyedia dan terbitkan yang baru;
   pantau penggunaan harian melalui `/api/status` (`dailyUsed`) dan meteran
   `ai:llm:<tanggal>`.
7. **Bila rahasia terlanjur masuk riwayat git:** ganti nilainya lebih dulu (langkah
   yang paling menentukan), lalu bersihkan riwayat repo dan rotasi token yang
   terpapar.
8. **Catat dan laporkan** kejadian kepada pengelola aplikasi dan Bidang Persandian,
   termasuk waktu, rahasia yang terpapar, dan tindakan yang diambil.

### 9.1 Pelajaran dari insiden nyata di ekosistem Niumination

Pada 16 September 2026, berkas `apps/pi-app-studio-mata/server/.env` yang memuat
`PI_API_KEY` **masuk ke riwayat repo publik** karena di-commit dengan `git add -f`
(berkas sebenarnya sudah di-ignore `.gitignore`). Peristiwa ini tercatat di
`AGENTS.md` induk dan di docstring `scripts/secret-scan-staged.py`.

Pelajaran yang berlaku untuk `sapa-ai`:

- `git add -f` adalah satu-satunya jalan berkas rahasia yang sudah di-ignore lolos
  ke riwayat. Praktik ini **dilarang** oleh aturan ekosistem.
- Palang yang sekarang mencegah pengulangan: `.githooks/pre-commit` repo induk yang
  memanggil `scripts/secret-scan-staged.py`, yang menolak commit bila (a) ada berkas
  staged yang sebenarnya di-ignore `.gitignore`, atau (b) isi berkas staged memuat
  pola kredensial (nilai tidak pernah dicetak ke log).
- Khusus `sapa-ai`, `pii-gate.sh` melindungi dari NIK dan pola kredensial umum,
  tetapi cakupannya lebih sempit daripada `secret-scan-staged.py` (lihat 6.4).

---

## 10. Daftar Risiko Terbuka (Jujur)

Risiko berikut **nyata dan belum tertutup** pada saat dokumen ini ditulis. Tidak ada
klaim "aman" untuk perkara yang memang belum diselesaikan.

1. **Data pertanyaan dan potongan evidence dikirim ke penyedia LLM pihak ketiga.**
   Kebijakan retensi/lokasi pemrosesan di sisi penyedia berada di luar kendali repo.
   Perlu payung kebijakan/kontrak.
2. **Tanpa jejak audit per-aksi.** Perubahan toggle hanya meninggalkan `updatedAt`
   dan `updatedBy` bernilai tetap `'admin'`. Tidak ada log siapa mengubah apa dan
   kapan.
3. **Tanpa peran pengguna (RBAC) dan tanpa MFA.** Panel admin hanya dilindungi satu
   kunci bersama.
4. **Kunci admin tunggal.** Tidak ada pemisahan tugas; kunci yang sama untuk semua
   operasi toggle.
5. **Tanpa rotasi otomatis** untuk seluruh kredensial.
6. **State toggle berada di Upstash Redis** — dapat dibaca dan diubah oleh siapa pun
   yang memegang kredensial Redis. Bila Redis tidak dikonfigurasi, state jatuh ke
   memori dan berlaku per-instance (panel sudah memperingatkan hal ini).
7. **`/api/admin/status` publik** — mengungkap status layanan dan backend
   penyimpanan tanpa autentikasi.
8. **`/api/revalidate` terbuka bila `REVALIDATE_SECRET` tidak dipasang** — siapa pun
   dapat memaksa pembatalan cache.
9. **Tanpa header keamanan** yang dikonfigurasi di repo (CSP, X-Frame-Options, HSTS,
   dan sejenisnya).
10. **Perbandingan kunci admin tidak constant-time.**
11. **Rate limit melemah tanpa Redis** — menjadi "limit × jumlah instance aktif",
    sehingga proteksi tidak sekuat yang tertulis (didokumentasikan di komentar
    `src/lib/store.ts`).
12. **Gerbang kredensial `sapa-ai` lebih sempit daripada repo induk** (lihat 6.4) —
    pola seperti `PI_API_KEY`, JWT, Telegram token, dan penetapan rahasia generik
    tidak tertangkap oleh `pii-gate.sh` repo ini.
13. **Berkas `.env` dan `.env.local` tersimpan di workstation.** Terlindungi dari
    git, tetapi bergantung pada keamanan perangkat.
14. **Ketergantungan pada ketersediaan langganan penyedia model.** Saat langganan
    mandek, layanan berhenti melayani (lihat dokumen 08). Ini risiko kontinuitas,
    bukan kebocoran.

### Rekomendasi perbaikan (usulan, belum dijalankan)

- Pasang `secret-scan-staged.py` (atau ekuivalennya) juga pada `.githooks/pre-commit`
  repo `sapa-ai`.
- Tambahkan header keamanan melalui `next.config.ts` atau `vercel.json`.
- Wajibkan `REVALIDATE_SECRET` dan `AI_ADMIN_KEY` di produksi.
- Tambahkan log audit per-aksi (siapa/kapan/nilai lama-baru) untuk perubahan toggle.
- Tetapkan prosedur dan kadensi rotasi kredensial secara tertulis.
- Tetapkan kebijakan tertulis mengenai pengiriman pertanyaan ke penyedia LLM pihak
  ketiga.

---

## 11. Rujukan Berkas

| Pokok | Berkas |
|---|---|
| Sumber data SPLP | `src/lib/sapa-client.ts` |
| Pagar data pribadi | `src/lib/ai/guard.ts` |
| Alur jawaban & penolakan | `src/services/answer-compose.ts` |
| Penyimpanan bersama (Redis/memori) | `src/lib/store.ts` |
| State toggle | `src/lib/ai/toggle.ts` |
| Panel admin | `src/app/admin/ai-toggle/page.tsx` |
| API toggle admin | `src/app/api/admin/toggle-ai/route.ts` |
| API status toggle publik | `src/app/api/admin/status/route.ts` |
| Endpoint revalidate | `src/app/api/revalidate/route.ts` |
| Gerbang PII | `scripts/pii-gate.sh`, `.githooks/pre-commit` |
| Gerbang kredensial ekosistem | `/Users/zaryu/Desktop/Niumination/scripts/secret-scan-staged.py` |
| Daftar env contoh | `.env.example` |
| Pengecualian git | `.gitignore` |
