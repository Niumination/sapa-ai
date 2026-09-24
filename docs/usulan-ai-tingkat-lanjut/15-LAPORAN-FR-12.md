# 15 — Laporan FR-12: Lapis Semantik Bahasa Indonesia + Fusi RRF

**Status:** ✅ selesai · **Komit kode:** `e7258ca` · **Cabang:** `usulan/perbaikan-ai-2026-09-21`
**Tanggal pengukuran:** 22 Sep 2026 · **Korpus uji:** `verifikasi/korpus-uji-besar.json` (1.210 record, 20 OPD, 395 nama indikator)

---

## 1. Ringkasan satu paragraf

FR-12 menambahkan **lapis pencocokan makna** pada mesin jawab deterministik SAPA. Lapis ini bekerja
dengan **invarian leksikal-dulu**: jawaban utama tidak pernah berpindah dari hasil pencocokan kata;
lapis semantik hanya **menyisipkan** kandidat yang kuat dan belum tampil, atau **mengisi** ketika
pencocokan kata sama sekali tidak menemukan apa pun. Lapis ini juga menyediakan **fusi RRF** untuk
menggabungkan kedua daftar kandidat. Semua ini berjalan **tanpa jaringan dan tanpa langganan** lewat
penyedia `hash`; penyedia `remote` (kelas *e5*) sudah disediakan untuk hari ketika langganan AI
kembali. Hasil terukur: **recall@15 12/20 → 20/20**, semua kueri di luar katalog tetap ditolak
(5/5), dan indeks dingin dibangun dalam **75 ms** untuk 1.210 record.

---

## 2. Masalah yang diselesaikan

Katalog SAPA adalah katalog **statistik resmi**: namanya panjang, kaku, dan memakai istilah baku
("Jumlah Data Penduduk", "Prevalensi Stunting", "Jumlah Keluarga Penerima Bantuan Sosial Sembako").
Warga bertanya dengan bahasa sehari-hari, singkatan, atau salah tulis. Terukur pada korpus uji:

| Kueri nyata | Sebelum FR-12 | Sebab |
|---|---|---|
| "jumlah **pendudk** aceh tengah" | tidak terjawab | salah tulis; huruf hilang |
| "**banyaknya penduduk** kabupaten" | tidak terjawab | tidak ada kata "penduduk" yang cocok penuh |
| "angka balita **kurang gizi**" | tidak terjawab | istilah berbeda untuk hal yang sama |
| "**mutu hidup manusia** di aceh tengah" | tidak terjawab | parafrase dari "Indeks Pembangunan Manusia" |
| "**derajat kemiskinan** penduduk" | tidak terjawab | parafrase dari "tingkat Kemiskinan" |
| "jumlah **koperas** di kecamatan bebesen" | salah record | record jagung menang karena kata "Bebesen" |

Sebelum FR-12, menambah sinonim secara manual adalah satu-satunya obat — dan itu tidak pernah
selesai: setiap kata baru menuntut pemetaan baru.

---

## 3. Rancangan

### 3.1 Penyedia embedding

| Penyedia | Cara kerja | Kapan dipakai |
|---|---|---|
| `hash` (**bawaan**) | 512 dimensi; fitur FNV-1a bertanda dari kata + 4-gram berjangkar kata (`^kata$`); vektor dinormalkan L2. Tanpa jaringan, tanpa dependensi, deterministik | selalu tersedia; inilah yang diukur di laporan ini |
| `remote` | `POST {base}/embeddings` (OpenAI-compatible, kelas *e5-large*): batch 64, cache per sidik korpus, **jatuh ke `hash` bila gagal** (`catatan` diisi) | ketika langganan/langganan AI aktif; `SAPA_EMBED_BASE_URL` |

Penyedia mati bila `SAPA_SEMANTIK=off|mati|false|0|tidak` — untuk pembanding A/B dan untuk
keadaan darurat.

### 3.2 Skor kemiripan (dua komponen)

```
skor = 0,25 × cosine(vektor kueri, vektor record)      ← cocok topik menyeluruh
     + 0,75 × rata-rata(IDF(kata) × Dice4(kata_kueri, kata_record))  ← cocok bentuk & salah tulis
```

* Kata indikator (`kata`) dan kata OPD/satuan (`kataOpd`) **dipisah** dengan bobot OPD `0,34`.
  Tanpa pemisahan ini, nama OPD "Dinas Koperasi dan UKM" membuat record jagung mengalahkan record
  koperasi yang benar (temuan uji 21 Sep 2026).
