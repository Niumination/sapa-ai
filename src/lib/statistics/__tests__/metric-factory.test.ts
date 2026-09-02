import { describe, test, expect } from 'vitest';
import { sapaRecordToMetric, evidenceToMetric } from '@/lib/statistics/metric';
import type { SapaRecord, EvidenceItem } from '@/lib/statistics/metric';

describe('WP1.5 MetricFactory wiring', () => {
  const geo = { level: 'kabupaten' as const, kabupaten: 'Aceh Tengah' };
  const sapaBase: SapaRecord = {
    id: 1, nama: 'Stunting Balita', opd: 'Dinkes', nilai: '42',
    nilaiNumber: 42, satuan: 'jiwa', tahun: '2025',
  };
  test('sapaRecordToMetric maps concept/measure/geo/period', () => {
    const m = sapaRecordToMetric(sapaBase, geo);
    expect(m.conceptId).toBe('stunting.balita.count');
    expect(m.measure).toBe('count');
    expect(m.value).toBe(42);
    expect(m.unitCanonical).toBe('jiwa');
    expect(m.period.kind).toBe('year');
    expect(m.geo.kabupaten).toBe('Aceh Tengah');
  });
  test('evidenceToMetric fallback if no concept', () => {
    const ev: EvidenceItem = { id: 99, indikator: 'XYZ tidak ada', nilai: '10', satuan: 'Orang', tahun: '2024', opd: 'Test' };
    const m = evidenceToMetric(ev, 'sapa');
    expect(m.conceptId).toBe('evidence:99');
    expect(m.value).toBe(10);
    expect(m.unitCanonical).toBe('jiwa');
  });
});
