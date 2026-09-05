// ─── Pagar masuk sebelum teks pengguna menyentuh model ───
// Endpoint bersifat publik: query dibatasi panjangnya, dibungkus sebagai DATA
// (bukan instruksi), dan dipindai pola data pribadi sebelum dikirim ke provider.

export const MAX_QUERY_CHARS = 500;

/** Potong & rapikan query. Mengembalikan null bila tidak layak dikirim. */
export function sanitizeQuery(raw: string): string | null {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < 3) return null;
  return s.slice(0, MAX_QUERY_CHARS);
}

/** 16 digit berurutan — pola NIK. SAPA publik tidak punya NIK, jadi aman ditolak. */
const NIK_RE = /\b\d{16}\b/;

/**
 * Pagar data pribadi untuk SEMUA jalur (deterministik maupun model).
 *
 * Dulu pemeriksaan ini hanya hidup di `guardQuery`, yang baru dipanggil setelah
 * pengecekan "AI aktif?". Karena AI dikirim nonaktif, pagar itu praktis mati:
 * NIK yang diketik pengguna diteruskan ke retrieval, dijadikan kata kunci, dan
 * dikembalikan lagi ke layar di dalam narasi (echo pertanyaan). Pagar ini
 * dipanggil paling awal di `composeAnswer` agar berlaku apa pun mode AI-nya.
 *
 * Batas yang sengaja dipilih — 16 digit berurutan adalah NIK. SPASI dan STRIP
 * sengaja TIDAK dihapus: "2020 2021 2022 2023" adalah pertanyaan rentang tahun
 * yang sah, dan bila pemisahnya dihapus ia akan terbaca sebagai 16 digit.
 */
const NIK_PADAT_RE = /\d{16}/;
const NIK_GRUP_RE = /\b\d{4} \d{4} \d{4} \d{4}\b/;

/** Semua kelompok tampak sebagai tahun (1900–2100)? */
function semuaTahun(kelompok: string[]): boolean {
  return kelompok.every((k) => {
    const n = Number(k);
    return Number.isFinite(n) && n >= 1900 && n <= 2100;
  });
}

export function cekDataPribadi(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // Pemisah yang lazim dipakai saat mengetik NIK: titik, koma, apostrof.
  if (NIK_PADAT_RE.test(s.replace(/[.,']/g, ''))) {
    return 'pertanyaan mengandung pola NIK — tidak dilayani';
  }

  // NIK yang diketik berkelompok 4-4-4-4 dengan spasi. Bentuknya sama dengan
  // daftar tahun ("2020 2021 2022 2023"), jadi bedakan dari isinya: bila semua
  // kelompok adalah tahun yang masuk akal, itu rentang tahun — bukan NIK.
  const grup = s.match(NIK_GRUP_RE);
  if (grup && !semuaTahun(grup[0].split(' '))) {
    return 'pertanyaan mengandung pola NIK — tidak dilayani';
  }

  return null;
}

/**
 * Permintaan data PER-ORANG (bukan agregat). SAPA hanya menyimpan indikator
 * agregat per OPD — tidak ada satu pun data bernama orang. Menjawab "siapa
 * nama penerima PKH di Desa Kemili" dengan angka agregat menyesatkan:
 * seolah-olah sistem tahu siapa orangnya.
 */
const PERMINTAN_PER_ORANG = [
  /\b(siapa\s+nama|nama\s+penerima|nama\s+(warga|orang|penduduk|mustahik))\b/i,
  /\bidentitas\s+(penerima|warga|penduduk|mustahik)\b/i,
  /\b(daftar|data)\s+(warga|nama|orang|individu)\b/i,
  /\bnama\b[\s\S]{0,30}\b(penerima|pkh|bansos|mustahik)\b/i,
];

export function cekPermintaanPerOrang(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return PERMINTAN_PER_ORANG.some((re) => re.test(s))
    ? 'SAPA tidak menyimpan data per-orang — hanya indikator agregat per OPD; permintaan data individu tidak dilayani'
    : null;
}

export interface GuardResult {
  ok: boolean;
  query: string;
  reason?: string;
}

/**
 * Bungkus pertanyaan pengguna sebagai data. Instruksi di dalam pertanyaan
 * ("abaikan aturan…") tidak dieksekusi karena sistem prompt yang berkuasa,
 * dan keluaran tetap diground terhadap evidence.
 */
export function guardQuery(raw: string): GuardResult {
  const query = sanitizeQuery(raw);
  if (!query) return { ok: false, query: '', reason: 'query terlalu pendek' };
  const dataPribadi = cekDataPribadi(query);
  if (dataPribadi) {
    return { ok: false, query, reason: dataPribadi };
  }
  const perOrang = cekPermintaanPerOrang(query);
  if (perOrang) {
    return { ok: false, query, reason: perOrang };
  }
  if (/(abaikan|ignore|bypass|system prompt|prompt system)/i.test(query)) {
    // Tidak langsung ditolak — cukup ditandai agar tercatat di log observabilitas.
    return { ok: true, query };
  }
  return { ok: true, query };
}
