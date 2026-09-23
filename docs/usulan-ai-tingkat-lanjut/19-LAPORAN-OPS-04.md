# 19 — Laporan OPS-04: Pemberitahuan Operator Saat Sirkuit Penyedia AI Terbuka

**Tanggal:** 23 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` (tidak menyentuh `main`)
**Kriteria terima (dokumen 10):** *operator diberi tahu tanpa membuka panel* — di laporan ini
dibuktikan dengan uji ujung-ke-ujung yang benar-benar **menyalakan** penyedia yang menolak,
**mengukur** notifikasi yang keluar, lalu **memadamkan** gangguannya dan menuntut kabar pemulihan.

---

## 1. Masalah yang diselesaikan

Sirkuit penyedia (OPS-02, sudah ✅) membuat **sistem** aman: ketika kunci ditolak atau penyedia
mati berulang, panggilan model dilewati seketika dan pengguna tetap menerima jawaban
deterministik. Yang belum ada: **operator tidak tahu apa-apa.**

Kejadian nyata 21 September 2026 — langganan penyedia belum diperpanjang — memperlihatkan
bentuk kegagalannya dengan jelas:

| Yang terjadi | Akibat |
|---|---|
| Penyedia menjawab 403 "langganan mati" | jalur AI berhenti bekerja |
| Pengguna tetap dilayani (jawaban deterministik) | **tidak ada keluhan yang masuk** |
| Tidak ada tanda apa pun di luar panel admin | AI bisa mati berjam-jam tanpa seorang pun tahu |
| Perbaikan menunggu ada orang membuka panel | gangguan berlanjut bukan karena sulit diperbaiki, tetapi karena tidak ada yang tahu |

Notifikasi bukan hiasan: ia mengubah gangguan yang **tak terlihat** menjadi pekerjaan yang
**terjadwal**. Itulah satu-satunya perbedaan antara "sistem tidak error" dan "layanan benar-benar
berjalan".

---

## 2. Apa yang dikerjakan

### 2.1 Dua jalur pemanggilan, satu mesin keadaan

| Jalur | Kapan berjalan | Sifat |
|---|---|---|
| **Jalur jawaban** (`llm-client.ts`, 5 titik setelah `catatGagal`/`catatSukses`) | setiap permintaan warga yang menyentuh model | **nirblokir** — dipanggil dengan `void`, tidak menambah satu milidetik pun, tidak pernah melempar |
| **`/api/admin/peringatan`** | penjadwal luar (cron) + pemeriksaan manual operator | fail-closed (`ADMIN_TOKEN`), tiga mode |

Keduanya memakai mesin keadaan yang sama, sehingga tidak mungkin "jalur A bilang sehat, jalur B
bilang terbuka".

```ts
periksaPeringatanSirkuit(await catatGagal(sebab, pesan));   // di llm-client — tidak pernah melempar
```

### 2.2 Mesin keadaan: satu episode, tanpa spam

| Keadaan | Tindakan | Status yang dilaporkan |
|---|---|---|
| Sirkuit sehat, tidak ada episode | tidak ada | `tenang` |
| Sirkuit terbuka, episode belum ada | **kirim segera** | `peringatan-dikirim` |
| Sirkuit terbuka, sudah pernah dikirim, **< 15 menit** atau jeda ulang belum lewat | tahan | `masih-terbuka` |
| Sirkuit terbuka, ≥ ambang (**15 menit**) **dan** jeda ulang (**60 menit**) lewat | kirim ulang | `peringatan-diulang` |
| Semua saluran gagal saat kirim | catat, coba lagi setelah jeda gagal (**5 menit**) | `gagal-kirim` |
| Sirkuit sehat, episode masih terbuka | kirim kabar **pulih**, tutup episode | `pulih-dikirim` |

Tiga keputusan yang penting dijelaskan terang-terangan:

1. **Peringatan pertama keluar pada detik sirkuit terbuka, bukan pada menit ke-15.** Kalimat
   dokumen 10 ("bila sirkuit terbuka > 15 menit, kirim notifikasi") dimaksudkan untuk mencegah
   notifikasi palsu atas gangguan sekejap. Menahan kabar selama 15 menit pada layanan publik
   justru merugikan: operator kehilangan fase awal gangguan, ketika perbaikan masih paling murah.
   Karena itu ambang 15 menit tetap dipakai — sebagai **ambang eskalasi** (`SAPA_ALERT_ESKALASI_MENIT`)
   — sementara peringatan pertama keluar langsung. Kriteria terima terpenuhi dari dua arah.
2. **Jeda ulang 60 menit** (`SAPA_ALERT_JEDA_ULANG_MENIT`) menjaga perhatian operator: sirkuit yang
   tetap terbuka tidak mengirim pesan tiap menit. Ulangan menuntut **dua** syarat: gangguan sudah
   bertahan ≥ 15 menit **dan** jeda ulang sudah lewat.
3. **Klaim sebelum kirim.** Episode ditandai aktif **sebelum** pengiriman, bukan sesudah. Dengan
   begitu dua permintaan paralel (atau dua instance serverless) tidak mengirim dua peringatan
   pertama untuk gangguan yang sama. Keadaan disimpan di penyimpanan bersama
   (`sapa:ops:peringatan:v1`, TTL 30 hari) — Redis bila tersedia, memori bila tidak.

### 2.3 Saluran dan penyaringan rahasia

| Saluran | Env | Catatan |
|---|---|---|
| Telegram | `SAPA_ALERT_TELEGRAM_BOT_TOKEN` + `SAPA_ALERT_TELEGRAM_CHAT_ID` | dipasang hanya bila **keduanya** ada (tidak setengah jadi); balasan `ok:false` dihitung **gagal** meski HTTP 200 |
| Webhook umum | `SAPA_ALERT_WEBHOOK_URL` (+ opsional `SAPA_ALERT_WEBHOOK_TOKEN` → `Authorization: Bearer`) | JSON `{jenis, judul, teks, sirkuit{…}}`; bisa diarahkan ke penerus Surel apa pun |
| Panel | `SAPA_ALERT_PANEL_URL` | tautan tindak lanjut di setiap pesan (bawaan: panel saklar AI produksi) |

Pesan yang keluar **disaring** lebih dulu (`saringRahasia`): rahasia yang kita ketahui sendiri,
lalu pola `sk-…`, `Bearer …`, token acak ≥ 32 karakter, dan token bot Telegram. Alasannya konkret:
badan galat penyedia kadang mengutip potongan permintaan kita — termasuk kunci.

Tanpa saluran terpasang, modul ini **tidak berpura-pura**: statusnya `tanpa-saluran`, endpoint
melaporkannya `siap:false` beserta cara memasangnya, dan **episode tidak dibuka** — supaya saat
saluran dipasang, peringatan pertama tetap terkirim (bukan hilang karena "sudah pernah dibuka").

### 2.4 Endpoint admin (fail-closed)

```
GET /api/admin/peringatan?token=…            → periksa sekarang, kirim bila perlu
GET /api/admin/peringatan?token=…&kering=1   → hanya menghitung + pratinjau pesan (tanpa kirim, tanpa ubah keadaan)
GET /api/admin/peringatan?token=…&uji=1      → kirim satu notifikasi uji ke semua saluran
```

`?uji=1` ada karena pertanyaan operator yang sah bukan "apakah kodenya jalan", melainkan
"apakah pesannya benar-benar sampai ke ponsel saya". `?kering=1` ada karena operator perlu bisa
memeriksa **tanpa** memicu episode palsu.

---

## 3. Berkas

| Berkas | Isi |
|---|---|
| `src/lib/ai/notifikasi.ts` **(baru)** | mesin keadaan, penyusun pesan, saluran, penyaring rahasia, pembungkus nirblokir |
| `src/lib/ai/__tests__/notifikasi.test.ts` **(baru)** | 20 uji: urutan episode, antispam, kegagalan, kering, rahasia, saluran |
| `src/app/api/admin/peringatan/route.ts` **(baru)** | endpoint operator (periksa · kering · uji), fail-closed |
| `src/lib/ai/llm-client.ts` | 5 titik panggil: peringatan ikut dipicu oleh jalur jawaban nyata |
| `scripts/uji-peringatan.mjs` **(baru)** | harness ujung-ke-ujung: saluran tiruan (sink) + penyedia yang bisa dibalik 401 → 200 |
| `verifikasi/uji-terima.sh` + `docs/…/uji-terima.sh` | §6f baru (byte-identical) |
| `verifikasi/uji-peringatan.txt`, `…-bukti.json` | bukti jalannya uji + isi notifikasi yang benar-benar diterima |
| `.github/workflows/peringatan.yml` **(baru)** | penjadwal 10 menit untuk kasus **tidak ada lalu lintas** (dorman bila rahasia belum diisi) |

---

## 4. Bukti terukur

### 4.1 Uji unit & statis

| Pemeriksaan | Hasil |
|---|---|
| `npx vitest run` | **33 berkas / 514 uji lulus** (naik dari 32/494 — 20 uji baru) |
| `npm run typecheck` | bersih |
| `npm run build` | sukses |

### 4.2 Uji terima otomatis (§6f)

```
── 6f. Notifikasi sirkuit penyedia (OPS-04) ──
  ✓ peringatan keluar saat sirkuit terbuka + tidak spam + kabar pemulihan (ringkasan: 13 ✓ / 0 ✗, 3 notifikasi)
