import { describe, it, expect } from 'vitest';
import { buildVizFromEvidence } from '@/services/grounding';
import type { EvidenceItem } from '@/services/grounding';

describe('buildVizFromEvidence Bapokting', () => {
  it('harus mengembalikan tipe chart untuk evidence Bapokting', () => {
    const evidence: EvidenceItem[] = [
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Beras 88', nilai: '16000', satuan: 'Kg', tahun: null, id: 'bapokting:beras-88' },
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Beras Cap Udang', nilai: '14500', satuan: 'Kg', tahun: null, id: 'bapokting:beras-cap-udang' },
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Cabai Merah', nilai: '45000', satuan: 'Kg', tahun: null, id: 'bapokting:cabai-merah' },
    ];
    const viz = buildVizFromEvidence(evidence);
    expect(viz).toEqual(expect.objectContaining({ tipe: 'chart' }));
  });

  it('harus memiliki konfigurasi chart bar dengan data harga yang benar', () => {
    const evidence: EvidenceItem[] = [
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Beras 88', nilai: '16000', satuan: 'Kg', tahun: null, id: 'bapokting:beras-88' },
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Beras 2 Mawar', nilai: '16600', satuan: 'Kg', tahun: null, id: 'bapokting:beras-2-mawar' },
      { opd: 'Bapokting Aceh Tengah (SPLP API)', indikator: 'Harga Minyak Goreng', nilai: '25000', satuan: 'L', tahun: null, id: 'bapokting:minyak' },
    ];
    const viz = buildVizFromEvidence(evidence);
    if (viz.tipe === 'chart') {
      expect(viz.konfigurasi).toHaveProperty('type', 'bar');
      expect(viz.konfigurasi).toHaveProperty('bars');
      expect(viz.konfigurasi.bars).toContain('harga');
      expect(viz.konfigurasi.data).toBeDefined();
      expect(viz.konfigurasi.data.length).toBe(3);

      const data = viz.konfigurasi.data as any[];
      const beras88 = data.find((d) => d.nama?.includes('Beras 88'));
      expect(beras88).toBeDefined();
      expect(beras88.harga).toBe(16000);
      expect(beras88.satuan).toBe('Kg');
    } else {
      throw new Error('Expected chart, got ' + viz.tipe);
    }
  });
});