* Bobot IDF membuat kata umum ("jumlah", "kecamatan") tidak menyeret topik, dan kata langka/salah
  tulis (df = 0) menentukan.
* `BOBOT_KOSINUS = 0,25` bukan tebakan — lihat §4.

### 3.3 Fusi RRF & invarian leksikal-dulu

`fusiRRF` (k = 60) menggabungkan daftar leksikal (bobot 2) dan daftar semantik (bobot 1).

| Keadaan | Perilaku | Jalur yang dilaporkan |
|---|---|---|
| Leksikal menemukan hasil, ada kandidat semantik **kuat** yang belum tampil | kandidat **disisipkan** setelah peringkat 1; jawaban utama tetap milik leksikal | `leksikal+sisipan` |
| Leksikal menemukan hasil, kandidat semantik lemah/sudah tampil | daftar bukti **tidak diubah sama sekali** | `leksikal` |
| Leksikal **kosong**, semantik mencapai ambang | jawaban dari kemiripan makna + **peringatan MAKNA wajib** | `semantik` |
| Leksikal kosong, semantik di bawah ambang | jujur "tidak ada data" | `kosong` |

Aturan "kuat" diuji **per kandidat yang akan disisipkan**, bukan pada kandidat teratas — koreksi
dari temuan §5.1.

---

## 4. Kalibrasi (bukan tebakan: diukur berpasangan)

Kueri di luar katalog harus **ditolak**; kueri parafrase sah harus **dijawab**. Kedua himpunan
diukur pada bobot kosinus yang berbeda:

| Bobot kosinus | Skor tertinggi kueri DI LUAR katalog | Skor terendah parafrase sah | Kesimpulan |
|---|---|---|---|
| 0,65 | 0,336 | 0,226 | tumpang tindih |
| 0,50 (nilai awal) | 0,288 | 0,258 | **tumpang tindih → tidak ada ambang yang bisa memisahkan** |
| 0,35 | 0,243 | 0,290 | terpisah |
| **0,25 (dipakai)** | **0,230** | **0,312** | jarak ~0,04 di kedua sisi ambang 0,27 |
| 0,15 | 0,218 | 0,325 | terpisah |
| 0,00 | 0,199 | 0,318 | terpisah |

Pada 0,50 (nilai awal rancangan) **lima parafrase sah ditolak** karena hanya unggul 0,000–0,022 dari
kandidat kedua. Sebabnya: cosine pada dasarnya menghitung kata umum bersama. Menurunkan bobotnya
membuat penilaian bertumpu pada kata isi berbobot IDF, dan kedua sebaran pun terpisah.

**Aturan margin dibuang sebagai gerbang.** Dulu: "harus unggul ≥ 0,06 dari kandidat kedua".
Indikator SAPA tersedia **per kecamatan**, jadi kueri sah seperti "kemiskinan aceh tengah sekarang"
unggul hanya **0,001** dari kembarannya — aturan itu membuang jawaban benar. Sekarang selisih kecil
memunculkan **peringatan keraguan** ("ada indikator lain yang kemiripannya hampir sama"), bukan
penolakan.

---

## 5. Temuan selama verifikasi (tiga bug nyata, semua diperbaiki)

### 5.1 Kandidat lemah ikut disisipkan (ditemukan oleh uji, bukan oleh produksi)

Uji "kandidat kuat disisipkan" gagal karena yang diuji adalah **kandidat teratas**, bukan kandidat
yang **akan disisipkan**. Akibatnya, ketika kandidat teratas sudah ada di daftar leksikal, kandidat
berikutnya yang jauh lebih lemah (**0,396** vs 0,853) tetap masuk ke daftar bukti — daftar bukti
terisi data tak seTopik. Perbaikan: aturan dipecah menjadi fungsi murni
`pilihSisipanSemantik()` dan diuji satu per satu (kuat & belum ada → masuk; lemah → tolak; sudah
ada → tidak digandakan; batas tepat di ambang → masuk).

### 5.2 Peringatan membocorkan angka ke narasi (ditemukan gerbang eval 90 item)

Peringatan awal berbunyi "…indeks `0db47884`… Kemiripan teratas 0.42…". Penjaga invarians eval
menandainya **ENAM kali**: *"angka di luar evidence: 0, 47884, 030"*. Itu benar — angka di narasi
wajib berasal dari tabel bukti. Perbaikan: **prosa peringatan bebas angka**; sidik indeks tetap
dapat diaudit lewat `/api/status.semantik` dan `meta`, skor tetap tersedia terstruktur
(`skorSemantik`). Diuji permanen: `expect(peringatan).not.toMatch(/\d/)`.

