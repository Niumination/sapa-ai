// Logika murni drill-down analitik per OPD — tanpa fetch/DB/Next.
// Dipisah dari route handler agar bisa diuji unit (pola executive-presentation.ts).
// Diport dari branch dev (feat/ai-executive-answer-v3); parsing angka memakai
// parseNilaiSapa (menangani ekor desimal ".00" khas SPLP) agar tren konsisten
// dengan headline/lead di main.
import { parseNilaiSapa } from '@/lib/format-singkat';
import type { SapaRecord } from '@/lib/sapa-client';

export interface IndicatorRow {
  nama: string;
  nilai: string | null;
  satuan: string;
  tahun: string | null;
}

export interface IndicatorSeries {
  idKodeIndikator: number;
  nama: string;
  satuan: string;
  /** Titik dengan tahun valid saja — sudah terurut naik, dedup per tahun. */
  points: { tahun: number; nilai: number }[];
  /** Jumlah record indikator ini yang TIDAK punya tahun valid. */
  recordsWithoutYear: number;
}

export interface OpdDetail {
  nama: string;
  totalRecords: number;
  uniqueIndicators: number;
  /** Record OPD ini tanpa tahun valid (kualitas data, jujur ditampilkan). */
  recordsWithoutYear: number;
  /** Deret tren hanya untuk indikator yang benar-benar punya ≥2 titik tahunan. */
  trends: IndicatorSeries[];
  indicatorsWithoutTrend: number;
  topIndicators: IndicatorRow[];
}

/** Parse angka berformat Indonesia: titik ribuan, koma desimal ("1.234,56").
 *  Mengembalikan null untuk teks non-numerik (bukan mengarang angka).
 *  Didelegasikan ke parseNilaiSapa agar ekor ".00" dibaca desimal, tapi
 *  string yang mengandung huruf ("12a", "n/a") ditolak dulu — parseNilaiSapa
 *  melonggarkan itu menjadi angka, yang berbahaya untuk deret tren. */
export function parseNumericId(value: string): number | null {
  if (/[A-Za-z]/.test(value)) return null;
  return parseNilaiSapa(value);
}

function isValidYear(tahun: string | null): tahun is string {
  if (!tahun) return false;
  const y = parseInt(tahun, 10);
  return Number.isFinite(y) && y > 1900 && y <= 2200;
}

/** Cari nama OPD persis dari kumpulan record; fallback case-insensitive. */
export function resolveExactOpdName(records: SapaRecord[], opdName: string): string | null {
  const target = records.find(r => r.opds_nama_opd === opdName)
    ?? records.find(r => r.opds_nama_opd.toLowerCase() === opdName.toLowerCase());
  return target ? target.opds_nama_opd : null;
}

/** Susun detail analitik satu OPD dari record yang sudah terfilter persis nama.
 *  Deterministik: tanpa LLM, tanpa angka baru di luar evidence. */
export function buildOpdDetail(records: SapaRecord[], exactName: string): OpdDetail {
  const opdRecords = records.filter(r => r.opds_nama_opd === exactName);

  // Kelompokkan per indikator unik (id_kode_indikator), susun deret tahunan.
  const byIndicator = new Map<number, SapaRecord[]>();
  for (const r of opdRecords) {
    const key = r.id_kode_indikator;
    const list = byIndicator.get(key);
    if (list) list.push(r);
    else byIndicator.set(key, [r]);
  }

  const trends: IndicatorSeries[] = [];
  let indicatorsWithoutTrend = 0;
  let recordsWithoutYear = 0;

  const rows: IndicatorRow[] = [];
  for (const [idKode, recs] of byIndicator) {
    const first = recs[0];
    const nama = first?.kode_indikator_nama_indikator?.trim() || `Indikator #${idKode}`;
    const satuan = first?.satuan || '-';

    // Baris tabel: record dengan nilai variabel terisi; urut tahun terbaru dulu.
    const withValues = recs
      .filter(r => r.variabel && r.variabel.trim() !== '')
      .sort((a, b) => (b.tahun ?? '').localeCompare(a.tahun ?? ''));
    if (withValues.length > 0 && withValues[0]) {
      rows.push({ nama, nilai: withValues[0].variabel, satuan, tahun: withValues[0].tahun });
    }

    // Deret tren: hanya pasangan (tahun>1900, nilai numerik) yang valid.
    const yearPoints: { tahun: number; nilai: number }[] = [];
    let withoutYear = 0;
    for (const r of recs) {
      if (!isValidYear(r.tahun)) { withoutYear++; continue; }
      const num = r.variabel ? parseNumericId(r.variabel) : null;
      if (num === null) continue;
      yearPoints.push({ tahun: parseInt(r.tahun, 10), nilai: num });
    }
    recordsWithoutYear += withoutYear;
    yearPoints.sort((a, b) => a.tahun - b.tahun);

    // Deduplikasi tahun (ambil nilai pertama per tahun).
    const seen = new Set<number>();
    const deduped = yearPoints.filter(p => {
      if (seen.has(p.tahun)) return false;
      seen.add(p.tahun);
      return true;
    });

    if (deduped.length >= 2) {
      trends.push({ idKodeIndikator: idKode, nama, satuan, points: deduped, recordsWithoutYear: withoutYear });
    } else {
      indicatorsWithoutTrend++;
    }
  }

  trends.sort((a, b) => b.points.length - a.points.length);
  rows.sort((a, b) => (b.tahun ?? '').localeCompare(a.tahun ?? ''));

  return {
    nama: exactName,
    totalRecords: opdRecords.length,
    uniqueIndicators: byIndicator.size,
    recordsWithoutYear,
    trends,
    indicatorsWithoutTrend,
    topIndicators: rows.slice(0, 15),
  };
}
