import { describe, it, expect } from 'vitest';
import { ejectTokens, createStreamEjector } from '../tokens';

const evidence = [
  { id: 511, nilai: '31,4', satuan: 'Persen', tahun: '2025' },
  { id: 21, nilai: '9.610', satuan: 'pegawai', tahun: '2026' },
  { id: 99, nilai: '730', satuan: 'Orang', tahun: null },
];

describe('ejectTokens', () => {
  it('mengganti token dengan nilai + satuan dari evidence', () => {
    const out = ejectTokens('Prevalensi stunting {{511}} pada {{511|t}}.', evidence);
    expect(out.text).toBe('Prevalensi stunting 31,4 Persen pada 31,4 Persen (2025).');
    expect(out.replaced).toBe(2);
    expect(out.unknown).toEqual([]);
  });

  it('token tanpa tahun memakai satuan saja', () => {
    expect(ejectTokens('Jumlah ASN {{21}}.', evidence).text).toBe('Jumlah ASN 9.610 pegawai.');
  });

  it('tahun kosong dinyatakan jujur, bukan dikarang', () => {
    expect(ejectTokens('Balita stunting {{99|t}}.', evidence).text).toContain('tahun tidak tercantum');
  });

  it('token tak dikenal DIBUANG (model mengarang referensi)', () => {
    const out = ejectTokens('Angka {{777}} dan {{511}}.', evidence);
    expect(out.unknown).toEqual(['777']);
    expect(out.text).toContain('31,4 Persen');
    expect(out.text).not.toContain('777');
    expect(out.text).not.toContain('{{');
  });

  it('angka karangan yang ditulis model TIDAK ikut digantikan', () => {
    const out = ejectTokens('Prevalensi 12,7 persen, padahal {{511}}.', evidence);
    expect(out.text).toContain('12,7'); // tersisa untuk ditangkap grounding
    expect(out.text).toContain('31,4 Persen');
  });
});

describe('createStreamEjector', () => {
  it('menahan potongan token yang belum lengkap', () => {
    const e = createStreamEjector(evidence);
    expect(e.push('Prevalensi ')).toBe('Prevalensi ');
    expect(e.push('stunting {{5')).toBe('stunting ');
    expect(e.push('11}} tercatat.')).toBe('31,4 Persen tercatat.');
    expect(e.flush()).toBe('');
  });

  it('flush mengeluarkan sisa buffer di akhir aliran', () => {
    const e = createStreamEjector(evidence);
    e.push('Nilai {{21}}');
    expect(e.flush()).toBe('');
  });

  it('token tak dikenal tidak bocor ke pratinjau', () => {
    const e = createStreamEjector(evidence);
    expect(e.push('Angka {{888}}')).toBe('Angka ');
    expect(e.flush()).toBe('');
  });
});
