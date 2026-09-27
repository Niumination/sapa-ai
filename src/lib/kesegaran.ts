// ─── P3: alarm kesegaran data (DS-03 lanjutan) ───────────────────────────────
//
// MASALAH YANG DIPERBAIKI
//
//   Sejak FR-25/DS-03, setiap jawaban SUDAH menampilkan "Data SPLP ditarik: …"
//   dan tahun data pada bukti. Tetapi semuanya hanya TAMPILAN: tidak ada satu
//   pun tempat dalam sistem yang menjawab pertanyaan operator "apakah angka yang
//   sedang disajikan sudah terlalu tua?" — dan karenanya tidak ada yang
//   berbunyi. Kesegaran yang hanya bisa dibaca oleh orang yang sudah curiga
//   bukan pengawasan; itu hiasan.
//
// DUA SEBAB KEBASIAN YANG BERBEDA (keduanya diperiksa di sini)
//
//   1. TARIKAN LAMA (`diambilPada`). Instance yang hidup lama (atau penjadwal
//      OPS-03 yang berhenti) menyajikan korpus yang ditarik berjam-jam/hari
//      lalu. Umur ini baru terlihat bila ada yang membandingkannya dengan jam
//      sekarang.
//   2. TAHUN KATALOG TERTINGGAL. Korpus bisa saja baru ditarik (sebab 1 aman)
//      padahal ISINYA sudah tua: tahun data terbaru di katalog tertinggal dari
//      tahun berjalan. Pada layanan statistik daerah ini justru kasus yang
//      paling sering terjadi dan paling menyesatkan — "ditarik tadi pagi"
//      terdengar segar, padahal datanya dua tahun lalu.
//
//   Ditambah satu sinyal pembantu dari OPS-03: bila jadwal penyegaran harian
//   sudah TERLEWAT (bukan sekadar "sudah basi"), itu bukti penjadwal berhenti.
//
// ATURAN KEJUJURAN (kenapa ada tingkat `tak-diketahui`)
//   Bila tidak ada bahan apa pun (korpus belum pernah ditarik pada proses ini
//   DAN tahun data tidak terbaca), yang benar bukan "segar" — melainkan
//   "tidak diketahui". Mengembalikan `segar` tanpa bukti adalah kebohongan yang
//   paling mudah lolos, karena tidak ada yang membantah. Karena itu nilainya
//   eksplisit dan pesannya menyebutkan apa yang kurang.
//
// AMBANG (dapat diatur lewat lingkungan, bawaan sesuai dokumen 10)
//   SAPA_KESEGARAN_PERHATIAN_JAM  bawaan 36  (penyegaran harian + toleransi)
//   SAPA_KESEGARAN_BASI_JAM       bawaan 168 (7 hari)
//   SAPA_KESEGARAN_LAG_PERHATIAN  bawaan 2   (tahun)
//   SAPA_KESEGARAN_LAG_BASI       bawaan 3   (tahun)

export type TingkatKesegaran = 'segar' | 'perhatian' | 'basi' | 'tak-diketahui';

/** Kode sebab — dipakai agar pesan bisa dibaca mesin & diuji satu per satu. */
export type SebabKesegaran =
  | 'tarikan-lama'
  | 'tahun-katalog-tertinggal'
  | 'jadwal-segarkan-terlewat'
  | 'stempel-masa-depan'
  | 'bahan-kurang';

export interface AmbangKesegaran {
  perhatianJam: number;
  basiJam: number;
  lagPerhatianTahun: number;
  lagBasiTahun: number;
}

export const AMBANG_BAWAAN: AmbangKesegaran = {
  perhatianJam: 36,
  basiJam: 168,
  lagPerhatianTahun: 2,
  lagBasiTahun: 3,
};

export interface BahanKesegaran {
  /** Waktu korpus ditarik dari SPLP (ISO). Dari `meta.diambilPada`. */
  diambilPada?: string | null;
  /** Tahun pada baris bukti / katalog. Rentang seperti "2022–2026" ikut dibaca. */
  tahunData?: Array<string | null | undefined>;
  /**
   * Dari OPS-03: jadwal penyegaran harian TERLEWAT > 1 jam.
   *
   * PENTING bagi pemanggil: hanya isi `true` bila penjadwal memang pernah
   * berjalan pada instance ini. Instance yang belum pernah disegarkan bukan
   * "terlewat" — dan alarm yang berbunyi pada setiap instance baru akan
   * diabaikan orang, yang membuat alarmnya sendiri tidak berguna.
   */
  penyegaranTerlewat?: boolean;
}

export interface NilaiKesegaran {
  tingkat: TingkatKesegaran;
  /** Umur tarikan dalam jam (satu desimal). `null` bila stempel tidak terbaca. */
  umurJam: number | null;
  /** Umur tarikan dalam hari (satu desimal), untuk kalimat manusia. */
  umurHari: number | null;
  /** Tahun data terbesar yang terbaca dari katalog. `null` bila tak ada. */
  tahunTerbaru: number | null;
  /** Jarak tahun berjalan ke tahun terbaru (`tahunSekarang - tahunTerbaru`). */
  lagTahun: number | null;
  penyegaranTerlewat: boolean;
  sebab: SebabKesegaran[];
  /** Kalimat siap tampil; KOSONG bila tingkat `segar`. */
  pesan: string;
}

