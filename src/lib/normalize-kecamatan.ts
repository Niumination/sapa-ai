// ─── Normalisasi Kecamatan Aceh Tengah — single source of truth ───
// Dipakai oleh dtsen-import, dtsen-planner, grounding, ai-orchestrator, sapa-client
export const KECAMATAN_ACEH_TENGAH = [
  'Atu Lintang', 'Bebesen', 'Bies', 'Bintang', 'Celala', 'Jagong Jeget',
  'Kebayakan', 'Ketol', 'Kute Panang', 'Laut Tawar', 'Linge', 'Pegasing',
  'Rusip Antara', 'Silih Nara',
] as const;

export type Kecamatan = typeof KECAMATAN_ACEH_TENGAH[number];

// Alias tambahan yang pernah muncul di SAPA/DTSEN (lowercase normalized → kanonik)
export const KEC_ALIAS: Record<string, Kecamatan> = {
  'lut tawar': 'Laut Tawar',
  'kute penang': 'Kute Panang', // typo umum
  'silih nara': 'Silih Nara',
  'atu lintang': 'Atu Lintang',
  'jagong jeget': 'Jagong Jeget',
  'kebayakan': 'Kebayakan',
  'rusip antara': 'Rusip Antara',
  'pegasing': 'Pegasing',
  // semua bentuk lower sudah di-handle via canonical map, alias khusus untuk typo
};

function normalizeRaw(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const KEC_NORM = new Map<string, Kecamatan>(
  KECAMATAN_ACEH_TENGAH.map((k) => [normalizeRaw(k), k]),
);

export function normalizeKecamatan(raw: string): Kecamatan | undefined {
  const n = normalizeRaw(raw);
  return KEC_ALIAS[n] ?? KEC_NORM.get(n);
}

export function normalizeKecamatanOrThrow(raw: string): Kecamatan {
  const r = normalizeKecamatan(raw);
  if (!r) throw new Error(`Kecamatan "${raw}" tidak dikenal`);
  return r;
}
