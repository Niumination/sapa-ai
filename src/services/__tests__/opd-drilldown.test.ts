import { describe, expect, it } from 'vitest';
import {
  buildOpdDetail,
  parseNumericId,
  resolveExactOpdName,
} from '@/services/opd-drilldown';
import type { SapaRecord } from '@/lib/sapa-client';

function record(overrides: Partial<SapaRecord> = {}): SapaRecord {
  return {
    id: 1,
    id_kode_indikator: 100,
    kode_indikator_kode_indikator: 'IND-001',
    kode_indikator_nama_indikator: 'Jumlah Contoh',
    id_opds: 7,
    opds_nama_opd: 'Dinas Uji',
    jadwal_pemutakhiran: 'Tahunan',
    satuan: 'Orang',
    tahun: '2025',
    variabel: '1.234',
    ...overrides,
  };
}

describe('parseNumericId', () => {
  it('mem-parsing format ribuan Indonesia', () => {
    expect(parseNumericId('1.234')).toBe(1234);
    expect(parseNumericId('1.234.567')).toBe(1234567);
  });

  it('mem-parsing desimal koma dan spasi', () => {
    expect(parseNumericId('60,5')).toBeCloseTo(60.5);
    expect(parseNumericId('1.234,56')).toBeCloseTo(1234.56);
    expect(parseNumericId(' 9610 ')).toBe(9610);
  });

  it('ekor .00 dibaca desimal (khas SPLP)', () => {
    expect(parseNumericId('618.700.433.221.00')).toBe(618700433221);
  });

  it('menolak teks non-numerik tanpa mengarang angka', () => {
    expect(parseNumericId('n/a')).toBeNull();
    expect(parseNumericId('Belum tersedia')).toBeNull();
    expect(parseNumericId('12a')).toBeNull();
    // Parser utama (parseNilaiSapa) menerima negatif apa adanya — satu parser di semua tempat.
    expect(parseNumericId('-5')).toBe(-5);
  });
});

describe('resolveExactOpdName', () => {
  const records = [record(), record({ opds_nama_opd: 'Dinas Lain' })];

  it('cocok persis lebih diutamakan', () => {
    expect(resolveExactOpdName(records, 'Dinas Uji')).toBe('Dinas Uji');
  });

  it('fallback case-insensitive', () => {
    expect(resolveExactOpdName(records, 'dinas uji')).toBe('Dinas Uji');
  });

  it('null bila tidak ada', () => {
    expect(resolveExactOpdName(records, 'OPD Fiktif')).toBeNull();
  });
});

describe('buildOpdDetail', () => {
  it('tren hanya untuk indikator dengan >=2 titik tahunan', () => {
    const records = [
      record({ tahun: '2023', variabel: '100' }),
      record({ tahun: '2024', variabel: '120' }),
      record({ id_kode_indikator: 200, kode_indikator_nama_indikator: 'Lain', tahun: '-', variabel: '5' }),
    ];
    const d = buildOpdDetail(records, 'Dinas Uji');
    expect(d.uniqueIndicators).toBe(2);
    expect(d.trends.length).toBe(1);
    expect(d.trends[0]?.points.map((p) => p.tahun)).toEqual([2023, 2024]);
  });
});
