import { describe, it, expect } from 'vitest';
import { computeDiscrepancy, fuseMetrics, plausibilityCheck } from '@/lib/statistics/fusion';
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
    source: { id: over.sourceId as any, label: over.sourceLabel, isDemo: over.isDemo },
  } as Metric;
}

describe('fusion — computeDiscrepancy', () => {
  it('222.643 vs 234.740 = ~5.4% material', () => {
    const d = computeDiscrepancy([
      mkMetric({ value: 222643, sourceLabel: 'SAPA BPS 2023', sourceId: 'sapa', year: 2023 }),
      mkMetric({ value: 234740, sourceLabel: 'DTSEN-BAPPEDA Des 2025', sourceId: 'dtsen-bappeda', year: 2025 }),
    ]);
    expect(d).not.toBeNull();
    expect(d!.pctDiff).toBeCloseTo(5.4, 1);
    expect(d!.isMaterial).toBe(true);
  });

  it('single source → null', () => {
    expect(computeDiscrepancy([mkMetric({ value: 100, sourceLabel: 'SAPA', sourceId: 'sapa' })])).toBeNull();
  });
});

describe('fusion — fuseMetrics', () => {
  it('pilih primary by source priority (sapa > dtsen-bappeda > demo)', () => {
    const fused = fuseMetrics([
      mkMetric({ value: 100, sourceLabel: 'Demo', sourceId: 'dtsen-demo', isDemo: true }),
      mkMetric({ value: 222643, sourceLabel: 'SAPA', sourceId: 'sapa' }),
      mkMetric({ value: 234740, sourceLabel: 'BAPPEDA', sourceId: 'dtsen-bappeda' }),
    ]);
    const fm = fused.get('penduduk.total.count')!;
    expect(fm.primary?.source.id).toBe('sapa');
    expect(fm.caveats.some(c => c.kind === 'discrepancy')).toBe(true);
    expect(fm.caveats.some(c => c.kind === 'demo_data')).toBe(true);
  });
});

describe('fusion — plausibilityCheck', () => {
  it('penduduk diluar 150k-350k = tidak plausible', () => {
    expect(plausibilityCheck(mkMetric({ value: 500000, sourceLabel: 'X', sourceId: 'sapa' })).plausible).toBe(false);
    expect(plausibilityCheck(mkMetric({ value: 200000, sourceLabel: 'X', sourceId: 'sapa' })).plausible).toBe(true);
  });
});
