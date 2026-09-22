# 13 — Laporan FR-26: notis transparansi + kanal koreksi warga ("lapor angka")

**Tanggal:** 22 September 2026 · **Cabang:** `usulan/perbaikan-ai-2026-09-21` @ `e175c1a`
**Sifat pekerjaan:** butir termurah berikutnya (usaha **S**) dari dokumen `10`, melanjutkan pola
"kerjakan yang lebih murah dulu" — dan melengkapi trio tata kelola: FR-25 (asal-usul data) ·
FR-27 (pertanyaan yang belum terlayani) · **FR-26 (jawaban yang dianggap keliru)**.

---

## 1. Ringkas

| Sebelum | Sesudah |
|---|---|
| Pembaca tidak diberi tahu siapa/apa yang menyusun narasi jawaban | Notis "Transparansi jawaban" tampil di dasbor, dengan teks yang **menyatakan keadaan sebenarnya**: disusun AI, disusun template, atau usulan AI ditolak gerbang bukti |
| Tidak ada jalan melaporkan angka/satuan/tahun yang keliru | Kanal **"Lapor angka"** di dasbor: borang jenis + keterangan, masuk daftar tinjauan mingguan |
| Operator tidak punya daftar jawaban bermasalah | `/api/admin/umpan-balik` + halaman `/admin/umpan-balik` (ber-token, fail-closed) |

Uji: **289 → 317** (28 uji baru). Gerbang uji terima: **8 → 14** (bagian `5` baru, enam gerbang).

---

## 2. Yang dibangun

### 2.1 Notis transparansi — tiga keadaan, bukan satu kalimat iklan

`teksNotis()` (`src/lib/umpan-balik.ts`) adalah fungsi **murni** yang dipakai komponen UI, sehingga
teks tidak mungkin berbeda antara tampilan dan salinan. Kejujurannya dijaga karena keadaan diambil
dari metadata jawaban yang sebenarnya (`ai.used`, `ai.grounded`), bukan dari setelan konfigurasi:

| Keadaan | Kalimat pertama notis |
|---|---|
| AI benar-benar dipakai | "Narasi jawaban ini disusun oleh model bahasa AI, dengan gerbang bukti: hanya angka yang ada pada data resmi yang boleh dipakai…" |
| Usulan AI ditolak gerbang | "…Usulan dari model AI ditolak gerbang bukti, sehingga yang Anda baca berasal langsung dari data." |
| AI tidak aktif (langganan habis/mati) | "Narasi jawaban ini disusun otomatis dari data resmi (mode tanpa AI)." |
| Belum ada jawaban (beranda) | "Cara kerja jawaban di portal ini: setiap angka diambil dari data resmi dan tidak boleh muncul bila tidak ada pada bukti…" — **tidak mengklaim apa pun** tentang jawaban yang belum ada |

Seluruh keadaan juga menyebut sumber angka (SPLP/SAPA), menautkan ke keterangan tahun data & sidik
korpus (FR-25), dan menyebut kanal koreksi.

### 2.2 Kanal koreksi — borang yang aman sejak desain

`POST /api/umpan-balik` — **terbuka tanpa token** (warga tidak punya token), maka pagarnya bukan izin
melainkan **bentuk**:

| Pagar | Aturan |
|---|---|
| Jenis laporan | harus salah satu dari 6 jenis tetap (`angka-salah`, `satuan-salah`, `tahun-salah`, `indikator-hilang`, `pertanyaan-salah-paham`, `lainnya`); selain itu **400** |
| Isi | dibersihkan sebelum disimpan: **seluruh angka**, surel, tautan, nomor telepon dibuang; maksimum 140 aksara |
| Kosong | laporan tanpa isi setelah dibersihkan → **400**, tidak disimpan sebagai sampah |
| Kuota | maksimum **200 laporan/hari untuk seluruh sistem** (global, bukan per-pengguna — supaya tidak ada data pengguna yang perlu disimpan) → **429** |
| Balasan | hanya status + minggu + pesan; **tidak menggemakan** teks pengguna (mencegah pantulan injeksi) |

