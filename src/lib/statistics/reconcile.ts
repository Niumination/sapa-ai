// ─── Rekonsiliasi Multi-Sumber (WP4.1) ──────────────────────────────────────
// Lapisan tinggi di atas fuseMetrics: terima raw metrics, kembalikan
// ReconciliationResult yang siap dipakai narasi/UI.

import type { Metric } from './types';
import { fuseMetrics, computeDiscrepancy, buildCaveats, DEFAULT_DISCREPANCY_THRESHOLD_PCT } from './fusion';

export interface ReconciliationResult {
  conceptId: string;
  label: string;
  primary: Metric | null;
  candidates: Metric[];
  discrepancy: ReturnType<typeof computeDiscrepancy>;
  caveats: ReturnType<typeof buildCaveats>;
  unitCanonical: string;
  unitRaw: string[];
}

export function reconcile(metrics: Metric[], thresholdPct = DEFAULT_DISCREPANCY_THRESHOLD_PCT): ReconciliationResult[] {
  const fused = fuseMetrics(metrics);
  const out: ReconciliationResult[] = [];
  for (const [conceptId, fm] of fused) {
    out.push({
      conceptId,
      label: fm.label,
      primary: fm.primary,
      candidates: fm.metrics,
      discrepancy: computeDiscrepancy(fm.metrics, thresholdPct),
      caveats: buildCaveats(fm.metrics, fm.discrepancy),
      unitCanonical: fm.metrics[0]?.unitCanonical ?? '',
      unitRaw: [...new Set(fm.metrics.map(m => m.unitRaw).filter(Boolean))],
    });
  }
  return out;
}
