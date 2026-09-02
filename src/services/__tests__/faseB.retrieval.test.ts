import { describe, it, expect } from 'vitest';
import { filterByAllKeywords, aggregateByIndicator } from '@/lib/sapa-client';
import type { SapaRecord } from '@/lib/sapa-client';

describe('Fase B — sapa-client regression', () => {
  it('filterByAllKeywords: AND benar (semua token harus di indikator+OPD)', () => {
    const recs: SapaRecord[] = [
      {
        id: 1, id_kode_indikator: 1, kode_indikator_kode_indikator: 'K1',
        kode_indikator_nama_indikator: 'Prevalensi Stunting Balita',
        id_opds: 1, opds_nama_opd: 'Dinas Kesehatan',
        jadwal_pemutakhiran: 'tahunan', satuan: 'persen', tahun: '2024', variabel: '12.5',
      },
      {
        id: 2, id_kode_indikator: 2, kode_indikator_kode_indikator: 'K2',
        kode_indikator_nama_indikator: 'Jumlah Guru ASN',
        id_opds: 2, opds_nama_opd: 'Dinas Pendidikan',
        jadwal_pemutakhiran: 'tahunan', satuan: 'orang', tahun: '2024', variabel: '1200',
      },
    ];
    expect(filterByAllKeywords(recs, ['stunting']).length).toBe(1);
    expect(filterByAllKeywords(recs, ['stunting', 'kesehatan']).length).toBe(1);
    expect(filterByAllKeywords(recs, ['stunting', 'pendidikan']).length).toBe(0);
    expect(filterByAllKeywords(recs, []).length).toBe(0);
  });

  it('aggregate: tahun max independent of input order', () => {
    const base: SapaRecord = {
      id: 10, id_kode_indikator: 900, kode_indikator_kode_indikator: 'K9',
      kode_indikator_nama_indikator: 'Indikator Uji', id_opds: 9,
      opds_nama_opd: 'Dinas Uji', jadwal_pemutakhiran: 'tahunan',
      satuan: 'orang', tahun: '2022', variabel: '50',
    };
    const r2022 = { ...base, id: 10, tahun: '2022', variabel: '50' };
    const r2023 = { ...base, id: 11, tahun: '2023', variabel: '60' };
    const r2024 = { ...base, id: 12, tahun: '2024', variabel: '70' };
    // order random — tahun max menang tanpa tergantung urutan input
    const a1 = aggregateByIndicator([r2022, r2023, r2024]);
    const a2 = aggregateByIndicator([r2024, r2022, r2023]);
    const a3 = aggregateByIndicator([r2023, r2024, r2022]);
    expect(a1[0].tahun).toBe('2024');
    expect(a1[0].nilai).toBe('70');
    expect(a2[0].tahun).toBe('2024');
    expect(a2[0].nilai).toBe('70');
    expect(a3[0].nilai).toBe('70');
  });

  it('aggregate: non-numerik tahun tetap null, tidak menggantikan numerik', () => {
    const base: SapaRecord = {
      id: 20, id_kode_indikator: 910, kode_indikator_kode_indikator: 'K10',
      kode_indikator_nama_indikator: 'Indikator Uji2', id_opds: 9,
      opds_nama_opd: 'Dinas Uji', jadwal_pemutakhiran: 'tahunan',
      satuan: 'orang', tahun: '2024', variabel: '100',
    };
    const r2024 = { ...base, id: 20 };
    const rTerbaru: SapaRecord = { ...base, id: 21, tahun: 'terbaru' as any, variabel: '999' };
    const rNull: SapaRecord = { ...base, id: 22, tahun: null, variabel: '1' };
    expect(aggregateByIndicator([r2024, rTerbaru])[0].nilai).toBe('100');
    expect(aggregateByIndicator([rNull, r2024])[0].nilai).toBe('100');
    expect(aggregateByIndicator([rNull, rTerbaru])[0].nilai).toBe('1'); // keep first among nulls
  });
});
