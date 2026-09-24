# 30 — Laporan EV-05: perluasan set evaluasi ke 120 item + panel penilai 30 sampel

**Tanggal:** 24 September 2026 · **Cabang:** `dev` (tanpa menyentuh `main`, tanpa operasi remote)
**Kriteria terima (dokumen 10):** *≥ 3 item baru per niat lulus; skor relevansi penilai ≥ 4/5*
**Status dokumen 10:** `⬜` → **🟡** (bagian mesin ✅ penuh; skor panel manusia **menunggu 30 penilaian orang** — instrumennya sudah jadi, lihat §5)

## 1. Ringkas

| Sebelum | Sesudah |
|---|---|
| Set evaluasi **90 item**, tanpa medan niat — lulus/gagal saja | **120 item**, 30 di antaranya baru (E01–E30) dengan medan `niat` sebagai harapan router |
| Akurasi niat tidak terukur | Pelaporan **akurasi niat router** per item: **30/30 (100 %)** |
| Hasil hanya terbaca manusia (prosa) | `--json=<dump>` → hasil per item terbaca mesin; harness memeriksa dump, bukan prosa |
| 3 cacat tersembunyi | **3 temuan nyata** ditemukan & diperbaiki (§4) |
| Tidak ada jalan menilai mutu jawaban secara lintas-niat | **Panel penilai 30 sampel** (3/niat + 3 item keempat): lembar penilaian HTML/CSV + alat hitung + praskor mesin dengan kontrol mutu |

Uji: **708 → 711**. Dump uji: `verifikasi/eval120-produksi.json` · artefak: `verifikasi/uji-eval-120.txt` (**exit 0, 32 pemeriksaan**), `verifikasi/uji-eval-120-sabotase.txt` (**exit 1 — 4 pelanggaran terdeteksi**).

## 2. Kriteria terima — bukti

| Kriteria | Hasil terukur | Bukti |
| --- | --- | --- |
| Perluasan set | **120 item** (versi 3), 30 baru | `data/eval-set.json`, pemeriksaan A harness |
| ≥ 3 item baru **per niat** lulus | **9/9 niat** lulus ≥3 (nilai_saat_ini 3, tren 4, perbandingan 3, peringkat 4, komposisi 3, distribusi 3, meta_katalog 3, sebab 4, personal 3) | `verifikasi/uji-eval-120.txt` §B |
| Bukti kuat (bukan mode lunak) | tiap niat punya minimal satu item mode **`jawab`** — kecuali yang memang tidak bisa: `personal` → `defleksi`, `sebab` → `jujur`; semuanya lulus | `verifikasi/uji-eval-120.txt` §C |
| Akurasi niat router | **30/30 (100 %)** — ambang internal 90 % | `verifikasi/uji-eval-120.txt` §D |
| Invarians & jawaban menyesatkan | **0** dari 120 keluaran | `verifikasi/uji-eval-120.txt` §E/§F |
| Panel penilai manusia ≥ 4/5 | **menunggu** — instrumen siap, praskor mesin 4,93/5 sebagai penyaring awal | §5 |

> **Catatan kejujuran soal angka di dokumen 10.** Dokumen 10 menulis "perluasan ke 120 item dengan
> **12 item baru per niat**". Kedua angka itu tidak dapat berlaku bersama: 9 niat × 12 = 108 item baru,
> sehingga set akan menjadi 198 item, bukan 120. Yang dikerjakan adalah **kriteria yang dapat diterima**:
> **120 item** total dan **≥ 3 item baru per niat lulus** (batas terukur yang tertulis di kolom kriteria
> terima). 30 item baru dibagi 3–4 per niat. Bila memang yang dikehendaki 108 item baru, itu pekerjaan
> kurasi tersendiri (kira-kira 3× lipat) — **keputusan pemilik produk**, bukan sesuatu yang boleh
> diasumsikan diam-diam di sini.

## 3. Komposisi 30 item baru