### 5.3 Akar penolakan dua parafrase ternyata bukan "kurang pintar", melainkan terlalu ketat

Dua kueri tetap gagal walau lapis semantik menyala: "seberapa banyak anak yang **mengalami
tengkes**" dan "berapa banyak **aparatur sipil negara**". Penelusuran menunjukkan keduanya ditolak
oleh **penjaga kejujuran** (`adaKonsepAsing`: ada kata ber-df 0 **dan** kandidat terbaik hanya cocok
satu konsep), bukan karena datanya tidak ada. Penyebabnya di sumbernya, bukan di uji:

1. **Kata tanya pengukur & kata kerja predikat** ("seberapa", "mengalami", "menderita") selalu
   ber-df 0 → memaksa syarat "2 kecocokan" yang tidak mungkin dipenuhi. Sekarang masuk daftar
   kata pengisi.
2. **Istilah resmi ditulis lengkap, katalog memakai akronim.** Leksikon frasa baru:
   `"aparatur sipil negara" → asn` (UU No. 5/2014) dan `"indeks pembangunan manusia" → ipm`
   (metodologi BPS).
3. **Sinonim dua arah**: `anak ⇄ balita`. Sebelumnya hanya `balita → anak`; kueri dengan kata
   "anak" tidak pernah menemukan indikator yang menulis "Balita".

---

## 6. Hasil pengukuran

Harness: `scripts/uji-parafrase.mjs` (EV-05) — 20 kueri parafrase + 5 kueri di luar katalog, dinilai
**end-to-end lewat `/api/query`**, bukan lewat fungsi internal. Korpus: 1.210 record sintetis
(`scripts/buat-korpus-uji.mjs`, benih tetap).

| Skenario | recall@15 | Kueri luar katalog ditolak | Muat dingin indeks |
|---|---|---|---|
| Lapis semantik **mati** (`SAPA_SEMANTIK=off`) — perilaku sebelum FR-12 | 12/20 = 60 % | 5/5 | — |
| Lapis semantik `hash` (tanpa leksikon baru) | **18/20 = 90 %** ✓ | 5/5 | 75 ms |
| Lapis semantik `hash` + leksikon istilah resmi (§5.3) | **20/20 = 100 %** | 5/5 | 75 ms |

Ambang dokumen 10: **recall@15 ≥ 90 %** dan **muat dingin < 300 ms** → **terpenuhi**; gerbang EV-05
di `verifikasi/uji-terima.sh` §6b mencetak `recall@15 = 20/20 = 100%`.

Jalur yang dipakai (bukti bahwa lapis semantik benar-benar bekerja, bukan leksikal yang kebetulan
berubah): **6 kueri dijawab lewat `semantik`** (`pendudk`, `banyaknya penduduk`, `kurang gizi`,
`mutu hidup manusia`, `derajat kemiskinan`, `kemiskinan … sekarang`) dan **8 kueri lewat
`leksikal+sisipan`**.

### 6.1 Koreksi angka antara (kejujuran metodologi)

Pengukuran antara sebelumnya mencatat **16/20** dengan lapis semantik menyala. Angka itu **tidak
sebanding** dengan 18/20 di atas karena dua hal: (a) korpus saat itu 1.208 baris, sekarang 1.210
(dua baris kunci ditambahkan agar kasus koperasi-Bebesen punya rekod benar untuk ditemukan);
(b) bobot & aturan ambang masih versi pra-kalibrasi. Karena itu laporan ini memakai satu korpus dan
satu konfigurasi final untuk **semua** angka, dan pembandingnya adalah jalur `off` pada korpus yang
sama. Baris "lapis mati" 12/20 juga naik dari 11/20 karena penambahan dua baris kunci itu — bukan
karena kode, sebab jalur `off` tidak menyentuh lapis semantik sama sekali.

---