```

Seluruh kit: **37 ✓ (naik dari 35)**, `exit 0`, §6e tetap 4/4 — tersimpan di
`verifikasi/uji-terima-hasil.txt`.

### 4.3 Bukti bahwa notifikasinya NYATA (bukan laporan kode)

Harness mengendalikan saluran webhook tiruan dan penyedia tiruan. Tiga notifikasi berikut
**benar-benar diterima** saluran (`verifikasi/uji-peringatan-bukti.json`):

```
── 2026-09-23T05:30:11.448Z sirkuit-terbuka
[SAPA] Sirkuit penyedia AI TERBUKA (0 menit)
sebab    : auth — kunci ditolak / langganan mati
pesan    : HTTP 401: {"error":{"message":"invalid api key — uji OPS-04","type":"auth_error"}}
dibuka   : 2026-09-23T05:30:11.440Z
gagal    : 2 berturut (auth: 2)
cooldown : sisa 30 dtk, lalu percobaan setengah terbuka otomatis
dampak   : panggilan model dilewati → pengguna menerima jawaban deterministik (tanpa galat)
panel    : https://sapa-smart-ai.vercel.app/admin/ai-toggle

── 2026-09-23T05:30:11.461Z uji
[SAPA] Uji notifikasi OPS-04 (bukan gangguan)  … panel: …/admin/ai-toggle