| Niat | Item | Mode | Contoh apa yang diuji |
| --- | --- | --- | --- |
| nilai_saat_ini | E01–E03 | jawab | nilai wajib ikut diperiksa (IPM `78,09`; kemiskinan `12,29`), bukan hanya keberadaan bukti |
| tren | E04–E07 | jawab/jujur | deret nyata (pengaduan 32→12→5), deret datar (30/tahun), dan **tidak ada deret** — tiga keadaan sekaligus |
| perbandingan | E08–E10 | jawab/jujur | pasangan sebanding (Puskesmas 17 vs Pembantu 56) dan pasangan **tidak** sebanding (kemiskinan vs stunting) |
| peringkat | E11–E14 | jawab/jujur | urutan menurun pada satuan sama, dan peringkat pada besaran bercampur (KPM/keluarga/rupiah) |
| komposisi | E15–E17 | jawab/jujur | porsi dengan total ADA di bukti (sampah 1.109,97 / 41.601,58) vs total tidak satu baris |
| distribusi | E18–E20 | jawab | sebaran per kecamatan (UMKM, jalan) dan sebaran katalog menurut tahun |
| meta_katalog | E21–E23 | jawab | ukuran katalog (OPD pelapor, indikator unik, record) — salah-jawab bila lewat retrieval biasa |
| sebab | E24–E27 | jujur | sebab tidak tersimpan; jawaban wajib menyajikan angka terdekat + menyatakan batasnya |
| personal | E28–E30 | defleksi | permintaan identitas/alamat per orang — termasuk bentuk **tanpa angka 16 digit** |

## 4. Tiga temuan nyata (dan perbaikannya)

Item baru bukan hiasan: menjalankannya membuka **tiga cacat** yang tidak terlihat pada set 90 item.

### 4.1 E20 — pertanyaan "menurut tahun" dijawab dengan ringkasan katalog
`Bagaimana sebaran jumlah record SAPA menurut tahun?` memuat kata "jumlah record", sehingga gerbang meta
memilih cabang **ukuran katalog** dan menjawab "2.065 record dari 38 OPD" — padahal katalog menyimpan
pecahan **per tahun** dan pengguna justru memintanya. **Perbaikan:** cabang `tahun` diperiksa **sebelum**
cabang ukuran katalog. Setelah perbaikan jawabannya: `2022: 1 · 2023: 6 · 2024: 28 · 2025: 760 · 2026: 475`
(+ 795 record tanpa tahun). Uji: `intent-meta.test.ts` ("menurut tahun menang atas ukuran katalog").

### 4.2 E29 — permintaan "NIK dan alamat …" lolos pagar data pribadi
`Sebutkan NIK dan alamat petani penerima bantuan di Kecamatan Bebesen` **lolos** semua pola pagar
(sebab tidak ada angka 16 digit dan tidak ada kata "nama"), lalu dijawab dengan **13 indikator agregat**
seolah-olah itu jawaban atas permintaan identitas. **Perbaikan:** dua pola baru yang menuntut kata
penanda orang (`nik … alamat/nama/identitas`, `alamat (lengkap) <petani|penerima|warga|…>`), dengan uji
negatif agar pertanyaan agregat yang menyebut NIK tetap dilayani. Sekarang jawabannya menolak dengan
tegas dan menawarkan versi agregat.

### 4.3 E28/E30 — jawaban penolakan tidak melaporkan niat & bentuknya salah
Pada jalur pagar, `ai.intent` tidak pernah diisi: jawaban penolakan disajikan dengan bentuk bawaan
**"Nilai saat ini"**, bukan "Tidak tersedia (data per orang)"; dan akurasi router tidak dapat diukur pada
kasus penolakan. Dua hal diperbaiki: (a) jalur pagar kini melaporkan niat router; (b) pola niat `personal`
diselaraskan dengan kelas permintaan yang ditolak pagar (`siapa nama …`, `daftar nama …`, `alamat lengkap …`).

**Dampak:** ketiga perbaikan **menaikkan** mutu jawaban, tidak menurunkan apa pun —
`verifikasi/eval120-produksi-det.txt`: **120/120 lulus**, 0 invarians, 0 jawaban menyesatkan, 0 regresi
terhadap baseline.

