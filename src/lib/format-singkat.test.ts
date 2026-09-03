import { describe, it, expect } from 'vitest';
import { formatSingkat, headlineParts, parseNilaiSapa, singkatNarasi } from './format-singkat';

describe('parseNilaiSapa', () => {
  it('ribuan ID + desimal koma', () => {
    expect(parseNilaiSapa('1.438.857.592.538,6')).toBeCloseTo(1438857592538.6, 1);
  });
  it('ribuan ID tanpa desimal', () => {
    expect(parseNilaiSapa('11.503.360.000.000')).toBe(11503360000000);
  });
  it('desimal koma kecil', () => {
    expect(parseNilaiSapa('4,47')).toBeCloseTo(4.47, 5);
    expect(parseNilaiSapa('0,003593496')).toBeCloseTo(0.003593496, 9);
  });
  it('ekor .00 = desimal, bukan ribuan', () => {
    expect(parseNilaiSapa('618.700.433.221.00')).toBe(618700433221);
    expect(parseNilaiSapa('263.553.257.225.00')).toBe(263553257225);
  });
  it('bulat polos + sampah', () => {
    expect(parseNilaiSapa('6285')).toBe(6285);
    expect(parseNilaiSapa('—')).toBeNull();
    expect(parseNilaiSapa('Rp 12.500')).toBe(12500);
  });
});

describe('formatSingkat', () => {
  it('kasus user: belanja APBD', () => {
    expect(formatSingkat('1.438.857.592.538,6')).toBe('1,44 Triliun');
  });
  it('kasus user: PDRB', () => {
    expect(formatSingkat('11.503.360.000.000')).toBe('11,5 Triliun');
  });
  it('ribuan tampil penuh (kasus ASN)', () => {
    expect(formatSingkat('9610')).toBe('9.610');
    expect(formatSingkat('6285')).toBe('6.285');
    expect(formatSingkat('999999')).toBe('999.999');
  });
  it('singkatan mulai sejuta', () => {
    expect(formatSingkat('1000000')).toBe('1 Juta');
    expect(formatSingkat('2500000')).toBe('2,5 Juta');
  });
  it('skala kecil', () => {
    expect(formatSingkat('432')).toBe('432');
    expect(formatSingkat('4,47')).toBe('4,47');
    expect(formatSingkat('0,003593496')).toBe('0,0036');
  });
});

describe('headlineParts', () => {
  it('satuan skala ganda diserap (PDRB Milyar)', () => {
    expect(headlineParts('11.503.360.000.000', 'Milyar')).toEqual({ text: '11,5 Triliun', unit: null });
  });
  it('satuan rupiah dipertahankan', () => {
    expect(headlineParts('1.438.857.592.538,6', 'rupiah')).toEqual({ text: '1,44 Triliun', unit: 'rupiah' });
  });
  it('satuan skala dipertahankan bila angka belum berskala', () => {
    expect(headlineParts('4,5', 'Milyar')).toEqual({ text: '4,5', unit: 'Miliar' });
  });
  it('non-angka lolos apa adanya', () => {
    expect(headlineParts('—', 'orang')).toEqual({ text: '—', unit: 'orang' });
  });
});

describe('singkatNarasi', () => {
  it('kasus PDRB: angka + Milyar ganda', () => {
    expect(singkatNarasi('PDRB Tahun Berjalan 11.503.360.000.000 Milyar (Dinas X, 2025).')).toBe(
      'PDRB Tahun Berjalan 11,5 Triliun (Dinas X, 2025).',
    );
  });
  it('rupiah dipertahankan, tahun tak disentuh', () => {
    expect(singkatNarasi('Belanja 1.438.857.592.538,6 rupiah tahun 2025.')).toBe(
      'Belanja 1,44 Triliun rupiah tahun 2025.',
    );
  });
  it('ekor .00 dibaca desimal', () => {
    expect(singkatNarasi('Realisasi 618.700.433.221.00 rupiah.')).toBe('Realisasi 618,7 Miliar rupiah.');
  });
  it('angka kecil dan tahun lolos', () => {
    expect(singkatNarasi('ASN 9.610 pegawai, prevalensi 31,4 persen (2025).')).toBe(
      'ASN 9.610 pegawai, prevalensi 31,4 persen (2025).',
    );
  });
});
