// ─── Plausibility Engine (WP4.2) ─────────────────────────────────────────────
// Validasi kewajaran angka per conceptId/measure/geo. Dapat diperluas via rule registry.

import type { Metric } from './types';

interface PlausibilityRule {
  conceptId?: string;
  measure?: string;
  geoLevel?: string;
  min?: number;
  max?: number;
  forbidNegative?: boolean;
  message?: string;
}

const RULES: PlausibilityRule[] = [
  { conceptId: 'penduduk.total.count', min: 150_000, max: 350_000, message: 'Penduduk Aceh Tengah di luar rentang wajar 150rb–350rb.' },
  { conceptId: 'penduduk.balita.count', min: 5_000, max: 50_000, message: 'Jumlah balita di luar rentang wajar 5rb–50rb.' },
  { conceptId: 'stunting.balita.count', min: 0, max: 50_000, message: 'Jumlah stunting balita di luar rentang wajar 0–50rb.' },
  { conceptId: 'stunting.balita.rate', min: 0, max: 100, message: 'Prevalensi stunting harus 0–100%.' },
  { measure: 'rate_percent', min: 0, max: 100, message: 'Rate persen harus 0–100%.' },
  { measure: 'currency', min: 0, message: 'Nilai rupiah tidak boleh negatif.' },
  { measure: 'length', min: 0, message: 'Panjang tidak boleh negatif.' },
  { measure: 'weight', min: 0, message: 'Berat/produksi tidak boleh negatif.' },
];

export function plausibilityCheck(metric: Metric): { plausible: boolean; warning?: string } {
  const rule = RULES.find(r => {
    if (r.conceptId && metric.conceptId !== r.conceptId) return false;
    if (r.measure && metric.measure !== r.measure) return false;
    if (r.geoLevel && metric.geo.level !== r.geoLevel) return false;
    return true;
  });
  if (!rule) return { plausible: true };

  if (rule.forbidNegative && metric.value < 0) {
    return { plausible: false, warning: rule.message ?? 'Nilai tidak boleh negatif.' };
  }
  if (rule.min !== undefined && metric.value < rule.min) {
    return { plausible: false, warning: rule.message ?? `Nilai ${metric.value} di bawah batas bawah ${rule.min}.` };
  }
  if (rule.max !== undefined && metric.value > rule.max) {
    return { plausible: false, warning: rule.message ?? `Nilai ${metric.value} melebihi batas atas ${rule.max}.` };
  }
  return { plausible: true };
}

export function plausibilityGate(metrics: Metric[]): Metric[] {
  return metrics.filter(m => plausibilityCheck(m).plausible);
}
