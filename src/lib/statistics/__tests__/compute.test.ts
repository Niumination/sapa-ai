import { describe, it, expect } from 'vitest';
import { describe as statDescribe, growth, classifyTrend, rate, share, rank, zscore, pearson, spearman, iqr, percentile } from '@/lib/statistics/compute';

// ─── compute.ts (WP3.0c) — statistik deskriptif tunggal ───

describe('statistics/compute — describe()', () => {
  it('count 0 → mean/stdDev 0', () => {
    const s = statDescribe([]);
    expect(s.count).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.stdDev).toBe(0);
  });

  it('satu elemen → stdDev 0, mean = nilai', () => {
    const s = statDescribe([42]);
    expect(s.count).toBe(1);
    expect(s.mean).toBe(42);
    expect(s.stdDev).toBe(0);
  });

  it('simpangan baku sampel (pembagi n−1)', () => {
    // data [2,4,4,4,5,5,7,9]: mean 5, varians sampel 4.571.., stdDev ≈ 2.138
    const s = statDescribe([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.stdDev).toBeCloseTo(2.138, 2);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
  });

  it('harga identik → stdDev 0', () => {
    const s = statDescribe([100, 100, 100]);
    expect(s.stdDev).toBe(0);
  });
});

describe('statistics/compute — growth()', () => {
  it('persen perubahan normal', () => {
    expect(growth(100, 110)).toBeCloseTo(10, 6);
    expect(growth(110, 100)).toBeCloseTo(-9.0909, 3);
  });

  it('lama === 0 → 0 (hindari 0/0)', () => {
    expect(growth(0, 10)).toBe(0);
  });
});

describe('statistics/compute — classifyTrend()', () => {
  it('ambang default ±2%', () => {
    expect(classifyTrend(3)).toBe('naik');
    expect(classifyTrend(-3)).toBe('turun');
    expect(classifyTrend(1)).toBe('stabil');
    expect(classifyTrend(0)).toBe('stabil');
  });
});
describe('statistics/compute — rate/share', () => {
  it('rate(30,120)=25%', () => expect(rate(30,120)).toBeCloseTo(25, 6));
  it('total=0 → 0', () => expect(rate(1,0)).toBe(0));
  it('share alias sama dengan rate', () => expect(share(30,120)).toBeCloseTo(25, 6));
});

describe('statistics/compute — rank', () => {
  it('higherIsBetter: [10,20,30] target 20 → rank 2', () => expect(rank([10,20,30],20,true)).toBe(2));
  it('lowerIsBetter: [10,20,30] target 20 → rank 2', () => expect(rank([10,20,30],20,false)).toBe(2));
  it('kosong → null', () => expect(rank([],10)).toBeNull());
});

describe('statistics/compute — zscore', () => {
  it('zscore sama dengan mean → 0', () => expect(zscore(5,5,2)).toBe(0));
  it('stdDev=0 → 0', () => expect(zscore(10,5,0)).toBe(0));
  it('positif', () => expect(zscore(7,5,2)).toBeCloseTo(1, 6));
});

describe('statistics/compute — pearson', () => {
  it('perfect positive → 1', () => expect(pearson([1,2,3],[2,4,6])).toBeCloseTo(1, 6));
  it('<2 points → null', () => expect(pearson([1],[2])).toBeNull());
  it('constant y → 0', () => expect(pearson([1,2,3],[5,5,5])).toBeCloseTo(0, 6));
});

describe('statistics/compute — spearman', () => {
  it('perfect monotonic → 1', () => expect(spearman([1,2,3],[3,2,1])).toBeCloseTo(-1, 6));
});

describe('statistics/compute — iqr/percentile', () => {
  it('iqr [1,2,3,4,5] → 2', () => expect(iqr([1,2,3,4,5])).toBe(2));
  it('percentile 50 median', () => expect(percentile([1,2,3,4,5],50)).toBe(3));
  it('empty → 0', () => { expect(iqr([])).toBe(0); expect(percentile([],50)).toBe(0); });
});
