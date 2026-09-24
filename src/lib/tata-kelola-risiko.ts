// ─── CMP-03 · Tata kelola risiko AI: daftar risiko + PEMILIK + TINDAK LANJUT ───
//
// Rujukan: ISO/IEC 42001 (sistem manajemen AI) dan NIST AI RMF (Govern · Map ·
// Measure · Manage).
//
// Dokumen 10 §13 sudah memuat daftar risiko, tetapi **tanpa pemilik** — dan risiko
// tanpa pemilik tidak pernah ditindaklanjuti. Modul ini menutup celah itu, dan
// yang lebih penting: daftarnya dapat DIPERIKSA MESIN.
//
// Aturan yang ditegakkan `scripts/uji-tata-kelola.mjs` (dan uji unit):
//   1. setiap risiko punya ≥ 1 PEMILIK berupa PERAN (bukan nama orang — hindari
//      daftar risiko yang basi karena pegawai mutasi) + tanggung jawab yang jelas;
//   2. setiap risiko punya ≥ 1 KENDALI (bukan sekadar "berhati-hati");
//   3. setiap kendali punya ≥ 1 BUKTI yang menunjuk berkas NYATA di repositori
//      (uji/harness/laporan/dokumen) — bukti yang tidak ada = kendali tanpa bukti;
//   4. setiap risiko punya TINDAK LANJUT bertanggal (selesai/jalan/rencana);
//   5. keempat fungsi NIST AI RMF terwakili, dan tenggat peninjauan belum lewat.
//
// Modul ini murni (tanpa I/O); pemeriksaan keberadaan berkas dilakukan pemanggil
// (harness & uji) supaya modul tetap dapat diuji tanpa sistem berkas.

/** Versi register. Naikkan bila ada risiko/pemilik/kendali yang berubah. */
export const VERSI_REGISTER = '1.0.0';
export const DITINJAU_PADA = '2026-09-24';
/** Register ditinjau tiap 6 bulan; lewat tenggat ⇒ harness menolak. */
export const TINJAUAN_BERIKUTNYA = '2027-03-24';

export type FungsiNist = 'govern' | 'map' | 'measure' | 'manage';
export type Tingkat = 'rendah' | 'sedang' | 'tinggi';
export type StatusTindak = 'selesai' | 'jalan' | 'rencana';

export interface BuktiKendali {
  jenis: 'uji' | 'harness' | 'artefak-verifikasi' | 'laporan' | 'endpoint' | 'modul';
  /** Rujukan berkas relatif dari akar repo, atau rute/endpoint untuk jenis `endpoint`. */
  rujukan: string;
  keterangan: string;
}

export interface TindakLanjut {
  tanggal: string;
  catatan: string;
  status: StatusTindak;
}

export interface Risiko {
  id: string;
  judul: string;
  kategori: string;
  nist: FungsiNist[];
  kemungkinan: Tingkat;
  dampak: Tingkat;
  kendali: string[];
  bukti: BuktiKendali[];
  /** Peran pemilik — sengaja bukan nama orang. */
  pemilik: { peran: string; tanggungJawab: string };
  tindakLanjut: TindakLanjut[];
  /** Tenggat peninjauan risiko ini (maksimal 6 bulan sejak DITINJAU_PADA). */
  tinjauanBerikutnya: string;
}

/** Tingkat risiko = gabungan kemungkinan × dampak (matriks 3×3 sederhana). */
export function tingkatRisiko(k: Tingkat, d: Tingkat): Tingkat {
  const bobot = { rendah: 1, sedang: 2, tinggi: 3 } as const;
  const skor = bobot[k] * bobot[d];
  if (skor >= 6) return 'tinggi';
  if (skor >= 3) return 'sedang';
  return 'rendah';
}