**Satu keputusan desain yang disengaja:** karena semua angka dibuang, pengguna **tidak bisa** menulis
angka pengganti. Itulah sebabnya borangnya menyediakan **jenis terstruktur** ("angka salah", "satuan
salah", "tahun salah", …) — inti keluhan tetap tersampaikan tanpa menyimpan apa pun yang bisa berisi
NIK atau nomor telepon. Ini dituliskan langsung pada borang agar pengguna tidak bingung.

### 2.3 Daftar tinjauan operator

`GET /api/admin/umpan-balik` + halaman `/admin/umpan-balik`, memakai **token yang sama** dengan
dasbor celah (fail-closed: `ADMIN_TOKEN` kosong → 503). Kolomnya: jenis (label manusiawi dari satu
sumber `LABEL_JENIS`), keterangan, pertanyaan terkait, jumlah, waktu terakhir. Kedua halaman admin
saling bertaut, dengan panduan singkat "cara memakai daftar ini".

### 2.4 Penyimpanan

Kunci `umpan:balik:<YYYY-Www>`; maksimum 300 laporan berbeda per minggu; TTL 8 minggu — aturan yang
**sama** dengan celah pengetahuan, dan sanitasi memakai ulang `bersihkanPertanyaan()` dari
`insight-celah.ts` sehingga hanya ada **satu** tempat aturan privasi di seluruh sistem.

---

## 3. Bukti

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | bersih |
| `npx vitest run` | **27 berkas / 317 uji lulus** (sebelumnya 289) |
| `npx next build` | sukses |
| Uji terima dua mode | **LULUS**, 14 gerbang (lihat `verifikasi/uji-terima-hasil.txt`) |
| Seri patch di klon bersih `main` | `git am` seluruh seri → **0 baris berbeda** dengan cabang; **317 uji lulus** di pohon hasil patch |

Keluaran gerbang baru pada server yang hidup:

```
── 5. Transparansi jawaban & kanal koreksi (FR-26) ──
  ✓ notis transparansi tampil di halaman dasbor
  ✓ kanal koreksi "lapor angka" tersedia di dasbor
  ✓ laporan sah diterima (HTTP 201)
  ✓ jenis laporan tak dikenal ditolak (HTTP 400)
  ✓ daftar laporan menolak tanpa token (HTTP 401, fail-closed)
  ✓ laporan tersimpan tanpa digit (privasi terjaga; 2 laporan minggu ini)
```

Uji yang menjaga invarians:

- **Privasi** (5 uji): NIK & nomor telepon tidak pernah tersimpan; tahun pun hilang dari pertanyaan
  tersimpan; objek entri hanya memuat lima bidang yang dirancang.
- **Kejujuran notis** (5 uji): mode AI menyebut AI; AI mati **tidak** mengaku AI; penolakan gerbang
  dijelaskan; keadaan "belum ada jawaban" tidak mengklaim apa pun; semua keadaan menyebut sumber &
  kanal koreksi.
- **Pagar kanal publik** (7 uji rute): jenis liar 400; JSON rusak 400; laporan kosong 400; kuota 429;
  balasan tidak menggemakan teks pengguna.
- **Pagar admin** (7 uji rute): 401 tanpa token, 401 token salah, 503 saat `ADMIN_TOKEN` kosong,
  200 dengan bentuk balasan yang tepat, minggu tak sah diabaikan, minggu kosong bukan galat.

---

## 4. Batas yang dinyatakan terbuka

1. **Laporan tidak menyimpan angka maupun identitas** — konsekuensi sadar: laporan "angka salah"
   tidak memuat angka pengganti, sehingga operator perlu menghubungi pelapor atau memverifikasi ke
   OPD. Ini pilihan untuk mematuhi UU 27/2022 dengan cara yang paling sederhana dan paling aman.
2. **Kuota harian global 200** membuka peluang "penyalahgunaan kolektif" (jika kuota habis, laporan
   sah tertolak sampai besok). Untuk portal kabupaten, angka ini jauh di atas volume wajar; bila
   kelak terlampaui secara rutin, itu justru sinyal untuk menambah kanal verifikasi resmi.
3. **Tanpa Redis, daftar laporan hidup per-instance** (sama seperti celah pengetahuan).
4. **Evaluasi 90 item belum dijalankan ulang** hari ini (sandbox tanpa akses SPLP). Perubahan FR-26
   seluruhnya aditif dan tidak menyentuh jalur jawaban — gerbang invarians di uji terima tetap hijau.
5. **Kanal koreksi belum tersambung ke OPD.** Saat ini laporan hanya masuk daftar tinjauan internal.

---

## 5. Cara memakai di produksi

1. Set `ADMIN_TOKEN` di Vercel (kalau tidak, kedua dasbor admin tertutup 503 — aman, tetapi tidak
   bisa dibuka).
2. Sosialisasikan dua alamat ke tim data: `/admin/celah-pengetahuan` (pertanyaan tak terlayani) dan
   `/admin/umpan-balik` (laporan koreksi). Token dimasukkan sekali per sesi peramban.
3. Siklus mingguan yang disarankan: tinjau kedua daftar → perbaiki pemetaan/satuan yang keliru →
   tambahkan sinonim atau item evaluasi dari pertanyaan yang paling sering muncul → catat
   permintaan data ke OPD untuk indikator yang memang belum ada.

---

## 6. Langkah berikutnya

Sisa urutan yang disarankan tinggal **FR-19** (jawaban per-klaim bersitasi — menaikkan kepercayaan
paling tinggi per satuan usaha) → **FR-12** (lapis semantik berbahasa Indonesia). Dengan FR-26
selesai, kelompok D (tata kelola & pengalaman) sudah berisi FR-25/26/27; sisa kelompok D adalah
NFR-09 aksesibilitas, OPS-03 penyegaran terjadwal, dan CMP-02/03/04 kepatuhan.
