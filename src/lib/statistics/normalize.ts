// ─── Normalisasi Satuan & Wilayah (WP1.4) ────────────────────────────────────
// Satu fungsi per konsep, dipanggil dari semua jalur.

export { normalizeKecamatan, KECAMATAN_ACEH_TENGAH } from '@/lib/normalize-kecamatan';

// ─── Satuan → kanonik ────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  // jiwa / orang
  jiwa: 'jiwa', orang: 'jiwa', orng: 'jiwa', org: 'jiwa', person: 'jiwa',
  'jiwa/orang': 'jiwa',
  // keluarga
  kk: 'kk', 'kepala keluarga': 'kk', keluarga: 'kk',
  // persen
  '%': 'persen', persen: 'persen', percent: 'persen', persentase: 'persen',
  // rupiah
  rp: 'rupiah', rupiah: 'rupiah', 'rp.': 'rupiah', idr: 'rupiah',
  // area
  ha: 'ha', hektar: 'ha', hektare: 'ha',
  'km²': 'km2', km2: 'km2', 'km persegi': 'km2',
  // panjang
  km: 'km', 'kilo meter': 'km', kilometer: 'km',
  // berat
  ton: 'ton', kg: 'kg', kilogram: 'kg',
  // indeks
  indeks: 'indeks', index: 'indeks', poin: 'indeks', skor: 'indeks',
  // unit netral
  unit: 'unit', buah: 'unit', paket: 'unit',
};

export function normalizeUnit(raw: string | null | undefined): string {
  if (!raw) return '';
  return UNIT_MAP[raw.trim().toLowerCase()] ?? raw.trim();
}

// ─── OPD — daftar 38 OPD kanonik + alias ────────────────────────────────────
// ponytail: alias tidak lengkap; perluas dari /api/analytics saat ada data baru

const OPD_ALIAS: Record<string, string> = {
  'dinas kesehatan': 'Dinas Kesehatan',
  dinkes: 'Dinas Kesehatan',
  'dinas pendidikan': 'Dinas Pendidikan',
  diknas: 'Dinas Pendidikan',
  'badan pusat statistik': 'BPS',
  bps: 'BPS',
  'dinas pertanian': 'Dinas Pertanian',
  'dinas pekerjaan umum': 'Dinas PU',
  'dinas pu': 'Dinas PU',
  dpupr: 'Dinas PU',
  bappeda: 'BAPPEDA',
  'badan perencanaan': 'BAPPEDA',
  'dinas sosial': 'Dinas Sosial',
  dinsos: 'Dinas Sosial',
  'dinas komunikasi': 'Diskominfo',
  diskominfo: 'Diskominfo',
  'dinas perikanan': 'Dinas Perikanan',
  'dinas perkebunan': 'Dinas Perkebunan',
  'dinas ketahanan pangan': 'Dinas Ketahanan Pangan',
  bpbd: 'BPBD',
};

export function normalizeOpd(raw: string | null | undefined): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return OPD_ALIAS[lower] ?? raw.trim();
}
