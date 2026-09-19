# Kerangka Acuan Kerja (KAK)

**Nama Kegiatan:** Pengembangan Aplikasi SAPA Smart AI — Asisten Data Statistik Kabupaten Aceh Tengah
**Nomor:** `[DIISI: nomor dokumen]`
**Tahun Anggaran:** `[DIISI: tahun anggaran]`
**Unit Kerja:** Dinas Komunikasi dan Informatika Kabupaten Aceh Tengah — Bidang Statistik dan Persandian
**Sumber Dana:** `[DIISI: DPA/APBK/DAK/dana lain]`
**Pelaksana:** `[DIISI: nama pelaksana / penyedia]`
**Jangka Waktu:** `[DIISI: jumlah bulan]`, mulai `[DIISI: tanggal mulai]` sampai `[DIISI: tanggal selesai]`

> Dokumen ini adalah **kerangka**. Seluruh isi yang bertanda `[DIISI: …]` merupakan
> kewenangan pejabat atau pengelola administrasi kegiatan, bukan keputusan pengembang.
> Bagian teknis telah diisi berdasarkan keadaan aplikasi yang sebenarnya.

---

## 1. Latar Belakang

Kabupaten Aceh Tengah memiliki data statistik sektoral yang tersimpan pada Sistem
Pemerintahan Berbasis Elektronik, salah satunya melalui API SPLP
(`api-splp.layanan.go.id/sapa`) yang memuat ribuan catatan indikator dari puluhan
perangkat daerah. Data itu saat ini hanya dapat dimanfaatkan oleh pegawai yang
memahami struktur katalognya.

Praktik yang berlaku sekarang: pegawai mengunduh berkas, mencari indikator secara
manual, lalu mengolahnya sendiri. Cara ini memakan waktu, mudah keliru satuan dan
tahun, serta sulit ditelusuri kembali ketika angka yang dipakai diperdebatkan.

Aplikasi **SAPA Smart AI** dibangun untuk menutup jarak tersebut: pegawai mengajukan
pertanyaan dalam bahasa Indonesia sehari-hari, aplikasi mencari indikator yang relevan
pada katalog resmi, lalu menyusun jawaban **beserta buktinya** (nama indikator, nilai,
satuan, tahun, dan OPD asal) sehingga setiap angka dapat diperiksa ulang.

## 2. Maksud dan Tujuan

**Maksud:** menyediakan sarana tanya-jawab data statistik daerah yang cepat, dapat
ditelusuri, dan tidak bergantung pada keahlian teknis penggunanya.

**Tujuan:**

1. Mempercepat perolehan angka statistik daerah dari hitungan jam menjadi hitungan detik.
2. Menjamin setiap angka yang disajikan berasal dari katalog resmi dan disertai bukti.
3. Mengurangi kesalahan penyalinan satuan dan tahun pada bahan laporan.
4. Menyediakan bahan laporan eksekutif dan peta sebaran data secara otomatis.
5. Menyerahkan kendali penuh atas aplikasi, kode sumber, dan dokumentasi kepada
   Diskominfo Aceh Tengah.

## 3. Sasaran

| No | Sasaran | Ukuran keberhasilan |
|---|---|---|
| 1 | Pegawai OPD dapat memperoleh angka statistik tanpa bantuan teknis | Pertanyaan wajar dijawab dalam waktu kurang dari 1 menit |
| 2 | Setiap jawaban dapat ditelusuri | Setiap jawaban menyertakan daftar bukti (indikator, nilai, satuan, tahun, OPD) |
| 3 | Data yang disajikan terbaru | Agregat disegarkan paling lama setiap 10 menit |
| 4 | Aplikasi dapat dipelihara penerima | Tersedia dokumentasi pemasangan, penggunaan, dan pemeliharaan |
| 5 | Kepemilikan berpindah utuh | Kode, hak cipta, dan dokumentasi diserahkan kepada Diskominfo |

## 4. Ruang Lingkup

### 4.1 Termasuk dalam lingkup

1. Aplikasi web tanya-jawab data statistik (lima halaman: Beranda, Analitik, Peta GIS,
   Laporan, Status) beserta panel admin dua sakelar.
2. Kode sumber lengkap pada repositori `github.com/Niumination/sapa-ai`, cabang `main`.
3. Dokumentasi: 14 berkas pada folder `docs/serah-terima/`, ditambah `README.md`,
   `LICENSE`, dan `CHANGELOG.md`.
4. Pengujian otomatis: 169 pengujian pada 17 berkas, dengan pemeriksaan tipe dan
   pembangunan produksi sebagai gerbang.
5. Pendampingan alih pengetahuan kepada pegawai yang ditunjuk.

### 4.2 Tidak termasuk dalam lingkup

1. **Sumber data.** API SPLP dikelola pihak ketiga. Perubahan, gangguan, atau
   penghentian layanan itu di luar kendali aplikasi.
2. **Penyediaan data.** Aplikasi tidak membuat, memperbaiki, atau memutakhirkan isi
   katalog SAPA; ia hanya membaca.
3. **Pengadaan perangkat dan jaringan.** Perangkat kerja dan sambungan internet
   pengguna disediakan unit masing-masing.
4. **Biaya langganan pihak ketiga** (penempatan/ hosting, pencadangan, penyedia model
   bahasa) — dirinci pada dokumen RAB, ditanggung sesuai ketentuan kegiatan.
