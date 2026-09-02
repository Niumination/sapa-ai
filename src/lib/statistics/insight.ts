// ─── Insight Engine (WP5) ─────────────────────────────────────────────────────
// Ekstrak insight terukur dari FusedMetric/fusion output.
// Deterministik: angka only. LLM opsional hanya untuk merapikan bahasa.

import type { FusedMetric } from '@/lib/statistics/fusion';
import { computeDiscrepancy } from '@/lib/statistics/fusion';
import { describe, classifyTrend } from '@/lib/statistics/compute';

export interface Insight {
  conceptId: string;
  label: string;
  direction: 'naik' | 'turun' | 'stabil' | 'flat';
  changePct?: number;
  discrepancy?: ReturnType<typeof computeDiscrepancy>;
  caveats: string[];
  sentence: string; // insight terukur 1 kalimat
}

const CAVEAT_TEMPLATES = [
  (m: FusedMetric) => m.discrepancy?.isMaterial ? `Selisih ${m.discrepancy.pctDiff.toFixed(1)}% antar sumber untuk ${m.label}.` : null,
  (m: FusedMetric) => m.metrics.some(x => x.source.isDemo) ? `Sebagian data ${m.label} adalah demo.` : null,
  (m: FusedMetric) => !m.isPlausible ? `Nilai ${m.label} di luar rentang wajar.` : null,
];

export function buildInsights(fused: Map<string, FusedMetric>): Insight[] {
  const out: Insight[] = [];
  for (const fm of fused.values()) {
    const primary = fm.primary;
    const values = fm.metrics.map(m => m.value);
    const stats = describe(values);
    const first = values[0];
    const last = values[values.length - 1];
    const changePct = first && last ? ((last - first) / first) * 100 : undefined;
    const direction = changePct === undefined ? 'flat' : classifyTrend(changePct, 2);
    const caveats = CAVEAT_TEMPLATES.map(f => f(fm)).filter(Boolean) as string[];
    const sentence =
      fm.label +
      (changePct !== undefined ? ` ${direction} ${Math.abs(changePct).toFixed(1)}%` : ' stabil') +
      ` (${stats.count} titik, primer ${primary?.source.label ?? '-'} ${primary?.period.label ?? ''}).` +
      (caveats.length ? ' ' + caveats.join(' ') : '');
    out.push({
      conceptId: fm.conceptId,
      label: fm.label,
      direction,
      changePct,
      discrepancy: fm.discrepancy ?? undefined,
      caveats,
      sentence,
    });
  }
  return out;
}

export function buildAnalysis(insights: Insight[]): string {
  if (!insights.length) return 'Tidak ada insight terukur dari data yang tersedia.';
  const top = insights.slice(0, 5);
  const sentences = top.map(i => i.sentence);
  return sentences.join(' ');
}