/** Daftar risiko SAPA-AI. Setiap pemilik adalah PERAN, bukan nama. */
export const REGISTER_RISIKO: Risiko[] = [
  {
    id: 'R-01',
    judul: 'Angka keliru dikutip pengguna karena model bahasa mengarang nilai',
    kategori: 'Mutu jawaban',
    nist: ['measure', 'manage'],
    kemungkinan: 'sedang',
    dampak: 'tinggi',
    kendali: [
      'Gerbang bukti menolak angka yang tidak ada pada baris bukti (grounding)',
      'Pemeriksa pasangan entitas menolak angka benar yang ditempel satuan/OPD/tahun dari baris lain',
      'Bila narasi model ditolak, jawaban disajikan otomatis dari data — bukan ditampilkan apa adanya',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/services/__tests__/grounding.test.ts', keterangan: 'gerbang bukti & kasus halu' },
      { jenis: 'uji', rujukan: 'src/services/__tests__/pemeriksa-entitas.test.ts', keterangan: 'grounding menipu (angka benar, entitas tertukar)' },
      { jenis: 'harness', rujukan: 'scripts/uji-pasangan.mjs', keterangan: 'uji ujung-ke-ujung penolakan pasangan entitas' },
      { jenis: 'artefak-verifikasi', rujukan: 'verifikasi/uji-pasangan-tukar.txt', keterangan: 'bukti penolakan pada narasi tertukar' },
    ],
    pemilik: { peran: 'Pengelola Mutu Jawaban (tim data)', tanggungJawab: 'memutuskan apakah jawaban layak tampil; meninjau setiap penolakan gerbang yang mencurigakan' },
    tindakLanjut: [
      { tanggal: '2026-09-19', catatan: 'Gerbang nilai-tambah & grounding diperketat; narasi miskin tidak lagi menang', status: 'selesai' },
      { tanggal: '2026-09-23', catatan: 'FR-24 pemeriksa pasangan entitas dipasang (menangkap grounding menipu)', status: 'selesai' },
      { tanggal: '2026-12-31', catatan: 'Ulangi EV-06 saat langganan AI kembali aktif untuk menilai mutu model sungguhan', status: 'rencana' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-02',
    judul: 'Data pribadi (NIK, nama, alamat) masuk log atau terkirim ke penyedia model',
    kategori: 'Privasi & data pribadi',
    nist: ['govern', 'manage'],
    kemungkinan: 'rendah',
    dampak: 'tinggi',
    kendali: [
      'Pagar masuk menolak permintaan data perorangan sebelum ada panggilan model',
      'Laporan warga dibersihkan dari angka/NIK sebelum disimpan',
      'Pemindai PII dijalankan pada setiap komit (pagar pra-komit)',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/__tests__/guard.test.ts', keterangan: 'pagar permintaan sistem/data perorangan' },
      { jenis: 'uji', rujukan: 'src/lib/__tests__/umpan-balik.test.ts', keterangan: 'pembersihan laporan warga' },
      { jenis: 'harness', rujukan: 'scripts/uji-keterbukaan.mjs', keterangan: 'pertanyaan ber-NIK ditolak & tidak memanggil model (CMP-02)' },
      { jenis: 'modul', rujukan: 'scripts/pii-gate.sh', keterangan: 'pemindai PII pada setiap komit' },
    ],
    pemilik: { peran: 'Petugas Perlindungan Data (DPO internal)', tanggungJawab: 'menjaga kepatuhan UU 27/2022; meninjau setiap laporan dugaan kebocoran data pribadi' },
    tindakLanjut: [
      { tanggal: '2026-09-21', catatan: 'CMP-01 terpasang: tidak menyajikan data perorangan, NIK tidak masuk log', status: 'selesai' },
      { tanggal: '2026-09-24', catatan: 'Klaim privasi diuji mesin pada CMP-02 (pertanyaan ber-NIK ⇒ tanpa panggilan model)', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-03',
    judul: 'Jawaban AI tidak dapat ditelusuri saat diperiksa (tanpa jejak pertanyaan, bukti, gerbang, sebab)',
    kategori: 'Akuntabilitas',
    nist: ['govern', 'measure'],
    kemungkinan: 'sedang',
    dampak: 'sedang',
    kendali: [
      'Metadata AI (dipakai/ditolak, model, grounded) dikirim pada setiap jawaban',
      'Sebab jawaban (FR-20) menyatakan lapis & status tiap jawaban',
      'Asal-usul data (FR-25) menyertakan tahun, waktu penarikan, dan sidik versi korpus',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/services/__tests__/sebab-kegagalan.test.ts', keterangan: 'taksonomi sebab jawaban' },
      { jenis: 'harness', rujukan: 'scripts/uji-sebab.mjs', keterangan: 'uji ujung-ke-ujung sebab jawaban' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/12-LAPORAN-FR-25-FR-27.md', keterangan: 'asal-usul data & pertanyaan tak terlayani' },
    ],
    pemilik: { peran: 'Operator Layanan (admin)', tanggungJawab: 'menjawab pertanyaan pemeriksaan internal atas jawaban yang pernah disajikan' },
    tindakLanjut: [
      { tanggal: '2026-09-22', catatan: 'FR-20 & FR-25 terpasang (sebab + asal-usul pada setiap jawaban)', status: 'selesai' },
      { tanggal: '2026-09-24', catatan: 'CMP-04 dijadwalkan: jejak audit + retensi + ekspor', status: 'jalan' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-04',
    judul: 'Biaya token membengkak (prompt memuat acuan draf) atau kuota harian habis di tengah hari',
    kategori: 'Biaya & ketersediaan',
    nist: ['manage', 'measure'],
    kemungkinan: 'sedang',
    dampak: 'sedang',
    kendali: [
      'Batas harian panggilan model (`AI_DAILY_CALL_LIMIT`) — jawaban tetap keluar tanpa AI bila tercapai',
      'Cache jawaban ber-sidik ISI korpus (DS-03) mengurangi panggilan berulang tanpa menyajikan data basi',
      'Saklar admin dapat mematikan AI tanpa mengubah kode',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/ai/__tests__/tokens.test.ts', keterangan: 'pemotongan & penghitungan token' },
      { jenis: 'uji', rujukan: 'src/app/api/query/route.test.ts', keterangan: 'perilaku saat batas tercapai' },
      { jenis: 'harness', rujukan: 'scripts/uji-cache-korpus.mjs', keterangan: 'kesegaran cache korpus (DS-03)' },
      { jenis: 'endpoint', rujukan: '/api/status', keterangan: 'pemakaian harian & belanja panggilan terlihat operator' },
    ],
    pemilik: { peran: 'Operator Layanan (admin)', tanggungJawab: 'memantau pemakaian harian di /api/status dan menyesuaikan batas bila perlu' },
    tindakLanjut: [
      { tanggal: '2026-09-19', catatan: 'Penghitung harian dikoreksi: /api/status tidak lagi menggerogoti kuota', status: 'selesai' },
      { tanggal: '2026-09-24', catatan: 'DS-03 kunci cache memakai sidik isi korpus (bukan jumlah record)', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-05',
    judul: 'Penyedia model tidak dapat dihubungi (langganan habis, throttle, jaringan)',
    kategori: 'Ketersediaan layanan',
    nist: ['manage'],
    kemungkinan: 'tinggi',
    dampak: 'sedang',
    kendali: [
      'Jawaban deterministik selalu tersedia tanpa model (AI tidak menjadi jalur tunggal)',
      'Pemutus sirkuit: gagal cepat, pulih otomatis satu percobaan setelah cooldown',
      'Peringatan otomatis ke operator bila sirkuit terbuka > 15 menit',
      'Keterbukaan (CMP-02) menyatakan kegagalan penyedia kepada pengguna',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/ai/__tests__/provider-health.test.ts', keterangan: 'klasifikasi galat & pemutus sirkuit' },
      { jenis: 'harness', rujukan: 'scripts/uji-peringatan.mjs', keterangan: 'peringatan sirkuit terbuka' },
      { jenis: 'harness', rujukan: 'scripts/uji-keterbukaan.mjs', keterangan: 'keterbukaan menyatakan kegagalan penyedia' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/19-LAPORAN-OPS-04.md', keterangan: 'log & peringatan operator' },
    ],
    pemilik: { peran: 'Operator Layanan (admin)', tanggungJawab: 'menindaklanjuti peringatan sirkuit terbuka dan memulihkan layanan AI bila perlu' },
    tindakLanjut: [
      { tanggal: '2026-09-19', catatan: 'Status AI tidak lagi mengaku aktif saat semua panggilan gagal', status: 'selesai' },
      { tanggal: '2026-09-23', catatan: 'OPS-04 peringatan segera + eskalasi 15 menit', status: 'selesai' },
      { tanggal: '2026-09-24', catatan: 'CMP-02: pengguna juga diberi tahu saat penyedia gagal', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-06',
    judul: 'Istilah daerah yang dipetakan menimpa kata katalog sehingga pencarian justru salah',
    kategori: 'Mutu pencarian',
    nist: ['map', 'measure'],
    kemungkinan: 'sedang',
    dampak: 'sedang',
    kendali: [
      'Aturan: hanya kata ber-df 0 di katalog yang boleh dipetakan; istilah yang sudah ada di katalog dicatat terpisah',
      'Setiap entri menyimpan df terukur dan klaim "terbukti di korpus uji" yang diverifikasi ke korpus nyata',
      'Alat tinjauan 3 bulan mengukur ulang df seluruh kamus terhadap korpus terbaru',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/__tests__/kamus-daerah.test.ts', keterangan: 'larangan menimpa kata katalog & klaim df jujur' },
      { jenis: 'harness', rujukan: 'scripts/uji-kamus-daerah.mjs', keterangan: 'kontrol negatif: kamus dimatikan ⇒ hasil berubah' },
      { jenis: 'harness', rujukan: 'scripts/ukur-df-kamus.mjs', keterangan: 'alat tinjauan df kamus' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/26-LAPORAN-DS-05.md', keterangan: 'temuan kurasi kamus daerah' },
    ],
    pemilik: { peran: 'Pengelola Kosakata & Katalog (tim data)', tanggungJawab: 'meninjau kamus tiap 3 bulan dan mengecek istilah baru pada katalog SPLP' },
    tindakLanjut: [
      { tanggal: '2026-09-24', catatan: 'DS-05 terpasang: 57 entri, 18 istilah katalog sengaja tidak dipetakan, tinjauan 3 bulan mekanis', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2026-12-24',
  },
  {
    id: 'R-07',
    judul: 'Teks keterbukaan menyimpang dari perilaku layanan (mengklaim AI aktif padahal tidak)',
    kategori: 'Kepercayaan publik',
    nist: ['govern', 'measure'],
    kemungkinan: 'sedang',
    dampak: 'tinggi',
    kendali: [
      'Satu modul teks untuk halaman, endpoint, dan notis per jawaban (tidak ada dua versi)',
      'Kalimat keadaan dihitung dari status runtime nyata, termasuk tingkat kegagalan penyedia',
      'Harness menjalankan aplikasi pada tiga keadaan (AI mati, hidup, penyedia gagal) dan menuntut teks berubah',
      'Daftar klaim mutlak yang dilarang diperiksa mesin',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/__tests__/keterbukaan-ai.test.tsx', keterangan: 'kejujuran keadaan & uji sabotase klaim' },
      { jenis: 'harness', rujukan: 'scripts/uji-keterbukaan.mjs', keterangan: 'tiga keadaan + mode sabotase' },
      { jenis: 'artefak-verifikasi', rujukan: 'verifikasi/uji-keterbukaan.txt', keterangan: '24 pemeriksaan lulus' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/27-LAPORAN-CMP-02.md', keterangan: 'laporan keterbukaan' },
    ],
    pemilik: { peran: 'Pengelola Keterbukaan & Komunikasi Publik', tanggungJawab: 'meninjau teks keterbukaan tiap 6 bulan dan setiap kali kemampuan layanan berubah' },
    tindakLanjut: [
      { tanggal: '2026-09-24', catatan: 'CMP-02 terpasang; teks ditinjau ulang paling lambat 24 Mar 2027', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-08',
    judul: 'Data tingkat desa tidak tersedia dari OPD sehingga banyak pertanyaan tetap dijawab kosong',
    kategori: 'Ketersediaan data',
    nist: ['map', 'govern'],
    kemungkinan: 'tinggi',
    dampak: 'sedang',
    kendali: [
      'Jawaban kosong dijawab jujur ("tidak ditemukan") — bukan diisi model',
      'Daftar pertanyaan tak terlayani ditinjau mingguan agar celah data terlihat',
      'Halaman keterbukaan menyatakan keterbatasan ini kepada pengguna',
    ],
    bukti: [
      { jenis: 'uji', rujukan: 'src/lib/__tests__/insight-celah.test.ts', keterangan: 'agregasi celah pengetahuan' },
      { jenis: 'endpoint', rujukan: '/api/admin/celah', keterangan: 'daftar celah pengetahuan untuk operator' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/12-LAPORAN-FR-25-FR-27.md', keterangan: 'pertanyaan yang belum terlayani' },
    ],
    pemilik: { peran: 'Koordinator Data OPD (Sekretariat)', tanggungJawab: 'menindaklanjuti daftar celah data ke OPD pemilik indikator' },
    tindakLanjut: [
      { tanggal: '2026-09-22', catatan: 'FR-27 terpasang: pertanyaan tak terlayani tercatat & ditinjau', status: 'selesai' },
      { tanggal: '2026-12-31', catatan: 'Ajukan permintaan data desa ke OPD terkait', status: 'rencana' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
  {
    id: 'R-09',
    judul: 'Perubahan kode dari agen/penyunting lain bertabrakan sehingga perbaikan hilang',
    kategori: 'Proses pengembangan',
    nist: ['govern', 'manage'],
    kemungkinan: 'sedang',
    dampak: 'sedang',
    kendali: [
      'Perubahan dikirim sebagai seri patch bernomor pada berkas terpisah (bukan penulisan ulang berkas besar)',
      'Uji terima otomatis sebelum promosi + pemindai PII pada setiap komit',
      'Klon bersih diuji ulang: patch diterapkan ke basis yang sebenarnya, hasilnya harus identik',
    ],
    bukti: [
      { jenis: 'modul', rujukan: 'docs/usulan-ai-tingkat-lanjut/uji-terima.sh', keterangan: 'uji terima otomatis sebelum rilis' },
      { jenis: 'modul', rujukan: 'scripts/pii-gate.sh', keterangan: 'pagar pra-komit' },
      { jenis: 'laporan', rujukan: 'docs/usulan-ai-tingkat-lanjut/11-KIT-SERAH-TERIMA.md', keterangan: 'urutan patch & cara serah terima' },
    ],
    pemilik: { peran: 'Penanggung Jawab Teknis (pengelola repositori)', tanggungJawab: 'memutuskan urutan penerapan patch dan menyelesaikan konflik' },
    tindakLanjut: [
      { tanggal: '2026-09-24', catatan: 'Setiap butir dikirim sebagai patch tersendiri; klon bersih diuji ulang tiap butir', status: 'selesai' },
      { tanggal: '2026-09-24', catatan: 'Tetapkan penomoran patch lanjutan di atas `origin/dev`', status: 'selesai' },
    ],
    tinjauanBerikutnya: '2027-03-24',
  },
];

/** Ringkasan register untuk halaman & endpoint. */
export function ringkasRegister(): {
  versi: string;
  ditinjauPada: string;
  tinjauanBerikutnya: string;
  jumlah: number;
  perTingkat: Record<Tingkat, number>;
  perFungsiNist: Record<FungsiNist, number>;
} {
  const perTingkat: Record<Tingkat, number> = { rendah: 0, sedang: 0, tinggi: 0 };
  const perFungsiNist: Record<FungsiNist, number> = { govern: 0, map: 0, measure: 0, manage: 0 };
  for (const r of REGISTER_RISIKO) {
    perTingkat[tingkatRisiko(r.kemungkinan, r.dampak)] += 1;
    for (const f of new Set(r.nist)) perFungsiNist[f] += 1;
  }
  return {
    versi: VERSI_REGISTER,
    ditinjauPada: DITINJAU_PADA,
    tinjauanBerikutnya: TINJAUAN_BERIKUTNYA,
    jumlah: REGISTER_RISIKO.length,
    perTingkat,
    perFungsiNist,
  };
}

/** Risiko yang belum punya pemilik (peran kosong / penanda belum diisi). */
export function risikoTanpaPemilik(daftar: Risiko[] = REGISTER_RISIKO): Risiko[] {
  const kosong = (s: string) => !s || s.trim().length < 3 || /tbd|belum|n\/a/i.test(s);
  return daftar.filter((r) => kosong(r.pemilik?.peran ?? '') || kosong(r.pemilik?.tanggungJawab ?? ''));
}

/**
 * Kata kunci yang menandai PEMILIK berupa PERAN, bukan nama orang. Register risiko
 * yang memakai nama orang akan basi setiap kali pegawai mutasi — dan risiko yang
 * pemiliknya sudah pindah tugas tidak akan pernah ditindaklanjuti.
 */
export const KATA_PERAN = [
  'pengelola',
  'operator',
  'petugas',
  'koordinator',
  'penanggung jawab',
  'kepala',
  'sekretariat',
  'tim',
];

/** Pemilik yang TIDAK tampak seperti peran (mungkin nama orang / penanda kosong). */
export function pemilikTanpaPeran(daftar: Risiko[] = REGISTER_RISIKO): Risiko[] {
  return daftar.filter((r) => {
    const peran = (r.pemilik?.peran ?? '').toLowerCase();
    return !KATA_PERAN.some((k) => peran.includes(k));
  });
}

/** Risiko yang belum punya kendali nyata. */
export function risikoTanpaKendali(daftar: Risiko[] = REGISTER_RISIKO): Risiko[] {
  return daftar.filter((r) => r.kendali.filter((k) => k.trim().length >= 10).length === 0);
}

/** Risiko yang buktinya kosong atau tidak menyebut rujukan apa pun. */
export function risikoTanpaBukti(daftar: Risiko[] = REGISTER_RISIKO): Risiko[] {
  return daftar.filter((r) => r.bukti.filter((b) => (b.rujukan ?? '').trim().length >= 3).length === 0);
}

/** Risiko tanpa tindak lanjut bertanggal. */
export function risikoTanpaTindakLanjut(daftar: Risiko[] = REGISTER_RISIKO): Risiko[] {
  return daftar.filter((r) => r.tindakLanjut.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.tanggal)).length === 0);
}

/** Risiko yang tenggat peninjauannya sudah lewat pada tanggal tertentu. */
export function risikoLewatTenggat(daftar: Risiko[] = REGISTER_RISIKO, hariIni: Date = new Date()): Risiko[] {
  return daftar.filter((r) => new Date(`${r.tinjauanBerikutnya}T23:59:59Z`).getTime() < hariIni.getTime());
}

/** Jenis bukti yang dikenal. Bukti berjenis lain tidak dapat diperiksa mesin. */
export const JENIS_BUKTI = ['uji', 'harness', 'artefak-verifikasi', 'laporan', 'endpoint', 'modul'] as const;

export function jenisBuktiValid(jenis: string): boolean {
  return (JENIS_BUKTI as readonly string[]).includes(jenis);
}

/** Semua rujukan bukti yang berupa berkas (bukan endpoint). */
export function rujukanBerkas(daftar: Risiko[] = REGISTER_RISIKO): string[] {
  return daftar.flatMap((r) => r.bukti.filter((b) => b.jenis !== 'endpoint').map((b) => b.rujukan));
}
