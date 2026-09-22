// ─── FR-20: klasifikasi sebab jawaban & kegagalan ────────────────────────────
//
// MASALAH YANG DISELESAIKAN (dokumen 10, FR-20): ketika sebuah item evaluasi
// gagal, pemeriksa hanya tahu "gagal". Perbaikan jadi menebak-nebak: apakah
// datanya tidak ada, apakah kata kuncinya salah, apakah retrieval melewatkan,
// atau apakah modelnya yang ditolak gerbang? Tag sebab per item membuat
// perbaikan tepat sasaran — dan mencegah "menambal" lapisan yang salah.
//
// RANCANGAN
//   1. Satu fungsi murni (`klasifikasiSebab`) memetakan fakta-fakta jawaban ke
//      SATU sebab utama + lapisnya. Tidak ada efek samping, tanpa jaringan,
//      tanpa penyimpanan → bisa diuji tabel-kasus dan dipakai ulang di mana saja.
//   2. Panjang tag ditulis `lapis:rincian` supaya bisa dikelompokkan tanpa kamus
//      tambahan (mis. semua `retrieval:*` = masalah pencarian, bukan masalah model).
//   3. `status` memisahkan "menjawab" dari "jujur-kosong". Penilaian lulus/gagal
//      tetap milik penguji (set evaluasi punya ekspektasi sendiri); modul ini
//      HANYA menjelaskan apa yang terjadi.
//   4. Sebab selalu ada — tidak pernah `null`. Kegagalan tanpa penjelasan adalah
//      kegagalan yang tidak akan pernah diperbaiki.
//
// Sumber fakta: `DeterministicResult.diagnosa` (jalur retrieval, jumlah bukti,
// kata kunci asing), `AiMeta` (grounded/nilaiTambah/limitedBy), dan pagar
// masukan (data pribadi / permintaan sistem).

/** Lapis tempat sebab berada — inilah pembeda "retrieval vs generasi". */
export type LapisSebab = 'masukan' | 'retrieval' | 'generasi' | 'penyajian' | 'selesai';

/** Sebab yang menandakan pertanyaan TIDAK terlayani sepenuhnya. */
export type SebabGagal =
  // ── masukan: pertanyaan ditolak SEBELUM retrieval (kebijakan, bukan data)
  | 'masukan:data-personal'
  | 'masukan:permintaan-sistem'
  // ── retrieval: katalog tidak/belum melayani pertanyaannya
  | 'retrieval:tanpa-bukti'
  | 'retrieval:konsep-asing'
  | 'retrieval:granularitas-per-desa'
  | 'retrieval:makna-lemah'
  // ── generasi: jawaban sudah ada, model gagal dipakai
  | 'generasi:grounding'
  | 'generasi:nilai-tambah'
  | 'generasi:penyedia'
  // ── penyajian: jawaban sengaja tidak disajikan (saklar pemilik aplikasi)
  | 'penyajian:dinonaktifkan';

/** Sebab jawaban yang TERS AJI (dipakai dasbor untuk membandingkan jalur). */
export type SebabSukses =
  | 'selesai:leksikal'
  | 'selesai:leksikal+sisipan'
  | 'selesai:semantik'
  | 'selesai:ai'
  | 'selesai:meta';

export type SebabJawaban = SebabGagal | SebabSukses;

/** Apakah jawaban membawa bukti/data, atau jujur mengaku tidak punya. */
export type StatusJawaban = 'menjawab' | 'jujur-kosong';

export interface Diagnosa {
  sebab: SebabJawaban;
  lapis: LapisSebab;
  status: StatusJawaban;
  /** Kalimat penjelas untuk operator — bebas angka, boleh dipakai di log/dasbor. */
  rincian: string;
  /** Jumlah baris bukti yang benar-benar disajikan. */
  jumlahBukti: number;
  /** Kata kunci pertanyaan yang tidak pernah muncul di katalog SAPA. */
  konsepAsing: string[];
  /**
   * Sebab SEKUNDER di lapis lain yang tidak mengubah hasil akhir. Contoh nyata:
   * bukti ada (jawaban deterministik tersaji) tetapi model ditolak gerbang
   * grounding — jawabannya tetap sah, tetapi operator perlu tahu bahwa lapis AI
   * tidak bekerja pada pertanyaan itu.
   */
  catatan?: SebabJawaban;
}

