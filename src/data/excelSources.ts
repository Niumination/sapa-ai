// ─── Registry Sumber Data Excel (Dokumen A/B/C) ───
// Data diekstrak deterministik dari berkas Excel pemberdayaan sosial Aceh Tengah
// menjadi AGREGAT TANPA PII. Runtime membaca JSON ini (resolveJsonModule aktif).
// Lihat src/data/excel/README.md untuk klasifikasi & jaminan PII.

import a01 from './excel/json/dok-a-01-pendidikan-pencapaian-2025.json';
import a02 from './excel/json/dok-a-02-santri-dalam-daerah-2025.json';
import a03 from './excel/json/dok-a-03-santri-luar-daerah-2025.json';
import a04 from './excel/json/dok-a-04-mahasiswa-s1-luar-daerah-2025.json';
import b01 from './excel/json/dok-b-01-stunting-2026-07.json';
import c01 from './excel/json/dok-c-01-kominfo-ppks.json';

export type DokumenKategori = 'A' | 'B' | 'C';

/** Baris tabel agregat generik — kolom mengikuti format asli sumber. */
export interface AggRow {
  [col: string]: string | number;
}

export interface ExcelDoc {
  judul: string;
  opd: string;
  dokumen: DokumenKategori;
  sumber_file: string;
  catatan: string;
  /** Catatan keamanan pendek untuk UI. */
  ringkasan?: Record<string, number>;
  /** Tabel utama agregat (format general mengikuti sumber). */
  baris?: AggRow[];
  per_lembaga?: AggRow[];
  per_kecamatan?: AggRow[];
  per_jenis_kelamin?: AggRow[];
  per_kriteria_ppks?: AggRow[];
  metadata?: Record<string, unknown>;
}

export const EXCEL_DOCS: ExcelDoc[] = [a01, a02, a03, a04, b01, c01] as ExcelDoc[];

/** Kata kunci untuk mendeteksi maksud pertanyaan per dokumen. */
export interface DocKeyword {
  keywords: string[];
}

const KEYWORD_MAP: Record<string, DocKeyword> = {
  // Dikey oleh `judul` (sesuai lookup di matchExcelDoc).
  'Pencapaian Bantuan Siswa Miskin Pendidikan Kab. Aceh Tengah 2025': {
    keywords: ['bsm', 'siswa miskin', 'miskin pendidikan', 'bantuan siswa', 'pencapaian pendidikan', 'realisasi pendidikan', 'pencapaian'],
  },
  'DHV Santri Dalam Daerah Kab. Aceh Tengah 2025': {
    keywords: ['santri', 'santri dalam', 'dhvi santri dalam', 'santri dalam daerah'],
  },
  'DHV Santri Luar Daerah Kab. Aceh Tengah 2025': {
    keywords: ['santri luar', 'dhvi santri luar', 'santri luar daerah'],
  },
  'DHV Mahasiswa S1 Luar Daerah Kab. Aceh Tengah 2025': {
    keywords: ['mahasiswa', 'dhvi mahasiswa', 'mahasiswa s1', 'mahasiswa luar daerah', 'kuliah'],
  },
  'Data Balita Stunting Kab. Aceh Tengah (per 2026-07)': {
    keywords: ['stunting', 'balita stunting', 'anak stunting', 'gizi buruk'],
  },
  'Data Penerima Bantuan Sosial PPKS (Diskominfo) Kab. Aceh Tengah': {
    keywords: ['ppks', 'disabilitas', 'lanjut usia', 'bantuan sosial kominfo', 'data kominfo', 'penerima bantuan sosial'],
  },
};

/**
 * Temukan dokumen yang relevan dengan query. Balik null bila tak ada.
 * Strategi: hitung "skor" tiap dokumen = total panjang keyword yang cocok
 * (keyword lebih panjang = lebih spesifik). Dipilih dokumen dengan skor tertinggi
 * agar "santri luar" menang atas "santri" saat keduanya cocok.
 */
export function matchExcelDoc(query: string): ExcelDoc | null {
  const q = query.toLowerCase();
  const keywordScore = (doc: ExcelDoc): number => {
    const kw = KEYWORD_MAP[doc.judul]?.keywords ?? [];
    return kw.filter((k) => q.includes(k)).reduce((s, k) => s + k.length, 0);
  };
  const opdScore = (doc: ExcelDoc): number => {
    const opdHints: Record<string, RegExp> = {
      'Dinas Pendidikan': /(pendidikan|sekolah|santri|mahasiswa|kuliah|bsm|siswa)/,
      'Dinas Kesehatan': /(stunting|gizi|balita|kesehatan anak)/,
      'Diskominfo': /(ppks|disabilitas|lanjut usia|bantuan sosial|kominfo)/,
    };
    const re = opdHints[doc.opd];
    return re && re.test(q) ? 1 : 0;
  };
  let best: ExcelDoc | null = null;
  let bestScore = 0;
  for (const doc of EXCEL_DOCS) {
    const score = keywordScore(doc);
    // Keyword eksplisit selalu mengungguli OPD fallback (beri bobot besar).
    const total = score > 0 ? 1000 + score : opdScore(doc);
    if (total > bestScore) {
      bestScore = total;
      best = doc;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Label sumber untuk ditampilkan di UI/chip. */
export function docSourceLabel(doc: ExcelDoc): string {
  return `Dokumen ${doc.dokumen} — ${doc.opd}`;
}

/** Bangun tabel agregat utama (format general mengikuti sumber). */
export function docPrimaryTable(doc: ExcelDoc): { headers: string[]; rows: (string | number)[][] } {
  let rows: AggRow[] = [];
  let headers: string[] = [];
  if (doc.baris && doc.baris.length > 0) {
    rows = doc.baris;
    headers = Object.keys(doc.baris[0]);
  } else if (doc.per_lembaga && doc.per_lembaga.length > 0) {
    rows = doc.per_lembaga;
    headers = Object.keys(doc.per_lembaga[0]);
  } else if (doc.per_kecamatan && doc.per_kecamatan.length > 0) {
    rows = doc.per_kecamatan;
    headers = Object.keys(doc.per_kecamatan[0]);
  } else if (doc.per_kriteria_ppks && doc.per_kriteria_ppks.length > 0) {
    rows = doc.per_kriteria_ppks;
    headers = Object.keys(doc.per_kriteria_ppks[0]);
  } else if (doc.per_jenis_kelamin && doc.per_jenis_kelamin.length > 0) {
    rows = doc.per_jenis_kelamin;
    headers = Object.keys(doc.per_jenis_kelamin[0]);
  }
  const outRows = rows.map((r) => headers.map((h) => r[h] ?? ''));
  // Humanisasi header: ganti _ dengan spasi, kapital awal.
  const pretty = headers.map((h) => h.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return { headers: pretty, rows: outRows };
}
