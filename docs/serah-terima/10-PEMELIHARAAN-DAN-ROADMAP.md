# Pemeliharaan dan Rencana Lanjutan

## Prinsip pemeliharaan

Aplikasi ini hanya bergantung pada tiga hal. Merawatnya berarti merawat ketiganya:

1. **Data** — API SPLP sebagai satu-satunya sumber, di luar kendali Diskominfo.
2. **Model bahasa** — pihak ketiga, berbiaya, dan berlisensi langganan.
3. **Penempatan (hosting)** — Vercel, dengan kuota tier gratis yang terbatas.

Tidak ada basis data dan tidak ada akun pengguna, sehingga tidak ada pemeliharaan
data pengguna yang diperlukan.

## Kegiatan rutin

**Harian (otomatis, tidak perlu tindakan)**

- Pemantauan ketersediaan sumber data melalui `/api/status`
- Pencatatan metrik harian: jumlah jawaban deterministik dan jawaban model

**Mingguan**

1. Buka `/dashboard/status` — pastikan sumber data `active` dan hitungan catatan wajar.
2. Periksa metrik di `/api/status` — bandingkan jumlah jawaban model dengan
   ekspektasi pemakaian. Lonjakan berarti ada pemakaian tidak wajar.
3. Periksa kuota penyedia model pada dasbor penyedia.

**Bulanan**

1. Periksa kuota penyimpanan Vercel (Deployment Storage dan Functions Storage).
2. Periksa umur kredensial. Rotasi `AI_ADMIN_KEY` bila sudah dipakai beberapa orang.
3. Jalankan `npm audit` untuk komponen pihak ketiga.

**Setiap kali mengubah kode**

```
npm run typecheck && npx vitest run && npm run build
```

Ketiganya wajib hijau sebelum perubahan diunggah. Lihat `09-PENGUJIAN-DAN-MUTU.md`.

## Definisi "layanan sehat"

- `/api/status` melaporkan sumber data `active` dengan jumlah catatan wajar
- Halaman `/dashboard`, `/dashboard/analytics`, `/dashboard/gis`, `/dashboard/laporan` membalas 200
- Pertanyaan uji menghasilkan jawaban dengan bukti (`evidence`) terisi
- Tidak ada lonjakan pesan `[ai-error]` pada log runtime Vercel

## Tindakan yang perlu diselesaikan penerima

### 1. Kuota penyimpanan Vercel (sudah ditangani — perlu dipantau)

Kuota Functions Storage telah melampaui batas tier gratis. Akibat yang sudah
terjadi: penempatan baru pernah macet total.

**Tindakan sudah dilakukan pada 19 September 2026.** Kebijakan retensi diatur pada
tingkat tim — berlaku untuk seluruh proyek pada akun tersebut — dan nilainya
terverifikasi langsung dari API Vercel:

| Kategori penempatan | Retensi |
|---|---|
| Canceled | 1 hari |
| Errored | 1 hari |
| Pre-Production | 1 minggu |
| Production | 30 hari |

Yang perlu dilakukan penerima: **memantau, bukan mengatur ulang.** Penyimpanan
menyusut bertahap, karena Vercel menandai penempatan yang melewati batas untuk
dihapus dalam 48 jam, dan menilai ulang penempatan yang sempat terlindungi
pengecualian paling lama 30 hari.

Pengecualian yang **tidak akan dihapus** Vercel: penempatan yang memegang alias
produksi, penempatan pratinjau terakhir dari cabang Git yang masih aktif,
penempatan non-produksi dengan alias kustom, dan tiga penempatan terbaru (paket Hobby).

Catatan penting: **menjeda (pause) proyek tidak mengurangi pemakaian penyimpanan.**
Penyimpanan dihitung dari penempatan yang tersimpan, bukan dari lalu lintas.

### 2. Batas pemakaian harian model (perlu keputusan)

`AI_DAILY_CALL_LIMIT` masih memakai nilai bawaan kode (2000 panggilan). Sebaiknya
ditetapkan eksplisit di Vercel setelah ada kesepakatan anggaran.

