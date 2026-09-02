import { describe, it, expect } from 'vitest';
import { buildNarrative } from '@/lib/statistics/narrative';
import { fuseMetrics } from '@/lib/statistics/fusion';
import type { Metric } from '@/lib/statistics/types';

function mk(value: number, label: string, id: string, year: number): Metric {
  return {
    id, conceptId: 'penduduk.total.count', label: 'Jumlah Penduduk', measure: 'count',
    value, valueRaw: String(value), unitCanonical: 'jiwa', unitRaw: 'jiwa',
    period: { kind: 'year', year, label: String(year) },
    geo: { level: 'kabupaten', kabupaten: 'Aceh Tengah' },
    opd: 'BPS', source: { id: id as any, label },
  } as Metric;
}

describe('narrative', () => {
  it('dua sumber penduduk → ringkasan sebut keduanya + caveat', () => {
    const fused = fuseMetrics([
      mk(222643, 'SAPA BPS 2023', 'sapa', 2023),
      mk(234740, 'DTSEN-BAPPEDA Des 2025', 'dtsen-bappeda', 2025),
    ]);
    const out = buildNarrative({ fused });
    expect(out.judul).toContain('Rekonsiliasi');
    expect(out.ringkasan).toContain('222.643');
    expect(out.ringkasan).toContain('234.740');
    expect(out.hasDiscrepancy).toBe(true);
    expect(out.caveats.length).toBeGreaterThan(0);
  });

  it('empty → pesan tidak ada data', () => {
    const out = buildNarrative({ fused: new Map() });
    expect(out.ringkasan).toContain('Tidak ada data');
  });
});
