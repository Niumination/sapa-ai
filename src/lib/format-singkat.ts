/**
 * Singkatan angka headline (id-ID) — nilai penuh tetap ada di evidence/tabel.
 * "1.438.857.592.538,6" rupiah → "1,44 Triliun" (+ satuan "rupiah" terpisah).
 */

/** Kata skala yang kadang disalah-taruh di kolom satuan SAPA (mis. PDRB "Milyar"). */
const SCALE_WORDS = new Set([
  'miliar', 'milyar', 'miliaran',
  'juta', 'jutaan',
  'ribu', 'ribuan',
  'triliun', 'triliunan',
]);

const SCALE_NORMALIZED: Record<string, string> = {
  milyar: 'Miliar',
  miliaran: 'Miliar',
  jutaan: 'Juta',
  ribuan: 'Ribu',
  triliunan: 'Triliun',
};

/** Parse format angka SAPA: "1.438.857.592.538,6" | "11.503.360.000.000" | "4,47" | "6285". */
export function parseNilaiSapa(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!raw || raw === '-' || raw === '.' || raw === ',') return null;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = raw.replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    // Ekor ".00" setelah grup ribuan = desimal ID ("618.700.433.221.00" → 618,7 Miliar,
    // bukan 61,87 Triliun). Tanpa ekor desimal = semua titik pemisah ribuan.
    const decimals = raw.match(/\.(\d{1,2})$/)?.[1] ?? null;
    const digits = raw.replace(/\./g, '');
    normalized = decimals !== null ? `${digits.slice(0, -decimals.length)}.${decimals}` : digits;
  } else if (/^\d{1,3}\.\d{3}$/.test(raw)) {
    // Titik tunggal + 3 digit = pemisah ribuan ID ("12.500" → 12500)
    normalized = raw.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "1438857592538.6" → "1,44 Triliun" · "6285" → "6.285" · "4,47" → "4,47".
 *  Singkatan mulai dari jutaan; ribuan tampil penuh ("9.610"). */
export function formatSingkat(value: unknown): string | null {
  const n = parseNilaiSapa(value);
  if (n === null) return null;
  const a = Math.abs(n);
  const fmt = (x: number, max = 2) => x.toLocaleString('id-ID', { maximumFractionDigits: max });
  if (a >= 1e12) return `${fmt(n / 1e12)} Triliun`;
  if (a >= 1e9) return `${fmt(n / 1e9)} Miliar`;
  if (a >= 1e6) return `${fmt(n / 1e6)} Juta`;
  if (a >= 1 || a === 0) return fmt(n);
  return fmt(n, 4);
}

export interface HeadlineParts {
  text: string;
  /** null = satuan diserap ke angka ("11,5 Triliun" tanpa label "Milyar" ganda). */
  unit: string | null;
}
/**
 * Headline = angka singkat + satuan jujur.
 * - Satuan skala ("Milyar") disembunyikan bila angka sudah berskala ("11,5 Triliun"),
 *   ditampilkan (dinormalisasi) bila angka belum berskala ("4,5" + "Milyar" → "4,5 Miliar").
 * - Satuan non-skala ("rupiah", "persen", "orang") selalu ditampilkan apa adanya.
 */
export function headlineParts(nilai: unknown, satuan?: string | null): HeadlineParts {
  const fallback: HeadlineParts = {
    text: nilai === null || nilai === undefined || nilai === '' ? '—' : String(nilai),
    unit: satuan?.trim() ? satuan.trim() : null,
  };
  const short = formatSingkat(nilai);
  if (short === null) return fallback;
  const hasScale = /Triliun|Miliar|Juta/.test(short);
  const unit = satuan?.trim() ?? '';
  if (!unit) return { text: short, unit: null };
  if (SCALE_WORDS.has(unit.toLowerCase())) {
    return hasScale ? { text: short, unit: null } : { text: short, unit: SCALE_NORMALIZED[unit.toLowerCase()] ?? unit };
  }
  return { text: short, unit };
}

/**
 * Singkatkan angka besar di dalam kalimat narasi ("…11.503.360.000.000 Milyar…"
 * → "…11,5 Triliun…"). Kosmetik pasca-grounding seperti formatRibuan.
 * - Hanya nilai >= 1 juta; tahun plausibel (1900–2100) dan angka kecil tak disentuh.
 * - Kata skala yang menempel ("Milyar") dibuang bila skala sudah ada di angka;
 *   satuan non-skala ("rupiah", "persen") dipertahankan.
 */
export function singkatNarasi(text: string): string {
  if (!text) return text;
  const replaced = text.replace(/\d[\d.]*(?:,\d+)?/g, (tok) => {
    const n = parseNilaiSapa(tok);
    if (n === null || Math.abs(n) < 1e6) return tok;
    if (/^\d{4}$/.test(tok) && n >= 1900 && n <= 2100) return tok;
    return formatSingkat(n) ?? tok;
  });
  return replaced.replace(
    /\b(Triliun|Miliar|Juta)\s+(Milyar|Miliar|Juta|Ribu|Triliun)\b/gi,
    '$1',
  );
}
