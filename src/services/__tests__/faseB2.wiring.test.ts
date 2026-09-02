import { describe, test, expect } from 'vitest';
import { isTrendQuery, buildTrendUnavailableResponse } from '@/services/trend-analysis';

describe('WP1.6 wiring: grounding/trend/kpi use registry/normalize/parseNumeric', () => {
  test('isTrendQuery true untuk pola tren', () => {
    expect(isTrendQuery('tren stunting 5 tahun')).toBe(true);
    expect(isTrendQuery('perkembangan PDRB')).toBe(true);
    expect(isTrendQuery('berapa penduduk')).toBe(false);
  });
  test('buildTrendUnavailableResponse menghasilkan narasi jujur tanpa klaim arah', () => {
    const ev = {
      id: 1,
      id_kode_indikator: 1,
      kode_indikator_kode_indikator: 'STUNT',
      kode_indikator_nama_indikator: 'Stunting Balita',
      id_opds: 1,
      opds_nama_opd: 'Dinas Kesehatan',
      jadwal_pemutakhiran: '2025',
      satuan: 'jiwa',
      tahun: '2025',
      variabel: '42',
    };
    const res = buildTrendUnavailableResponse([ev], 'direct');
    expect(res?.narasi).toContain('hanya memuat');
    expect(res?.narasi).not.toContain('cenderung');
  });
});
