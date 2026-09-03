import { describe, it, expect } from 'vitest';
import { buildVizFromEvidence, type EvidenceItem } from './grounding';
import { buildExecutivePresentation } from './executive-presentation';
import { headlineParts } from '@/lib/format-singkat';
import type { HybridResponse } from '@/types';

// Kasus user: chip PDRB — lead, headline (metrics), narasi wajib selaras "11,5 Triliun".
describe('lead/headline/narasi selaras (PDRB)', () => {
  const evidence: EvidenceItem[] = [
    { opd: 'Dinas X', indikator: 'PDRB Tahun Berjalan atas dasar Harga Konsisten', nilai: '11.503.360.000.000', satuan: 'Milyar', tahun: null, id: 1 },
    { opd: 'Dinas Y', indikator: 'Kontribusi Sektor Perdagangan terhadap PDRB', nilai: '13,45', satuan: 'Persentase', tahun: '2025', id: 2 },
  ];
  const response: HybridResponse = {
    narasi: 'Berdasarkan data SAPA untuk "PDRB", ditemukan 2 indikator terkait.',
    visualisasi: buildVizFromEvidence(evidence),
    rekomendasi: [],
    dataSource: 'SAPA SPLP',
    timestamp: new Date().toISOString(),
  };
  const p = buildExecutivePresentation(response);

  it('lead memakai angka singkat', () => {
    expect(p.lead).toContain('11,5 Triliun');
    expect(p.lead).not.toContain('11.503.360.000.000');
    expect(p.lead).not.toContain('(-)');
  });
  it('metrics (headline) selaras lead via headlineParts', () => {
    const h = headlineParts(p.metrics[0]?.value, p.metrics[0]?.unit);
    expect(h.text).toBe('11,5 Triliun');
    expect(h.unit).toBeNull();
  });
  it('narasi eksekutif disingkat', () => {
    expect(p.narrative).not.toContain('11.503.360.000.000 Milyar');
  });
});
