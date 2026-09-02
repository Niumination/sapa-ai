// ─── KPI Pimpinan (PR Lapis 2) — indikator prioritas terkurasi, deterministik ───
// Pimpinan daerah butuh jawaban cepat untuk indikator kunci — bukan eksplorasi.
// Setiap kartu dihitung langsung dari payload SAPA (retrieval v2 + agregasi),
// dengan delta antar-tahun bila datanya multi-tahun. Tanpa LLM.

import {
  buildMatchGroups,
  scoreRecord,
  normalizeText,
  type SapaRecord,
} from '@/lib/sapa-client';

export interface KpiDef {
  id: string;
  label: string;
  icon: string;
  /** token pencarian (melewati tokenize+sinonim retrieval v2) */
  tokens: string[];
  /**
   * Preferensi BERURUT jika nama indikator mengandung frasa ini — kata pertama
   * bobot tertinggi (untuk memilih varian tepat secara deterministik).
   */
  preferIncludes?: string[];
  /** penalti jika nama indikator mengandung frasa ini (menghindar varian salah) */
  avoidIncludes?: string[];
}

// Kurasi — diverifikasi lewat baterai terhadap katalog SAPA nyata (23 Agu 2026):
// tanpa preferIncludes/avoidIncludes yang tepat, pemenangnya salah varian:
// ASN→"usulan kenaikan pangkat", kemiskinan→"santunan mustahik",
// PDRB→"akomodasi makan-minum", jalan→"jalan lingkungan bertrotoar = 0".
export const KPI_DEFS: KpiDef[] = [
  { id: 'stunting', label: 'Balita Stunting', icon: '👶', tokens: ['stunting'], preferIncludes: ['prevalensi'] },
  { id: 'ipm', label: 'Indeks Pembangunan Manusia', icon: '🎓', tokens: ['ipm'] },
  {
    id: 'asn', label: 'Jumlah ASN', icon: '🏛️', tokens: ['asn'],
    preferIncludes: ['jumlah asn'], avoidIncludes: ['usulan', 'dibina'],
  },
  { id: 'kemiskinan', label: 'Data Kemiskinan', icon: '🤝', tokens: ['kemiskinan'], preferIncludes: ['tingkat', 'kemiskinan'] },
  { id: 'kopi', label: 'Produksi Kopi Arabika', icon: '☕', tokens: ['produksi', 'kopi', 'arabika'] },
  {
    id: 'pdrb', label: 'PDRB Harga Konsisten', icon: '📈', tokens: ['pdrb'],
    preferIncludes: ['tahun berjalan', 'harga konsisten'], avoidIncludes: ['per penyediaan'],
  },
  {
    id: 'jalan', label: 'Panjang Jalan', icon: '🛣️', tokens: ['panjang', 'jalan'],
    preferIncludes: ['jumlah panjang jalan'], avoidIncludes: ['lingkungan'],
  },
  { id: 'putus-sekolah', label: 'Anak Putus Sekolah', icon: '📚', tokens: ['putus', 'sekolah'] },
];

export interface KpiResult {
  id: string;
  label: string;
  icon: string;
  indikator: string;
  opd: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
  deltaPct: number | null; // perubahan relatif vs titik tahun sebelumnya (jika ada)
  deltaDir: 'up' | 'down' | 'flat' | null;
}

interface YearPoint {
  tahun: number;
  nilai: number;
}

