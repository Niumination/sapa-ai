# 34 — Laporan lingkungan uji hermetik (24 September 2026)

Dokumen ini menjawab: **temuan ketiga hermes agent pada uji terima — "6h GAGAL 5 butir, tapi itu artefak
setup saya" — benar atau tidak?** Dan jawabannya: **penyebabnya benar, tetapi kesimpulannya kurang
tepat.** Itu bukan sekadar artefak shell; itu cacat **harness** yang membuat hasil uji ditentukan oleh
isi terminal operator. Sudah diperbaiki pada komit `0051`.

---

## 1. Apa yang dilaporkan hermes

> "⚠️ 6h 'GAGAL 5 butir' → artefak setup saya, bukan cacat kode: `scripts/uji-segarkan.mjs` mewarisi
> `...process.env`, jadi `REVALIDATE_SECRET` yang saya ekspor bocor ke app B → app B tidak fail-closed.
> Diuji ulang dengan `env -u REVALIDATE_SECRET` → 45/45 LULUS."

**Diagnosis teknisnya tepat** (termasuk penunjukan baris `...process.env`). Yang perlu dikoreksi hanya
labelnya. Perbedaan ini penting, bukan soal istilah:

| Cara membacanya | Konsekuensi |
|---|---|
| "Artefak setup saya" | Dianggap tidak ada yang perlu diperbaiki; besok orang lain dengan shell berbeda akan bertemu masalah yang sama, dan pelan-pelan belajar **mengabaikan** hasil uji terima |
| "Harness tidak hermetik" | Ada yang harus diperbaiki — dan memang ada: **keadaan yang membuktikan fail-closed justru ditentukan lingkungan luar** |

Pemeriksaan yang kita bicarakan adalah **satu-satunya bukti** bahwa endpoint `/api/revalidate` menolak
permintaan anonim ketika rahasia belum dipasang (fail-closed, HTTP 503 + kategori `endpoint-tertutup`).
Kalau rahasia dari shell ikut masuk ke "aplikasi B yang seharusnya tanpa rahasia", maka:

- aplikasi B **punya** rahasia → permintaan anonim ditolak **401**, bukan 503;
- yang teruji bukan lagi fail-closed, melainkan sekadar "tanpa kredensial tidak boleh" — hal yang
  berbeda dan jauh lebih lemah;
- hasilnya 5 GAGAL yang membingungkan: *"aplikasi B tidak menolak anonim"* padahal kodenya benar.

---

## 2. Reproduksi dan bukti (dijalankan sendiri, dua arah)

Lingkungan uji: `REVALIDATE_SECRET=rahasia-ambien-dari-shell` diekspor di shell.

| Harness | Sebelum perbaikan | Sesudah perbaikan |
|---|---|---|
| `scripts/uji-segarkan.mjs` | **40 ✓ / 5 ✗ GAGAL** (exit 1) — lima kegagalan **persis sama** dengan laporan hermes | **45 ✓ / 0 ✗ LULUS** (exit 0) |
| `scripts/uji-kamus-daerah.mjs` (dengan `SAPA_KAMUS_DAERAH=off` di shell) | **9 pelanggaran** (kamus "mati" sehingga aplikasi positif tidak menemukan 8 kueri daerah) | **LULUS** (exit 0) |

Lima kegagalan yang direproduksi (versi lama):

```
✗ POST anonim ke aplikasi B ditolak 503 (bukan 200) — HTTP 401
✗ kategori balasan = endpoint-tertutup
✗ aplikasi B melaporkan kegagalan tercatat (jumlahGagal ≥ 1) — jumlahGagal=0
✗ penjadwal pada aplikasi B keluar dengan kode 3 (endpoint tertutup) — kode=2
✗ penjadwal melaporkan kategori endpoint-tertutup (bukan sekadar "gagal") — rahasia-salah
  ringkasan: 40 ✓ / 5 ✗   HASIL: GAGAL
```

Harness versi baru, pada lingkungan yang sama, mencetak keterangan eksplisit bahwa ia menetralkan
lingkungan luar — jadi operator tahu skenarionya tidak lagi bergantung pada isi terminalnya:

