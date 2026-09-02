// ─── Fusion & Rekonsiliasi Multi-Sumber (WP4) ─────────────────────────────────
// Membandingkan nilai untuk konsep yang sama dari berbagai sumber
// (SAPA / DTSEN-BAPPEDA / DTSEN-SPLP / Dokumen) dan menghasilkan caveat jujur.
// Dipakai oleh WP5 (narasi) dan diaudit oleh WP6 (harness).

import type { Metric, SourceRef } from './types';
import { growth } from './compute';

export interface Discrepancy {
  conceptId: string;
  sources: { label: string; value: number }[];
  maxValue: number;
  minValue: number;
  pctDiff: number; // ((max-min)/min)*100
  isMaterial: boolean; // pctDiff > threshold
}

export interface Caveat {
  kind: 'discrepancy' | 'period_mismatch' | 'geo_mismatch' | 'demo_data' | 'k_anonymity' | 'stale';
  message: string;
  severity: 'info' | 'warning';
}

export interface FusedMetric {
  conceptId: string;
  label: string;
  metrics: Metric[];
  primary: Metric | null; // nilai pilihan (prioritas: non-demo, terbaru)
  discrepancy: Discrepancy | null;
  caveats: Caveat[];
  isPlausible: boolean;
}

/** Threshold perbedaan material antar sumber (default 3% untuk count). */
export const DEFAULT_DISCREPANCY_THRESHOLD_PCT = 3;

/** Prioritas sumber untuk memilih primary (rendah = lebih dipercaya). */
const SOURCE_PRIORITY: Record<string, number> = {
  'sapa': 1,
  'dtsen-db': 2,
  'dtsen-bappeda': 3,
  'dtsen-splp': 3,
  'bapokting': 2,
  'dok-a': 4, 'dok-b': 4, 'dok-c': 4,
  'dtsen-demo': 99,
};

function sourceRank(id: string): number {
  return SOURCE_PRIORITY[id] ?? 50;
}

/** Hitung discrepancy antar sumber untuk satu konsep. */
export function computeDiscrepancy(metrics: Metric[], thresholdPct = DEFAULT_DISCREPANCY_THRESHOLD_PCT): Discrepancy | null {
  if (metrics.length < 2) return null;
  const values = metrics.map(m => m.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (min === 0) return null;
  const pctDiff = growth(min, max);
  return {
    conceptId: metrics[0].conceptId,
    sources: metrics.map(m => ({ label: m.source.label, value: m.value })),
    maxValue: max,
    minValue: min,
    pctDiff,
    isMaterial: pctDiff > thresholdPct,
  };
}

/** Bangun caveat dari kondisi metrics. */
export function buildCaveats(metrics: Metric[], discrepancy: Discrepancy | null): Caveat[] {
  const caveats: Caveat[] = [];
  if (discrepancy?.isMaterial) {
    // Contoh: "Penduduk total: SAPA 222.643 vs DTSEN-BAPPEDA 234.740 (selisih 5,4%) — metodologi berbeda, jangan dijumlahkan."
    const srcLabels = discrepancy.sources.map(s => `${s.label} ${s.value.toLocaleString('id-ID')}`).join(' vs ');
    caveats.push({
      kind: 'discrepancy',
      message: `Perbedaan antar sumber: ${srcLabels} (selisih ${discrepancy.pctDiff.toFixed(1)}%). Angka berasal dari metodologi & tahun berbeda — jangan dijumlahkan, bandingkan dengan caveat ini.`,
      severity: 'warning',
    });
  }
  // Period mismatch
  const periods = new Set(metrics.map(m => m.period.label));
  if (periods.size > 1) {
    caveats.push({
      kind: 'period_mismatch',
      message: `Tahun/periode berbeda: ${[...periods].join(', ')} — bandingkan tren, bukan nilai absolut.`,
      severity: 'info',
    });
  }
  // Demo data
  if (metrics.some(m => m.source.isDemo)) {
    caveats.push({
      kind: 'demo_data',
      message: 'Sebagian data adalah simulasi (demo) — bukan angka resmi. Gunakan untuk uji alur saja.',
      severity: 'warning',
    });
  }
  // Stale: period tanpa tahun atau label "terbaru" implisit
  if (metrics.some(m => !m.period.year && m.period.kind !== 'none')) {
    caveats.push({
      kind: 'stale',
      message: 'Sebagian sumber tidak mencantumkan tahun — keaktualan tidak terjamin.',
      severity: 'info',
    });
  }
  return caveats;
}

/** Fusi: kelompokkan metrics per conceptId, pilih primary, hitung discrepancy + caveat. */
export function fuseMetrics(metrics: Metric[]): Map<string, FusedMetric> {
  const grouped = new Map<string, Metric[]>();
  for (const m of metrics) {
    const arr = grouped.get(m.conceptId) ?? [];
    arr.push(m);
    grouped.set(m.conceptId, arr);
  }
  const fused = new Map<string, FusedMetric>();
  for (const [conceptId, group] of grouped) {
    const sorted = [...group].sort((a, b) => {
      const r = sourceRank(a.source.id) - sourceRank(b.source.id);
      if (r !== 0) return r;
      // terbaru dulu bila rank sama
      return (b.period.year ?? 0) - (a.period.year ?? 0);
    });
    const primary = sorted[0] ?? null;
    const discrepancy = computeDiscrepancy(group);
    const caveats = buildCaveats(group, discrepancy);
    fused.set(conceptId, {
      conceptId,
      label: group[0].label,
      metrics: group,
      primary,
      discrepancy,
      caveats,
      isPlausible: group.every(m => m.value >= 0),
    });
  }
  return fused;
}

/** Uji kewajaran sederhana: flag jika nilai di luar rentang wajar untuk Aceh Tengah.
 *  Dipakai sebelum menampilkan angka ke pimpinan. */
export function plausibilityCheck(metric: Metric): { plausible: boolean; warning?: string } {
  // Heuristik contoh untuk concept penduduk.total.count
  if (metric.conceptId === 'penduduk.total.count') {
    if (metric.value < 150_000 || metric.value > 350_000) {
      return { plausible: false, warning: `Nilai penduduk ${metric.value.toLocaleString('id-ID')} di luar rentang wajar 150rb–350rb untuk Aceh Tengah.` };
    }
  }
  // Umum: count tidak boleh negatif
  if (metric.measure === 'count' && metric.value < 0) {
    return { plausible: false, warning: 'Nilai cacahan tidak boleh negatif.' };
  }
  return { plausible: true };
}