function seriesOf(records: SapaRecord[], idKodeIndikator: number): YearPoint[] {
  // Dedupe per tahun (pertahankan kemunculan pertama) — payload SAPA nyata punya
  // baris duplikat satu-tahun; tanpa ini delta "thn lalu" menghitung 2026 vs 2026.
  const byYear = new Map<number, YearPoint>();
  for (const r of records) {
    if (r.id_kode_indikator !== idKodeIndikator) continue;
    const t = (r.tahun ?? '').trim();
    if (!/^\d{4}$/.test(t)) continue;
    const n = Number(String(r.variabel).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    const ty = Number(t);
    if (!byYear.has(ty)) byYear.set(ty, { tahun: ty, nilai: n });
  }
  return [...byYear.values()].sort((a, b) => a.tahun - b.tahun);
}

export interface KpiTopRow {
  idKode: number;
  nama: string;
  opd: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
}

function parseYearIso(tahun: string | null): number | null {
  const t = (tahun ?? '').trim();
  return /^\d{4}$/.test(t) ? Number(t) : null;
}

/**
 * Pilih indikator terbaik untuk satu definisi KPI. null bila tak ada yang cocok.
 * Pemenang = indikator dari record skor terbaik (skor retrieval + preferensi
 * kurasi), TANPA lewat aggregateByIndicator — parser naif agregasi melepas NaN
 * untuk nilai berpemisah ribuan ("11.503.360.000.000") sehingga indikator PDRB
 * hilang; dan urutannya by nilaiNumber (angka kotor menang atas indeks).
 * Baris yang ditampilkan = baris tahun terbaru untuk indikator pemenang.
 */
export function pickKpiRecord(def: KpiDef, records: SapaRecord[]): KpiTopRow | null {
  const groups = buildMatchGroups(def.tokens.filter((t) => t.length >= 3));
  if (groups.length === 0) return null;
  const pref = (def.preferIncludes ?? []).map(normalizeText);
  const avoid = (def.avoidIncludes ?? []).map(normalizeText);

  const scored = records
    .map((r) => {
      const s = scoreRecord(r, groups);
      if (s.indHits === 0) return null;
      const nama = normalizeText(r.kode_indikator_nama_indikator);
      // preferIncludes = preferensi BERURUT: frasa pertama bobot tertinggi, supaya
      // varian pilihan kurator menang deterministik (bukan tergantung urutan payload).
      const prefBonus = pref.reduce((acc, w, idx) => acc + (w && nama.includes(w) ? pref.length - idx : 0), 0);
      const avoidPenalty = avoid.reduce((acc, w) => acc + (w && nama.includes(w) ? 2 : 0), 0);
      return { r, total: s.score + prefBonus - avoidPenalty };
    })
    .filter((x): x is { r: SapaRecord; total: number } => x !== null)
    .sort((a, b) => b.total - a.total);

  if (scored.length === 0) return null;
  const bestId = scored[0].r.id_kode_indikator;
  // Baris tahun terbaru untuk indikator pemenang (tahun kosong kalah dari tahun valid)
  let bestRow: SapaRecord | null = null;
  for (const { r } of scored) {
    if (r.id_kode_indikator !== bestId) continue;
    if (!bestRow) {
      bestRow = r;
      continue;
    }
    const ey = parseYearIso(bestRow.tahun);
    const ny = parseYearIso(r.tahun);
    if ((ey === null && ny !== null) || (ey !== null && ny !== null && ny > ey)) bestRow = r;
  }
  if (!bestRow) return null;
  return {
    idKode: bestId,
    nama: (bestRow.kode_indikator_nama_indikator ?? '').trim(),
    opd: bestRow.opds_nama_opd.trim(),
    nilai: bestRow.variabel,
    satuan: bestRow.satuan,
    tahun: bestRow.tahun || null,
  };
}

export function computeKpis(records: SapaRecord[], defs: KpiDef[] = KPI_DEFS): KpiResult[] {
  const out: KpiResult[] = [];
  for (const def of defs) {
    const top = pickKpiRecord(def, records);
    if (!top) continue;
    const series = seriesOf(records, top.idKode);
    let deltaPct: number | null = null;
    let deltaDir: KpiResult['deltaDir'] = null;
    if (series.length >= 2) {
      const prev = series[series.length - 2];
      const last = series[series.length - 1];
      if (prev.nilai !== 0) {
        deltaPct = ((last.nilai - prev.nilai) / Math.abs(prev.nilai)) * 100;
        deltaDir = deltaPct > 0.05 ? 'up' : deltaPct < -0.05 ? 'down' : 'flat';
      }
    }
    out.push({
      id: def.id,
      label: def.label,
      icon: def.icon,
      indikator: top.nama,
      opd: top.opd,
      nilai: top.nilai,
      satuan: top.satuan,
      tahun: top.tahun,
      deltaPct,
      deltaDir,
    });
  }
  return out;
}