### 3. Baseline pengujian evaluasi

Baseline evaluasi saat ini mengacu pada mode deterministik, sedangkan jawaban yang
disajikan di produksi berasal dari model. Perlu baseline baru agar deteksi regresi
bermakna.

### 4. Tinjauan lisensi

`react-leaflet` memakai lisensi Hippocratic-2.1, bukan lisensi OSI. Bila Bidang
Persandian mensyaratkan seluruh komponen berlisensi OSI, ganti dengan `leaflet`
langsung atau pustaka peta lain. Rincian pada `LICENSE` butir 5.

### 5. Kebersihan repositori

Hapus cabang Git yang tidak terpakai. Tentukan juga berapa lama mode bayangan
(shadow) dipertahankan di produksi — saran: satu siklus pelaporan.

## Rencana lanjutan

### Penggantian penyedia model bahasa

Aplikasi sudah mendukung tiga penyedia tanpa perubahan kode: `opencode-go`,
`gemini`, dan `custom`. Untuk berpindah:

1. Siapkan kunci API penyedia baru.
2. Setel di Vercel: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`.
3. **`AI_MODEL` wajib diisi** untuk penyedia selain `opencode-go` — nilai bawaan
   otomatis hanya berlaku untuk penyedia tersebut.
4. Verifikasi tanpa menguras kuota: periksa `/api/status` (model terbaca), lalu
   satu pertanyaan uji ke `/api/query` (memastikan `used: true` dan `grounded: pass`).
5. Bila model baru lebih cepat dari 48 detik, pertimbangkan menurunkan
   `AI_TIMEOUT_MS`.

**Kandidat yang sudah diukur, untuk pertimbangan:** `deepseek-v4.1-flash`
(3,4–8,5 detik, terpilih) dan `glm-5.3-flash` (termurah). Kegagalan keluaran tidak
sesuai skema bersifat kebetulan, bukan sistematis — karena itu aplikasi sudah
menyediakan satu percobaan ulang otomatis.

### Peningkatan pemahaman konsep pertanyaan

Terdapat empat butir pengujian yang tidak pernah lolos karena memerlukan
pemahaman sinonim atau embedding, bukan pencocokan kata. Penyelesaiannya adalah
menambah lapis pencarian semantik. Ini peningkatan mutu, bukan perbaikan
kerusakan.

### Pemantauan otomatis

Pemantauan masih manual. Bila pemakaian naik, pertimbangkan pemberitahuan
otomatis untuk: kuota model, kegagalan berturut-turut pada jawaban, dan
ketidaktersediaan sumber data.

## Risiko dan penanganannya

| Risiko | Dampak | Penanganan |
|---|---|---|
| API SPLP tidak tersedia | Tidak ada jawaban berbasis data | Sistem membalas pesan jelas; tunggu pemulihan pihak penyedia |
| Langganan model berhenti | Layanan tanya-jawab mati | Matikan saklar AI (layanan tetap menjawab lewat template bila deterministik dinyalakan); atau pindah penyedia |
| Kuota Vercel terlampaui | Penempatan baru terblokir | Atur retensi; rajin periksa pemakaian |
| Kredensial bocor | Penyalahgunaan berbiaya | Rotasi kunci; palang rahasia otomatis sudah aktif pada pre-commit |
| Versi Node usang | Build gagal | Repositori mencantumkan versi Node minimum pada `.nvmrc` |
| Ketergantungan pada tier gratis | Perubahan kebijakan penyedia | Siapkan anggaran bila pemakaian naik |

## Ketergantungan yang perlu dipantau masa berlakunya

- **Vercel** — proyek Hobby; pemakaian penyimpanan dan fungsi dibatasi
- **Upstash Redis** — tier gratis; menyimpan keadaan kedua saklar layanan
- **OpenCode Go** — langganan berbayar; saat ini tertunda perpanjangannya
- **API SPLP** — layanan pemerintah, di luar kendali Diskominfo
- **Node.js** — versi minimum tercantum pada `package.json` dan `.nvmrc`