function angkaPositif(nilai: string | undefined, bawaan: number): number {
  const n = Number(nilai);
  return Number.isFinite(n) && n > 0 ? n : bawaan;
}

/** Ambang dari lingkungan; nilai tak sah diabaikan (bukan menjadi NaN). */
export function ambangKesegaran(env: Record<string, string | undefined> = process.env): AmbangKesegaran {
  return {
    perhatianJam: angkaPositif(env['SAPA_KESEGARAN_PERHATIAN_JAM'], AMBANG_BAWAAN.perhatianJam),
    basiJam: angkaPositif(env['SAPA_KESEGARAN_BASI_JAM'], AMBANG_BAWAAN.basiJam),
    lagPerhatianTahun: angkaPositif(env['SAPA_KESEGARAN_LAG_PERHATIAN'], AMBANG_BAWAAN.lagPerhatianTahun),
    lagBasiTahun: angkaPositif(env['SAPA_KESEGARAN_LAG_BASI'], AMBANG_BAWAAN.lagBasiTahun),
  };
}

/**
 * Tahun terbesar dari kumpulan string tahun katalog.
 *
 * Menerima "2026", "2022–2026" (en-dash), "2022-2026" (hyphen), dan nilai
 * kosong/null. Rentang diambil ujung TERBESAR karena pertanyaannya "seberapa
 * baru isi katalog ini", bukan "sejak kapan".
 */
export function tahunTerbesar(tahunData: Array<string | null | undefined> | undefined): number | null {
  if (!tahunData || tahunData.length === 0) return null;
  let maks: number | null = null;
  for (const teks of tahunData) {
    if (teks === null || teks === undefined) continue;
    const cocok = String(teks).match(/\d{4}/g);
    if (!cocok) continue;
    for (const c of cocok) {
      const n = Number(c);
      if (!Number.isFinite(n)) continue;
      if (n < 1900 || n > 2200) continue; // tahun tak masuk akal = tidak dipercaya
      if (maks === null || n > maks) maks = n;
    }
  }
  return maks;
}

function bulat1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface OpsiKesegaran {
  /** Untuk uji: jam yang dianggap "sekarang". */
  sekarangMs?: number;
  ambang?: AmbangKesegaran;
  /** Untuk uji: tahun berjalan. Bawaan: tahun UTC dari `sekarangMs`. */
  tahunSekarang?: number;
}

const PERINGKAT: Record<TingkatKesegaran, number> = {
  'tak-diketahui': 1,
  segar: 0,
  perhatian: 2,
  basi: 3,
};

function naikkan(sekarang: TingkatKesegaran, usul: TingkatKesegaran): TingkatKesegaran {
  return PERINGKAT[usul] > PERINGKAT[sekarang] ? usul : sekarang;
}

/**
 * Hitung tingkat kesegaran dari bahan yang tersedia. Fungsi murni — tidak
 * membaca jam maupun lingkungan kecuali lewat argumen, sehingga bisa diuji
 * pada batas-batasnya tanpa menunggu waktu berjalan.
 */
export function nilaiKesegaran(bahan: BahanKesegaran, opsi: OpsiKesegaran = {}): NilaiKesegaran {
  const sekarangMs = opsi.sekarangMs ?? Date.now();
  const ambang = opsi.ambang ?? ambangKesegaran();
  const tahunSekarang = opsi.tahunSekarang ?? new Date(sekarangMs).getUTCFullYear();

  const sebab: SebabKesegaran[] = [];
  let tingkat: TingkatKesegaran = 'segar';

  const ms = bahan.diambilPada ? Date.parse(bahan.diambilPada) : Number.NaN;
  const adaStempel = Number.isFinite(ms);
  const umurJam = adaStempel ? bulat1((sekarangMs - ms) / 3_600_000) : null;

  const tahunTerbaru = tahunTerbesar(bahan.tahunData);
  const lagTahun = tahunTerbaru === null ? null : tahunSekarang - tahunTerbaru;
  const penyegaranTerlewat = bahan.penyegaranTerlewat === true;

  const adaBahan = adaStempel || tahunTerbaru !== null || penyegaranTerlewat;
  if (!adaBahan) {
    sebab.push('bahan-kurang');
    tingkat = naikkan(tingkat, 'tak-diketahui');
  }

  // Sebab 1 — tarikan lama (atau stempel waktu di masa depan: jam server salah).
  if (adaStempel && umurJam !== null) {
    if (umurJam < -0.5) {
      sebab.push('stempel-masa-depan');
      tingkat = naikkan(tingkat, 'perhatian');
    } else if (umurJam >= ambang.basiJam) {
      sebab.push('tarikan-lama');
      tingkat = naikkan(tingkat, 'basi');
    } else if (umurJam >= ambang.perhatianJam) {
      sebab.push('tarikan-lama');
      tingkat = naikkan(tingkat, 'perhatian');
    }
  }

  // Sebab 2 — isi katalog tertinggal dari tahun berjalan.
  if (lagTahun !== null) {
    if (lagTahun >= ambang.lagBasiTahun) {
      sebab.push('tahun-katalog-tertinggal');
      tingkat = naikkan(tingkat, 'basi');
    } else if (lagTahun >= ambang.lagPerhatianTahun) {
      sebab.push('tahun-katalog-tertinggal');
      tingkat = naikkan(tingkat, 'perhatian');
    }
  }

  // Sinyal pembantu — penjadwal penyegaran berhenti.
  if (penyegaranTerlewat) {
    sebab.push('jadwal-segarkan-terlewat');
    tingkat = naikkan(tingkat, 'perhatian');
  }

  if (tingkat === 'segar') sebab.length = 0;

  return {
    tingkat,
    umurJam,
    umurHari: umurJam === null ? null : bulat1(umurJam / 24),
    tahunTerbaru,
    lagTahun,
    penyegaranTerlewat,
    sebab,
    pesan: kalimatKesegaran({
      tingkat,
      sebab,
      umurJam,
      umurHari: umurJam === null ? null : bulat1(umurJam / 24),
      tahunTerbaru,
      lagTahun,
      tahunSekarang,
      ambang,
      penyegaranTerlewat,
    }),
  };
}

