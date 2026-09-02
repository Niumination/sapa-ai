import { describe, it, expect } from 'vitest';
import type { BapoktingPrice } from '@/lib/bapokting-client';
import { hitungStatsBapokting } from '@/lib/bapokting-stats';

function makeItem(nama: string, kategori: string, tanggal: string, harga: number): BapoktingPrice {
  return { namaBarang: nama, kategori, tanggal, harga } as BapoktingPrice;
}

describe('bapokting-stats — WP0.15 fixes', () => {
  it('trend <14 hari → insufficient, bukan stabil diam-diam', () => {
    const items = [makeItem('Beras', 'Pangan', '2026-08-01', 10000), makeItem('Beras', 'Pangan', '2026-08-02', 10100)];
    const res = hitungStatsBapokting(items);
    const stat = res.komoditas['Beras'];
    expect(stat.cukupData).toBe(false);
    expect(stat.trend).toBe('stabil');
    expect(stat.persentasePerubahan).toBe(0);
  });

  it('overallIndex NaN → 0 saat tidak ada data', () => {
    const res = hitungStatsBapokting([]);
    expect(res.volatility.overallIndex).toBe(0);
  });

  it('hargaAvg kategori tertimbang, bukan rata-rata dari rata-rata', () => {
    const items = [
      makeItem('Beras', 'Pangan', '2026-08-01', 10000),
      makeItem('Beras', 'Pangan', '2026-08-02', 12000),
      makeItem('Beras', 'Pangan', '2026-08-01', 8000),
    ];
    const res = hitungStatsBapokting(items);
    expect(res.kategori['Pangan'].hargaAvg).toBe(Math.round((10000 + 12000 + 8000) / 3));
  });

  it('tidak ada komoditas tunggal yang disebut paling fluktuatif DAN paling stabil', () => {
    const items = [makeItem('Beras', 'Pangan', '2026-08-01', 10000)];
    const res = hitungStatsBapokting(items);
    const text = res.rekomendasi.join(' ');
    expect(text).not.toContain('paling fluktuatif');
    expect(text).not.toContain('paling stabil');
  });
});