5. **Data pribadi.** Aplikasi tidak memproses data pribadi penduduk dan menolak
   pertanyaan yang meminta data per orang.

## 5. Keluaran (Deliverables)

| No | Keluaran | Bentuk | Bukti penerimaan |
|---|---|---|---|
| 1 | Aplikasi berjalan | Alamat produksi `https://sapa-smart-ai.vercel.app` | Halaman dapat dibuka, lima halaman berfungsi |
| 2 | Kode sumber | Repositori Git, cabang `main` | Riwayat commit lengkap, dapat dipasang ulang |
| 3 | Hak cipta | Berkas `LICENSE` | Hak cipta atas nama Diskominfo Aceh Tengah |
| 4 | Dokumentasi teknis | 14 berkas `docs/serah-terima/` | Dapat diikuti orang lain tanpa bantuan pengembang |
| 5 | Berita acara serah terima | `00-BERITA-ACARA-SERAH-TERIMA.md` | Ditandatangani kedua pihak |
| 6 | Kredensial | Berkas terpisah, kanal aman | Diterima pejabat berwenang, tercatat |
| 7 | Pendampingan | Sesi tatap muka atau daring | Daftar hadir |

## 6. Kriteria Penerimaan

1. Aplikasi dapat dipasang dari repositori mengikuti `03-PANDUAN-INSTALASI-DAN-DEPLOYMENT.md`
   (`npm install`, `npm run build` berhasil).
2. Pemeriksaan tipe bersih dan seluruh 169 pengujian lulus.
3. Lima halaman aplikasi dapat dibuka dan menampilkan data.
4. Panel admin dapat dioperasikan oleh pegawai yang ditunjuk, dengan kunci yang
   diserahkan melalui kanal aman.
5. Dokumen dapat diikuti: penerima berhasil menjalankan satu siklus pemeliharaan
   rutin mengikuti `04-PANDUAN-OPERASIONAL-RUNBOOK.md`.
6. Kredensial diserahkan dalam bentuk berkas terpisah dan tidak pernah ditulis pada
   dokumen mana pun.

## 7. Metode Pelaksanaan

| Tahap | Kegiatan | Keluaran tahap |
|---|---|---|
| 1 | Analisis kebutuhan dan penelusuran katalog SPLP | Daftar indikator dan kebutuhan pengguna |
| 2 | Perancangan alur data dan penyusunan jawaban | Dokumen arsitektur |
| 3 | Pengembangan aplikasi dan integrasi sumber data | Aplikasi berjalan di lingkungan uji |
| 4 | Pengujian (unit, gerbang evaluasi 78 butir, uji coba pengguna) | Laporan pengujian |
| 5 | Penyusunan dokumentasi dan pembersihan repositori | Paket dokumen serah terima |
| 6 | Pendampingan dan serah terima | Berita acara dan kredensial |

## 8. Jadwal Pelaksanaan

Minggu ke-1 sampai ke-`[DIISI: jumlah minggu]`, dengan sebaran:

| Tahap | Minggu ke- | Keterangan |
|---|---|---|
| 1–2 | `[DIISI]` | |
| 3–4 | `[DIISI]` | |
| 5–6 | `[DIISI]` | |
| 7 | `[DIISI]` | |
| 8 | `[DIISI]` | |

## 9. Personel dan Kebutuhan Sumber Daya

| Peran | Jumlah | Kualifikasi |
|---|---|---|
| Penanggung jawab kegiatan | 1 | `[DIISI: jabatan]` |
| Pengembang | 1 | Menguasai TypeScript/Next.js, integrasi API |
| Penguji | 1 | `[DIISI]` |
| Narasumber/pendamping | 1 | `[DIISI]` |
| Perangkat kerja | — | Komputer, sambungan internet |

## 10. Pembiayaan

Rincian biaya disusun terpisah pada dokumen **`12-RENCANA-ANGGARAN-BIAYA.md`**.
Pembiayaan dibebankan pada `[DIISI: sumber dana dan kode rekening]`.

## 11. Pelaporan dan Serah Terima

1. Laporan kemajuan disampaikan `[DIISI: mingguan/bulanan]` kepada penanggung jawab kegiatan.
2. Laporan akhir disertai paket dokumen serah terima dan bukti pengujian.
3. Serah terima dilakukan melalui penandatanganan Berita Acara Serah Terima
   (`00-BERITA-ACARA-SERAH-TERIMA.md`).
4. Kredensial diserahkan dalam forum serah terima melalui kanal aman, tidak melalui
   surat elektronik biasa dan tidak dicantumkan pada dokumen.

## 12. Penutup

Kerangka acuan kerja ini menjadi dasar pelaksanaan kegiatan pengembangan Aplikasi
SAPA Smart AI. Hal-hal yang belum tercantum dan bertanda `[DIISI: …]` dilengkapi
oleh pengelola administrasi kegiatan sebelum dokumen ditandatangani.

| Disusun oleh | Diperiksa oleh | Disetujui oleh |
|---|---|---|
| `…………………` | `…………………` | `…………………` |
| `[DIISI: jabatan]` | `[DIISI: jabatan]` | `[DIISI: jabatan]` |
| NIP. `…………………` | NIP. `…………………` | NIP. `…………………` |