## 7. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `src/services/semantik.ts` (baru) | penyedia `hash`/`remote`, vektor, skor, `fusiRRF`, `saringKandidatSemantik`, `pilihSisipanSemantik`, `retrieveDenganSemantik`, `metaSemantik`, knob lingkungan |
| `src/lib/sapa-client.ts` | leksikon frasa resmi, kata pengisi baru, sinonim `anak ⇄ balita` |
| `src/services/deterministic-answer.ts` | memakai `retrieval.hasil`; peringatan MAKNA masuk `daftarPeringatan` + narasi |
| `src/app/api/query/route.ts` | ekspor `siapkanIndeksSemantik(records, sidik)`; dipanggil sebelum menyusun jawaban (pemanasan indeks) |
| `src/app/api/query/stream/route.ts` | pemanasan indeks setelah data diambil — jalur JSON & streaming memakai korpus yang sama |
| `src/app/api/status/route.ts` | blok `semantik` {aktif, penyedia, dim, pembangunanTerakhir, sidik, catatan} |
| `src/services/__tests__/semantik.test.ts` (baru) | 33 uji: vektor, skor, RRF, ambang, sisipan, pembezaan jalur, bebas-angka |
| `src/lib/__tests__/retrieval.test.ts` | uji leksikon istilah resmi & kata pengisi |
| `src/lib/__tests__/eval-set.test.ts` | **mengunci luas dampak** perubahan leksikal pada set eval 90 item (lihat §8.2) |
| `scripts/uji-parafrase.mjs` (baru) | harness EV-05: 20 parafrase + 5 negatif, menghormati `Retry-After`, membaca `/api/status` |
| `scripts/buat-korpus-uji.mjs` (baru) | pembangkit korpus uji deterministik (benih tetap) |
| `data/eval-parafrase.json` (baru) | daftar kueri parafrase + negatif (satu sumber untuk harness & tinjauan) |
| `verifikasi/uji-terima.sh` + `docs/…/uji-terima.sh` | gerbang **§6b FR-12**: aktif? salah tulis terjawab? luar katalog ditolak? + uji parafrase penuh di balik `SAPA_PARAFRASE_PENUH=1` |
| `verifikasi/{eval-parafrase-baseline,eval-parafrase-hash,uji-terima-hasil}.txt` | bukti mentah angka di §6 |

Jumlah uji: **29 berkas / 382 uji** (naik dari 343). `npm run typecheck` OK, `npx next build` OK.

---

## 8. Batasan yang harus dibaca sebelum mengklaim lebih jauh

### 8.1 Angka 100 % itu hasil kalibrasi pada korpus uji, bukan jaminan produksi

Korpus ujinya **sintetis** (1.210 baris, 20 OPD) — bukan cuplikan korpus produksi. Himpunan
negatifnya hanya **5 kueri**. Ambang 0,27 **bisa disetel** lewat `SAPA_SEMANTIK_AMBANG` bila korpus
produksi berperilaku lain. Yang bisa diklaim hari ini: pada korpus ini, ambang itu memisahkan kedua
sebaran dengan jarak ~0,04 di kedua sisi **tanpa satu pun kueri uji jatuh di antaranya**.

### 8.2 Gerbang eval 90 item tidak dapat dijalankan ulang di sesi ini

Set eval 90 item dinilai terhadap **korpus produksi 2.065 record**. Korpus itu tidak tersedia di
workspace: pengambilan SPLP memerlukan kredensial OAuth (klien SAPA) yang tidak ada di lingkungan
ini, dan tidak ada cuplikan korpus produksi yang tersimpan. Karena itu gerbang §7 dijalankan dengan
`SAPA_SKIP_EVAL=1` — sama seperti tahap sebelumnya; angka **90/90 tetap dari pengukuran 21 Sep 2026**
dan **belum diuji ulang** terhadap perubahan FR-12.

Sebagai gantinya, dilakukan dua hal yang dapat diaudit:

1. **Enumerasi dampak pada set eval**: perubahan leksikal FR-12 hanya menyentuh **3 dari 90 item**
   (L9 & F1 karena kata "anak"; T3 karena "Indeks Pembangunan Manusia"); nol item memuat kata
   pengisi baru atau "aparatur". Ketiganya ber-`harus: jawab`/`jujur`, jadi arah perubahannya pun
   aman. Uji `eval-set.test.ts` **mengunci** daftar ini: bila kelak ada pemicu baru yang menyentuh
   item lain, uji gagal lebih dulu.
2. **Sembilan belas uji retrieval** menjalankan fungsi retrieval yang sama tanpa jaringan.

Yang **belum** tertutup dan sebaiknya dijalankan di klon lokal Anda (kredensial ada di sana):

```bash
SAPA_SPLP_BASE_URL=<SPLP produksi> ADMIN_TOKEN=... AI_URL=http://127.0.0.1:3116 \
DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh      # tanpa SAPA_SKIP_EVAL
```

