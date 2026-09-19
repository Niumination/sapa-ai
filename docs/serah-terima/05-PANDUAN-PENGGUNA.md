# Panduan Pengguna — SAPA Smart AI Kabupaten Aceh Tengah

Dokumen ini ditujukan untuk pengguna akhir: pegawai OPD dan Diskominfo Kabupaten Aceh Tengah, bukan teknisi. Tidak diperlukan pengetahuan teknis untuk memakai aplikasi ini. Semua istilah teknis dijelaskan pada bagian "Daftar Istilah" di akhir dokumen.

- Nama layanan: SAPA Smart AI
- Alamat produksi: https://sapa-smart-ai.vercel.app
- Sumber data tunggal: SAPA Kabupaten Aceh Tengah melalui API SPLP (`api-splp.layanan.go.id/sapa`)
- Akses: publik, tanpa login dan tanpa kata sandi

---

## 1. Catatan penting sebelum memakai (wajib dibaca)

1. **Jawaban aplikasi bersifat informatif, bukan produk hukum.** Angka resmi yang dipakai untuk laporan, rapat, atau dokumen pemerintahan tetap berasal dari OPD pengampu data. Aplikasi ini membantu Anda menemukan dan membaca data lebih cepat, bukan menggantikan penerbit angka.
2. **Verifikasi ke OPD pengampu.** Setiap jawaban menyertakan nama OPD dan tahun data. Bila angka akan dipakai untuk keputusan resmi, cocokkan dengan penerbit aslinya (nama OPD tercantum pada tabel evidence).
3. **Narasi dapat merupakan hasil rangkaian model AI.** Bagian dalam jawaban menjelaskan apakah narasi dirangkai AI atau dihitung langsung dari data. Angka yang ditampilkan selalu diambil dari data SAPA, bukan dikarang oleh model AI.
4. **Tidak semua pertanyaan bisa dijawab.** SAPA hanya memuat indikator agregat per OPD pada tingkat kabupaten. Pertanyaan tentang orang tertentu, data per rumah tangga, atau rincian per kecamatan tidak tersedia pada sumber data ini.

---

## 2. Cara membuka aplikasi dan peta halaman

| Halaman | Alamat | Fungsi utama |
|---|---|---|
| Beranda | `/dashboard` | Kotak pertanyaan (QueryBar), 10 tombol contoh pertanyaan, KPI Prioritas Daerah, Top 10 OPD, ringkasan data SAPA |
| Analitik | `/dashboard/analytics` | Grafik per OPD, kelengkapan data per OPD, kategori indikator, satuan, jadwal pemutakhiran, Top 20 indikator, dan rincian per OPD (drill-down) |
| Peta GIS | `/dashboard/gis` | Peta letak 14 kecamatan (OpenStreetMap), ringkasan tingkat kabupaten, daftar kecamatan dan koordinat |
| Laporan AI | `/dashboard/laporan` | Dua tab: Laporan Eksekutif (siap cetak) dan Riwayat Query (tersimpan di peramban Anda) |
| Status & Tentang | `/dashboard/status` | Kesehatan sumber data SAPA, jumlah record/OPD/indikator, latensi, keterangan akses publik dan sumber data |

Catatan: alamat utama (`/`) otomatis mengarahkan Anda ke Beranda (`/dashboard`). Jadi kotak pertanyaan dan tombol contoh pertanyaan berada di halaman Beranda.

### Langkah membuka aplikasi

1. Buka peramban (Chrome, Edge, atau Safari) dan ketik alamat `https://sapa-smart-ai.vercel.app`.
   Hasil yang diharapkan: halaman Beranda terbuka, menampilkan kotak "Tanya data SAPA Aceh Tengah".
2. Perhatikan baris kecil di bawah kotak pertanyaan.
   Hasil yang diharapkan: tertulis jumlah record, jumlah OPD, dan keterangan "SPLP only" (contoh: "2.065 record · 38 OPD · SPLP only"). Bila angka ini muncul, aplikasi berhasil membaca katalog SAPA.
3. Gunakan menu di sisi kiri (Beranda, Analitik, Peta GIS, Laporan AI, Status & Tentang) untuk berpindah halaman.
   Hasil yang diharapkan: menu yang sedang aktif ditandai dengan latar hijau muda.

---

## 3. Apa yang bisa dan tidak bisa ditanyakan

### 3.1 Yang BISA ditanyakan