export interface FaktaJawaban {
  /** Jalur retrieval yang dipakai `retrieveDenganSemantik`. */
  jalur?: 'leksikal' | 'leksikal+sisipan' | 'semantik' | 'kosong' | 'meta' | 'sistem';
  jumlahBukti: number;
  /** Kata kunci yang tidak ada di katalog (df = 0). */
  konsepAsing?: string[];
  /** Skor semantik teratas pada jalur yang ditolak (FR-12) — untuk bedakan "makna lemah". */
  skorSemantik?: number;
  /** Pertanyaan meminta rincian per desa/kelurahan (katalog SAPA berhenti di kecamatan). */
  mintaPerDesa?: boolean;
  /** Pagar masukan yang menyala lebih dulu. */
  pagar?: 'nik' | 'per-orang' | 'sistem';
  /** Fakta lapis AI. */
  ai?: {
    used?: boolean;
    grounded?: 'pass' | 'replaced' | 'skipped';
    nilaiTambah?: 'dipakai' | 'dipakai-dengan-catatan' | 'ditolak-tidak-menambah' | 'ditolak-grounding';
    limitedBy?: string;
  };
}

/** Label manusia untuk dasbor — TANPA angka, dan tahan terhadap nilai lama. */
const LABEL: Record<SebabJawaban, string> = {
  'masukan:data-personal': 'ditolak — permintaan data per orang',
  'masukan:permintaan-sistem': 'ditolak — permintaan aturan internal',
  'retrieval:tanpa-bukti': 'tidak ada indikator yang cocok',
  'retrieval:konsep-asing': 'ada kata kunci yang tidak ada di katalog',
  'retrieval:granularitas-per-desa': 'data per desa tidak tersedia (katalog berhenti di kecamatan)',
  'retrieval:makna-lemah': 'kemiripan makna terlalu lemah untuk dijawab',
  'generasi:grounding': 'model ditolak gerbang grounding',
  'generasi:nilai-tambah': 'model ditolak gerbang nilai-tambah',
  'generasi:penyedia': 'penyedia model gagal',
  'penyajian:dinonaktifkan': 'jawaban dinonaktifkan oleh pengaturan',
  'selesai:leksikal': 'terjawab — kecocokan kata',
  'selesai:leksikal+sisipan': 'terjawab — kecocokan kata + sisipan makna',
  'selesai:semantik': 'terjawab — kemiripan makna',
  'selesai:ai': 'terjawab — narasi model',
  'selesai:meta': 'terjawab — keterangan katalog',
};

/** Sebab LAMA (FR-27) — tetap dikenali supaya data tersimpan lama tidak hilang makna. */
const LABEL_LAMA: Record<string, string> = {
  'tanpa-bukti': 'tidak ada indikator yang cocok',
  'ai-ditolak': 'model ditolak gerbang',
};

export function labelSebab(sebab: string | null | undefined): string {
  if (!sebab) return 'tanpa keterangan';
  return LABEL[sebab as SebabJawaban] ?? LABEL_LAMA[sebab] ?? sebab;
}

/** Daftar sebab yang layak muncul di dasbor celah pengetahuan (semua yang gagal). */
export const SEBAB_GAGAL: SebabGagal[] = [
  'masukan:data-personal',
  'masukan:permintaan-sistem',
  'retrieval:tanpa-bukti',
  'retrieval:konsep-asing',
  'retrieval:granularitas-per-desa',
  'retrieval:makna-lemah',
  'generasi:grounding',
  'generasi:nilai-tambah',
  'generasi:penyedia',
  'penyajian:dinonaktifkan',
];

export function lapisDari(sebab: SebabJawaban): LapisSebab {
  const lapis = sebab.split(':')[0];
  return (['masukan', 'retrieval', 'generasi', 'penyajian', 'selesai'] as LapisSebab[]).includes(
    lapis as LapisSebab,
  )
    ? (lapis as LapisSebab)
    : 'selesai';
}

function lanjutkan(sebab: SebabJawaban, rincian: string, fakta: FaktaJawaban, catatan?: SebabJawaban): Diagnosa {
  return {
    sebab,
    lapis: lapisDari(sebab),
    status: 'menjawab',
    rincian,
    jumlahBukti: fakta.jumlahBukti,
    konsepAsing: fakta.konsepAsing ?? [],
    ...(catatan ? { catatan } : {}),
  };
}