── 2026-09-23T05:30:43.637Z sirkuit-pulih
[SAPA] Sirkuit penyedia AI PULIH (terbuka 0 menit)
berhasil: 2026-09-23T05:30:43.628Z
dampak  : narasi AI dilayani lagi seperti biasa
```

Angka "(0 menit)" pada peringatan pertama bukan cacat: ia memang keluar pada detik itu (lihat
§2.2 butir 1). Angka menit menjadi bermakna pada pengulangan dan pada kabar pemulihan.

Catatan aplikasi yang sepadan (log server uji):

```
[ai-error] {"query":"Berapa Populasi Ternak Sapi …","tahap":"panggil","galat":"HTTP 401: …"}
[ops-alert] sirkuit-terbuka terkirim via webhook
[ops-alert] uji terkirim via webhook
[ops-alert] sirkuit-pulih terkirim via webhook
```

### 4.4 Yang diperiksa harness (13 butir, semuanya bisa GAGAL)

| # | Butir yang diperiksa |
|---|---|
| 1 | **Model benar-benar dipanggil** (uji tidak vakum) — dilaporkan jumlahnya |
| 2 | Peringatan keluar saat sirkuit terbuka tanpa membuka panel |
| 3 | Sebab yang dilaporkan benar (`auth`) |
| 4 | Pesan memuat keadaan + tautan panel |
| 5 | Pesan **bebas rahasia/kunci** |
| 6 | Pemeriksaan ulang **tidak** mengirim peringatan baru (tidak spam) |
| 7 | Episode tercatat aktif (keadaan tersimpan antar-permintaan) |
| 8 | Pemeriksaan kering melaporkan rencana + pratinjau **tanpa** mengirim |
| 9 | Notifikasi uji **sampai** ke saluran |
| 10 | Tidak ada kiriman tak terduga antar-pemeriksaan |
| 11 | Notifikasi pemulihan terkirim saat penyedia sehat kembali |
| 12 | Sirkuit benar-benar menutup (`health=sehat`) |
| 13 | Episode ditutup (`keadaan.aktif=false`) |

Setiap butir di atas diverifikasi dua sisi: **sisi saluran** (apa yang diterima sink) dan **sisi
perpindahan keadaan** (apa yang dilaporkan `/api/admin/peringatan`).

### 4.5 Tidak ada regresi

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| Uji pasangan entitas FR-24 (:3116) | 50 keluaran · 0 kesalahan | **50 · 0** (identik) |
| Uji pasangan entitas FR-24 (:3119, model menukar entitas) | 50 · 0 kesalahan · 8 narasi ditolak | **50 · 0 · 8 ditolak** (identik) |
| §6e FR-23 dalam kit | 4/4 | **4/4** |

---

## 5. Temuan yang muncul saat verifikasi (dan diperbaiki di sumbernya)

1. **Pratinjau kering kosong.** Harness menangkap: `?kering=1` melaporkan rencana dengan benar
   tetapi `pratinjau` kosong ketika tidak ada kiriman baru pada detik itu. Operator yang memeriksa
   manual justru ingin tahu **apa** isi pesannya. Diperbaiki: pratinjau selalu diisi selama
   sirkuit terbuka.
2. **Uji nyaris jadi vakum karena cache jawaban** — temuan paling penting pada putaran ini.
   Putaran kit pertama GAGAL (benar, bukan salah alarm): enam pertanyaan beruntun, sirkuit **tidak
   pernah terbuka**, `gagal=0`. Penyebabnya bukan notifikasi, melainkan **cache jawaban**: jawaban
   yang pernah **berhasil** tidak memanggil model lagi, sehingga kegagalan penyedia — yang justru
   sedang diukur — tidak pernah terpicu. Perbaikan di harness: pertanyaan dipilih **acak dari
   korpus** (indikator + OPD acak, satu pertanyaan baru per putaran), ditambah pelaporan eksplisit
   "model benar-benar dipanggil N kali" dan deteksi `ai.cached`. Catatan penting yang ikut
   ditemukan: **jawaban yang GAGAL tidak di-cache**, jadi pengulangan dalam satu putaran tetap
   memanggil model.
3. **Hitungan notifikasi di kit salah** (menghitung baris ringkasan sebagai notifikasi → 3 terbaca 4).
   Pola `grep` diperbaiki.
4. **Diagnosa kegagalan dibuat menyebut diri sendiri.** Bila peringatan tidak keluar, harness kini
   memeriksa apakah **episode lama** masih aktif dari uji sebelumnya dan menyuruh memulai ulang
   aplikasi uji — kesalahan setup tidak lagi menyamar sebagai kegagalan notifikasi.

---

## 6. Keputusan desain

| Keputusan | Alasan |
|---|---|
| Peringatan dipicu dari **jalur jawaban**, bukan hanya cron | sirkuit terbuka *karena* panggilan model — jalur itulah yang tahu lebih dulu. Cron di Vercel Hobby hanya 1×/hari, jadi tidak bisa diandalkan untuk 15 menit |
| Pemanggilan **nirblokir** (`void`) dan tidak pernah melempar | notifikasi tidak boleh memperlambat atau menggagalkan jawaban warga; kegagalan kirim dicatat, bukan dilempar |
| **Klaim sebelum kirim** | mencegah dua peringatan untuk satu gangguan (paralel/beberapa instance) |
| Ambang 15 menit sebagai **eskalasi**, bukan penundaan pertama | lihat §2.2 butir 1 |
| Keadaan di **penyimpanan bersama** | dedup lintas instance saat Redis terpasang; tanpa Redis tetap benar per instance (jujur, lihat §7) |
| **Telegram + webhook umum**, bukan Surel langsung | Surel menuntut SMTP/kredensial pihak ketiga yang belum ada di lingkungan ini; webhook generik dapat menjangkau Surel lewat penerus apa pun **tanpa** menambah rahasia baru ke aplikasi |
| Cooldown sirkuit **dipendekkan** hanya di server uji (30 dtk) | agar uji fase pemulihan tidak menunggu 10 menit; jalur kode yang diuji tetap sama, dan itu dicatat di kepala skrip maupun di sini |

---

## 7. Batas yang diketahui

- **Tanpa lalu lintas, jalur jawaban tidak berjalan.** Bila tidak ada seorang pun bertanya,
  hanya penjadwal yang bisa memeriksa. Karena itu `.github/workflows/peringatan.yml` disediakan
  (10 menit, `workflow_dispatch` untuk uji manual). Ia **dorman** bila rahasia `SAPA_URL` /
  `ADMIN_TOKEN` belum diisi — bukan gagal, hanya belum aktif; itu disengaja agar tidak menyalakan
  alarm palsu di repositori yang belum siap.
- **Tanpa Redis, dedup bersifat per instance.** Penyimpanan memori hilang saat instance mati; pada
  lalu lintas rendah ini berarti notifikasi bisa terkirim sekali lagi setelah cold start. Setelah
  Upstash dipasang (sudah didukung `store.ts`), dedup menjadi global tanpa perubahan kode.
- **Satu saluran ganda.** Bila Telegram **dan** webhook sama-sama dipasang, operator menerima dua
  pesan. Itu dipilih sadar: keberadaan dua saluran berbeda justru untuk saling menutupi kegagalan.
- **Notifikasi bukan perbaikan.** Ia memberi tahu; ia tidak memperpanjang langganan, tidak
  memperbaiki kunci, dan tidak menggantikan pemeriksaan berkala.
- **Pemulihan sirkuit ≠ pemulihan jawaban.** Bukti dari putaran uji ini: setelah penyedia sehat
  kembali, sirkuit menutup dan jawaban dilayani model lagi — tetapi narasinya tetap ditolak
  gerbang grounding (`alasan=angka halu: 9.610`). Notifikasi pemulihan sengaja berbunyi
  "narasi AI dilayani lagi seperti biasa", bukan "kualitas jawaban sudah baik"; kualitas jawaban
  diukur oleh alat lain (EV-05/EV-06, uji pasangan, uji bersih-data).
- **Keadaan episode ber-TTL 30 hari.** Cukup untuk semua pola gangguan nyata; bukan arsip riwayat.

---

## 8. Langkah berikutnya

**NFR-07 — telemetri terstruktur per tahap** (`retrieval`, `prompt`, `model`, `grounding`, `gerbang`)
dengan p95 terlihat di log. Ini item Fase D berikutnya dan yang tersisa termurah: seluruh
tahapannya sudah ada dan sudah punya titik masuk (`sebab-kegagalan.ts` memakai penanda tahap),
sehingga pekerjaannya adalah mengukur dan menuliskannya — bukan membangun alur baru.

Setelah itu Fase D berlanjut ke OPS-03 (penyegaran terjadwal), NFR-09 (aksesibilitas WCAG 2.2 AA),
dan CMP-02/03/04 (keterbukaan AI, tata kelola risiko, jejak audit).