Aplikasi menjawab indikator yang benar-benar ada pada katalog SAPA. Tombol contoh pertanyaan di Beranda sudah diverifikasi cocok dengan katalog:

- Stunting
- Prevalensi Stunting
- IPM (Indeks Pembangunan Manusia)
- PDRB
- Kopi Arabika
- ASN
- Kesehatan
- Pendidikan
- Belanja APBD
- Sebaran data SAPA per tahun

Kartu **KPI Prioritas Daerah** di Beranda memuat 8 indikator terkurasi: Balita Stunting, Indeks Pembangunan Manusia, Jumlah ASN, Data Kemiskinan, Produksi Kopi Arabika, PDRB Harga Konsisten, Panjang Jalan, dan Anak Putus Sekolah.

### 3.2 Yang TIDAK BISA ditanyakan

1. **Data per orang.** Aplikasi tidak menyimpan dan tidak melayani daftar nama, nomor identitas (NIK), atau identitas penerima bantuan. Pertanyaan semacam ini ditolak dengan penjelasan tertulis, dan pengajuan data per orang harus melalui OPD pengampu (Dinas Sosial atau Disdukcapil) sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi.
2. **Nomor identitas 16 digit.** Setiap pertanyaan yang memuat pola NIK 16 digit langsung ditolak, walaupun aplikasi lain pada halaman itu masih dapat dipakai.
3. **Angka di luar katalog SAPA.** Aplikasi tidak menarik data dari sumber lain (BPS, Kemendag, media, atau berkas Excel Anda). Bila kata kunci tidak ada di katalog, aplikasi akan mengatakan datanya tidak ditemukan, bukan menebak.
4. **Rincian per kecamatan.** SAPA memuat data pada tingkat kabupaten/OPD. Peta GIS menampilkan letak 14 kecamatan sebagai konteks wilayah, bukan nilai indikator per kecamatan. Keterangan ini juga tercetak pada kotak "Cakupan data" di halaman Peta GIS.
5. **Prediksi, ramalan, atau proyeksi.** Aplikasi tidak membuat perkiraan ke depan. Pertanyaan seperti "prediksi stunting tahun depan" hanya akan dijawab dengan data yang ada, tanpa angka ramalan.
6. **Penilaian sebab-akibat ("mengapa naik").** Aplikasi dapat menyajikan angka dan perbandingan, tetapi tidak menetapkan hubungan sebab-akibat atau menyalahkan satu program atas suatu angka.

---

## 4. Contoh pertanyaan nyata dan cara bertanya yang efektif

### 4.1 Empat aturan bertanya

1. **Pakai 1–2 istilah inti.** Contoh: tulis "IPM", bukan "tolong tampilkan angka IPM Kabupaten Aceh Tengah tahun 2024 beserta penjelasannya". Kata pengisi kalimat diabaikan sistem, tetapi kalimat panjang menambah peluang kata kunci tidak cocok.
2. **Sebut topik, bukan cara menyajikan.** Kata seperti "terbanyak", "urutkan", atau "sebaran" boleh dipakai; sistem mengenalinya sebagai cara menjawab, bukan sebagai nama data.
3. **Hindari kata yang tidak ada di katalog.** Kata seperti "saham", "harga beras", atau "prediksi" tidak memiliki padanan indikator di SAPA. Bila ada kata yang sama sekali tidak dikenal, aplikasi akan menyebutkan kata tersebut pada jawaban agar Anda tahu penyebabnya.
4. **Satu topik per pertanyaan.** Gabungan dua topik berbeda (misalnya "IPM dan jumlah nelayan") membuat pencocokan melemah; ajukan terpisah.

### 4.2 Contoh pertanyaan yang dianjurkan

Minimal delapan contoh berikut relevan dengan data statistik daerah dan memakai istilah yang ada pada katalog SAPA:

1. `stunting`
2. `prevalensi stunting`
3. `IPM`
4. `PDRB`
5. `kopi arabika`
6. `ASN`
7. `kesehatan`
8. `pendidikan`
9. `Belanja APBD`
10. `sebaran data sapa per tahun`

Contoh pertanyaan bahasa natural (tetap memakai kata kunci yang sama, sehingga peluang cocoknya tinggi):

11. `Berapa jumlah penduduk miskin di Aceh Tengah?`
12. `Panjang jalan kabupaten`
13. `Jumlah anak putus sekolah`
14. `Berapa jumlah koperasi?`