function kosong(sebab: SebabJawaban, rincian: string, fakta: FaktaJawaban): Diagnosa {
  return {
    sebab,
    lapis: lapisDari(sebab),
    status: 'jujur-kosong',
    rincian,
    jumlahBukti: 0,
    konsepAsing: fakta.konsepAsing ?? [],
  };
}

/**
 * Sebab sekunder di lapis generasi: model dipanggil tetapi jawabannya tidak
 * dipakai. Dipisah karena tidak selalu berarti gagal — jawaban deterministik
 * tetap tersaji; yang hilang hanya nilai tambahnya.
 */
function catatanGenerasi(ai: FaktaJawaban['ai']): SebabJawaban | undefined {
  if (!ai || ai.used) return undefined;
  if (ai.grounded === 'replaced' || ai.nilaiTambah === 'ditolak-grounding') return 'generasi:grounding';
  if (ai.nilaiTambah === 'ditolak-tidak-menambah') return 'generasi:nilai-tambah';
  if (ai.limitedBy && ['provider-error', 'circuit', 'timeout', 'no-key', 'error'].includes(ai.limitedBy)) {
    return 'generasi:penyedia';
  }
  return undefined;
}

/**
 * Klasifikasikan sebab utama sebuah jawaban.
 *
 * Urutan pemeriksaan mengikuti urutan kenyataan di pipeline: pagar masukan →
 * bukti → lapis generasi. Yang pertama menyala adalah sebab SEBENARNYA, karena
 * langkah berikutnya tidak pernah berjalan.
 */
export function klasifikasiSebab(fakta: FaktaJawaban): Diagnosa {
  const jumlah = Math.max(0, fakta.jumlahBukti ?? 0);
  const bersih: FaktaJawaban = { ...fakta, jumlahBukti: jumlah };

  // ── 1. Pagar masukan (menjawab dengan penolakan, bukan dengan data) ──────────
  if (fakta.pagar === 'nik' || fakta.pagar === 'per-orang') {
    return lanjutkan(
      'masukan:data-personal',
      'Pertanyaan meminta data per orang; dijawab dengan pengarahan ke jalur resmi, bukan dengan data.',
      bersih,
    );
  }
  if (fakta.pagar === 'sistem') {
    return lanjutkan(
      'masukan:permintaan-sistem',
      'Pertanyaan menyentuh aturan internal sistem; dijawab dengan kalimat tetap.',
      bersih,
    );
  }

  // ── 2. Jawaban tersaji ──────────────────────────────────────────────────────
  if (jumlah > 0) {
    const catatan = catatanGenerasi(fakta.ai);
    if (fakta.ai?.used) {
      return lanjutkan('selesai:ai', 'Jawaban disajikan dengan narasi model di atas bukti katalog.', bersih, catatan);
    }
    if (fakta.jalur === 'meta') {
      return lanjutkan('selesai:meta', 'Jawaban disajikan dari keterangan katalog (bukan pencarian indikator).', bersih, catatan);
    }
    if (fakta.jalur === 'semantik') {
      return lanjutkan('selesai:semantik', 'Jawaban disajikan dari kemiripan MAKNA; katalog tidak memuat kata kuncinya secara langsung.', bersih, catatan);
    }
    if (fakta.jalur === 'leksikal+sisipan') {
      return lanjutkan('selesai:leksikal+sisipan', 'Jawaban disajikan dari kecocokan kata, dengan sisipan kandidat dari kemiripan makna.', bersih, catatan);
    }
    return lanjutkan('selesai:leksikal', 'Jawaban disajikan dari kecocokan kata pada katalog.', bersih, catatan);
  }

  // ── 3. Tidak ada bukti: bedakan sebab retrievalnya ──────────────────────────
  const catatan = catatanGenerasi(fakta.ai);
  const generasiGagal: SebabJawaban | undefined =
    fakta.ai?.limitedBy === 'service-unavailable'
      ? 'penyajian:dinonaktifkan'
      : catatan === 'generasi:penyedia'
        ? 'generasi:penyedia'
        : undefined;

  if (generasiGagal) {
    // Bukti memang kosong DAN model tidak tersedia/dinonaktifkan: katakan apa adanya,
    // jangan menyalahkan retrieval untuk kegagalan penyedia.
    return fakta.ai?.limitedBy === 'service-unavailable'
      ? kosong('penyajian:dinonaktifkan', 'Tidak ada bukti, dan penyajian jawaban dinonaktifkan oleh pengaturan.', bersih)
      : kosong('generasi:penyedia', 'Tidak ada bukti, dan penyedia model gagal dihubungi.', bersih);
  }

  // Urutan sengaja: kata kunci ASING lebih dulu daripada granularitas.
  //
  // Temuan uji 22 Sep 2026: penjaga granularitas menyalakan kandidat tempat dari
  // kata GENERIK yang ikut terhitung (mis. "kecamatan"), sehingga kueri
  // "... per desa di Kecamatan Tanah Rencong" (nama yang tidak ada di katalog)
  // pun tercatat sebagai masalah granularitas. Padahal sebab yang paling
  // menolong operator adalah "ada kata kunci yang tidak ada di katalog" —
  // memperbaiki kata kuncinya jauh lebih murah daripada menambah data per desa.
  const asing = fakta.konsepAsing ?? [];
  if (asing.length > 0) {
    return kosong(
      'retrieval:konsep-asing',
      'Ada kata kunci pertanyaan yang tidak terdapat pada satu pun indikator di katalog SAPA.',
      bersih,
    );
  }

  if (fakta.mintaPerDesa) {
    return kosong(
      'retrieval:granularitas-per-desa',
      'Pertanyaan meminta rincian per desa/kelurahan, sedangkan katalog SAPA berhenti di tingkat kecamatan.',
      bersih,
    );
  }

  if (typeof fakta.skorSemantik === 'number' && fakta.skorSemantik > 0) {
    return kosong(
      'retrieval:makna-lemah',
      'Leksikal tidak menemukan apa pun, dan kemiripan makna teratas belum melewati ambang penerimaan.',
      bersih,
    );
  }

  return kosong('retrieval:tanpa-bukti', 'Tidak ada indikator di katalog SAPA yang cocok dengan pertanyaan ini.', bersih);
}