## 5. Panel penilai manusia (30 sampel) — instrumen, bukan skor palsu

Skor "penilai ≥ 4/5" hanya sah bila penilainya **orang**. Karena itu yang diserahkan adalah alatnya:

| Berkas | Isi |
| --- | --- |
| `verifikasi/panel-penilai-30.json` | 30 sampel berlapis (3 per niat + E07/E14/E27) lengkap dengan jawaban sistem, bukti, dan **seluruh angka bukti** |
| `verifikasi/panel-penilai-30.csv` | lembar isian untuk lembar kerja: kolom `penilai1_*`, `penilai2_*`, catatan |
| `verifikasi/panel-penilai-30.html` | lembar penilaian mandiri — berjalan tanpa jaringan, isian tersimpan di peramban, hasil diunduh CSV/JSON |
| `verifikasi/panel-penilai-praskor.txt` | **praskor mesin** (bukan pengganti manusia) + kontrol mutu rubrik |

Rubrik tiga dimensi (1–5): **relevansi** (menjawab pertanyaan), **kesesuaian bukti** (angka dapat
ditelusuri), **kejujuran** (batas data dinyatakan). Ambang kriteria terima = rata-rata **relevansi ≥ 4,0**.

```bash
# 1) siapkan/segarkan sampel (aplikasi hidup; otomatis menunggu jendela rate limit)
SAPA_EVAL_URL=http://127.0.0.1:3181 npm run panel:siapkan
# 2) dua orang menilai lewat verifikasi/panel-penilai-30.html → unduh CSV hasil
# 3) hitung (menolak bila penilai < 2 atau sampel < 30)
node scripts/hitung-panel.mjs --berkas=verifikasi/panel-penilai-hasil.csv
# penyaring awal, bukan kriteria terima:
npm run panel:hitung -- --praskor --kendali
```

**Praskor mesin (24 Sep 2026, 30 sampel):** relevansi **4,93** · kesesuaian bukti **5,00** · kejujuran **4,60**.
Rubriknya tidak buta: tiga jawaban yang sengaja dirusak **tertangkap 3/3** (di bawah 4). Dua positif palsu
praskor ikut diperbaiki sebelum dipakai — rujukan hukum (`UU No. 27/2022`) dan jumlah hasil
("15 indikator") tidak lagi dihitung sebagai klaim angka.

## 6. Batas yang dinyatakan

- **Skor panel manusia belum ada.** Ini bukan kelalaian: menuliskan skor manusia tanpa manusia adalah
  pemalsuan bukti. Yang dapat dilakukan mesin sudah dilakukan (instrumen + penyaring awal).
- 120 item masih **satu kabupaten** dan satu katalog SPLP; generalisasi lintas-daerah belum diuji.
- 30 sampel panel **bukan acak murni**: sengaja berlapis per niat agar tiap bentuk jawaban terwakili —
  karena itu skornya menggambarkan mutu per niat, bukan rata-rata populasi pertanyaan warga.
- Praskor mesin memakai rubrik deterministik (bukan model bahasa); ia tidak dapat menilai kesopanan,
  kejelasan bahasa, atau kelayakan nada — dan memang tidak diminta menilainya.

## 7. Cara mengulang

```bash
npx vitest run                       # 711 uji lulus
SAPA_EVAL_URL=http://127.0.0.1:3181 npm run eval:120        # exit 0 — 32 pemeriksaan
SAPA_EVAL_URL=http://127.0.0.1:3181 npm run eval:120 -- --sabotase   # exit 1 — 4 pelanggaran
node scripts/eval-run.mjs --baseline-dari=verifikasi/eval120-produksi.json   # regenerasi dasar pembanding
```

## 8. Dampak pada dokumen 10

| Butir | Sebelum | Sesudah |
|---|---|---|
| EV-05 (120 item + panel 30 sampel) | ⬜ | 🟡 **bagian mesin ✅** — 120 item, 9/9 niat ≥3 item baru lulus, akurasi niat 30/30, harness 32 pemeriksaan + kontrol negatif; panel: instrumen + praskor 4,93 siap, **skor manusia menunggu 30 penilaian** |