Catatan: contoh 11–14 memakai kata kunci yang dikenal katalog. Bila hasil yang muncul kurang tepat, gunakan kartu **Pertanyaan lanjutan** pada jawaban (lihat bagian 6.10) untuk mempersempit topik, OPD, atau tahun.

### 4.3 Langkah bertanya

1. Ketik pertanyaan pada kotak di Beranda, lalu tekan tombol "Tanya" (atau tekan Enter).
   Hasil yang diharapkan: muncul lingkaran memuat dengan tulisan status, misalnya "Mengambil data SAPA…" lalu "Menganalisis pertanyaan…", diikuti narasi yang tampil bertahap.
2. Tunggu sampai jawaban lengkap muncul (judul, angka utama, narasi, tabel evidence).
   Hasil yang diharapkan: jawaban penuh tampil dan proses memuat berhenti. Batas tunggu aplikasi adalah 55 detik; setelah itu muncul pesan batas waktu.
3. Gunakan tombol "Kembali ke Beranda" di kanan atas untuk mengulang dari awal.
   Hasil yang diharapkan: halaman kembali menampilkan KPI dan ringkasan; pertanyaan terakhir tetap tersimpan di riwayat.

---

## 5. Arti setiap bagian jawaban

Jawaban disusun dalam beberapa blok. Berikut urutan dan artinya dari atas ke bawah.

### 5.1 Lencana sumber narasi (badge AI vs deterministik)

Di kanan atas jawaban terdapat lencana yang menyatakan bagaimana narasi dibuat:

- **"Dirangkai AI (nama model)"** dengan warna hijau: narasi dirangkum oleh model AI, dan seluruh angka diambil dari evidence SAPA. Menempatkan kursor pada lencana menampilkan keterangan "Narasi dirangkai model, seluruh angka diambil dari evidence SAPA".
- **"Dirangkai AI (nama model)"** dengan warna kuning: model sempat merangkai narasi, tetapi narasi itu tidak lolos pemeriksaan angka sehingga diganti oleh template otomatis. Keterangan pada lencana: "Narasi model diganti template deterministik karena tidak lolos pemeriksaan angka".
- **"Dihitung langsung dari data SAPA"**: tidak ada model AI yang dipakai; narasi disusun oleh aturan tetap (template) dari data SAPA. Keterangan: "Tanpa model AI: narasi dirangkai aturan deterministik dari data SAPA".

Selain itu ada baris kecil di atas judul yang menuliskan **"Jawaban AI"** atau **"Jawaban deterministik"**, diikuti tipe jawaban. Tiga lencana lain menyatakan: "Evidence terstruktur" (angka disertai tabel sumber), tipe jawaban, dan asal data ("SAPA SPLP" atau "Direct API").

Arti praktisnya: bila lencana menyatakan dihitung langsung dari data SAPA, isi jawaban sepenuhnya hasil perhitungan aturan atas data SAPA tanpa campur tangan model AI. Bila menyatakan dirangkai AI, kalimatnya disusun model, sedangkan angkanya tetap berasal dari data SAPA.

### 5.2 Judul dan paragraf pembuka (lead)

Judul menyatakan topik yang dikenali sistem dari pertanyaan Anda. Paragraf pembuka merangkum temuan utama dalam satu atau dua kalimat. Bila sistem tidak menemukan data yang aman disimpulkan, judul akan menyatakan batas data dan tidak menampilkan angka utama.

### 5.3 Angka utama (headline)

Angka besar di bawah judul adalah nilai indikator terpilih, ditampilkan dalam bentuk singkat (misalnya "1,44 Triliun"). Di sebelahnya:

- **Satuan** ditulis di bawah angka (misalnya "Jiwa", "Persen", "Milyar").
- **Lencana Prevalensi** ditampilkan hanya bila evidence memuat indikator prevalensi; angkanya adalah perkiraan yang dihitung dari evidence tersebut.
- Kotak **Tipe jawaban** menyatakan bentuk jawaban: Nilai utama, Perbandingan, Distribusi, Tren, Batas data, Evidence terpilih, atau Data spasial.

Bila data tidak tersedia, tulisan "Belum tersedia" muncul dengan warna berbeda, dan seluruh blok angka ditahan. Ini bukan kesalahan aplikasi, melainkan pernyataan bahwa bukti belum cukup.

### 5.4 Kartu konteks (khusus topik kesehatan dan gizi)

