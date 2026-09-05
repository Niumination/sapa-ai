// ─── Parser angka tunggal (T-05) ───
// Sebelum 2026-09-04 ada tiga parser dengan hasil berbeda; 62 dari 2.055 record
// SPLP dihitung berbeda antara jalur /api/query dan jalur KPI. Kini satu parser.

import { describe, it, expect } from 'vitest';
import { parseNumericId, parseNumericIdOrFallback } from '../parse-numeric';
import { parseNilaiSapa } from '../format-singkat';

describe('parseNumericId — kini selaras dengan parseNilaiSapa', () => {
  it('desimal bertitik tidak lagi jadi ribuan: "33.16 %" → 33,16 (dulu 3316)', () => {
    expect(parseNumericId('33.16 %')).toBe(33.16);
    expect(parseNumericId('39.2')).toBe(39.2);
    expect(parseNumericId('98.86')).toBe(98.86);
    expect(parseNumericId('0.84')).toBe(0.84);
    expect(parseNumericId('5.94')).toBe(5.94);
  });

  it('pemisah ribuan tetap benar', () => {
    expect(parseNumericId('9.610')).toBe(9610);
    expect(parseNumericId('11.503.360.000.000')).toBe(11503360000000);
    expect(parseNumericId('236866')).toBe(236866);
  });

  it('desimal berkoma & gabungan', () => {
    expect(parseNumericId('1.234,56')).toBe(1234.56);
    expect(parseNumericId('4,9')).toBe(4.9);
  });

  it('awalan/sisipan satuan dibuang', () => {
    expect(parseNumericId('Rp 1.250.000')).toBe(1250000);
    expect(parseNumericId('730 Orang')).toBe(730);
  });

  it('non-numerik ditolak (bukan dipaksa jadi 0)', () => {
    expect(parseNumericId('12a')).toBeNull();
    expect(parseNumericId('n/a')).toBeNull();
    expect(parseNumericId('..')).toBeNull();
    expect(parseNumericId('-')).toBeNull();
    expect(parseNumericId('')).toBeNull();
  });

  it('konsisten dengan parseNilaiSapa untuk nilai-nilai uji', () => {
    for (const v of ['33.16', '39.2', '9.610', '4,9', '1.234,56', '730', '0.84']) {
      expect(parseNumericId(v)).toBe(parseNilaiSapa(v));
    }
  });

  it('fallback hanya untuk nilai yang benar-benar gagal', () => {
    expect(parseNumericIdOrFallback('9610', 0)).toBe(9610);
    expect(parseNumericIdOrFallback('n/a', 7)).toBe(7);
    expect(parseNumericIdOrFallback(null, 7)).toBe(7);
  });
});
