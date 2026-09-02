import { describe, it, expect } from 'vitest';
import { buildInsights, buildAnalysis } from '@/lib/statistics/insight';
import type { FusedMetric } from '@/lib/statistics/fusion';
import type { Metric } from '@/lib/statistics/types';

function mkMetric(over: Partial<Metric> & { value: number; sourceLabel: string; sourceId: string; year?: number; isDemo?: boolean }): Metric {
  return {
    id: over.id ?? `m-${over.sourceId}`,
    conceptId: over.conceptId ?? 'penduduk.total.count',
    label: over.label ?? 'Jumlah Penduduk',
    measure: 'count',
    value: over.value,
    valueRaw: String(over.value),
    unitCanonical: 'jiwa',
    unitRaw: 'jiwa',
    period: { kind: 'year', year: over.year ?? 2024, label: String(over.year ?? 2024) },
    geo: { level: 'kabupaten', kabupaten: 'Aceh Tengah' },
    opd: 'BPS',
    source: { id: over.sourceId as any, label: over.sourceLabel, isDemo: Boolean(over.isDemo) },
  } as Metric;
}

function mkFm(metrics: Metric[]): FusedMetric {
  return {
    conceptId: metrics[0]!.conceptId,
    label: metrics[0]!.label,
    metrics,
    primary: metrics[0]!,
    discrepancy: metrics.length > 1 ? { conceptId: metrics[0]!.conceptId, sources: metrics.map(m => ({ label: m.source.label, value: m.value })), maxValue: Math.max(...metrics.map(m => m.value)), minValue: Math.min(...metrics.map(m => m.value)), pctDiff: 5, isMaterial: true } : null,
    caveats: [],
    isPlausible: metrics.every(m => m.value >= 0),
  };
}

describe('WP5 insight engine', () => {
  it('buildInsights produces direction + sentence', () => {
    const fm = mkFm([
      mkMetric({ value: 100, sourceLabel: 'SAPA', sourceId: 'sapa', year: 2023 }),
      mkMetric({ value: 110, sourceLabel: 'SAPA', sourceId: 'sapa', year: 2024 }),
    ]);
    const insights = buildInsights(new Map([[fm.conceptId, fm]]));
    expect(insights).toHaveLength(1);
    expect(insights[0]!.direction).toBe('naik');
    expect(insights[0]!.sentence).toContain('naik');
  });
  it('buildAnalysis fallback empty', () => {
    expect(buildAnalysis([])).toBe('Tidak ada insight terukur dari data yang tersedia.');
  });
});