```
  · 1 variabel shell dinetralkan agar skenario uji tetap sama: REVALIDATE_SECRET
  ringkasan: 45 ✓ / 0 ✗
   HASIL: LULUS
```

Artefak: `verifikasi/uji-segarkan-lingkungan-shell-kotor.txt` (sesudah),
`verifikasi/uji-segarkan-tanpa-perbaikan-shell-kotor.txt` (sebelum),
`verifikasi/uji-kamus-lingkungan-shell-kotor.txt` (kasus kedua, sebelum↔sesudah).

> **Kasus kedua sengaja diuji** karena ia membuktikan ini **kelas**, bukan satu baris yang kebetulan.
> Tidak ada yang melaporkannya; ia ditemukan dengan menelusuri semua harness yang menjalankan aplikasi.
> Siapa pun yang mengekspor `SAPA_KAMUS_DAERAH=off` (mis. untuk mengecek perilaku produksi) lalu
> menjalankan uji kamus akan mendapat 9 pelanggaran palsu — dan mungkin "memperbaiki" kode yang benar.

---

## 3. Perbaikan (komit `0051`)

### Berkas baru: `scripts/lingkungan-uji.mjs`

Satu aturan, satu tempat — sama seperti perbaikan `0050`:

> **Aplikasi yang diuji hanya menerima variabel yang disebut eksplisit oleh harness.**
> Semua variabel berawalan `SAPA_`, `AI_`, `ADMIN_`, `REVALIDATE_`, `MOCK_`, `DET_` dari shell
> dibuang lebih dahulu (dan **dilaporkan**, bukan senyap), lalu nilai eksplisit diterapkan.

```js
import { envUji, catatanLingkungan } from './lingkungan-uji.mjs';
const { env, dibuang } = envUji({ SAPA_SPLP_BASE_URL: SPLP, AI_ENABLED: 'false' });
```

Proses **pendamping** (mock penyedia, stub SPLP) sengaja **tidak** dibersihkan: konfigurasi mereka
memang datang dari luar, dan mereka bukan yang sedang dinilai.

### Tujuh harness diperbarui

| Harness | Yang dijalankan | Catatan |
|---|---|---|
| `uji-segarkan.mjs` | aplikasi A & B **+ penjadwal** | kasus asli; penjadwal juga memakai lingkungan bersih karena kode keluar & kategorinya dinilai |
| `uji-kamus-daerah.mjs` | aplikasi positif & negatif | saklar `SAPA_KAMUS_DAERAH` kini ditentukan harness |
| `uji-bentuk-jawaban.mjs` | aplikasi normal & negatif | idem untuk `SAPA_BENTUK_NIAT` |
| `uji-telemetri.mjs` | aplikasi (saklar telemetri) | idem untuk `SAPA_TELEMETRI` |
| `uji-keterbukaan.mjs` | tiga keadaan (AI mati/hidup/gagal) | idem untuk `AI_*` |
| `uji-tata-kelola.mjs` | aplikasi (mode sab otase) | pembersihan hanya untuk aplikasi; stub SPLP tetap mewarisi |
| `uji-jejak-audit.mjs` | aplikasi + stub SPLP | idem, lewat parameter `bersih` |

Sisa `...process.env` yang sengaja dipertahankan: proses pendamping (`verifikasi/mock-llm.mjs`,
`verifikasi/stub-splp.mjs`) dan `uji-eval-120.mjs` (menjalankan *runner* eval, bukan aplikasi —
`SAPA_EVAL_URL` sudah eksplisit).

### Bukti bahwa perbaikan tidak merusak apa pun

Ketujuh harness dijalankan **dengan lingkungan yang sengaja bermusuhan**
(`REVALIDATE_SECRET` ada, `SAPA_KAMUS_DAERAH=off`, `AI_ENABLED=true`):

| Harness | Hasil |
|---|---|
| `uji-segarkan.mjs` | **45 ✓ / 0 ✗** |
| `uji-telemetri.mjs` | **19 ✓ / 0 ✗** |
| `uji-keterbukaan.mjs` | **24 pemeriksaan lulus** (3 keadaan) |
| `uji-bentuk-jawaban.mjs` | **122 pemeriksaan lulus** · kontrol negatif 9/9 |
| `uji-kamus-daerah.mjs` | **LULUS** (kontrol negatif tetap berubah 8/8) |
| `uji-tata-kelola.mjs` | **LULUS** |
| `uji-jejak-audit.mjs` | **LULUS** |
| Gerbang penuh `uji-terima.sh` (4 server) | **LULUS, exit 0** — `verifikasi/uji-terima-lingkungan-kotor.txt` |