Untuk pertanyaan bertema stunting/gizi, muncul tiga kartu: **Basis Data** (jumlah balita yang dipantau), **Tingkat Risiko** (balita kurus), dan **Intervensi Utama** (misalnya cakupan Vitamin A). Kartu ini hanya tampil bila evidence memang memuat indikator terkait, sehingga pertanyaan non-kesehatan (misalnya ASN) tidak akan menampilkan kartu ini.

### 5.5 Narasi eksekutif

Blok hijau tua berisi penjelasan tertulis atas angka. Di bagian bawahnya tercantum label sumber, misalnya "Sumber: SAPA Aceh Tengah (api-splp.layanan.go.id)". Narasi ini yang biasanya dikutip untuk bahan rapat.

### 5.6 Kartu metrik

Deretan kartu berisi beberapa nilai pendukung beserta satuan dan label indikatornya. Kartu ini diambil dari evidence yang sama, jadi tidak ada angka baru yang ditambahkan oleh tampilan.

### 5.7 Evidence per kategori

Tabel bukti yang dikelompokkan menjadi empat kategori: **Masalah Kesehatan**, **Pemantauan**, **Intervensi**, dan **Dukungan**. Angka di dalam tanda kurung menyatakan jumlah baris pada kategori itu. Kategori yang tidak relevan tidak ditampilkan.

### 5.8 Tabel "Evidence yang dipakai"

Tabel ini adalah daftar bukti mentah yang mendasari jawaban, dengan kolom:

- **Indikator**: nama indikator sebagaimana tercatat di SAPA.
- **Nilai**: angka apa adanya dari sumber, tanpa penafsiran.
- **Satuan**: satuan resmi dari sumber (misalnya Persen, Jiwa, Rupiah). Tanda "—" berarti satuan tidak tercantum pada sumber.
- **OPD**: instansi pengampu data. Gunakan kolom ini untuk menghubungi penerbit angka.
- **Tahun**: tahun data. Tanda "—" berarti sumber tidak mencantumkan tahun.

Tidak semua baris evidence ditampilkan sekaligus; tabel menampilkan sebagian baris teratas. Sebagian halaman juga menampilkan jumlah total evidence yang dipakai.

### 5.9 Panel keputusan (sisi kanan)

Panel ini berisi empat bagian:

1. **Quick win** — langkah tindak lanjut terdekat, lengkap dengan satuan pengusul (**owner**) dan rentang waktu (**horizon**). Contoh: "Validasi dengan (nama OPD) — konfirmasi definisi indikator dan satuan sebelum dipakai di rapat pimpinan, 0–7 hari".
2. **Kualitas jawaban** — empat baris pemeriksaan: **Evidence** (jumlah baris bukti), **Sumber** (tercantum atau tidak), **Visual** (sesuai bentuk data atau ditahan dengan alasan), dan **Tahun/periode** (contoh: "3/5 bertahun · 2023, 2024, 2025"). Panel ini secara tegas bukan skor keyakinan (confidence score); ia hanya menyatakan kelengkapan data.
3. **Sumber & provenance** — label sumber, waktu pengambilan data, jumlah evidence, dan catatan "nilai tidak ditambah oleh UI". Tersedia tombol **Salin ringkasan** (menyalin judul, narasi, quick win, sumber ke papan klip) dan **Ekspor brief** (mengunduh berkas teks `sapa-executive-brief.txt`).
4. **Pertanyaan lanjutan**.

### 5.10 Pertanyaan lanjutan

Tombol-tombol kecil di bagian bawah panel berisi usulan pertanyaan berikutnya, disesuaikan dengan bentuk evidence. Contoh: "Filter hanya (nama OPD)", "Bandingkan 2023 vs 2025", "Tampilkan tren per tahun", "Buat ringkasan satu halaman". Menekan salah satunya langsung menjalankan pertanyaan baru, sehingga Anda dapat mendalami data tanpa mengetik ulang.

---

## 6. Membaca halaman Analitik dan Laporan

### 6.1 Analitik (`/dashboard/analytics`)

1. Tiga kartu atas: **Total Records**, **Total OPD**, **Total Indikator**.
   Hasil yang diharapkan: angka konsisten dengan keterangan katalog pada Beranda.
