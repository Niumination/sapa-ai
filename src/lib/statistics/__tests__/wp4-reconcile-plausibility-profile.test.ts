import { describe, it, expect } from 'vitest';
import { plausibilityCheck, plausibilityGate } from '@/lib/statistics/plausibility';
import { reconcile } from '@/lib/statistics/reconcile';
import { buildDataProfile } from '@/lib/statistics/data-profile';
import type { Metric } from '@/lib/statistics/types';

function mkMetric(over: Partial<Metric> & { value: number; sourceLabel: string; sourceId: string; unitCanonical?: string; unitRaw?: string; measure?: string; year?: number; isDemo?: boolean }): Metric {
  return {
    id: over.id ?? `m-${over.sourceId}`,
    conceptId: over.conceptId ?? 'penduduk.total.count',
    label: over.label ?? 'Jumlah Penduduk',
    measure: over.measure ?? 'count',
    value: over.value,
    valueRaw: String(over.value),
    unitCanonical: over.unitCanonical ?? 'jiwa',
    unitRaw: over.unitRaw ?? 'jiwa',
    period: { kind: 'year', year: over.year ?? 2024, label: String(over.year ?? 2024) },
    geo: { level: 'kabupaten', kabupaten: 'Aceh Tengah' },
    opd: 'BPS',
    source: { id: over.sourceId as any, label: over.sourceLabel, isDemo: Boolean(over.isDemo) },
  } as Metric;
}

describe('WP4 reconcile', () => {
  it('group by conceptId, keep candidates + primary', () => {
    const out = reconcile([
      mkMetric({ value: 100, sourceLabel: 'Demo', sourceId: 'dtsen-demo', isDemo: true }),
      mkMetric({ value: 200, sourceLabel: 'SAPA', sourceId: 'sapa' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.primary?.source.id).toBe('sapa');
    expect(out[0]!.candidates).toHaveLength(2);
    expect(out[0]!.unitRaw).toEqual(['jiwa']);
  });
});

describe('WP4 plausibility', () => {
  it('flag out-of-range penduduk', () => expect(plausibilityCheck(mkMetric({ value: 500_000, sourceLabel: 'X', sourceId: 'sapa' })).plausible).toBe(false));
  it('accept within-range', () => expect(plausibilityCheck(mkMetric({ value: 200_000, sourceLabel: 'X', sourceId: 'sapa' })).plausible).toBe(true));
  it('gate filters bad metrics', () => expect(plausibilityGate([mkMetric({ value: 500_000, sourceLabel: 'X', sourceId: 'sapa' }), mkMetric({ value: 200_000, sourceLabel: 'Y', sourceId: 'sapa' })])).toHaveLength(1));
});

describe('WP4 data-profile', () => {
  it('derives sources/units/years from metrics', () => {
    const p = buildDataProfile([
      mkMetric({ value: 100, sourceLabel: 'SAPA', sourceId: 'sapa', unitCanonical: 'jiwa', unitRaw: 'Orang', year: 2025 }),
      mkMetric({ value: 200, sourceLabel: 'BAPPEDA', sourceId: 'dtsen-bappeda', unitCanonical: 'jiwa', unitRaw: 'jiwa', year: 2024 }),
    ], true);
    expect(p.metricCount).toBe(2);
    expect(p.sources.map(s => s.id).sort()).toEqual(['dtsen-bappeda','sapa']);
    expect(p.yearRange).toEqual({ min: 2024, max: 2025 });
    expect(p.hasDemo).toBe(false);
    expect(p.hasDiscrepancy).toBe(true);
  });
});
