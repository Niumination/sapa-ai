# 09 — Audit Keamanan Penggabungan (apakah cabang `usulan/...` aman dilanjutkan?)

**Pertanyaan pemilik:** *"Saya tidak mau mengganggu branch `main` yang aktif sekarang. Apakah perubahan/upgrade di branch usulan ini aman untuk dilanjutkan ke tingkat lebih lanjut?"*

**Jawaban singkat: YA — aman, dan `main` sejauh ini benar-benar belum tersentuh.** Cabang ini berdiri
6 komit tepat di atas `main`, bisa digabung tanpa konflik (fast-forward), tidak mengubah dependensi,
tidak mengubah skema data, dan kontrak API-nya tetap sama. Ada **4 syarat** yang harus dipenuhi saat
penggabungan — semuanya operasional, bukan perubahan kode (daftar di §7).

**Tanggal audit:** 22 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` @ `e1aee38` ·
**`main`:** `ff00eb8` (tidak berubah, tidak tersentuh)

---

## 1. Posisi cabang — bukti bahwa `main` aman

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| `main` masih di tempat semula | `git log --oneline main -1` | `ff00eb8 docs(dox): status selesai — menunggu client (19 Sep 2026)` |
| Cabang di atas `main`, tanpa divergensi | `git merge-base main <cabang>` | sama dengan `main` (`ff00eb8`) → **0 komit di `main` yang belum ada di cabang** |
| Jumlah komit di cabang | `git rev-list --count main..<cabang>` | **6 komit** |
| Bisa fast-forward? | `git merge-base --is-ancestor main <cabang>` | **YA** |
| Uji gabung (tanpa menyentuh `main`) | `git merge-tree --write-tree main <cabang>` | **0 konflik** |
| Uji gabung nyata (worktree sementara) | `git merge <cabang>` di worktree `main` | **berhasil, tanpa konflik**, hasilnya identik `e1aee38` |
| Berkas dihapus | `git diff --diff-filter=D` | **0** |
| Dependensi berubah | bandingkan `package.json` | **tidak ada paket baru/terhapus** → Vercel tidak perlu ubah apa pun di sisi build |

Enam komit tersebut:

```
e1aee38 Gelombang 3 (susulan): status penyedia tidak boleh berbohong saat jaringan gagal
e065752 Gelombang 3: AI tidak lagi kalah dari deterministik + eval 78/78
a533915 kebersihan: pulihkan bit eksekusi (snapshot tidak menyimpan mode berkas)
cbfabd5 kebersihan: pulihkan bit eksekusi .githooks/pre-commit & scripts/pii-gate.sh
d810fc1 Fase 2: gerbang niat-meta + normalisasi singkatan + runner eval dinamis
6a3e292 usulan: circuit breaker penyedia, metrik jujur, revalidate fail-closed
```

## 2. Ruang lingkup: apa yang disentuh, apa yang tidak

**Ringkas: 33 berkas, +2.878 −979 baris, 0 berkas dihapus, 0 berkas baru di luar `src/`.**

| Wilayah | Status | Catatan |
|---|---|---|
| `package.json` · `package-lock.json` | **tidak disentuh** | nol dependensi baru — permukaan risiko rantai pasok tetap nol |
| `vercel.json` | **tidak disentuh** | batas runtime & region tidak berubah |
| `middleware.ts` | **tidak disentuh** | tidak ada perubahan penanganan permintaan/auth |
| `.env.example`, `docs/`, `AGENTS.md` | **tidak disentuh** | dokumentasi repo tidak "dirampas" tanpa persetujuan |
| Skema data / Prisma / migrasi | **tidak ada** | tidak ada perubahan basis data apa pun |
| Komponen UI (`src/components/*`) | **tidak disentuh** | tampilan tidak berubah; satu-satunya penyentuh UI-nya adalah halaman status |
| Rute API yang berubah isi | **hanya 2**: `POST /api/revalidate` (pagar akses) dan `GET /api/status` (pelaporan jujur) | rute `POST /api/query` **tidak** diubah tanda-tangannya |
| Berkas berubah hanya karena *mode* (kosmetik) | 8 berkas (`README.md`, `tsconfig.json`, `next.config.ts`, `globals.css`, `favicon.ico`, dll.) | **isi 0 baris**; hanya bit eksekusi 755 → 644 yang melekat dari unggahan awal repo |

## 3. Kontrak API — aplikasi lama tetap jalan

Dibandingkan langsung `POST /api/query` produksi (`main`) vs cabang, pertanyaan yang sama:

| Pemeriksaan | Hasil |
|---|---|
| Kunci objek respons | **identik 14/14** (`aggregated, ai, answer, count, dataSource, evidence, matched, narasi, opds, query, rekomendasi, source, timestamp, visualisasi`) |
| Kunci yang **hilang** di cabang | **tidak ada** |
| Kunci field `ai.*` | sama, ditambah `intent` (**tambahan**, bukan penggantian) |
| Field `evidence[]` | struktur sama; tidak ada field yang hilang |

Artinya: lapisan tampilan, integrasi, atau skrip lain yang membaca respons API **tidak akan rusak**.
Tambahan field bersifat aditif (`ai.intent`, `ai.nilaiTambah`, `ai.sitasiAi`, `ai.sitasiDeterministik`,
`ai.catatanDisisipkan`), dan hanya muncul pada jalur AI.

## 4. Bukti perilaku: apa yang berubah bagi pengguna

16 pertanyaan campuran dijalankan ke **produksi (main, live)** dan ke **cabang (lokal)**, tanpa
menyentuh `main`. Skrip: `verifikasi/banding-main-vs-branch.py`, hasil: `verifikasi/aman-cabang-perilaku.txt`.

| Hasil | Jumlah | Rincian |
|---|---|---|
| Perilaku **identik** | **13/16** | jumlah bukti dan tiga indikator teratas sama persis |
| Berbeda — **perbaikan yang disengaja** | 3/16 | lihat di bawah |
| Perbedaan yang tidak diinginkan | **0** | — |

Tiga perbedaan itu memang inti gelombang 3:

| Pertanyaan | Produksi (`main`) | Cabang | Sifat |
|---|---|---|---|
| Bandingkan IPM dengan target nasional | jawab "target INM" | **IPM 78,09** muncul di urutan atas | menyesatkan → benar |
| Persebaran keluarga per desa di Kec. Bebesen | jawab data UMKM/kader KB | **jujur: data per desa tidak ada** | menyesatkan → jujur |
| Berapa persebaran... (mock tidak menguangkan token) | — | daftar bukti berbeda | artifak **mock**, bukan kode (kedua daftar sama-sama berisi PPKS) |

**Latensi (temuan besar):** produksi menjawab rata-rata **11.440 ms** per pertanyaan ber-bukti,
cabang **563 ms** — karena produksi masih membakar ~11,7 detik menunggu penyedia AI yang langganannya
mati, lalu menyerahkan jawaban template yang sama. Ini perbaikan yang langsung dirasakan pengguna
*sebelum* langganan diperpanjang sekalipun.

## 5. Keamanan — apa yang ditutup cabang ini

| # | Temuan | Status di produksi (`main`) | Status di cabang |
|---|---|---|---|
| S-1 | `POST /api/revalidate` tanpa rahasia | **MASIH TERBUKA** — diuji 21 & 22 Sep 2026: `POST {"tag":"kpi"}` **tanpa kredensial apa pun** → `HTTP 200 {"status":"ok","revalidated":["kpi"]}`. Siapa pun dapat membatalkan cache produksi berulang kali (pemicu beban SPLP). | **Ditutup, fail-closed**: tanpa `REVALIDATE_SECRET` endpoint **menolak semua** permintaan; dengan rahasia → `200` bertanda; `REVALIDATE_ALLOW_UNSIGNED=true` hanya bila benar-benar disengaja. Terverifikasi lokal (401 tanpa rahasia, 200 dengan rahasia). |
| S-2 | Laporan status AI tidak jujur saat penyedia mati | `state: active`, `llmToday: 0`, `dailyUsed: 55` (kuota naik tanpa satu pun panggilan sukses) | `reason` menyebut penyebabnya, `reachable: false`, `health` memuat sebab & sisa cooldown |
| S-3 | **Temuan baru hari ini:** panel melaporkan `"sehat"` padahal **jaringan ke penyedia gagal** (mis. `AI_BASE_URL` salah tulis) | `DIHITUNG` hanya `auth/throttle/server` → kegagalan jaringan & timeout tidak dihitung, sirkuit tak pernah terbuka, `health.state` tetap `"sehat"` | **Diperbaiki** (commit `e1aee38`): `jaringan` & `timeout` ikut dihitung, ambang tetap 3× berturut; `konfigurasi` (400) dan `stall` sengaja tetap di luar. Terverifikasi: penyedia mati → 2,1 dtk → 0,45 dtk → **0,14 dtk** setelah sirkuit terbuka, dan `/api/status` jujur (`reachable:false`, `state:"terbuka"`, `sebab:"jaringan"`) |

Catatan kejujuran: temuan S-3 **tidak** ditemukan oleh uji, melainkan oleh audit ini. Uji sudah
ditambahkan (3 uji baru) plus isolasi keadaan sirkuit antar-uji.

## 6. Risiko yang masih ada (dan mitigasinya)

| Risiko | Kemungkinan | Dampak | Mitigasi |
|---|---|---|---|
| Perilaku model **sungguhan** berbeda dari provider tiruan | Sedang | Mutu bahasa bisa beda | Gerbang nilai-tambah otomatis menolak jawaban AI yang lebih miskin → **kebenaran tidak berisiko**, paling buruk AI tidak dipakai. Validasi ulang 2 perintah saat langganan aktif (`07` §G) |
| Biaya token naik (prompt memuat acuan draf) | Sedang | Kuota harian lebih cepat habis | `AI_DAILY_CALL_LIMIT` tetap berlaku; evidence kosong = tanpa panggilan (hemat 100%); pengunci cache prompt ada di Fase 2 peta jalan |
| `REVALIDATE_SECRET` lupa diset setelah gabung → penyegaran cache otomatis (jika ada) gagal | Sedang | Cache tidak bisa dibatalkan manual | Ini **sengaja** (fail-closed). Set rahasia di Vercel, atau set `REVALIDATE_ALLOW_UNSIGNED=true` bila memang ingin terbuka seperti sekarang — tapi tidak disarankan |
| Cache di jalur kueri AI (dari gelombang 2) membuat diagnosis menyesatkan | Rendah | Diagnosis, bukan pengguna | Sudah dicatat di `02`; tidak menghambat penggabungan |
| Bit eksekusi melekat (755 → 644) pada berkas non-skrip | Nol | Tidak ada | Hanya kosmetik; `.githooks/pre-commit` & `scripts/pii-gate.sh` **tetap** 755 dan terverifikasi di git |

## 7. Cara melanjutkan dengan aman (disarankan berurutan)

`main` milik Anda tidak akan tersentuh sampai langkah 4 dilakukan, dan tiap langkah bisa dibatalkan.

1. **Dorong cabang ke GitHub** (aman — bukan `main`):
   `git push origin usulan/perbaikan-ai-2026-09-21`
2. **Jadikan Preview Deployment** di Vercel dari cabang itu (atau cabang staging), lalu uji halaman
   `/dashboard` dan beberapa pertanyaan di URL preview. Di sini `main` masih utuh dan produksi tidak berubah.
3. **Set variabel lingkungan di Vercel:** `REVALIDATE_SECRET=<rahasia acak panjang>`.
   (Opsional, tidak berubah: `AI_*` yang sudah ada biarkan seperti sekarang.)
4. **Gabungkan ke `main`** — fast-forward mulus, atau lewat Pull Request bila Anda ingin jejak tinjauan.
   Perintah: `git checkout main && git merge --ff-only usulan/perbaikan-ai-2026-09-21 && git push origin main`
5. **Setelah produksi naik, ukur 3 hari:** latensi rata-rata `/api/query`, `dailyUsed`, dan bagian
   `ai.nilaiTambah` (`dipakai` / `dipakai-dengan-catatan` / `ditolak-*`) di `/api/status`.

**Rencana mundur (rollback) bila ada yang tidak diharapkan:** Vercel menyimpan tiap deployment —
"Promote to Production" pada deployment `ff00eb8` mengembalikan produksi ke keadaan semula dalam
hitungan detik; di Git, `git revert` 6 komit tersebut. Tidak ada migrasi data yang perlu dibatalkan.

## 8. Cara mengulang audit ini

```bash
# 1. posisi & keamanan penggabungan
git merge-base --is-ancestor main usulan/perbaikan-ai-2026-09-21 && echo "fast-forward aman"
git merge-tree --write-tree main usulan/perbaikan-ai-2026-09-21 | grep -c CONFLICT   # harus 0

# 2. uji coba gabung di worktree sementara (main tidak tersentuh)
git worktree add --detach /tmp/uji main && cd /tmp/uji && git merge --no-edit usulan/perbaikan-ai-2026-09-21

# 3. perbandingan perilaku produksi vs cabang
python3 verifikasi/banding-main-vs-branch.py

# 4. kerentanan revalidate di produksi (SAAT INI masih 200 — bukti temuan S-1)
curl -s -X POST https://sapa-smart-ai.vercel.app/api/revalidate \
  -H 'Content-Type: application/json' -d '{"tag":"kpi"}' -w '\nHTTP %{http_code}\n'
```

## 9. Kesimpulan

| Pertanyaan | Jawaban |
|---|---|
| Apakah `main` sudah terganggu? | **Belum sama sekali.** `main` = `ff00eb8`, tidak pernah ditulis |
| Apakah penggabungan nanti berisiko konflik? | **Tidak.** 0 konflik, fast-forward, 0 berkas dihapus |
| Apakah aman dilanjutkan ke tingkat lebih lanjut? | **Ya.** Perubahan menyentuh 2 rute API (keduanya pagar/pelaporan), tidak menyentuh dependensi, skema data, atau UI |
| Apakah ada risiko tersembunyi? | Tiga yang perlu diketahui: perilaku model sungguhan belum diuji (dipagari gerbang), token lebih boros, dan `REVALIDATE_SECRET` wajib diset setelah gabung |
| Apakah ada alasan menunggu? | Hanya satu: bila Anda ingin melihat AI dengan langganan aktif dulu sebelum digabung. Tetapi perbaikan latensi (11,4 dtk → 0,56 dtk), penutupan celah revalidate, dan kejujuran status **sudah bermanfaat tanpa langganan** |