2. **OPD Performance — Jumlah Indikator**: peringkat OPD menurut jumlah indikator yang diampu.
3. **Data Completeness per OPD**: tingkat kelengkapan data per OPD.
4. Tiga diagram lingkaran: **Kategori Indikator**, **Satuan / Unit**, dan **Jadwal Pemutakhiran** (harian, bulanan, tahunan, dan seterusnya).
5. **Top 20 Indikator Terbanyak**: indikator yang paling sering muncul pada katalog.
6. Rincian per OPD (drill-down): tren tahunan per indikator, tabel nilai terakhir, dan jumlah record tanpa tahun.

Perlu dipahami: bagian tren hanya dibentuk untuk indikator yang memiliki sekurang-kurangnya dua titik tahun. Record yang tidak mencantumkan tahun dilaporkan sebagai "tanpa tahun" dan tidak dipaksa menjadi tren.

### 6.2 Laporan Eksekutif (`/dashboard/laporan`, tab pertama)

Laporan disusun otomatis dari data SAPA (tanpa penafsiran AI atas angka) dan memuat lima bagian: **Ringkasan Eksekutif** (narasi + angka kunci), **KPI Prioritas Daerah**, **Peringatan Dini (EWS)**, **Perubahan Data Antar-Periode**, serta **Kualitas dan Tata Kelola Data**.

- Bagian **Peringatan Dini (EWS)** saat ini menyatakan "belum aktif" karena aplikasi ini hanya memakai sumber SAPA tanpa sistem peringatan; ini disengaja, bukan kerusakan.
- Tombol **Cetak / Simpan PDF** membuka dialog cetak peramban untuk menyimpan laporan sebagai PDF.

### 6.3 Riwayat Query (`/dashboard/laporan`, tab kedua)

Riwayat disimpan di peramban Anda sendiri (penyimpanan lokal), bukan di server, sehingga hanya tampak di perangkat dan peramban yang Anda pakai. Batas penyimpanan 50 pertanyaan terakhir. Tersedia pencarian, **Export CSV**, dan **Hapus** (dengan konfirmasi). Menghapus riwayat tidak memengaruhi data SAPA.

---

## 7. Arti pesan yang mungkin muncul dan tindakan yang disarankan

| Pesan yang muncul | Artinya | Tindakan yang disarankan |
|---|---|---|
| `AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban` | Kedua mode jawaban (AI dan template deterministik) sedang dimatikan oleh pengelola melalui panel admin. Ini keadaan yang disengaja, biasanya karena langganan penyedia model AI belum diperpanjang — bukan kerusakan aplikasi. | Hubungi pengelola aplikasi (lihat jalur eskalasi pada dokumen runbook) untuk meminta layanan dinyalakan. Sementara itu halaman Beranda (KPI), Analitik, Peta GIS, Laporan, dan Status tetap dapat dipakai karena tidak bergantung pada mode jawaban. |
| `Tidak ada data SAPA yang relevan untuk pertanyaan ini, dan jawaban deterministik dinonaktifkan oleh admin` | Pertanyaan tidak menemukan bukti di katalog SAPA, dan mode jawaban template sedang dimatikan, sehingga sistem tidak dapat memberikan penjelasan "tidak ditemukan". | Perbaiki kata kunci (pakai istilah pada bagian 3.1), lalu coba lagi setelah layanan dinyalakan. |
| `Terlalu banyak permintaan. Coba lagi beberapa saat.` | Batas laju pemakaian tercapai (30 permintaan per menit per alamat jaringan). | Tunggu sekitar satu menit, lalu ulangi. Hindari menekan tombol Tanya berulang kali secara cepat. |
| `Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.` | Server sumber data SAPA (SPLP) sedang tidak dapat dihubungi. Aplikasi menolak menjawab daripada menampilkan angka lama yang menyesatkan. | Tunggu beberapa menit dan ulangi. Bila tetap gagal, periksa halaman Status & Tentang dan laporkan ke pengelola. |
| `Query tidak valid (minimal 3 karakter)` | Pertanyaan terlalu pendek. | Ketik pertanyaan minimal tiga huruf. |
| `Permintaan melewati batas 55 detik. Coba pertanyaan yang lebih singkat.` | Proses menjawab melebihi batas waktu sisi peramban. | Persingkat pertanyaan (satu topik, satu atau dua istilah inti) dan ulangi. |
| `Tidak ada hasil dari server` | Aliran jawaban terputus sebelum jawaban lengkap diterima. | Muat ulang halaman, lalu ajukan ulang pertanyaan. |
| `Tidak ditemukan data SAPA yang relevan dengan "(pertanyaan)" ...` (muncul sebagai isi jawaban, bukan kotak galat) | Kata kunci tidak ada pada katalog. Jawaban biasanya menyebutkan kata kunci yang tidak dikenal dan menyarankan istilah lain. | Ganti dengan istilah pada bagian 3.1, misalnya `stunting`, `prevalensi`, `IPM`, `kemiskinan`, `PDRB`, `kopi arabika`, `jalan`, `putus sekolah`, `ASN`. |
| `Tidak ada data untuk tahun (tahun) di SAPA.` (bagian awal jawaban) | Anda menyebut tahun tertentu, tetapi tidak ada evidence bertahun itu. Angka yang ditampilkan berlaku untuk tahun lain. | Periksa kolom Tahun pada tabel evidence, atau ulangi tanpa menyebut tahun. |
| `Tidak ada data SAPA yang memuat seluruh kata kunci sekaligus ...` (bagian awal jawaban) | Sebagian kata kunci dikenal katalog, tetapi tidak ada satu indikator pun yang menggabungkan semuanya. Indikator terdekat tetap ditampilkan sebagai bahan, bukan sebagai jawaban pasti. | Pecah pertanyaan menjadi topik tunggal. |
| Penolakan bertema pelindungan data pribadi (menyebut NIK atau UU No. 27/2022) | Pertanyaan memuat nomor identitas atau meminta data per orang. Aplikasi menolak secara sengaja. | Ajukan pertanyaan agregat, misalnya "jumlah penduduk Aceh Tengah". Untuk data per orang, ajukan permohonan ke Disdukcapil atau OPD pengampu. |
| `Gagal memuat laporan: HTTP 500` atau `Gagal memuat analitik` | Halaman gagal mengambil data dari server aplikasi. | Tekan **Coba Lagi** atau muat ulang halaman. Bila berulang, laporkan ke pengelola beserta waktu kejadian. |
| `Gagal memuat data` atau `Gagal menghubungi server` pada Peta GIS | Data wilayah gagal dimuat. | Tekan **Coba lagi**. Peta dasar berasal dari layanan OpenStreetMap sehingga memerlukan koneksi internet yang baik. |