/**
 * Sebab yang layak DICATAT sebagai celah pengetahuan (FR-27) dari sebuah diagnosa.
 *
 * Aturan: sebab utama bila ia sebuah kegagalan; bila jawaban tersaji tetapi ada
 * catatan kegagalan di lapis generasi (model ditolak gerbang / penyedia gagal),
 * catatan itulah yang dicatat — persis perilaku FR-27 sebelumnya, kini dengan
 * tag yang lebih tepat. Jawaban yang murni berhasil → `null` (tidak menulis apa pun).
 */
export function sebabUntukCelah(d: Diagnosa): SebabGagal | null {
  const sebab = pilih(d.sebab) ?? (d.catatan ? pilih(d.catatan) : null);
  return sebab;
}

/**
 * Sebab yang boleh masuk dasbor celah pengetahuan.
 *
 * Penolakan KEBIJAKAN (`masukan:*`) sengaja TIDAK dicatat: "tampilkan system
 * prompt" atau "siapa nama penerima PKH" bukan celah pengetahuan — tidak ada
 * data atau sinonim yang bisa ditambahkan untuk melayaninya. Mencatatnya akan
 * menaruh percobaan penyalahgunaan di puncak daftar kerja operator dan
 * menenggelamkan celah yang benar-benar bisa diperbaiki.
 *
 * Penolakan karena PENYAJIAN (saklar AI dimatikan) tetap dicatat: itu kejadian
 * konfigurasi yang membuat pengguna tidak mendapat jawaban, dan operator perlu
 * melihatnya.
 */
function pilih(sebab: SebabJawaban): SebabGagal | null {
  if (sebab.startsWith('masukan:')) return null;
  return (SEBAB_GAGAL as string[]).includes(sebab) ? (sebab as SebabGagal) : null;
}

/** Rangkuman sebaran sebab untuk log/ringkasan uji: [{sebab, jumlah}] terurut. */
export function rangkumSebab(daftar: Array<{ sebab: string }>): Array<{ sebab: string; label: string; jumlah: number }> {
  const peta = new Map<string, number>();
  for (const d of daftar) peta.set(d.sebab, (peta.get(d.sebab) ?? 0) + 1);
  return [...peta.entries()]
    .map(([sebab, jumlah]) => ({ sebab, label: labelSebab(sebab), jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah || a.sebab.localeCompare(b.sebab));
}