function kalimatKesegaran(b: {
  tingkat: TingkatKesegaran;
  sebab: SebabKesegaran[];
  umurJam: number | null;
  umurHari: number | null;
  tahunTerbaru: number | null;
  lagTahun: number | null;
  tahunSekarang: number;
  ambang: AmbangKesegaran;
  penyegaranTerlewat: boolean;
}): string {
  if (b.tingkat === 'segar') return '';
  const serpihan: string[] = [];
  for (const s of b.sebab) {
    if (s === 'tarikan-lama') {
      const hari = b.umurHari ?? 0;
      const satuan = hari >= 1 ? `${hari} hari` : `${b.umurJam} jam`;
      // Ambang dibandingkan dalam SATUAN JAM, baru diterjemahkan ke hari bila
      // memang lebih besar dari sehari. (Kesalahan pertama di berkas ini:
      // 168 jam dibagi 24 lebih dulu, lalu dibandingkan dengan 24 — hasilnya
      // "7 jam" untuk ambang tujuh hari. Ditemukan oleh ujinya sendiri.)
      const ambangJam =
        b.umurJam !== null && b.umurJam >= b.ambang.basiJam ? b.ambang.basiJam : b.ambang.perhatianJam;
      const ambangTeks = ambangJam >= 24 ? `${bulat1(ambangJam / 24)} hari` : `${ambangJam} jam`;
      serpihan.push(`korpus terakhir ditarik ${satuan} lalu (ambang ${ambangTeks})`);
    } else if (s === 'tahun-katalog-tertinggal') {
      serpihan.push(
        `tahun data terbaru di katalog ${b.tahunTerbaru}, tertinggal ${b.lagTahun} tahun dari ${b.tahunSekarang}`,
      );
    } else if (s === 'jadwal-segarkan-terlewat') {
      serpihan.push('jadwal penyegaran harian terlewat lebih dari satu jam');
    } else if (s === 'stempel-masa-depan') {
      serpihan.push('stempel waktu tarikan berada di masa depan — periksa jam server');
    } else if (s === 'bahan-kurang') {
      serpihan.push('bahan kesegaran belum tersedia (korpus belum ditarik pada proses ini dan tahun data belum terbaca)');
    }
  }
  if (serpihan.length === 0) {
    return 'Kesegaran data belum bisa dipastikan.';
  }
  const awalan =
    b.tingkat === 'basi' ? 'Data yang sedang disajikan sudah basi' : 'Data yang sedang disajikan perlu perhatian';
  return `${awalan}: ${serpihan.join('; ')}.`;
}

/** Label pendek untuk lencana UI. */
export function labelTingkat(t: TingkatKesegaran): string {
  if (t === 'segar') return 'Data segar';
  if (t === 'perhatian') return 'Data perlu perhatian';
  if (t === 'basi') return 'Data basi';
  return 'Kesegaran tidak diketahui';
}

/**
 * Bentuk ringkas untuk jawaban /api/query: cukup untuk lencana & kalimat, tanpa
 * membocorkan ambang internal ke tiap jawaban.
 */
export function ringkasKesegaran(n: NilaiKesegaran): {
  tingkat: TingkatKesegaran;
  label: string;
  sebab: SebabKesegaran[];
  umurJam: number | null;
  tahunTerbaru: number | null;
  pesan: string;
} {
  return {
    tingkat: n.tingkat,
    label: labelTingkat(n.tingkat),
    sebab: n.sebab,
    umurJam: n.umurJam,
    tahunTerbaru: n.tahunTerbaru,
    pesan: n.pesan,
  };
}
