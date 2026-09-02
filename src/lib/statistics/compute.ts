// ─── Semantic Layer — Compute (WP3.0c) ───────────────────────────────────────
// Satu implementasi statistik deskriptif untuk SEMUA konsumen (aturan A7 —
// jangan biarkan dua implementasi simpangan baku hidup berdampingan).
// Dipanggil dari bapokting-stats, dan akan dipakai analyzer WP2.x.

export interface DescriptiveStats {
  count: number;
  mean: number;
  stdDev: number; // simpangan baku SAMPEL (pembagi n−1)
  min: number;
  max: number;
}

/** Statistik deskriptif satu deret angka. count < 2 → stdDev 0 (tak terdefinisi). */
export function describe(values: number[]): DescriptiveStats {
  const count = values.length;
  if (count === 0) return { count, mean: 0, stdDev: 0, min: 0, max: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  if (count < 2) return { count, mean, stdDev: 0, min: values[0], max: values[0] };
  const sumSquares = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  return {
    count,
    mean,
    stdDev: Math.sqrt(sumSquares / (count - 1)),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** Pertumbuhan persen: ((baru − lama) / lama) × 100. lama === 0 → 0 (hindari 0/0). */
export function growth(lama: number, baru: number): number {
  if (lama === 0) return 0;
  return ((baru - lama) / lama) * 100;
}

/** Ambang tren sederhana: |growth| > ambangNaikTurun (default 2%) → naik/turun. */
export function classifyTrend(growthPct: number, threshold = 2): 'naik' | 'turun' | 'stabil' {
  if (growthPct > threshold) return 'naik';
  if (growthPct < -threshold) return 'turun';
  return 'stabil';
}
/** Rate persen: (nilai/total)×100. total=0 → 0. */
export function rate(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/** Share persen: sama seperti rate, alias eksplisit untuk komposisi/proporsi. */
export const share = rate;

/** Rank 1-based untuk target dalam array (higherIsBetter=true → nilai terbesar = rank 1). */
export function rank(values: number[], target: number, higherIsBetter = true): number | null {
  if (!values.length) return null;
  let pos = 0;
  for (const v of values) {
    if (higherIsBetter ? v > target : v < target) pos++;
    else if (v === target) { /* tetap hitung duplikat sebagai rank konservatif */ }
  }
  return pos + 1;
}

/** Z-score: (x - mean) / stdDev. stdDev=0 → 0. */
export function zscore(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (x - mean) / stdDev;
}

/** Pearson correlation coefficient r untuk dua deret sama panjang. */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  if (denom === 0) return 0;
  return num / denom;
}

/** Spearman rank correlation: pearson pada rank(x) dan rank(y). */
export function spearman(x: number[], y: number[]): number | null {
  const rankArr = (arr: number[]): number[] => {
    const sorted = [...arr].sort((a, b) => a - b);
    return arr.map(v => sorted.indexOf(v) + 1);
  };
  const rx = rankArr(x);
  const ry = rankArr(y);
  return pearson(rx, ry);
}

/** Interquartile range: Q3 - Q1. */
export function iqr(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  return q3 - q1;
}

/** Percentile (0-100): nilai pada posisi p dari data terurut. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