### 8.3 Penyedia `hash` bukan pemahaman makna sejati

Ia menangkap **kemiripan bentuk & istilah** dengan pembobotan IDF, bukan makna. Batasnya terukur:
"tengkes" hanya tertangkap karena masuk leksikon resmi. Parafrase yang benar-benar berbeda kata
(mis. "seberapa banyak anak yang **tidak tumbuh optimal**") tetap akan ditolak oleh `hash` — dan itu
memang perilaku yang benar daripada menebak. Untuk itu `SAPA_SEMANTIK=remote` dengan model kelas
*e5-large* (praktik terbaik Indonesia: SEA-BED/MIRACL-id; Qwen3 memimpin SEA-HELM 2026) sudah
tersedia dan tersambung: cukup set `SAPA_EMBED_BASE_URL`, `SAPA_EMBED_MODEL`, `SAPA_EMBED_API_KEY`.
Bila penyedia jarak jauh gagal, sistem **jatuh ke `hash`** dan mencatatnya di `/api/status` —
tidak pernah menggagalkan jawaban.

### 8.4 Catatan operasional

* Indeks dibangun **per instance** dan disimpan di memori; 75 ms pada 1.210 record berarti biayanya
  kecil, tetapi di serverless (Vercel) instance baru akan membangunnya lagi pada kueri pertama.
* Peringatan MAKNA muncul pada **setiap** jawaban jalur semantik. Itu disengaja: pengguna harus tahu
  bahwa jawaban tidak berasal dari kecocokan kata. Bila nanti terbukti terlalu berisik, yang boleh
  dikurangi adalah panjang kalimatnya — bukan keberadaannya.

---

## 9. Langkah berikutnya

| Urutan | Item | Inti |
|---|---|---|
| 1 | **FR-20 klasifikasi sebab** | setiap kegagalan jawaban diberi tag sebab; melanjutkan pola `tentukanSebabCelah` (FR-27) |
| 2 | **FR-24 pemeriksa pasangan entitas** | mencegah jawaban yang menukar dua entitas berbeda (mis. "kopi arabika" vs "robusta") |
| 3 | **FR-23 pembersihan masukan** | normalisasi masukan kotor/derau sebelum retrieval |
| 4 | **NFR-07 telemetri `gen_ai.*`**, **OPS-03/04**, **NFR-09 aksesibilitas**, **CMP-02/03/04** | tata kelola & pengalaman |

Saran paling berdaya berikutnya: **FR-20** (murah, dan membuat setiap kegagalan yang tersisa dapat
dijelaskan dengan satu tag sebab — termasuk kegagalan yang akan muncul dari lapis semantik).

## Lanjutan — audit ulang 24 Sep 2026 (ringkas; rinci di laporan 31)

Saat uji terima dijalankan terhadap korpus **produksi** (2.065 record), satu pemeriksaan FR-12
gagal: kueri salah tulis `pendudk` dinilai "tidak menemukan indikator penduduk". Setelah ditelusuri,
**perilakunya benar**: katalog produksi memuat indikator bercap salah tulis
`"Jumlah Pendudk Usia 13-15 Tahun"`, sehingga lapis **leksikal** (yang berjalan lebih dulu, sesuai
invarian yang disengaja) menemukan baris itu — dan pemeriksaannya yang menuntut ejaan "penduduk".

Pemeriksaan di `docs/usulan-ai-tingkat-lanjut/uji-terima.sh` dipecah menjadi dua yang menguji janji
sebenarnya:

| Pemeriksaan | Hasil |
| --- | --- |
| (2a) salah tulis yang **ada** di katalog (`pendudk`) → cukup batang kata `pendud` | ✓ lulus |
| (2b) salah tulis **di luar** katalog (`panduduk`) → lapis semantik mengambil alih (`sebab` memuat `semantik`), bukti relevan | ✓ lulus — `selesai:semantik`, 15 bukti |
| (3) kueri di luar katalog ditolak (0 bukti) | ✓ lulus |

**Keterbatasan yang tetap dicatat:** bila salah tulis kebetulan cocok dengan nama indikator yang
memang salah tulis di katalog, jawabannya menjadi sempit (1 bukti) karena lapis semantik sengaja
tidak menambah baris selama leksikal masih menemukan sesuatu. Kandidat perbaikan (*top-up* semantik
bila bukti leksikal sangat sedikit) **belum dikerjakan** — mengubah daftar bukti berarti membatalkan
baseline 120/120 dan seluruh A/B; itu keputusan pemilik produk.