Catatan keadaan terkini (verifikasi 19 September 2026): kedua mode jawaban berada pada posisi mati, sehingga setiap pertanyaan dibalas dengan pesan `AI tidak aktif — jawaban deterministik dan AI tidak menghasilkan jawaban`. Ini keadaan yang disengaja, bukan kerusakan, dan akan berubah setelah pengelola menyalakan kembali mode jawaban melalui panel admin.

---

## 8. Kebiasaan pemakaian yang disarankan

1. Untuk bahan rapat cepat, buka **Beranda** dan gunakan KPI Prioritas Daerah serta tombol contoh pertanyaan.
2. Untuk memeriksa tren antar tahun, lanjutkan ke **Analitik** dan buka rincian per OPD.
3. Untuk laporan siap cetak, gunakan **Laporan AI**, tab Laporan Eksekutif, lalu Cetak / Simpan PDF.
4. Untuk memastikan sumber data hidup atau sedang bermasalah, buka **Status & Tentang**.
5. Untuk mengutip angka secara aman: sebutkan indikator, nilai, satuan, OPD, dan tahun dari tabel evidence, dan cantumkan sumber "SAPA Aceh Tengah (api-splp.layanan.go.id)".

---

## 9. Daftar istilah

- **SPLP**: Sistem Penyedia Layanan Publik, jalur API tempat aplikasi mengambil data SAPA.
- **SAPA**: Satu Pintu Akses Data, katalog data Kabupaten Aceh Tengah.
- **Evidence (bukti)**: baris data mentah dari SAPA (indikator, nilai, satuan, OPD, tahun) yang mendasari jawaban.
- **Deterministik**: jawaban yang disusun sepenuhnya oleh aturan tetap dari data, tanpa model AI.
- **Dirangkai AI**: narasi disusun model AI, sementara angkanya tetap diambil dari evidence SAPA.
- **Grounding**: pemeriksaan otomatis yang membuang angka yang tidak ada pada evidence, sehingga model tidak dapat menampilkan angka karangan.
- **OPD**: Organisasi Perangkat Daerah, instansi pengampu data.
- **Cache**: penyimpanan sementara. Aplikasi menyimpan hasil pembacaan data SAPA paling lama 10 menit agar halaman cepat dibuka.