Gerbang penuh itu dijalankan **dengan `REVALIDATE_SECRET` diekspor** — yaitu kondisi yang dulu
mematahkan §6h. Sekarang hijau, dan itu buktinya: hasil gerbang tidak lagi bergantung pada shell.

---

## 4. Kenapa perbaikan ini sepadan (walau tak ada kode gagal)

1. **Uji terima harus bisa dipercaya justru saat operatornya sedang "kotor".** Skenario paling wajar
   adalah menguji terhadap konfigurasi nyata — dan konfigurasi nyata itu justru berarti rahasia ada di
   shell. Harness yang hanya benar di shell bersih adalah harness yang akan dilanggar orang.
2. **Gagal palsu lebih berbahaya daripada tidak ada uji** — ia melatih orang mengabaikan hasil, dan
   begitu itu terjadi, gagal yang nyata ikut diabaikan.
3. **Kelas yang sama sudah pernah menggigit proyek ini** dan sudah pernah kita catat: OPS-04 (peringatan
   sirkuit) nyaris lulus hampa karena cache jawaban. Aturannya sekarang umum: *kalau hasil sebuah
   pemeriksaan bisa ditentukan oleh keadaan di luar berkas uji, pemeriksaan itu belum selesai.*
4. Perbaikan ini **tidak menyentuh satu baris pun kode aplikasi** — nol risiko ke produksi, nol
   perubahan pada jawaban warga.

---

## 5. Yang berubah pada komit `0051`

| Berkas | Perubahan |
|---|---|
| `scripts/lingkungan-uji.mjs` | **baru** — `envUji()` + `catatanLingkungan()` (satu tempat aturan) |
| 7 harness (segarkan, kamus-daerah, bentuk-jawaban, telemetri, keterbukaan, tata-kelola, jejak-audit) | memakai `envUji()` untuk aplikasi yang diuji |
| `verifikasi/uji-segarkan-lingkungan-shell-kotor.txt` | bukti sesudah: 45 ✓ / 0 ✗ (dengan rahasia di shell) |
| `verifikasi/uji-segarkan-tanpa-perbaikan-shell-kotor.txt` | kontrol negatif: 40 ✓ / 5 ✗ (versi lama, lingkungan sama) |
| `verifikasi/uji-kamus-lingkungan-shell-kotor.txt` | kontrol negatif kasus kedua: 9 pelanggaran → LULUS |
| `verifikasi/uji-terima-lingkungan-kotor.txt` | gerbang penuh dengan shell kotor: **exit 0** |
| dokumen ini + `README.md`/dok 11/32 | tautan & keadaan terbaru |

Gerbang setelah `0051`: uji unit **719 lulus / 44 berkas** · `tsc` 0 · `next build` 0 · PII-gate 0 ·
gerbang uji terima **exit 0** (dengan shell kotor).

---

## 6. Pelajaran (melanjutkan §7 laporan 33)

6. **"Artefak setup saya" adalah kesimpulan yang harus diuji, bukan diterima.** Tiga temuan penerapan
   berturut-turut punya bentuk yang sama: *sesuatu di dalam alat ujinya sendiri yang membuat hasil uji
   tidak bermakna.* Dua pertama sudah kita perbaiki; yang ketiga ditemukan justru karena yang pertama
   dan kedua diperiksa sampai akar, bukan sekadar di-"workaround".
7. **Telusuri kelasnya, bukan kejadiannya.** Setelah menemukan `REVALIDATE_SECRET` bocor, semua harness
   yang menjalankan aplikasi diperiksa — dan kasus `SAPA_KAMUS_DAERAH` ditemukan tanpa ada yang
   melaporkannya. Satu perbaikan menjadi tujuh.
8. **Lingkungan anak = bagian dari skenario uji.** Menuliskan skenario di argumen harness tetapi
   membiarkan sisanya diwarisi dari shell berarti skenarionya setengah ditulis orang lain.
